import { DurableObject } from "cloudflare:workers";
import { MAX_PLAYERS, ROOM_CODE_PATTERN } from "../shared/constants";
import { LEVELS } from "../shared/level";
import {
  CLOSE_REPLACED,
  CLOSE_ROOM_FULL,
  type Acks,
  type ClientMessage,
  type ServerMessage,
} from "../shared/protocol";
import {
  addPlayer,
  chooseLevel,
  createGame,
  freePlayerSlot,
  IDLE_INPUT,
  removePlayer,
  startRound,
  SIM_STEP,
  stepGame,
  type PlayerInput,
} from "../shared/sim";

interface Env {
  ROOM: DurableObjectNamespace<Room>;
}

interface Seat {
  // Random id the browser tab keeps, so a reconnect can claim its old seat.
  cid: string;
  // Number of the connection that currently owns this seat.
  conn: number;
  // When the owner dropped, or null while it is connected.
  goneAt: number | null;
  input: PlayerInput;
  seq: number;
  steps: number;
}

interface Attachment {
  id: number;
  cid: string;
  conn: number;
}

const TICK_MS = 50;
const MAX_CATCH_UP_MS = 250;
// How long a dropped player's chef waits in place for them to come back.
const RESUME_GRACE_MS = 10_000;
const CID_PATTERN = /^[\w-]{8,64}$/;

const clampAxis = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
const round = (value: number): number => Math.round(value * 1000) / 1000;
const tileOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 4096 ? value : null;

