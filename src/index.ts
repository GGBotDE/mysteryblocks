/**
 * MysteryBlocks (`cb:`) blocks and items on Minecraft 1.8.9, read from
 * TypeScript.
 *
 * The core has no dependencies and knows nothing about bots. It answers a
 * handshake, decodes block states and item stacks, and tells you what a client
 * without the handshake would have been sent instead.
 *
 * ```ts
 * import { loadRegistry } from 'mysteryblocks'
 *
 * const cb = loadRegistry()
 * cb.describeState(40259)
 * // { key: 'cb:oak_chair', meta: 3, properties: { facing: 'east' }, ... }
 * ```
 *
 * The mineflayer plugin lives in `mysteryblocks/mineflayer` and the
 * prismarine-registry patch in `mysteryblocks/prismarine`. Import either
 * only if you use it.
 */

export { CustomBlockRegistry, loadRegistry, DEFAULT_REGISTRY_PATH } from './registry'
export { decodeMeta, DECODERS, NEIGHBOUR_DERIVED, DIRECTION, ENUM_DIRECTION, AXIS } from './meta'
export type { MetaDecoder } from './meta'
export {
  CHANNELS, REPLY_CHANNEL, HANDSHAKE_REQUEST,
  isHandshakeRequest, handshakeReply, readMcString, writeMcString
} from './handshake'
export { readStackMetadata, readEnchantmentList, simplifyNbt } from './nbt'
export type { EnchantmentLookup } from './nbt'
export { resolveVanillaRef } from './vanilla'
export type { VanillaLookup, VanillaRef } from './vanilla'
export { patchRegistry } from './prismarine'
export * from './types'
