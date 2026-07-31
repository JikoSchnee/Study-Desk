import { beforeEach, describe, expect, it, vi } from "vitest";

type TaskRow = { id: string; plan_date: string; kind: "learn" | "review"; title: string; card_id: string; estimate_minutes: number; status: "todo"; created_at: string };

const state = vi.hoisted(() => ({ planExists: false, tasks: [] as TaskRow[] }));

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
        if (sql.startsWith("INSERT INTO daily_plans")) state.planExists = true;
        if (sql.startsWith("INSERT INTO daily_tasks")) {
          state.tasks.push({ id: String(args[0]), plan_date: String(args[1]), kind: args[2] as "learn" | "review", title: String(args[3]), card_id: String(args[4]), estimate_minutes: Number(args[5]), status: "todo", created_at: String(args[6]) });
        }
        return {};
      },
    }),
  },
}));

vi.mock("@/lib/cards", () => ({
  listCards: () => [
    { id: "learn-1", question: "新题 1", status: "learning" },
    { id: "learn-2", question: "新题 2", status: "learning" },
    { id: "learn-3", question: "新题 3", status: "learning" },
    { id: "learn-4", question: "新题 4", status: "learning" },
  ],
}));

vi.mock("@/lib/settings", () => ({ getAppSettings: () => ({ dailyInitialTarget: 3, dailyReviewTarget: 2 }) }));

import { ensureDailyPlan } from "@/lib/planner";

beforeEach(() => { state.planExists = false; state.tasks.length = 0; });

describe("ensureDailyPlan", () => {
  it("does not append another full target when the dashboard loads again", () => {
    ensureDailyPlan("2026-07-31");
    ensureDailyPlan("2026-07-31");

    expect(state.tasks.filter((task) => task.kind === "learn")).toHaveLength(3);
    expect(state.tasks.filter((task) => task.kind === "review")).toHaveLength(2);
  });
});
