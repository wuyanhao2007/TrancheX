/**
 * scripts/deploy.js
 *
 * Deploys:
 *   1. MockPriceOracle
 *   2. AttestationRegistry
 *   3. TokenFactory
 *   4. BasketManager   (DEFAULT_ADMIN_ROLE + MANAGER_ROLE → ADMIN_ADDRESS)
 *
 * Asset resolution (in priority order):
 *   a) process.env.ASSET_ADDRESSES (comma-separated)
 *   b) data/assets.json  (populated by deployMockRWA.js)
 *
 * For each asset:
 *   - If no contract at address, deploy MockRWA and seed manager
 *   - Set oracle price = 1e18
 *
 * Mints one default basket (basket 0) with all assets, equal weights.
 *
 * Prints single JSON line:
 *   {"indexAddress":"0x..","managerAddress":"0x..","oracleAddress":"0x..",
 *    "stableAddress":"0x..","assetsCount":N}
 *
 * Usage:
 *   npx hardhat run --network hashkeyTestnet scripts/deploy.js
 */

require("dotenv").config();
const { ethers } = require("hardhat");
const fs   = require("fs");
const path = require("path");

async function main() {
  // ── Validate env ────────────────────────────────────────────────────────
  const STABLE_ADDRESS = process.env.STABLE_ADDRESS;
  if (!STABLE_ADDRESS) {
    console.error("Error: Please set STABLE_ADDRESS in .env to testnet USDC.e");
    process.exit(1);
  }

  // Admin address: all roles go here. Defaults to deployer if not set.
  const [deployer] = await ethers.getSigners();
  const ADMIN_ADDRESS = process.env.ADMIN_ADDRESS || deployer.address;

  // ── Resolve asset list ───────────────────────────────────────────────────
  let assetList;
  const rawEnv = process.env.ASSET_ADDRESSES || "";
  const fromEnv = rawEnv.split(",").map((s) => s.trim()).filter(Boolean);

  if (fromEnv.length > 0) {
    assetList = fromEnv;
  } else {
    // Fall back to data/assets.json
    const assetsFile = path.join(__dirname, "../data/assets.json");
    if (!fs.existsSync(assetsFile)) {
      console.error("Error: ASSET_ADDRESSES empty and data/assets.json not found.");
      process.exit(1);
    }
    const json = JSON.parse(fs.readFileSync(assetsFile, "utf8"));
    assetList = json.assets.map((a) => a.address).filter((a) => a && a !== ethers.ZeroAddress);
    if (assetList.length === 0) {
      console.error("Error: ASSET_ADDRESSES empty and data/assets.json has no deployed addresses.");
      console.error("Run: npx hardhat run --network <net> scripts/deployMockRWA.js first.");
      process.exit(1);
    }
  }

  // ── Deploy infrastructure ────────────────────────────────────────────────
  const OracleFactory = await ethers.getContractFactory("MockPriceOracle");
  const oracle = await OracleFactory.deploy();
  await oracle.waitForDeployment();

  const ARFactory = await ethers.getContractFactory("AttestationRegistry");
  const attestationRegistry = await ARFactory.deploy();
  await attestationRegistry.waitForDeployment();

  const TFFactory = await ethers.getContractFactory("TokenFactory");
  const tokenFactory = await TFFactory.deploy();
  await tokenFactory.waitForDeployment();

  // ── Detect stable decimals ───────────────────────────────────────────────
  let stableDecimals;
  try {
    const stableMeta = await ethers.getContractAt("IERC20Metadata", STABLE_ADDRESS);
    stableDecimals = Number(await stableMeta.decimals());
  } catch (_) {
    stableDecimals = process.env.STABLE_DECIMALS ? parseInt(process.env.STABLE_DECIMALS, 10) : 6;
  }

  // ── Deploy BasketManager ─────────────────────────────────────────────────
  // Only ADMIN_ADDRESS gets DEFAULT_ADMIN_ROLE and MANAGER_ROLE
  const BMFactory = await ethers.getContractFactory("BasketManager");
  const manager = await BMFactory.deploy(
    STABLE_ADDRESS,
    oracle.target,
    tokenFactory.target,
    attestationRegistry.target,
    ADMIN_ADDRESS,      // <-- admin (not necessarily deployer)
    stableDecimals
  );
  await manager.waitForDeployment();

  // ── Process each asset ───────────────────────────────────────────────────
  const resolvedAssets = [];
  for (const rawAddr of assetList) {
    let assetAddr = rawAddr;
    const code = await ethers.provider.getCode(rawAddr);
    if (code === "0x") {
      // No contract at address — deploy MockRWA for demo
      const MockRWA = await ethers.getContractFactory("MockRWA");
      const mock = await MockRWA.deploy(
        `Mock-${rawAddr.slice(2, 6)}`,
        `M${rawAddr.slice(2, 5).toUpperCase()}`,
        ethers.parseUnits("10000000", 18)
      );
      await mock.waitForDeployment();
      assetAddr = mock.target;

      // Seed manager with tokens
      const seedTx = await mock.mintTo(manager.target, ethers.parseUnits("100000", 18));
      await seedTx.wait();
    }
    const priceTx = await oracle.setPrice(assetAddr, ethers.parseUnits("1", 18));
    await priceTx.wait();
    resolvedAssets.push(assetAddr);
  }

  // ── Mint basket 0 with all resolved assets ───────────────────────────────
  // Note: mintBasket requires admin role — deployer must == ADMIN_ADDRESS,
  // or if they differ, this call will revert (expected in prod; fine for CI).
  let indexAddress = ethers.ZeroAddress;
  if (deployer.address.toLowerCase() === ADMIN_ADDRESS.toLowerCase()) {
    const N = resolvedAssets.length;
    const base = Math.floor(10000 / N);
    const weights = Array(N).fill(base);
    weights[N - 1] = 10000 - base * (N - 1);

    const metaJSON = JSON.stringify({
      name:   "TrancheX-RWA-ETF",
      symbol: "TRXETF",
      description: "Default basket — all assets, equal weights",
    });

    const mintTx = await manager.mintBasket(
      resolvedAssets, weights,
      "TrancheX-RWA-ETF", "TRXETF",
      metaJSON
    );
    const receipt = await mintTx.wait();
    const iface = manager.interface;
    for (const log of receipt.logs) {
      try {
        const p = iface.parseLog(log);
        if (p?.name === "BasketMinted") indexAddress = p.args.token;
      } catch (_) {}
    }
  }

  // ── Output ───────────────────────────────────────────────────────────────
  console.log(JSON.stringify({
    indexAddress,
    managerAddress:      manager.target,
    oracleAddress:       oracle.target,
    stableAddress:       STABLE_ADDRESS,
    assetsCount:         resolvedAssets.length,
    attestationRegistry: attestationRegistry.target,
    tokenFactory:        tokenFactory.target,
    adminAddress:        ADMIN_ADDRESS,
  }));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
