// My Modules
import getEsmPath from '../lib/helpers/get-esm-path.js'
import hash from '../lib/helpers/hash.js'
import getChangedBuffWithInputHash from '../lib/helpers/get-changed-hash.js'
import {
  libComponentsPath,
  libCommonPath,
  libPagesPath,
  distPagesPath,
  commonRefHashesPath,
  pagesRefHashesPath
} from './paths.js'
import exists from '../lib/helpers/exists.js'
import compareHash from './compare-hash.js'
import hashFile from '../lib/helpers/hash-file.js'
import firstTruthy from '../lib/helpers/first-truthy.js'
import breakSecond from '../lib/helpers/break-second.js'
import getHashPath from './hash-path.js'
import commonFilter from './common-filter.js'

// Npm Modules

// Rollup Stuff
import { rollup } from 'rollup'
import rollupBabelPlugin from '@rollup/plugin-babel'
import rollupStripPlugin from '@rollup/plugin-strip'

// Other stuff
import ReactServer from 'react-dom/server.node.js'

// Node.js Modules
import { readdir, writeFile, mkdir, readFile, unlink } from 'fs/promises'
import { join, relative } from 'path'

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

    // Refs being checked
    const commonRefs = new Map()

    // Map of hashes being written, so we can reuse them instead of redoing them
    const commonHashesWriting = new Map()

    // Arrays of promises resolving arrays of old and new common refs
    const oldCommonRefsPromises = []
    const newCommonRefsPromises = []

    // Loop through all the pages
    for (const page of await libPagesDir) {
      // Add the individual page build to the page build promises
      const {
        build,
        oldCommonRefs,
        newCommonRefs
      } = (() => {
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

        // Read the refs
        const oldRefs = (async () => {
          const refString = readFile(referencesJsonPath)
          const refExists = await exists(refString)
          if (refExists) {
            const refs = JSON.parse(await refString)
            return refs
          } else {
            return []
          }
        })()

        // The common previous refs
        const oldCommonRefs = (async () => (await oldRefs).filter(commonFilter))()

        // Write the input hashes
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

          // Add an input to changedHashes and writePromises
          const addInput = ({ hash, writePromise }) => {
            changedHashes.push(hash)
            writePromises.push(writePromise)
          }

          // Check an input and its hash
          const checkInput = (inputPath, hashPath, waitFor) => {
            const input = compareHash(hashFile(inputPath), hashPath, waitFor)
            addInput(input)
            return input
          }

          // Actually check inputs
          const inputsChanged = (async () => {
            // Add the inputJs file
            checkInput(inputJsPath, inputJsHashPath, createPageDir)
            for (const ref of await oldRefs) {
              const refPath = join(libComponentsPath, ref)
              const hashPath = getHashPath(ref)
              if (ref.startsWith('pages')) {
                checkInput(refPath, hashPath, createPageRefHashesDir)
              } else {
                if (!commonRefs.has(ref)) {
                  commonRefs.set(ref, checkInput(refPath, hashPath, createCommonRefHashesDir))
                } else {
                  addInput(commonRefs.get(ref))
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
          } = compareHash(newHash, browserJsHashPath, createPageDir, inputsChanged)

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

        // InstructionsJsOutput
        const instructionsJsOutput = (async () => (await (await bundle).generate({
          format: 'esm'
        })).output[0])()

        // Build instructions.js
        const buildInstructionsJs = (async () => {
          // Instructions code
          const instructionsJsCode = (async () => (await instructionsJsOutput).code)()

          // The new hash
          const newHash = (async () => hash(await instructionsJsCode))()

          // Get the changed hash
          const {
            hash: changedHash,
            writePromise
          } = compareHash(newHash, instructionsJsHashPath, createPageDir, inputsChanged)

          // Write the code
          const writeCode = (async () => {
            if (await breakSecond(inputsChanged, changedHash)) {
              await createPageDir
              await writeFile(instructionsJsPath, await instructionsJsCode)
            }
          })()

          // Wait for the hash and code to be written
          await Promise.all([writePromise, writeCode])
        })()

        // new references
        const newRefs = (async () => {
          // Wait for inputsChanged first
          if (!await inputsChanged) {
            return oldRefs
          }
          // Get the array of references
          const modules = (await instructionsJsOutput).modules
          const refs = Object.keys(modules)
            // Remove the main input
            .filter(v => v !== inputJsPath)
            // Use paths relative to libComponentsPath
            .map(r => relative(libComponentsPath, r))
          // Make sure all refs are in /common/ or /pages/${page}/
          refs.forEach(r => {
            if (!(r.startsWith('common\\') || r.startsWith(`pages\\${page}\\`))) {
              throw new Error('All references must be in common folder or page folder.')
            }
          })

          // Return refs
          return refs
        })()

        // new common references
        const newCommonRefs = (async () => (await newRefs).filter(commonFilter))()

        // Update references
        const updateRefHashes = (async () => {
          // Get the array of references
          const refs = await newRefs
          const skipRefs = await oldRefs
          // The promises we need to wait for
          const promises = []

          // Add new ref hash
          refs
            .filter(r => !skipRefs.includes(r))
            .forEach(r => {
              const writeRef = async () => {
                const filePath = join(libComponentsPath, r)
                const fileHash = hash(await readFile(filePath))
                await writeFile(getHashPath(r), fileHash)
              }
              if (r.startsWith('pages')) {
                promises.push(writeRef)
              } else {
                if (!commonHashesWriting.has(r)) {
                  const promise = writeRef()
                  commonHashesWriting.set(r, promise)
                  promises.push(promise)
                } else {
                  promises.push(commonHashesWriting.get(r))
                }
              }
            })

          // Wait for the promises
          await Promise.all(promises)
        })()

        // Write refJson
        const writeRefJson = (async () => {
          const refsString = (async () => JSON.stringify(await newRefs))()
          const newHash = (async () => hash(await refsString))()
          const {
            hash: changedHash,
            writePromise } = compareHash(newHash, referencesJsonHashPath, createPageDir, inputsChanged)
          const writeJson = (async () => {
            if (await breakSecond(inputsChanged, changedHash)) {
              await createPageDir
              await writeFile(referencesJsonPath, await refsString)
            }
          })()
          await Promise.all([writePromise, writeJson])
        })()

        // Do the necessary steps to build appHtml
        // TODO: Build index.html too, and check if it has <App></App>
        const buildAppHtml = async () => {
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
        }

        // Wait for the necessary tasks
        const build = Promise.all([
          writeInputHashes,
          buildBrowserJs,
          buildInstructionsJs,
          updateRefHashes,
          writeRefJson
        ])

        // Return the necessary data
        return {
          build,
          oldCommonRefs,
          newCommonRefs
        }
      })()

      pageBuildPromises.push(build)
      oldCommonRefsPromises.push(oldCommonRefs)
      newCommonRefsPromises.push(newCommonRefs)
    }

    // Remove unused hashes
    const removeUnusedHashes = (async () => {
      const oldCommonRefs = new Set([].concat(...await Promise.all(oldCommonRefsPromises)))
      const newCommonRefs = new Set([].concat(...await Promise.all(newCommonRefsPromises)))
      const removePromises = []
      for (const oldCommonRef of oldCommonRefs) {
        if (!newCommonRefs.has(oldCommonRef)) {
          removePromises.push(unlink(getHashPath(oldCommonRef)))
        }
      }
      await Promise.all(removePromises)
    })()

    // Wait for all the pages to be built
    await Promise.all([
      ...pageBuildPromises,
      removeUnusedHashes
    ])
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
