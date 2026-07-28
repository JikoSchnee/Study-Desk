import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  runs: [] as Array<{ sql: string; args: unknown[] }>,
  dueRows: [] as Array<{ id: string }>,
  queries: [] as string[],
}));

vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: (sql: string) => {
      database.queries.push(sql);
      return {
        get: () => undefined,
        all: () => database.dueRows,
        run: (...args: unknown[]) => { database.runs.push({ sql, args }); return {}; },
      };
    },
    transaction: (operation: () => void) => () => operation(),
  },
}));

vi.mock("@/lib/cards", () => ({ getCard: (id: string) => ({ id, question: "测试卡片" }) }));

import { dueCards, nextDueReview, recordInitialReview } from "@/lib/review";

beforeEach(() => {
  database.runs.length = 0;
  database.dueRows.length = 0;
  database.queries.length = 0;
});

describe("recordInitialReview", () => {

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

describe("due review queue", () => {
  it("uses due time and card ID for a stable queue order", () => {
    database.dueRows.push({ id: "card-earlier" }, { id: "card-later" });

    expect(dueCards().map((card) => card?.id)).toEqual(["card-earlier", "card-later"]);
    expect(database.queries.find((sql) => sql.includes("FROM cards c JOIN review_state"))).toContain("ORDER BY r.due_at ASC, c.id ASC");
  });

  it("returns no next card when the due queue is empty", () => {
    expect(nextDueReview()).toEqual({ card: null, dueCount: 0 });
  });
});
