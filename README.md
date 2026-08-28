# mysteryblocks

Read MysteryBlocks (`cb:`) custom blocks and items on Minecraft 1.8.9, from TypeScript.

Give it a block state off any 1.8 chunk, or an item id and damage out of any Slot, and it tells you what a client with MysteryBlocks installed would have made of it. The core has no dependencies and knows nothing about bots. A mineflayer plugin ships alongside it as an optional adapter.

Built against MysteryBlocks 1.0.5 for Minecraft 1.8.9 (`mysterymod_customblocks`).

```bash
npm install github:GGBotDE/mysteryblocks
```

Node 18 or newer. Working on the repo itself needs Node 20 or newer, because
vitest does.

Not on npm. Installing from GitHub builds `dist/` through the `prepare` script,
so nothing extra is needed on your side.

## Quick start

```ts
import { loadRegistry } from 'mysteryblocks'

const cb = loadRegistry()

cb.describeState(40259)
// {
//   id: 2516, key: 'cb:oak_chair', stateId: 40259, meta: 3,
//   blockClass: 'categories.ChairBlock', displayName: 'Eichenholzstuhl',
//   properties: { facing: 'east' }, derivedFromNeighbours: false,
//   replacement: 'minecraft:oak_stairs', legacyReplacement: 'minecraft:oak_stairs', ...
// }

cb.describeItem(3328, 0, 1)
// {
//   kind: 'item', id: 3328, key: 'cb:pickaxe_rgb', itemClass: 'type.PickaxeItem',
//   replacement: 'minecraft:diamond_pickaxe', attackDamage: 10.5, ...
// }

cb.block('cb:oak_table')!.legacyReplacement   // 'minecraft:log;0'
cb.isBlockId(2516)                            // true
cb.blocks.length                              // 813
```

### Answering the handshake

A MysteryMod partner server only sends `cb:` ids to clients that ask for them. These helpers take and return buffers, so they work with mineflayer, with node-minecraft-protocol on its own, or with a proxy:

```ts
import { isHandshakeRequest, handshakeReply, REPLY_CHANNEL } from 'mysteryblocks'

client.on('custom_payload', packet => {
  if (!isHandshakeRequest(packet.channel, packet.data)) return
  client.write('custom_payload', { channel: REPLY_CHANNEL, data: handshakeReply(5) })
})
```

### With mineflayer

```ts
import mineflayer from 'mineflayer'
import cbPlugin from 'mysteryblocks/mineflayer'

const bot = mineflayer.createBot({ host: 'example.net', username: 'Bot', version: '1.8.9' })
bot.loadPlugin(cbPlugin)

bot.once('spawn', () => {
  for (const block of bot.cb.findBlocks({ maxDistance: 24 })) {
    console.log(block.key, block.position, block.properties)
  }
  console.log(bot.cb.inventory())
})
```

```bash
npx tsx examples/read-blocks.ts example.net 25565 MyBotName
```

### Items other players are holding

`entity_equipment` covers entities in range, so a bot can read what nearby
players are holding and wearing without any inventory access:

```ts
for (const found of bot.cb.nearbyItems({ maxDistance: 32 })) {
  console.log(found.username, found.slot, found.item.key, found.item.customName)
  // CbNeighbour hand cb:pickaxe_rgb §bBaba Spitzhacke
}

bot.cb.heldItem(bot.players['SomeName'].entity)   // just the held item
bot.cb.equipment(entity)                          // hand plus the four armour slots
```

What the server never sends, and this therefore cannot reach, is the rest of
another player's inventory.

### Without a bot at all

`patchRegistry` works on any prismarine-registry:

```ts
import prismarineRegistry from 'prismarine-registry'
import prismarineBlock from 'prismarine-block'
import { patchRegistry } from 'mysteryblocks'

const registry = prismarineRegistry('1.8.9')
patchRegistry(registry)
prismarineBlock(registry).fromStateId(40259, 0).name   // 'cb:oak_chair'
```

## API

### Core

```ts
import {
  loadRegistry, decodeMeta, patchRegistry, readStackMetadata,
  simplifyNbt, resolveVanillaRef, isHandshakeRequest, handshakeReply
} from 'mysteryblocks'
```

