/**
 * scripts/deployMockRWA.js
 *
 * Deploys 40 mock ERC-20 tokens on the active network:
 *   - 20 RWA-type tokens (deployed as ERC3643Basket with compliance modules)
 *   - 20 normal tokens  (deployed as plain MockRWA)
 *
 * Updates data/assets.json with live addresses, symbols, names,
 * decimals, isRWA, and complianceModules.
 *
 * Usage:
 *   npx hardhat run --network hashkeyTestnet scripts/deployMockRWA.js
 *   npx hardhat run --network hardhat         scripts/deployMockRWA.js  (local)
 */

require("dotenv").config();
const { ethers } = require("hardhat");
const fs   = require("fs");
const path = require("path");

const ASSETS_FILE = path.join(__dirname, "../data/assets.json");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.error(`Deploying 40 mock tokens from ${deployer.address}…`);

  const existing = JSON.parse(fs.readFileSync(ASSETS_FILE, "utf8"));
  const deployedMap = {}; // symbol → address

  // ── Deploy RWA tokens as ERC3643Basket ──────────────────────────────────
  const RWATokenFactory = await ethers.getContractFactory("ERC3643Basket");

  const rwaAssets = existing.assets.filter((a) => a.isRWA);
  for (const asset of rwaAssets) {
    console.error(`  [RWA] Deploying ${asset.symbol}…`);
    const token = await RWATokenFactory.deploy(
      asset.name,
      asset.symbol,
      deployer.address,      // admin
      JSON.stringify({ symbol: asset.symbol, isRWA: true }), // metadataURI slot
      asset.complianceModules
    );
    await token.waitForDeployment();
    deployedMap[asset.symbol] = token.target;
    console.error(`        → ${token.target}`);
  }

  // ── Deploy normal tokens as MockRWA ────────────────────────────────────
  const NormalTokenFactory = await ethers.getContractFactory("MockRWA");

  const normalAssets = existing.assets.filter((a) => !a.isRWA);
  for (const asset of normalAssets) {
    // Use asset.decimals as the token's decimals (default 18 for most)
    console.error(`  [ERC20] Deploying ${asset.symbol}…`);
    const token = await NormalTokenFactory.deploy(
      asset.name,
      asset.symbol,
      ethers.parseUnits("10000000", 18) // initial supply to deployer
    );
    await token.waitForDeployment();
    deployedMap[asset.symbol] = token.target;
    console.error(`        → ${token.target}`);
  }

  // ── Update data/assets.json ─────────────────────────────────────────────
  const updated = {
    ...existing,
    _note: `Deployed on ${new Date().toISOString()} by deployMockRWA.js`,
    assets: existing.assets.map((a) => ({
      ...a,
      address: deployedMap[a.symbol] || a.address,
    })),
  };
  fs.writeFileSync(ASSETS_FILE, JSON.stringify(updated, null, 2));
  console.error(`\ndata/assets.json updated with ${Object.keys(deployedMap).length} addresses.`);

  // ── Print result JSON ────────────────────────────────────────────────────
  const result = {
    deployed: Object.fromEntries(
      existing.assets.map((a) => [a.symbol, deployedMap[a.symbol] || null])
    ),
    totalRWA:    rwaAssets.length,
    totalNormal: normalAssets.length,
    assetsFile:  ASSETS_FILE,
  };
  console.log(JSON.stringify(result));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
