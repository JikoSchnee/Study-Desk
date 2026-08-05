import { beforeEach, describe, expect, it, vi } from "vitest";

type TaskRow = { id: string; plan_date: string; kind: "learn" | "review"; title: string; card_id: string; estimate_minutes: number; status: "todo"; created_at: string };

const state = vi.hoisted(() => ({ planExists: false, tasks: [] as TaskRow[], runs: [] as string[] }));

vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: (sql: string) => ({
      get: () => sql.startsWith("SELECT date FROM daily_plans") && state.planExists ? { date: "2026-07-31" } : undefined,
      all: (...args: unknown[]) => {
        if (sql.startsWith("SELECT * FROM daily_tasks")) return state.tasks;
        if (sql.startsWith("SELECT c.id, c.question FROM cards c JOIN review_state")) {
          const limit = Number(args[1]);
          return [{ id: "review-1", question: "到期题" }, { id: "review-2", question: "第二道到期题" }].slice(0, limit);
        }
        return [];
      },
      run: (...args: unknown[]) => {
        state.runs.push(sql);
        if (sql.startsWith("INSERT INTO daily_plans")) state.planExists = true;
        if (sql.startsWith("INSERT INTO daily_tasks") && sql.includes("'learn'")) {
          state.tasks.push({ id: String(args[0]), plan_date: String(args[1]), kind: "learn", title: String(args[2]), card_id: String(args[3]), estimate_minutes: 5, status: "todo", created_at: String(args[4]) });
        } else if (sql.startsWith("INSERT INTO daily_tasks")) {
          state.tasks.push({ id: String(args[0]), plan_date: String(args[1]), kind: args[2] as "learn" | "review", title: String(args[3]), card_id: String(args[4]), estimate_minutes: Number(args[5]), status: "todo", created_at: String(args[6]) });
        }
        return {};
      },
    }),
    transaction: (operation: () => void) => () => operation(),
  },
}));

vi.mock("@/lib/cards", () => ({
  listCards: () => [
    { id: "learn-1", question: "新题 1", status: "learning", createdAt: "2026-07-31T01:00:00.000Z" },
    { id: "learn-2", question: "新题 2", status: "learning", createdAt: "2026-07-31T02:00:00.000Z" },
    { id: "learn-3", question: "新题 3", status: "learning", createdAt: "2026-07-31T03:00:00.000Z" },
    { id: "learn-4", question: "新题 4", status: "learning", createdAt: "2026-07-31T04:00:00.000Z" },
  ],
}));

vi.mock("@/lib/settings", () => ({ getAppSettings: () => ({ dailyInitialTarget: 3, dailyReviewTarget: 2 }) }));

import { addExtraInitialStudy, ensureDailyPlan } from "@/lib/planner";

beforeEach(() => { state.planExists = false; state.tasks.length = 0; state.runs.length = 0; });

describe("ensureDailyPlan", () => {
  it("does not append another full target when the dashboard loads again", () => {
    ensureDailyPlan("2026-07-31");
    ensureDailyPlan("2026-07-31");

    expect(state.tasks.filter((task) => task.kind === "learn")).toHaveLength(3);
    expect(state.tasks.filter((task) => task.kind === "review")).toHaveLength(2);
  });

  it("adds the next unplanned new card as one extra study task", () => {
    ensureDailyPlan("2026-07-31");
    const extra = addExtraInitialStudy("2026-07-31");

    expect(extra?.cardId).toBe("learn-4");
    expect(state.tasks.filter((task) => task.kind === "learn").map((task) => task.card_id)).toEqual(["learn-1", "learn-2", "learn-3", "learn-4"]);
    expect(state.runs).toContain("DELETE FROM daily_report_items WHERE report_date = ?");
    expect(state.runs).toContain("DELETE FROM daily_reports WHERE report_date = ?");
    expect(addExtraInitialStudy("2026-07-31")).toBeNull();
  });
});
