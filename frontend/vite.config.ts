import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Two separate pages: the studio (index.html) and the projected wall (wall.html).
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        wall: "wall.html",
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
