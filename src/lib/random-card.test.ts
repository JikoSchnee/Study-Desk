import { describe, expect, it } from "vitest";
import { chooseRandomCard } from "./random-card";

const cards = [
  { id: "learning", status: "learning" as const },
  { id: "review", status: "review" as const },
  { id: "archived", status: "archived" as const },
];

describe("chooseRandomCard", () => {
  it("never returns archived cards and returns null for an empty pool", () => {
    expect(chooseRandomCard(cards, [], 0.99)?.id).not.toBe("archived");
    expect(chooseRandomCard([], [], 0)).toBeNull();
  });

  it("avoids cards already seen in the session when another card is available", () => {
    expect(chooseRandomCard(cards, ["learning"], 0)?.id).toBe("review");
  });

  it("falls back to the available card after every candidate has been seen", () => {
    expect(chooseRandomCard([{ id: "only", status: "learning" as const }], ["only"], 0)?.id).toBe("only");
  });
});
