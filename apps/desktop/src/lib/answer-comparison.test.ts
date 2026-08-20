import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareLexically, comparisonFromLLM, evaluationFromComparison, hasCompleteLocalModelPackage, importedModelArchiveRequirements, isLocalEmbeddingModelReady, requiredModelFilesInArchive } from "./answer-comparison";
import type { Card } from "./types";

const card: Card = {
  id: "b935a7e4-3924-4480-9015-2b7f4e970971", question: "什么是 RAG？", questionVariants: [], relations: [], answer: "检索候选资料\n基于资料生成回答", answerPoints: [
    { id: "retrieve", content: "检索候选资料", hint: "", note: "" },
    { id: "generate", content: "基于资料生成回答", hint: "", note: "" },
  ], note: "", track: "Agent", tags: [], difficulty: 2, status: "review", createdAt: "", updatedAt: "",
};

describe("answer comparison", () => {
  it("accepts the complete bge-m3 archive layout with an optional top-level directory", () => {
    const paths = importedModelArchiveRequirements().map((path) => `Xenova-bge-m3/${path}`);
    expect([...requiredModelFilesInArchive(paths).keys()]).toEqual(importedModelArchiveRequirements());
  });

  it("rejects incomplete, duplicate, or unsafe bge-m3 archives before extracting files", () => {
    const complete = importedModelArchiveRequirements();
    expect(() => requiredModelFilesInArchive(complete.filter((path) => path !== "tokenizer.json"))).toThrow("tokenizer.json");
    expect(() => requiredModelFilesInArchive([...complete, "copy/config.json"])).toThrow("重复");
    expect(() => requiredModelFilesInArchive([...complete, "../unsafe.txt"])).toThrow("不安全");
  });

  it("recognizes the automatic-download cache without optional repository artifacts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "study-desk-bge-m3-"));
    try {
      for (const file of importedModelArchiveRequirements().filter((file) => file !== "onnx/model_quantized.onnx")) {
        const path = join(directory, file);
        await mkdir(join(path, ".."), { recursive: true });
        await writeFile(path, "{}");
      }
      const modelPath = join(directory, "onnx", "model_quantized.onnx");
      await mkdir(join(modelPath, ".."), { recursive: true });
      await writeFile(modelPath, "");
      await truncate(modelPath, 500 * 1024 * 1024);

      expect(await hasCompleteLocalModelPackage(directory)).toBe(true);
      const markerPath = join(directory, ".complete.json");
      await writeFile(markerPath, JSON.stringify({ model: "Xenova/bge-m3" }));
      expect(await isLocalEmbeddingModelReady(directory, markerPath)).toBe(true);
      await rm(markerPath);
      expect(await isLocalEmbeddingModelReady(directory, markerPath)).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("maps exact local wording to its answer point and leaves unrelated points missing", () => {
    const comparison = compareLexically(card, "我会先检索候选资料，再说明业务背景。");
    expect(comparison.source).toBe("lexical");
    expect(comparison.points[0]).toMatchObject({ answerPointId: "retrieve", status: "covered" });
    expect(comparison.points[0].evidence[0]).toMatchObject({ text: "我会先检索候选资料，再说明业务背景。", start: 0 });
    expect(comparison.points[1].status).toBe("missing");
    expect(evaluationFromComparison(comparison).score).toBe(50);
  });

  it("accepts only LLM evidence that occurs in the submitted answer", () => {
    const comparison = comparisonFromLLM(card, "先检索候选资料，再基于资料生成回答。", { matches: [
      { id: "retrieve", status: "covered", evidence: ["检索候选资料"] },
      { id: "generate", status: "covered", evidence: ["基于资料生成回答"] },
    ] });
    expect(comparison.source).toBe("llm");
    expect(comparison.points.every((point) => point.status === "covered")).toBe(true);
    expect(() => comparisonFromLLM(card, "只有回答", { matches: [{ id: "retrieve", status: "covered", evidence: ["不存在的证据"] }] })).toThrow("可验证");
  });

  it("keeps a multi-sentence answer line together when matching an answer point", () => {
    const answer = "检索候选资料。并说明召回阶段的目标。\n基于资料生成回答。避免脱离上下文。";
    const comparison = compareLexically(card, answer);
    expect(comparison.points[0].evidence[0].text).toBe("检索候选资料。并说明召回阶段的目标。");
    expect(comparison.points[1].evidence[0].text).toBe("基于资料生成回答。避免脱离上下文。");
  });

  it("uses inline numbering as paragraph answer-point boundaries", () => {
    const answer = "L1，检索候选资料。先覆盖相关上下文。L2，基于资料生成回答。避免脱离上下文。";
    const comparison = compareLexically(card, answer);
    expect(comparison.points[0].evidence[0].text).toBe("L1，检索候选资料。先覆盖相关上下文。");
    expect(comparison.points[1].evidence[0].text).toBe("L2，基于资料生成回答。避免脱离上下文。");
  });

  it("combines neighboring sentences in an unnumbered paragraph without reusing evidence", () => {
    const paragraphCard: Card = { ...card, answerPoints: [
      { id: "plan", content: "先明确业务目标，再拆解执行步骤", hint: "", note: "" },
      { id: "risk", content: "最后说明潜在风险", hint: "", note: "" },
    ] };
    const comparison = compareLexically(paragraphCard, "先明确业务目标。再拆解执行步骤。最后说明潜在风险。");
    expect(comparison.points[0].evidence[0].text).toBe("先明确业务目标。再拆解执行步骤。");
    expect(comparison.points[1].evidence[0].text).toBe("最后说明潜在风险。");
    expect(comparison.points[0].evidence[0].end).toBeLessThanOrEqual(comparison.points[1].evidence[0].start);
  });

  it("weights optional opening and closing sections below the core answer points", () => {
    const structuredCard: Card = { ...card, answerPoints: [
      { id: "opening", content: "先给出整体结论", hint: "", note: "", role: "opening" },
      { id: "key", content: "说明关键机制", hint: "", note: "", role: "key" },
      { id: "closing", content: "最后回扣适用边界", hint: "", note: "", role: "closing" },
    ] };
    const comparison = compareLexically(structuredCard, "说明关键机制。");
    expect(comparison.points.map((point) => point.weight)).toEqual([.1, .8, .1]);
    expect(comparison.points.map((point) => point.role)).toEqual(["opening", "key", "closing"]);
    expect(evaluationFromComparison(comparison).score).toBe(80);
    expect(evaluationFromComparison(comparison).gaps).toEqual(["开场总述：先给出整体结论", "收束总结：最后回扣适用边界"]);
  });

  it("allows a parent and child answer point to share one evidence segment", () => {
    const hierarchyCard: Card = { ...card, answerPoints: [
      { id: "parent", content: "重排序会提升候选资料相关性", hint: "", note: "" },
      { id: "child", content: "重排序会把最相关资料排在前面", hint: "", note: "", parentId: "parent" },
      { id: "other", content: "还要控制上下文成本", hint: "", note: "" },
    ] };
    const comparison = compareLexically(hierarchyCard, "重排序会把最相关资料排在前面，从而提升候选资料相关性。");
    expect(comparison.points[0].status).toBe("covered");
    expect(comparison.points[1].status).toBe("covered");
    expect(comparison.points[0].evidence[0].start).toBe(comparison.points[1].evidence[0].start);
    expect(comparison.points[1].parentId).toBe("parent");
    expect(comparison.points[2].status).toBe("missing");
  });

  it("accepts duplicate LLM evidence only for a direct parent-child pair", () => {
    const hierarchyCard: Card = { ...card, answerPoints: [
      { id: "parent", content: "说明重排序", hint: "", note: "" },
      { id: "child", content: "说明相关性", hint: "", note: "", parentId: "parent" },
    ] };
    const comparison = comparisonFromLLM(hierarchyCard, "重排序改善相关性。", { matches: [
      { id: "parent", status: "covered", evidence: ["重排序改善相关性"] },
      { id: "child", status: "covered", evidence: ["重排序改善相关性"] },
    ] });
    expect(comparison.points.map((point) => point.status)).toEqual(["covered", "covered"]);
  });
});