| | |
|---|---|
| `loadRegistry(file?)` | the bundled registry, or one you generated |
| `cb.describeState(stateId)` | decode a raw `(id << 4) \| meta` |
| `cb.describeBlock(id, meta)` | the same, split |
| `cb.describeItem(id, damage, count, nbt)` | decode an item stack, or a block held as one |
| `cb.block(idOrName)`, `cb.item(idOrName)` | raw registry entries |
| `cb.isBlockId(id)`, `cb.isItemId(id)` | predicates |
| `cb.blocks`, `cb.items`, `cb.itemGroups`, `cb.hash` | the data itself |
| `isHandshakeRequest(channel, data)` | is this the server asking? |
| `handshakeReply(protocol)` | the payload to write back |
| `readStackMetadata(nbt, registry?)` | name, lore, enchantments, attributes, flags |
| `simplifyNbt(tag)` | prismarine-nbt's tagged form to plain JavaScript |
| `resolveVanillaRef(replacement, registry?)` | resolve a `replacement` string to a 1.8 id |
| `patchRegistry(registry)` | register `cb:` ids into a prismarine-registry |

Lookups return `null` rather than throwing, and everything is typed.

### mineflayer

```ts
import cbPlugin from 'mysteryblocks/mineflayer'
```

| | |
|---|---|
| `bot.cb.blockAt(pos)` | full custom-block description, or `null` if it is not one |
| `bot.cb.findBlocks({maxDistance, count, match})` | search around the bot. `match` is a key, array of keys, or predicate |
| `bot.cb.scanLoadedChunks({match, count})` | every custom block in every loaded chunk |
| `bot.cb.inventory(window?)` | custom items in the inventory, or in any window |
| `bot.cb.describeItem(item)` | describe a prismarine `Item`, including all its stack NBT |
| `bot.cb.heldItem(entity)` | the custom item another entity is holding, or `null` |
| `bot.cb.equipment(entity)` | every custom item an entity has equipped, with slot and distance |
| `bot.cb.nearbyItems({maxDistance, match})` | the same across every entity the bot can see |
| `bot.cb.isCustomBlock(block)`, `bot.cb.isCustomItem(item)` | predicates |
| `bot.cb.state` | `{ handshakeSent, serverSupportsCustomBlocks, protocol }` |
| `bot.on('cb_handshake')` | fires once the server confirms custom-block support |

Options go in on the `createBot` call as `cb`:

| option | default | |
|---|---|---|
| `handshake` | `true` | answer `StartHandshake`. Set `false` to receive whatever the server sends clients that stay quiet |
| `patchRegistry` | `true` | register `cb:` ids with prismarine-block and prismarine-item |
| `verbose` | `false` | log the handshake and the registry range |
| `registry` | bundled | use a registry you generated yourself |

### Entry points

| import | needs |
|---|---|
| `mysteryblocks` | nothing |
| `mysteryblocks/prismarine` | a prismarine-registry to patch |
| `mysteryblocks/mineflayer` | `mineflayer` and `vec3`, both optional peers |
| `mysteryblocks/jar` | nothing. The zip reader, if you want the mod's raw JSON |
| `mysteryblocks/registry.json` | nothing. The generated data file |

## Generating the registry from a jar

`data/cb-registry.json` ships with the package. To rebuild it from a jar of your own, from a clone of this repo:

```bash
npm run generate -- path/to/MysteryBlocks_1.8.9_v1.0.5.jar
```

To pull out the mod's raw JSON instead of the derived registry:

```bash
npm run extract -- path/to/MysteryBlocks_1.8.9_v1.0.5.jar ./extracted
```

As a dependency the same two are on the `PATH` as `mysteryblocks-generate` and `mysteryblocks-extract`.

That writes `customblocks/default_blocks.json`, `default_items.json`, `default_item_groups.json`, `assets/cb/lang/en_us.json` and `mcmod.info`, keeping the jar's own paths.

A jar is a zip, so both commands read it directly. Both also accept a directory laid out like a jar, so an unpacked or decompiled copy works.

The jar itself is not in this repo. It is not ours to redistribute.

## How MysteryBlocks works

Everything below is quoted from the decompiled 1.0.5 jar, with the file and line it came from.

### Custom blocks are real blocks at fixed numeric ids

`ModBlocks` reads `customblocks/default_blocks.json` and assigns every entry a numeric id:

