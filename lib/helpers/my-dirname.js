import { dirname } from 'path'

const getMyDirname = (meta) => dirname(meta.url.slice(8))

export default getMyDirname
