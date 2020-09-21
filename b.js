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

  // If some hash doesn't match a hash stream, returns the changed hash
  const getChangedBuffWithInputHash = async (inputHash, hashPath) => {
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

  // If a file was changed, returns the changed hash
  const getChangedBuffWithInputPath = async (inputPath, hashPath) => {
    // Create an input hash promise
    const inputHash = (async () => hash(await readFile(inputPath)))()

    // Use the other func
    return await getChangedBuffWithInputHash(inputHash, hashPath)
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

        // The browserJs path
        const browserJsPath = join(distPagePath, './browser.js')
        const browserJsHashPath = join(distPagePath, './browser-js-hash.dat')

        // The instructionJ

        // Whether or not the page exists in the dist pages dir
        const distPageExists = (async () => await distPagesExists && (await distPagesDir).includes(page))()

        // Creates the page dir
        const createPageDir = (async () => {
          if (!await distPageExists) {
            await mkdir(distPagePath, { recursive: true })
          }
        })()

        // Write the inputJsHash
        const {
          inputJsHash,
          writeInputJsHash
        } = (() => {
          // The changed buff
          const changedBuff = getChangedBuffWithInputPath(inputJsPath, inputJsHashPath)

          // The new hash
          const newHash = (async () => hash(await readFile(inputJsPath)))()

          // The changed buff
          const inputJsHash = (async () => await distPageExists
            ? await changedBuff
            : await newHash
          )()

          // Write to the hash files
          const writeInputJsHash = (async () => {
            const buff = await inputJsHash
            if (buff) {
              // Wait for the createPageDir promise
              console.log('changes', 'index.js', page)
              await createPageDir
              await writeFile(inputJsHashPath, buff)
            } else {
              console.log('no changes', 'index.js', page)
            }
          })()

          // Return the inputJsHash and the writePromise
          return {
            inputJsHash,
            writeInputJsHash
          }
        })()

        // The rollup input
        const bundle = rollup({
          input: inputJsPath,
          external: 'react',
          plugins: [babelPlugin]
        })

        // Write browserJs and browserJsHash
        const buildBrowserJs = (async () => {
          // BrowserJs Code
          const browserJsCode = (async () => {
            // Build browserJs
            const buildBrowserJs = (async () => (await bundle).generate({
              format: 'es',
              paths: {
                react: '/scripts/react.js'
              }
            }))()

            // Get the code from the first output
            const codePromise = (async () => (await buildBrowserJs).output[0].code)()

            // Wait for the codePromise
            return await codePromise
          })()

          // The hash, if changed
          const browserJsHash = (async () => {
            // BrowserJs Hash
            const newBrowserJsHash = (async () => hash(await browserJsCode))()

            // The changed buff
            const changedBrowserJsBuff = getChangedBuffWithInputHash(newBrowserJsHash, browserJsHashPath)

            // The hash depending on if the distPage exists
            const hashToUse = (async () => await distPageExists
              ? await changedBrowserJsBuff
              : await newBrowserJsHash
            )()

            // Wait for the hashToUse promise
            return await hashToUse
          })()

          // Write the browserJsHash
          const writeBrowserJsHash = (async () => {
            // Remember that if the inputJsHash is unchanged there is no need to build this
            const buff = await inputJsHash && await browserJsHash
            if (buff) {
              console.log('changes', 'browser.js', page)
              await createPageDir
              await writeFile(browserJsHashPath, buff)
            } else {
              console.log('no changes', 'browser.js', page)
            }
          })()

          // Write browserJs
          const writeBrowserJs = (async () => {
            // Check that the inputJs and browserJs hashes have changed
            if (await inputJsHash && await browserJsHash) {
              await createPageDir
              await writeFile(browserJsPath, await browserJsCode)
            }
          })()

          // Wait for file and hash to be written
          await Promise.all([writeBrowserJsHash, writeBrowserJs])
        })()

        // Wait for the necessary tasks
        await Promise.all([
          writeInputJsHash,
          buildBrowserJs
        ])
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

console.log('Starting Build')
console.time('build')
build().then(console.timeEnd.bind(undefined, 'build'))
