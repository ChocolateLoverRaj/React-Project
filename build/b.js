import build from './build.js'

console.log('Starting Build')
console.time('build')
build().then(console.timeEnd.bind(undefined, 'build'))
