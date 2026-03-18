/**
 * scripts/generateHistory.js
 * Generates 180-day deterministic price history for 20 tokens.
 * Output: data/prices/<SYMBOL>.json  (array of { date, price, volume })
 *
 * Usage: node scripts/generateHistory.js
 */

const fs   = require("fs");
const path = require("path");

const assets = require("../data/assets.json").assets;

// Seed parameters per token (deterministic, no RNG library needed)
const SEED_PARAMS = {
  WBTC:   { start: 62000, vol: 0.025, drift: 0.0003 },
  WETH:   { start: 3400,  vol: 0.030, drift: 0.0002 },
  "USDC.e":{ start: 1.00, vol: 0.001, drift: 0.00001 },
  USDT:   { start: 1.00,  vol: 0.001, drift: 0.00001 },
  DAI:    { start: 1.00,  vol: 0.002, drift: 0.00001 },
  LINK:   { start: 18.0,  vol: 0.040, drift: 0.0004  },
  UNI:    { start: 9.5,   vol: 0.045, drift: 0.0003  },
  AAVE:   { start: 110,   vol: 0.050, drift: 0.0004  },
  SUSHI:  { start: 1.8,   vol: 0.060, drift: 0.0002  },
  COMP:   { start: 55,    vol: 0.045, drift: 0.0003  },
  MKR:    { start: 2800,  vol: 0.035, drift: 0.0003  },
  SNX:    { start: 2.5,   vol: 0.055, drift: 0.0003  },
  YFI:    { start: 8500,  vol: 0.040, drift: 0.0003  },
  CRV:    { start: 0.55,  vol: 0.055, drift: 0.0002  },
  BAL:    { start: 3.8,   vol: 0.050, drift: 0.0003  },
  MATIC:  { start: 0.92,  vol: 0.050, drift: 0.0003  },
  MANA:   { start: 0.45,  vol: 0.060, drift: 0.0002  },
  ZRX:    { start: 0.38,  vol: 0.050, drift: 0.0002  },
  BAT:    { start: 0.22,  vol: 0.050, drift: 0.0002  },
  REN:    { start: 0.065, vol: 0.060, drift: 0.0001  },
};

const DAYS = 180;
const MS_PER_DAY = 86400_000;

/** Simple deterministic PRNG (mulberry32) seeded by symbol hash */
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

function symbolSeed(sym) {
  let h = 0x811c9dc5;
  for (let i = 0; i < sym.length; i++) {
    h ^= sym.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

function generateSeries(symbol) {
  const params = SEED_PARAMS[symbol] || { start: 1.0, vol: 0.03, drift: 0.0002 };
  const rng = makeRng(symbolSeed(symbol));
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);
  const startDate = new Date(endDate.getTime() - (DAYS - 1) * MS_PER_DAY);

  let price = params.start;
  const series = [];

  for (let d = 0; d < DAYS; d++) {
    const date = new Date(startDate.getTime() + d * MS_PER_DAY)
      .toISOString()
      .slice(0, 10);

    // Geometric Brownian motion step (deterministic)
    const z = (rng() + rng() + rng() + rng() + rng() + rng() - 3) * 0.5; // approx N(0,1)
    price = price * Math.exp(params.drift - 0.5 * params.vol ** 2 + params.vol * z);
    price = Math.max(price, 1e-6);

    const volume = (rng() * 9 + 1) * params.start * 1000; // fake daily volume

    series.push({
      date,
      price: parseFloat(price.toFixed(6)),
      volume: parseFloat(volume.toFixed(2)),
    });
  }
  return series;
}

// ── Main ───────────────────────────────────────────────────────────────────

const outDir = path.join(__dirname, "../data/prices");
fs.mkdirSync(outDir, { recursive: true });

for (const asset of assets) {
  const series = generateSeries(asset.symbol);
  const file = path.join(outDir, `${asset.symbol.replace("/", "_")}.json`);
  fs.writeFileSync(file, JSON.stringify(series, null, 2));
  console.log(`  wrote ${series.length} days → ${path.relative(process.cwd(), file)}`);
}

console.log(`\nDone. ${assets.length} token histories written to data/prices/`);
