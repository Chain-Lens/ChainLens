// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only 6-decimal ERC20 that stands in for USDC in Hardhat fixtures.
/// @dev Supports a minimal EIP-3009 `transferWithAuthorization` that matches
///      real USDC's ABI and enforces the `validAfter`/`validBefore`/nonce rules.
///      Signature verification is stubbed — real USDC checks the EIP-712
///      signature, which is exercised end-to-end in the mcp-tool tests where
///      viem produces real signatures. Escrow contract tests only need the
///      state transitions (transfer + nonce bookkeeping).
contract MockUSDC is ERC20 {
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);

    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 /* v */,
        bytes32 /* r */,
        bytes32 /* s */
    ) external {
        require(block.timestamp > validAfter, "auth not yet valid");
        require(block.timestamp < validBefore, "auth expired");
        require(!authorizationState[from][nonce], "auth already used");
        authorizationState[from][nonce] = true;
        _transfer(from, to, value);
        emit AuthorizationUsed(from, nonce);
    }

    /// @notice Minimal receiveWithAuthorization for v3 ChainLensMarket tests.
    /// @dev    Same sig-verification stub as transferWithAuthorization, plus the
    ///         real-USDC invariant that msg.sender must equal `to` (prevents
    ///         relay front-running). Exercised end-to-end with real EIP-712
    ///         sigs in the mcp-tool / gateway integration suites.
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 /* v */,
        bytes32 /* r */,
        bytes32 /* s */
    ) external {
        require(msg.sender == to, "caller must be payee");
        require(block.timestamp > validAfter, "auth not yet valid");
        require(block.timestamp < validBefore, "auth expired");
        require(!authorizationState[from][nonce], "auth already used");
        authorizationState[from][nonce] = true;
        _transfer(from, to, value);
        emit AuthorizationUsed(from, nonce);
    }
}
