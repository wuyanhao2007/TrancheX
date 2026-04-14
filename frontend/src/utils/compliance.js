/**
 * Deduplicate compliance modules from multiple arrays.
 * Input: array of string arrays. Output: unique module IDs.
 */
export function deduplicateModules(arrays) {
  const seen = new Set();
  const result = [];
  for (const arr of arrays) {
    if (!arr) continue;
    for (const m of arr) {
      const key = m.trim().toUpperCase();
      if (!seen.has(key)) { seen.add(key); result.push(m.trim()); }
    }
  }
  return result;
}
