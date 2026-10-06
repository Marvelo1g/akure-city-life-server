// src/rooms/CityRoom.ts
// A "room" is one shared space that players join together.
// This is the Akure city room: it keeps track of who is in the city and where they are.

import { Room, Client, CloseCode } from "colyseus";
import { CityState, Player } from "./schema/CityState.js";

// The size of the map in pixels. Change these when the real FUTA map replaces the test map.
const MAP_WIDTH = 480;
const MAP_HEIGHT = 320;

// Where new players appear, in pixels. This is the same spot as in the single player game.
const SPAWN_X = 88;
const SPAWN_Y = 264;

// The fastest a character can walk, in pixels per second.
// This must match SPEED in the game's BootScene.ts.
const MAX_SPEED = 70;

// A walking player who has sent nothing for this long (in milliseconds) is shown standing still.
// This covers phones that go to sleep or tabs that move to the background mid-walk.
const IDLE_AFTER_MS = 1000;

// The four directions a character can face. Anything else is rejected.
const FACINGS = ["left", "down", "up", "right"];

// What a player's phone sends us each time it wants to say "I moved".
type MoveMessage = { x: number; y: number; facing: string; moving: boolean };

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

export class CityRoom extends Room<{ state: CityState }> {
  // The most people allowed in this room at once.
  maxClients = 50;

  // The shared state. Colyseus sends it to every player automatically.
  state = new CityState();

  // When we last heard from each player, in milliseconds. Kept private on the server
  // (not in the shared state) because other players do not need it.
  private lastMoveAt = new Map<string, number>();

  // Messages the server understands. The name on the left is the message type.
  messages = {
    // A player says "I am now here, facing this way".
    move: (client: Client, message: MoveMessage) => {
      // Find this player in the list. If they are not there, ignore the message.
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      // Never trust what a phone sends. Check that every value is the right kind.
      if (
        typeof message?.x !== "number" ||
        typeof message?.y !== "number" ||
        !Number.isFinite(message.x) ||
        !Number.isFinite(message.y) ||
        !FACINGS.includes(message.facing)
      ) {
        return;
      }

      // Work out how far this player could really have walked since we last heard from them.
      // We allow some extra room (1.5 times) for network delays. After a long silence
      // the allowance grows, so a player coming back from a bad signal is never stuck.
      const now = Date.now();
      const last = this.lastMoveAt.get(client.sessionId) ?? now;
      const seconds = Math.min((now - last) / 1000, 5);
      const maxStep = MAX_SPEED * seconds * 1.5 + 4;

      // Keep the new position inside the map.
      let newX = clamp(message.x, 0, MAP_WIDTH);
      let newY = clamp(message.y, 0, MAP_HEIGHT);

      // If it is further away than they could have walked, only move them as far
      // as is possible in that direction. This stops teleport cheating.
      const dx = newX - player.x;
      const dy = newY - player.y;
      const distance = Math.hypot(dx, dy);
      if (distance > maxStep) {
        const scale = maxStep / distance;
        newX = player.x + dx * scale;
        newY = player.y + dy * scale;
      }

      // Save the checked position and remember when we heard it.
      player.x = newX;
      player.y = newY;
      player.facing = message.facing;
      player.moving = message.moving === true;
      this.lastMoveAt.set(client.sessionId, now);
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
  onJoin(client: Client, options: { name?: string }) {
    // Make a new player and put them at the starting spot.
    const player = new Player();
    // If they did not give a name, call them Guest plus the last 4 characters of their id.
    player.name = cleanName(options?.name, `Guest${client.sessionId.slice(-4)}`);
    player.x = SPAWN_X;
    player.y = SPAWN_Y;

    // Add them to the shared list. Everyone in the room now sees them.
    this.state.players.set(client.sessionId, player);
    this.lastMoveAt.set(client.sessionId, Date.now());
    console.log(`${player.name} joined (${client.sessionId}). Players: ${this.state.players.size}`);
  }

  // Runs when someone leaves or loses connection.
  onLeave(client: Client, code: CloseCode) {
    // Remove them from the list so they disappear for everyone else.
    this.state.players.delete(client.sessionId);
    this.lastMoveAt.delete(client.sessionId);
    console.log(`${client.sessionId} left (code ${code}). Players: ${this.state.players.size}`);
  }

  // Runs when the room closes, which happens when the last player leaves.
  onDispose() {
    console.log("Room", this.roomId, "closed");
  }
}