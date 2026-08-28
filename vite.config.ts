import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      // Tailwind's Vite plugin writes temp files next to the CSS during
      // transform; watching them trips EBUSY on Windows. Ignore them.
      ignored: ["**/*.tmpdir/**", "**/*.tmp"],
    },
  },
});
