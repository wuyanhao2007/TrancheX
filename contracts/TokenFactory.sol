// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IndexToken.sol";
import "./ERC3643Basket.sol";

/**
 * @title TokenFactory
 * @notice Deploys IndexToken and ERC3643Basket contracts on behalf of BasketManager.
 *         Separating deployment logic keeps BasketManager under the 24 KB size limit.
 */
contract TokenFactory {
    event IndexTokenDeployed(address indexed token, string name, string symbol);
    event ERC3643BasketDeployed(address indexed token, string name, string symbol);

    /**
     * @notice Deploy a standard ERC-20 index token.
     * @param name   Token name.
     * @param symbol Token symbol.
     * @param admin  Address that receives DEFAULT_ADMIN_ROLE and MINTER_ROLE.
     * @return addr  Address of the newly deployed IndexToken.
     */
    function deployIndexToken(
        string calldata name,
        string calldata symbol,
        address admin
    ) external returns (address addr) {
        IndexToken token = new IndexToken(name, symbol, admin);
        addr = address(token);
        emit IndexTokenDeployed(addr, name, symbol);
    }

    /**
     * @notice Deploy a permissioned ERC-3643-style basket token.
     * @param name       Token name.
     * @param symbol     Token symbol.
     * @param admin      Address that receives all roles.
     * @param metadataURI IPFS/HTTPS URI for basket metadata.
     * @param modules    Compliance module identifiers.
     * @return addr      Address of the newly deployed ERC3643Basket.
     */
    function deployERC3643Basket(
        string calldata name,
        string calldata symbol,
        address admin,
        string calldata metadataURI,
        string[] calldata modules
    ) external returns (address addr) {
        ERC3643Basket basket = new ERC3643Basket(name, symbol, admin, metadataURI, modules);
        addr = address(basket);
        emit ERC3643BasketDeployed(addr, name, symbol);
    }
}
