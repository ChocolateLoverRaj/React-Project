import { createHash } from 'crypto'

// Hashes a buffer
const hash = buff => createHash('sha256')
  .update(buff)
  .digest()

export default hash
