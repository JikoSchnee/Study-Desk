import "server-only";
import { access, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AnswerComparison, AnswerComparisonMode, AnswerEvidence, AnswerPointComparison, AnswerPointRole, Card } from "@/lib/types";
import { setComparisonProgress } from "@/lib/comparison-progress";

type Segment = { text: string; start: number; end: number };
type Embedder = (values: string[]) => Promise<number[][]>;

let embedderPromise: Promise<Embedder> | null = null;
const LOCAL_EMBEDDING_MODEL = "Xenova/bge-m3";
const EMBEDDING_CACHE_DIR = join(process.cwd(), ".cache", "answer-comparison");
const EMBEDDING_MODEL_DIR = join(EMBEDDING_CACHE_DIR, "Xenova", "bge-m3");
const MODEL_FILE = join(EMBEDDING_MODEL_DIR, "onnx", "model_quantized.onnx");
const MODEL_PART_FILE = `${MODEL_FILE}.part`;
const MODEL_READY_FILE = join(EMBEDDING_MODEL_DIR, ".complete.json");
const MODEL_DOWNLOAD_URL = "https://huggingface.co/Xenova/bge-m3/resolve/main/onnx/model_quantized.onnx?download=true";
const MIN_MODEL_BYTES = 500 * 1024 * 1024;
const MAX_DOWNLOAD_RETRIES = 3;

export type LocalEmbeddingModelStatus = {
  state: "pending" | "downloading" | "verifying" | "retrying" | "ready" | "error";
  onnxState: "pending" | "parsing" | "ready" | "failed";
  downloadedBytes: number;
  totalBytes: number | null;
  attempt: number;
  error?: string;
};

let downloadStatus: LocalEmbeddingModelStatus = { state: "pending", onnxState: "pending", downloadedBytes: 0, totalBytes: null, attempt: 0 };
let preparationPromise: Promise<void> | null = null;

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

export function cosineSimilarity(left: number[], right: number[]) {
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

function roleOf(value: { role?: AnswerPointRole }): AnswerPointRole { return value.role === "opening" || value.role === "closing" ? value.role : "key"; }

function cardPoints(card: Card) {
  const points = card.answerPoints.filter((point) => point.content.trim()).map((point, index) => ({ id: point.id || `point-${index}`, content: point.content.trim(), role: roleOf(point), parentId: point.parentId }));
  const structureCount = points.filter((point) => point.role !== "key").length;
  const keyCount = points.filter((point) => point.role === "key").length;
  const keyWeight = keyCount ? (1 - structureCount * .1) / keyCount : 0;
  return points.map((point) => ({ ...point, weight: point.role === "key" ? keyWeight : .1 }));
}

function mayShareEvidence(left: { id: string; parentId?: string }, right: { id: string; parentId?: string }) {
  return left.parentId === right.id || right.parentId === left.id;
}

function asComparison(requestedMode: AnswerComparisonMode, source: AnswerComparison["source"], points: AnswerPointComparison[], warning?: string): AnswerComparison { return { requestedMode, source, points, ...(warning ? { warning } : {}) }; }

function evidenceFor(segment: Segment, score: number): AnswerEvidence { return { text: segment.text, start: segment.start, end: segment.end, score: Math.round(score * 100) / 100 }; }

function overlap(left: Segment, right: Segment) { return left.start < right.end && right.start < left.end; }

function mapNonOverlappingPoints(card: Card, answer: string, scoreFor: (reference: string, candidate: string) => number, evidenceThreshold: number) {
  const points = cardPoints(card);
  const segments = segmentsOf(answer);
  const candidates = points.flatMap(({ content }, pointIndex) => segments.map((segment) => ({ pointIndex, segment, score: scoreFor(content, segment.text) }))).filter((candidate) => candidate.score >= evidenceThreshold).sort((left, right) => right.score - left.score || left.segment.text.length - right.segment.text.length);
  const selected = new Map<number, { segment: Segment; score: number }>();
  for (const candidate of candidates) {
    if (selected.has(candidate.pointIndex) || [...selected.entries()].some(([pointIndex, item]) => overlap(item.segment, candidate.segment) && !mayShareEvidence(points[candidate.pointIndex], points[pointIndex]))) continue;
    selected.set(candidate.pointIndex, candidate);
  }
  return points.map(({ id, content, role, parentId, weight }, pointIndex) => {
    const evidence = selected.get(pointIndex);
    const bestScore = evidence?.score ?? Math.max(0, ...segments.map((segment) => scoreFor(content, segment.text)));
    return { answerPointId: id, reference: content, role, parentId, weight, score: bestScore, status: statusFor(bestScore), evidence: evidence ? [evidenceFor(evidence.segment, evidence.score)] : [] } satisfies AnswerPointComparison;
  });
}

export function compareLexically(card: Card, answer: string, requestedMode: AnswerComparisonMode = "embedding", warning?: string): AnswerComparison {
  const points = mapNonOverlappingPoints(card, answer, lexicalScore, 0.2);
  return asComparison(requestedMode, "lexical", points, warning);
}

async function exists(path: string) {
  try { await access(path); return true; }
  catch { return false; }
}

async function sizeOf(path: string) {
  try { return (await stat(path)).size; }
  catch { return 0; }
}

async function isModelReady() {
  if (!await exists(MODEL_READY_FILE) || await sizeOf(MODEL_FILE) < MIN_MODEL_BYTES) return false;
  try {
    const marker = JSON.parse(await readFile(MODEL_READY_FILE, "utf8")) as { model?: string };
    return marker.model === LOCAL_EMBEDDING_MODEL;
  } catch { return false; }
}

async function markModelReady() {
  await writeFile(MODEL_READY_FILE, JSON.stringify({ model: LOCAL_EMBEDDING_MODEL, completedAt: new Date().toISOString() }), "utf8");
}

async function clearModelCache() {
  embedderPromise = null;
  await rm(EMBEDDING_MODEL_DIR, { recursive: true, force: true });
}

async function clearModelSupportCache() {
  const preservedModel = join(EMBEDDING_CACHE_DIR, ".bge-m3-model-preserve.onnx");
  if (await sizeOf(MODEL_FILE) < MIN_MODEL_BYTES) return clearModelCache();
  await rm(preservedModel, { force: true });
  await rename(MODEL_FILE, preservedModel);
  await rm(EMBEDDING_MODEL_DIR, { recursive: true, force: true });
  await mkdir(join(EMBEDDING_MODEL_DIR, "onnx"), { recursive: true });
  await rename(preservedModel, MODEL_FILE);
  embedderPromise = null;
}

function isModelFileError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /protobuf|onnx|load model/i.test(message);
}

