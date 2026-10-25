import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    hookTimeout: 30000,
    testTimeout: 30000,
    fileParallelism: false, // tests share one MongoDB database; run files sequentially
    env: {
      NODE_ENV: "test",
      MONGODB_URI: "mongodb://127.0.0.1:27017/ambe_test",
      AUTH_SECRET: "test-secret-do-not-use-in-production",
      CLIENT_URL: "http://localhost:5173",
    },
  },
});
