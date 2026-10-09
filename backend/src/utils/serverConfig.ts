import type { Server } from "http";
import prisma from "@root/prisma.js";
import { closeBrowser } from "./browserPool.js";

export function configureServerTimeouts(server: Server) {
  server.keepAliveTimeout = Number(process.env.KEEP_ALIVE_TIMEOUT_MS ?? 65000);
  server.headersTimeout = Number(process.env.HEADERS_TIMEOUT_MS ?? 66000);
  server.requestTimeout = Number(process.env.REQUEST_TIMEOUT_MS ?? 0);
}

export function registerServerLifecycle(server: Server) {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Server] Received ${signal}. Starting graceful shutdown...`);

    server.close(async () => {
      try {
        // Chromium is a child process — without this it survives the restart.
        await closeBrowser();
        await prisma.$disconnect();
        console.log("[Server] Graceful shutdown complete.");
        process.exit(0);
      } catch (error) {
        console.error("[Server] Error during Prisma disconnect:", error);
        process.exit(1);
      }
    });

    setTimeout(
      () => {
        console.error("[Server] Graceful shutdown timed out. Exiting forcefully.");
        process.exit(1);
      },
      Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 15_000),
    ).unref();
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[Server] Unhandled promise rejection:", reason);
  });

  process.on("uncaughtException", (error) => {
    console.error("[Server] Uncaught exception:", error);
    void shutdown("uncaughtException");
  });
}
