// Contract addresses — set VITE_* in frontend/.env after deployment
export const ADDRESSES = {
  manager:             import.meta.env.VITE_MANAGER_ADDRESS || "",
  indexToken:          import.meta.env.VITE_INDEX_ADDRESS   || "",
  stable:              import.meta.env.VITE_STABLE_ADDRESS  || "",
  oracle:              import.meta.env.VITE_ORACLE_ADDRESS  || "",
  attestationRegistry: import.meta.env.VITE_ATTESTATION_REGISTRY || "",
};

export const HASHKEY_TESTNET = {
  chainId: "0x85", // 133 decimal
  chainName: "HashKey Chain Testnet",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: ["https://testnet.hsk.xyz"],
  blockExplorerUrls: ["https://testnet.hashscan.io"],
};

// ── ABIs ────────────────────────────────────────────────────────────────────

export const BASKET_MANAGER_ABI = [
  {
    inputs: [],
    name: "getNav",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "navPerShare",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getAssets",
    outputs: [{ internalType: "address[]", name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getWeights",
    outputs: [{ internalType: "uint256[]", name: "", type: "uint256[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "stableAmount", type: "uint256" },
      { internalType: "address", name: "recipient", type: "address" },
    ],
    name: "purchase",
    outputs: [{ internalType: "uint256", name: "sharesMinted", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "sharesAmount", type: "uint256" },
      { internalType: "address", name: "recipient", type: "address" },
    ],
    name: "redeem",
    outputs: [{ internalType: "uint256", name: "stableReturned", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "int256[]", name: "deltas", type: "int256[]" }],
    name: "executeRebalance",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "stableScaling",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "buyer", type: "address" },
      { indexed: false, internalType: "uint256", name: "stableAmount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "sharesMinted", type: "uint256" },
    ],
    name: "Purchased",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "redeemer", type: "address" },
      { indexed: false, internalType: "uint256", name: "sharesBurned", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "stableReturned", type: "uint256" },
    ],
    name: "Redeemed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "manager", type: "address" },
      { indexed: false, internalType: "int256[]", name: "deltas", type: "int256[]" },
    ],
    name: "RebalanceExecuted",
    type: "event",
  },
];

export const ERC20_ABI = [
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
];

export const ORACLE_ABI = [
  {
    inputs: [
      { internalType: "address", name: "asset", type: "address" },
      { internalType: "uint256", name: "price", type: "uint256" },
    ],
    name: "setPrice",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "asset", type: "address" }],
    name: "getPrice",
    outputs: [
      { internalType: "uint256", name: "price", type: "uint256" },
      { internalType: "uint256", name: "updatedAt", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
];
