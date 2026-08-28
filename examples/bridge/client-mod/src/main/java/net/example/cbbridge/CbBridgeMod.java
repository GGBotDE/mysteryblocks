package net.example.cbbridge;

import net.minecraft.client.Minecraft;
import net.minecraftforge.client.ClientCommandHandler;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.common.event.FMLInitializationEvent;
import net.minecraftforge.fml.common.event.FMLPreInitializationEvent;
import net.minecraftforge.fml.common.gameevent.TickEvent;
import net.minecraftforge.fml.common.eventhandler.SubscribeEvent;

/**
 * Receiver side of the cb.
 *
 * Connects to a mineflayer bot running mineflayer-cb, reads the JSON
 * frames it sends, and renders the MysteryBlocks blocks/items they describe.
 *
 * This mod contains no MysteryBlocks assets. It requires MysteryBlocks to be
 * installed on this client: the bridge sends the numeric block id, which is the
 * id MysteryBlocks registered the block under (2500 + offset), so
 * Block.getBlockById(id) returns the real block with its real model.
 */
@Mod(
    modid = CbBridgeMod.MOD_ID,
    name = "CustomBlocks Bridge",
    version = "1.0.0",
    clientSideOnly = true,
    acceptedMinecraftVersions = "[1.8.9]",
    dependencies = "required-after:mysterymod_customblocks"
)
public class CbBridgeMod {

    public static final String MOD_ID = "cbbridge";

    private static BridgeConnection connection;
    private static final ReceivedStore store = new ReceivedStore();
    private static GhostRenderer renderer;

    @Mod.EventHandler
    public void preInit(FMLPreInitializationEvent event) {
        renderer = new GhostRenderer(store);
    }

    @Mod.EventHandler
    public void init(FMLInitializationEvent event) {
        MinecraftForge.EVENT_BUS.register(renderer);
        MinecraftForge.EVENT_BUS.register(new HudOverlay(store));
        MinecraftForge.EVENT_BUS.register(this);
        ClientCommandHandler.instance.registerCommand(new CbBridgeCommand());
    }

    /** Frames arrive on the socket thread; apply them on the client thread. */
    @SubscribeEvent
    public void onClientTick(TickEvent.ClientTickEvent event) {
        if (event.phase != TickEvent.Phase.END) return;
        if (connection != null) connection.drainInto(store);
    }

    public static ReceivedStore getStore() {
        return store;
    }

    public static void connect(String host, int port, String token) {
        disconnect();
        connection = new BridgeConnection(host, port, token);
        connection.start();
    }

    public static void disconnect() {
        if (connection != null) {
            connection.shutdown();
            connection = null;
        }
        store.clear();
    }

    public static BridgeConnection getConnection() {
        return connection;
    }

    public static void chat(String message) {
        Minecraft mc = Minecraft.getMinecraft();
        if (mc.thePlayer != null) {
            mc.thePlayer.addChatMessage(new net.minecraft.util.ChatComponentText("§b[cb] §r" + message));
        }
        System.out.println("[cb] " + message);
    }
}
