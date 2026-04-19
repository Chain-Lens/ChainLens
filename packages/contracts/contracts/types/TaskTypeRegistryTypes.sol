// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library TaskTypeRegistryTypes {
    struct TaskTypeConfig {
        string name;              // human-readable id ("blockscout_contract_source")
        string schemaURI;         // IPFS or HTTPS URL of JSON schema
        uint64 maxResponseTime;   // seconds, 0 < x <= 600
        uint256 minBudget;        // USDC raw (6 decimals)
        bool enabled;
        uint64 registeredAt;
    }
}
