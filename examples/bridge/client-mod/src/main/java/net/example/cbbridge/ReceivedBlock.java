package net.example.cbbridge;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.minecraft.block.Block;
import net.minecraft.block.state.IBlockState;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.util.BlockPos;

import java.util.LinkedHashMap;
import java.util.Map;

/** One custom block described by a bridge frame. */
public class ReceivedBlock {

    public final int id;
    public final String key;
    public final int meta;
    public final String displayName;
    public final String blockClass;
    public final boolean derivedFromNeighbours;
    public final BlockPos pos;
    public final Map<String, String> properties = new LinkedHashMap<String, String>();

    private ReceivedBlock(int id, String key, int meta, String displayName,
                          String blockClass, boolean derivedFromNeighbours, BlockPos pos) {
        this.id = id;
        this.key = key;
        this.meta = meta;
        this.displayName = displayName;
        this.blockClass = blockClass;
        this.derivedFromNeighbours = derivedFromNeighbours;
        this.pos = pos;
    }

    public static ReceivedBlock fromJson(JsonObject json) {
        BlockPos pos = null;
        if (json.has("position") && !json.get("position").isJsonNull()) {
            JsonObject p = json.getAsJsonObject("position");
            pos = new BlockPos(p.get("x").getAsInt(), p.get("y").getAsInt(), p.get("z").getAsInt());
        }

        ReceivedBlock block = new ReceivedBlock(
                json.get("id").getAsInt(),
                json.get("key").getAsString(),
                json.get("meta").getAsInt(),
                json.has("displayName") ? json.get("displayName").getAsString() : json.get("key").getAsString(),
                json.has("blockClass") ? json.get("blockClass").getAsString() : "",
                json.has("derivedFromNeighbours") && json.get("derivedFromNeighbours").getAsBoolean(),
                pos);

        if (json.has("properties") && json.get("properties").isJsonObject()) {
            for (Map.Entry<String, JsonElement> entry : json.getAsJsonObject("properties").entrySet()) {
                if (entry.getValue().isJsonNull()) continue;
                block.properties.put(entry.getKey(), entry.getValue().getAsString());
            }
        }
        return block;
    }

    /**
     * MysteryBlocks registered its blocks at the same ids the bridge sends, so
     * the id alone is enough to get the real block back on this client.
     */
    public Block resolveBlock() {
        Block block = Block.getBlockById(id);
        if (block == null || block == net.minecraft.init.Blocks.air) {
            // Fall back to the registry name in case the id space ever shifts
            block = Block.getBlockFromName(key);
        }
        return block;
    }

    /** The block state to render, rebuilt through MysteryBlocks' own getStateFromMeta. */
    public IBlockState resolveState() {
        Block block = resolveBlock();
        if (block == null) return null;
        try {
            return block.getStateFromMeta(meta);
        } catch (Exception e) {
            // Some classes throw on metadata they never produce; default is close enough
            return block.getDefaultState();
        }
    }

    /** For showing the block in a GUI / hotbar-style list. */
    public ItemStack resolveStack(int count) {
        Item item = Item.getItemById(id);
        if (item == null) {
            Block block = resolveBlock();
            if (block == null) return null;
            item = Item.getItemFromBlock(block);
        }
        return item == null ? null : new ItemStack(item, count, meta);
    }

    public boolean isResolvable() {
        return resolveState() != null;
    }

    public String describeProperties() {
        if (properties.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> entry : properties.entrySet()) {
            if (sb.length() > 0) sb.append(',');
            sb.append(entry.getKey()).append('=').append(entry.getValue());
        }
        return sb.toString();
    }
}
