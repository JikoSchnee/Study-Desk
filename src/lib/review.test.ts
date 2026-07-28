import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  runs: [] as Array<{ sql: string; args: unknown[] }>,
  dueRows: [] as Array<{ id: string }>,
  queries: [] as string[],
  state: null as string | null,
}));
const cards = vi.hoisted(() => ({
  rows: [
    { id: "learning-card", question: "新题", status: "learning", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "review-card", question: "旧题", status: "review", createdAt: "2026-01-02T00:00:00.000Z" },
  ] as Array<{ id: string; question: string; status: string; createdAt: string }>,
  statusUpdates: [] as Array<{ id: string; status: string }>,
}));

vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: (sql: string) => {
      database.queries.push(sql);
      return {
        get: () => {
          if (sql.startsWith("SELECT card_id FROM review_state")) return database.state ? { card_id: "learning-card" } : undefined;
          if (sql.startsWith("SELECT fsrs_card FROM review_state")) return database.state ? { fsrs_card: database.state } : undefined;
          if (sql.includes("SELECT COUNT(*) AS count FROM cards WHERE")) return { count: 1 };
          if (sql.includes("SELECT COUNT(*) AS count FROM cards c JOIN")) return { count: database.dueRows.length };
          if (sql.includes("COALESCE(SUM")) return { initial_count: 0, review_count: 0 };
          return undefined;
        },
        all: () => sql.includes("FROM cards c JOIN review_state") ? database.dueRows : [],
        run: (...args: unknown[]) => {
          database.runs.push({ sql, args });
          if (sql.startsWith("INSERT INTO review_state")) database.state = String(args[1]);
          if (sql.startsWith("UPDATE review_state")) database.state = String(args[0]);
          return {};
        },
      };
    },
    transaction: (operation: () => void) => () => operation(),
  },
}));

vi.mock("@/lib/cards", () => ({
  getCard: (id: string) => cards.rows.find((card) => card.id === id),
  listCards: () => cards.rows,
  updateCardStatus: (id: string, status: string) => { cards.statusUpdates.push({ id, status }); },
}));

import { dueCards, initialCards, nextReviewCard, submitReview } from "@/lib/review";

beforeEach(() => {
  database.runs.length = 0;
  database.dueRows.length = 0;
  database.queries.length = 0;
  database.state = null;
  cards.statusUpdates.length = 0;
});

describe("first practice", () => {
  it("creates FSRS state only after the first real answer and marks it as initial", () => {
    const first = submitReview("learning-card", "我的第一次作答", 86, "good", "good");
    const stateInsert = database.runs.find((entry) => entry.sql.startsWith("INSERT INTO review_state"));
    const firstLog = database.runs.find((entry) => entry.sql.startsWith("INSERT INTO review_logs"));

    expect(first.isInitial).toBe(true);
    expect(JSON.parse(String(stateInsert?.args[1]))).toHaveProperty("due");
    expect(firstLog?.args.slice(2, 6)).toEqual(["我的第一次作答", 86, "good", "good"]);
    expect(firstLog?.args[11]).toBe(1);
    expect(cards.statusUpdates).toEqual([{ id: "learning-card", status: "review" }]);

    const second = submitReview("learning-card", "第二次作答", 92, "easy", "easy");
    const logs = database.runs.filter((entry) => entry.sql.startsWith("INSERT INTO review_logs"));
    expect(second.isInitial).toBe(false);
    expect(logs[1]?.args[11]).toBe(0);
  });
});

describe("review queues", () => {
  it("keeps new cards in the initial-practice queue", () => {
    expect(initialCards().map((card) => card.id)).toEqual(["learning-card"]);
  });

  it("uses due time and card ID for a stable review order", () => {
    database.dueRows.push({ id: "review-card" });

    expect(dueCards().map((card) => card?.id)).toEqual(["review-card"]);
    expect(database.queries.find((sql) => sql.includes("FROM cards c JOIN review_state"))).toContain("ORDER BY r.due_at ASC, c.id ASC");
  });

  it("returns queue progress with the next initial-practice card", () => {
    expect(nextReviewCard("initial").card?.id).toBe("learning-card");
    expect(nextReviewCard("initial").progress).toEqual({ initial: { pending: 1, completedToday: 0 }, review: { pending: 0, completedToday: 0 }, weak: { pending: 0, completedToday: 0 } });
  });
});
