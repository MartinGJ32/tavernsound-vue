import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// Se parte de la config real de Vite (mergeConfig) en vez de duplicarla,
// para heredar el alias "@" sin tener que mantenerlo sincronizado a mano
// en dos archivos.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "node",
      include: ["src/**/*.test.ts", "server/**/*.test.ts"],
    },
  }),
);
