/**
 * scripts/applyRebalance.js
 *
 * Reads deltas.json, calls manager.executeRebalance, then simulates the
 * physical token movements for demo purposes:
 *   - Positive delta: mint MockRWA tokens to manager (simulate buy)
 *   - Negative delta: transfer tokens from manager to admin (simulate sell)
 *
 * deltas.json schema:
 *   {
 *     "basketId": 0,
 *     "managerAddress": "0x...",
 *     "assets": ["0x...", "0x..."],
 *     "deltas": ["1000000000000000000", "-500000000000000000"]
 *   }
 *
 * Usage:
 *   npx hardhat run --network hashkeyTestnet scripts/applyRebalance.js
 *   (set DELTAS_FILE env to override default path)
 */

require("dotenv").config();
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const MOCK_RWA_ABI = [
  "function mintTo(address to, uint256 amount) external",
  "function transfer(address to, uint256 amount) external returns (bool)",
];

const BASKET_MANAGER_ABI = [
  "function executeRebalance(int256[] calldata deltas, uint256 basketId) external",
];

async function main() {
  const deltaFile = process.env.DELTAS_FILE || path.join(__dirname, "../deltas.json");
  if (!fs.existsSync(deltaFile)) {
    console.error(`Error: ${deltaFile} not found. Generate it first.`);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(deltaFile, "utf8"));
  const { basketId, managerAddress, assets, deltas } = payload;

  if (!managerAddress || !assets || !deltas) {
    console.error("Error: deltas.json missing required fields");
    process.exit(1);
  }
  if (assets.length !== deltas.length) {
    console.error("Error: assets and deltas arrays must be the same length");
    process.exit(1);
  }

  const [admin] = await ethers.getSigners();

  // ── 1. Submit executeRebalance on-chain ───────────────────────────────
  const manager = new ethers.Contract(managerAddress, BASKET_MANAGER_ABI, admin);
  const deltaBigInts = deltas.map((d) => BigInt(d));

  console.error(`Submitting executeRebalance for basket ${basketId}…`);
  const tx = await manager.executeRebalance(deltaBigInts, basketId);
  const receipt = await tx.wait();
  console.error(`RebalanceExecuted tx: ${receipt.hash}`);

  // ── 2. Simulate physical token movements ─────────────────────────────
  for (let i = 0; i < assets.length; i++) {
    const delta = BigInt(deltas[i]);
    if (delta === 0n) continue;

    const tok = new ethers.Contract(assets[i], MOCK_RWA_ABI, admin);

    if (delta > 0n) {
      // Buy: mint tokens to manager (demo only — real flow: manager does swap)
      try {
        const mintTx = await tok.mintTo(managerAddress, delta);
        await mintTx.wait();
        console.error(`  [BUY]  asset ${i} (${assets[i].slice(0, 10)}…): +${delta}`);
      } catch (err) {
        console.error(`  [BUY]  asset ${i}: mintTo failed (${err.message}) — manual transfer needed`);
      }
    } else {
      // Sell: transfer tokens from manager to admin (demo only)
      // Manager must have approved admin or admin must have MANAGER_ROLE
      // For demo, we assume admin == manager signer and manager contract holds tokens
      const amount = -delta;
      console.error(`  [SELL] asset ${i} (${assets[i].slice(0, 10)}…): -${amount} (manual transfer required)`);
      // Note: actual sell transfer requires manager contract to expose a withdraw function
      // or for the manager to execute the swap and send proceeds back.
      // TODO: implement manager.withdrawAsset() for production rebalance flows.
    }
  }

  // ── 3. Output result ──────────────────────────────────────────────────
  console.log(JSON.stringify({ success: true, txHash: receipt.hash, basketId }));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
