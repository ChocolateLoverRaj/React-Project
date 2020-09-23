// Let's say we have two promises, p1 and p2
// We only care about p2. If p1 is false, then we don't care about p2.
// Examples:
// p1 = 24, p2 = 16 --> 16
// p1 = false, p2 = 2 --> false
// p1 = false, p2 = false --> false
const breakSecond = (p1, p2) => new Promise(resolve => {
  p1.then(v => {
    if (!v) {
      resolve(false)
    }
  })
  p2.then(resolve)
})

export default breakSecond
