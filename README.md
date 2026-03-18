# TrancheX — RWA Index Fund MVP

Multi-basket tokenized fund on **HashKey Chain Testnet** (chainId 133).

Supports:
- Standard ERC-20 index baskets (`IndexToken`)
- Permissioned ERC-3643 baskets (`ERC3643Basket`) with on-chain attestation-based compliance
- Off-chain oracle pricing, NAV calculation, purchase/redeem, and manager rebalancing

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env:
#   PRIVATE_KEY     — deployer private key (with or without 0x prefix)
#   RPC_URL         — default: https://testnet.hsk.xyz
#   STABLE_ADDRESS  — testnet USDC.e contract address
#   ADMIN_ADDRESS   — address that receives DEFAULT_ADMIN_ROLE + MANAGER_ROLE
#                     (defaults to deployer address if unset)
#   ASSET_ADDRESSES — comma-separated token addresses (optional;
#                     reads data/assets.json if absent)
```

### 3. Compile contracts

```bash
npx hardhat compile
```

### 4. Deploy 40 mock tokens (testnet demo)

```bash
# Deploys 20 RWA tokens (ERC3643Basket) + 20 normal tokens (MockRWA)
# and writes real addresses to data/assets.json
npx hardhat run --network hashkeyTestnet scripts/deployMockRWA.js
```

### 5. Generate price history (optional — used by frontend charts)

```bash
node scripts/generateHistory.js
```

### 6. Deploy core contracts to HashKey Testnet

```bash
# Reads addresses from data/assets.json (populated in step 4)
npx hardhat run --network hashkeyTestnet scripts/deploy.js
```

Expected output (single JSON line):
```json
{
  "indexAddress":        "0x…",
  "managerAddress":      "0x…",
  "oracleAddress":       "0x…",
  "stableAddress":       "0x…",
  "assetsCount":         40,
  "attestationRegistry": "0x…",
  "tokenFactory":        "0x…",
  "adminAddress":        "0x…"
}
```

### 7. Run tests

```bash
npx hardhat test
```

All 12 tests should pass.

### 8. Launch frontend

```bash
cd frontend
cp .env.example .env
# Edit frontend/.env with addresses from deploy output:
#   VITE_MANAGER_ADDRESS       — from managerAddress
#   VITE_STABLE_ADDRESS        — from stableAddress
#   VITE_ORACLE_ADDRESS        — from oracleAddress
#   VITE_ATTESTATION_REGISTRY  — from attestationRegistry
#   VITE_ADMIN_ADDRESS         — from adminAddress (for display only)
npm install
npm run dev
```

Open http://localhost:5173

---

## Minting Flow (Admin)

1. Connect a wallet that holds `DEFAULT_ADMIN_ROLE` on the BasketManager.
   The **Admin** tab only appears after an on-chain `hasRole` check passes.

2. On the **Admin** tab, the token grid shows all 40 assets.
   **Click** a card to select/deselect it (blue border = selected, ✓ badge).

3. Once at least one token is selected, a **Weight Editor** appears.
   - Each row shows the token symbol and a decimal input (0–1).
   - The current sum is displayed; must equal `1.0000 ±0.001` to enable minting.
   - Weights default to equal distribution on each new selection.

4. Fill in **Basket Name** and **Symbol**, then click **Mint Basket**.
   - Frontend converts decimal weights → integer basis points:
     `bps[i] = Math.round(w[i] * 10000)`, then adjusts the last entry so
     `sum(bps) == 10000` exactly.
   - Builds a `metadataJSON` string embedding asset addresses, weights, and
     creation timestamp.
   - Calls `manager.mintBasket(assets, weightsBp, name, symbol, metadataJSON)`.

5. After the tx confirms, selected tokens are un-highlighted and the new basket
   appears in the **Fund** tab basket list.

### Contract: `mintBasket` signature

```solidity
function mintBasket(
    address[] calldata assets_,
    uint256[] calldata weights_,   // basis points, must sum to 10000
    string calldata name_,
    string calldata symbol_,
    string calldata metadataJSON_  // arbitrary JSON stored on-chain
) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 basketId);
```

```solidity
function getBasketMetadata(uint256 basketId) public view returns (string memory);
```

Event emitted:
```solidity
event BasketMinted(
    uint256 indexed basketId,
    address indexed token,
    bool isERC3643,
    string name,
    string symbol,
    string metadataJSON
);
```

---

## Architecture

```
contracts/
  IndexToken.sol         — Standard ERC-20 share token (MINTER_ROLE gated)
  ERC3643Basket.sol      — Permissioned share token with allowlist + compliance modules
  MockPriceOracle.sol    — Price oracle (price in 1e18 USDC units)
  AttestationRegistry.sol— EIP-712 signed compliance attestations
  TokenFactory.sol       — Deploys IndexToken / ERC3643Basket (keeps BasketManager lean)
  BasketManager.sol      — Core: mintBasket, purchase, redeem, executeRebalance
  MockRWA.sol            — ERC-20 test token with mintTo

scripts/
  deploy.js              — Full deployment + basket 0 creation
  generateHistory.js     — 180-day deterministic price history for 20 tokens
  applyRebalance.js      — Submit executeRebalance + simulate token movements
  resolveHashFans.js     — Fetch real HashFans addresses (requires network)

data/
  assets.json            — 20 token definitions (placeholder addresses)
  prices/<SYMBOL>.json   — 180-day price series

frontend/src/
  pages/
    AdminDashboard.jsx   — Token grid, MintBasket modal, Rebalance panel
    UserDashboard.jsx    — Basket list, per-basket purchase/redeem/compliance
  components/
    TokenCard.jsx        — Token card with SVG sparkline
    BasketCard.jsx       — Basket summary card
  hooks/useWeb3.js       — MetaMask connect + HashKey Testnet switch
  rebalancer.js          — Off-chain delta computation
  abis/                  — Contract ABIs (auto-generated from artifacts)
  config.js              — Addresses + chain config

tests/
  basket.test.js         — 8 tests covering full lifecycle
```

## Key formulas

| Formula | Expression |
|---|---|
| `stableScaling` | `10^(18 - stableDecimals)` |
| `getNav(id)` | `Σ(bal[i] * price[i] / 1e18) + stableBal * stableScaling` |
| `navPerShare(id)` | `(nav * 1e18) / totalSupply` |
| `sharesMinted` | `(stableAmount * stableScaling * 1e18) / navPerShare` |
| `stableReturned` | `(shares * navPerShare / 1e18) / stableScaling` |

## ABI files

ABIs in `frontend/src/abis/` are generated at compile time. To regenerate after contract changes:

```bash
npx hardhat compile
node -e "
const fs=require('fs'),path=require('path');
['BasketManager','IndexToken','ERC3643Basket','MockPriceOracle','AttestationRegistry','TokenFactory','MockRWA'].forEach(c=>{
  const art=path.join('artifacts/contracts',c+'.sol',c+'.json');
  const {abi}=JSON.parse(fs.readFileSync(art));
  fs.writeFileSync('frontend/src/abis/'+c+'.json',JSON.stringify(abi,null,2));
  console.log('wrote',c+'.json');
});
"
```

## Resolving real HashFans token addresses

```bash
node scripts/resolveHashFans.js
# Updates data/assets.json with live addresses if network is available
```

## Rebalancing

```bash
# After deploying, generate deltas.json with the frontend rebalancer
# or compute manually, then:
npx hardhat run --network hashkeyTestnet scripts/applyRebalance.js
# Set DELTAS_FILE env to point to your deltas.json
```
