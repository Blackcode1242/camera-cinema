import { defineConfig } from "vite";

// base './' faz os caminhos funcionarem em https://usuario.github.io/repositorio/
export default defineConfig({
  base: "./",
  server: { cors: true, port: 5173 },
  build: {
    rollupOptions: {
      input: {
        background: "background.html",
        hud: "hud.html",
      },
    },
  },
});
