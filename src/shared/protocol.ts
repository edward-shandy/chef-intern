import type { GameState } from "./sim";

// Close code the server uses when a room already has every seat taken.
export const CLOSE_ROOM_FULL = 4000;

// Messages the server pushes to clients in a room.
export type ServerMessage =
  | { type: "welcome"; id: number }
  | ({ type: "state" } & GameState);

// Messages a client sends to its room.
export type ClientMessage =
  | { type: "input"; moveX: number; moveZ: number; use: boolean }
  | { type: "interact" };
