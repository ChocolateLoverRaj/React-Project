import getChangedBuffWithInputHash from '../lib/helpers/get-changed-hash.js'
import breakSecond from '../lib/helpers/break-second.js'

import { writeFile } from 'fs/promises'

// Compares a new hash with a stored hash, and writes the hash if it's changed
const compare = (newHash, hashPath, waitFor, secondBreaker = Promise.resolve(true)) => {
  // The changed buff
  const changedBuff = getChangedBuffWithInputHash(newHash, hashPath)

  // Write the hash
  const writePromise = (async () => {
    const buff = await breakSecond(secondBreaker, changedBuff)
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
