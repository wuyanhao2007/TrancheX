// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AttestationRegistry
 * @notice Stores EIP-712 signed compliance attestations without inheriting OZ EIP712
 *         (avoids OZ v5's ^0.8.24 pragma requirement).
 *
 * Provider signs:
 *   Attestation(address subject, bytes32 moduleId, uint256 expires, bytes32 payloadHash)
 *
 * moduleId = keccak256(bytes(moduleIdString))
 */
contract AttestationRegistry {
    // ── EIP-712 domain ─────────────────────────────────────────────────────

    bytes32 private constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(address subject,bytes32 moduleId,uint256 expires,bytes32 payloadHash)"
    );

    bytes32 private immutable _DOMAIN_SEPARATOR;

    constructor() {
        _DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("AttestationRegistry")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
    }

    // ── Storage ────────────────────────────────────────────────────────────

    // subject => keccak256(moduleId string) => expiry timestamp
    mapping(address => mapping(bytes32 => uint256)) private _attestations;

    event AttestationSubmitted(
        address indexed provider,
        address indexed subject,
        bytes32 indexed moduleId,
        uint256 expires
    );

    // ── External functions ─────────────────────────────────────────────────

    /**
     * @notice Submit a provider-signed attestation.
     * @param provider    Signer whose private key produced `signature`.
     * @param subject     Address being attested (the investor/user).
     * @param moduleId    Compliance module identifier string (e.g. "KYC").
     * @param expires     Unix timestamp when the attestation expires.
     * @param payloadHash Arbitrary hash of off-chain payload (bytes32(0) is valid).
     * @param signature   65-byte EIP-712 signature by provider.
     */
    function submitAttestation(
        address provider,
        address subject,
        string calldata moduleId,
        uint256 expires,
        bytes32 payloadHash,
        bytes calldata signature
    ) external {
        require(expires > block.timestamp, "Attestation: already expired");

        bytes32 moduleHash = keccak256(bytes(moduleId));
        bytes32 structHash = keccak256(abi.encode(
            ATTESTATION_TYPEHASH,
            subject,
            moduleHash,
            expires,
            payloadHash
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _DOMAIN_SEPARATOR, structHash));

        address recovered = _recover(digest, signature);
        require(recovered == provider, "Attestation: invalid signature");

        _attestations[subject][moduleHash] = expires;
        emit AttestationSubmitted(provider, subject, moduleHash, expires);
    }

    /**
     * @notice Returns true when subject has a non-expired attestation for moduleId.
     */
    function hasAttestation(address subject, string calldata moduleId) external view returns (bool) {
        return _attestations[subject][keccak256(bytes(moduleId))] > block.timestamp;
    }

    /**
     * @notice Returns raw expiry timestamp.
     */
    function getExpiry(address subject, string calldata moduleId) external view returns (uint256) {
        return _attestations[subject][keccak256(bytes(moduleId))];
    }

    function domainSeparator() external view returns (bytes32) {
        return _DOMAIN_SEPARATOR;
    }

    // ── Internal ───────────────────────────────────────────────────────────

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "Attestation: bad signature length");
        bytes32 r;
        bytes32 s;
        uint8   v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "Attestation: bad v");
        address addr = ecrecover(digest, v, r, s);
        require(addr != address(0), "Attestation: ecrecover failed");
        return addr;
    }
}
