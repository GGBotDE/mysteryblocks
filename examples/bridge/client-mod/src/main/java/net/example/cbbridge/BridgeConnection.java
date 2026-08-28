package net.example.cbbridge;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * Reads newline-delimited JSON frames from the mineflayer bridge on a
 * background thread and hands them to the client thread through a queue.
 *
 * Gson ships with Minecraft, so this needs no extra dependency.
 */
public class BridgeConnection extends Thread {

    private static final int WIRE_VERSION = 1;
    /** Must match the sender's registry, otherwise the ids mean something else. */
    private static final Gson GSON = new Gson();

    private final String host;
    private final int port;
    private final String token;

    private final ConcurrentLinkedQueue<JsonObject> inbox = new ConcurrentLinkedQueue<JsonObject>();
    private volatile boolean running = true;
    private volatile Socket socket;
    private volatile Writer writer;
    private volatile String status = "disconnected";
    private volatile String remoteRegistryHash = null;

    public BridgeConnection(String host, int port, String token) {
        super("cb-reader");
        setDaemon(true);
        this.host = host;
        this.port = port;
        this.token = token;
    }

    @Override
    public void run() {
        while (running) {
            try {
                status = "connecting";
                Socket s = new Socket();
                s.connect(new InetSocketAddress(host, port), 5000);
                s.setTcpNoDelay(true);
                socket = s;
                writer = new OutputStreamWriter(s.getOutputStream(), StandardCharsets.UTF_8);

                if (token != null && !token.isEmpty()) {
                    JsonObject auth = new JsonObject();
                    auth.addProperty("kind", "auth");
                    auth.addProperty("token", token);
                    send(auth);
                }

                status = "connected";
                CbBridgeMod.chat("connected to " + host + ":" + port);

                BufferedReader reader = new BufferedReader(
                        new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
                String line;
                while (running && (line = reader.readLine()) != null) {
                    if (line.trim().isEmpty()) continue;
                    try {
                        JsonElement parsed = new JsonParser().parse(line);
                        if (!parsed.isJsonObject()) continue;
                        JsonObject frame = parsed.getAsJsonObject();
                        if (!frame.has("v") || frame.get("v").getAsInt() != WIRE_VERSION) continue;
                        inbox.add(frame);
                    } catch (Exception parseError) {
                        System.err.println("[cb] bad frame: " + parseError.getMessage());
                    }
                }
            } catch (Exception e) {
                status = "error: " + e.getMessage();
            } finally {
                closeSocket();
            }

            if (!running) break;
            status = "reconnecting in 5s";
            try {
                Thread.sleep(5000);
            } catch (InterruptedException ignored) {
                break;
            }
        }
        status = "disconnected";
    }

    /** Called once per client tick, where it is safe to touch world and render state. */
    public void drainInto(ReceivedStore store) {
        JsonObject frame;
        while ((frame = inbox.poll()) != null) {
            handle(frame, store);
        }
    }

    private void handle(JsonObject frame, ReceivedStore store) {
        String kind = frame.has("kind") ? frame.get("kind").getAsString() : "";

        if ("hello".equals(kind)) {
            remoteRegistryHash = frame.has("registryHash") ? frame.get("registryHash").getAsString() : null;
            CbBridgeMod.chat("sender registry " + shortHash(remoteRegistryHash)
                    + ", MysteryBlocks protocol " + frame.get("cbProtocol").getAsInt());
            return;
        }

        if ("block".equals(kind)) {
            if (frame.get("block").isJsonNull()) return;
            store.put(ReceivedBlock.fromJson(frame.getAsJsonObject("block")));
            return;
        }

        if ("snapshot".equals(kind)) {
            JsonArray blocks = frame.getAsJsonArray("blocks");
            store.beginBatch();
            for (JsonElement element : blocks) {
                store.put(ReceivedBlock.fromJson(element.getAsJsonObject()));
            }
            store.endBatch();
            CbBridgeMod.chat("received " + blocks.size() + " blocks"
                    + (frame.has("label") && !frame.get("label").isJsonNull()
                        ? " (" + frame.get("label").getAsString() + ")" : ""));
            return;
        }

        if ("item".equals(kind)) {
            store.putItem(ReceivedItem.fromJson(frame.getAsJsonObject("item")));
            return;
        }

        if ("entity_items".equals(kind)) {
            store.clearEntityItems();
            for (JsonElement element : frame.getAsJsonArray("items")) {
                store.putItem(ReceivedItem.fromEntityJson(element.getAsJsonObject()));
            }
            return;
        }

        if ("inventory".equals(kind)) {
            store.clearItems();
            for (JsonElement element : frame.getAsJsonArray("items")) {
                store.putItem(ReceivedItem.fromJson(element.getAsJsonObject()));
            }
            return;
        }

        if ("error".equals(kind)) {
            CbBridgeMod.chat("§cremote error: " + frame.get("error").getAsString());
        }
    }

    public void send(JsonObject message) {
        Writer w = writer;
        if (w == null) return;
        try {
            w.write(GSON.toJson(message));
            w.write("\n");
            w.flush();
        } catch (Exception e) {
            System.err.println("[cb] send failed: " + e.getMessage());
        }
    }

    /** Ask the bot to scan its surroundings and send back everything it finds. */
    public void requestScan(int radius, int limit) {
        JsonObject request = new JsonObject();
        request.addProperty("kind", "scan");
        request.addProperty("radius", radius);
        request.addProperty("limit", limit);
        send(request);
    }

    public void requestInventory() {
        JsonObject request = new JsonObject();
        request.addProperty("kind", "get_inventory");
        send(request);
    }

    /** Ask the bot what nearby players are holding and wearing. */
    public void requestEntityItems(int radius) {
        JsonObject request = new JsonObject();
        request.addProperty("kind", "get_entity_items");
        request.addProperty("radius", radius);
        send(request);
    }

    public void shutdown() {
        running = false;
        closeSocket();
        interrupt();
    }

    private void closeSocket() {
        Socket s = socket;
        socket = null;
        writer = null;
        if (s != null) {
            try {
                s.close();
            } catch (Exception ignored) {
            }
        }
    }

    public String getStatus() {
        return status;
    }

    public String getRemoteRegistryHash() {
        return remoteRegistryHash;
    }

    private static String shortHash(String hash) {
        return hash == null ? "?" : hash.substring(0, Math.min(8, hash.length()));
    }
}
