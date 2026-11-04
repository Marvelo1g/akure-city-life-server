// src/rooms/schema/City3DState.ts
// The shared information for the 3D city. Colyseus sends every change in here
// to all players automatically.

import { schema, t, type SchemaType } from "@colyseus/schema";

// One player in the 3D city.
export const Player3D = schema({
  name: t.string().default("Guest"), // the name shown above the character
  skin: t.string().default("skaterMaleA"), // which skin picture the character wears
  x: t.number().default(0), // position on the ground, left to right
  z: t.number().default(0), // position on the ground, front to back
  rotation: t.number().default(0), // which way the character faces, in radians
  moving: t.boolean().default(false), // true while the character is walking
});
export type Player3D = SchemaType<typeof Player3D>;

// Everyone in the city, looked up by their session id.
export const City3DState = schema({
  players: t.map(Player3D),
});
export type City3DState = SchemaType<typeof City3DState>;