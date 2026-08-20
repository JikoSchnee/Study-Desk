import { describe, expect, it } from "vitest";
import { createRelatedCardDraft } from "./related-card-draft";

describe("related card draft", () => {
  const source = { id: "source-card", track: "Java 后端", tags: ["并发", "JVM"] };
  const emptyPoint = { id: "new-point", content: "", hint: "", note: "", role: "key" as const };

  it.each(["related", "parent", "child"] as const)("preserves the selected %s relation from the new card", (relationType) => {
    expect(createRelatedCardDraft(source, relationType, emptyPoint).relations).toEqual([{ cardId: source.id, type: relationType }]);
  });

  it("inherits only category and tags while leaving card content blank", () => {
    expect(createRelatedCardDraft(source, "child", emptyPoint)).toEqual({
      question: "", questionVariants: [], relations: [{ cardId: source.id, type: "child" }], answerPoints: [emptyPoint], note: "", track: "Java 后端", tags: "并发, JVM", source: "",
    });
  });
});
