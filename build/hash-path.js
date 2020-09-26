import { refHashesPath } from './paths.js'

import { basename, dirname, join } from 'path'

// Get the path of a hash of a ref file
const getHashPath = ref => {
  const hashPathWithExt = join(refHashesPath, ref)
  // Replace the file's name to be .dat extension. .s from extensions will be replaced by -. -s will be replaced by two -s. Two .s will not be allowed.
  const hashDir = dirname(hashPathWithExt)
  if (hashPathWithExt.indexOf('..') > -1) {
    throw new Error('Reference file names cannot have two dots in a row.')
  }
  const hashFilename = basename(hashPathWithExt).replace(/-/g, '--').replace(/\./g, '-') + '-hash.dat'
  return join(hashDir, hashFilename)
}

export default getHashPath
