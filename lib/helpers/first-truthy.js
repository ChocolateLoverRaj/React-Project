const firstTruthy = promises => new Promise((resolve, reject) => {
  let resolvedPromises = 0
  for (const promise of promises) {
    promise
      .then(value => {
        if (value) {
          resolve(value)
        } else {
          if (++resolvedPromises === promises.length) {
            resolve(false)
          }
        }
      })
      .catch(reject)
  }
})

export default firstTruthy
