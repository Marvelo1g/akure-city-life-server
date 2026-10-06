// src/rooms/schema/CityState.ts
// The "state" is the information the server keeps and automatically shares with every player.
// Whenever a value here changes, Colyseus sends only the change to everyone in the room.

import { schema, t, type SchemaType } from "@colyseus/schema";

// One player in the city.
export const Player = schema({
  name: t.string().default("Guest"), // the name shown above the character
  x: t.number().default(0), // position on the map in pixels, left to right
  y: t.number().default(0), // position on the map in pixels, top to bottom
  facing: t.string().default("down"), // "left", "down", "up" or "right"
  moving: t.boolean().default(false), // true while the character is walking
});
// This line lets TypeScript use "Player" as a type name too.
export type Player = SchemaType<typeof Player>;

// Everything the room shares: a list of players, looked up by their session id.
// A session id is a short unique code Colyseus gives each connected person.
export const CityState = schema({
  players: t.map(Player),
});
export type CityState = SchemaType<typeof CityState>;