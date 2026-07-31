"use client";

import { FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowDown, ArrowUp, ArrowUpDown, CalendarClock, CheckCircle2, CircleHelp, Clock3, Download, FilePlus2, FileSpreadsheet, LibraryBig, MessageSquareText, MoreHorizontal, PencilLine, Search, Sparkles, Tag, Tags, Trash2, Undo2, X } from "lucide-react";
import { CardWorkspace } from "@/components/card-workspace";
import { BulkCardEditDialog } from "@/components/bulk-card-edit-dialog";
import { CardDetailsDialog } from "@/components/card-details-dialog";
import { AnswerStructureEditor as AnswerPointsEditor, cardRecommendationDraftKey, cardRecommendationExcludedIds, type CardRecommendationDraft, type CardRecommendationResult, QuestionWordingsEditor, RelatedCardsEditor, TagRecommendations, useCardRecommendations } from "@/components/card-form-editors";
import { RarityPreviewDialog } from "@/components/rarity-preview-dialog";
import { KnowledgeBaseExamplesDialog } from "@/components/knowledge-base-examples-dialog";
import { KnowledgeCardFrame } from "@/components/knowledge-card-frame";
import { LLMConfigurationDialog } from "@/components/llm-configuration-dialog";
import { TagManagerDialog } from "@/components/tag-manager-dialog";
import { formatTag } from "@/lib/tags-client";
import { PageHeader, PageLayout } from "@/components/page-layout";
import { SearchableSelect } from "@/components/searchable-select";
import { Button, Chip, EmptyState } from "@/components/ui";
import { TourButton } from "@/components/tour";
import { usePageState, usePageStateCache } from "@/components/page-state-cache";
import { difficultyTier, type CardSort, type SortDirection } from "@/lib/card-filters";
import { rarityPreset, stabilityRarityTier, type StabilityRarityPreset } from "@/lib/card-tiers";
import { answerPointsToNumberedText, splitTags } from "@/lib/import";
import { withTrackTag } from "@/lib/utils";
import type { AnswerPoint, Card, CardLearningDetails, CardLearningSummary, CardRelation, CardRelationType, QuestionVariant, Tag as TagItem, TagDisplayLanguage } from "@/lib/types";

type CardDraft = { question: string; questionVariants: QuestionVariant[]; relations: CardRelation[]; answerPoints: AnswerPoint[]; note: string; track: string; tags: string; source: string };
type EditorSaveState = "idle" | "saving" | "success";
type WorkspaceMode = "manual" | "import";
type BulkEditMode = "tags" | "track";
const defaultKnowledgeBaseTypes = ["Agent", "Java 后端", "计算机基础"];
const cardsPageSize = 20;
const localRequestTimeoutMs = 10_000;
type CardPage = { cards: Card[]; learning: Record<string, CardLearningSummary>; total: number; hasMore: boolean; facets: { tracks: string[]; tags: string[] } };

async function fetchJsonWithTimeout<T>(input: RequestInfo | URL, init: RequestInit = {}, label = "本地服务") {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  init.signal?.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, localRequestTimeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const data = await response.json() as T;
    if (!response.ok) throw new Error((data as { error?: string }).error ?? `${label}返回了 HTTP ${response.status}。`);
    return data;
  } catch (error) {
    if (timedOut) throw new Error(`${label}在 10 秒内未响应，请确认桌面应用仍在运行后重试。`);
    throw error;
  } finally {
    window.clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abort);
  }
}

