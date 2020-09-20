// My Modules
import compareBufferStream from './lib/helpers/compare-buffer-stream.js'
import firstTruthy from './lib/helpers/first-truthy.js'

// Npm Modules
import areStreamsSame from 'are-streams-same'
import { rollup } from 'rollup'
import rollupBabelPlugin from '@rollup/plugin-babel'

// Node.js Modules
import { createReadStream, createWriteStream } from 'fs'
import { readdir, writeFile, mkdir, readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { createHash } from 'crypto'
import { once } from 'events'

const __dirname = dirname(import.meta.url.slice(8))

const babelPlugin = rollupBabelPlugin.getBabelInputPlugin({ babelHelpers: 'bundled' })

const build = async () => {
  // Helper functions
  // Hashes a buffer
  const hash = buff => createHash('sha256')
    .update(buff)
    .digest()

  // If a file was changed, returns the changed hash
  const getChangedBuff = async (inputPath, hashPath) => {
    // The input hash
    const inputHash = (async () => hash(await readFile(inputPath)))()

    // The hash stream
    const hashStream = createReadStream(hashPath)

    // Hash stream error
    const hashStreamError = once(hashStream, 'error')

    // If there was an error with the hash stream
    const nonExistentOldHash = (async () => {
      if ((await hashStreamError)[0].code === 'ENOENT') {
        return true
      }
    })()

    // Compare the inputHash to the hash stream
    try {
      return await compareBufferStream(inputHash, hashStream) ? false : await inputHash
    } catch (e) {
      if (await nonExistentOldHash) {
        return await inputHash
      } else {
        throw e
      }
    }
  }

  // The paths to the lib and dist dirs
  const libPagesPath = join(__dirname, './lib/browser/components/pages/')
  const distPagesPath = join(__dirname, './dist/browser/components/pages/')

  // The files in the lib and dist dirs
  const libPagesDir = readdir(libPagesPath)
  const distPagesDir = readdir(distPagesPath)

  // Whether or not the lib and dist dirs exist
  const libPagesExists = (async () => {
    try {
      await libPagesDir
      return true
    } catch (e) {
      if (e.code === 'ENOENT') {
        return false
      }
    }
  })()
  const distPagesExists = (async () => {
    try {
      await distPagesDir
      return true
    } catch (e) {
      if (e.code === 'ENOENT') {
        return false
      }
    }
  })()

  // Build the pages
  const buildPages = (async () => {
    // All the page build promises
    const pageBuildPromises = []

    // Loop through all the pages
    for (const page of await libPagesDir) {
      // Add the individual page build to the page build promises
      pageBuildPromises.push((async () => {
        // The paths to the lib and dist page
        const libPagePath = join(libPagesPath, `./${page}`)
        const distPagePath = join(distPagesPath, `./${page}`)

        // The file paths in the page
        const inputJsPath = join(libPagePath, './index.js')
        const inputJsHashPath = join(distPagePath, './index-js-hash.dat')

        // Whether or not the page exists in the dist pages dir
        const distPageExists = (async () => await distPagesExists && (await distPagesDir).includes(page))()

        // Creates the page dir
        const createPageDir = (async () => {
          if (!await distPageExists) {
            await mkdir(distPagePath, { recursive: true })
          }
        })()

        // The changed buff
        const inputJsHash = (async () => await distPageExists
          ? await getChangedBuff(inputJsPath, inputJsHashPath)
          : hash(await readFile(inputJsPath))
        )()

        // Write the changed buff
        const writeInputJsHash = (async () => {
          const buff = await inputJsHash
          if (buff) {
            // Wait for the createPageDir promise
            console.log('changes', page)
            await createPageDir
            await writeFile(inputJsHashPath, buff)
          } else {
            console.log('no changes', page)
          }
        })()

        // Wait for the inputJsHash to be written

        await writeInputJsHash
      })())
    }

    // Wait for all the pages to be built
    await Promise.all(pageBuildPromises)
  })()

  // Await the promises
  await Promise.all([
    libPagesExists,
    distPagesExists,
    buildPages
  ]);

  // Lib and dist dirs error handlers
  // Throw errors for missing libPages
  (async () => {
    try {
      await libPagesDir
    } catch (e) {
      if (await libPagesExists === false) {
        throw new Error('Lib pages dir doesn\'t exist')
      } else {
        throw e
      }
    }
  })();
  // Throw errors for non 'ENOENT' distPages errors
  (async () => {
    try {
      await distPagesDir
    } catch (e) {
      if (await distPagesExists !== false) {
        throw e
      }
    }
  })()
}

const buildZ = async () => {
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
      const inputJsRefsPath = join(libPagePath, './input-js-files')

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
          const output = (async () => {
            return (await ((await bundle).generate({
              format: 'es'
            }))).output[0]
          })()

          if (!noDistPage) {

          }
        })()

        await Promise.all([generateBrowserJs, generateInstructionJs])
      }

      if (!noDistPage) {
        const getChangedBuff = async (inputPath, hashPath) => new Promise((resolve, reject) => {
          const oldInputHash = createReadStream(hashPath)
          const input = createReadStream(inputPath)
          const newInputHash = input.pipe(createHash('sha256'))
          const newInputHashBuff = (async () => {
            return (await once(newInputHash, 'data'))[0]
          })()

          oldInputHash.on('error', err => {
            if (err.code === 'ENOENT') {
              resolve(newInputHashBuff)
            } else {
              reject(err)
              input.destroy(err)
            }
          })

          input.on('error', err => {
            if (err.code === 'ENOENT') {
              reject(new Error('Input js file doesn\'t exist.'))
            } else {
              reject(err)
            }
            oldInputHash.destroy(err)
          })

          newInputHash.on('error', err => {
            reject(err)
          })

          areStreamsSame(oldInputHash, newInputHash).then(({ same }) => {
            if (same) {
              resolve(false)
            } else {
              resolve(newInputHashBuff)
            }
          })
        })

        const inputJsChangedBuff = getChangedBuff(inputJsPath, inputJsHashPath)
        const updateInputJsHash = (async () => {
          const buff = await inputJsChangedBuff
          if (buff) {
            await writeFile(inputJsHashPath, buff)
          }
        })()
        const updateRefHashPromises = []
        const refFilesChanged = (async () => {
          try {
            const inputJsRefs = (await readFile(inputJsRefsPath))
            console.log(JSON.parse(inputJsRefs))
          } catch (e) {
            if (e.code === 'ENOENT') {
              console.log('no refs')
              return true
            } else {
              throw e
            }
          }
        })()

        if (await firstTruthy([inputJsChangedBuff, refFilesChanged])) {
          await Promise.all([updateInputJsHash, ...updateRefHashPromises, buildJs()])
          console.log('rebuilt')
        } else {
          console.log('no inputs changed')
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

console.log('Starting Build')
console.time('build')
build().then(console.timeEnd.bind(undefined, 'build'))
