// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { TaskTypeRegistryTypes } from "./types/TaskTypeRegistryTypes.sol";

/// @title TaskTypeRegistry
/// @notice Owner-managed registry of task types. Each task type declares its JSON schema URI,
///         maximum acceptable seller response time, and minimum buyer budget in USDC raw units.
/// @dev Consumed by the gateway for schema validation and by the marketplace frontend for
///      discovery. Ownable2Step per TYPE2_MVP_CLEAN_BUILD_SPEC.md §3.3 / §9.
contract TaskTypeRegistry is Ownable2Step {
    uint64 public constant MAX_RESPONSE_TIME_SECONDS = 600;

    mapping(bytes32 => TaskTypeRegistryTypes.TaskTypeConfig) private _taskTypes;
    bytes32[] private _allTaskTypes;

    event TaskTypeRegistered(bytes32 indexed taskType, string name);
    event TaskTypeUpdated(bytes32 indexed taskType);
    event TaskTypeEnabledChanged(bytes32 indexed taskType, bool enabled);

    constructor() Ownable(msg.sender) {}

    function registerTaskType(
        bytes32 taskType,
        string calldata name,
        string calldata schemaURI,
        uint64 maxResponseTime,
        uint256 minBudget
    ) external onlyOwner {
        require(taskType != bytes32(0), "empty task type id");
        require(_taskTypes[taskType].registeredAt == 0, "already registered");
        require(bytes(name).length > 0, "empty name");
        require(
            maxResponseTime > 0 && maxResponseTime <= MAX_RESPONSE_TIME_SECONDS,
            "invalid response time"
        );

        _taskTypes[taskType] = TaskTypeRegistryTypes.TaskTypeConfig({
            name: name,
            schemaURI: schemaURI,
            maxResponseTime: maxResponseTime,
            minBudget: minBudget,
            enabled: true,
            registeredAt: uint64(block.timestamp)
        });
        _allTaskTypes.push(taskType);

        emit TaskTypeRegistered(taskType, name);
        emit TaskTypeEnabledChanged(taskType, true);
    }

    function updateConfig(
        bytes32 taskType,
        string calldata schemaURI,
        uint64 maxResponseTime,
        uint256 minBudget
    ) external onlyOwner {
        TaskTypeRegistryTypes.TaskTypeConfig storage cfg = _taskTypes[taskType];
        require(cfg.registeredAt != 0, "not found");
        require(
            maxResponseTime > 0 && maxResponseTime <= MAX_RESPONSE_TIME_SECONDS,
            "invalid response time"
        );

        cfg.schemaURI = schemaURI;
        cfg.maxResponseTime = maxResponseTime;
        cfg.minBudget = minBudget;

        emit TaskTypeUpdated(taskType);
    }

    function setEnabled(bytes32 taskType, bool enabled) external onlyOwner {
        TaskTypeRegistryTypes.TaskTypeConfig storage cfg = _taskTypes[taskType];
        require(cfg.registeredAt != 0, "not found");
        if (cfg.enabled == enabled) return;

        cfg.enabled = enabled;
        emit TaskTypeEnabledChanged(taskType, enabled);
    }

    function isEnabled(bytes32 taskType) external view returns (bool) {
        TaskTypeRegistryTypes.TaskTypeConfig storage cfg = _taskTypes[taskType];
        return cfg.registeredAt != 0 && cfg.enabled;
    }

    function getConfig(bytes32 taskType)
        external
        view
        returns (TaskTypeRegistryTypes.TaskTypeConfig memory)
    {
        TaskTypeRegistryTypes.TaskTypeConfig memory cfg = _taskTypes[taskType];
        require(cfg.registeredAt != 0, "not found");
        return cfg;
    }

    function getAllTaskTypes() external view returns (bytes32[] memory) {
        return _allTaskTypes;
    }

    function taskTypeCount() external view returns (uint256) {
        return _allTaskTypes.length;
    }
}
