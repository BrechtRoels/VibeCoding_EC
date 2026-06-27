import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Separate pages: the studio (index.html), the projected wall (wall.html),
  // and the facilitator control screen (admin.html).
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        wall: "wall.html",
        admin: "admin.html",
      },
    },
  },
  server: {
    port: 5180,
    proxy: {
      "/api": "http://localhost:8011",
      "/healthz": "http://localhost:8011",
    },
  },
});
