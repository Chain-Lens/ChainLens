// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { ApiMarketEscrowV2Types } from "./types/ApiMarketEscrowV2Types.sol";

/// @dev Minimal EIP-3009 surface. USDC (FiatTokenV2) implements this natively;
///      we don't need the full interface, just the `transferWithAuthorization`
///      entrypoint that lets us pull funds from a buyer via an off-chain signed
///      authorization — no prior `approve` tx required.
interface IERC20WithAuthorization {
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// @title ApiMarketEscrowV2
/// @notice Escrow for API / task-type jobs. Evolves v1 Payment into a Job that
///         carries taskType, inputsHash, responseHash, evidenceURI so gateways can
///         anchor ERC-8183-style job lifecycle on-chain. v1 stays deployed for legacy
///         clients; v2 is a fresh deploy with its own storage (no migration).
/// @dev Backward compat: taskType == bytes32(0) falls back to the v1 approvedApis
///      gate. taskType != 0 bypasses it — validation shifts to the gateway +
///      TaskTypeRegistry (enforced off-chain for MVP).
contract ApiMarketEscrowV2 is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_FEE_RATE_BPS = 3_000;
    uint256 public constant BPS_DIVISOR = 10_000;

    IERC20 public immutable usdc;
    address public gateway;
    uint256 public feeRate;
    uint256 public nextJobId;

    mapping(uint256 => bool) public approvedApis;
    mapping(uint256 => ApiMarketEscrowV2Types.Job) private _jobs;
    mapping(address => uint256) public pendingWithdrawals;

    event ApiApproved(uint256 indexed apiId);
    event ApiRevoked(uint256 indexed apiId);
    event JobCreated(
        uint256 indexed jobId,
        address indexed buyer,
        address indexed seller,
        bytes32 taskType,
        uint256 amount,
        bytes32 inputsHash,
        uint256 apiId
    );
    event JobSubmitted(uint256 indexed jobId, bytes32 responseHash, string evidenceURI);
    event PaymentReceived(
        uint256 indexed paymentId,
        address indexed buyer,
        uint256 indexed apiId,
        address seller,
        uint256 amount
    );
    event PaymentCompleted(
        uint256 indexed paymentId,
        address indexed seller,
        uint256 sellerAmount,
        uint256 feeAmount
    );
    event PaymentRefunded(uint256 indexed paymentId, address indexed buyer, uint256 amount);
    event Claimed(address indexed account, uint256 amount);
    event FeeRateUpdated(uint256 oldRate, uint256 newRate);
    event GatewayUpdated(address indexed previousGateway, address indexed newGateway);

    modifier onlyGateway() {
        require(msg.sender == gateway, "only gateway");
        _;
    }

    constructor(address _gateway, uint256 _feeRate, address _usdc) Ownable(msg.sender) {
        require(_gateway != address(0), "zero gateway");
        require(_usdc != address(0), "zero usdc");
        require(_feeRate <= MAX_FEE_RATE_BPS, "fee too high");
        gateway = _gateway;
        feeRate = _feeRate;
        usdc = IERC20(_usdc);
        emit GatewayUpdated(address(0), _gateway);
    }

    function setGateway(address _gateway) external onlyOwner {
        require(_gateway != address(0), "zero gateway");
        address prev = gateway;
        gateway = _gateway;
        emit GatewayUpdated(prev, _gateway);
    }

    function setFeeRate(uint256 _feeRate) external onlyOwner {
        require(_feeRate <= MAX_FEE_RATE_BPS, "fee too high");
        emit FeeRateUpdated(feeRate, _feeRate);
        feeRate = _feeRate;
    }

    function approveApi(uint256 apiId) external onlyOwner {
        approvedApis[apiId] = true;
        emit ApiApproved(apiId);
    }

    function revokeApi(uint256 apiId) external onlyOwner {
        approvedApis[apiId] = false;
        emit ApiRevoked(apiId);
    }

    function pay(
        uint256 apiId,
        address seller,
        uint256 amount,
        bytes32 taskType,
        bytes32 inputsHash
    ) external nonReentrant returns (uint256 jobId) {
        return _createJob(apiId, seller, amount, taskType, inputsHash);
    }

    /// @notice ERC-8183 alias for pay(); reorders args to match the spec's job-first
    ///         call shape.
    function createJob(
        address seller,
        bytes32 taskType,
        uint256 amount,
        bytes32 inputsHash,
        uint256 apiId
    ) external nonReentrant returns (uint256 jobId) {
        return _createJob(apiId, seller, amount, taskType, inputsHash);
    }

