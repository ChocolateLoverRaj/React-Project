import express from 'express'
import { dirname, join } from 'path'

const resolveExternal = async path => (await import.meta.resolve(path)).slice(8)

const __dirname = dirname(import.meta.url.slice(8))

const reactPath = resolveExternal('react/umd/react.development.js')

const distBrowserPath = join(__dirname, '../dist/')

const server = express()

// React Script
const reactJsPath = join(distBrowserPath, './scripts/react.js')
server.get('/scripts/react.js', (req, res) => {
  res.sendFile(reactJsPath)
})

// React non module scripts
server.get('/scripts/react.development.js', (req, res) => {
  res.sendFile(reactPath)
})

// The pages

server.listen(3020, () => {
  console.log('Server is running.')
})
