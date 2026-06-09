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
            // next-auth imports "next/server" (without .js) which fails outside Next.js build
            "next/server": resolve(__dirname, "node_modules/next/dist/server/web/exports/index.js"),
            "next/headers": resolve(__dirname, "node_modules/next/dist/client/components/headers.js"),
        },
    },
});
