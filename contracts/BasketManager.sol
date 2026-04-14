// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "./TokenFactory.sol";
import "./AttestationRegistry.sol";

// ── Minimal interfaces ──────────────────────────────────────────────────────

interface IIndexToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function totalSupply() external view returns (uint256);
    function grantRole(bytes32 role, address account) external;
    function MINTER_ROLE() external view returns (bytes32);
}

interface IERC3643Basket {
    function mintTo(address to, uint256 amount) external;
    function burnFrom(address from, uint256 amount) external;
    function totalSupply() external view returns (uint256);
    function canTransfer(address from, address to, uint256 amount) external view returns (bool);
    function setAllow(address account, bool allowed) external;
    function grantRole(bytes32 role, address account) external;
    function MINTER_ROLE() external view returns (bytes32);
    // ERC-3643 compliance modules — two possible method names
    function getComplianceModules() external view returns (string[] memory);
    function complianceModules(uint256 index) external view returns (string memory);
}

interface IOracle {
    function getPrice(address asset) external view returns (uint256 price, uint256 updatedAt);
}

/**
 * @title BasketManager
 * @notice Core multi-basket index fund contract.
 *
 * Each basket has:
 *   - A unique uint256 basketId
 *   - A dedicated share token (IndexToken or ERC3643Basket)
 *   - A set of underlying asset addresses and their target weights (basis points)
 *   - Its own stable-token accounting (per-basket stable balance)
 *
 * Roles:
 *   DEFAULT_ADMIN_ROLE — deploy & configure baskets, emergency withdraw
 *   MANAGER_ROLE       — execute rebalances
 */
