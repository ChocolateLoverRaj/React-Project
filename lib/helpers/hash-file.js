import hash from './hash.js'

import { readFile } from 'fs/promises'

const hashFile = async filePath => hash(await readFile(filePath))

export default hashFile
