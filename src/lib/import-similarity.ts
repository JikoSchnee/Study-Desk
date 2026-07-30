import "server-only";
import { cosineSimilarity, embedTexts } from "@/lib/answer-comparison";
import { allQuestionTexts } from "@/lib/question-variants";
import type { Card, QuestionVariant } from "@/lib/types";

export const IMPORT_SIMILARITY_THRESHOLD = 0.86;

type ImportQuestion = { question: string; questionVariants?: QuestionVariant[] };

export type SimilarImportMatch = {
  question: string;
  score: number;
  cardId?: string;
  source: "library" | "import";
};

type Candidate = SimilarImportMatch & { importIndex?: number; text: string };

function questionTexts(card: ImportQuestion) {
  return [card.question, ...(card.questionVariants ?? []).map((variant) => variant.content)]
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Finds high-confidence semantic duplicates. Existing cards and earlier rows in
 * the same import form the retrieval corpus, so the first copy stays importable
 * while later similar copies are held for review.
 */
export async function findSimilarImportQuestions(rows: ImportQuestion[], existingCards: Card[]) {
  const candidates: Candidate[] = existingCards.flatMap((card) => allQuestionTexts(card)
    .map((text) => ({ text, question: card.question, score: 0, cardId: card.id, source: "library" as const })));
  const incoming: Candidate[] = rows.flatMap((row, importIndex) => questionTexts(row)
    .map((text) => ({ text, question: row.question.trim(), score: 0, source: "import" as const, importIndex })));
  // Variants create multiple input texts, but they all belong to the same row
  // and are intentionally excluded from comparison with one another. Do not
  // initialize the local embedding model unless there is at least one eligible
  // peer: an existing card or an earlier import row.
  if (!incoming.length || (candidates.length === 0 && rows.length < 2)) return new Map<number, SimilarImportMatch>();

  try {
    const vectors = await embedTexts([...candidates.map((candidate) => candidate.text), ...incoming.map((candidate) => candidate.text)]);
    const candidateVectors = vectors.slice(0, candidates.length);
    const incomingVectors = vectors.slice(candidates.length);
    const matches = new Map<number, SimilarImportMatch>();

    for (let index = 0; index < incoming.length; index += 1) {
      const current = incoming[index];
      const currentVector = incomingVectors[index];
      if (!currentVector) continue;
      const possible = [
        ...candidates.map((candidate, candidateIndex) => ({ candidate, vector: candidateVectors[candidateIndex] })),
        ...incoming.slice(0, index).filter((candidate) => candidate.importIndex !== current.importIndex).map((candidate) => ({ candidate, vector: incomingVectors[incoming.indexOf(candidate)] })),
      ].flatMap(({ candidate, vector }) => vector ? [{ candidate, score: cosineSimilarity(currentVector, vector) }] : []);
      const best = possible.filter((item) => item.score >= IMPORT_SIMILARITY_THRESHOLD).sort((left, right) => right.score - left.score)[0];
      if (!best) continue;
      const previous = matches.get(current.importIndex!);
      if (!previous || best.score > previous.score) matches.set(current.importIndex!, { question: best.candidate.question, score: best.score, cardId: best.candidate.cardId, source: best.candidate.source });
    }
    return matches;
  } catch {
    // Exact-match validation still runs when the optional local model is unavailable.
    return new Map<number, SimilarImportMatch>();
  }
}
