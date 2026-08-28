/**
 * Compile and run WireContract.java against the receiver mod's classes.
 *
 *     npm run test:java
 *
 * Needs the mod built first, which needs a Java 8 JDK and Gradle 2.14.1:
 *
 *     cd examples/bridge/client-mod
 *     JAVA_HOME=/path/to/jdk8 gradle setupCIWorkspace build
 *
 * Skips with a clear message rather than failing when that has not been done,
 * so it stays out of the way on machines without the Java side set up.
 */

import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const modDir = join(root, 'examples', 'bridge', 'client-mod')
const modClasses = join(modDir, 'build', 'classes', 'main')
const outDir = join(modDir, 'build', 'wire-contract')

const MC = '1.8.9'
const FORGE = '1.8.9-11.15.1.2318-1.8.9'
const MAPPINGS = join('stable', '22')

/** Pass --strict to fail instead of skipping, which is what CI wants. */
const strict = process.argv.includes('--strict')

function skip (why) {
  console.log(`${strict ? 'missing' : 'skipped'}: ${why}`)
  console.log('see the header of test/java/run-contract.mjs for the one-off setup')
  process.exit(strict ? 1 : 0)
}

/** Newest file matching `match` anywhere under `dir`, or null. */
function findUnder (dir, match) {
  if (!existsSync(dir)) return null
  const stack = [dir]
  let best = null
  while (stack.length) {
    const current = stack.pop()
    for (const name of readdirSync(current)) {
      const full = join(current, name)
      const info = statSync(full)
      if (info.isDirectory()) stack.push(full)
      else if (match(name) && (!best || info.mtimeMs > best.mtime)) best = { full, mtime: info.mtimeMs }
    }
  }
  return best?.full ?? null
}

const javaHome = process.env.JAVA_HOME
if (!javaHome) skip('JAVA_HOME is not set')

const javac = join(javaHome, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac')
const java = join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
if (!existsSync(javac)) skip(`no javac under JAVA_HOME (${javaHome}), a JRE is not enough`)
if (!existsSync(modClasses)) skip('the client mod has not been built yet')

const cache = join(homedir(), '.gradle', 'caches')
const forgeBin = join(cache, 'minecraft', 'net', 'minecraftforge', 'forge', FORGE, MAPPINGS, `forgeBin-${FORGE}.jar`)
const gson = findUnder(join(cache, 'modules-2', 'files-2.1', 'com.google.code.gson', 'gson', '2.2.4'),
  name => name === 'gson-2.2.4.jar')

if (!existsSync(forgeBin)) skip(`no deobfuscated Forge ${MC} jar in the Gradle cache`)
if (!gson) skip('no gson 2.2.4 in the Gradle cache')

const sep = process.platform === 'win32' ? ';' : ':'
const classpath = [forgeBin, gson, modClasses].join(sep)

mkdirSync(outDir, { recursive: true })
execFileSync(javac, ['-encoding', 'UTF-8', '-cp', classpath, '-d', outDir, join(here, 'WireContract.java')],
  { stdio: 'inherit' })
execFileSync(java, ['-Dfile.encoding=UTF-8', '-cp', [outDir, classpath].join(sep), 'WireContract', join(here, 'frames.json')],
  { stdio: 'inherit' })
