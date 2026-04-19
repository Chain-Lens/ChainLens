// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { SellerRegistryTypes } from "./types/SellerRegistryTypes.sol";

/// @title SellerRegistry
/// @notice ERC-8004-compatible seller directory. Gateway registers sellers after automated
///         schema/injection tests pass, records per-job results, and exposes an on-chain
///         reputation score (basis points) for discovery.
/// @dev Seller metadata is split off-chain (IPFS); on-chain we keep the minimal set needed
///      for routing and reputation. Capability mapping is append-only for MVP — updateSeller
///      does not reshuffle sellersByCapability entries.
contract SellerRegistry is Ownable2Step {
    uint256 public constant REPUTATION_NEUTRAL_BPS = 5_000;
    uint256 public constant REPUTATION_MAX_BPS = 10_000;

    address public gateway;

    mapping(address => SellerRegistryTypes.Seller) private _sellers;
    mapping(bytes32 => address[]) private _sellersByCapability;

    mapping(address => uint256) public jobsCompleted;
    mapping(address => uint256) public jobsFailed;
    mapping(address => uint256) public totalEarnings;

    event SellerRegistered(address indexed seller, string name, bytes32[] capabilities);
    event SellerUpdated(address indexed seller, string metadataURI);
    event SellerDeactivated(address indexed seller);
    event JobResultRecorded(address indexed seller, bool success, uint256 amount);
    event GatewayUpdated(address indexed previousGateway, address indexed newGateway);

    modifier onlyGateway() {
        require(msg.sender == gateway, "only gateway");
        _;
    }

    constructor(address _gateway) Ownable(msg.sender) {
        require(_gateway != address(0), "zero gateway");
        gateway = _gateway;
        emit GatewayUpdated(address(0), _gateway);
    }

    function setGateway(address _gateway) external onlyOwner {
        require(_gateway != address(0), "zero gateway");
        address previous = gateway;
        gateway = _gateway;
        emit GatewayUpdated(previous, _gateway);
    }

    function registerSeller(
        address seller,
        string calldata name,
        bytes32[] calldata capabilities,
        string calldata metadataURI
    ) external onlyGateway {
        require(seller != address(0), "zero seller");
        require(!_sellers[seller].active, "already registered");
        require(_sellers[seller].registeredAt == 0, "address reused");
        require(bytes(name).length > 0, "empty name");
        require(capabilities.length > 0, "no capabilities");

        _sellers[seller] = SellerRegistryTypes.Seller({
            sellerAddress: seller,
            name: name,
            capabilities: capabilities,
            metadataURI: metadataURI,
            registeredAt: uint64(block.timestamp),
            active: true
        });
        for (uint256 i = 0; i < capabilities.length; i++) {
            _sellersByCapability[capabilities[i]].push(seller);
        }

        emit SellerRegistered(seller, name, capabilities);
    }

    /// @notice Update seller metadata URI only. Capability changes require re-registration
    ///         to keep the sellersByCapability index consistent in MVP.
    function updateMetadataURI(address seller, string calldata metadataURI) external onlyGateway {
        SellerRegistryTypes.Seller storage s = _sellers[seller];
        require(s.registeredAt != 0, "not found");
        s.metadataURI = metadataURI;
        emit SellerUpdated(seller, metadataURI);
    }

    function deactivate(address seller) external {
        require(
            msg.sender == seller || msg.sender == gateway || msg.sender == owner(),
            "unauthorized"
        );
        SellerRegistryTypes.Seller storage s = _sellers[seller];
        require(s.registeredAt != 0, "not found");
        require(s.active, "already inactive");
        s.active = false;
        emit SellerDeactivated(seller);
    }

    function recordJobResult(address seller, bool success, uint256 amount) external onlyGateway {
        require(_sellers[seller].registeredAt != 0, "not found");
        if (success) {
            jobsCompleted[seller] += 1;
            totalEarnings[seller] += amount;
        } else {
            jobsFailed[seller] += 1;
        }
        emit JobResultRecorded(seller, success, amount);
    }

    function getReputation(address seller) external view returns (uint256) {
        uint256 completed = jobsCompleted[seller];
        uint256 failed = jobsFailed[seller];
        uint256 total = completed + failed;
        if (total == 0) return REPUTATION_NEUTRAL_BPS;
        return (completed * REPUTATION_MAX_BPS) / total;
    }

    function getSellerInfo(address seller)
        external
        view
        returns (SellerRegistryTypes.Seller memory)
    {
        SellerRegistryTypes.Seller memory s = _sellers[seller];
        require(s.registeredAt != 0, "not found");
        return s;
    }

    function getSellersByCapability(bytes32 capability) external view returns (address[] memory) {
        return _sellersByCapability[capability];
    }

    function isRegistered(address seller) external view returns (bool) {
        return _sellers[seller].registeredAt != 0;
    }

    function isActive(address seller) external view returns (bool) {
        return _sellers[seller].active;
    }
}
