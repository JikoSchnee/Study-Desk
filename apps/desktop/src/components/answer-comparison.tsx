"use client";

import { useState } from "react";
import type { AnswerComparison, AnswerPointRole } from "@/lib/types";

const labels = { covered: "已覆盖", partial: "部分覆盖", missing: "待补充" } as const;
const sectionLabels: Record<AnswerPointRole, string> = { opening: "开场总述", key: "核心要点", closing: "收束总结" };
const sectionOrder: AnswerPointRole[] = ["opening", "key", "closing"];
const roleOf = (role?: AnswerPointRole): AnswerPointRole => role === "opening" || role === "closing" ? role : "key";

function fragments(answer: string, comparison: AnswerComparison) {
  const marks = comparison.points.flatMap((point, index) => point.evidence.map((item) => ({ ...item, index: index + 1 }))).sort((left, right) => left.start - right.start || right.end - left.end);
  const merged = marks.reduce<Array<{ start: number; end: number; indices: number[] }>>((all, mark) => {
    const current = all.at(-1);
    if (current && current.start === mark.start && current.end === mark.end) { current.indices.push(mark.index); return all; }
    if (current && mark.start < current.end) return all;
    all.push({ start: mark.start, end: mark.end, indices: [mark.index] }); return all;
  }, []);
  const output: Array<string | { text: string; indices: number[] }> = [];
  let cursor = 0;
  for (const mark of merged) {
    if (mark.start > cursor) output.push(answer.slice(cursor, mark.start));
    output.push({ text: answer.slice(mark.start, mark.end), indices: mark.indices });
    cursor = mark.end;
  }
  if (cursor < answer.length) output.push(answer.slice(cursor));
  return output;
}

export function AnswerComparisonView({ comparison, answer }: { comparison: AnswerComparison; answer: string }) {
  const [activePoints, setActivePoints] = useState<number[]>([]);
  const counts = comparison.points.reduce((all, point) => ({ ...all, [point.status]: all[point.status] + 1 }), { covered: 0, partial: 0, missing: 0 });
  const grouped = sectionOrder.map((role) => ({ role, points: comparison.points.flatMap((point, index) => roleOf(point.role) === role ? [{ point, index }] : []) })).filter((group) => group.points.length);
  const labelsById = new Map<string, string>();
  let rootIndex = 0; const childCount = new Map<string, number>();
  for (const point of comparison.points) if (roleOf(point.role) === "key") {
    if (!point.parentId) { rootIndex += 1; labelsById.set(point.answerPointId, String(rootIndex)); }
    else { const count = (childCount.get(point.parentId) ?? 0) + 1; childCount.set(point.parentId, count); labelsById.set(point.answerPointId, `${labelsById.get(point.parentId) ?? rootIndex}.${count}`); }
  }
  const activeClass = (index: number) => activePoints.includes(index) ? " linked-active" : activePoints.length ? " linked-muted" : "";
  const Point = ({ point, index, subpoints = [] }: { point: AnswerComparison["points"][number]; index: number; subpoints?: Array<{ point: AnswerComparison["points"][number]; index: number }> }) => <li className={`${point.status}${activeClass(index)}`} tabIndex={0} onMouseEnter={() => setActivePoints([index])} onMouseLeave={() => setActivePoints([])} onFocus={() => setActivePoints([index])} onBlur={() => setActivePoints([])}><span className={`comparison-index${(labelsById.get(point.answerPointId) ?? String(index + 1)).length > 1 ? " hierarchy" : ""}`}>{labelsById.get(point.answerPointId) ?? index + 1}</span><div><strong>{labels[point.status]}</strong><p>{point.reference}</p></div>{subpoints.length > 0 && <ol className="comparison-subpoints">{subpoints.map(({ point: child, index: childIndex }) => <Point point={child} index={childIndex} key={child.answerPointId}/>)}</ol>}</li>;
  return <section className="answer-comparison" aria-label="参考答案与本次回答对照">
    <div className="comparison-heading"><div><p className="eyebrow">答案对照</p><h3>看见每个要点落在了哪里。</h3></div><span className={`comparison-source ${comparison.source}`}>{comparison.source === "llm" ? "LLM 语义判断" : comparison.source === "embedding" ? "本地语义匹配" : "关键词比对"}</span></div>
    <div className="comparison-summary" aria-label={`已覆盖 ${counts.covered} 条，部分覆盖 ${counts.partial} 条，待补充 ${counts.missing} 条`}><span className="covered">已覆盖 {counts.covered}</span><span className="partial">部分覆盖 {counts.partial}</span><span className="missing">待补充 {counts.missing}</span></div>
    {comparison.warning && <p className="comparison-warning" role="status">{comparison.warning}</p>}
    <div className="comparison-columns">
      <section className="comparison-reference" aria-label="原始参考答案"><p className="eyebrow">原始答案结构</p><div className="comparison-sections">{grouped.map((group) => <section className={`comparison-section ${group.role}`} key={group.role}><div><strong>{sectionLabels[group.role]}</strong>{group.role !== "key" && <small>结构项</small>}</div><ol>{group.role === "key" ? group.points.filter(({ point }) => !point.parentId).map(({ point, index }) => <Point point={point} index={index} subpoints={group.points.filter(({ point: child }) => child.parentId === point.answerPointId)} key={point.answerPointId}/>) : group.points.map(({ point, index }) => <Point point={point} index={index} key={point.answerPointId}/>)}</ol></section>)}</div></section>
      <section className="comparison-response" aria-label="本次提交的答案"><p className="eyebrow">本次提交的答案</p><p className="comparison-response-text">{fragments(answer, comparison).map((part, index) => typeof part === "string" ? <span key={index}>{part}</span> : <mark key={index} className={`comparison-mark${part.indices.some((pointIndex) => activePoints.includes(pointIndex - 1)) ? " linked-active" : activePoints.length ? " linked-muted" : ""}`} tabIndex={0} aria-label={`对应参考答案要点 ${part.indices.join("、")}`} onMouseEnter={() => setActivePoints(part.indices.map((pointIndex) => pointIndex - 1))} onMouseLeave={() => setActivePoints([])} onFocus={() => setActivePoints(part.indices.map((pointIndex) => pointIndex - 1))} onBlur={() => setActivePoints([])}><sup>{part.indices.join("/")}</sup>{part.text}</mark>)}</p><p className="comparison-key">悬停或聚焦任一带编号内容，会同时高亮另一侧对应要点。</p></section>
    </div>
  </section>;
}
