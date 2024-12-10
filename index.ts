import type { Server, ServerWebSocket, WebSocketHandler } from 'bun'
import { join, resolve, parse } from 'path'
import { readdir } from 'fs/promises'

declare global {
    interface Request {
        [key: string]: any
    }
}

type ObjectLiteral = { [key: string]: any }
type Routes = { regex: RegExp; keys: string[]; handler: Handler }
type Handler = (req: Request, res?: ObjectLiteral) => Promise<any> | any
type Middleware = (req: Request, res?: ObjectLiteral, next?: Function) => Promise<any> | any

const json = { headers: { 'Content-Type': 'application/json' } }
const html = { headers: { 'Content-Type': 'text/html;utf-8' } }
const text = { headers: { 'Content-Type': 'text/plain' } }

const script = `<script>(()=>{let l=location,s=sessionStorage,t='ws://'+l.host,o=()=>{let e=new WebSocket(t);e.onopen=()=>{s.getItem("r")||(s.setItem("r",1),l.reload())},e.onmessage=()=>l.reload(),e.onclose=()=>setTimeout(()=>{s.removeItem("r"),o()},2e3),e.onerror=n=>console.error("WebSocket error:",n)};o()})()</script>
`

class Router {
    private options: ObjectLiteral
    private routes = new Map()
    private wsHandler: WebSocketHandler | null = null
    private middlewares: Middleware[] = []

    constructor(options: ObjectLiteral = {}) {
        this.options = options
        this.initRoute()
        this.serve()
    }

