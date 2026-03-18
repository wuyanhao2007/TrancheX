require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

const RPC_URL = process.env.RPC_URL || "https://testnet.hsk.xyz";
const RAW_PK = process.env.PRIVATE_KEY || "";

function normalizePk(raw) {
  if (!raw) return "";
  return raw.startsWith("0x") ? raw : `0x${raw}`;
}

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
  },
  paths: {
    tests: "./tests",
  },
  networks: {
    hardhat: {},
    hashkeyTestnet: {
      url: RPC_URL,
      chainId: 133,
      accounts: normalizePk(RAW_PK) ? [normalizePk(RAW_PK)] : [],
    },
  },
};