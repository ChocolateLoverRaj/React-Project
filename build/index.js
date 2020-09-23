// My Modules
import getEsmPath from '../lib/helpers/get-esm-path.js'
import hash from '../lib/helpers/hash.js'
import getChangedBuffWithInputHash from '../lib/helpers/get-changed-hash.js'
import {
  libComponentsPath,
  libCommonPath,
  libPagesPath,
  distPagesPath,
  refHashesPath,
  commonRefHashesPath,
  pagesRefHashesPath
} from './paths.js'
import exists from '../lib/helpers/exists.js'
import compareHash from './compare-hash.js'
import hashFile from '../lib/helpers/hash-file.js'
import firstTruthy from '../lib/helpers/first-truthy.js'
import breakSecond from '../lib/helpers/break-second.js'

// Npm Modules

// Rollup Stuff
import { rollup } from 'rollup'
import rollupBabelPlugin from '@rollup/plugin-babel'
import rollupStripPlugin from '@rollup/plugin-strip'

// Other stuff
import ReactServer from 'react-dom/server.node.js'

// Node.js Modules
import { readdir, writeFile, mkdir, readFile } from 'fs/promises'
import { join, relative, basename, dirname } from 'path'

const babelPlugin = rollupBabelPlugin.getBabelInputPlugin({
  babelHelpers: 'bundled',
  presets: ['@babel/preset-react'],
  plugins: ['@babel/plugin-proposal-class-properties']
})
const stripPlugin = rollupStripPlugin({ sourceMap: false })

