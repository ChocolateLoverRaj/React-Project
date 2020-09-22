import compareBufferStream from './compare-buffer-stream.js'

import { createReadStream } from 'fs'
import { once } from 'events'

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

export default getChangedBuffWithInputHash