function totalFrom(response: Response, fallback: number) {
  const contentRange = response.headers.get("content-range");
  const match = contentRange?.match(/\/(\d+)$/);
  if (match) return Number(match[1]);
  const contentLength = Number(response.headers.get("content-length"));
  return Number.isFinite(contentLength) && contentLength > 0 ? fallback + contentLength : null;
}

async function downloadModelFile() {
  await mkdir(join(EMBEDDING_MODEL_DIR, "onnx"), { recursive: true });
  const finalSize = await sizeOf(MODEL_FILE);
  if (finalSize >= MIN_MODEL_BYTES) return;
  if (finalSize > 0 && !await exists(MODEL_PART_FILE)) await rename(MODEL_FILE, MODEL_PART_FILE);
  else if (finalSize > 0) await rm(MODEL_FILE, { force: true });

  let downloadedBytes = await sizeOf(MODEL_PART_FILE);
  const response = await fetch(MODEL_DOWNLOAD_URL, {
    headers: downloadedBytes ? { Range: `bytes=${downloadedBytes}-` } : undefined,
    cache: "no-store",
  });
  if (!response.ok || !response.body) throw new Error(`模型下载请求失败（HTTP ${response.status}）。`);

  const resuming = downloadedBytes > 0 && response.status === 206;
  if (downloadedBytes > 0 && !resuming) {
    downloadedBytes = 0;
    await rm(MODEL_PART_FILE, { force: true });
  }
  const totalBytes = totalFrom(response, downloadedBytes);
  downloadStatus = { state: "downloading", onnxState: "pending", downloadedBytes, totalBytes, attempt: downloadStatus.attempt };
  const file = await open(MODEL_PART_FILE, downloadedBytes ? "a" : "w");
  try {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      await file.write(value);
      downloadedBytes += value.byteLength;
      downloadStatus = { state: "downloading", onnxState: "pending", downloadedBytes, totalBytes, attempt: downloadStatus.attempt };
    }
  } finally { await file.close(); }

  if (totalBytes !== null && downloadedBytes !== totalBytes) throw new Error("模型下载未完成，请稍后重试。");
  if (downloadedBytes < MIN_MODEL_BYTES) throw new Error("模型文件不完整，请稍后重试。");
  await rename(MODEL_PART_FILE, MODEL_FILE);
  downloadStatus = { state: "verifying", onnxState: "pending", downloadedBytes, totalBytes: downloadedBytes, attempt: downloadStatus.attempt };
}

