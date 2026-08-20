"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui";
import { DailyLearningReportView } from "@/components/daily-learning-report";
import { todayShanghai } from "@/lib/utils";
import type { DailyLearningReport } from "@/lib/types";

type DaySummary = { date: string; total: number; completed: number; minutes: number; hasReport: boolean };

function monthKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }

export function TrainingCalendar() {
  const [cursor, setCursor] = useState(() => new Date());
  const [days, setDays] = useState<DaySummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<DailyLearningReport | null>(null);
  const key = monthKey(cursor);
  const load = useCallback(() => fetch(`/api/calendar?month=${key}`).then((response) => response.json()).then((data) => setDays(data.days)), [key]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!selected) { setReport(null); return; }
    void fetch(`/api/calendar?month=${key}&date=${encodeURIComponent(selected)}`).then((response) => response.json()).then((data) => setReport(data.report ?? null)).catch(() => setReport(null));
  }, [key, selected]);
  const dateCells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    return [...Array(first.getDay()).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
  }, [cursor]);
  const records = Object.fromEntries(days.map((day) => [day.date, day]));
  const selectedDay = selected ? records[selected] : null;
  const today = todayShanghai();
  return <section className="training-calendar" aria-label="连续训练日历">
    <div className="calendar-toolbar"><Button variant="ghost" aria-label="上个月" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={19}/></Button><h3><CalendarDays size={16}/>{cursor.toLocaleDateString("zh-CN", { year: "numeric", month: "long" })}</h3><Button variant="ghost" aria-label="下个月" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={19}/></Button></div>
    <div className="calendar">{["日", "一", "二", "三", "四", "五", "六"].map((day) => <div className="weekday" key={day}>{day}</div>)}{dateCells.map((date, index) => {
      if (!date) return <div className="day empty" key={`empty-${index}`}/>;
      const value = `${key}-${String(date).padStart(2, "0")}`;
      const record = records[value];
      return <button key={value} className={`day ${value === today ? "today" : ""} ${value === selected ? "selected" : ""} ${record?.hasReport ? "reported" : ""}`} onClick={() => setSelected(value)} aria-label={`${value} ${record ? `${record.completed}/${record.total} 项完成${record.hasReport ? "，可查看报告" : ""}` : "暂无任务"}`}><b>{date}</b>{record ? <><div className="dot-row">{Array.from({ length: Math.min(record.completed, 5) }, (_, dot) => <i key={dot}/>)}</div><small>{record.completed}/{record.total}</small></> : <small>—</small>}</button>;
    })}</div>
    <div className="training-calendar-detail" aria-live="polite">{selected ? report ? <DailyLearningReportView report={report} /> : selectedDay ? <><strong>{selected}</strong><span>{selectedDay.completed === selectedDay.total ? "训练已完成；日报已超过保存期限。" : `完成 ${selectedDay.completed}/${selectedDay.total} 项 · 计划 ${selectedDay.minutes} 分钟`}</span></> : <><strong>{selected}</strong><span>这一天还没有生成学习任务。</span></> : <span>点选日期，查看当天的训练情况。</span>}</div>
  </section>;
}
