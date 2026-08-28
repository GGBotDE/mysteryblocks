/**
 * Just enough zip to read a jar.
 *
 * A jar is a zip, and the files we want out of MysteryBlocks are a handful of
 * JSON resources, so this walks the central directory and inflates the entries
 * it is asked for. Deflate and store are the only methods jars use in practice.
 */

import * as fs from 'fs'
import * as zlib from 'zlib'

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50

export interface JarEntry {
  name: string
  /** 0 for stored, 8 for deflated. */
  method: number
  compressedSize: number
  size: number
  /** Offset of the local file header. */
  headerOffset: number
}

/** An open jar, read fully into memory. Jars this small do not need streaming. */
export class Jar {
  private readonly buf: Buffer
  readonly entries = new Map<string, JarEntry>()

  constructor (buf: Buffer) {
    this.buf = buf
    for (const entry of readCentralDirectory(buf)) this.entries.set(entry.name, entry)
  }

  static open (file: string): Jar {
    return new Jar(fs.readFileSync(file))
  }

  /** Entry names, in central directory order. */
  list (): string[] {
    return [...this.entries.keys()]
  }

  /** Every entry name under a directory prefix. */
  under (prefix: string): string[] {
    return this.list().filter(name => name.startsWith(prefix))
  }

  /** Decompressed contents, or `null` when the entry is not there. */
  read (name: string): Buffer | null {
    const entry = this.entries.get(name)
    if (!entry) return null

    // The local header repeats the name and extra fields, and only their lengths
    // are trustworthy, so skip past them rather than trusting the central copy.
    const nameLen = this.buf.readUInt16LE(entry.headerOffset + 26)
    const extraLen = this.buf.readUInt16LE(entry.headerOffset + 28)
    const start = entry.headerOffset + 30 + nameLen + extraLen
    const raw = this.buf.subarray(start, start + entry.compressedSize)

    if (entry.method === 0) return Buffer.from(raw)
    if (entry.method === 8) return zlib.inflateRawSync(raw)
    throw new Error(`${name}: unsupported compression method ${entry.method}`)
  }

  /** Decompressed contents as UTF-8, or `null`. */
  readText (name: string): string | null {
    const buf = this.read(name)
    return buf ? buf.toString('utf8') : null
  }

  /** Decompressed contents parsed as JSON, or `null`. */
  readJson<T = unknown> (name: string): T | null {
    const text = this.readText(name)
    return text === null ? null : (JSON.parse(text) as T)
  }
}

function readCentralDirectory (buf: Buffer): JarEntry[] {
  const eocd = findEocd(buf)
  const count = buf.readUInt16LE(eocd + 10)
  let offset = buf.readUInt32LE(eocd + 16)

  const entries: JarEntry[] = []
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(offset) !== CENTRAL) throw new Error('corrupt central directory')
    const nameLen = buf.readUInt16LE(offset + 28)
    const extraLen = buf.readUInt16LE(offset + 30)
    const commentLen = buf.readUInt16LE(offset + 32)
    entries.push({
      name: buf.subarray(offset + 46, offset + 46 + nameLen).toString('utf8'),
      method: buf.readUInt16LE(offset + 10),
      compressedSize: buf.readUInt32LE(offset + 20),
      size: buf.readUInt32LE(offset + 24),
      headerOffset: buf.readUInt32LE(offset + 42)
    })
    offset += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

/** Scan back from the tail for the end of central directory record. */
function findEocd (buf: Buffer): number {
  const min = Math.max(0, buf.length - 0xffff - 22)
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD) return i
  }
  throw new Error('not a zip file: no end of central directory record')
}