contract BasketManager is AccessControl, Pausable {
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant MINTER_ROLE  = keccak256("MINTER_ROLE");

    // ── Basket metadata ────────────────────────────────────────────────────

    /// @dev Basket lifecycle: 0 = Active, 1 = Inactive, 2 = Destroyed
    uint8 public constant STATUS_ACTIVE    = 0;
    uint8 public constant STATUS_INACTIVE  = 1;
    uint8 public constant STATUS_DESTROYED = 2;

    struct Basket {
        address token;               // ERC-20 share token address
        bool    isERC3643;           // whether token is a permissioned ERC3643Basket
        address[] assets;            // underlying asset token addresses
        uint256[] weights;           // target weights in basis points (sum = 10000)
        string  name;
        string  symbol;
        string  metadataJSON;        // arbitrary JSON metadata stored on-chain
        string[] complianceModules;  // aggregated from ERC3643 assets
        uint8   status;              // 0=Active, 1=Inactive, 2=Destroyed
    }

    mapping(uint256 => Basket) public basketData; // basketId => Basket
    uint256 public basketsCount;

    // ── Infrastructure ─────────────────────────────────────────────────────

    IERC20   public immutable stable;
    IOracle  public immutable oracle;
    TokenFactory public immutable factory;
    AttestationRegistry public immutable attestationRegistry;

    uint256 public immutable stableScaling; // 10^(18 - stableDecimals)

    // Per-basket stable balance (in stable native units)
    mapping(uint256 => uint256) private _basketStable;

    // ── Timelock placeholder ───────────────────────────────────────────────

    /// @notice Minimum delay (seconds) before admin actions take effect.
    /// TODO: implement a full TimelockController for production.
    uint256 public timelockDelay = 0;

    // ── Events ─────────────────────────────────────────────────────────────

    event BasketMinted(
        uint256 indexed basketId,
        address indexed token,
        bool isERC3643,
        string name,
        string symbol,
        string metadataJSON
    );
    event Purchased(
        uint256 indexed basketId,
        address indexed buyer,
        uint256 stableAmount,
        uint256 sharesMinted
    );
    event Redeemed(
        uint256 indexed basketId,
        address indexed redeemer,
        uint256 sharesBurned,
        uint256 stableReturned
    );
    event RebalanceExecuted(
        uint256 indexed basketId,
        address indexed manager,
        int256[] deltas
    );
    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);
    event BasketDeactivated(uint256 indexed basketId, bool destroyed);
    event BasketWeightsUpdated(uint256 indexed basketId);

    // ── Constructor ────────────────────────────────────────────────────────

    constructor(
        address stable_,
        address oracle_,
        address factory_,
        address attestationRegistry_,
        address admin,
        uint256 stableDecimalsOrSentinel
    ) {
        stable = IERC20(stable_);
        oracle = IOracle(oracle_);
        factory = TokenFactory(factory_);
        attestationRegistry = AttestationRegistry(attestationRegistry_);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MANAGER_ROLE, admin);

        // Resolve stable decimals
        uint256 stableDecimals;
        if (stableDecimalsOrSentinel == type(uint256).max) {
            stableDecimals = uint256(IERC20Metadata(stable_).decimals());
        } else {
            stableDecimals = stableDecimalsOrSentinel;
        }
        require(stableDecimals <= 18, "stableDecimals > 18");
        stableScaling = 10 ** (18 - stableDecimals);
    }

    // ── Admin: legacy single-basket asset config ────────────────────────────

    /**
     * @notice Update assets/weights for an existing basket (admin only).
     *         Weights must sum to 10000.
     */
    function setAssets(
        uint256 basketId,
        address[] calldata assets_,
        uint256[] calldata weights_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(basketId < basketsCount, "Invalid basketId");
        require(assets_.length == weights_.length, "Length mismatch");
        uint256 sum;
        for (uint256 i = 0; i < weights_.length; i++) sum += weights_[i];
        require(sum == 10000, "Weights must sum to 10000");
        basketData[basketId].assets  = assets_;
        basketData[basketId].weights = weights_;
    }

    // ── Admin: mint a new basket ───────────────────────────────────────────

    /**
     * @notice Create a new basket token.
     *
     * Detection logic:
     *   For each asset, we try to call `getComplianceModules()` (and then
     *   `complianceModules(0)` as fallback) via try/catch. If any asset
     *   responds successfully, the basket is classified as ERC-3643 and
     *   compliance modules are aggregated across all ERC-3643 assets.
     *   The appropriate token type is deployed via TokenFactory.
     *
     * @param assets_   Underlying asset addresses.
     * @param weights_  Target weights in bps (must sum to 10000).
     * @param name_     Basket share token name.
     * @param symbol_       Basket share token symbol.
     * @param metadataJSON_ Arbitrary JSON string stored on-chain for this basket.
     * @return basketId The newly assigned basket identifier.
     */
    function mintBasket(
        address[] calldata assets_,
        uint256[] calldata weights_,
        string calldata name_,
        string calldata symbol_,
        string calldata metadataJSON_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 basketId) {
        require(assets_.length > 0, "No assets");
        require(assets_.length == weights_.length, "Length mismatch");
        {
            uint256 sum;
            for (uint256 i = 0; i < weights_.length; i++) sum += weights_[i];
            require(sum == 10000, "Weights must sum to 10000");
        }

        // ── ERC-3643 detection & module aggregation ────────────────────────
        // We use dynamic arrays via a two-pass approach (collect count first).
        bool anyERC3643 = false;
        uint256 totalModules = 0;

        // First pass: count modules
        for (uint256 i = 0; i < assets_.length; i++) {
            (bool is3643, uint256 modCount) = _probeERC3643(assets_[i]);
            if (is3643) {
                anyERC3643 = true;
                totalModules += modCount;
            }
        }

        // Second pass: collect unique module strings
        string[] memory aggregated = new string[](totalModules);
        uint256 idx = 0;
        if (anyERC3643) {
            for (uint256 i = 0; i < assets_.length; i++) {
                (bool is3643, uint256 modCount) = _probeERC3643(assets_[i]);
                if (is3643) {
                    try IERC3643Basket(assets_[i]).getComplianceModules() returns (string[] memory mods) {
                        for (uint256 j = 0; j < mods.length; j++) {
                            aggregated[idx++] = mods[j];
                        }
                    } catch {
                        // fallback: fetch one-by-one up to modCount
                        for (uint256 j = 0; j < modCount; j++) {
                            try IERC3643Basket(assets_[i]).complianceModules(j) returns (string memory m) {
                                aggregated[idx++] = m;
                            } catch {}
                        }
                    }
                }
            }
        }

        // ── Deploy share token via factory ─────────────────────────────────
        address tokenAddr;
        if (anyERC3643) {
            // Pass metadataJSON_ as the URI argument; ERC3643Basket stores it as metadataURI
            tokenAddr = factory.deployERC3643Basket(name_, symbol_, address(this), metadataJSON_, aggregated);
            // Allow manager contract to hold/receive tokens
            IERC3643Basket(tokenAddr).setAllow(address(this), true);
        } else {
            tokenAddr = factory.deployIndexToken(name_, symbol_, address(this));
        }

        // ── Store basket ───────────────────────────────────────────────────
        basketId = basketsCount++;
        Basket storage b = basketData[basketId];
        b.token        = tokenAddr;
        b.isERC3643    = anyERC3643;
        b.name         = name_;
        b.symbol       = symbol_;
        b.metadataJSON = metadataJSON_;
        // copy assets/weights
        for (uint256 i = 0; i < assets_.length; i++) {
            b.assets.push(assets_[i]);
            b.weights.push(weights_[i]);
        }
        // copy modules
        for (uint256 i = 0; i < aggregated.length; i++) {
            b.complianceModules.push(aggregated[i]);
        }

        emit BasketMinted(basketId, tokenAddr, anyERC3643, name_, symbol_, metadataJSON_);
    }

    // ── NAV helpers ────────────────────────────────────────────────────────

    /**
     * @notice Total NAV of basket in 1e18-normalized USDC units.
     * @param basketId Basket identifier.
     */
    function getNav(uint256 basketId) public view returns (uint256) {
        Basket storage b = basketData[basketId];
        uint256 total = 0;
        for (uint256 i = 0; i < b.assets.length; i++) {
            uint256 bal = IERC20(b.assets[i]).balanceOf(address(this));
            (uint256 price, ) = oracle.getPrice(b.assets[i]);
            total += (bal * price) / 1e18;
        }
        // Add per-basket stable holdings (normalized to 1e18)
        total += _basketStable[basketId] * stableScaling;
        return total;
    }

    /**
     * @notice NAV per share in 1e18 units.
     */
    function navPerShare(uint256 basketId) public view returns (uint256) {
        uint256 supply = IERC20(basketData[basketId].token).totalSupply();
        if (supply == 0) return 1e18;
        return (getNav(basketId) * 1e18) / supply;
    }

    // ── User: purchase ─────────────────────────────────────────────────────

    /**
     * @notice Purchase basket shares.
     * @param stableAmount Amount in stable native decimals (e.g. 6 for USDC).
     * @param recipient    Recipient of the minted shares.
     * @param basketId     Target basket.
     * @return sharesMinted Number of shares minted (18 decimals).
     */
    /**
     * @notice Deactivate or permanently destroy a basket.
     * @param basketId  Target basket.
     * @param destroyed true = STATUS_DESTROYED (irreversible), false = STATUS_INACTIVE (reversible).
     */
    function deactivateBasket(uint256 basketId, bool destroyed)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(basketId < basketsCount, "Invalid basketId");
        basketData[basketId].status = destroyed ? STATUS_DESTROYED : STATUS_INACTIVE;
        emit BasketDeactivated(basketId, destroyed);
    }

    /**
     * @notice Reactivate a basket that was set to STATUS_INACTIVE.
     *         Cannot reactivate a STATUS_DESTROYED basket.
     */
    function reactivateBasket(uint256 basketId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(basketId < basketsCount, "Invalid basketId");
        require(basketData[basketId].status == STATUS_INACTIVE, "Not inactive");
        basketData[basketId].status = STATUS_ACTIVE;
    }

    /**
     * @notice Update target weights for a basket (manager only).
     *         Basket must be active. Weights must sum to 10000.
     */
    function updateBasketWeights(uint256 basketId, uint256[] calldata weights_)
        external
        onlyRole(MANAGER_ROLE)
    {
        require(basketId < basketsCount, "Invalid basketId");
        require(basketData[basketId].status == STATUS_ACTIVE, "Basket not active");
        require(weights_.length == basketData[basketId].assets.length, "Length mismatch");
        uint256 sum;
        for (uint256 i = 0; i < weights_.length; i++) sum += weights_[i];
        require(sum == 10000, "Weights must sum to 10000");
        // Overwrite weights in-place
        for (uint256 i = 0; i < weights_.length; i++) {
            basketData[basketId].weights[i] = weights_[i];
        }
        emit BasketWeightsUpdated(basketId);
    }

    function purchase(
        uint256 stableAmount,
        address recipient,
        uint256 basketId
    ) external whenNotPaused returns (uint256 sharesMinted) {
        require(basketId < basketsCount, "Invalid basketId");
        require(basketData[basketId].status == STATUS_ACTIVE, "Basket not active");
        Basket storage b = basketData[basketId];

        // ── Compliance check for ERC-3643 baskets ─────────────────────────
        if (b.isERC3643) {
            // 1. Token-level allowlist check
            require(
                IERC3643Basket(b.token).canTransfer(address(this), recipient, 0),
                "ERC3643: recipient not on allowlist"
            );
            // 2. Attestation check for each compliance module
            for (uint256 i = 0; i < b.complianceModules.length; i++) {
                require(
                    attestationRegistry.hasAttestation(recipient, b.complianceModules[i]),
                    string(abi.encodePacked("Missing attestation: ", b.complianceModules[i]))
                );
            }
        }

        // ── Transfer stable in ─────────────────────────────────────────────
        require(stable.transferFrom(msg.sender, address(this), stableAmount), "transfer failed");
        _basketStable[basketId] += stableAmount;

        // ── Compute shares ─────────────────────────────────────────────────
        uint256 nav    = getNav(basketId);
        uint256 supply = IERC20(b.token).totalSupply();
        uint256 nps    = supply == 0 ? 1e18 : (nav * 1e18) / supply;
        uint256 stableNorm = stableAmount * stableScaling;
        sharesMinted = (stableNorm * 1e18) / nps;

        // ── Mint ───────────────────────────────────────────────────────────
        if (b.isERC3643) {
            IERC3643Basket(b.token).mintTo(recipient, sharesMinted);
        } else {
            IIndexToken(b.token).mint(recipient, sharesMinted);
        }

        emit Purchased(basketId, recipient, stableAmount, sharesMinted);
    }

    // ── User: redeem ───────────────────────────────────────────────────────

    /**
     * @notice Redeem basket shares for stable tokens.
     * @param sharesAmount Shares to redeem (18 decimals).
     * @param recipient    Stable token recipient.
     * @param basketId     Target basket.
     * @return stableReturned Amount returned in stable native decimals.
     */
    function redeem(
        uint256 sharesAmount,
        address recipient,
        uint256 basketId
    ) external whenNotPaused returns (uint256 stableReturned) {
        require(basketId < basketsCount, "Invalid basketId");
        Basket storage b = basketData[basketId];

        uint256 supply = IERC20(b.token).totalSupply();
        uint256 nav    = getNav(basketId);
        uint256 nps    = supply == 0 ? 1e18 : (nav * 1e18) / supply;

        uint256 stableNorm = (sharesAmount * nps) / 1e18;
        stableReturned     = stableNorm / stableScaling;

        // Burn shares
        if (b.isERC3643) {
            IERC3643Basket(b.token).burnFrom(msg.sender, sharesAmount);
        } else {
            IIndexToken(b.token).burn(msg.sender, sharesAmount);
        }

        require(_basketStable[basketId] >= stableReturned, "Insufficient basket stable");
        _basketStable[basketId] -= stableReturned;
        require(stable.transfer(recipient, stableReturned), "stable transfer failed");

        emit Redeemed(basketId, msg.sender, sharesAmount, stableReturned);
    }

    // ── Manager: rebalance ─────────────────────────────────────────────────

    /**
     * @notice Record an off-chain rebalance.
     *         Positive delta = buy (manager deposits tokens after off-chain swap).
     *         Negative delta = sell (manager withdraws tokens for off-chain swap).
     *         Actual transfers happen in separate transactions by the manager.
     * @param deltas   Signed token amounts in native token raw units per asset.
     * @param basketId Target basket.
     */
    function executeRebalance(
        int256[] calldata deltas,
        uint256 basketId
    ) external onlyRole(MANAGER_ROLE) {
        require(basketId < basketsCount, "Invalid basketId");
        require(basketData[basketId].status == STATUS_ACTIVE, "Basket not active");
        require(deltas.length == basketData[basketId].assets.length, "Deltas length mismatch");
        emit RebalanceExecuted(basketId, msg.sender, deltas);
    }

    // ── Admin: pause / emergency withdraw ─────────────────────────────────

    function pause()   external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    /**
     * @notice Emergency withdrawal of any ERC-20 token from the contract.
     *         TODO: add timelock in production.
     */
    function emergencyWithdraw(address token, address to, uint256 amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(to != address(0), "Zero address");
        IERC20(token).transfer(to, amount);
        emit EmergencyWithdraw(token, to, amount);
    }

    // ── Getter helpers ─────────────────────────────────────────────────────

    function getBasketAssets(uint256 basketId) external view returns (address[] memory) {
        return basketData[basketId].assets;
    }

    function getBasketWeights(uint256 basketId) external view returns (uint256[] memory) {
        return basketData[basketId].weights;
    }

    function getBasketModules(uint256 basketId) external view returns (string[] memory) {
        return basketData[basketId].complianceModules;
    }

    function getBasketStable(uint256 basketId) external view returns (uint256) {
        return _basketStable[basketId];
    }

    /// @notice Returns the on-chain metadataJSON string for a basket.
    function getBasketMetadata(uint256 basketId) public view returns (string memory) {
        return basketData[basketId].metadataJSON;
    }

    /// @notice Returns the status of a basket (0=Active, 1=Inactive, 2=Destroyed).
    function getBasketStatus(uint256 basketId) external view returns (uint8) {
        return basketData[basketId].status;
    }

    /**
     * @notice Manage the ERC-3643 basket allowlist (admin only).
     *         Required because the basket token's admin IS this contract.
     */
    function setBasketAllowlist(uint256 basketId, address account, bool allowed)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(basketId < basketsCount, "Invalid basketId");
        require(basketData[basketId].isERC3643, "Not an ERC-3643 basket");
        IERC3643Basket(basketData[basketId].token).setAllow(account, allowed);
    }

    // ── Internal helpers ───────────────────────────────────────────────────

    /**
     * @dev Probe whether an asset implements ERC-3643 by calling
     *      `getComplianceModules()`. Returns (isERC3643, moduleCount).
     *      Falls back to indexing `complianceModules(0)` if first call reverts.
     */
    function _probeERC3643(address asset) internal view returns (bool isERC3643, uint256 modCount) {
        // Try getComplianceModules() (ERC3643Basket style)
        try IERC3643Basket(asset).getComplianceModules() returns (string[] memory mods) {
            return (true, mods.length);
        } catch {}

        // Fallback: try complianceModules(0) to see if the function exists
        try IERC3643Basket(asset).complianceModules(0) returns (string memory) {
            // Count modules by probing incrementally up to a reasonable limit
            uint256 count = 0;
            for (uint256 k = 0; k < 20; k++) {
                try IERC3643Basket(asset).complianceModules(k) returns (string memory) {
                    count++;
                } catch { break; }
            }
            return (true, count);
        } catch {}

        return (false, 0);
    }
}
