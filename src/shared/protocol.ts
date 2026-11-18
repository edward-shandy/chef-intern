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
  | { type: "replaced" }
  // A voice-chat signalling message (an SDP offer/answer or an ICE candidate) relayed from another chef.
  | { type: "rtc"; from: number; data: unknown };

// Messages a client sends to its room.
export type ClientMessage =
  | { type: "input"; seq: number; moveX: number; moveZ: number; use: boolean; aim: number | null; dash: boolean }
  | { type: "interact"; aim: number | null }
  | { type: "start" }
  // This chef has closed the kitchen briefing and is ready for the clock to start.
  | { type: "ready" }
  // Picks the kitchen while the room is still in its lobby; `level` is an index into LEVELS.
  | { type: "level"; level: number }
  // What this chef wants to be called; the server trims it.
  | { type: "name"; name: string }
  // Which chef this player wants to be, by id from CHARACTERS.
  | { type: "character"; character: string }
  | { type: "ping"; t: number }
  // Joins or leaves the crew's voice chat; chefs in it connect to each other directly.
  | { type: "voice"; on: boolean }
  // A voice-chat signalling message for one other chef, which the server passes on untouched.
  | { type: "rtc"; to: number; data: unknown };

// Largest signalling message the server will relay; an SDP offer is a few kilobytes.
export const MAX_RTC_MESSAGE = 16_000;
