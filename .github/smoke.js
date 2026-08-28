// Runs the built output on a Node version the test runner does not support, so
// the engines.node claim in package.json stays honest.
const assert = require('assert')
const { loadRegistry, handshakeReply, patchRegistry, readStackMetadata } = require('../dist')

const cb = loadRegistry()
const chair = cb.describeState(40259)

assert.strictEqual(chair.key, 'cb:oak_chair')
assert.strictEqual(chair.properties.facing, 'east')
assert.strictEqual(cb.blocks.length, 813)
assert.strictEqual(handshakeReply(5).toString('utf8').slice(1), '{"protocol":5}')
assert.strictEqual(typeof patchRegistry, 'function')
assert.strictEqual(readStackMetadata({ display: { Name: 'x' } }).customName, 'x')

console.log(`ok on node ${process.version}: ${chair.key}, ${cb.blocks.length} blocks`)
