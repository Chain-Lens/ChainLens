// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library SellerRegistryTypes {
    struct Seller {
        address sellerAddress;
        string name;
        bytes32[] capabilities;   // task type ids the seller handles
        string metadataURI;       // IPFS pointer for extended profile
        uint64 registeredAt;
        bool active;
    }
}
