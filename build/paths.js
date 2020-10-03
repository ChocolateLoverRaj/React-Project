import getMyDirname from '../lib/helpers/my-dirname.js'

import { join } from 'path'

const __dirname = getMyDirname(import.meta)

// The browser paths
const libBrowserPath = join(__dirname, '../lib/browser/')
export const distBrowserPath = join(__dirname, '../dist/browser/')

// The components path
export const libComponentsPath = join(libBrowserPath, './components/')
const distComponentsPath = join(distBrowserPath, './components/')

// Where the input hashes are kept
export const refHashesPath = join(distComponentsPath, './ref-hashes/')
export const commonRefHashesPath = join(refHashesPath, './common/')
export const pagesRefHashesPath = join(refHashesPath, './pages/')

// The paths to the lib and dist dirs
export const libPagesPath = join(libComponentsPath, './pages/')
export const distPagesPath = join(distComponentsPath, './pages/')

// The template html paths
const libBrowserHtmlPath = join(libBrowserPath, './html/')
export const distBrowserHtmlPath = join(distBrowserPath, './html/')

export const libTemplateHtmlPath = join(libBrowserHtmlPath, './template.html')
export const distTemplateHtmlPath = join(distBrowserHtmlPath, './template.html')

// The scripts paths
const libBrowserScriptsPath = join(libBrowserPath, './scripts/')
export const distBrowserScriptsPath = join(distBrowserPath, './scripts/')

export const libReactPath = join(libBrowserScriptsPath, './react.js')
export const distReactPath = join(distBrowserScriptsPath, './react.js')

// The build.json path
export const buildJsonPath = join(distBrowserPath, './build.json')
