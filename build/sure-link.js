// Link two files, ignoring EEXIST errors because it means it's already linked
import { link } from 'fs/promises'

const sureLink = async (src, dest) => {
  try {
    await link(src, dest)
  } catch (e) {
    if (e.code !== 'EEXIST') {
      throw e
    }
  }
}

export default sureLink
