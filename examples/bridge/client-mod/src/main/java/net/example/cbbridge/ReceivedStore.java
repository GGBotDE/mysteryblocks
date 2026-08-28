package net.example.cbbridge;

import net.minecraft.util.BlockPos;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Everything the bridge has told us about, keyed by position.
 * Only touched from the client thread (BridgeConnection#drainInto).
 */
public class ReceivedStore {

    private final Map<BlockPos, ReceivedBlock> blocks = new LinkedHashMap<BlockPos, ReceivedBlock>();
    private final List<ReceivedItem> items = new ArrayList<ReceivedItem>();
    private boolean batching = false;
    private boolean dirty = false;

    public void put(ReceivedBlock block) {
        if (block.pos == null) return;
        blocks.put(block.pos, block);
        dirty = true;
    }

    public void putItem(ReceivedItem item) {
        items.add(item);
    }

    public void beginBatch() {
        batching = true;
    }

    public void endBatch() {
        batching = false;
        dirty = true;
    }

    public boolean isBatching() {
        return batching;
    }

    public Collection<ReceivedBlock> getBlocks() {
        return blocks.values();
    }

    public List<ReceivedItem> getItems() {
        return items;
    }

    public int blockCount() {
        return blocks.size();
    }

    public void clear() {
        blocks.clear();
        items.clear();
        dirty = true;
    }

    public void clearItems() {
        items.clear();
    }

    /** Drop only the items that came from an entity, keeping the bot's own inventory. */
    public void clearEntityItems() {
        for (int i = items.size() - 1; i >= 0; i--) {
            if (items.get(i).holder != null) items.remove(i);
        }
    }

    public boolean consumeDirty() {
        boolean was = dirty;
        dirty = false;
        return was;
    }
}
