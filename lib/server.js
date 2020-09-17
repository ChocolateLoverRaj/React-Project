import express from 'express';
import { dirname, join } from 'path';

const resolveExternal = async path => (await import.meta.resolve(path)).slice(8);

const __dirname = dirname(import.meta.url.slice(8));

const queryStringPath = resolveExternal('@billjs/query-string');
const reactPath = resolveExternal('react/umd/react.development.js');
const reactDomPath = resolveExternal('react-dom/umd/react-dom.development.js');

const server = express();

server.get("/", async (req, res) => {
    res.sendFile((join(__dirname, "../dist/browser/components/pages/index/index.html")));
});

server.get("/scripts/components/pages/index/index.js", (req, res) => {
    res.sendFile(join(__dirname, "../dist/browser/components/pages/index/index.js"));
});

server.get("/scripts/render.js", (req, res) => {
    res.sendFile(join(__dirname, "./browser/render.js"));
});

server.get("/scripts/react.js", (req, res) => {
    res.sendFile(join(__dirname, "./browser/react.js"));
});

server.get("/scripts/react-dom.js", (req, res) => {
    res.sendFile(join(__dirname, "./browser/react-dom.js"));
});

server.get("/react.development.js", async (req, res) => {
    res.sendFile(await reactPath);
})

server.get("/react-dom.development.js", async (req, res) => {
    res.sendFile(await reactDomPath);
})

server.listen(3020, () => {
    console.log("Server is running.");
});