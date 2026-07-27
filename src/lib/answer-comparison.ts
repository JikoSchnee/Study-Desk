import "server-only";
import { join } from "node:path";
import type { AnswerComparison, AnswerComparisonMode, AnswerEvidence, AnswerPointComparison, Card } from "@/lib/types";
import { setComparisonProgress } from "@/lib/comparison-progress";

type Segment = { text: string; start: number; end: number };
type Embedder = (values: string[]) => Promise<number[][]>;

let embedderPromise: Promise<Embedder> | null = null;

function cleanSegment(raw: string, index: number) {
  const leading = raw.length - raw.trimStart().length;
  const text = raw.trim();
  if (!text) return null;
  const start = index + leading;
  return { text, start, end: start + text.length } satisfies Segment;
}

function sentencesOf(answer: string): Segment[] {
  const result: Segment[] = [];
  const matcher = /[^。！？!?；;\n]+[。！？!?；;\n]*/g;
  for (const match of answer.matchAll(matcher)) {
    const segment = cleanSegment(match[0], match.index ?? 0);
    if (segment) result.push(segment);
  }
  return result;
}

function numberedSegments(answer: string): Segment[] {
  const boundaries = Array.from(answer.matchAll(/(?<![\s\S])\s*(?=(?:L\d+\b|\d+[.、]|[一二三四五六七八九十]+、))|(?<=[。！？!?；;])\s*(?=(?:L\d+\b|\d+[.、]|[一二三四五六七八九十]+、))/gi)).map((match) => match.index ?? 0);
  if (!boundaries.length) return [];
  return boundaries.flatMap((start, index) => {
    const end = boundaries[index + 1] ?? answer.length;
    const segment = cleanSegment(answer.slice(start, end), start);
    return segment ? [segment] : [];
  });
}

function segmentsOf(answer: string): Segment[] {
  const lines = Array.from(answer.matchAll(/[^\r\n]+/g)).flatMap((match) => {
    const segment = cleanSegment(match[0], match.index ?? 0);
    return segment ? [segment] : [];
  });
  // A line usually represents one spoken answer point. Keep its sentences together
  // so a short title (for example “L1，信息管理层”) does not hide its explanation.
  if (lines.length > 1) return lines;
  const numbered = numberedSegments(answer);
  if (numbered.length) return numbered;
  const sentences = sentencesOf(answer);
  if (!sentences.length) return lines;
  // With no visual or numbered boundaries, use short contiguous windows. This keeps
  // a title and its following explanation together without using a whole paragraph
  // as evidence for every answer point.
  return sentences.flatMap((_, start) => [1, 2, 3].flatMap((length) => {
    const slice = sentences.slice(start, start + length);
    if (slice.length !== length) return [];
    const first = slice[0]; const last = slice[slice.length - 1];
    return [{ text: answer.slice(first.start, last.end), start: first.start, end: last.end }];
  }));
}

function cosine(left: number[], right: number[]) {
  let dot = 0; let leftSize = 0; let rightSize = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) { dot += left[index] * right[index]; leftSize += left[index] ** 2; rightSize += right[index] ** 2; }
  return dot / Math.max(Math.sqrt(leftSize) * Math.sqrt(rightSize), Number.EPSILON);
}

function keywords(text: string) {
  const chinese = (text.match(/[\u4e00-\u9fa5]+/g) ?? []).flatMap((chunk) => Array.from({ length: Math.max(0, chunk.length - 1) }, (_, index) => chunk.slice(index, index + 2)));
  const words = text.toLowerCase().match(/[a-z][a-z0-9_-]{1,}|\d+(?:\.\d+)?/g) ?? [];
  return [...new Set([...chinese, ...words])];
}

function lexicalScore(reference: string, candidate: string) {
  const expected = keywords(reference);
  const lower = candidate.toLowerCase();
  return expected.length ? expected.filter((word) => lower.includes(word)).length / expected.length : 0;
}

function statusFor(score: number): AnswerPointComparison["status"] { return score >= 0.78 ? "covered" : score >= 0.6 ? "partial" : "missing"; }

function cardPoints(card: Card) { return card.answerPoints.filter((point) => point.content.trim()).map((point, index) => ({ id: point.id || `point-${index}`, content: point.content.trim() })); }