function compactReviewTime(value: string | null | undefined, future = false) {
  if (!value) return future ? "待首次作答" : "尚未练习";
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60_000);
  if (future) {
    if (minutes <= 0) return "现在可复习";
    if (minutes < 60) return `${minutes} 分钟后`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} 小时后`;
    return `${Math.round(minutes / 1440)} 天后`;
  }
  const elapsed = Math.max(0, -minutes);
  if (elapsed < 60) return "刚刚练习";
  if (elapsed < 1440) return `${Math.round(elapsed / 60)} 小时前`;
  return `${Math.round(elapsed / 1440)} 天前`;
}

function targetsCardControl(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("button, a, input, select, textarea, label, summary, details, [data-card-interactive]"));
}

const recommendationPreloadDistance = 3 * (470 + 16);

function recommendationDraftForCard(card: Card): CardRecommendationDraft {
  return { question: card.question, questionVariants: card.questionVariants, answerPoints: card.answerPoints, note: card.note, track: card.track, tags: card.tags };
}

function recommendationCacheKey(card: Card) { return `${card.id}:${card.updatedAt}`; }

function useCardRecommendationPreload() {
  const [recommendations, setRecommendations] = useState<Record<string, CardRecommendationResult>>({});
  const cache = useRef<Record<string, CardRecommendationResult>>({});
  const nodes = useRef(new Map<HTMLElement, { id: string; cacheKey: string }>());
  const observer = useRef<IntersectionObserver | null>(null);
  const queue = useRef(new Map<string, string>());
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<number | null>(null);
  const generation = useRef(0);
  const processQueue = useRef<() => void>(() => undefined);

  const schedule = useCallback(() => {
    if (inFlight.current || timer.current !== null || !queue.current.size) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      processQueue.current();
    }, 0);
  }, []);

  processQueue.current = () => {
    if (inFlight.current) return;
    const queued = [...queue.current.entries()].filter(([cacheKey]) => !cache.current[cacheKey]);
    queue.current.clear();
    if (!queued.length) return;
    const cardIds = queued.map(([, cardId]) => cardId);
    const cacheKeysByCardId = new Map(queued.map(([cacheKey, cardId]) => [cardId, cacheKey]));

    const currentGeneration = generation.current;
    const requestController = new AbortController();
    controller.current = requestController;
    inFlight.current = true;
    void fetch("/api/cards/recommendations/preload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardIds }), signal: requestController.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to preload recommendations.");
        return response.json() as Promise<{ recommendations?: Record<string, CardRecommendationResult> }>;
      })
      .then((data) => {
        if (generation.current !== currentGeneration) return;
        const next = data.recommendations ?? {};
        if (!Object.keys(next).length) return;
        cache.current = { ...cache.current, ...Object.fromEntries(Object.entries(next).flatMap(([cardId, result]) => {
          const cacheKey = cacheKeysByCardId.get(cardId);
          return cacheKey ? [[cacheKey, result]] : [];
        })) };
        setRecommendations(cache.current);
      })
      .catch(() => undefined)
      .finally(() => {
        if (generation.current !== currentGeneration) return;
        inFlight.current = false;
        controller.current = null;
        schedule();
      });
  };

  const enqueue = useCallback((card: { id: string; cacheKey: string }) => {
    if (cache.current[card.cacheKey]) return;
    queue.current.set(card.cacheKey, card.id);
    schedule();
  }, [schedule]);

  const registerCard = useCallback((card: Card, node: HTMLElement | null) => {
    for (const [currentNode, currentCard] of nodes.current) if (currentCard.id === card.id) {
      observer.current?.unobserve(currentNode);
      nodes.current.delete(currentNode);
    }
    if (!node) return;
    nodes.current.set(node, { id: card.id, cacheKey: recommendationCacheKey(card) });
    observer.current?.observe(node);
  }, []);

  const clear = useCallback(() => {
    generation.current += 1;
    controller.current?.abort();
    controller.current = null;
    inFlight.current = false;
    queue.current.clear();
    cache.current = {};
    setRecommendations({});
  }, []);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const nextObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        const card = nodes.current.get(entry.target as HTMLElement);
        if (card) enqueue(card);
      }
    }, { rootMargin: `0px 0px ${recommendationPreloadDistance}px 0px` });
    observer.current = nextObserver;
    for (const node of nodes.current.keys()) nextObserver.observe(node);
    return () => { nextObserver.disconnect(); if (observer.current === nextObserver) observer.current = null; };
  }, [enqueue]);

  useEffect(() => () => {
    controller.current?.abort();
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  return { recommendations, registerCard, clear };
}

export function CardLibrary() {
  const pageStateCache = usePageStateCache();
  const editCardId = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("editCardId");
  const [cards, setCards] = useState<Card[]>([]);
  const [learningByCardId, setLearningByCardId] = useState<Record<string, CardLearningSummary>>({});
  const [relationCards, setRelationCards] = useState<Card[]>([]);
  const [cardsTotal, setCardsTotal] = useState(0);
  const [hasMoreCards, setHasMoreCards] = useState(false);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [cardsLoadingMore, setCardsLoadingMore] = useState(false);
  const [cardsError, setCardsError] = useState("");
  const [catalogTracks, setCatalogTracks] = useState<string[]>([]);
  const [catalogTags, setCatalogTags] = useState<string[]>([]);
  const [detail, setDetail] = usePageState<{ card: Card; relatedCards: Array<Card & { relationType: CardRelationType }>; learning: CardLearningDetails } | null>("library:detail", null);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = usePageState("library:query", "");
  const [selectedTrack, setSelectedTrack] = usePageState("library:selected-track", "");
  const [selectedTags, setSelectedTags] = usePageState<Set<string>>("library:selected-tags", new Set());
  const [sort, setSort] = usePageState<CardSort>("library:sort", "created");
  const [sortDirection, setSortDirection] = usePageState<SortDirection>("library:sort-direction", "desc");
  const [editingCard, setEditingCard] = usePageState<Card | null>("library:editing-card", null);
  const [editingDraft, setEditingDraft] = usePageState<CardDraft | null>("library:editing-draft", null);
  const [editBusy, setEditBusy] = useState(false);
  const [editorSaveState, setEditorSaveState] = useState<EditorSaveState>("idle");
  const [editorSaveError, setEditorSaveError] = useState("");
  const [aiCandidates, setAiCandidates] = useState<QuestionVariant[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [needsLLMConfiguration, setNeedsLLMConfiguration] = useState(false);
  const [rarityPreviewOpen, setRarityPreviewOpen] = useState(false);
  const [knowledgeExamplesOpen, setKnowledgeExamplesOpen] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [tagCatalog, setTagCatalog] = useState<TagItem[]>([]);
  const [tagDisplayLanguage, setTagDisplayLanguage] = useState<TagDisplayLanguage>("zh");
  const [stabilityRarityPreset, setStabilityRarityPreset] = useState<StabilityRarityPreset>("memory-cycle");
  const [selectedIds, setSelectedIds] = usePageState<Set<string>>("library:selected-ids", new Set());
  const [bulkEditMode, setBulkEditMode] = usePageState<BulkEditMode | null>("library:bulk-edit-mode", null);
  const [showArchived, setShowArchived] = usePageState("library:show-archived", false);
  const [workspaceMode, setWorkspaceMode] = usePageState<WorkspaceMode | null>("library:workspace-mode", null);
  const [workspaceOpen, setWorkspaceOpen] = usePageState("library:workspace-open", false);
  const editorSaveStatusRef = useRef<HTMLDivElement>(null);
  const workspaceSwitchTimer = useRef<number | null>(null);
  const cardsRequestController = useRef<AbortController | null>(null);
  const cardsRequestGeneration = useRef(0);
  const [loadMoreNode, setLoadMoreNode] = useState<HTMLDivElement | null>(null);
  const [filterBarNode, setFilterBarNode] = useState<HTMLDivElement | null>(null);
  const [filterBarAboveViewport, setFilterBarAboveViewport] = useState(false);
  const [returnScrollPosition, setReturnScrollPosition] = useState<number | null>(null);
  const recommendationPreload = useCardRecommendationPreload();
  const editorRecommendationDraft = useMemo<CardRecommendationDraft>(() => ({ question: editingDraft?.question ?? "", questionVariants: editingDraft?.questionVariants ?? [], answerPoints: editingDraft?.answerPoints ?? [], note: editingDraft?.note ?? "", track: editingDraft?.track ?? "", tags: splitTags(editingDraft?.tags ?? "") }), [editingDraft]);
  const preloadedEditorResult = editingCard ? recommendationPreload.recommendations[recommendationCacheKey(editingCard)] : undefined;
  const preloadedEditorRecommendations = useMemo(() => {
    if (!editingCard) return undefined;
    if (!preloadedEditorResult) return undefined;
    const persistedDraft = recommendationDraftForCard(editingCard);
    return { draftKey: cardRecommendationDraftKey(persistedDraft), excludedIds: cardRecommendationExcludedIds(editingCard.id, editingCard.relations), result: preloadedEditorResult };
  }, [editingCard, preloadedEditorResult]);
  const editorRecommendations = useCardRecommendations(editorRecommendationDraft, editingCard?.id, editingDraft?.relations ?? [], preloadedEditorRecommendations);
  useEffect(() => {
    setEditingDraft((draft) => {
      if (!draft) return draft;
      const tags = withTrackTag(draft.track, splitTags(draft.tags)).join(", ");
      return tags === draft.tags ? draft : { ...draft, tags };
    });
  }, [editingDraft?.track]);

  const loadCardsPage = useCallback(async (offset: number, replace = false) => {
    if (replace) { cardsRequestGeneration.current += 1; cardsRequestController.current?.abort(); setCardsLoading(true); setCardsError(""); setReturnScrollPosition(null); }
    else setCardsLoadingMore(true);
    const generation = cardsRequestGeneration.current;
    const controller = new AbortController();
    cardsRequestController.current = controller;
    const params = new URLSearchParams({ offset: String(offset), limit: String(cardsPageSize), query, track: selectedTrack, sort, direction: sortDirection, archived: String(showArchived) });
    for (const tag of selectedTags) params.append("tag", tag);
    try {
      const data = await fetchJsonWithTimeout<CardPage>(`/api/cards?${params}`, { signal: controller.signal }, "藏品");
      if (generation !== cardsRequestGeneration.current) return;
      setCards((current) => replace ? data.cards : [...current, ...data.cards.filter((card) => !current.some((existing) => existing.id === card.id))]);
      setLearningByCardId((current) => replace ? data.learning : { ...current, ...data.learning });
      setCardsTotal(data.total);
      setHasMoreCards(data.hasMore);
      setCatalogTracks(data.facets.tracks);
      setCatalogTags(data.facets.tags);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        const message = error instanceof Error ? error.message : "无法读取卡片。";
        if (replace) setCardsError(message);
        setNotice(message);
      }
    } finally {
      if (generation === cardsRequestGeneration.current) { setCardsLoading(false); setCardsLoadingMore(false); }
    }
  }, [query, selectedTrack, selectedTags, showArchived, sort, sortDirection]);
  const load = useCallback(async () => {
    const [settingsResult, tagsResult] = await Promise.allSettled([
      fetchJsonWithTimeout<{ stabilityRarityPreset?: string; tagDisplayLanguage?: string }>("/api/settings", {}, "设置服务"),
      fetchJsonWithTimeout<{ tags?: TagItem[] }>("/api/tags", {}, "标签服务"),
    ]);
    if (settingsResult.status === "fulfilled") {
      const settings = settingsResult.value;
      setStabilityRarityPreset(rarityPreset(settings.stabilityRarityPreset));
      setTagDisplayLanguage(settings.tagDisplayLanguage === "en" || settings.tagDisplayLanguage === "both" ? settings.tagDisplayLanguage : "zh");
    }
    if (tagsResult.status === "fulfilled") setTagCatalog(tagsResult.value.tags ?? []);
    const auxiliaryFailure = [settingsResult, tagsResult].find((result) => result.status === "rejected");
    if (auxiliaryFailure?.status === "rejected") setNotice(auxiliaryFailure.reason instanceof Error ? auxiliaryFailure.reason.message : "部分藏品信息暂时无法读取。");
    await loadCardsPage(0, true);
  }, [loadCardsPage]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => cardsRequestController.current?.abort(), []);
  useEffect(() => () => {
    if (workspaceSwitchTimer.current !== null) window.clearTimeout(workspaceSwitchTimer.current);
  }, []);
  useEffect(() => {
    if (window.localStorage.getItem("mock-interview:supplement-draft") || window.localStorage.getItem("mock-interview:follow-up-card-draft") || window.localStorage.getItem("mock-interview:learning-chat-card-draft")) {
      setWorkspaceMode("manual");
      setWorkspaceOpen(true);
    }
  }, []);
  useEffect(() => {
    if (!loadMoreNode || !hasMoreCards || cardsLoading || cardsLoadingMore) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void loadCardsPage(cards.length);
    }, { rootMargin: "0px 0px 480px 0px" });
    observer.observe(loadMoreNode);
    return () => observer.disconnect();
  }, [cards.length, cardsLoading, cardsLoadingMore, hasMoreCards, loadCardsPage, loadMoreNode]);
  useEffect(() => {
    if (!filterBarNode) return;
    const observer = new IntersectionObserver(([entry]) => {
      setFilterBarAboveViewport(!entry.isIntersecting && entry.boundingClientRect.bottom < 0);
    }, { threshold: 0 });
    observer.observe(filterBarNode);
    return () => observer.disconnect();
  }, [filterBarNode]);
  useEffect(() => {
    const clearSavedPosition = () => setReturnScrollPosition(null);
    const clearOnKeyboardScroll = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest(".library-scroll-toggle")) return;
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) clearSavedPosition();
    };
    window.addEventListener("wheel", clearSavedPosition, { passive: true });
    window.addEventListener("touchstart", clearSavedPosition, { passive: true });
    window.addEventListener("keydown", clearOnKeyboardScroll);
    return () => {
      window.removeEventListener("wheel", clearSavedPosition);
      window.removeEventListener("touchstart", clearSavedPosition);
      window.removeEventListener("keydown", clearOnKeyboardScroll);
    };
  }, []);
  useEffect(() => {
    const closeWhenFocusLeaves = (event: FocusEvent | PointerEvent) => {
      const dropdown = document.querySelector<HTMLDetailsElement>(".template-download[open]");
      if (dropdown && event.target instanceof Node && !dropdown.contains(event.target)) dropdown.removeAttribute("open");
    };
    const closeAfterDownload = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>(".template-download a") : null;
      link?.closest<HTMLDetailsElement>(".template-download")?.removeAttribute("open");
    };
    document.addEventListener("focusin", closeWhenFocusLeaves);
    document.addEventListener("pointerdown", closeWhenFocusLeaves);
    document.addEventListener("click", closeAfterDownload);
    return () => {
      document.removeEventListener("focusin", closeWhenFocusLeaves);
      document.removeEventListener("pointerdown", closeWhenFocusLeaves);
      document.removeEventListener("click", closeAfterDownload);
    };
  }, []);
  const savedKnowledgeBaseTypes = useMemo(() => catalogTracks, [catalogTracks]);
  const knowledgeBaseTypeSuggestions = useMemo(() => [...new Set([...defaultKnowledgeBaseTypes, ...savedKnowledgeBaseTypes])].sort((left, right) => left.localeCompare(right, "zh-CN")), [savedKnowledgeBaseTypes]);
  const tags = useMemo(() => catalogTags, [catalogTags]);
  const tagLabel = useCallback((key: string) => { const tag = tagCatalog.find((item) => item.key === key.toLocaleLowerCase()); return tag ? formatTag(tag, tagDisplayLanguage) : key; }, [tagCatalog, tagDisplayLanguage]);
  const changeSort = (next: CardSort) => { setSort(next); setSortDirection(next === "review" || next === "difficulty" ? "asc" : "desc"); };
  const clearFilters = () => { setQuery(""); setSelectedTrack(""); setSelectedTags(new Set()); setSort("created"); setSortDirection("desc"); setShowArchived(false); };
  const cancelWorkspaceSwitch = () => {
    if (workspaceSwitchTimer.current === null) return;
    window.clearTimeout(workspaceSwitchTimer.current);
    workspaceSwitchTimer.current = null;
  };
  const closeWorkspace = () => {
    cancelWorkspaceSwitch();
    if (!workspaceMode) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setWorkspaceMode(null);
      setWorkspaceOpen(false);
      return;
    }
    setWorkspaceOpen(false);
    workspaceSwitchTimer.current = window.setTimeout(() => {
      workspaceSwitchTimer.current = null;
      setWorkspaceMode(null);
    }, 300);
  };
  const openWorkspace = (mode: WorkspaceMode) => {
    setNotice("");
    if (workspaceMode === mode && workspaceOpen) return;
    cancelWorkspaceSwitch();
    if (!workspaceMode || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setWorkspaceMode(mode);
      setWorkspaceOpen(true);
      return;
    }
    setWorkspaceOpen(false);
    workspaceSwitchTimer.current = window.setTimeout(() => {
      workspaceSwitchTimer.current = null;
      setWorkspaceMode(mode);
      setWorkspaceOpen(true);
    }, 300);
  };
  const completeWorkspace = (message: string, mode: WorkspaceMode) => {
    if (mode === "import") closeWorkspace();
    setNotice(message);
    void load();
    if (mode === "manual") {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      window.scrollTo({ top: 0, behavior });
    }
  };
  const completeCardSave = useCallback(() => {
    setEditingCard(null); setEditingDraft(null); setAiCandidates([]); setEditorSaveError(""); setEditorSaveState("idle"); setEditBusy(false);
  }, []);
  useEffect(() => {
    if (editorSaveState === "idle") return;
    const frame = window.requestAnimationFrame(() => editorSaveStatusRef.current?.focus({ preventScroll: true }));
    const completionTimer = editorSaveState === "success" ? window.setTimeout(completeCardSave, 900) : null;
    return () => { window.cancelAnimationFrame(frame); if (completionTimer !== null) window.clearTimeout(completionTimer); };
  }, [completeCardSave, editorSaveState]);

  const closeEditor = () => {
    if (editBusy || editorSaveState !== "idle") return;
    setEditingCard(null); setEditingDraft(null); setAiCandidates([]); setEditorSaveError("");
  };
  const openCardDetails = async (card: Card) => {
    setDetailLoading(card.id); setNotice("");
    try {
      const response = await fetch(`/api/cards/${card.id}/details`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "无法读取卡片详情。");
      setDetail({ card: data.card, relatedCards: data.relatedCards ?? [], learning: data.learning });
    } catch (error) { setNotice(error instanceof Error ? error.message : "无法读取卡片详情。"); }
    finally { setDetailLoading(null); }
  };
  const openCardEditor = (card: Card) => {
    setEditingCard(card);
    setEditingDraft({ question: card.question, questionVariants: card.questionVariants.map((item) => ({ ...item })), relations: card.relations, answerPoints: card.answerPoints.map((item) => ({ ...item })), note: card.note, track: card.track, tags: card.tags.join(", "), source: card.source ?? "" });
    setAiCandidates([]);
    setEditorSaveState("idle");
    setEditorSaveError("");
    setNotice("");
    void fetch("/api/cards/options").then(async (response) => {
      if (!response.ok) throw new Error("无法读取关联卡片。");
      return response.json() as Promise<{ cards: Card[] }>;
    }).then((data) => setRelationCards(data.cards)).catch(() => setRelationCards(cards));
  };
  useEffect(() => {
    if (!editCardId || editingCard?.id === editCardId) return;
    const loaded = cards.find((card) => card.id === editCardId);
    if (loaded) { openCardEditor(loaded); return; }
    void fetch(`/api/cards/${editCardId}/details`).then(async (response) => {
      if (!response.ok) throw new Error("无法读取卡片。");
      return response.json() as Promise<{ card: Card }>;
    }).then((data) => openCardEditor(data.card)).catch(() => setNotice("无法打开这张卡片的编辑窗口。"));
  }, [cards, editCardId, editingCard?.id]);
  const generateVariants = async (question: string, answerPoints: AnswerPoint[], existing: QuestionVariant[]) => {
    if (question.trim().length < 3 || !answerPoints.some((item) => item.content.trim())) { setNotice("请先填写主问题和至少一条答案要点，再让 AI 补充问法。"); return; }
    setAiBusy(true); setNotice("");
    try {
      const response = await fetch("/api/cards/question-variants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, answerPoints: answerPoints.map((item) => item.content.trim()).filter(Boolean), existingQuestions: [...existing.map((item) => item.content), ...aiCandidates.map((item) => item.content)] }) });
      const data = await response.json();
      if (!response.ok) { if (data.requiresConfiguration) setNeedsLLMConfiguration(true); throw new Error(data.error ?? "暂时无法生成问法。"); }
      setAiCandidates((items) => [...items, ...data.candidates]);
    } catch (error) { setNotice(error instanceof Error ? error.message : "暂时无法生成问法。"); }
    finally { setAiBusy(false); }
  };
  const saveCardEditor = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingCard || !editingDraft) return;
    setEditBusy(true); setEditorSaveState("saving"); setEditorSaveError("");
    let saved = false;
    try {
      const response = await fetch("/api/cards", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingCard.id, ...editingDraft, track: editingDraft.track.trim(), tags: splitTags(editingDraft.tags) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "无法保存卡片。");
      // The mutation response is authoritative.  Render the confirmation immediately
      // instead of making its visibility depend on a second, unrelated GET request.
      recommendationPreload.clear();
      setCards((current) => current.map((card) => card.id === data.card.id ? data.card : card));
      const reviewCard = pageStateCache.get("review:card") as Card | null | undefined;
      if (reviewCard?.id === data.card.id) pageStateCache.set("review:card", data.card);
      await load();
      saved = true;
      setEditorSaveState("success");
    } catch (error) {
      setEditorSaveError(error instanceof Error ? error.message : "无法保存卡片。");
      setEditorSaveState("idle");
    } finally { if (!saved) setEditBusy(false); }
  };
  const toggleSelected = (id: string) => setSelectedIds((ids) => { const next = new Set(ids); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const showActiveCards = () => { setShowArchived(false); setSelectedIds(new Set()); };
  const selectFromCardSurface = (event: ReactMouseEvent<HTMLElement>, id: string) => {
    if (!selectedIds.size || targetsCardControl(event.target)) return;
    toggleSelected(id);
  };
  const selectFromCardKeyboard = (event: ReactKeyboardEvent<HTMLElement>, id: string) => {
    if (!selectedIds.size || targetsCardControl(event.target) || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    toggleSelected(id);
  };
  const bulk = async (action: "archive" | "restore" | "move" | "addTags" | "delete", value?: string | string[], ids = [...selectedIds]): Promise<string | null> => {
    if (!ids.length) return "请先选择至少一张卡片。";
    if (action === "delete" && !window.confirm(`永久删除 ${ids.length} 张卡片及其学习记录？此操作无法撤销。`)) return "";
    try {
      const response = await fetch("/api/cards/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ids, value }) });
      const body = await response.text();
      let data: { error?: string };
      try { data = JSON.parse(body) as { error?: string }; }
      catch { throw new Error(`本地服务返回了无法识别的数据（HTTP ${response.status}）。`); }
      if (!response.ok) throw new Error(data.error ?? "批量操作失败。");
      recommendationPreload.clear(); setSelectedIds(new Set()); setNotice(action === "delete" ? "已永久删除所选卡片和关联记录。" : "已更新所选卡片。"); await load();
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "批量操作失败。";
      setNotice(message);
      return message;
    }
  };
  const exportSelected = (format: "json" | "csv") => {
    const selected = cards.filter((card) => selectedIds.has(card.id));
    if (!selected.length) return;
    const content = format === "json" ? JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), cards: selected }, null, 2) : ["问题,其他问法,开场总述,答案,回忆提示,收束总结,知识库类型,标签,状态", ...selected.map((card) => { const opening = card.answerPoints.find((point) => point.role === "opening")?.content ?? ""; const closing = card.answerPoints.find((point) => point.role === "closing")?.content ?? ""; return [card.question, card.questionVariants.map((point) => point.content).join("\n"), opening, answerPointsToNumberedText(card.answerPoints), answerPointsToNumberedText(card.answerPoints, "hint"), closing, card.track, card.tags.join("|"), card.status].map((value) => `\"${value.replaceAll("\"", "\"\"")}\"`).join(","); })].join("\n");
    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `mock-interview-cards.${format}`; link.click(); URL.revokeObjectURL(url);
  };
  const navigateLibraryScroll = () => {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    if (returnScrollPosition !== null) {
      const target = returnScrollPosition;
      setReturnScrollPosition(null);
      window.scrollTo({ top: target, behavior });
      return;
    }
    setReturnScrollPosition(window.scrollY);
    window.scrollTo({ top: 0, behavior });
  };

  return <PageLayout className="cards-library-page">{detail && <CardDetailsDialog card={detail.card} relatedCards={detail.relatedCards} learning={detail.learning} onClose={() => setDetail(null)} />}{rarityPreviewOpen && <RarityPreviewDialog preset={stabilityRarityPreset} onClose={() => setRarityPreviewOpen(false)} />}{knowledgeExamplesOpen && <KnowledgeBaseExamplesDialog preset={stabilityRarityPreset} onClose={() => setKnowledgeExamplesOpen(false)} />}{tagManagerOpen && <TagManagerDialog tags={tagCatalog} language={tagDisplayLanguage} onClose={() => setTagManagerOpen(false)} onChange={load} />}{bulkEditMode && <BulkCardEditDialog mode={bulkEditMode} cardCount={selectedIds.size} tags={tags} tracks={knowledgeBaseTypeSuggestions} onClose={() => setBulkEditMode(null)} onSubmit={(value) => bulk(bulkEditMode === "tags" ? "addTags" : "move", value)} />}<LLMConfigurationDialog open={needsLLMConfiguration} onClose={() => setNeedsLLMConfiguration(false)} purpose="AI 补充问法" />
    <PageHeader eyebrow={<><LibraryBig size={15}/> 藏品</>} title="把积累的知识，随时翻出来练。" description="筛选、编辑或查看学习轨迹，让每一张卡片保持可用。" tour="library" actionRows={<div className="library-header-actions"><div className="library-header-action-row"><Button type="button" variant="secondary" onClick={() => setTagManagerOpen(true)}><Tags size={17}/> 标签管理</Button><Button type="button" variant="ghost" className="card-icon-action" onClick={() => setKnowledgeExamplesOpen(true)} data-tooltip="知识库示例" aria-label="知识库示例" title="知识库示例"><CircleHelp size={18}/></Button><TourButton tour="library" iconOnly /></div><div className="library-header-action-row"><Button type="button" onClick={() => openWorkspace("manual")} data-tour="library-create-card"><FilePlus2 size={17}/> 创建卡片</Button><div className="cards-import-actions"><Button type="button" variant="secondary" onClick={() => openWorkspace("import")}><FileSpreadsheet size={17}/> 导入卡片</Button><details className="template-download"><summary>下载模板文件</summary><div className="template-download-options"><p>CSV 模板中，其他问法、答案要点和回忆提示均可在同一单元格内换行；答案与提示会按行配对。</p><a href="/cards-import-template.md" download>Markdown 模板</a><a href="/cards-import-template.csv" download>CSV 模板（完整字段）</a></div></details></div></div></div>} />
    {notice && <div className="notice" role="status" style={{ marginBottom: 20 }}>{notice}</div>}
    <div className={`library-workspace ${workspaceOpen ? "open" : ""}`} aria-hidden={!workspaceOpen}><div className="library-workspace-inner">{workspaceMode && <CardWorkspace key={workspaceMode} initialMode={workspaceMode} onClose={closeWorkspace} onComplete={completeWorkspace} />}</div></div>
    {editingCard && editingDraft && <div className="card-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}><section className="card-editor-modal" role="dialog" aria-modal="true" aria-labelledby="card-editor-title" aria-busy={editorSaveState !== "idle"}>
      <div className="card-editor-content" inert={editorSaveState !== "idle"} aria-hidden={editorSaveState !== "idle"}>
        <div className="card-editor-heading"><div><p className="eyebrow"><PencilLine size={15}/> 编辑卡片</p><h2 id="card-editor-title">{editingDraft.question.trim() || "未命名问题"}</h2><p>修改内容不会重置已有的复习进度。</p></div><button className="icon-close" type="button" onClick={closeEditor} disabled={editBusy} aria-label="关闭编辑卡片"><X size={19}/></button></div>
        {editorSaveError && <div className="card-editor-save-error" role="alert">{editorSaveError}</div>}
        <form className="card-editor-form" onSubmit={saveCardEditor}><QuestionWordingsEditor question={editingDraft.question} variants={editingDraft.questionVariants} candidates={aiCandidates} onChange={({ question, variants }) => setEditingDraft((draft) => draft ? { ...draft, question, questionVariants: variants } : draft)} onCandidatesChange={setAiCandidates} onGenerate={() => generateVariants(editingDraft.question, editingDraft.answerPoints, editingDraft.questionVariants)} busy={aiBusy}/><AnswerPointsEditor points={editingDraft.answerPoints} onChange={(answerPoints) => setEditingDraft({ ...editingDraft, answerPoints })} /> <RelatedCardsEditor cards={relationCards.length ? relationCards : cards} value={editingDraft.relations} onChange={(relations) => setEditingDraft({ ...editingDraft, relations })} excludeId={editingCard.id} recommendations={editorRecommendations.relatedCards} recommendationState={editorRecommendations.state}/><label className="field card-note-field">学习备注<textarea rows={4} value={editingDraft.note} onChange={(event) => setEditingDraft({ ...editingDraft, note: event.target.value })} placeholder="记录来源、待核实的信息，或下一次复习时想提醒自己的事。" /></label><div className="form-grid two"><label className="field">知识库类型<SearchableSelect value={editingDraft.track} onChange={(track) => setEditingDraft({ ...editingDraft, track })} options={knowledgeBaseTypeSuggestions} placeholder="选择或输入新类型" ariaLabel="知识库类型" allowCustom required /></label><div className="tag-field-with-recommendations"><div className="field"><span>标签</span><SearchableSelect multiple value={splitTags(editingDraft.tags)} onChange={(values) => setEditingDraft((draft) => draft ? { ...draft, tags: values.join(", ") } : draft)} options={tags} placeholder="选择或输入标签" ariaLabel="标签" allowCustom menuPlacement="top" menuHeader={<TagRecommendations tags={editorRecommendations.tags} state={editorRecommendations.state} onAdd={(tag) => setEditingDraft((draft) => draft ? { ...draft, tags: splitTags([...splitTags(draft.tags), tag].join(", ")).join(", ") } : draft)}/>} /></div></div></div><div className="form-actions card-editor-actions"><Button type="button" variant="ghost" onClick={closeEditor} disabled={editBusy}>取消</Button><Button type="submit" disabled={editBusy}>{editBusy ? "正在保存…" : <><CheckCircle2 size={17}/> 保存修改</>}</Button></div></form>
      </div>
      {editorSaveState !== "idle" && <div ref={editorSaveStatusRef} className={`card-editor-save-overlay ${editorSaveState}`} role="status" aria-live="polite" aria-atomic="true" tabIndex={-1}>{editorSaveState === "saving" ? <div className="card-editor-save-pending"><span className="card-editor-save-spinner" aria-hidden="true"/><strong>正在保存…</strong><p>正在更新这张卡片</p></div> : <div className="card-editor-save-success" onAnimationEnd={(event) => { if (event.target === event.currentTarget) completeCardSave(); }}><span aria-hidden="true"><CheckCircle2 size={46} strokeWidth={3}/></span><strong>保存成功</strong><p>卡片已更新</p></div>}</div>}
    </section></div>}
    <section className="cards-library"><div className="section-title"><h2>已沉淀的卡片</h2><span>{cards.length} / {cardsTotal} 张</span></div>
      <><div ref={setFilterBarNode} className="cards-filter-bar" data-tour="library-filters" aria-label="卡片筛选与排序">
        <div className="cards-filter-row cards-filter-row-primary">
          <label className="card-search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索问题、答案、标签或备注" aria-label="搜索卡片" /></label>
          <SearchableSelect variant="filter" value={selectedTrack} onChange={setSelectedTrack} options={savedKnowledgeBaseTypes} placeholder="知识库类型" ariaLabel="筛选知识库类型" emptyText="暂无可选类型" />
          <label className="filter-select">排序<select value={sort} onChange={(event) => changeSort(event.target.value as CardSort)}><option value="updated">最近更新</option><option value="created">最近创建</option><option value="review">复习时间</option><option value="practice">练习时间</option><option value="difficulty">难度</option></select></label>
          <Button type="button" variant={showArchived ? "secondary" : "ghost"} onClick={() => { if (showArchived) showActiveCards(); else { setShowArchived(true); setSelectedIds(new Set()); } }}>{showArchived ? "查看活动卡片" : "查看已归档"}</Button>
        </div>
        <div className="cards-filter-row cards-filter-row-secondary">
          <SearchableSelect multiple variant="filter" value={[...selectedTags]} onChange={(values) => setSelectedTags(new Set(values))} options={tags} placeholder="标签" ariaLabel="筛选标签" emptyText="暂无可选标签" />
          <button type="button" className="sort-direction" onClick={() => setSortDirection((direction) => direction === "asc" ? "desc" : "asc")} aria-label={sortDirection === "asc" ? "切换为降序" : "切换为升序"} title={sortDirection === "asc" ? "当前：升序" : "当前：降序"}><ArrowUpDown size={17}/>{sortDirection === "asc" ? "升序" : "降序"}</button>
          <button type="button" className="clear-card-filters" onClick={clearFilters}>清除筛选</button>
        </div>
      </div><div data-tour="library-selection">{selectedIds.size > 0 && <div className="bulk-card-toolbar" role="status"><strong>已选择 {selectedIds.size} 张</strong>{showArchived ? <Button variant="secondary" onClick={() => void bulk("restore")}><Undo2 size={16}/> 恢复</Button> : <Button variant="secondary" onClick={() => void bulk("archive")}><Archive size={16}/> 归档</Button>}<Button variant="ghost" onClick={() => setBulkEditMode("tags")}><Tag size={16}/> 添加标签</Button><Button variant="ghost" onClick={() => setBulkEditMode("track")}>移动类型</Button><Button variant="ghost" onClick={() => exportSelected("csv")}><Download size={16}/> CSV</Button><Button variant="ghost" onClick={() => exportSelected("json")}><Download size={16}/> JSON</Button><Button variant="danger" onClick={() => void bulk("delete")}><Trash2 size={16}/> 永久删除</Button><button type="button" className="clear-card-filters" onClick={() => setSelectedIds(new Set())}>取消选择</button></div>}</div></>
      {cardsLoading ? <div className="cards-loading" role="status">正在加载卡片…</div> : cardsError ? <EmptyState title="暂时无法加载卡片" detail={cardsError} action={<Button type="button" onClick={() => void load()}>重新加载</Button>} /> : cardsTotal ? cards.length ? <><div className="card-grid">{cards.map((card) => {
        const learning = learningByCardId[card.id];
        const difficulty = difficultyTier(learning?.fsrsDifficulty);
        const rarity = stabilityRarityTier(learning?.fsrsStability, stabilityRarityPreset);
        const stability = learning?.fsrsStability ?? 0;
        const selectionMode = selectedIds.size > 0;
        const selected = selectedIds.has(card.id);
        return <KnowledgeCardFrame
          className={`${selectionMode ? "selection-mode" : ""} ${selected ? "selected" : ""}`}
          key={card.id}
          ref={(node) => recommendationPreload.registerCard(card, node)}
          tilt
          wrapContent={false}
          rarity={rarity.label}
          stability={stability}
          difficulty={difficulty && learning?.fsrsDifficulty !== null && learning?.fsrsDifficulty !== undefined ? { ...difficulty, value: learning.fsrsDifficulty } : null}
          onRarityClick={() => setRarityPreviewOpen(true)}
          rarityAriaLabel={`${rarity.label} 稀有度，Stability ${stability.toFixed(1)} 天。点击查看当前稀有度方案`}
          topLeft={<label className="card-select"><input type="checkbox" checked={selected} onChange={() => toggleSelected(card.id)} /> 选择</label>}
          indicators={(card.note.trim() || card.answerPoints.some((item) => item.note.trim())) && <span className="note-count"><MessageSquareText size={14}/> 有批注</span>}
          title={<>{card.question}{card.questionVariants.length > 0 && <span className="variant-count"><Sparkles size={14}/> 另有 {card.questionVariants.length} 种问法</span>}</>}
          footer={<div className="card-library-actions">{showArchived ? <Button type="button" variant="ghost" className="card-icon-action" data-tooltip="恢复卡片" aria-label="恢复卡片" title="恢复卡片" onClick={() => void bulk("restore", undefined, [card.id])}><Undo2 size={18}/></Button> : <><Button type="button" variant="ghost" className="card-icon-action" data-tooltip="编辑卡片" aria-label="编辑卡片" title="编辑卡片" onClick={() => openCardEditor(card)}><PencilLine size={18}/></Button><Button type="button" variant="ghost" className="card-icon-action" data-tooltip={detailLoading === card.id ? "正在读取卡片详情" : "查看卡片详情"} aria-label={detailLoading === card.id ? "正在读取卡片详情" : "查看卡片详情"} title={detailLoading === card.id ? "正在读取卡片详情" : "查看卡片详情"} disabled={detailLoading === card.id} onClick={() => openCardDetails(card)}><MoreHorizontal size={20}/></Button><Button type="button" variant="ghost" className="card-icon-action" data-tooltip="归档卡片" aria-label="归档卡片" title="归档卡片" onClick={() => void bulk("archive", undefined, [card.id])}><Archive size={18}/></Button></>}</div>}
          data-tour="library-card"
          tabIndex={selectionMode ? 0 : undefined}
          aria-label={selectionMode ? `${card.question}，${selected ? "已选择" : "未选择"}。按 Enter 或空格切换选择。` : undefined}
          onClick={(event) => selectFromCardSurface(event, card.id)}
          onKeyDown={(event) => selectFromCardKeyboard(event, card.id)}
        >
          <div className="knowledge-card-scroll-content">
            <details className="card-answer-details">
              <summary>
                <span className="card-answer-copy">{card.answer}</span>
                <span className="card-answer-toggle"><span className="when-closed">展开答案</span><span className="when-open">收起答案</span></span>
              </summary>
            </details>
            {card.questionVariants.length > 0 && <details className="variant-details"><summary>查看其他问法</summary><ul>{card.questionVariants.map((item) => <li key={item.id}><span className={`variant-source ${item.source}`}>{item.source === "ai" ? "AI" : "我的"}</span>{item.content}</li>)}</ul></details>}
            <div className="card-learning-summary">
              <span><CalendarClock size={14}/> 下次：{compactReviewTime(learning?.nextReviewAt, true)}</span>
              <span><Clock3 size={14}/> 上次：{compactReviewTime(learning?.lastReviewAt)}</span>
            </div>
            <div className="card-meta"><Chip tone="blue">类型：{card.track}</Chip>{card.tags.map((tag) => <Chip key={tag} tone="ink">#{tagLabel(tag)}</Chip>)}</div>
          </div>
        </KnowledgeCardFrame>;
      })}</div><div ref={setLoadMoreNode} className="cards-load-more" aria-live="polite">{cardsLoadingMore ? "正在加载更多卡片…" : hasMoreCards ? "继续向下滚动以加载更多" : "已显示全部卡片"}</div></> : <EmptyState title="没有符合条件的卡片" detail="换个关键词，或清除筛选条件再试试。" /> : showArchived ? <EmptyState title="没有已归档的卡片" detail="归档的卡片会在这里显示。" action={<Button type="button" variant="secondary" onClick={showActiveCards}>查看活动卡片</Button>} /> : <EmptyState title="你的题库还没有内容" detail="从一个你曾经答得不够顺的问题开始记录。" action={<Button type="button" onClick={() => openWorkspace("manual")}>创建第一张卡片</Button>} />}
    </section>{(filterBarAboveViewport || returnScrollPosition !== null) && <button type="button" className="library-scroll-toggle" onClick={navigateLibraryScroll} aria-label={returnScrollPosition === null ? "回到藏品顶部" : "回到刚才浏览的位置"} title={returnScrollPosition === null ? "回到顶部" : "回到刚才的位置"}>{returnScrollPosition === null ? <ArrowUp size={21}/> : <ArrowDown size={21}/>}</button>}
  </PageLayout>;
}
