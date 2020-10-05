// My Modules
import getEsmPath from '../lib/helpers/get-esm-path.js'
import hash from '../lib/helpers/hash.js'
import {
  distBrowserPath,
  libComponentsPath,
  libPagesPath,
  distPagesPath,
  commonRefHashesPath,
  pagesRefHashesPath,
  distBrowserHtmlPath,
  libTemplateHtmlPath,
  distTemplateHtmlPath,
  distBrowserScriptsPath,
  distReactPath,
  libReactPath,
  buildJsonPath
} from './paths.js'
import exists from '../lib/helpers/exists.js'
import compareHash from './compare-hash.js'
import hashFile from '../lib/helpers/hash-file.js'
import firstTruthy from '../lib/helpers/first-truthy.js'
import breakSecond from '../lib/helpers/break-second.js'
import getHashPath from './hash-path.js'
import { commonFilter, pageFilter } from './ref-filters.js'
import sureLink from './sure-link.js'

// Npm Modules

// Rollup Stuff
import { rollup } from 'rollup'
import rollupBabelPlugin from '@rollup/plugin-babel'
import rollupStripPlugin from '@rollup/plugin-strip'

// Other stuff
import ReactServer from 'react-dom/server.node.js'
import streamToString from 'stream-to-string'

// Node.js Modules
import { readdir, writeFile, mkdir, readFile, unlink, link } from 'fs/promises'
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

    // The build.json file
    const buildJson = {}
    // The promises to wait for before writing buildJson
    const buildJsonPromises = []

    // The previous buildJson, if it exists
    const oldBuildJson = (async () => {
      try {
        return JSON.parse(await readFile(buildJsonPath))
      } catch (e) {
        if (e.code === 'ENOENT') {
          return {}
        } else {
          throw e
        }
      }
    })()

    // Loop through all the pages
    for (const page of await libPagesDir) {
      // Add the individual page build to the page build promises
      const {
        build,
        oldCommonRefs,
        newCommonRefs,
        editBuildJson
      } = (() => {
        // The paths to the lib and dist page
        const libPagePath = join(libPagesPath, `./${page}/`)
        const distPagePath = join(distPagesPath, `./${page}/`)

        // The paths to the ref hashes of this page
        const pageRefHashesPath = join(pagesRefHashesPath, `./${page}/`)

        // The file paths in the page
        const inputJsPath = join(libPagePath, './index.js')
        const inputJsHashPath = join(distPagePath, './input-js-hash.dat')

        // The browserJs path
        const browserJsPath = join(distPagePath, './browser.js')
        const browserJsHashPath = join(distPagePath, './browser-js-hash.dat')

        // The instructionsJs path
        const instructionsJsPath = join(distPagePath, './instructions.js')
        const instructionsJsHashPath = join(distPagePath, './instructions-js-hash.dat')

        // The appHtml path
        const appHtmlPath = join(distPagePath, './app.html')
        const appHtmlHashPath = join(distPagePath, './app-html-hash.dat')

        // The index.html paths
        const libHeadHtmlPath = join(libPagePath, './head.html')
        const distHeadHtmlPath = join(distPagePath, './head.html')

        // Add this page to the buildJson
        const pageJson = buildJson[page] = {}

        // The previous pageJson, may not exist
        const oldPageJson = (async () => (await oldBuildJson)[page])()

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
        const oldRefs = (async () => (await oldPageJson)?.refs || [])()

        // The common previous refs
        const oldCommonRefs = (async () => (await oldRefs).filter(commonFilter))()
        const oldPageRefs = (async () => (await oldRefs).filter(pageFilter))()

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
            },
            footer: 'window.ReactDOM.hydrate(app, document.getElementById(\'app\'))'
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
        const {
          writePromise: writeInstructionsJsHash,
          writeCode: writeInstructionsJs,
          changedHash: instructionsJsChanged
        } = (() => {
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

          return {
            writePromise,
            writeCode,
            changedHash
          }
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
        const newPageRefs = (async () => (await newRefs).filter(pageFilter))()

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
                promises.push(writeRef())
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

          // Remove unused referenced files withing the same page folder
          for (const oldRef of await oldPageRefs) {
            if (!(await newPageRefs).includes(oldRef)) {
              promises.push(unlink(getHashPath(oldRef)))
            }
          }

          // Wait for the promises
          await Promise.all(promises)
        })()

        // Write refJson
        const pageJsonRefs = (async () => {
          pageJson.refs = await newRefs
        })()

        // Build app html
        const buildAppHtml = (async () => {
          // If inputs or instructions don't change, then this couldn't've changed
          const secondBreaker = breakSecond(inputsChanged, instructionsJsChanged)

          await writeInstructionsJs
          const { default: app } = await import(getEsmPath(instructionsJsPath))
          const htmlStream = ReactServer.renderToNodeStream(app)
          const htmlString = streamToString(htmlStream)
          const htmlHash = (async () => hash(await htmlString))()

          const {
            hash: changedHash,
            writePromise
          } = compareHash(htmlHash, appHtmlHashPath, createPageDir, secondBreaker)

          const writeAppHtml = (async () => {
            if (await breakSecond(secondBreaker, changedHash)) {
              await createPageDir
              await writeFile(appHtmlPath, await htmlString)
            }
          })()

          await Promise.all([writePromise, writeAppHtml])
        })()

        // Creates a hard link, head.html. This is a hard link to the head's index.html because nothing is changed, and we want it in the dist/ dir.
        const linkHeadHtml = (async () => {
          await createPageDir
          try {
            await link(libHeadHtmlPath, distHeadHtmlPath)
            pageJson.head = true
          } catch (e) {
            // ENOENT is ok because all pages don't have to have an head.html file
            // EEXIST is ok because that means it's already linked
            switch (e.code) {
              case 'ENOENT':
                pageJson.head = false
                break
              case 'EEXIST':
                pageJson.head = true
                break
              default:
                throw e
            }
          }
        })()

        // Everything that edits build.json
        const editBuildJson = Promise.all([
          linkHeadHtml,
          pageJsonRefs
        ])

        // Wait for the necessary tasks
        const build = Promise.all([
          writeInputHashes,
          buildBrowserJs,
          writeInstructionsJsHash,
          writeInstructionsJs,
          updateRefHashes,
          pageJsonRefs,
          buildAppHtml,
          linkHeadHtml
        ])

        // Return the necessary data
        return {
          build,
          oldCommonRefs,
          newCommonRefs,
          editBuildJson
        }
      })()

      pageBuildPromises.push(build)
      oldCommonRefsPromises.push(oldCommonRefs)
      newCommonRefsPromises.push(newCommonRefs)
      buildJsonPromises.push(editBuildJson)
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

    // Write build.json
    const writeBuildJson = (async () => {
      await mkdir(distBrowserPath, { recursive: true })
      await Promise.all(buildJsonPromises)
      await writeFile(buildJsonPath, JSON.stringify(buildJson))
    })()

    // Wait for all the pages to be built
    await Promise.all([
      ...pageBuildPromises,
      removeUnusedHashes,
      writeBuildJson
    ])
  })()

  // Link browser html files
  const linkBrowserHtmlFiles = (async () => {
    await mkdir(distBrowserHtmlPath, { recursive: true })
    await sureLink(libTemplateHtmlPath, distTemplateHtmlPath)
  })()

  // Link browser scripts files
  const linkBrowserScriptsFiles = (async () => {
    await mkdir(distBrowserScriptsPath, { recursive: true })
    await sureLink(libReactPath, distReactPath)
  })()

  // Await the promises
  await Promise.all([
    libPagesExists,
    distPagesExists,
    buildPages,
    linkBrowserHtmlFiles,
    linkBrowserScriptsFiles
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
