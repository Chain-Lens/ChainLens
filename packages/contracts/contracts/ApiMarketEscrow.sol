// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract ApiMarketEscrow {
    struct Payment {
        address buyer;
        uint256 apiId;
        address seller;
        uint256 amount;
        bool completed;
        bool refunded;
    }

    address public owner;
    address public gateway;
    IERC20 public immutable usdc;
    uint256 public nextPaymentId;
    uint256 public feeRate; // basis points (100 = 1%, 1000 = 10%)

    mapping(uint256 => bool) public approvedApis;
    mapping(uint256 => Payment) public payments;
    mapping(address => uint256) public pendingWithdrawals;

    event ApiApproved(uint256 indexed apiId);
    event ApiRevoked(uint256 indexed apiId);
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
    event PaymentRefunded(
        uint256 indexed paymentId,
        address indexed buyer,
        uint256 amount
    );
    event Claimed(address indexed seller, uint256 amount);
    event FeeRateUpdated(uint256 oldRate, uint256 newRate);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyGateway() {
        require(msg.sender == gateway, "Only gateway");
        _;
    }

    constructor(address _gateway, uint256 _feeRate, address _usdc) {
        require(_feeRate <= 3000, "Fee rate max 30%");
        owner = msg.sender;
        gateway = _gateway;
        feeRate = _feeRate;
        usdc = IERC20(_usdc);
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
        uint256 amount
    ) external returns (uint256 paymentId) {
        require(approvedApis[apiId], "API not approved");
        require(amount > 0, "Payment must be > 0");
        require(seller != address(0), "Invalid seller");

        require(usdc.transferFrom(msg.sender, address(this), amount), "USDC transfer failed");

        paymentId = nextPaymentId++;
        payments[paymentId] = Payment({
            buyer: msg.sender,
            apiId: apiId,
            seller: seller,
            amount: amount,
            completed: false,
            refunded: false
        });

        emit PaymentReceived(paymentId, msg.sender, apiId, seller, amount);
    }

    function complete(uint256 paymentId) external onlyGateway {
        Payment storage p = payments[paymentId];
        require(p.buyer != address(0), "Payment not found");
        require(!p.completed, "Already completed");
        require(!p.refunded, "Already refunded");

        p.completed = true;

        uint256 fee = (p.amount * feeRate) / 10000;
        uint256 sellerAmount = p.amount - fee;

        pendingWithdrawals[p.seller] += sellerAmount;
        if (fee > 0) {
            pendingWithdrawals[owner] += fee;
        }

        emit PaymentCompleted(paymentId, p.seller, sellerAmount, fee);
    }

    function refund(uint256 paymentId) external onlyGateway {
        Payment storage p = payments[paymentId];
        require(p.buyer != address(0), "Payment not found");
        require(!p.completed, "Already completed");
        require(!p.refunded, "Already refunded");

        p.refunded = true;
        require(usdc.transfer(p.buyer, p.amount), "USDC refund failed");

        emit PaymentRefunded(paymentId, p.buyer, p.amount);
    }

    function claim() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Nothing to claim");
        pendingWithdrawals[msg.sender] = 0;
        require(usdc.transfer(msg.sender, amount), "USDC claim failed");
        emit Claimed(msg.sender, amount);
    }

    function setFeeRate(uint256 _feeRate) external onlyOwner {
        require(_feeRate <= 3000, "Fee rate max 30%");
        emit FeeRateUpdated(feeRate, _feeRate);
        feeRate = _feeRate;
    }

    function getPayment(
        uint256 paymentId
    ) external view returns (Payment memory) {
        return payments[paymentId];
    }

    function setGateway(address _gateway) external onlyOwner {
        gateway = _gateway;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
}