const build = async () => {
  // The files in the lib and dist dirs
  const libPagesDir = readdir(libPagesPath)
  const distPagesDir = readdir(distPagesPath)

  // Whether or not the lib and dist dirs exist
  const libPagesExists = exists(libPagesDir)
  const distPagesExists = exists(distPagesDir)

  // Build the pages
  const buildPages = (async () => {
    // All the page build promises
    const pageBuildPromises = []

    // Loop through all the pages
    for (const page of await libPagesDir) {
      // Add the individual page build to the page build promises
      pageBuildPromises.push((async () => {
        // The paths to the lib and dist page
        const libPagePath = join(libPagesPath, `./${page}/`)
        const distPagePath = join(distPagesPath, `./${page}/`)

        // The paths to the ref hashes of this page
        const pageRefHashesPath = join(pagesRefHashesPath, `./${page}/`)

        // The file paths in the page
        const inputJsPath = join(libPagePath, './index.js')
        const inputJsHashPath = join(distPagePath, './input-js-hash.dat')

        // The references paths
        const referencesJsonPath = join(distPagePath, './references.json')
        const referencesJsonHashPath = join(distPagePath, './references-json-hash.dat')

        // The browserJs path
        const browserJsPath = join(distPagePath, './browser.js')
        const browserJsHashPath = join(distPagePath, './browser-js-hash.dat')

        // The instructionsJs path
        const instructionsJsPath = join(distPagePath, './instructions.js')
        const instructionsJsHashPath = join(distPagePath, './instructions-js-hash.dat')

        // The appHtml path
        const appHtmlPath = join(distPagePath, './app.html')
        const appHtmlHashPath = join(distPagePath, './app-html-hash.dat')

        // Whether or not the page exists in the dist pages dir
        const distPageExists = (async () => await distPagesExists && (await distPagesDir).includes(page))()

        // Creates the page dir
        const createPageDir = (async () => {
          if (!await distPageExists) {
            await mkdir(distPagePath, { recursive: true })
          }
        })()

        // Create the ref hashes dir
        const createCommonRefHashesDir = mkdir(commonRefHashesPath, { recursive: true })

        // Write the input hashes
        // TODO update hashes. If a file is no longer referenced, then remove that unnecessary hash. If a new reference is added then create a hash for it.
        const {
          inputsChanged,
          writePromise: writeInputHashes
        } = (() => {
          // The strategy for figuring our if an inputs changed makes sense.
          // There is an array of promises.
          // As soon as the first one resolves to true, we resolve the main promise
          // There are also promises for writing them

          // Create the ref hashes dir for this page
          const createPageRefHashesDir = mkdir(pageRefHashesPath, { recursive: true })

          // The changed hash promises
          const changedHashes = []

          // The write promises
          const writePromises = []

          // Check an input and its hash
          const checkInput = (inputPath, hashPath, waitFor) => {
            const { hash, writePromise } = compareHash(hashFile(inputPath), hashPath, waitFor)
            changedHashes.push(hash)
            writePromises.push(writePromise)
          }

          // Actually check inputs
          const inputsChanged = (async () => {
            // Add the inputJs file
            checkInput(inputJsPath, inputJsHashPath, createPageDir)
            // Read the references.json file
            const refString = readFile(referencesJsonPath)
            const refExists = await exists(refString)
            if (refExists) {
              const refs = JSON.parse(await refString)
              const commonRefs = new Set()
              for (const ref of refs) {
                const refPath = join(libComponentsPath, ref)
                const hashPathWithExt = join(refHashesPath, ref)
                const hashDir = dirname(hashPathWithExt)
                const hashFilename = basename(hashPathWithExt).replace(/-/g, '--').replace(/\./g, '-') + '-hash.dat'
                const hashPath = join(hashDir, hashFilename)

                if (ref.startsWith('pages')) {
                  checkInput(refPath, hashPath, createPageRefHashesDir)
                } else if (!commonRefs.has(ref)) {
                  checkInput(refPath, hashPath, createCommonRefHashesDir)
                  commonRefs.add(ref)
                }
              }
            }

            // Return the first truthy changedHash
            return await firstTruthy(changedHashes)
          })()

          // Return inputsChanged and writePromises
          return {
            inputsChanged,
            writePromise: Promise.all(writePromises)
          }
        })()

        // The rollup input
        const bundle = rollup({
          input: inputJsPath,
          external: 'react',
          plugins: [
            babelPlugin,
            stripPlugin
          ]
        })

        // Write browserJs and browserJsHash
        const buildBrowserJs = (async () => {
          // BrowserJs Code
          const browserJsCode = (async () => (await (await bundle).generate({
            format: 'es',
            paths: {
              react: '/scripts/react.js'
            }
          })).output[0].code)()

          // The new hash
          const newHash = (async () => hash(await browserJsCode))()

          const {
            hash: changedHash,
            writePromise
          } = compareHash(newHash, browserJsHashPath, createPageDir)

          // Write browserJs
          const writeBrowserJs = (async () => {
            // Check that the inputJs and browserJs hashes have changed
            if (await breakSecond(inputsChanged, changedHash)) {
              await createPageDir
              await writeFile(browserJsPath, await browserJsCode)
            }
          })()

          // Wait for file and hash to be written
          await Promise.all([writePromise, writeBrowserJs])
        })()

        // Do the necessary steps to build appHtml
        // TODO: Build index.html too, and check if it has <App></App>
        const buildAppHtml = (async () => {
          // Build the instructionsJs
          const {
            instructionsJsOutput,
            instructionsJsHash,
            buildInstructionsJs
          } = (() => {
            // The instructionsJs build
            const instructionsJsOutput = (async () => (await bundle).generate({
              format: 'es'
            }))()

            // instructionsJsCode
            const instructionsJsCode = (async () => (await instructionsJsOutput).output[0].code)()

            // instructionsJsHash
            const instructionsJsHash = (async () => {
              // The new hash
              const newHash = (async () => hash(await instructionsJsCode))()

              // The changed buff
              const changedBuff = getChangedBuffWithInputHash(newHash, instructionsJsHashPath)

              // The hash to use
              const hashToUse = (async () => await distPageExists
                ? await changedBuff
                : await newHash
              )()

              // Wait fore the hashToUse
              return await hashToUse
            })()

            // write the instructionsJsHash
            const writeHash = (async () => {
              const buff = await inputsChanged && await instructionsJsHash
              if (buff) {
                console.log('changes', 'instructions.js', page)
                await createPageDir
                await writeFile(instructionsJsHashPath, buff)
              } else {
                console.log('no changes', 'instructions.js', page)
              }
            })()

            // Write the file
            const writeInstructionsJs = (async () => {
              if (await inputsChanged && await instructionsJsHash) {
                await createPageDir
                await writeFile(instructionsJsPath, await instructionsJsCode)
              }
            })()

            // Both write hash and write file
            const buildInstructionsJs = Promise.all([writeHash, writeInstructionsJs])

            // Return the necessary promises
            return {
              instructionsJsOutput,
              instructionsJsHash,
              buildInstructionsJs
            }
          })()

          // Build referencesJson
          const buildReferencesJson = (async () => {
            // References string
            const referencesString = (async () => {
              // get the output modules
              const instructionsJsModules = (await instructionsJsOutput).output[0].modules

              // Check the modules
              const references = []
              for (const reference in instructionsJsModules) {
                const goodPath = reference.startsWith(libPagePath) || reference.startsWith(libCommonPath)
                if (goodPath) {
                  if (reference !== inputJsPath) {
                    references.push(relative(libComponentsPath, reference))
                  }
                } else {
                  throw new Error('Reference found with a non common or page path.')
                }
              }

              // The referencesString
              const referencesString = JSON.stringify(references)
              return referencesString
            })()

            // The hash
            const referencesHash = (async () => {
              // The new hash
              const newHash = (async () => hash(await referencesString))()

              // The changedBuff
              const changedBuff = getChangedBuffWithInputHash(newHash, referencesJsonHashPath)

              // Return the hash to use
              return await distPageExists
                ? await changedBuff
                : await newHash
            })()

            // Write the hash
            const writeHash = (async () => {
              const buff = await inputsChanged && await referencesHash
              if (buff) {
                console.log('changes', 'references.json', page)
                await createPageDir
                await writeFile(referencesJsonHashPath, buff)
              } else {
                console.log('no changes', 'references.json', page)
              }
            })()

            // Write the referencesJson
            const write = (async () => {
              if (await inputsChanged && await referencesHash) {
                await createPageDir
                await writeFile(referencesJsonPath, await referencesString)
              }
            })()

            // Wait for the hash and file to be written
            await Promise.all([writeHash, write])
          })()

          // Build the appHtml
          const buildAppHtml = (async () => {
            // The actual html
            const appHtml = (async () => {
              await buildInstructionsJs
              const { default: appComponent } = await import(getEsmPath(instructionsJsPath))
              return ReactServer.renderToString(appComponent)
            })()

            // The hash
            const appHtmlHash = (async () => {
              // The new hash
              const newHash = (async () => hash(await appHtml))()

              // The changedBuff
              const changedBuff = getChangedBuffWithInputHash(newHash, appHtmlHashPath)

              // The hash to use
              const hashToUse = (async () => await distPageExists
                ? await changedBuff
                : await newHash
              )()

              // Return the hash to use
              return await hashToUse
            })()

            // Write the hash
            const writeHash = (async () => {
              const buff = await inputsChanged && await instructionsJsHash && await appHtmlHash
              if (buff) {
                console.log('changes', 'app.html', page)
                await createPageDir
                await writeFile(appHtmlHashPath, buff)
              } else {
                console.log('no changes', 'app.html', page)
              }
            })()

            // Write the file
            const writeAppHtml = (async () => {
              if (await inputsChanged && await instructionsJsHash && await appHtmlHash) {
                await createPageDir
                await writeFile(appHtmlPath, await appHtml)
              }
            })()

            // Wait for the hash and appHtml to be written
            await Promise.all([writeHash, writeAppHtml])
          })()

          // Wait for the necessary tasks to be done
          await Promise.all([
            buildInstructionsJs,
            buildReferencesJson,
            buildAppHtml
          ])
        })()

        // Wait for the necessary tasks
        await Promise.all([
          writeInputHashes,
          buildBrowserJs,
          buildAppHtml
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

export default build
