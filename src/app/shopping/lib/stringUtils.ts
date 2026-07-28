/**
 * Normalizes a product name by trimming whitespace, removing duplicate spaces,
 * and standardizing common Hebrew characters to prevent duplicate entries.
 */
export function normalizeProductName(name: string): string {
  if (!name) return "";
  
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/יי/g, 'י')
    .replace(/וו/g, 'ו')
    .toLowerCase();
}

/**
 * Basic Levenshtein distance for catching small typos
 */
function getLevenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  
  const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(null));
  
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + indicator // substitution
      );
    }
  }
  return matrix[a.length][b.length];
}

/**
 * Checks if a given input matches an existing product in the pool
 * by comparing their normalized forms, subset matches (e.g., "חסה" in "חסה ערבית"),
 * and small typos.
 * Returns the matched product if found, otherwise undefined.
 */
export function findSimilarProduct<T extends { name: string }>(
  input: string,
  pool: T[]
): T | undefined {
  if (!input.trim()) return undefined;
  const normalizedInput = normalizeProductName(input);
  
  // 1. Exact match (Highest Priority)
  const exact = pool.find(p => normalizeProductName(p.name) === normalizedInput);
  if (exact) return exact;

  const inputWords = normalizedInput.split(' ').filter(w => w.length > 1);

  // 2. Advanced Fuzzy Matches
  const matches = pool.filter(p => {
    const pNorm = normalizeProductName(p.name);
    const pWords = pNorm.split(' ').filter(w => w.length > 1);
    
    if (inputWords.length === 0 || pWords.length === 0) return false;

    // A. Input is a complete subset of the Pool item (e.g. input "חסה" -> pool "חסה ערבית")
    //    Only match if the input covers a significant portion of the product name
    //    to avoid "שומשום" matching "לחמניות שומשום" (completely different products)
    const inputIsSubset = inputWords.every(w => pWords.includes(w)) &&
                          inputWords.length >= Math.ceil(pWords.length / 2);
    
    // B. Pool item is a complete subset of Input (e.g. input "חסה ערבית" -> pool "חסה")
    const poolIsSubset = pWords.every(w => inputWords.includes(w)) &&
                         pWords.length >= Math.ceil(inputWords.length / 2);

    // C. Single-word typo check (e.g. "עגבניה" vs "עגבנייה" if normalization misses it)
    const isTypo = inputWords.length === 1 && pWords.length === 1 && 
                   getLevenshteinDistance(inputWords[0], pWords[0]) <= 1;

    // D. Prefix match (e.g., "נייר א" -> "נייר אפיה") if it's very close
    //    Require at least 60% character coverage to avoid short prefixes matching long names
    const isPrefix = pNorm.startsWith(normalizedInput) && 
                     normalizedInput.length > 3 &&
                     normalizedInput.length >= pNorm.length * 0.6;

    return inputIsSubset || poolIsSubset || isTypo || isPrefix;
  });

  // If there's any logical match, we return the first/best one to aggressively deduplicate
  if (matches.length > 0) {
    // Prefer the shortest match if multiple exist (e.g. mapping "חסה" to "חסה" instead of "חסה ערבית" if both exist)
    // In this context, if they type "חסה" and there is "חסה ערבית" and "חסה מסולסלת", we just pick the first one
    // to strictly prevent them from creating a duplicate "חסה" generic item.
    return matches.sort((a, b) => a.name.length - b.name.length)[0];
  }

  return undefined;
}

/**
 * Ranks pool products by relevance to a live search input, for the add-product
 * suggestion dropdown. Reuses the same normalization/subset/typo/prefix signals as
 * `findSimilarProduct`, but scores every candidate and returns the top matches instead
 * of a single best guess — plus a low-score fallback on category-name substring match,
 * so searching by category still surfaces relevant products.
 */
export function rankSimilarProducts<T extends { name: string; category?: string }>(
  input: string,
  pool: T[],
  limit = 20
): T[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const normalizedInput = normalizeProductName(trimmed);
  const inputWords = normalizedInput.split(' ').filter((w) => w.length > 1);

  const scored = pool.map((p) => {
    const pNorm = normalizeProductName(p.name);
    const pWords = pNorm.split(' ').filter((w) => w.length > 1);
    let score = 0;

    if (pNorm === normalizedInput) {
      score = 100;
    } else {
      const inputIsSubset =
        inputWords.length > 0 && pWords.length > 0 &&
        inputWords.every((w) => pWords.includes(w)) &&
        inputWords.length >= Math.ceil(pWords.length / 2);
      const poolIsSubset =
        inputWords.length > 0 && pWords.length > 0 &&
        pWords.every((w) => inputWords.includes(w)) &&
        pWords.length >= Math.ceil(inputWords.length / 2);
      const isTypo =
        inputWords.length === 1 && pWords.length === 1 &&
        getLevenshteinDistanceStrict(inputWords[0], pWords[0]) <= 1;
      const isPrefix =
        pNorm.startsWith(normalizedInput) &&
        normalizedInput.length > 3 &&
        normalizedInput.length >= pNorm.length * 0.6;

      if (inputIsSubset || poolIsSubset) score = 80;
      else if (isTypo) score = 70;
      else if (isPrefix) score = 60;
      else if (pNorm.includes(normalizedInput)) score = 40;
      else if (p.category && p.category.includes(trimmed)) score = 10;
    }

    return { item: p, score, len: p.name.length };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.len - b.len)
    .slice(0, limit)
    .map((s) => s.item);
}

/**
 * Looser Hebrew normalization used for hard duplicate-blocking checks (e.g. preventing
 * a new shopping request from being created when a near-identical one is already active).
 * Strips quote/geresh characters and a leading definite-article "ה" (for words > 3 chars),
 * in addition to whitespace collapsing and lowercasing.
 *
 * Kept distinct from `normalizeProductName`/`findSimilarProduct` (used for the interactive
 * add-product suggestion UI) because the two are tuned for different risk profiles: this one
 * gates whether a write is allowed to happen at all, so its matching behavior is preserved
 * as-is rather than swapped to the other algorithm.
 */
export function normalizeHebrewStrict(str: string): string {
  if (!str) return "";
  return str
    .trim()
    .replace(/["'׳״\-]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((word) => (word.startsWith("ה") && word.length > 3 ? word.substring(1) : word))
    .join(" ");
}

export function getLevenshteinDistanceStrict(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Finds an active request with a near-identical name (exact match after normalization,
 * or a small Levenshtein distance scaled by name length) — used to hard-block duplicate
 * shopping-list entries. See `normalizeHebrewStrict` for why this stays separate from
 * `findSimilarProduct`.
 */
export function findSimilarRequestStrict(name: string, activeRequestsList: { name: string }[]): string | null {
  const normName = normalizeHebrewStrict(name);
  if (!normName) return null;

  for (const r of activeRequestsList) {
    const normActive = normalizeHebrewStrict(r.name);
    if (normName === normActive) return r.name;

    const distance = getLevenshteinDistanceStrict(normName, normActive);
    const minLength = Math.min(normName.length, normActive.length);
    const maxAllowedDistance = minLength >= 6 ? 2 : (minLength >= 4 ? 1 : 0);

    if (distance <= maxAllowedDistance && minLength > 2) {
      return r.name;
    }
  }
  return null;
}
