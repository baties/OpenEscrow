// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ERC20Mock
 * @notice ERC20Mock.sol — OpenEscrow test contracts/src/mocks
 *
 * Minimal ERC-20 mock for Hardhat unit tests.
 * Handles: minting, standard ERC-20 transfers and approvals.
 * Does NOT: implement access control on minting (test-only contract).
 *           Must NOT be deployed to any public network.
 *
 * @dev Uses OpenZeppelin ERC20 base. Exposes a public `mint` function
 *      for test setup purposes.
 */

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Mock is ERC20 {
    /// @notice Number of decimals for this token (USDC/USDT use 6).
    uint8 private _decimals;

    /**
     * @notice Deploys a mock ERC-20 token with a custom name, symbol, and decimals.
     * @param name_     Token name (e.g., "USD Coin").
     * @param symbol_   Token symbol (e.g., "USDC").
     * @param decimals_ Number of decimal places (6 for USDC/USDT).
     */
    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    /**
     * @notice Returns the number of decimals for this token.
     * @return The decimal count set at construction.
     */
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Mints tokens to a given address. Test-only function.
     * @dev No access control — this is intentional for test setup.
     * @param to     Recipient address.
     * @param amount Amount of tokens to mint (in smallest unit).
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
