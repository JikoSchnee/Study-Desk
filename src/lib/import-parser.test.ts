import { File as NodeFile } from "node:buffer";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { autoMapHeaders, previewWorkbook } from "./import-parser";

describe("XLSX preview", () => {
  it("recognizes Chinese headers and turns one spreadsheet row into readable answer points", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([["问题", "其他问法", "答案", "回忆提示", "技术方向", "标签", "难度"], ["什么是 RAG？", "请解释 RAG\nRAG 如何工作？", "检索\n生成", "覆盖率\n模型输出", "Agent", "RAG，检索", 2], ["", "", "", "", "", "", ""]]);
    XLSX.utils.book_append_sheet(workbook, sheet, "知识库");
    const file = new NodeFile([XLSX.write(workbook, { type: "array", bookType: "xlsx" })], "cards.xlsx");
    const mapping = autoMapHeaders(["问题", "其他问法", "答案", "回忆提示", "技术方向", "标签", "难度"]);
    expect(autoMapHeaders(["问题", "知识库类型"]).track).toBe("知识库类型");
    const result = await previewWorkbook(file as unknown as File, "知识库", mapping, []);
    expect(result.preview).toHaveLength(1);
    expect(result.preview[0].card.answerPoints.map((point) => point.content)).toEqual(["检索", "生成"]);
    expect(result.preview[0].card.answerPoints.map((point) => point.hint)).toEqual(["覆盖率", "模型输出"]);
    expect(result.preview[0].card.questionVariants.map((variant) => variant.content)).toEqual(["请解释 RAG", "RAG 如何工作？"]);
    expect(result.preview[0].card.tags).toEqual(["RAG", "检索"]);
  });
});
