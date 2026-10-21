import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "tests/**/*.{test,spec}.{ts,tsx}"],
    // R7: mange tester laster adaptermoduler med `await import(...)` inne i første test. Under full kjøring
    // (alle filer parallelt) tok selve modullastingen over standardgrensen på 5 s, så tilfeldige tester fikk
    // tidsavbrudd. Grensen gjelder kjøretid, ikke logikk; ingen test venter på klokken.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