```java
// net/mysterymod/customblocks/ModBlocks.java:195
private static BlockKey getBlockKey(int idOffset, String key) {
  int id = idOffset + 2500;
  String realName = "cb:" + key;
  return new BlockKey(id, realName);
}
```

`Registerer` force-registers each block into Forge's numeric registry at that id, by reflecting on `FMLControlledNamespacedRegistry#add`:

```java
// net/mysterymod/customblocksforge/Registerer.java:37
addMethod.invoke(GameData.getBlockRegistry(),
    new Object[] { Integer.valueOf(entry.getValue().getBlockKey().getId()), loc, block });
```

Items continue past the last block:

```java
// net/mysterymod/customblocks/ModItems.java:129
int id = ModBlocks.getHighestIdOffset() + idOffset + 2500;
```

In 1.0.5:

| | count | numeric ids |
|---|---|---|
| blocks | 813 | 2500 to 3327 (`2500 + id`) |
| items | 8 | 3328 to 3335 (`2500 + 827 + id`) |

A 1.8 chunk packs each block into 16 bits as `id << 4 | meta`, leaving 12 bits for the id, so ids up to 4095 fit. That is why the scheme works on 1.8.9 at all.

The numeric id is a stable, shared handle. Read `2516` off the wire, and a client with MysteryBlocks installed calls `Block.getBlockById(2516)` and gets the same block back with its model. No assets need to cross between them.

### The server only sends custom ids to clients that ask

Vanilla clients would render garbage on ids at or above 2500, so the server gates them behind a handshake on the `MM|CustomBlocks` plugin channel. The mixin below is decompiled with obfuscated method names, so the MCP names are in comments:

```java
// net/mysterymod/customblocksforge/injection/mixins/MixinNetHandlerPlayClient.java:28
if (!"MM|CustomBlocks".equals(packetIn.func_149169_c())      // getChannelName()
    && !"cb:init".equals(packetIn.func_149169_c())) return;
if (!buffer.func_150789_c(32767).equals("StartHandshake")) return;   // readStringFromBuffer
packetBuffer.func_180714_a(ServerConnection.getJsonPayload());       // writeString
C17PacketCustomPayload packet = new C17PacketCustomPayload("MM|CustomBlocks", packetBuffer);
```

```java
// net/mysterymod/customblocksforge/ServerConnection.java:10
public static String getJsonPayload() {
  JsonObject jsonObject = new JsonObject();
  jsonObject.addProperty("protocol", Integer.valueOf(5));
  return jsonObject.toString();
}
```

So the server sends `StartHandshake` as a length-prefixed string, the client replies `{"protocol":5}` on `MM|CustomBlocks`, and `cb:` ids start arriving on that connection. The `5` is `ModBlocks.CURRENT_PROTOCOL_VERSION` (`ModBlocks.java:29`).

