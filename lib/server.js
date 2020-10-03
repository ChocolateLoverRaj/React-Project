import express from 'express'
import replace from 'stream-replace-string'
import CombinedStream from 'combined-stream'

import { dirname, join } from 'path'
import { readFile } from 'fs/promises'
import { createReadStream } from 'fs'
import { PassThrough } from 'stream'

const resolveExternal = async path => (await import.meta.resolve(path)).slice(8)

const __dirname = dirname(import.meta.url.slice(8))

const reactPath = resolveExternal('react/umd/react.development.js')
const reactDomPath = resolveExternal('react-dom/umd/react-dom.development.js')

const distBrowserPath = join(__dirname, '../dist/browser')

const server = express()

// React Script
const reactJsPath = join(distBrowserPath, './scripts/react.js')
server.get('/scripts/react.js', (req, res) => {
  res.sendFile(reactJsPath)
})

// React non module scripts
server.get('/scripts/react.development.js', async (req, res) => {
  res.sendFile(await reactPath)
})
server.get('/scripts/react-dom.development.js', async (req, res) => {
  res.sendFile(await reactDomPath)
})

// The pages
const templateHtmlPath = join(distBrowserPath, './html/template.html')
const buildJsonPath = join(distBrowserPath, './build.json');
(async () => {
  const pages = JSON.parse(await readFile(buildJsonPath))
    .filter(({ page }) => !page.startsWith('_'))

  const defaultPagePath = join(distBrowserPath, './components/pages/_default/')

  for (const { page, head } of pages) {
    const pagePath = join(distBrowserPath, `./components/pages/${page}/`)

    const pageRoute = page === 'index' ? '' : page

    const headHtmlPath = join(head ? pagePath : defaultPagePath, './head.html')

    server.get(`/${pageRoute}`, async (req, res) => {
      // Set html content type
      res.setHeader('Content-Type', 'text/html')

      // The head stream
      // TODO: fix typo in npm module: stream-replace-string
      // TODO: serve the index.js file
      const headStream = createReadStream(headHtmlPath)
        .pipe(replace('<PageScript />', `<script type="module" src="/components/page/${page}/index.js"></script>`))

      // The head stream inside of an html head tag
      const headHtmlStream = CombinedStream.create({ pauseStreams: false })
        .append('<head>')
        .append(headStream)
        .append('</head>')
        .pipe(new PassThrough())

      createReadStream(templateHtmlPath)
        .pipe(replace('<head></head>', headHtmlStream))
        .pipe(res)
    })
  }
})()

server.listen(3020, () => {
  console.log('Server is running.')
})
