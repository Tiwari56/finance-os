import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        // isolate each test file so DB mocks don't bleed between suites
        isolate: true,
    },
    resolve: {
        alias: {
            "@": resolve(__dirname, "."),
        },
    },
});