A client that stays quiet never learns the custom block exists. What it is sent instead is a server side decision the client jar does not describe, so this package does not claim to know it. See [What `replacement` is, and what it is not](#what-replacement-is-and-what-it-is-not).

### Block state is 4 bits, and sometimes incomplete

A placed custom block conveys at most 4 bits of state. Each MysteryBlocks block class unpacks those bits differently. `src/meta.ts` ports every `getStateFromMeta`:

| class | meta layout |
|---|---|
| `FurnitureHorizontalBlock` | `facing = [north,south,west,east][meta & 3]` |
| `general.StairsBlock` | `half = meta & 4`, `facing = Direction.getFront(5 - (meta & 3))` |
| `general.VerticalSlabBlock` | `axis = meta & 1`, `type = (meta >> 1) & 3` |
| `general.DoorBlock` | bit 8 selects upper or lower, lower rotates facing counter-clockwise |
| `type.DoubleBlock` | `part = meta / 4`, `facing = meta % 4` |
| `fence.UpgradedGateBlock` | facing, hinge, open, plus a `DOUBLE` bit at `0x10` |

That last one cannot arrive on 1.8. `UpgradedGateBlock.java:61` writes it as `meta |= 0x10` and reads it back as `(meta & 0x10) != 0`, which is bit 5 of a 4 bit field, so `double` is always `false` here.

Thirteen classes recompute part of their state from the surrounding world in `getActualState`, and the decoder marks those with `derivedFromNeighbours: true`:

```
categories.ParkBenchBlock   general.DoorBlock          general.StairsBlock
general.TrampolineBlock     kitchen.KitchenCounterBlock  office.DeskBlock
office.DeskCabinetBlock     small.BlindsBlock          small.CoffeeTableBlock
type.CornerExtensionBlock   type.HorizontalExtensionBlock
type.InfiniteExtensionBlock type.VerticalExtensionBlock
```

To reproduce those elsewhere, send the neighbours too.

Walls and fences are deliberately not on that list. `WallBlock` declares `WALL_HEIGHT_NORTH` and friends, but nothing in the mod computes them from neighbours, and the fence classes have no `getActualState` at all. `AxisBlock`, `LitBlock`, `PipeBlock`, `StackedBlock` and `LogBlock` do override it, but only to copy values already in the state, so they are not neighbour-derived either.

Exact collision hulls live in `assets/cb/shapes_generated.dat` and `shapes_v1.dat` through `shapes_v21.dat`, a binary format this package does not decode.

## prismarine compatibility

`cb:` blocks and items are registered as ordinary entries in `bot.registry`, so plain mineflayer and prismarine code works on them without knowing MysteryBlocks exists:

```ts
bot.blockAt(pos).name          // 'cb:oak_chair' instead of ''
bot.inventory.slots[36].name   // 'cb:pickaxe_rgb' instead of 'unknown'
bot.inventory.slots[36].enchants     // [{ name: 'efficiency', lvl: 5 }]
bot.inventory.slots[36].customLore   // ['§7line one', '§7line two']
bot.digTime(bot.blockAt(pos))        // same as the replacement block
```

Where a block or item has a vanilla replacement, its properties are copied from that replacement rather than invented: hardness, resistance, material, harvest tools, drops, bounding box, collision shapes, and for items `stackSize` and `maxDurability`.

That mirrors the mod. `VersionBlock`'s constructor branches on whether a replacement exists:

```java
// net/mysterymod/customblocksforge/block/VersionBlock.java:69
if (modBlock.getReplacement() == null) {
  func_149752_b(blockProperties.getHardness().getHardnessContainer().getLegacyResistance());
  func_149711_c(blockProperties.getHardness().getHardnessContainer().getLegacyHardness());
} else {
  BlockProperties.HardnessContainer container =
      BlockPropertiesConverter.getHardness(modBlock.getReplacement());
  ...
}
```

The `Hardness` enum is only the fallback, and `getReplacement()` is null for 143 of the 813 blocks. Another 113 have no `replacement` in the JSON but do get one from their class's `getFallbackReplacement()`, so the enum does not apply to them either. The enum's default is `PLANKS(2.0F, 5.0F)` (`BlockProperties.java:18` and `:108`).

When a replacement does not resolve to a real 1.8 block, `BlockPropertiesConverter.getBlock` falls back to `minecraft:planks`, and `patchRegistry` does the same.

The practical effect is that `cb:oak_chair` gets `oak_stairs`' hardness of 2, its `wood` material, and its actual two-box stair collision shape rather than a guessed full cube.

Both forms of every object are reachable from a description. They are attached as non-enumerable properties, so descriptions stay safe to `JSON.stringify`:

| | |
|---|---|
| `desc.block` | prismarine `Block`, on a block description |
| `desc.item` | prismarine `Item` as received, on an item description |
| `desc.rawNbt` | the tagged NBT, before flattening |

```ts
const desc = bot.cb.inventory()[0]

desc.item.name         // 'cb:pickaxe_rgb'
desc.item.customLore   // prismarine's own getters work on it

JSON.stringify(desc)   // no Item objects in the output
```

## What `replacement` is, and what it is not

Every block and item carries a `replacement`, and it is easy to read more into it
than the jar supports.

What is verified: `ModBlock.getReplacement()` returns the `replacement` from
`default_blocks.json`, or the class's `getFallbackReplacement()` when the JSON
has none. `VersionBlock` and `BlockPropertiesConverter` use it to copy hardness
and material onto the custom block. That is the whole of its documented job, and
it is why `patchRegistry` copies the same properties.

What is not verified: whether a server sends that block or item to clients that
never answered the handshake. It is a reasonable guess, and the field name
invites it, but the client jar never says so. `ModItem.getReplacement()` is not
called anywhere in the jar at all, and nothing in it mentions substituting
anything for other clients. The substitution, if it happens, is server side and
this package cannot see it.

So this package does not try to rebuild "the vanilla item". An earlier version
exposed `vanillaItem`, `vanillaBlock` and `vanillaEquivalent`, which stamped the
`cb:` stack's own NBT onto a guessed vanilla id and presented the result as what
another client would receive. Nothing supported that, so they are gone.

What you do get is the NBT of the stack this connection actually received, which
is real data:

```ts
const pick = bot.cb.inventory()[0]

pick.customName          // '§bBaba Spitzhacke'
pick.lore                // ['§7Line one', '§7Line two']
pick.enchantments        // [{ id: 32, name: 'efficiency', displayName: 'Efficiency', lvl: 5 }]
pick.attributeModifiers  // parsed from AttributeModifiers
pick.unbreakable         // from Unbreakable
pick.nbt                 // the whole tag, flattened
pick.replacement         // 'minecraft:diamond_pickaxe', for what that is worth
```

If you want to know what a server sends unhandshaked clients, measure it: run the
same bot twice with `cb: { handshake: false }` on one of them and diff the
inventories. That is the only way to find out, and the answer is per server.

## Examples

There are two, and they are meant to be tried in that order.

### 1. read-blocks: print what the bot can see

Reads only, sends nothing anywhere. Use it to confirm a server actually speaks
MysteryBlocks before building anything on top.

```bash
npm install
npx tsx examples/read-blocks.ts <host> [port] [username]
```

A username containing `@` switches the bot to Microsoft auth, anything else joins
in offline mode. It waits for the handshake, then prints three sections:

```
[cb] server confirmed custom-block support, cb: ids will now arrive

37 custom blocks within 24 blocks
  8,2,8              cb:oak_chair                 meta=3 [facing=east]
  9,2,8              cb:oak_table                 meta=0 []  (shape depends on neighbours)

2 custom items in inventory
  slot 36  cb:pickaxe_rgb  x1
    type          type.PickaxeItem
    name          §bBaba Spitzhacke
    lore          §7Line one | §7Line two
    enchantments  efficiency 5
    replacement   minecraft:diamond_pickaxe

3 custom items on 2 nearby entities
  SomePlayer         hand        cb:pickaxe_rgb               4.2m  "§bBaba Spitzhacke"
  SomePlayer         helmet      cb:oak_chair                 4.2m
```

If the first line never appears, the server is not sending `cb:` ids to you and
everything else will be empty.

The file has a `bot.chat('/switch cb1')` on join and a 30 second wait before
reporting, which suits GrieferGames. Change or delete both for another server.

### 2. bridge: send it to a Forge client

Larger, and not part of the library. It re-broadcasts what the bot sees as JSON
so a Minecraft client running the receiver mod can draw it. Useful when you want
to *see* what the bot sees, in game.

```bash
npx tsx examples/bridge/bot.ts <host> [port] [username]
```

That joins, opens a WebSocket on `25599` and a line-JSON TCP port on `25600`, and
pushes a snapshot of nearby blocks, its own inventory, and what nearby players
are carrying. It keeps pushing as blocks change and as players swap items.

Then, in a Minecraft 1.8.9 client with Forge, MysteryBlocks and the receiver mod
installed:

```
/cbbridge connect 127.0.0.1 25600
/cbbridge scan 24          ask the bot to sweep 24 blocks around itself
/cbbridge inventory        ask for the bot's inventory
/cbbridge carried 32       ask what nearby players are holding and wearing
/cbbridge status           connection state and registry hash
/cbbridge clear            forget everything received so far
```

Blocks appear as translucent ghosts in the world, drawn with MysteryBlocks' own
models. Items appear in a corner overlay, entity items labelled with who is
carrying them and in which slot.

The pieces:

- `bridge.ts` serves the JSON on both transports. The TCP form is what the Forge mod uses. A `Socket` and a `BufferedReader` are the whole client requirement.
- `bot.ts` wires a bot to the bridge.
- `cb-wire.schema.json` documents every frame.
- `client-mod/` is the Forge 1.8.9 receiver.

You can also drive it without Minecraft at all. Anything that speaks WebSocket
works:

```bash
npx wscat -c ws://127.0.0.1:25599
> {"kind":"get_entity_items","radius":32}
> {"kind":"scan","radius":16,"match":"oak_chair"}
```

A block frame:

```json
{
  "v": 1,
  "kind": "block",
  "ts": 1755100000000,
  "block": {
    "id": 2516,
    "key": "cb:oak_chair",
    "stateId": 40259,
    "meta": 3,
    "blockClass": "categories.ChairBlock",
    "displayName": "Eichenholzstuhl",
    "properties": { "facing": "east" },
    "derivedFromNeighbours": false,
    "replacement": "minecraft:oak_stairs",
    "position": { "x": 8, "y": 2, "z": 8 }
  }
}
```

`id` and `meta` are all a receiver with MysteryBlocks installed needs. The rest is there so a receiver without it can still show something meaningful.

The receiver mod ships no MysteryBlocks assets. It declares `required-after:mysterymod_customblocks` and resolves everything through the ids:

```java
Block block = Block.getBlockById(id);               // MysteryBlocks registered it here
IBlockState state = block.getStateFromMeta(meta);   // the mod's own decoder
```

### Building the receiver mod

It needs ForgeGradle 2.1, Gradle 2.14.1 and a Java 8 JDK. Later ForgeGradle lines dropped 1.8.9: 2.3.4 refuses anything below 1.12. The wrapper is pinned to the right Gradle, so point `JAVA_HOME` at a JDK 8 and run:

```bash
cd examples/bridge/client-mod
./gradlew setupCIWorkspace build
```

That produces `build/libs/cbbridge-1.0.0.jar`. Drop it in the client's `mods`
folder alongside MysteryBlocks, which it declares as a hard dependency.

The bridge binds to `127.0.0.1` by default. Anyone who can reach the port can drive scans through your bot, so change `host` deliberately and set `token` if you expose it.

## Project layout

```
src/index.ts        core exports, no bot and no dependencies
src/registry.ts     id arithmetic and lookups
src/meta.ts         every getStateFromMeta, ported
src/handshake.ts    the MM|CustomBlocks handshake
src/nbt.ts          stack NBT
src/vanilla.ts      replacement resolution
src/prismarine.ts   optional: patch a prismarine-registry
src/mineflayer.ts   optional: the mineflayer plugin
src/tools/          zip reader, resource extraction, registry generator
data/               813 blocks and 8 items, generated
test/               vitest suites, a fake 1.8.9 server, the Java wire check
examples/           the plugin on its own, and the JSON bridge
```

## Testing

```bash
npm run check      # typecheck, build, then both vitest suites
npm test           # vitest only
npm run test:java  # the Forge receiver against real bridge frames
```

The vitest run is 78 checks in two suites. `test/decode.test.ts` is offline. `test/e2e.test.ts` stands up a real 1.8.9 protocol server that performs the handshake, sends a chunk containing `cb:` blocks, `set_slot` packets with a renamed enchanted custom item, and a second player carrying custom equipment, then connects a real mineflayer bot and reads what came off the wire.

`npm run test:java` is a cross-language check on the bridge wire format. It captures live frames from the bridge, then parses them with the receiver mod's own compiled classes and asserts the fields survived, 38 checks. It skips with a message unless `JAVA_HOME` points at a JDK 8 and the mod has been built, so it stays out of the way otherwise.

What that does not cover is rendering. `GhostRenderer` and `HudOverlay` compile against the real 1.8.9 Forge API, but drawing them correctly needs Minecraft running with MysteryBlocks installed, and that is not automated here.

## Known limits

- 1.8.9 only. The ids and the 4 bit metadata layout are specific to this build of MysteryBlocks.
- Neighbour-derived state is flagged but not resolved bot-side. The bot would have to look at the surrounding blocks itself.
- `UpgradedGateBlock`'s `DOUBLE` bit sits at `0x10`, outside the 4 bits a 1.8 chunk carries, so it never arrives.
- Collision hulls in `assets/cb/shapes_*.dat` are not decoded. Blocks fall back to their replacement's shape.
- `assets/cb/lang/en_us.json` holds German strings for blocks despite the name. `displayName` reflects the file, `prettyName` is the raw value from `default_blocks.json`.
- A MysteryBlocks update means re-running `npm run generate`. The `hash` field exists so a consumer can detect a mismatch.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Decoder fixes and support for newer MysteryBlocks builds are the most useful things to send.

## License

MIT. See [LICENSE](LICENSE).

Not affiliated with MysteryMod or GrieferGames. This reads a format, it does not redistribute the mod.