    /// @notice Single-tx job creation using an EIP-3009 authorization signed
    ///         off-chain by the buyer. Eliminates the separate `approve` tx
    ///         and the approve+createJob race that breaks when RPC state
    ///         lags between the two txs.
    /// @dev    Buyer signs a TransferWithAuthorization message authorizing
    ///         `amount` USDC to move to this escrow. We redeem it inline and
    ///         then run the normal job-creation path with the buyer as
    ///         `msg.sender`. Authorization replay protection lives in USDC's
    ///         nonce bookkeeping; our nonReentrant guard stops recursive entry.
    function createJobWithAuth(
        address seller,
        bytes32 taskType,
        uint256 amount,
        bytes32 inputsHash,
        uint256 apiId,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 jobId) {
        require(seller != address(0), "invalid seller");
        require(amount > 0, "amount zero");
        if (taskType == bytes32(0)) {
            require(approvedApis[apiId], "API not approved");
        }

        IERC20WithAuthorization(address(usdc)).transferWithAuthorization(
            msg.sender,
            address(this),
            amount,
            validAfter,
            validBefore,
            nonce,
            v,
            r,
            s
        );

        return _recordJob(apiId, seller, amount, taskType, inputsHash, msg.sender);
    }

    function complete(
        uint256 jobId,
        bytes32 responseHash,
        string calldata evidenceURI
    ) external onlyGateway {
        _complete(jobId, responseHash, evidenceURI);
    }

    /// @notice ERC-8183 alias for complete().
    function submit(
        uint256 jobId,
        bytes32 responseHash,
        string calldata evidenceURI
    ) external onlyGateway {
        _complete(jobId, responseHash, evidenceURI);
    }

    function refund(uint256 jobId) external onlyGateway nonReentrant {
        ApiMarketEscrowV2Types.Job storage j = _jobs[jobId];
        require(j.buyer != address(0), "job not found");
        require(!j.completed, "already completed");
        require(!j.refunded, "already refunded");
        j.refunded = true;
        usdc.safeTransfer(j.buyer, j.amount);
        emit PaymentRefunded(jobId, j.buyer, j.amount);
    }

    function claim() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "nothing to claim");
        pendingWithdrawals[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    function getJob(uint256 jobId) external view returns (ApiMarketEscrowV2Types.Job memory) {
        ApiMarketEscrowV2Types.Job memory j = _jobs[jobId];
        require(j.buyer != address(0), "job not found");
        return j;
    }

    /// @notice v1-parity helper: same return shape as getJob; lets legacy tooling keep
    ///         calling getPayment without code changes.
    function getPayment(uint256 paymentId)
        external
        view
        returns (ApiMarketEscrowV2Types.Job memory)
    {
        ApiMarketEscrowV2Types.Job memory j = _jobs[paymentId];
        require(j.buyer != address(0), "job not found");
        return j;
    }

    function _createJob(
        uint256 apiId,
        address seller,
        uint256 amount,
        bytes32 taskType,
        bytes32 inputsHash
    ) internal returns (uint256 jobId) {
        require(seller != address(0), "invalid seller");
        require(amount > 0, "amount zero");
        if (taskType == bytes32(0)) {
            require(approvedApis[apiId], "API not approved");
        }

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        return _recordJob(apiId, seller, amount, taskType, inputsHash, msg.sender);
    }

    /// @dev Assumes funds are already in the escrow (caller did the transfer).
    ///      Shared between the approve+transferFrom path (`_createJob`) and the
    ///      EIP-3009 auth path (`createJobWithAuth`).
    function _recordJob(
        uint256 apiId,
        address seller,
        uint256 amount,
        bytes32 taskType,
        bytes32 inputsHash,
        address buyer
    ) internal returns (uint256 jobId) {
        jobId = nextJobId++;
        _jobs[jobId] = ApiMarketEscrowV2Types.Job({
            buyer: buyer,
            seller: seller,
            apiId: apiId,
            amount: amount,
            taskType: taskType,
            inputsHash: inputsHash,
            responseHash: bytes32(0),
            evidenceURI: "",
            createdAt: uint64(block.timestamp),
            completed: false,
            refunded: false
        });

        emit JobCreated(jobId, buyer, seller, taskType, amount, inputsHash, apiId);
        emit PaymentReceived(jobId, buyer, apiId, seller, amount);
    }

    function _complete(
        uint256 jobId,
        bytes32 responseHash,
        string calldata evidenceURI
    ) internal {
        ApiMarketEscrowV2Types.Job storage j = _jobs[jobId];
        require(j.buyer != address(0), "job not found");
        require(!j.completed, "already completed");
        require(!j.refunded, "already refunded");

        j.completed = true;
        j.responseHash = responseHash;
        j.evidenceURI = evidenceURI;

        uint256 fee = (j.amount * feeRate) / BPS_DIVISOR;
        uint256 sellerAmount = j.amount - fee;
        pendingWithdrawals[j.seller] += sellerAmount;
        if (fee > 0) {
            pendingWithdrawals[owner()] += fee;
        }

        emit JobSubmitted(jobId, responseHash, evidenceURI);
        emit PaymentCompleted(jobId, j.seller, sellerAmount, fee);
    }
}
