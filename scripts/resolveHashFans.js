/**
 * scripts/resolveHashFans.js
 *
 * Fetches real HashFans token addresses from the HashKey Chain testnet
 * token list and updates data/assets.json.
 *
 * TODO: Replace HASHFANS_LIST_URL with the actual HashFans token list URL
 *       once it becomes publicly available.
 *
 * Usage:
 *   node scripts/resolveHashFans.js
 *
 * If network is unavailable the script exits gracefully and leaves the
 * placeholder addresses intact.
 */

const fs   = require("fs");
const path = require("path");
const https = require("https");

// TODO: Replace with real HashFans token list endpoint
const HASHFANS_LIST_URL = "https://raw.githubusercontent.com/hashfans/token-list/main/hashkey-testnet.json";

const ASSETS_FILE = path.join(__dirname, "../data/assets.json");

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 8000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("JSON parse failed: " + e.message)); }
      });
    }).on("error", reject).on("timeout", () => reject(new Error("Request timed out")));
  });
}

async function main() {
  const existing = JSON.parse(fs.readFileSync(ASSETS_FILE, "utf8"));
  const symbolMap = {};
  for (const a of existing.assets) symbolMap[a.symbol.toUpperCase()] = a;

  let tokenList;
  try {
    tokenList = await fetchJSON(HASHFANS_LIST_URL);
    console.log(`Fetched ${tokenList.tokens?.length ?? 0} tokens from HashFans list`);
  } catch (err) {
    console.warn(`Could not fetch HashFans list: ${err.message}`);
    console.warn("Leaving placeholder addresses intact.");
    process.exit(0);
  }

  const tokens = tokenList.tokens || tokenList; // handle both {tokens:[]} and []
  let updated = 0;

  for (const tok of tokens) {
    const sym = (tok.symbol || "").toUpperCase();
    if (symbolMap[sym]) {
      const old = symbolMap[sym].address;
      symbolMap[sym].address  = tok.address;
      symbolMap[sym].decimals = tok.decimals ?? symbolMap[sym].decimals;
      if (old !== tok.address) {
        console.log(`  ${sym}: ${old} → ${tok.address}`);
        updated++;
      }
    }
  }

  existing.assets = Object.values(symbolMap);
  existing._note  = `Updated by resolveHashFans.js on ${new Date().toISOString()}`;
  fs.writeFileSync(ASSETS_FILE, JSON.stringify(existing, null, 2));
  console.log(`\nUpdated ${updated} addresses. data/assets.json saved.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
