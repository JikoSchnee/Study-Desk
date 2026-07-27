import { describe, expect, it } from "vitest";
import { appendUniqueValues, matchingOptions } from "@/lib/select-options";

describe("searchable select helpers", () => {
  it("matches options by a case-insensitive partial query and excludes selected values", () => {
    expect(matchingOptions(["Agent", "Java 后端", "计算机基础"], "java")).toEqual(["Java 后端"]);
    expect(matchingOptions(["RAG", "检索"], "", ["rag"])).toEqual(["检索"]);
  });

  it("adds only new, non-empty values", () => {
    expect(appendUniqueValues(["RAG"], ["检索", " rag ", ""])).toEqual(["RAG", "检索"]);
  });
});
