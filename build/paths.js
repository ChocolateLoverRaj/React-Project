import getMyDirname from '../lib/helpers/my-dirname.js'

import { join } from 'path'

const __dirname = getMyDirname(import.meta)

// The components path
export const libComponentsPath = join(__dirname, '../lib/browser/components')
const distComponentsPath = join(__dirname, '../dist/browser/components')

// Where the input hashes are kept
export const refHashesPath = join(distComponentsPath, './ref-hashes/')
export const commonRefHashesPath = join(refHashesPath, './common/')
export const pagesRefHashesPath = join(refHashesPath, './pages/')

// The path to the lib common dir
export const libCommonPath = join(libComponentsPath, './common/')

// The paths to the lib and dist dirs
export const libPagesPath = join(libComponentsPath, './pages/')
export const distPagesPath = join(distComponentsPath, './pages/')
