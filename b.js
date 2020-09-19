// My Modules
import compareBufferStream from './lib/helpers/compare-buffer-stream.js'

// Npm Modules
import areStreamsSame from 'are-streams-same'
import { rollup } from 'rollup'
import rollupBabelPlugin from '@rollup/plugin-babel'

// Node.js Modules
import { createReadStream, createWriteStream } from 'fs'
import { readdir, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { createHash } from 'crypto'
import { once } from 'events'

const __dirname = dirname(import.meta.url.slice(8))

const babelPlugin = rollupBabelPlugin.getBabelInputPlugin({ babelHelpers: 'bundled' })

const build = async () => {
  // Check hashes
  // If the index.js file has changed, then redo the output index.js, app.html
  // If the index.html file has changed, then redo the index.html
  // If the app.html has changed, redo the index.html

  const libPagesPath = join(__dirname, './lib/browser/components/pages/')
  const distPagesPath = join(__dirname, './dist/browser/components/pages/')

  let noDistPages = false
  const [libPages, distPages] = await Promise.all([
    // Read the lib/browser/components/pages/ dir
    readdir(libPagesPath).catch(err => {
      if (err.code === 'ENOENT') {
        throw new Error('Lib pages folder doesn\'t exist.')
      } else {
        throw err
      }
    }),

    // Read the dist/browser/components/pages dir
    readdir(distPagesPath).catch(err => {
      if (err.code === 'ENOENT') {
        noDistPages = true
      } else {
        throw err
      }
    })
  ])

  // Loop through the lib pages
  for (const page of libPages) {
    (async () => {
      const noDistPage = noDistPages || !distPages.includes(page)

      const distPagePath = join(distPagesPath, `./${page}/`)
      const libPagePath = join(libPagesPath, `./${page}/`)

      const inputJsHashPath = join(distPagePath, './input-js-hash.dat')
      const inputJsPath = join(libPagePath, './index.js')

      const browserJsHashPath = join(distPagePath, './browser-js-hash.dat')
      const browserJsPath = join(distPagePath, './browser.js')

      const buildJs = async () => {
        const bundle = rollup({
          input: inputJsPath,
          external: 'react',
          plugins: [babelPlugin]
        })

        const generateBrowserJs = (async () => {
          const outputCode = (async () => {
            return (await (await bundle).generate({
              format: 'es',
              paths: {
                react: '/scripts/react.js'
              }
            })).output[0].code
          })()

          const outputHash = (async () => {
            return createHash('sha256')
              .update(await outputCode)
              .digest()
          })()

          const writeBrowserJs = async () => {
            const writeOutputHash = (async () => {
              await writeFile(browserJsHashPath, await outputHash)
            })()

            const writeBrowserJs = (async () => {
              writeFile(browserJsPath, await outputCode)
            })()

            await Promise.all([writeOutputHash, writeBrowserJs])
            console.log('done writing browserJs')
          }

          if (!noDistPage) {
            const browserJsHash = createReadStream(browserJsHashPath)
            try {
              const different = await compareBufferStream(outputHash, browserJsHash)
              if (different) {
                await writeBrowserJs()
              } else {
                console.log('same hash')
              }
            } catch (e) {
              if (e.code === 'ENOENT') {
                console.log('no hash')
                await writeBrowserJs()
              } else {
                throw e
              }
            }
          } else {
            await writeBrowserJs()
          }
        })()

        const generateInstructionJs = (async () => {

        })()

        await Promise.all([generateBrowserJs, generateInstructionJs])
      }

      if (!noDistPage) {
        // TODO Keep a hash of every referenced file
        const changedBuffer = await new Promise((resolve, reject) => {
          const oldInputJsHash = createReadStream(inputJsHashPath)
          const inputJs = createReadStream(inputJsPath)
          const newInputJsHash = inputJs.pipe(createHash('sha256'))
          const newInputJsHashBuff = (async () => {
            return (await once(newInputJsHash, 'data'))[0]
          })()

          oldInputJsHash.on('error', err => {
            if (err.code === 'ENOENT') {
              resolve(newInputJsHashBuff)
            } else {
              reject(err)
              inputJs.destroy(err)
            }
          })

          inputJs.on('error', err => {
            if (err.code === 'ENOENT') {
              reject(new Error('Input js file doesn\'t exist.'))
            } else {
              reject(err)
            }
            oldInputJsHash.destroy(err)
          })

          newInputJsHash.on('error', err => {
            reject(err)
          })

          areStreamsSame(oldInputJsHash, newInputJsHash).then(({ same }) => {
            if (same) {
              resolve(false)
            } else {
              resolve(newInputJsHashBuff)
            }
          })
        })
        if (changedBuffer) {
          await Promise.all([writeFile(inputJsHashPath, changedBuffer), buildJs()])
        } else {
          console.log('No changes')
        }
      } else {
        await mkdir(distPagePath, { recursive: true })

        const hashStream = createReadStream(inputJsPath)
          .pipe(createHash('sha256'))
          .pipe(createWriteStream(inputJsHashPath))

        await Promise.all([once(hashStream, 'finish'), buildJs()])
      }
    })()
  }
}

build()
