// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test token used for local Hardhat testing only. Not deployed to mainnet.
contract MockRWA is ERC20 {
    uint8 private _dec;

    constructor(string memory name_, string memory symbol_, uint256 initialSupply)
        ERC20(name_, symbol_)
    {
        _dec = 18;
        _mint(msg.sender, initialSupply);
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function setDecimals(uint8 d) external {
        _dec = d;
    }

    function mintTo(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
