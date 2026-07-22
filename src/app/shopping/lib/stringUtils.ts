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
    const inputIsSubset = inputWords.every(w => pWords.includes(w));
    
    // B. Pool item is a complete subset of Input (e.g. input "חסה ערבית" -> pool "חסה")
    const poolIsSubset = pWords.every(w => inputWords.includes(w));

    // C. Single-word typo check (e.g. "עגבניה" vs "עגבנייה" if normalization misses it)
    const isTypo = inputWords.length === 1 && pWords.length === 1 && 
                   getLevenshteinDistance(inputWords[0], pWords[0]) <= 1;

    // D. Prefix match (e.g., "נייר א" -> "נייר אפיה") if it's very close
    const isPrefix = pNorm.startsWith(normalizedInput) && normalizedInput.length > 3;

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