async function ensureModelFile() {
  if (await sizeOf(MODEL_FILE) >= MIN_MODEL_BYTES) return;
  await downloadModelFile();
}

/** Starts a detached, resumable download. Concurrent calls share one job. */
export function startLocalEmbeddingModelPrewarm() {
  if (preparationPromise) return;
  preparationPromise = (async () => {
    if (await isModelReady()) {
      downloadStatus = { state: "ready", onnxState: "ready", downloadedBytes: await sizeOf(MODEL_FILE), totalBytes: await sizeOf(MODEL_FILE), attempt: 0 };
      return;
    }
    let lastError = "本地模型预热失败。";
    for (let attempt = 1; attempt <= MAX_DOWNLOAD_RETRIES; attempt += 1) {
      downloadStatus = { state: attempt === 1 ? "downloading" : "retrying", onnxState: "pending", downloadedBytes: await sizeOf(MODEL_PART_FILE), totalBytes: null, attempt };
      try {
        await getEmbedder();
        const modelBytes = await sizeOf(MODEL_FILE);
        await markModelReady();
        downloadStatus = { state: "ready", onnxState: "ready", downloadedBytes: modelBytes, totalBytes: modelBytes, attempt };
        return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
        // Keep a partially transferred file so the next request can resume it.
        // A complete-but-unloadable model, on the other hand, is corrupt and must
        // be removed before retrying.
        if (await exists(MODEL_PART_FILE)) embedderPromise = null;
        else if (isModelFileError(error)) await clearModelCache();
        else await clearModelSupportCache();
        if (attempt < MAX_DOWNLOAD_RETRIES) await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
      }
    }
    downloadStatus = { state: "error", onnxState: downloadStatus.onnxState === "parsing" ? "failed" : "pending", downloadedBytes: 0, totalBytes: null, attempt: MAX_DOWNLOAD_RETRIES, error: lastError };
  })().finally(() => { preparationPromise = null; });
}

/** Removes the cached model and starts a fresh background download when no job is active. */
export async function restartLocalEmbeddingModelPrewarm() {
  if (preparationPromise) return false;
  await clearModelCache();
  downloadStatus = { state: "pending", onnxState: "pending", downloadedBytes: 0, totalBytes: null, attempt: 0 };
  startLocalEmbeddingModelPrewarm();
  return true;
}

export async function getLocalEmbeddingModelStatus(): Promise<LocalEmbeddingModelStatus> {
  if (await isModelReady()) {
    const modelBytes = await sizeOf(MODEL_FILE);
    return { state: "ready", onnxState: "ready", downloadedBytes: modelBytes, totalBytes: modelBytes, attempt: downloadStatus.attempt };
  }
  const downloadedBytes = await sizeOf(MODEL_PART_FILE) || await sizeOf(MODEL_FILE);
  return { ...downloadStatus, downloadedBytes: Math.max(downloadStatus.downloadedBytes, downloadedBytes) };
}

async function getEmbedder(progressId?: string): Promise<Embedder> {
  if (!embedderPromise) {
    const promise = (async () => {
      setComparisonProgress(progressId, { percent: 12, stage: "preparing", message: "正在检查本地语义模型…" });
      const { env, pipeline } = await import("@huggingface/transformers");
      env.cacheDir = EMBEDDING_CACHE_DIR;
      await ensureModelFile();
      downloadStatus = { ...downloadStatus, state: "verifying", onnxState: "parsing", downloadedBytes: await sizeOf(MODEL_FILE), totalBytes: await sizeOf(MODEL_FILE) };
      const extractor = await pipeline("feature-extraction", LOCAL_EMBEDDING_MODEL, {
        dtype: "q8",
        progress_callback: (event: unknown) => {
          const update = event as { status?: string; progress?: number; file?: string };
          const raw = Number(update.progress);
          const fraction = Number.isFinite(raw) ? Math.max(0, Math.min(raw > 1 ? raw / 100 : raw, 1)) : 0;
          setComparisonProgress(progressId, { percent: Math.max(14, Math.round(14 + fraction * 36)), stage: "downloading", message: update.file ? `正在下载 ${update.file}…` : "正在下载本地语义模型…" });
        },
      });
      await markModelReady();
      setComparisonProgress(progressId, { percent: 52, stage: "recognizing", message: "模型已就绪，正在理解答案…" });
      return async (values: string[]) => {
        const tensor = await extractor(values, { pooling: "cls", normalize: true }) as unknown as { tolist(): number[][] };
        return tensor.tolist();
      };
    })();
    embedderPromise = promise;
    try { return await promise; }
    catch (error) {
      if (embedderPromise === promise) embedderPromise = null;
      throw error;
    }
  }
  setComparisonProgress(progressId, { percent: 48, stage: "preparing", message: "正在加载已缓存的本地语义模型…" });
  return embedderPromise;
}

