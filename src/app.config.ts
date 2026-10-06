// src/app.config.ts
// This file tells the server which rooms exist and which web pages it offers.

import { defineServer, defineRoom, monitor, playground } from "colyseus";

// Our Akure city room.
import { CityRoom } from "./rooms/CityRoom.js";

const server = defineServer({
  // The rooms players can join. "city" is the name the game will ask for.
  rooms: {
    city: defineRoom(CityRoom),
  },

  // Extra web pages the server offers.
  express: (app) => {
    // A simple page to check the server is alive. Hosting services use this later.
    app.get("/health", (req, res) => {
      // This header lets the game's web page read the answer from another website.
      res.set("Access-Control-Allow-Origin", "*");
      res.send("ok");
    });

    // Tools for developers. They are switched off when the game goes live.
    if (process.env.NODE_ENV !== "production") {
      // A dashboard showing running rooms: http://localhost:2567/monitor
      app.use("/monitor", monitor());
      // A test page where you can join a room by hand: http://localhost:2567
      app.use("/", playground());
    }
  },
});

export default server;