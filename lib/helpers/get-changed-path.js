import getChangedBuffWithInputHash from './get-changed-hash.js'
import hash from './hash.js'

import { readFile } from 'fs/promises'

// If a file was changed, returns the changed hash
const getChangedBuffWithInputPath = async (inputPath, hashPath) => {
  // Create an input hash promise
  const inputHash = (async () => hash(await readFile(inputPath)))()

  // Use the other func
  return await getChangedBuffWithInputHash(inputHash, hashPath)
}

export default getChangedBuffWithInputPath
