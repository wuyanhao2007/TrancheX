/**
 * tests/basket.test.js
 *
 * Covers:
 *  - Deploy all contracts
 *  - Create 20 mock assets (mix of MockRWA and mock ERC-3643)
 *  - Admin mints basket containing the mixture
 *  - User without attestation cannot purchase ERC-3643 basket
 *  - After attestation is granted, user can purchase and redeem
 *  - executeRebalance emits RebalanceExecuted event
 *  - [new] Non-admin cannot call mintBasket
 *  - [new] getBasketMetadata returns stored JSON
 *  - [new] mintBasket reverts when weights do not sum to 10000
 */

const { expect } = require("chai");
const { ethers }  = require("hardhat");

// ── Helpers ─────────────────────────────────────────────────────────────────

async function deployAll() {
  const [admin, manager, user, attester] = await ethers.getSigners();

  // Deploy stable (MockRWA with 6 decimals)
  const MockRWA = await ethers.getContractFactory("MockRWA");
  const stable  = await MockRWA.deploy("Mock USDC", "mUSDC", ethers.parseUnits("1000000", 6));
  await stable.waitForDeployment();

  // Deploy oracle
  const Oracle = await ethers.getContractFactory("MockPriceOracle");
  const oracle = await Oracle.deploy();
  await oracle.waitForDeployment();

  // Deploy AttestationRegistry
  const AR = await ethers.getContractFactory("AttestationRegistry");
  const attestationRegistry = await AR.deploy();
  await attestationRegistry.waitForDeployment();

  // Deploy TokenFactory
  const TF = await ethers.getContractFactory("TokenFactory");
  const tokenFactory = await TF.deploy();
  await tokenFactory.waitForDeployment();

  // Deploy BasketManager
  const BM = await ethers.getContractFactory("BasketManager");
  const basketManager = await BM.deploy(
    stable.target,
    oracle.target,
    tokenFactory.target,
    attestationRegistry.target,
    admin.address,
    6 // USDC decimals
  );
  await basketManager.waitForDeployment();

  return { admin, manager, user, attester, stable, oracle, attestationRegistry, tokenFactory, basketManager };
}

// ── Mock ERC-3643 contract (inline, deployed via bytecode) ───────────────────

