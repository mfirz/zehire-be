import {
  defineWorkersConfig,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const migrations = await readD1Migrations(
  path.resolve(__dirname, "migrations")
);

export default defineWorkersConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ["mammoth", "unpdf"],
        },
      },
    },
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
          },
          compatibilityFlags: ["nodejs_compat"],
        },
      },
    },
  },
});
