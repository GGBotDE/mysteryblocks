/**
 * The `MM|CustomBlocks` handshake, with no assumptions about who is speaking it.
 *
 * A MysteryMod partner server asks every joining client whether it understands
 * custom blocks. Answer, and the server starts sending `cb:` ids on that
 * connection. Stay quiet, and you only ever see the vanilla replacements.
 *
 * These helpers take and return buffers, so they work with mineflayer,
 * node-minecraft-protocol on its own, a proxy, or anything else that can put
 * bytes on a plugin channel.
 */

/** What the server sends. `MixinNetHandlerPlayClient` compares against this exactly. */
export const HANDSHAKE_REQUEST = 'StartHandshake'

/** The mixin accepts the request on either name, and always replies on the first. */
export const CHANNELS = ['MM|CustomBlocks', 'cb:init']

/** The channel to reply on. */
export const REPLY_CHANNEL = CHANNELS[0] as string

/** Does this custom payload look like the server asking for the handshake? */
export function isHandshakeRequest (channel: string, data: Buffer): boolean {
  if (!CHANNELS.includes(channel)) return false
  return readMcString(data) === HANDSHAKE_REQUEST
}

/**
 * The payload to write back on {@link REPLY_CHANNEL}.
 *
 * This is `ServerConnection.getJsonPayload()`, a length-prefixed
 * `{"protocol":N}`.
 *
 * @param protocol `ModBlocks.CURRENT_PROTOCOL_VERSION`, 5 for MysteryBlocks 1.0.5.
 */
export function handshakeReply (protocol: number): Buffer {
  return writeMcString(JSON.stringify({ protocol }))
}

/**
 * Read a VarInt-length-prefixed UTF-8 string, the Minecraft `PacketBuffer` form.
 *
 * @returns `null` for a truncated or malformed buffer, rather than throwing.
 */
export function readMcString (buffer: Buffer): string | null {
  if (!Buffer.isBuffer(buffer)) return null
  let value = 0
  let position = 0
  let offset = 0
  while (offset < buffer.length) {
    const byte = buffer[offset++]!
    value |= (byte & 0x7f) << position
    if ((byte & 0x80) === 0) break
    position += 7
    if (position >= 32) return null
  }
  if (offset + value > buffer.length) return null
  return buffer.subarray(offset, offset + value).toString('utf8')
}

/** Write a VarInt-length-prefixed UTF-8 string. */
export function writeMcString (str: string): Buffer {
  const body = Buffer.from(str, 'utf8')
  const header: number[] = []
  let len = body.length
  do {
    let byte = len & 0x7f
    len >>>= 7
    if (len !== 0) byte |= 0x80
    header.push(byte)
  } while (len !== 0)
  return Buffer.concat([Buffer.from(header), body])
}