async function deployMockERC3643(admin) {
  // Reuse ERC3643Basket from our contracts
  const Factory = await ethers.getContractFactory("ERC3643Basket");
  const token = await Factory.deploy(
    "Mock ERC3643",
    "mT3643",
    admin.address,
    "ipfs://mock",
    ["KYC", "AML"]
  );
  await token.waitForDeployment();
  return token;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("TrancheX BasketManager", function () {
  this.timeout(120_000);

  let ctx;
  let mockAssets = []; // addresses of 20 mock tokens
  let erc3643Addrs = []; // which are ERC-3643

  before(async function () {
    ctx = await deployAll();
    const { admin, oracle } = ctx;

    // ── Deploy 20 mock assets ─────────────────────────────────────────────
    const MockRWA  = await ethers.getContractFactory("MockRWA");

    for (let i = 0; i < 18; i++) {
      const tok = await MockRWA.deploy(`Asset${i}`, `A${i}`, ethers.parseUnits("1000000", 18));
      await tok.waitForDeployment();
      mockAssets.push(tok.target);

      // Seed manager with tokens
      await tok.mintTo(ctx.basketManager.target, ethers.parseUnits("10000", 18));

      // Set oracle price (1e18 = 1 USDC)
      await oracle.setPrice(tok.target, ethers.parseUnits("1", 18));
    }

    // Two ERC-3643 assets
    for (let i = 0; i < 2; i++) {
      const tok = await deployMockERC3643(admin);
      erc3643Addrs.push(tok.target);
      mockAssets.push(tok.target);
      await oracle.setPrice(tok.target, ethers.parseUnits("1", 18));
    }

    expect(mockAssets.length).to.equal(20);
  });

  // ── 1. mintBasket creates correct token type ──────────────────────────────

  it("should mint a standard basket (no ERC-3643 assets)", async function () {
    const { basketManager, admin } = ctx;

    const stdAssets  = mockAssets.slice(0, 5);
    const N = stdAssets.length;
    const base = Math.floor(10000 / N);
    const weights = Array(N).fill(base);
    weights[N-1] = 10000 - base*(N-1);

    const tx = await basketManager.mintBasket(
      stdAssets, weights,
      "Standard ETF", "SETF",
      "ipfs://standard"
    );
    const receipt = await tx.wait();

    // Find BasketMinted event
    const iface = basketManager.interface;
    let found = null;
    for (const log of receipt.logs) {
      try { const p = iface.parseLog(log); if (p?.name === "BasketMinted") found = p.args; } catch (_) {}
    }
    expect(found).to.not.be.null;
    expect(found.isERC3643).to.equal(false);
    expect(Number(found.basketId)).to.equal(0);
  });

  // ── 2. mintBasket with ERC-3643 assets creates permissioned token ─────────

  let erc3643BasketId;
  let erc3643TokenAddr;

  it("should mint an ERC-3643 basket when any asset is ERC-3643", async function () {
    const { basketManager } = ctx;

    // Use only ERC-3643 assets (no overlap with basket 0) to keep NAV isolated
    const mixedAssets = [...erc3643Addrs];
    const N = mixedAssets.length;
    const base = Math.floor(10000 / N);
    const weights = Array(N).fill(base);
    weights[N-1] = 10000 - base*(N-1);

    const tx = await basketManager.mintBasket(
      mixedAssets, weights,
      "Permissioned RWA", "PRWA",
      "ipfs://permissioned"
    );
    const receipt = await tx.wait();

    const iface = basketManager.interface;
    let found = null;
    for (const log of receipt.logs) {
      try { const p = iface.parseLog(log); if (p?.name === "BasketMinted") found = p.args; } catch (_) {}
    }
    expect(found).to.not.be.null;
    expect(found.isERC3643).to.equal(true);

    erc3643BasketId  = Number(found.basketId);
    erc3643TokenAddr = found.token;

    // Verify compliance modules were aggregated (KYC + AML from 2 ERC-3643 assets)
    const modules = await basketManager.getBasketModules(erc3643BasketId);
    expect(modules).to.include("KYC");
    expect(modules).to.include("AML");
  });

  // ── 3. User without attestation cannot purchase ───────────────────────────

  it("should reject purchase when user lacks attestations", async function () {
    const { basketManager, stable, user } = ctx;

    // Give user some stable
    await stable.mintTo(user.address, ethers.parseUnits("1000", 6));
    await stable.connect(user).approve(basketManager.target, ethers.MaxUint256);

    await expect(
      basketManager.connect(user).purchase(
        ethers.parseUnits("100", 6),
        user.address,
        erc3643BasketId
      )
    ).to.be.reverted; // Missing attestation or allowlist
  });

  // ── 4. After attestation, user can purchase ───────────────────────────────

  it("should allow purchase after attestations are submitted", async function () {
    const { basketManager, stable, user, attester, attestationRegistry } = ctx;

    // Register user on the basket token allowlist via BasketManager passthrough
    await basketManager.setBasketAllowlist(erc3643BasketId, user.address, true);

    // Submit KYC + AML attestations signed by attester
    const DOMAIN = {
      name: "AttestationRegistry",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: attestationRegistry.target,
    };
    const TYPES = {
      Attestation: [
        { name: "subject",     type: "address" },
        { name: "moduleId",    type: "bytes32"  },
        { name: "expires",     type: "uint256"  },
        { name: "payloadHash", type: "bytes32"  },
      ],
    };
    const expires = Math.floor(Date.now() / 1000) + 3600;

    for (const module of ["KYC", "AML"]) {
      const moduleHash = ethers.keccak256(ethers.toUtf8Bytes(module));
      const value = {
        subject:     user.address,
        moduleId:    moduleHash,
        expires:     BigInt(expires),
        payloadHash: ethers.ZeroHash,
      };
      const sig = await attester.signTypedData(DOMAIN, TYPES, value);
      await attestationRegistry.submitAttestation(
        attester.address, user.address, module, BigInt(expires), ethers.ZeroHash, sig
      );
    }

    // Verify attestations
    expect(await attestationRegistry.hasAttestation(user.address, "KYC")).to.equal(true);
    expect(await attestationRegistry.hasAttestation(user.address, "AML")).to.equal(true);

    // Now purchase should succeed
    const IERC20 = await ethers.getContractAt("IERC20", erc3643TokenAddr);
    const balBefore = await IERC20.balanceOf(user.address);

    await basketManager.connect(user).purchase(
      ethers.parseUnits("100", 6),
      user.address,
      erc3643BasketId
    );

    const balAfter = await IERC20.balanceOf(user.address);
    expect(balAfter).to.be.gt(balBefore);
  });

  // ── 5. User can redeem ────────────────────────────────────────────────────

  it("should allow redeem after purchase", async function () {
    const { basketManager, stable, user } = ctx;

    const IERC20    = await ethers.getContractAt("IERC20", erc3643TokenAddr);
    const shares    = await IERC20.balanceOf(user.address);
    expect(shares).to.be.gt(0n);

    const stableBefore = await stable.balanceOf(user.address);

    await basketManager.connect(user).redeem(shares, user.address, erc3643BasketId);

    const stableAfter = await stable.balanceOf(user.address);
    expect(stableAfter).to.be.gt(stableBefore);

    const sharesAfter = await IERC20.balanceOf(user.address);
    expect(sharesAfter).to.equal(0n);
  });

  // ── 6. executeRebalance emits event ──────────────────────────────────────

  it("should emit RebalanceExecuted on executeRebalance", async function () {
    const { basketManager } = ctx;

    const stdBasketId = 0;
    const assets = await basketManager.getBasketAssets(stdBasketId);
    const deltas = assets.map(() => 100n); // +100 raw units each

    await expect(basketManager.executeRebalance(deltas, stdBasketId))
      .to.emit(basketManager, "RebalanceExecuted")
      .withArgs(stdBasketId, (await ethers.getSigners())[0].address, deltas);
  });

  // ── 7. NAV calculation ────────────────────────────────────────────────────

  it("getNav returns non-zero after seeding", async function () {
    const { basketManager } = ctx;
    const nav = await basketManager.getNav(0);
    expect(nav).to.be.gt(0n);
  });

  // ── 8. Non-manager cannot executeRebalance ────────────────────────────────

  it("should revert executeRebalance from non-manager", async function () {
    const { basketManager, user } = ctx;
    const assets = await basketManager.getBasketAssets(0);
    const deltas = assets.map(() => 0n);
    await expect(
      basketManager.connect(user).executeRebalance(deltas, 0)
    ).to.be.reverted;
  });

  // ── 9. Non-admin cannot call mintBasket ───────────────────────────────────

  it("should revert mintBasket called by non-admin", async function () {
    const { basketManager, user, oracle } = ctx;

    // user has no DEFAULT_ADMIN_ROLE
    const assets  = mockAssets.slice(0, 2);
    const weights = [5000, 5000];
    await expect(
      basketManager.connect(user).mintBasket(
        assets, weights,
        "Unauthorized Basket", "UNAUTH",
        "{}"
      )
    ).to.be.reverted; // AccessControlUnauthorizedAccount
  });

  // ── 10. getBasketMetadata returns stored JSON ─────────────────────────────

  it("getBasketMetadata returns the exact metadataJSON passed to mintBasket", async function () {
    const { basketManager } = ctx;

    const assets  = mockAssets.slice(5, 7); // non-overlapping with other baskets
    const weights = [6000, 4000];
    const meta    = JSON.stringify({ description: "metadata test", version: 1 });

    const tx = await basketManager.mintBasket(
      assets, weights,
      "Meta Test Basket", "MTB",
      meta
    );
    const receipt = await tx.wait();

    // Parse BasketMinted to get basketId
    const iface = basketManager.interface;
    let basketId = null;
    for (const log of receipt.logs) {
      try {
        const p = iface.parseLog(log);
        if (p?.name === "BasketMinted") basketId = Number(p.args.basketId);
      } catch (_) {}
    }
    expect(basketId).to.not.be.null;

    const storedMeta = await basketManager.getBasketMetadata(basketId);
    expect(storedMeta).to.equal(meta);
  });

  // ── 11. mintBasket reverts when weights don't sum to 10000 ────────────────

  it("should revert mintBasket when weights do not sum to 10000", async function () {
    const { basketManager } = ctx;

    const assets = mockAssets.slice(0, 3);
    const badWeights = [3000, 3000, 3000]; // sum = 9000, not 10000

    await expect(
      basketManager.mintBasket(
        assets, badWeights,
        "Bad Weight Basket", "BWB",
        "{}"
      )
    ).to.be.revertedWith("Weights must sum to 10000");
  });

  // ── 12. mintBasket reverts when assets array is empty ─────────────────────

  it("should revert mintBasket when assets array is empty", async function () {
    const { basketManager } = ctx;

    await expect(
      basketManager.mintBasket([], [], "Empty Basket", "EMPTY", "{}")
    ).to.be.revertedWith("No assets");
  });
});
