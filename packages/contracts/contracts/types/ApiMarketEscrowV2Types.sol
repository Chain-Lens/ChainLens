// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library ApiMarketEscrowV2Types {
    struct Job {
        address buyer;
        address seller;
        uint256 apiId;
        uint256 amount;
        bytes32 taskType;
        bytes32 inputsHash;
        bytes32 responseHash;
        string evidenceURI;
        uint64 createdAt;
        bool completed;
        bool refunded;
    }
}
