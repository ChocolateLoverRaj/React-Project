import express from 'express'
import replace from 'stream-replace-string'
import CombinedStream from 'combined-stream'
import chokidar from 'chokidar'

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
const buildJsonPath = join(distBrowserPath, './build.json')
const libComponentsPath = join(__dirname, './browser/components');
(async () => {
  const pagesEntries = Object.entries(JSON.parse(await readFile(buildJsonPath)))

  // Watch for changes to the input files
  for (const [page, { refs }] of pagesEntries) {
    // Add the main input to refs
    const watchRefs = [
      ...refs.map(ref => join(libComponentsPath, ref)),
      join(libComponentsPath, `./pages/${page}/index.js`)
    ]
    // Watch for changes
    chokidar.watch(watchRefs, {})
      .on('change', (path, stats) => {
        // TODO: rebuild necessary files on change. Remember that when a common file changes, this event is fired for every single page that references it.
        console.log('changed file', path)
      })
      .on('unlink', path => {
        // TODO: rebuild necessary files on change.
        console.log('unlinked file', path)
      })
  }

  const filteredPagesEntries = pagesEntries.filter(([page]) => !page.startsWith('_'))

  const defaultPagePath = join(distBrowserPath, './components/pages/_default/')

  for (const [page, { head }] of filteredPagesEntries) {
    const pagePath = join(distBrowserPath, `./components/pages/${page}/`)

    const pageRoute = page === 'index' ? '' : page
    const headHtmlPath = join(head ? pagePath : defaultPagePath, './head.html')
    const appHtmlPath = join(pagePath, './app.html')
    server.get(`/${pageRoute}`, async (req, res) => {
      // Set html content type
      res.setHeader('Content-Type', 'text/html')

      // The head stream
      const headStream = createReadStream(headHtmlPath)
        .pipe(replace('<PageScript />', `<script type="module" src="/components/page/${page}/browser.js"></script>`))

      // The head stream inside of an html head tag
      const headHtmlStream = CombinedStream.create({ pauseStreams: false })
        .append('<head>')
        .append(headStream)
        .append('</head>')
        .pipe(new PassThrough())

      // The body tag stream
      const appStream = CombinedStream.create({ pauseStreams: false })
        .append('<div id="app">')
        .append(createReadStream(appHtmlPath))
        .append('</div>')
        .pipe(new PassThrough())

      createReadStream(templateHtmlPath)
        .pipe(replace('<head></head>', headHtmlStream))
        .pipe(replace('<App />', appStream))
        .pipe(res)
    })

    const browserJsPath = join(pagePath, './browser.js')
    server.get(`/components/page/${page}/browser.js`, (req, res) => {
      res.setHeader('Content-Type', 'application/javascript')
      createReadStream(browserJsPath)
        .pipe(res)
    })
  }
})()

server.listen(3020, () => {
  console.log('Server is running.')
})
