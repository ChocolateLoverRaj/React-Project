// Resolves 'true' after the first truthy promise, and 'false' after all promises resolve to falsy
// Resolves 'true' for 0 length promises
const firstTruthy = promises => new Promise((resolve, reject) => {
  let unresolvedPromises = 0

  const onFinish = v => {
    if (v) {
      resolve(true)
    } else if (--unresolvedPromises === 0) {
      resolve(false)
    }
  }

  for (const promise of promises) {
    unresolvedPromises++
    promise
      .then(onFinish)
      .catch(reject)
  }
  if (unresolvedPromises === 0) {
    resolve(true)
  }
})

export default firstTruthy
