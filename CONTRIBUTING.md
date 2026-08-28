# Contributing

Thanks for taking a look. Bug reports, decoder fixes and support for newer
MysteryBlocks builds are all welcome.

## Getting set up

```bash
npm install
npm run generate -- path/to/MysteryBlocks_1.\*.\*_v1.\*.\*.jar
npm run check
```

`npm run generate` rebuilds `data/cb-registry.json`. The jar is not in this repo,
since it is not ours to redistribute. Grab it from CurseForge or from your own
mods folder.

Node 20 or newer for development: vitest 4 declares
`^20.0.0 || ^22.0.0 || >=24.0.0`. The library itself runs on 18, which CI checks
separately by running `.github/smoke.js` against the built output.

`npm run check` runs the type check, the build, and both vitest suites. The end
to end suite starts a real 1.8.9 protocol server on port 25789 and connects a
bot to it, so nothing else may be holding 25789, 25799 or 25800.

## Where things live

```
src/registry.ts     id arithmetic and lookups
src/meta.ts         every getStateFromMeta, ported
src/handshake.ts    the MM|CustomBlocks handshake, framework agnostic
src/nbt.ts          stack NBT
src/vanilla.ts      replacement resolution
src/prismarine.ts   optional: patch a prismarine-registry
src/mineflayer.ts   optional: the mineflayer plugin
src/tools/jar.ts        minimal zip reader
src/tools/resources.ts  finding the mod's JSON in a jar or a directory
test/fake-server.ts     the 1.8.9 server the end to end suite talks to
```

Keep `src/index.ts` free of mineflayer and prismarine. The core is meant to run
with nothing installed, and the adapters are meant to be opt in.

## Style

Two space indent, no semicolons, single quotes. Match the file you are editing.

Public functions get a JSDoc block. Say what the thing does and why, not what the
next line does.

Where the code mirrors the mod, name the Java class or method it came from. That
is what makes the decoders reviewable, and it is the first thing anyone checks
when a block decodes wrong.

## Claims about the mod need a citation

Anything the README or a comment asserts about MysteryBlocks should be traceable
to a file and line in the decompiled jar. Two examples of what that catches:

- `NEIGHBOUR_DERIVED` used to list walls, fences and hedges. None of those have a
  `getActualState` that reads the world, and `general.DoorBlock` and
  `small.BlindsBlock`, which do, were missing.
- The receiver mod's `build.gradle` asked for `ForgeGradle:2.3-SNAPSHOT`, which
  now resolves to 2.3.4 and refuses to build anything below Minecraft 1.12.
- `vanillaItem` and friends claimed to rebuild the stack a client without the
  handshake receives. The jar never says what such a client is sent, so the
  feature was removed rather than kept with a caveat.

If you cannot point at the source for a claim, leave it out.

## Adding or fixing a decoder

1. Find the `getStateFromMeta` in the decompiled mod.
2. Add or fix the entry in `DECODERS`, keyed by the exact `blockClass` string.
3. Add a check in `test/decode.test.ts` covering the interesting metadata values.
4. If the class or one of its ancestors overrides `getActualState` and reads the
   world parameter, add it to `NEIGHBOUR_DERIVED`. Overrides that only copy
   values already in the state do not count.

`test/decode.test.ts` asserts that every `blockClass` in the registry has a
decoder, and pins the full `NEIGHBOUR_DERIVED` list, so a new MysteryBlocks
release fails loudly rather than decoding to nothing.

## The Forge receiver mod

`examples/bridge/client-mod/` needs ForgeGradle 2.1, Gradle 2.14.1 and a Java 8
JDK. Later ForgeGradle lines dropped 1.8.9. The wrapper is pinned, so:

```bash
cd examples/bridge/client-mod
JAVA_HOME=/path/to/jdk8 ./gradlew setupCIWorkspace build
```

If you add or replace `gradlew`, make sure git records it as executable,
otherwise CI fails with `Permission denied`:

```bash
git update-index --chmod=+x examples/bridge/client-mod/gradlew
```

Then, from the repo root, `npm run test:java` captures live frames from the
bridge and parses them with the mod's own classes. It skips with a message when
the Java side is not set up, so it does not get in your way otherwise.

Changing a frame field means changing three things together: the bridge in
`examples/bridge/bridge.ts`, `cb-wire.schema.json`, and the `fromJson` methods in
`ReceivedBlock` and `ReceivedItem`. `WireContract.java` is what tells you when
they drift apart.

## Supporting a newer MysteryBlocks release

Regenerate the registry from the new jar, run the tests, and fix whatever breaks.
The `hash` field changes with the data, which is how a consumer detects that its
copy no longer matches the server's.

## Pull requests

Small and focused beats large and complete. Say what you changed and how you
checked it. If you found the behaviour in the decompiled jar, quote the class and
line so a reviewer can follow.

Run `npm run check` before pushing.

## Reporting a bug

Include the MysteryBlocks version, the registry `hash`, the block or item key,
and the metadata value you saw. A failing check added to `test/decode.test.ts` is
ideal, but a description of what you expected and what you got is enough to get
started.
