export interface KeywordScore {
  score: number;
  matched: string[];
}

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\w\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const includesTerm = (text: string, term: string): boolean => {
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) {
    return false;
  }
  return text.includes(normalizedTerm);
};

export const scoreByKeywords = (
  rawText: string,
  keywords: readonly string[]
): KeywordScore => {
  const text = normalize(rawText);
  const matched: string[] = [];
  for (const keyword of keywords) {
    if (includesTerm(text, keyword)) {
      matched.push(keyword);
    }
  }
  return {
    score: matched.length,
    matched
  };
};

export const toSearchText = (row: Record<string, unknown>): string => {
  const chunks: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    chunks.push(key);
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      chunks.push(String(value));
    }
  }
  return chunks.join(" ");
};

