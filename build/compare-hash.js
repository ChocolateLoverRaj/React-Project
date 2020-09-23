import getChangedBuffWithInputHash from '../lib/helpers/get-changed-hash.js'

import { writeFile } from 'fs/promises'

// Compares a new hash with a stored hash, and writes the hash if it's changed
const compare = (newHash, hashPath, waitFor) => {
  // The changed buff
  const changedBuff = getChangedBuffWithInputHash(newHash, hashPath)

  console.log(hashPath)

  // Write the hash
  const writePromise = (async () => {
    const buff = await changedBuff
    if (buff) {
      // Wait for the waitFor promise
      await waitFor
      await writeFile(hashPath, buff)
    }
  })()

  // Return the changedBuff and the writePromise
  return {
    hash: changedBuff,
    writePromise: writePromise
  }
}

export default compare
