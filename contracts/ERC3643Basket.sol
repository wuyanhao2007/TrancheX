// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ERC3643Basket
 * @notice Simplified permissioned basket token modelling ERC-3643 (T-REX).
 *         Transfers require both parties to be on the allowlist.
 */
contract ERC3643Basket is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE  = keccak256("MINTER_ROLE");
    bytes32 public constant ISSUER_ROLE  = keccak256("ISSUER_ROLE");

    /// @notice Off-chain compliance module identifiers (e.g. "KYC", "AML")
    string[] public complianceModules;

    /// @notice Allowlist: only allowed addresses may hold/receive tokens
    mapping(address => bool) public allowlist;

    /// @notice IPFS / HTTPS metadata URI for this basket
    string public metadataURI;

    event AllowlistUpdated(address indexed account, bool allowed);

    constructor(
        string memory name_,
        string memory symbol_,
        address admin,
        string memory metadataURI_,
        string[] memory complianceModules_
    ) ERC20(name_, symbol_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(ISSUER_ROLE, admin);
        metadataURI = metadataURI_;
        // copy modules
        for (uint256 i = 0; i < complianceModules_.length; i++) {
            complianceModules.push(complianceModules_[i]);
        }
        // admin is always allowed
        allowlist[admin] = true;
    }

    // ── Compliance ─────────────────────────────────────────────────────────

    /// @notice Grant or revoke allowlist status for an account.
    function setAllow(address account, bool allowed) external onlyRole(ISSUER_ROLE) {
        allowlist[account] = allowed;
        emit AllowlistUpdated(account, allowed);
    }

    /// @notice Returns true when a transfer is permissible under compliance rules.
    function canTransfer(address from, address to, uint256 /*amount*/) external view returns (bool) {
        // Zero address is allowed as from (minting) or to (burning)
        if (from != address(0) && !allowlist[from]) return false;
        if (to   != address(0) && !allowlist[to])   return false;
        return true;
    }

    /// @notice Returns all compliance module identifiers.
    function getComplianceModules() external view returns (string[] memory) {
        return complianceModules;
    }

    // ── Minting / burning ──────────────────────────────────────────────────

    function mintTo(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function burnFrom(address from, uint256 amount) external onlyRole(MINTER_ROLE) {
        _burn(from, amount);
    }

    // ── Transfer guard ─────────────────────────────────────────────────────

    /// @dev Hook enforcing allowlist on every transfer.
    function _update(address from, address to, uint256 amount) internal override {
        // Allow mints (from==0) and burns (to==0) unconditionally
        if (from != address(0) && to != address(0)) {
            require(allowlist[from], "ERC3643: sender not allowed");
            require(allowlist[to],   "ERC3643: recipient not allowed");
        }
        super._update(from, to, amount);
    }
}
