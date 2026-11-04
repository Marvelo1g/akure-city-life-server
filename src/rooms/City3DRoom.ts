// src/rooms/City3DRoom.ts
// The 3D version of the Akure city room. It keeps track of who is in the city,
// where they are and which skin they wear, and passes chat messages on.

import { Room, Client, CloseCode } from "colyseus";
import { City3DState, Player3D } from "./schema/City3DState.js";

// The ground is 80 by 80 units, so players must stay within 38 units of the middle.
// This matches WORLD_HALF in the game's scene.ts.
const WORLD_HALF = 38;

// Where new players appear. This matches the start spot in the game's scene.ts.
const SPAWN_X = 0;
const SPAWN_Z = 8;

// The fastest a character can walk, in units per second. Matches WALK_SPEED in scene.ts.
const MAX_SPEED = 3.2;

// A walking player who has sent nothing for this long (in milliseconds) is shown standing still.
const IDLE_AFTER_MS = 1000;

// The longest chat message, and the shortest wait between two messages from one player.
const MAX_CHAT_LENGTH = 120;
const CHAT_COOLDOWN_MS = 700;

// The skins players may wear. Anything else is rejected.
const SKINS = ["skaterMaleA", "skaterFemaleA", "cyborgFemaleA"];

// What a player's phone sends each time it wants to say "I moved".
type MoveMessage = { x: number; z: number; rotation: number; moving: boolean };

// Keeps a number between a minimum and a maximum.
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Cleans up a name typed by a player: only text, no extra spaces, at most 16 letters.
function cleanName(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim().slice(0, 16);
  return trimmed.length > 0 ? trimmed : fallback;
}

export class City3DRoom extends Room<{ state: City3DState }> {
  // The most people allowed in this room at once.
  maxClients = 50;

  // The shared state. Colyseus sends it to every player automatically.
  state = new City3DState();

  // When we last heard from each player, and when each last chatted. Kept private on the server.
  private lastMoveAt = new Map<string, number>();
  private lastChatAt = new Map<string, number>();

  // Messages the server understands. The name on the left is the message type.
  messages = {
    // A player says "I am now here, facing this way".
    move: (client: Client, message: MoveMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      // Never trust what a phone sends. Check that every value is the right kind.
      if (
        typeof message?.x !== "number" ||
        typeof message?.z !== "number" ||
        typeof message?.rotation !== "number" ||
        !Number.isFinite(message.x) ||
        !Number.isFinite(message.z) ||
        !Number.isFinite(message.rotation)
      ) {
        return;
      }

      // How far could this player really have walked since we last heard from them?
      // We allow some extra room (1.5 times) for network delays. After a long silence the
      // allowance grows, so a player coming back from a bad signal is never stuck.
      const now = Date.now();
      const last = this.lastMoveAt.get(client.sessionId) ?? now;
      const seconds = Math.min((now - last) / 1000, 5);
      const maxStep = MAX_SPEED * seconds * 1.5 + 0.3;

      // Keep the new position inside the world.
      let newX = clamp(message.x, -WORLD_HALF, WORLD_HALF);
      let newZ = clamp(message.z, -WORLD_HALF, WORLD_HALF);

      // If it is further away than they could have walked, only move them as far as possible.
      // This stops teleport cheating.
      const dx = newX - player.x;
      const dz = newZ - player.z;
      const distance = Math.hypot(dx, dz);
      if (distance > maxStep) {
        const scale = maxStep / distance;
        newX = player.x + dx * scale;
        newZ = player.z + dz * scale;
      }

      // Save the checked values and remember when we heard them.
      player.x = newX;
      player.z = newZ;
      player.rotation = message.rotation;
      player.moving = message.moving === true;
      this.lastMoveAt.set(client.sessionId, now);
    },

    // A player says something. We check it, then pass it on to everyone in the room.
    chat: (client: Client, message: { text?: unknown }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      // Only text is allowed.
      if (typeof message?.text !== "string") return;

      // Remove hidden control characters, trim spaces, and cut it to the length limit.
      const text = message.text
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, MAX_CHAT_LENGTH);
      if (text.length === 0) return;

      // Ignore messages that come too fast after the last one.
      const now = Date.now();
      const last = this.lastChatAt.get(client.sessionId) ?? 0;
      if (now - last < CHAT_COOLDOWN_MS) return;
      this.lastChatAt.set(client.sessionId, now);

      // Send it to everyone, using the name the server holds, not one the phone claims.
      this.broadcast("chat", { id: client.sessionId, name: player.name, text });
    },

    // A player changes the skin their character wears.
    skin: (client: Client, message: { skin?: unknown }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (typeof message?.skin === "string" && SKINS.includes(message.skin)) {
        player.skin = message.skin;
      }
    },
  };

  // Runs once when the room is created.
  onCreate() {
    // Twice a second, mark players we have not heard from as standing still.
    this.setSimulationInterval(() => {
      const now = Date.now();
      this.state.players.forEach((player, sessionId) => {
        const last = this.lastMoveAt.get(sessionId) ?? now;
        if (player.moving && now - last > IDLE_AFTER_MS) {
          player.moving = false;
        }
      });
    }, 500);
  }

  // Runs when someone joins the room.
  onJoin(client: Client, options: { name?: string; skin?: string }) {
    const player = new Player3D();
    // If they did not give a name, call them Guest plus the last 4 characters of their id.
    player.name = cleanName(options?.name, `Guest${client.sessionId.slice(-4)}`);
    player.skin = options?.skin && SKINS.includes(options.skin) ? options.skin : SKINS[0];
    player.x = SPAWN_X;
    player.z = SPAWN_Z;

    // Add them to the shared list. Everyone in the room now sees them.
    this.state.players.set(client.sessionId, player);
    this.lastMoveAt.set(client.sessionId, Date.now());
    console.log(`${player.name} joined the 3D city (${client.sessionId}). Players: ${this.state.players.size}`);
  }

  // Runs when someone leaves or loses connection.
  onLeave(client: Client, code: CloseCode) {
    this.state.players.delete(client.sessionId);
    this.lastMoveAt.delete(client.sessionId);
    this.lastChatAt.delete(client.sessionId);
    console.log(`${client.sessionId} left the 3D city (code ${code}). Players: ${this.state.players.size}`);
  }

  // Runs when the room closes, which happens when the last player leaves.
  onDispose() {
    console.log("3D room", this.roomId, "closed");
  }
}