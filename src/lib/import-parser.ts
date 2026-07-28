import "server-only";
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import { answerPointsFromText, emptyMapping, normalizeAnswerPoints, previewImport, questionVariantsFromText, splitTags, type ImportColumnMapping, type ImportPreviewRow } from "@/lib/import";
import { findSimilarImportQuestions } from "@/lib/import-similarity";
import { allQuestionTexts } from "@/lib/question-variants";
import type { Card } from "@/lib/types";

const aliases: Record<keyof ImportColumnMapping, string[]> = {
  question: ["question", "问题", "题目", "知识点", "问"],
  variants: ["variants", "questionvariants", "其他问法", "问法变体", "同义问法", "更多问法"],
  opening: ["opening", "开场总述", "开场", "总述", "总起"],
  answer: ["answer", "答案", "回答", "要点", "answerpoints"],
  hint: ["hint", "hints", "提示", "回忆提示", "关键词", "线索"],
  closing: ["closing", "收束总结", "收束", "总结", "结语"],
  track: ["track", "知识库类型", "方向", "技术方向", "分类", "领域"],
  tags: ["tags", "tag", "标签"],
  difficulty: ["difficulty", "难度"],
};

function text(value: unknown) { return String(value ?? "").trim(); }
function normalized(value: string) { return value.toLowerCase().replace(/[\s_-]/g, ""); }

export function autoMapHeaders(headers: string[]): ImportColumnMapping {
  const mapping = { ...emptyMapping };
  for (const field of Object.keys(mapping) as Array<keyof ImportColumnMapping>) {
    mapping[field] = headers.find((header) => aliases[field].includes(normalized(header))) ?? "";
  }
  return mapping;
}

function validateUpload(file: File) {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".csv") && !name.endsWith(".xlsx")) throw new Error("仅支持 CSV 或 XLSX 文件。");
  if (file.size > 5 * 1024 * 1024) throw new Error("文件不能超过 5MB。");
}

async function workbookFromFile(file: File) {
  validateUpload(file);
  return XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer", codepage: 65001, cellFormula: false, cellHTML: false, cellText: true });
}

export async function inspectWorkbook(file: File) {
  const workbook = await workbookFromFile(file);
  return { sheets: workbook.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: "", raw: false });
    const headers = (rows[0] ?? []).map(text).filter(Boolean);
    return { name, headers, mapping: autoMapHeaders(headers) };
  }) };
}

export async function previewWorkbook(file: File, sheetName: string, mapping: ImportColumnMapping, existingCards: Card[]) {
  const workbook = await workbookFromFile(file);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("找不到选定的工作表。");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
  const headers = (rows[0] ?? []).map(text);
  if (!mapping.question || !headers.includes(mapping.question)) throw new Error("请先映射“问题”列。");
  const indexFor = (field: keyof ImportColumnMapping) => mapping[field] ? headers.indexOf(mapping[field]) : -1;
  const positions = { question: indexFor("question"), variants: indexFor("variants"), opening: indexFor("opening"), answer: indexFor("answer"), hint: indexFor("hint"), closing: indexFor("closing"), track: indexFor("track"), tags: indexFor("tags"), difficulty: indexFor("difficulty") };
  const raw = rows.slice(1, 501).map((row, index) => {
    const question = text(row[positions.question]);
    const variants = positions.variants >= 0 ? text(row[positions.variants]) : "";
    const opening = positions.opening >= 0 ? text(row[positions.opening]) : "";
    const answer = positions.answer >= 0 ? text(row[positions.answer]) : "";
    const hint = positions.hint >= 0 ? text(row[positions.hint]) : "";
    const closing = positions.closing >= 0 ? text(row[positions.closing]) : "";
    const rawTrack = positions.track >= 0 ? text(row[positions.track]) : "";
    const rawTags = positions.tags >= 0 ? text(row[positions.tags]) : "";
    const rawDifficulty = positions.difficulty >= 0 ? text(row[positions.difficulty]) : "";
    return {
      question, variants, answer, track: rawTrack || "Agent", tags: splitTags(rawTags), difficulty: Math.min(5, Math.max(1, Number(rawDifficulty) || 3)),
      opening, hint, closing, rowNumber: index + 2, hasContent: Boolean(question || variants || opening || answer || hint || closing || rawTrack || rawTags || rawDifficulty),
    };
  }).filter((row) => row.hasContent);
  const parsedRows = raw.map((row) => ({ ...row, questionVariants: questionVariantsFromText(row.variants) }));
  const dedupe = previewImport(parsedRows, existingCards.flatMap(allQuestionTexts));
  const similar = await findSimilarImportQuestions(parsedRows, existingCards);
  const accepted = new Set(dedupe.accepted.map((row) => `${row.question}\u0000${row.answer}`));
  const rejected = new Map(dedupe.rejected.map((row) => [row.question.trim().toLowerCase(), row.reason]));
  const preview: ImportPreviewRow[] = raw.map((row, index) => {
    const key = `${row.question}\u0000${row.answer}`;
    const reason = rejected.get(row.question.trim().toLowerCase());
    const similarMatch = similar.get(index);
    const semanticReason = similarMatch ? `与${similarMatch.source === "library" ? "题库" : "导入文件中较早的"}问题“${similarMatch.question}”语义相似度 ${Math.round(similarMatch.score * 100)}%` : undefined;
    const status = accepted.has(key) ? similarMatch ? "duplicate" : "valid" : reason?.includes("已存在") ? "duplicate" : "invalid";
    const hintCount = row.hint.split(/\r?\n/).filter((item) => item.trim()).length;
    const answerPoints = normalizeAnswerPoints([...(row.opening ? answerPointsFromText(row.opening, "", "opening") : []), ...answerPointsFromText(row.answer, row.hint), ...(row.closing ? answerPointsFromText(row.closing, "", "closing") : [])]);
    const note = hintCount > answerPoints.length ? "提示多于答案要点，额外提示将忽略。" : undefined;
    return { id: randomUUID(), rowNumber: row.rowNumber, status, reason: reason ?? semanticReason, note, ...(similarMatch ? { similarMatch: { question: similarMatch.question, score: similarMatch.score, source: similarMatch.source } } : {}), card: { question: row.question, questionVariants: questionVariantsFromText(row.variants), answerPoints, track: row.track, tags: row.tags, difficulty: row.difficulty } };
  });
  return { headers, preview, truncated: rows.length > 501 };
}
