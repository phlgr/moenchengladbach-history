import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/moenchengladbach-history/",
  plugins: [
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: false,
      },
    }),
    tailwindcss(),
  ],
});
