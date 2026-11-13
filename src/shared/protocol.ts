import type { GameState } from "./sim";

// Close code the server uses when a room already has every seat taken.
export const CLOSE_ROOM_FULL = 4000;
// Close code for a socket whose seat was taken over by a newer connection from the same client.
export const CLOSE_REPLACED = 4001;

// Per player: the last input sequence the server applied, and how many steps it has run since.
export type Acks = Record<number, [seq: number, steps: number]>;

// Messages the server pushes to clients in a room.
export type ServerMessage =
  | { type: "welcome"; id: number }
  | ({ type: "state"; acks: Acks } & GameState)
  | { type: "pong"; t: number }
  // Sent just before the server drops a socket whose seat a newer connection took over.
  | { type: "replaced" };

// Messages a client sends to its room.
export type ClientMessage =
  | { type: "input"; seq: number; moveX: number; moveZ: number; use: boolean; aim: number | null; dash: boolean }
  | { type: "interact"; aim: number | null }
  | { type: "ping"; t: number };
