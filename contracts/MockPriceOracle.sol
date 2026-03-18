// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockPriceOracle {
    struct PriceData {
        uint256 price;
        uint256 updatedAt;
    }

    mapping(address => PriceData) private _prices;

    function setPrice(address asset, uint256 price) external {
        _prices[asset] = PriceData({price: price, updatedAt: block.timestamp});
    }

    function getPrice(address asset) external view returns (uint256 price, uint256 updatedAt) {
        PriceData memory pd = _prices[asset];
        return (pd.price, pd.updatedAt);
    }
}
