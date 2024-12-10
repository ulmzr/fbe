# Bun Router

A lightweight and customizable HTTP and WebSocket router built for the [Bun](https://bun.sh) JavaScript runtime. This router supports dynamic routing, middleware, WebSocket handling, static file serving, and more, making it a versatile solution for building web applications with Bun.

## Features

- **Dynamic Routing**: Define routes with path parameters (`/:param`) for various HTTP methods.
- **WebSocket Support**: Seamlessly handle WebSocket connections for real-time applications.
- **Static File Serving**: Serve static files from a designated directory with optional livereload support.
- **Middleware**: Add reusable middleware functions for request processing.
- **Automatic Route Initialization**: Automatically load and register routes from a `pagesDir`.
- **Flexible Response Handling**: Supports JSON, HTML, and plain text responses.
- **Live Reload**: Injects live reload script into HTML files for development convenience.

## Installation

To use this router, ensure you have [Bun](https://bun.sh) installed. Clone or download this repository and install any dependencies:

## Usage

### Basic setup

Create an instance of the Router and provide your options. The router auto detect plain text, json, html or jsx format in return. For jsx return, the extension should be jsx or tsx.

```js
import Router from './router';

const router = new Router({
    pagesDir: './pages', // Directory containing route handlers
    publicDir: './public', // Directory for static files
    port: 3000, // Server port
    livereload: true, // Enable live reload for HTML files
    spa: true, // Enable single-page application mode
});
```
### Defining Routes
Add routes in your code:
```js
router.get('/', (req,res)=>{
    return 'Homepage'
})

router.get('/json/:name', (req,res)=>{
    const params = req.params
    return {params} 
})

const Comp = () => <h3>JSX Component</h3>
router.get('/jsx', (req,res)=>{
    return (
        <h1>Hello Bun!</h1>
        <Comp/>
    )
})

router.get('/html', (req,res)=>{
    const name = 'Bun'
    return `
        <h1>Hello ${Bun}!</h1>
    `
})


```
### Defining Directory Base Routes

Add routes in your ```pagesDir```. Example ```pages/home.js```:

```js
export default (req) => {
    return { message: 'Welcome to Bun Router!' };
};

const get = (req) => {
    return 'GET method'
}

const post = (req) => {
    return 'POST method'
}
```
For dynamic routes, create files with parameters like ```pages/user/[id].js```:

```js
export default (req) => {
    return { userId: req.params.id };
};
```
### Params
Pathname:```/params/:name```.
```js
export default (req)=>{
    const params = req.params
    return {params}
}
```
### Query
Pathname:```/query?username=admin&password=123```
```js
router.get('/query', (req)=>{
    const query = req.query
    return {query}
})
```
### Bearer Token
Pathname:```/token``` and for fetch request add bearer token.
```js
router.post('/token', (req)=>{
    const token = req.bearerToken
    return {token}
})
```
### Payload
Support body format json, form, and form-encode.
```js
router.post('/login', (req)=>{
    const payload = req.payload
    return {payload}
})
```
### Middleware (WIP)
Use middleware to process requests before they reach the route handler:
```js
router.use(async (req, res, next) => {
    console.log(`Request to ${req.url}`);
    next();
});
```

### WebSocket Handling

Define WebSocket handlers:

```js
router.websocket({
    open: (ws) => console.log('WebSocket connection opened'),
    message: (ws, message) => console.log('Received:', message),
    close: (ws, code, message) => console.log('WebSocket connection closed'),
});
```

### Static File Serving

Place static files in the ```publicDir``` and they will be served automatically:

- GET / will serve ```public/index.html```
- GET /assets/style.css will serve ```public/assets/style.css```
