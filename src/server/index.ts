import { DurableObject } from "cloudflare:workers";
import { MAX_PLAYERS, ROOM_CODE_PATTERN } from "../shared/constants";
import type { ServerMessage } from "../shared/protocol";

interface Env {
  ROOM: DurableObjectNamespace<Room>;
}

// One instance per room code; it owns every player socket in that room.
export class Room extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    if (this.ctx.getWebSockets().length >= MAX_PLAYERS) {
      return new Response("Room is full", { status: 409 });
    }

    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  webSocketClose(ws: WebSocket): void {
    this.broadcastPresence(ws);
  }

  webSocketError(ws: WebSocket): void {
    this.broadcastPresence(ws);
  }

  // The closing socket is still listed while its close handler runs, so skip it.
  private broadcastPresence(leaving?: WebSocket): void {
    const sockets = this.ctx.getWebSockets().filter((s) => s !== leaving);
    const message: ServerMessage = { type: "presence", online: sockets.length };
    const payload = JSON.stringify(message);
    for (const socket of sockets) {
      try {
        socket.send(payload);
      } catch {
        // A socket that died mid-broadcast gets cleaned up by its own close event.
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const code = pathname.startsWith("/ws/") ? pathname.slice(4).toUpperCase() : "";
    if (!ROOM_CODE_PATTERN.test(code)) {
      return new Response("Not found", { status: 404 });
    }
    return env.ROOM.get(env.ROOM.idFromName(code)).fetch(request);
  },
} satisfies ExportedHandler<Env>;
