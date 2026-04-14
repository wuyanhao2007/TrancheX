# TrancheX

RWA baskets on HashKey Chain.

TrancheX is a testnet dApp for building and managing token baskets from on-chain assets. Users can buy individual tokens or basket shares with USDC. Admins can create baskets, adjust weights, rebalance holdings, and retire baskets.

## What TrancheX does

* shows a catalog of single tokens and baskets
* lets users buy or redeem with USDC
* prices baskets from underlying asset NAV
* supports basket-level compliance tags
* lets admins create baskets by selecting tokens and setting weights
* lets admins rebalance or deactivate baskets

## Why it exists

RWA products are often fragmented. TrancheX packages tokenized assets into a basket that behaves more like an ETF:

* one entry point
* transparent basket pricing
* clear compliance requirements
* simple mint and redeem flow

## How it works

### Single tokens

Each token has its own page, price view, and buy flow. The app reads token history files to draw charts and display asset data.

### Baskets

A basket is built from a set of tokens and weights. The basket price is derived from its NAV divided by total supply.

### Compliance

Some assets carry compliance modules such as KYC, AML, accredited investor checks, or transfer restrictions. Basket compliance is the unique union of the modules from its underlying assets.

### Admin flow

Admins can:

* select tokens from the catalog
* assign weights
* mint a basket
* rebalance a basket
* destroy or deactivate a basket

## Stack

* HashKey Chain testnet
* Solidity
* Hardhat 2.22
* ethers v6
* React + Vite
* Tailwind CSS

## Local setup

### Install

```bash
npm install
cd frontend
npm install
```

### Configure environment

Create a `.env` file in the project root:

```env
PRIVATE_KEY=0x...
RPC_URL=https://testnet.hsk.xyz
ADMIN_ADDRESS=0x...
STABLE_ADDRESS=0x...
ASSET_ADDRESSES=0x...,0x...
```

Create a `.env.local` file in `frontend/`:

```env
VITE_RPC_URL=https://testnet.hsk.xyz
VITE_MANAGER_ADDRESS=0x...
VITE_INDEX_ADDRESS=0x...
VITE_STABLE_ADDRESS=0x...
VITE_ADMIN_ADDRESS=0x...
```

### Compile contracts

```bash
npx hardhat compile
```

### Deploy to testnet

```bash
npx hardhat run --network hashkeyTestnet scripts/deploy.js
```

### Run the frontend

```bash
cd frontend
npm run dev
```

## Project structure

```text
contracts/        Solidity contracts
scripts/          Deployment and helper scripts
frontend/         React app
data/             Asset metadata and price history
```

## Demo flow

1. Connect a wallet on HashKey Chain testnet.
2. Browse the token catalog.
3. Admin selects tokens and creates a basket.
4. User buys a token or basket with USDC.
5. User sees price, history, and compliance tags.
6. Admin rebalances or deactivates a basket.

## Notes

This project is a hackathon prototype.

Some parts are simulated for demo purposes, including:

* token price history
* basket history generation
* compliance labels
* basket creation metadata

The chain interactions, role checks, and mint/redeem flows are real on testnet.

## License

MIT
