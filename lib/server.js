import express from 'express'
import { dirname, join } from 'path'

const resolveExternal = async path => (await import.meta.resolve(path)).slice(8)

const __dirname = dirname(import.meta.url.slice(8))

const reactPath = resolveExternal('react/umd/react.development.js')
const reactDomPath = resolveExternal('react-dom/umd/react-dom.development.js')

const distBrowserPath = join(__dirname, '../dist/')

const server = express()

// React Scripts
const reactJsPath = join(distBrowserPath, './scripts/react.js')
server.get('/scripts/react.js', (req, res) => {
  res.sendFile(reactJsPath)
})
const reactDomJsPath = join(distBrowserPath, './scripts/react-dom.js')
server.get('/scripts/react-dom.js', (req, res) => {
  res.sendFile(reactDomJsPath)
})

// React non module scripts
server.get('/scripts/react.development.js', (req, res) => {
  res.sendFile(reactPath)
})
server.get('/scripts/react-dom.development.js', (req, res) => {
  res.sendFile(reactDomPath)
})

// The pages

server.listen(3020, () => {
  console.log('Server is running.')
})
