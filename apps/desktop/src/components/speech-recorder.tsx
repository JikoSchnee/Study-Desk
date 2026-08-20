"use client";

import { useRef, useState } from "react";
import { Keyboard, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui";

declare global { interface Window { webkitSpeechRecognition?: new () => SpeechRecognition; SpeechRecognition?: new () => SpeechRecognition; } }
interface SpeechRecognition extends EventTarget { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; onresult: (event: { results: ArrayLike<{ [index: number]: { transcript: string } }> }) => void; onend: () => void; onerror: () => void; }

export function SpeechRecorder({ onTranscript }: { onTranscript: (value: string) => void }) {
  const [recording, setRecording] = useState(false);
  const recognition = useRef<SpeechRecognition | null>(null);
  const isWindowsDesktop = typeof window !== "undefined" && window.mockInterviewDesktop?.platform === "win32";
  if (isWindowsDesktop) return <span className="speech-fallback" role="note"><Keyboard size={16}/> Windows 桌面版暂不支持稳定的语音识别，请使用文本作答。</span>;
  const toggle = () => {
    if (recording) { recognition.current?.stop(); setRecording(false); return; }
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) { alert("当前浏览器不支持实时语音识别，请使用文本作答。"); return; }
    const instance = new Recognition();
    instance.lang = "zh-CN"; instance.continuous = false; instance.interimResults = false;
    instance.onresult = (event) => onTranscript(Array.from(event.results).map((result) => result[0].transcript).join(""));
    instance.onend = () => setRecording(false); instance.onerror = () => setRecording(false);
    recognition.current = instance; instance.start(); setRecording(true);
  };
  return <Button type="button" variant={recording ? "secondary" : "ghost"} onClick={toggle} aria-pressed={recording}>{recording ? <><Square size={17}/> 停止录音</> : <><Mic size={17}/> 语音作答</>}</Button>;
}
