/**
 * Load historical price data for a token symbol.
 * Falls back to empty array if file not found.
 */
export async function loadPriceHistory(symbol) {
  try {
    // Vite can import JSON dynamically from the project root
    const mod = await import(/* @vite-ignore */ `/src/pricedata/${symbol}.json`);
    return Array.isArray(mod.default) ? mod.default : [];
  } catch {
    // Try fetching from /pricedata/ static path (works in dev with symlink)
    try {
      const res = await fetch(`/pricedata/${symbol}.json`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  }
}

/**
 * Compute basket historical price from component token histories.
 * @param {string[]} assetAddrs  - asset addresses
 * @param {number[]} weightsBp   - weights in basis points (sum 10000)
 * @param {object[]} allAssets   - data/assets.json .assets array
 * @returns {Promise<{date,price}[]>}
 */
export async function computeBasketHistory(assetAddrs, weightsBp, allAssets) {
  const histories = await Promise.all(
    assetAddrs.map(async (addr) => {
      const meta = allAssets.find((a) => a.address.toLowerCase() === addr.toLowerCase());
      return meta ? await loadPriceHistory(meta.symbol) : [];
    })
  );

  // Find common date range
  const allDates = histories
    .filter((h) => h.length > 0)
    .map((h) => h.map((d) => d.date));
  if (allDates.length === 0) return [];
  const commonDates = allDates.reduce((a, b) => {
    const setB = new Set(b);
    return a.filter((d) => setB.has(d));
  });

  if (commonDates.length === 0) return [];

  const totalWeight = weightsBp.reduce((a, b) => a + b, 0) || 10000;

  return commonDates.map((date) => {
    let basketPrice = 0;
    for (let i = 0; i < assetAddrs.length; i++) {
      const h = histories[i];
      const entry = h.find((d) => d.date === date);
      if (entry) {
        basketPrice += entry.price * ((weightsBp[i] || 0) / totalWeight);
      }
    }
    return { date, price: basketPrice };
  });
}
