const compare = (bufferPromise, stream) => new Promise((resolve, reject) => {
  let buffer
  const streamChunks = []
  let streamEnded = false
  let bytesStreamed = 0

  bufferPromise
    .then(buff => {
      const streamBuffer = Buffer.concat(streamChunks)
      if (
        (
          (!streamEnded && streamBuffer.length <= buff.length) ||
          (streamEnded && streamBuffer.length === buff.length)
        ) &&
        streamBuffer.compare(buff, 0, streamBuffer.length)
      ) {
        if (streamEnded) {
          resolve(true)
        } else {
          buffer = buff
        }
      } else {
        resolve(false)
      }
    })
    .catch(reject)

  stream
    .on('error', reject)
    .on('data', data => {
      if (buffer) {
        if (buffer.length <= bytesStreamed + data.length && data.compare(buffer, bytesStreamed, bytesStreamed + data.length)) {
          bytesStreamed += data.length
        } else {
          resolve(false)
        }
      } else {
        streamChunks.push(data)
        bytesStreamed += data.length
      }
    })
    .once('end', () => {
      if (buffer) {
        if (bytesStreamed === buffer.length) {
          resolve(true)
        } else {
          resolve(false)
        }
      } else {
        streamEnded = true
      }
    })
})

export default compare
