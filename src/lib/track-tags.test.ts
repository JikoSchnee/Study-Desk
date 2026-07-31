import { describe, expect, it } from "vitest";
import { withTrackTag } from "./utils";

describe("withTrackTag", () => {
  it("adds the trimmed knowledge-base type while preserving manual tags", () => {
    expect(withTrackTag(" Agent ", ["RAG", "检索"])).toEqual(["RAG", "检索", "Agent"]);
  });

  it("does not add a duplicate type tag regardless of casing", () => {
    expect(withTrackTag("Agent", ["RAG", "agent"])).toEqual(["RAG", "agent"]);
  });

  it("retains an earlier type tag when the type changes", () => {
    expect(withTrackTag("Java 后端", ["Agent", "手动标签"])).toEqual(["Agent", "手动标签", "Java 后端"]);
  });
});