    async initRoute() {
        const { pagesDir } = this.options
        if (!pagesDir) return
        try {
            const files = (
                await readdir(pagesDir, {
                    recursive: true,
                })
            ).filter((filename) => /.(tsx|ts|jsx|js)/.test(filename) && !filename.startsWith('_'))
            const paths = files.map((file) => {
                return file
                    .replace(/\\/g, '/')
                    .replace(/[\/|\]]\[/g, '/:')
                    .replace(/(\])?.(tsx|ts|jsx|js)|(\/)?index/g, '')
            })
            for (const [index, file] of files.entries()) {
                const module = await import(resolve(pagesDir, file))
                const path = '/' + paths[index]
                if (module.default) this.register('GET', path, module.default)
                if (module.get) this.register('GET', path, module.get)
                if (module.post) this.register('POST', path, module.post)
                if (module.insert) this.register('INSERT', path, module.insert)
                if (module.put) this.register('PUT', path, module.put)
                if (module.patch) this.register('PATCH', path, module.patch)
                if (module.delete) this.register('DELETE', path, module.delete)
            }
        } catch (e) {
            throw e
        }
    }

    serve() {
        const { port = 3000 } = this.options
        const run = Bun.serve({
            port,
            fetch: async (req, server: Server): Promise<any> => {
                if (server.upgrade(req)) return
                // Run middleware
                const res = {}
                for (const middleware of this.middlewares) {
                    await new Promise(async (resolve) => {
                        middleware(req, res, resolve)
                    })
                }
                const response = (await this.serveRoute(req)) || (await this.serveStatic(req))
                if (response) return response
                return new Response('404', text)
            },
            websocket: {
                open: (ws: ServerWebSocket) => this.wsHandler?.open?.(ws),
                close: (ws: ServerWebSocket, code: number, message: string) =>
                    this.wsHandler?.close?.(ws, code, message),
                message: (ws: ServerWebSocket, message: string | Buffer) => this.wsHandler?.message?.(ws, message),
                drain: (ws: ServerWebSocket) => this.wsHandler?.drain?.(ws),
            },
        })
        if (run) console.log(`Listening on ${run.url}`)
    }

    async serveRoute(req: Request) {
        const { pathname } = new URL(req.url)
        const method = req.method
        const routeList = this.routes.get(method) || []
        for (const route of routeList) {
            const matchedRoute = pathname.match(route.regex)
            if (matchedRoute) {
                await this.populateData(req, route, matchedRoute)
                return this.response(await route.handler(req))
            }
        }
    }

    private async populateData(req: Request, route: Routes, match: RegExpMatchArray) {
        // Extract params
        req.params = route.keys.reduce((acc: ObjectLiteral, key: string, index: number) => {
            acc[key] = match[index + 1]
            return acc
        }, {})
        // Extract query
        const query: ObjectLiteral = {}
        new URL(req.url).searchParams.forEach((value, key) => {
            query[key] = value
        })
        // Extract bearer token
        const authHeader = req.headers.get('authorization')
        if (authHeader?.startsWith('Bearer ')) {
            req.bearerToken = authHeader.slice(7).trim()
        }
        // Extract payload
        const contentType = req.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
            req.payload = await req.json()
        } else if (contentType.includes('form')) {
            const formData = await req.formData()
            formData.forEach((value, key) => {
                req.data[key] = value
            })
        } else {
            const buffer = await req.arrayBuffer()
            req.data = Buffer.from(buffer)
        }
        req.query = query
    }

    async serveStatic(req: Request) {
        if (req.method !== 'GET') return
        const addScript = async (file: any) => {
            if (!file.type.includes('html')) return file
            const body = await file.text()
            return body.replace('</head>', `${script}</head>`)
        }
        const { publicDir = 'public', livereload, spa } = this.options
        const pathname = new URL(req.url).pathname.replace(/\/$/, 'index.html')
        const index = Bun.file(join(publicDir, 'index.html'))
        const file = Bun.file(join(publicDir, pathname))
        if (await file.exists()) return this.response(livereload ? await addScript(file) : file)
        if (spa) return this.response(await addScript(index))
    }

    response(body: any) {
        if (body.size) return new Response(body)
        const render = (element: any): string => {
            if (!element) return ''
            if (typeof element === 'string' || typeof element === 'number') return String(element)
            if (Array.isArray(element)) return element.map(render).join('')
            const { type, props } = element
            const attributes = props
                ? Object.entries(props)
                      .filter(([key]) => key !== 'children')
                      .map(([key, value]) => `${key}="${value}"`)
                      .join(' ')
                : ''
            const children = props?.children ? render(props.children) : ''
            if (typeof type === 'function') return render(type(props))
            return `<${type}${attributes ? ' ' + attributes : ''}>${children}</${type}>`
        }
        const isHtmlContent = (body: string): boolean => {
            const trimmed = body.trim()
            return trimmed.startsWith('<') && !trimmed.startsWith('<svg') && /^[a-z!]/i.test(trimmed[1])
        }
        if (typeof body === 'object') {
            if (body.type) return new Response(render(body), html)
            return new Response(JSON.stringify(body), json)
        }
        if (isHtmlContent(body)) return new Response(body, html)
        return new Response(body, text)
    }

    register(method: string, path: string, handler: Handler) {
        const keys = path.split('/:').slice(1)
        const regex = new RegExp(`^${path.replace(/:[^\s/]+/g, '([^/]+)')}$`)
        if (!this.routes.has(method)) this.routes.set(method, [])
        this.routes.get(method)?.push({ regex, keys, handler })
    }

    use(...middleware: Middleware[]) {
        this.middlewares.push(...middleware)
        return this
    }

    websocket = (handler: WebSocketHandler) => (this.wsHandler = handler)
    get = (path: string, handler: Handler) => this.register('GET', path, handler)
    post = (path: string, handler: Handler) => this.register('POST', path, handler)
    insert = (path: string, handler: Handler) => this.register('INSERT', path, handler)
    put = (path: string, handler: Handler) => this.register('PUT', path, handler)
    patch = (path: string, handler: Handler) => this.register('PATCH', path, handler)
    delete = (path: string, handler: Handler) => this.register('DELETE', path, handler)
}

export default Router
