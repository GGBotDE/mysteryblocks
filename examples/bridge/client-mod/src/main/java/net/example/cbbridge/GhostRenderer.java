package net.example.cbbridge;

import net.minecraft.block.state.IBlockState;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.BlockRendererDispatcher;
import net.minecraft.client.renderer.GlStateManager;
import net.minecraft.client.renderer.Tessellator;
import net.minecraft.client.renderer.WorldRenderer;
import net.minecraft.client.renderer.texture.TextureMap;
import net.minecraft.client.renderer.vertex.DefaultVertexFormats;
import net.minecraft.client.resources.model.IBakedModel;
import net.minecraft.entity.Entity;
import net.minecraft.util.BlockPos;
import net.minecraftforge.client.event.RenderWorldLastEvent;
import net.minecraftforge.fml.common.eventhandler.SubscribeEvent;
import org.lwjgl.opengl.GL11;

/**
 * Draws the custom blocks the bridge sent us as translucent ghosts in the world.
 *
 * The models come from MysteryBlocks; this mod ships no assets of its own.
 * Block.getBlockById(id) returns the mod's VersionBlock, and the client's model
 * manager already has its baked model loaded.
 */
public class GhostRenderer {

    private static final float ALPHA = 0.65f;

    private final ReceivedStore store;
    public boolean enabled = true;

    public GhostRenderer(ReceivedStore store) {
        this.store = store;
    }

    @SubscribeEvent
    public void onRenderWorldLast(RenderWorldLastEvent event) {
        if (!enabled || store.blockCount() == 0 || store.isBatching()) return;

        Minecraft mc = Minecraft.getMinecraft();
        if (mc.theWorld == null || mc.getRenderViewEntity() == null) return;

        Entity view = mc.getRenderViewEntity();
        float partial = event.partialTicks;
        double viewX = view.lastTickPosX + (view.posX - view.lastTickPosX) * partial;
        double viewY = view.lastTickPosY + (view.posY - view.lastTickPosY) * partial;
        double viewZ = view.lastTickPosZ + (view.posZ - view.lastTickPosZ) * partial;

        BlockRendererDispatcher dispatcher = mc.getBlockRendererDispatcher();
        Tessellator tessellator = Tessellator.getInstance();
        WorldRenderer worldRenderer = tessellator.getWorldRenderer();

        GlStateManager.pushMatrix();
        GlStateManager.disableLighting();
        GlStateManager.enableBlend();
        GlStateManager.tryBlendFuncSeparate(
                GL11.GL_SRC_ALPHA, GL11.GL_ONE_MINUS_SRC_ALPHA, GL11.GL_ONE, GL11.GL_ZERO);
        GlStateManager.color(1.0f, 1.0f, 1.0f, ALPHA);
        GlStateManager.enableTexture2D();
        mc.getTextureManager().bindTexture(TextureMap.locationBlocksTexture);
        // Ghosts should not be hidden by, nor hide, real geometry
        GlStateManager.depthMask(false);

        worldRenderer.begin(GL11.GL_QUADS, DefaultVertexFormats.BLOCK);
        worldRenderer.setTranslation(-viewX, -viewY, -viewZ);

        int drawn = 0;
        for (ReceivedBlock received : store.getBlocks()) {
            IBlockState state = received.resolveState();
            if (state == null) continue;

            BlockPos pos = received.pos;
            if (pos.distanceSq(view.posX, view.posY, view.posZ) > 128 * 128) continue;

            try {
                // Let MysteryBlocks resolve neighbour-dependent shape against the
                // real world, so fences/tables/counters connect the same way they
                // would if the block were actually there.
                IBlockState actual = state.getBlock().getActualState(state, mc.theWorld, pos);
                IBakedModel model = dispatcher.getModelFromBlockState(actual, mc.theWorld, pos);
                dispatcher.getBlockModelRenderer()
                        .renderModel(mc.theWorld, model, actual, pos, worldRenderer, false);
                drawn++;
            } catch (Exception e) {
                // One bad block should not abort the whole frame
                if (drawn == 0) System.err.println("[cb] render failed for " + received.key
                        + ": " + e.getClass().getSimpleName());
            }
        }

        worldRenderer.setTranslation(0, 0, 0);
        tessellator.draw();

        GlStateManager.depthMask(true);
        GlStateManager.color(1.0f, 1.0f, 1.0f, 1.0f);
        GlStateManager.disableBlend();
        GlStateManager.enableLighting();
        GlStateManager.popMatrix();
    }
}