/** Shared local embedding entry point for features that need semantic matching. */
export async function embedTexts(values: string[], progressId?: string) {
  if (!values.length) return [];
  const embed = await getEmbedder(progressId);
  return embed(values);
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
    const candidates = points.flatMap((_, pointIndex) => segments.map((segment, segmentIndex) => ({ pointIndex, segment, score: cosineSimilarity(pointVectors[pointIndex], segmentVectors[segmentIndex]) }))).filter((candidate) => candidate.score >= 0.6).sort((left, right) => right.score - left.score || left.segment.text.length - right.segment.text.length);
    const selected = new Map<number, { segment: Segment; score: number }>();
    for (const candidate of candidates) {
      if (selected.has(candidate.pointIndex) || [...selected.entries()].some(([pointIndex, item]) => overlap(item.segment, candidate.segment) && !mayShareEvidence(points[candidate.pointIndex], points[pointIndex]))) continue;
      selected.set(candidate.pointIndex, candidate);
    }
    const mapped = points.map(({ id, content, role, parentId, weight }, pointIndex) => {
      const evidence = selected.get(pointIndex);
      const bestScore = evidence?.score ?? Math.max(0, ...segments.map((_, segmentIndex) => cosineSimilarity(pointVectors[pointIndex], segmentVectors[segmentIndex])));
      return { answerPointId: id, reference: content, role, parentId, weight, score: bestScore, status: statusFor(bestScore), evidence: evidence ? [evidenceFor(evidence.segment, evidence.score)] : [] } satisfies AnswerPointComparison;
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
  const used = new Map<string, string[]>();
  const pointById = new Map(points.map((point) => [point.id, point]));
  const matches = new Map((data.matches as Array<{ id?: unknown; status?: unknown; evidence?: unknown }>).flatMap((item) => {
    if (typeof item.id !== "string" || !["covered", "partial", "missing"].includes(String(item.status))) return [];
    const target = pointById.get(item.id);
    if (!target) return [];
    const evidence = Array.isArray(item.evidence) ? item.evidence.flatMap((value) => {
      if (typeof value !== "string" || !value.trim()) return [];
      const start = answer.indexOf(value, 0);
      const key = `${start}:${value.length}`;
      const existing = (used.get(key) ?? []).map((id) => pointById.get(id)).filter((point): point is NonNullable<typeof point> => Boolean(point));
      if (start < 0 || existing.some((point) => !mayShareEvidence(target, point))) return [];
      used.set(key, [...(used.get(key) ?? []), target.id]); return [{ text: value, start, end: start + value.length }];
    }) : [];
    if (String(item.status) !== "missing" && !evidence.length) return [];
    return [[item.id, { status: item.status as AnswerPointComparison["status"], evidence }]];
  }));
  if (matches.size === 0 && points.length > 0) throw new Error("模型没有返回可验证的对应片段");
  const result = points.map(({ id, content, role, parentId, weight }) => {
    const item = matches.get(id);
    const score = item?.status === "covered" ? 1 : item?.status === "partial" ? 0.68 : 0;
    return { answerPointId: id, reference: content, role, parentId, weight, status: item?.status ?? "missing", score, evidence: item?.evidence ?? [] };
  });
  return asComparison("llm", "llm", result);
}

export function evaluationFromComparison(comparison: AnswerComparison) {
  const covered = comparison.points.filter((point) => point.status !== "missing").map((point) => point.reference);
  const roleLabel: Record<AnswerPointRole, string> = { opening: "开场总述", key: "核心要点", closing: "收束总结" };
  const gaps = comparison.points.filter((point) => point.status === "missing").map((point) => `${roleLabel[roleOf(point)]}：${point.reference}`);
  const totalWeight = comparison.points.reduce((sum, point) => sum + (point.weight ?? 1), 0);
  const average = totalWeight ? comparison.points.reduce((sum, point) => sum + (point.status === "covered" ? 1 : point.status === "partial" ? .55 : 0) * (point.weight ?? 1), 0) / totalWeight : 0;
  const score = Math.round(average * 100);
  const suggestedRating = score < 35 ? "again" : score < 60 ? "hard" : score < 85 ? "good" : "easy";
  return { score, suggestedRating, covered, gaps, feedback: score >= 85 ? "回答覆盖充分，继续保持。" : `建议补充：${gaps.join("、") || "关键定义和具体例子"}。` } as const;
}
