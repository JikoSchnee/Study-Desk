import type { Config } from "drizzle-kit";

export default {
  schema: "./apps/desktop/src/lib/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: "./data/mock-interview.db" },
} satisfies Config;
