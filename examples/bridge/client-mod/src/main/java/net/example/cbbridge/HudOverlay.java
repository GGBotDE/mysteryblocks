package net.example.cbbridge;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.FontRenderer;
import net.minecraft.client.gui.ScaledResolution;
import net.minecraft.client.renderer.GlStateManager;
import net.minecraft.client.renderer.RenderHelper;
import net.minecraft.client.renderer.entity.RenderItem;
import net.minecraft.item.ItemStack;
import net.minecraftforge.client.event.RenderGameOverlayEvent;
import net.minecraftforge.fml.common.eventhandler.SubscribeEvent;

import java.util.List;

/**
 * Small corner overlay listing the custom items the bot reported, drawn with
 * MysteryBlocks' own item models.
 */
public class HudOverlay {

    private final ReceivedStore store;
    public boolean enabled = true;

    public HudOverlay(ReceivedStore store) {
        this.store = store;
    }

    @SubscribeEvent
    public void onRenderOverlay(RenderGameOverlayEvent.Post event) {
        if (!enabled) return;
        if (event.type != RenderGameOverlayEvent.ElementType.ALL) return;

        Minecraft mc = Minecraft.getMinecraft();
        List<ReceivedItem> items = store.getItems();
        if (items.isEmpty() && store.blockCount() == 0) return;

        ScaledResolution resolution = new ScaledResolution(mc);
        FontRenderer font = mc.fontRendererObj;
        RenderItem renderItem = mc.getRenderItem();

        int x = resolution.getScaledWidth() - 170;
        int y = 6;

        String header = "cb: " + store.blockCount() + " blocks, " + items.size() + " items";
        font.drawStringWithShadow(header, x, y, 0x55FFFF);
        y += 12;

        GlStateManager.enableRescaleNormal();
        RenderHelper.enableGUIStandardItemLighting();

        int shown = 0;
        for (ReceivedItem item : items) {
            if (shown++ >= 9) break;
            ItemStack stack = item.resolveStack();
            if (stack != null) {
                renderItem.renderItemAndEffectIntoGUI(stack, x, y);
                renderItem.renderItemOverlayIntoGUI(font, stack, x, y, null);
            }
            font.drawStringWithShadow(item.label(), x + 20, y + 4, 0xFFFFFF);
            y += 18;
        }

        RenderHelper.disableStandardItemLighting();
        GlStateManager.disableRescaleNormal();
    }
}
