import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ runs: [] as Array<{ sql: string; args: unknown[] }> }));

vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: (sql: string) => ({
      get: () => undefined,
      run: (...args: unknown[]) => { database.runs.push({ sql, args }); return {}; },
    }),
    transaction: (operation: () => void) => () => operation(),
  },
}));

vi.mock("@/lib/cards", () => ({ getCard: (id: string) => ({ id, question: "测试卡片" }) }));

import { recordInitialReview } from "@/lib/review";

describe("recordInitialReview", () => {
  beforeEach(() => { database.runs.length = 0; });

  it("creates a Hard FSRS state and a non-scoring initial activity record", () => {
    const result = recordInitialReview("card-1");
    const stateInsert = database.runs.find((entry) => entry.sql.startsWith("INSERT INTO review_state"));
    const logInsert = database.runs.find((entry) => entry.sql.startsWith("INSERT INTO review_logs"));

    expect(result.initialized).toBe(true);
    expect(JSON.parse(String(stateInsert?.args[1])).difficulty).toBeGreaterThanOrEqual(1);
    expect(logInsert?.args.slice(2, 6)).toEqual(["系统首次练习初始化", 0, "hard", "hard"]);
    expect(logInsert?.args[9]).toBe(1);
    expect(database.runs.some((entry) => entry.sql.startsWith("UPDATE cards SET status = 'review'"))).toBe(true);
  });
});
