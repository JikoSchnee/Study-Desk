import type { Tag, TagDisplayLanguage } from "@/lib/types";
export function formatTag(tag: Pick<Tag, "chinese" | "english">, language: TagDisplayLanguage) { const zh = tag.chinese.trim(); const en = tag.english.trim(); return language === "both" ? zh && en ? `${zh} | ${en}` : zh || en : language === "en" ? en || zh : zh || en; }
