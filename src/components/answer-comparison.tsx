"use client";

import { useState } from "react";
import type { AnswerComparison } from "@/lib/types";

const labels = { covered: "已覆盖", partial: "部分覆盖", missing: "待补充" } as const;

function fragments(answer: string, comparison: AnswerComparison) {
  const marks = comparison.points.flatMap((point, index) => point.evidence.map((item) => ({ ...item, index: index + 1 }))).sort((left, right) => left.start - right.start || right.end - left.end);
  const unique = marks.filter((item, index) => index === 0 || item.start >= marks[index - 1].end);
  const output: Array<string | { text: string; index: number }> = [];
  let cursor = 0;
  for (const mark of unique) {
    if (mark.start > cursor) output.push(answer.slice(cursor, mark.start));
    output.push({ text: answer.slice(mark.start, mark.end), index: mark.index });
    cursor = mark.end;
  }
  if (cursor < answer.length) output.push(answer.slice(cursor));
  return output;
}

export function AnswerComparisonView({ comparison, answer }: { comparison: AnswerComparison; answer: string }) {
  const [activePoint, setActivePoint] = useState<number | null>(null);
  const counts = comparison.points.reduce((all, point) => ({ ...all, [point.status]: all[point.status] + 1 }), { covered: 0, partial: 0, missing: 0 });
  return <section className="answer-comparison" aria-label="参考答案与本次回答对照">
    <div className="comparison-heading"><div><p className="eyebrow">答案对照</p><h3>看见每个要点落在了哪里。</h3></div><span className={`comparison-source ${comparison.source}`}>{comparison.source === "llm" ? "LLM 语义判断" : comparison.source === "embedding" ? "本地语义匹配" : "关键词比对"}</span></div>
    <div className="comparison-summary" aria-label={`已覆盖 ${counts.covered} 条，部分覆盖 ${counts.partial} 条，待补充 ${counts.missing} 条`}><span className="covered">已覆盖 {counts.covered}</span><span className="partial">部分覆盖 {counts.partial}</span><span className="missing">待补充 {counts.missing}</span></div>
    {comparison.warning && <p className="comparison-warning" role="status">{comparison.warning}</p>}
    <div className="comparison-columns">
      <section className="comparison-reference" aria-label="原始参考答案"><p className="eyebrow">原始答案要点</p><ol>{comparison.points.map((point, index) => <li key={point.answerPointId} className={`${point.status}${activePoint === index ? " linked-active" : activePoint !== null ? " linked-muted" : ""}`} tabIndex={0} onMouseEnter={() => setActivePoint(index)} onMouseLeave={() => setActivePoint(null)} onFocus={() => setActivePoint(index)} onBlur={() => setActivePoint(null)}><span className="comparison-index">{index + 1}</span><div><strong>{labels[point.status]}</strong><p>{point.reference}</p></div></li>)}</ol></section>
      <section className="comparison-response" aria-label="本次提交的答案"><p className="eyebrow">本次提交的答案</p><p className="comparison-response-text">{fragments(answer, comparison).map((part, index) => typeof part === "string" ? <span key={index}>{part}</span> : <mark key={index} className={`comparison-mark${activePoint === part.index - 1 ? " linked-active" : activePoint !== null ? " linked-muted" : ""}`} tabIndex={0} aria-label={`对应参考答案要点 ${part.index}`} onMouseEnter={() => setActivePoint(part.index - 1)} onMouseLeave={() => setActivePoint(null)} onFocus={() => setActivePoint(part.index - 1)} onBlur={() => setActivePoint(null)}><sup>{part.index}</sup>{part.text}</mark>)}</p><p className="comparison-key">悬停或聚焦任一带编号内容，会同时高亮另一侧对应要点。</p></section>
    </div>
  </section>;
}
