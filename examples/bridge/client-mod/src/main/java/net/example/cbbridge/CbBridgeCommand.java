package net.example.cbbridge;

import net.minecraft.command.CommandBase;
import net.minecraft.command.CommandException;
import net.minecraft.command.ICommandSender;

import java.util.Arrays;
import java.util.List;

/**
 * /cbbridge connect &lt;host&gt; [port] [token]
 * /cbbridge disconnect
 * /cbbridge scan [radius]
 * /cbbridge inventory
 * /cbbridge carried [radius]
 * /cbbridge clear
 * /cbbridge status
 */
public class CbBridgeCommand extends CommandBase {

    @Override
    public String getCommandName() {
        return "cbbridge";
    }

    @Override
    public String getCommandUsage(ICommandSender sender) {
        return "/cbbridge <connect|disconnect|scan|inventory|carried|clear|status>";
    }

    @Override
    public int getRequiredPermissionLevel() {
        return 0;
    }

    @Override
    public List<String> getCommandAliases() {
        return Arrays.asList("cbb");
    }

    @Override
    public void processCommand(ICommandSender sender, String[] args) throws CommandException {
        if (args.length == 0) {
            CbBridgeMod.chat(getCommandUsage(sender));
            return;
        }

        String sub = args[0].toLowerCase();

        if ("connect".equals(sub)) {
            String host = args.length > 1 ? args[1] : "127.0.0.1";
            int port = args.length > 2 ? parseInt(args[2]) : 25600;
            String token = args.length > 3 ? args[3] : null;
            CbBridgeMod.connect(host, port, token);
            CbBridgeMod.chat("connecting to " + host + ":" + port + " ...");
            return;
        }

        if ("disconnect".equals(sub)) {
            CbBridgeMod.disconnect();
            CbBridgeMod.chat("disconnected");
            return;
        }

        BridgeConnection connection = CbBridgeMod.getConnection();

        if ("scan".equals(sub)) {
            if (connection == null) {
                CbBridgeMod.chat("§cnot connected");
                return;
            }
            int radius = args.length > 1 ? parseInt(args[1]) : 24;
            connection.requestScan(radius, 2048);
            CbBridgeMod.chat("asked the bot to scan " + radius + " blocks around itself");
            return;
        }

        if ("inventory".equals(sub)) {
            if (connection == null) {
                CbBridgeMod.chat("§cnot connected");
                return;
            }
            connection.requestInventory();
            return;
        }

        if ("carried".equals(sub)) {
            if (connection == null) {
                CbBridgeMod.chat("§cnot connected");
                return;
            }
            int radius = args.length > 1 ? parseInt(args[1]) : 32;
            connection.requestEntityItems(radius);
            CbBridgeMod.chat("asked what players within " + radius + " blocks are carrying");
            return;
        }

        if ("clear".equals(sub)) {
            CbBridgeMod.getStore().clear();
            CbBridgeMod.chat("cleared");
            return;
        }

        if ("status".equals(sub)) {
            CbBridgeMod.chat(connection == null
                    ? "not connected"
                    : connection.getStatus() + ", registry " + connection.getRemoteRegistryHash()
                        + ", " + CbBridgeMod.getStore().blockCount() + " blocks held");
            return;
        }

        CbBridgeMod.chat(getCommandUsage(sender));
    }
}
