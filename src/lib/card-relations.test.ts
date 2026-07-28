import { describe, expect, it } from "vitest";
import { normalizeCardRelations, reciprocalRelationType } from "./card-relations";

describe("card relations", () => {
  it("maps parent and child relationships in both directions", () => {
    expect(reciprocalRelationType("parent")).toBe("child");
    expect(reciprocalRelationType("child")).toBe("parent");
    expect(reciprocalRelationType("related")).toBe("related");
  });

  it("removes self references and keeps one explicit relationship per card", () => {
    expect(normalizeCardRelations([{ cardId: "self", type: "related" }, { cardId: "child", type: "related" }, { cardId: "child", type: "child" }], "self")).toEqual([{ cardId: "child", type: "child" }]);
  });
});