function asComparison(requestedMode: AnswerComparisonMode, source: AnswerComparison["source"], points: AnswerPointComparison[], warning?: string): AnswerComparison { return { requestedMode, source, points, ...(warning ? { warning } : {}) }; }

function evidenceFor(segment: Segment, score: number): AnswerEvidence { return { text: segment.text, start: segment.start, end: segment.end, score: Math.round(score * 100) / 100 }; }

function overlap(left: Segment, right: Segment) { return left.start < right.end && right.start < left.end; }

function mapNonOverlappingPoints(card: Card, answer: string, scoreFor: (reference: string, candidate: string) => number, evidenceThreshold: number) {
  const points = cardPoints(card);
  const segments = segmentsOf(answer);
  const candidates = points.flatMap(({ content }, pointIndex) => segments.map((segment) => ({ pointIndex, segment, score: scoreFor(content, segment.text) }))).filter((candidate) => candidate.score >= evidenceThreshold).sort((left, right) => right.score - left.score || left.segment.text.length - right.segment.text.length);
  const selected = new Map<number, { segment: Segment; score: number }>();
  for (const candidate of candidates) {
    if (selected.has(candidate.pointIndex) || [...selected.values()].some((item) => overlap(item.segment, candidate.segment))) continue;
    selected.set(candidate.pointIndex, candidate);
  }
  return points.map(({ id, content }, pointIndex) => {
    const evidence = selected.get(pointIndex);
    const bestScore = evidence?.score ?? Math.max(0, ...segments.map((segment) => scoreFor(content, segment.text)));
    return { answerPointId: id, reference: content, score: bestScore, status: statusFor(bestScore), evidence: evidence ? [evidenceFor(evidence.segment, evidence.score)] : [] } satisfies AnswerPointComparison;
  });
}

export function compareLexically(card: Card, answer: string, requestedMode: AnswerComparisonMode = "embedding", warning?: string): AnswerComparison {
  const points = mapNonOverlappingPoints(card, answer, lexicalScore, 0.2);
  return asComparison(requestedMode, "lexical", points, warning);
}

async function getEmbedder(progressId?: string): Promise<Embedder> {
  if (!embedderPromise) embedderPromise = (async () => {
    setComparisonProgress(progressId, { percent: 12, stage: "preparing", message: "正在检查本地语义模型…" });
    const { env, pipeline } = await import("@huggingface/transformers");
    env.cacheDir = join(process.cwd(), ".cache", "answer-comparison");
    const extractor = await pipeline("feature-extraction", "Xenova/bge-small-zh-v1.5", {
      dtype: "q8",
      progress_callback: (event: unknown) => {
        const update = event as { status?: string; progress?: number; file?: string };
        const raw = Number(update.progress);
        const fraction = Number.isFinite(raw) ? Math.max(0, Math.min(raw > 1 ? raw / 100 : raw, 1)) : 0;
        setComparisonProgress(progressId, { percent: Math.max(14, Math.round(14 + fraction * 36)), stage: "downloading", message: update.file ? `正在下载 ${update.file}…` : "正在下载本地语义模型…" });
      },
    });
    setComparisonProgress(progressId, { percent: 52, stage: "recognizing", message: "模型已就绪，正在理解答案…" });
    return async (values: string[]) => {
      const tensor = await extractor(values, { pooling: "mean", normalize: true }) as unknown as { tolist(): number[][] };
      return tensor.tolist();
    };
  })();
  else setComparisonProgress(progressId, { percent: 48, stage: "preparing", message: "正在加载已缓存的本地语义模型…" });
  return embedderPromise;
}

