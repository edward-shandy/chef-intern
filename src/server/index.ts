import { DurableObject } from "cloudflare:workers";
import { MAX_PLAYERS, ROOM_CODE_PATTERN } from "../shared/constants";
import { KITCHEN_01 } from "../shared/level";
import { CLOSE_ROOM_FULL, type ClientMessage, type ServerMessage } from "../shared/protocol";
import {
  addPlayer,
  createGame,
  freePlayerSlot,
  removePlayer,
  SIM_STEP,
  stepGame,
  type PlayerInput,
} from "../shared/sim";

interface Env {
  ROOM: DurableObjectNamespace<Room>;
}

const TICK_MS = 50;
const MAX_CATCH_UP_MS = 250;

const clampAxis = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
const round = (value: number): number => Math.round(value * 1000) / 1000;

// One instance per room code; it runs the authoritative game for that room.
export class Room extends DurableObject<Env> {
  private readonly level = KITCHEN_01;
  private game = createGame(this.level, Date.now());
  private inputs: Record<number, PlayerInput> = {};
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private pending = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Sockets can outlive the object's memory, so give each one its seat back.
    for (const socket of ctx.getWebSockets()) {
      const id = this.seatOf(socket);
      if (id !== null) this.seat(id);
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const id = freePlayerSlot(this.game, MAX_PLAYERS);

    if (id === null) {
      pair[1].accept();
      pair[1].close(CLOSE_ROOM_FULL, "Room is full");
    } else {
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment({ id });
      this.seat(id);
      this.send(pair[1], { type: "welcome", id });
    }
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): void {
    const id = this.seatOf(socket);
    const input = id === null ? undefined : this.inputs[id];
    if (!input || typeof raw !== "string") return;

    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }
    if (message.type === "input") {
      input.moveX = clampAxis(message.moveX);
      input.moveZ = clampAxis(message.moveZ);
      input.use = message.use === true;
    } else if (message.type === "interact") {
      input.interact = true;
    }
  }

  webSocketClose(socket: WebSocket): void {
    this.unseat(socket);
  }

  webSocketError(socket: WebSocket): void {
    this.unseat(socket);
  }

  private seatOf(socket: WebSocket): number | null {
    const attachment = socket.deserializeAttachment() as { id?: unknown } | null;
    return typeof attachment?.id === "number" ? attachment.id : null;
  }

  private seat(id: number): void {
    addPlayer(this.level, this.game, id);
    this.inputs[id] = { moveX: 0, moveZ: 0, use: false, interact: false };
    if (this.timer === null) {
      this.lastTick = Date.now();
      this.pending = 0;
      this.timer = setInterval(() => this.tick(), TICK_MS);
    }
  }

  private unseat(socket: WebSocket): void {
    const id = this.seatOf(socket);
    if (id === null || !this.inputs[id]) return;
    removePlayer(this.game, id);
    delete this.inputs[id];

    // An empty room stops ticking so the object can go idle, and starts fresh next time.
    if (this.game.players.length === 0 && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
      this.game = createGame(this.level, Date.now());
    }
  }

  private tick(): void {
    const now = Date.now();
    this.pending += Math.min(now - this.lastTick || TICK_MS, MAX_CATCH_UP_MS) / 1000;
    this.lastTick = now;

    while (this.pending >= SIM_STEP) {
      stepGame(this.level, this.game, this.inputs, SIM_STEP);
      for (const input of Object.values(this.inputs)) input.interact = false;
      this.pending -= SIM_STEP;
    }

    const payload = JSON.stringify({
      ...this.game,
      type: "state",
      players: this.game.players.map((player) => ({
        ...player,
        x: round(player.x),
        z: round(player.z),
        vx: round(player.vx),
        vz: round(player.vz),
        facing: round(player.facing),
      })),
    } satisfies ServerMessage);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        // A socket that died mid-broadcast gets cleaned up by its own close event.
      }
    }
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    socket.send(JSON.stringify(message));
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
