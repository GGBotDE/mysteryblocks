package net.example.cbbridge;

import com.google.gson.JsonObject;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;

/** One custom item described by a bridge frame. */
public class ReceivedItem {

    public final int id;
    public final String key;
    public final String displayName;
    public final String customName;
    public final int count;
    public final int damage;
    public final int slot;
    public final String replacement;
    /** Player or entity carrying this, when it came from an entity_items frame. */
    public final String holder;
    /** hand, boots, leggings, chestplate or helmet. Null for inventory items. */
    public final String equipmentSlot;

    private ReceivedItem(int id, String key, String displayName, String customName,
                         int count, int damage, int slot, String replacement,
                         String holder, String equipmentSlot) {
        this.id = id;
        this.key = key;
        this.displayName = displayName;
        this.customName = customName;
        this.count = count;
        this.damage = damage;
        this.slot = slot;
        this.replacement = replacement;
        this.holder = holder;
        this.equipmentSlot = equipmentSlot;
    }

    public static ReceivedItem fromJson(JsonObject json) {
        return fromJson(json, null, null);
    }

    /**
     * Parse one item, optionally tagged with who is carrying it.
     *
     * Entity items arrive wrapped in an envelope that carries the holder and the
     * equipment slot, so those are passed in rather than read off the item.
     */
    public static ReceivedItem fromJson(JsonObject json, String holder, String equipmentSlot) {
        return new ReceivedItem(
                json.get("id").getAsInt(),
                json.get("key").getAsString(),
                str(json, "displayName", json.get("key").getAsString()),
                str(json, "customName", null),
                json.has("count") ? json.get("count").getAsInt() : 1,
                json.has("damage") ? json.get("damage").getAsInt() : 0,
                json.has("slot") ? json.get("slot").getAsInt() : -1,
                str(json, "replacement", null),
                holder,
                equipmentSlot);
    }

    /** Parse the { entityId, username, slot, item } envelope of an entity_items frame. */
    public static ReceivedItem fromEntityJson(JsonObject envelope) {
        String holder = str(envelope, "username", null);
        if (holder == null) holder = str(envelope, "entityType", "entity " + envelope.get("entityId").getAsInt());
        return fromJson(envelope.getAsJsonObject("item"), holder, str(envelope, "slot", null));
    }

    private static String str(JsonObject json, String field, String fallback) {
        if (!json.has(field) || json.get(field).isJsonNull()) return fallback;
        return json.get(field).getAsString();
    }

    /** Rebuild the stack from MysteryBlocks' own item registry. */
    public ItemStack resolveStack() {
        Item item = Item.getItemById(id);
        if (item == null) item = Item.getByNameOrId(key);
        if (item == null) return null;
        ItemStack stack = new ItemStack(item, count, damage);
        if (customName != null) stack.setStackDisplayName(customName);
        return stack;
    }

    public String label() {
        String name = customName != null ? customName : displayName;
        return holder == null ? name : holder + " §7[" + equipmentSlot + "] §r" + name;
    }
}
