import type { AnswerPoint, Card, CardRelationType, QuestionVariant } from "@/lib/types";

export type RelatedCardDraft = {
  question: string;
  questionVariants: QuestionVariant[];
  relations: Array<{ cardId: string; type: CardRelationType }>;
  answerPoints: AnswerPoint[];
  note: string;
  track: string;
  tags: string;
  source: string;
};

export function createRelatedCardDraft(card: Pick<Card, "id" | "track" | "tags">, relationType: CardRelationType, emptyAnswerPoint: AnswerPoint): RelatedCardDraft {
  return {
    question: "",
    questionVariants: [],
    relations: [{ cardId: card.id, type: relationType }],
    answerPoints: [emptyAnswerPoint],
    note: "",
    track: card.track,
    tags: card.tags.join(", "),
    source: "",
  };
}
