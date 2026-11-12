// Messages the server pushes to every client in a room.
export type ServerMessage = { type: "presence"; online: number };

// Messages a client sends to its room.
export type ClientMessage = { type: "ping" };