// One instance per room code; it runs the authoritative game for that room.
export class Room extends DurableObject<Env> {
  private game = createGame(0, Date.now(), true);
  private seats = new Map<number, Seat>();
  private inputs: Record<number, PlayerInput> = {};
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private pending = 0;
  private nextConn = 1;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Sockets can outlive the object's memory, so give each one its seat back.
    for (const socket of ctx.getWebSockets()) {
      const attachment = this.attachmentOf(socket);
      if (!attachment) continue;
      this.seat(attachment.id, attachment.cid, attachment.conn);
      this.nextConn = Math.max(this.nextConn, attachment.conn + 1);
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const params = new URL(request.url).searchParams;
    // `?level=3` on the first connection opens a fresh room in that kitchen, for trying a level directly.
    const level = Number(params.get("level"));
    if (this.seats.size === 0 && this.game.phase === "waiting" && Number.isInteger(level) && level >= 1 && level <= LEVELS.length) {
      this.game = createGame(level - 1, Date.now(), true);
    }
    const requested = params.get("cid") ?? "";
    const cid = CID_PATTERN.test(requested) ? requested : crypto.randomUUID();
    const conn = this.nextConn++;
    const pair = new WebSocketPair();

    // A returning client takes its old seat back, kicking any stale socket still on it.
    let id = [...this.seats].find(([, seat]) => seat.cid === cid)?.[0] ?? null;
    if (id !== null) {
      const stale = this.socketOf(this.seats.get(id)!);
      if (stale) {
        // The close handshake can lag behind, so tell the old tab explicitly first.
        this.send(stale, { type: "replaced" });
        stale.close(CLOSE_REPLACED, "Replaced by a newer connection");
      }
    } else {
      id = freePlayerSlot(this.game, MAX_PLAYERS);
      if (id === null) {
        pair[1].accept();
        pair[1].close(CLOSE_ROOM_FULL, "Room is full");
        return new Response(null, { status: 101, webSocket: pair[0] });
      }
      this.seat(id, cid, conn);
    }

    const seat = this.seats.get(id)!;
    Object.assign(seat, { conn, goneAt: null, seq: 0, steps: 0 });
    Object.assign(seat.input, IDLE_INPUT);
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ id, cid, conn } satisfies Attachment);
    this.send(pair[1], { type: "welcome", id });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): void {
    const seat = this.ownedSeat(socket);
    if (!seat || typeof raw !== "string") return;

    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }
    if (message.type === "input") {
      seat.input.moveX = clampAxis(message.moveX);
      seat.input.moveZ = clampAxis(message.moveZ);
      seat.input.use = message.use === true;
      // A dash press must survive until the next step, even if another input message lands first.
      seat.input.dash ||= message.dash === true;
      seat.input.aim = tileOrNull(message.aim);
      seat.seq = Number.isSafeInteger(message.seq) ? message.seq : seat.seq;
      seat.steps = 0;
    } else if (message.type === "interact") {
      seat.input.interact = true;
      seat.input.aim = tileOrNull(message.aim);
    } else if (message.type === "level") {
      chooseLevel(this.game, Number(message.level));
    } else if (message.type === "start") {
      startRound(this.game);
    } else if (message.type === "ping" && typeof message.t === "number") {
      this.send(socket, { type: "pong", t: message.t });
    }
  }

  webSocketClose(socket: WebSocket): void {
    this.drop(socket);
  }

  webSocketError(socket: WebSocket): void {
    this.drop(socket);
  }

  private attachmentOf(socket: WebSocket): Attachment | null {
    const value = socket.deserializeAttachment() as Partial<Attachment> | null;
    return typeof value?.id === "number" && typeof value.cid === "string" && typeof value.conn === "number"
      ? (value as Attachment)
      : null;
  }

  // The seat this socket still owns; a replaced socket owns nothing.
  private ownedSeat(socket: WebSocket): Seat | null {
    const attachment = this.attachmentOf(socket);
    const seat = attachment ? this.seats.get(attachment.id) : undefined;
    return seat && seat.conn === attachment!.conn ? seat : null;
  }

  private socketOf(seat: Seat): WebSocket | null {
    return this.ctx.getWebSockets().find((socket) => this.attachmentOf(socket)?.conn === seat.conn) ?? null;
  }

  private seat(id: number, cid: string, conn: number): void {
    const seat: Seat = { cid, conn, goneAt: null, input: { ...IDLE_INPUT }, seq: 0, steps: 0 };
    this.seats.set(id, seat);
    this.inputs[id] = seat.input;
    addPlayer(this.game, id);
    if (this.timer === null) {
      this.lastTick = Date.now();
      this.pending = 0;
      this.timer = setInterval(() => this.tick(), TICK_MS);
    }
  }

  // Keeps the chef in the kitchen for a grace period instead of removing it at once.
  private drop(socket: WebSocket): void {
    const seat = this.ownedSeat(socket);
    if (!seat) return;
    seat.goneAt = Date.now();
    Object.assign(seat.input, IDLE_INPUT);
  }

  private tick(): void {
    const now = Date.now();
    for (const [id, seat] of this.seats) {
      if (seat.goneAt === null || now - seat.goneAt < RESUME_GRACE_MS) continue;
      this.seats.delete(id);
      delete this.inputs[id];
      removePlayer(this.game, id);
    }
    // An empty room stops ticking so the object can go idle, and starts fresh next time.
    if (this.seats.size === 0) {
      clearInterval(this.timer!);
      this.timer = null;
      this.game = createGame(0, now, true);
      return;
    }

    this.pending += Math.min(now - this.lastTick || TICK_MS, MAX_CATCH_UP_MS) / 1000;
    this.lastTick = now;
    while (this.pending >= SIM_STEP) {
      stepGame(this.game, this.inputs, SIM_STEP);
      for (const seat of this.seats.values()) {
        seat.input.interact = false;
        seat.input.dash = false;
        seat.steps += 1;
      }
      this.pending -= SIM_STEP;
    }

    const acks: Acks = {};
    for (const [id, seat] of this.seats) acks[id] = [seat.seq, seat.steps];
    const payload = JSON.stringify({
      ...this.game,
      type: "state",
      acks,
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
    try {
      socket.send(JSON.stringify(message));
    } catch {
      // The socket is already gone; its close event does the cleanup.
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
