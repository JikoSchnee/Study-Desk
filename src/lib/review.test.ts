import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  runs: [] as Array<{ sql: string; args: unknown[] }>,
  dueRows: [] as Array<{ id: string }>,
  queries: [] as string[],
  state: null as string | null,
  dueAt: null as string | null,
  hasInitialStudy: false,
  hasRealPractice: false,
}));
const cards = vi.hoisted(() => ({
  rows: [
    { id: "learning-card", question: "新题", status: "learning", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "unscheduled-learning-card", question: "计划外新题", status: "learning", createdAt: "2026-01-01T01:00:00.000Z" },
    { id: "review-card", question: "旧题", status: "review", createdAt: "2026-01-02T00:00:00.000Z" },
  ] as Array<{ id: string; question: string; status: string; createdAt: string }>,
  statusUpdates: [] as Array<{ id: string; status: string }>,
}));
const planner = vi.hoisted(() => ({
  tasks: [{ id: "planned-learning", kind: "learn", cardId: "learning-card", status: "todo" }],
}));

vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: (sql: string) => {
      database.queries.push(sql);
      return {
        get: () => {
          if (sql.startsWith("SELECT card_id FROM review_state")) return database.state ? { card_id: "learning-card" } : undefined;
          if (sql.startsWith("SELECT due_at FROM review_state")) return database.dueAt ? { due_at: database.dueAt } : undefined;
          if (sql.startsWith("SELECT completed_at FROM initial_study_logs")) return database.hasInitialStudy ? { completed_at: "2026-07-29T02:00:00.000Z" } : undefined;
          if (sql.startsWith("SELECT id FROM review_logs")) return database.hasRealPractice ? { id: "log" } : undefined;
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
          if (sql.startsWith("INSERT INTO review_state")) database.dueAt = String(args[2]);
          if (sql.startsWith("UPDATE review_state")) database.state = String(args[0]);
          if (sql.startsWith("INSERT INTO initial_study_logs")) database.hasInitialStudy = true;
          if (sql.startsWith("INSERT INTO review_logs")) database.hasRealPractice = true;
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

vi.mock("@/lib/planner", () => ({
  completeTodayTaskForCard: () => undefined,
  ensureDailyPlan: () => planner.tasks,
  listActiveDailyTasks: () => planner.tasks,
}));

import { completeInitialStudy, dueCards, initialCards, nextReviewCard, submitReview } from "@/lib/review";

beforeEach(() => {
  database.runs.length = 0;
  database.dueRows.length = 0;
  database.queries.length = 0;
  database.state = null;
  database.dueAt = null;
  database.hasInitialStudy = false;
  database.hasRealPractice = false;
  cards.statusUpdates.length = 0;
  planner.tasks = [{ id: "planned-learning", kind: "learn", cardId: "learning-card", status: "todo" }];
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

  it("records an unscored initial study once, then marks the first real recall as initial", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T10:30:00.000Z"));
    try {
      const study = completeInitialStudy("learning-card");
      const firstState = database.runs.find((entry) => entry.sql.startsWith("INSERT INTO review_state"));

      expect(study.dueAt).toBe("2026-07-29T22:00:00.000Z");
      expect(firstState?.args[2]).toBe("2026-07-29T22:00:00.000Z");
      expect(database.runs.filter((entry) => entry.sql.startsWith("INSERT INTO initial_study_logs"))).toHaveLength(1);
      expect(database.runs.filter((entry) => entry.sql.startsWith("INSERT INTO review_logs"))).toHaveLength(0);

      completeInitialStudy("learning-card");
      expect(database.runs.filter((entry) => entry.sql.startsWith("INSERT INTO initial_study_logs"))).toHaveLength(1);

      const firstRecall = submitReview("learning-card", "次日的第一次作答", 82, "good", "good");
      const reviewStateInserts = database.runs.filter((entry) => entry.sql.startsWith("INSERT INTO review_state"));
      const practiceLog = database.runs.find((entry) => entry.sql.startsWith("INSERT INTO review_logs"));
      expect(firstRecall.isInitial).toBe(true);
      expect(reviewStateInserts).toHaveLength(1);
      expect(practiceLog?.args[11]).toBe(1);
    } finally { vi.useRealTimers(); }
  });
});

describe("review queues", () => {
  it("keeps new cards in the initial-study queue", () => {
    expect(initialCards().map((card) => card.id)).toEqual(["learning-card", "unscheduled-learning-card"]);
  });

  it("uses due time and card ID for a stable review order", () => {
    database.dueRows.push({ id: "review-card" });

    expect(dueCards().map((card) => card?.id)).toEqual(["review-card"]);
    expect(database.queries.find((sql) => sql.includes("FROM cards c JOIN review_state"))).toContain("ORDER BY r.due_at ASC, c.id ASC");
  });

  it("returns only the card assigned to today's initial-study plan", () => {
    expect(nextReviewCard("initial").card?.id).toBe("learning-card");
    expect(nextReviewCard("initial").progress).toEqual({ initial: { pending: 1, completedToday: 0 }, review: { pending: 0, completedToday: 0 }, weak: { pending: 0, completedToday: 0 } });
  });

  it("uses the matching planned review card and preserves completed task progress", () => {
    planner.tasks = [
      { id: "finished-learning", kind: "learn", cardId: "learning-card", status: "done" },
      { id: "planned-review", kind: "review", cardId: "review-card", status: "todo" },
    ];

    expect(nextReviewCard("initial").card).toBeNull();
    expect(nextReviewCard("review").card?.id).toBe("review-card");
    expect(nextReviewCard("review").progress).toEqual({ initial: { pending: 0, completedToday: 1 }, review: { pending: 1, completedToday: 0 }, weak: { pending: 0, completedToday: 0 } });
  });
});
