import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.example.cbbridge.ReceivedBlock;
import net.example.cbbridge.ReceivedItem;
import net.example.cbbridge.ReceivedStore;

import java.io.FileReader;
import java.util.List;

/**
 * Parses frames the TypeScript bridge actually emitted, using the receiver mod's
 * own classes, and checks the fields came through.
 *
 * This runs outside Minecraft, so it exercises the JSON contract and the store,
 * not the rendering. Nothing here touches a Block or Item registry, which is the
 * part that needs a running game.
 *
 * Run it through `npm run test:java`, which captures fresh frames first.
 */
public class WireContract {

    private static int passed = 0;
    private static int failed = 0;

    public static void main(String[] args) throws Exception {
        String file = args.length > 0 ? args[0] : "test/java/frames.json";
        JsonArray frames = new JsonParser().parse(new FileReader(file)).getAsJsonArray();

        JsonObject hello = find(frames, "hello");
        JsonObject blockFrame = find(frames, "block");
        JsonObject snapshot = find(frames, "snapshot");
        JsonObject inventory = find(frames, "inventory");
        JsonObject entityItems = find(frames, "entity_items");

        check("every frame carries the wire version the mod expects",
                hello.get("v").getAsInt(), 1);
        check("hello names the mod the receiver depends on",
                hello.get("mod").getAsString(), "mysterymod_customblocks");
        check("hello carries a registry hash the receiver can compare",
                hello.get("registryHash").getAsString().length(), 40);
        check("hello carries the MysteryBlocks protocol version",
                hello.get("cbProtocol").getAsInt(), 5);

        ReceivedBlock chair = ReceivedBlock.fromJson(blockFrame.getAsJsonObject("block"));
        check("block frame parses into the id MysteryBlocks registered", chair.id, 2516);
        check("block frame parses its key", chair.key, "cb:oak_chair");
        check("block frame parses its metadata", chair.meta, 3);
        check("block frame parses its position", chair.pos.getX() + "," + chair.pos.getY() + "," + chair.pos.getZ(), "8,2,8");
        check("block frame parses its decoded properties", chair.describeProperties(), "facing=east");
        check("block frame parses the display name", chair.displayName, "Eichenholzstuhl");
        check("block frame parses the neighbour-derived flag", chair.derivedFromNeighbours, false);

        JsonArray blocks = snapshot.getAsJsonArray("blocks");
        check("snapshot count matches the array it carries", snapshot.get("count").getAsInt(), blocks.size());

        ReceivedStore store = new ReceivedStore();
        store.beginBatch();
        for (JsonElement element : blocks) store.put(ReceivedBlock.fromJson(element.getAsJsonObject()));
        store.endBatch();
        check("snapshot fills the store, keyed by position", store.blockCount(), blocks.size());
        check("store leaves batching once the snapshot is applied", store.isBatching(), false);
        check("store reports itself dirty so the renderer rebuilds", store.consumeDirty(), true);
        check("store clears the dirty flag after it is read", store.consumeDirty(), false);

        boolean neighbourDerivedSeen = false;
        for (ReceivedBlock b : store.getBlocks()) if (b.derivedFromNeighbours) neighbourDerivedSeen = true;
        check("snapshot includes a block whose shape needs neighbours", neighbourDerivedSeen, true);

        JsonArray items = inventory.getAsJsonArray("items");
        ReceivedItem pickaxe = null;
        for (JsonElement element : items) {
            ReceivedItem item = ReceivedItem.fromJson(element.getAsJsonObject());
            store.putItem(item);
            if ("cb:pickaxe_rgb".equals(item.key)) pickaxe = item;
        }
        check("inventory frame fills the item list", store.getItems().size(), items.size());
        check("inventory frame contains the custom tool", pickaxe != null, true);

        if (pickaxe != null) {
            check("item frame parses the id MysteryBlocks registered", pickaxe.id, 3328);
            check("item frame parses the count", pickaxe.count, 1);
            check("item frame parses the slot", pickaxe.slot, 36);
            check("item frame parses the server-side rename", pickaxe.customName, "§bBaba Spitzhacke");
            check("item label prefers the custom name", pickaxe.label(), "§bBaba Spitzhacke");
            check("item frame parses the vanilla replacement", pickaxe.replacement, "minecraft:diamond_pickaxe");
        }

        // A block held as an item arrives on the same list with kind block-item.
        ReceivedItem chairStack = null;
        for (JsonElement element : items) {
            ReceivedItem item = ReceivedItem.fromJson(element.getAsJsonObject());
            if ("cb:oak_chair".equals(item.key)) chairStack = item;
        }
        check("inventory frame contains the block held as an item", chairStack != null, true);
        if (chairStack != null) {
            check("block-item stack parses its count", chairStack.count, 12);
            check("block-item stack falls back to the display name", chairStack.label(), "Eichenholzstuhl");
        }

        JsonArray carried = entityItems.getAsJsonArray("items");
        check("entity_items count matches the array it carries",
                entityItems.get("count").getAsInt(), carried.size());

        ReceivedItem held = null;
        ReceivedItem worn = null;
        for (JsonElement element : carried) {
            ReceivedItem item = ReceivedItem.fromEntityJson(element.getAsJsonObject());
            store.putItem(item);
            if ("hand".equals(item.equipmentSlot)) held = item;
            if ("helmet".equals(item.equipmentSlot)) worn = item;
        }

        check("entity_items carries a held item", held != null, true);
        check("entity_items carries a worn item", worn != null, true);

        if (held != null) {
            check("held item parses the id MysteryBlocks registered", held.id, 3328);
            check("held item names the player carrying it", held.holder, "CbNeighbour");
            check("held item keeps its equipment slot", held.equipmentSlot, "hand");
            check("held item label credits the holder", held.label().startsWith("CbNeighbour"), true);
        }
        if (worn != null) {
            check("worn custom block resolves as an item too", worn.key, "cb:oak_chair");
        }

        int beforeClear = store.getItems().size();
        store.clearEntityItems();
        check("clearEntityItems drops only what an entity was carrying",
                beforeClear - store.getItems().size(), carried.size());

        store.clear();
        check("clear empties the store", store.blockCount() + store.getItems().size(), 0);

        System.out.println();
        System.out.println(passed + " checks passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }

    private static JsonObject find(JsonArray frames, String kind) {
        for (JsonElement element : frames) {
            JsonObject frame = element.getAsJsonObject();
            if (kind.equals(frame.get("kind").getAsString())) return frame;
        }
        throw new IllegalStateException("no " + kind + " frame in the capture");
    }

    private static void check(String name, Object actual, Object expected) {
        if (expected.equals(actual)) {
            passed++;
            System.out.println("  ok  " + name);
        } else {
            failed++;
            System.out.println("FAIL  " + name + "\n      expected " + expected + ", got " + actual);
        }
    }
}