export async function compareWithEmbeddings(card: Card, answer: string, requestedMode: AnswerComparisonMode = "embedding", progressId?: string): Promise<AnswerComparison> {
  const points = cardPoints(card);
  const segments = segmentsOf(answer);
  if (!segments.length) return compareLexically(card, answer, requestedMode);
  try {
    const embed = await getEmbedder(progressId);
    setComparisonProgress(progressId, { percent: 62, stage: "recognizing", message: "正在将答案要点转成语义向量…" });
    const vectors = await embed([...points.map((point) => point.content), ...segments.map((segment) => segment.text)]);
    setComparisonProgress(progressId, { percent: 84, stage: "matching", message: "正在匹配回答与参考要点…" });
    const pointVectors = vectors.slice(0, points.length);
    const segmentVectors = vectors.slice(points.length);
    const candidates = points.flatMap((_, pointIndex) => segments.map((segment, segmentIndex) => ({ pointIndex, segment, score: cosine(pointVectors[pointIndex], segmentVectors[segmentIndex]) }))).filter((candidate) => candidate.score >= 0.6).sort((left, right) => right.score - left.score || left.segment.text.length - right.segment.text.length);
    const selected = new Map<number, { segment: Segment; score: number }>();
    for (const candidate of candidates) {
      if (selected.has(candidate.pointIndex) || [...selected.values()].some((item) => overlap(item.segment, candidate.segment))) continue;
      selected.set(candidate.pointIndex, candidate);
    }
    const mapped = points.map(({ id, content }, pointIndex) => {
      const evidence = selected.get(pointIndex);
      const bestScore = evidence?.score ?? Math.max(0, ...segments.map((_, segmentIndex) => cosine(pointVectors[pointIndex], segmentVectors[segmentIndex])));
      return { answerPointId: id, reference: content, score: bestScore, status: statusFor(bestScore), evidence: evidence ? [evidenceFor(evidence.segment, evidence.score)] : [] } satisfies AnswerPointComparison;
    });
    setComparisonProgress(progressId, { percent: 96, stage: "matching", message: "正在整理对应结果…" });
    return asComparison(requestedMode, "embedding", mapped);
  } catch {
    setComparisonProgress(progressId, { percent: 100, stage: "fallback", message: "语义模型暂不可用，已切换关键词比对。" });
    return compareLexically(card, answer, requestedMode, "本地语义模型暂不可用，已改用关键词比对。");
  }
}

export function comparisonFromLLM(card: Card, answer: string, raw: unknown): AnswerComparison {
  const data = raw as { matches?: unknown };
  if (!Array.isArray(data.matches)) throw new Error("模型没有返回要点映射");
  const points = cardPoints(card);
  const used = new Set<string>();
  const matches = new Map((data.matches as Array<{ id?: unknown; status?: unknown; evidence?: unknown }>).flatMap((item) => {
    if (typeof item.id !== "string" || !["covered", "partial", "missing"].includes(String(item.status))) return [];
    const evidence = Array.isArray(item.evidence) ? item.evidence.flatMap((value) => {
      if (typeof value !== "string" || !value.trim()) return [];
      const start = answer.indexOf(value, 0);
      const key = `${start}:${value.length}`;
      if (start < 0 || used.has(key)) return [];
      used.add(key); return [{ text: value, start, end: start + value.length }];
    }) : [];
    if (String(item.status) !== "missing" && !evidence.length) return [];
    return [[item.id, { status: item.status as AnswerPointComparison["status"], evidence }]];
  }));
  if (matches.size === 0 && points.length > 0) throw new Error("模型没有返回可验证的对应片段");
  const result = points.map(({ id, content }) => {
    const item = matches.get(id);
    const score = item?.status === "covered" ? 1 : item?.status === "partial" ? 0.68 : 0;
    return { answerPointId: id, reference: content, status: item?.status ?? "missing", score, evidence: item?.evidence ?? [] };
  });
  return asComparison("llm", "llm", result);
}

export function evaluationFromComparison(comparison: AnswerComparison) {
  const covered = comparison.points.filter((point) => point.status !== "missing").map((point) => point.reference);
  const gaps = comparison.points.filter((point) => point.status === "missing").map((point) => point.reference);
  const average = comparison.points.length ? comparison.points.reduce((sum, point) => sum + (point.status === "covered" ? 1 : point.status === "partial" ? 0.55 : 0), 0) / comparison.points.length : 0;
  const score = Math.round(average * 100);
  const suggestedRating = score < 35 ? "again" : score < 60 ? "hard" : score < 85 ? "good" : "easy";
  return { score, suggestedRating, covered, gaps, feedback: score >= 85 ? "回答覆盖充分，继续保持。" : `建议补充：${gaps.join("、") || "关键定义和具体例子"}。` } as const;
}
