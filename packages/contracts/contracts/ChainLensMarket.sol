// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Minimal EIP-3009 surface. Real USDC (FiatTokenV2) exposes both
///      transferWithAuthorization (permissionless relay) and
///      receiveWithAuthorization (locked to msg.sender == to). We use
///      receiveWithAuthorization because the `to` restriction prevents an
///      attacker from front-running the signed auth and landing it against
///      some other state (stale listing, paused gateway, etc).
interface IERC20WithAuthorization {
    function receiveWithAuthorization(
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

/// @title ChainLensMarket
/// @notice v3 single-contract marketplace. Replaces the v2 trio
///         (ApiMarketEscrowV2 + SellerRegistry + TaskTypeRegistry) with one
///         contract that only does three things:
///           1. Listing registry — seller metadata + payout address
///           2. Settlement — x402 payment pulled from buyer, split between
///              seller payout balance and treasury (service fee)
///           3. Claims — sellers pull their accrued payout balance
/// @dev    Trust model: gateways (off-chain, whitelisted via `isGateway`) are
///         trusted to route requests, call seller APIs, verify responses, and
///         submit only successful settlements. This contract enforces:
///           - only whitelisted gateway addresses may call settle()
///           - only registered + active listings receive settlements
///           - sellers pull their own balance (no push)
///           - all fee/treasury/gateway params are owner-mutable
///         Fees start at 0 so early sellers onboard with zero friction.
///         Settlement and seller payouts are always in USDC (immutable).
///         The registration-fee token is separately mutable so a future
///         project token can replace USDC for listing fees without
///         redeploying the contract.
contract ChainLensMarket is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------- Constants ----------

    uint16 public constant BPS_DIVISOR = 10_000;
    uint16 public constant MAX_SERVICE_FEE_BPS = 3_000; // 30% cap — sanity bound
    uint16 public constant MAX_REG_BURN_BPS = 10_000;   // 100% — allow full burn
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // ---------- Immutable config ----------

    IERC20 public immutable usdc;

    // ---------- Mutable config (owner-settable) ----------

    mapping(address => bool) public isGateway;  // whitelist — multiple gateways allowed
    address public treasury;
    IERC20  public registrationFeeToken;        // defaults to usdc; owner can switch
    uint256 public registrationFee;             // flat amount in registrationFeeToken; 0 = free
    uint16  public registrationBurnBps;         // % of reg fee burned; rest → treasury
    uint16  public serviceFeeBps;               // % of settlement amount → treasury (in USDC)
    uint8   public maxListingsPerAccount;       // 0 = unlimited

    // ---------- Listings ----------

    struct Listing {
        address owner;        // listing admin — can update/deactivate
        address payout;       // credited balance target — usually == owner
        string  metadataURI;  // off-chain JSON: name, category, price display, schema hint, etc.
        bool    active;
    }

    mapping(uint256 => Listing) private _listings;
    mapping(address => uint256) public listingsOwnedCount;
    uint256 public nextListingId;

    // ---------- Settlement accounting ----------

    mapping(address => uint256) public claimable;

    // ---------- Events ----------

    event GatewaySet(address indexed gateway, bool isGateway);
    event TreasuryUpdated(address indexed prev, address indexed next);
    event RegistrationFeeTokenUpdated(address indexed prev, address indexed next);
    event RegistrationFeeUpdated(uint256 prev, uint256 next);
    event RegistrationBurnBpsUpdated(uint16 prev, uint16 next);
    event ServiceFeeBpsUpdated(uint16 prev, uint16 next);
    event MaxListingsPerAccountUpdated(uint8 prev, uint8 next);

    event ListingRegistered(
        uint256 indexed listingId,
        address indexed owner,
        address indexed payout,
        string metadataURI,
        uint256 feePaid
    );
    event ListingMetadataUpdated(uint256 indexed listingId, string metadataURI);
    event ListingPayoutUpdated(uint256 indexed listingId, address indexed payout);
    event ListingDeactivated(uint256 indexed listingId, address indexed by);
    event ListingReactivated(uint256 indexed listingId);

    event Settled(
        uint256 indexed listingId,
        bytes32 indexed jobRef,
        address indexed buyer,
        address payout,
        uint256 amount,
        uint256 serviceFee
    );
    event Claimed(address indexed account, uint256 amount);

    // ---------- Modifiers ----------

    modifier onlyGateway() {
        require(isGateway[msg.sender], "only gateway");
        _;
    }

    // ---------- Constructor ----------

    constructor(
        address _gateway,
        address _treasury,
        address _usdc
    ) Ownable(msg.sender) {
        require(_gateway != address(0), "zero gateway");
        require(_treasury != address(0), "zero treasury");
        require(_usdc != address(0), "zero usdc");
        isGateway[_gateway] = true;
        treasury = _treasury;
        usdc = IERC20(_usdc);
        // Registration fee token defaults to USDC. Owner can call
        // setRegistrationFeeToken later to switch to a project token without
        // redeploying the contract.
        registrationFeeToken = IERC20(_usdc);
        emit GatewaySet(_gateway, true);
        emit TreasuryUpdated(address(0), _treasury);
        emit RegistrationFeeTokenUpdated(address(0), _usdc);
    }

    // ---------- Admin ----------

    /// @notice Whitelist or delist a gateway. Multiple gateways can be active
    ///         simultaneously for redundancy / regional failover.
    function setGateway(address _gateway, bool _isGateway) external onlyOwner {
        require(_gateway != address(0), "zero gateway");
        isGateway[_gateway] = _isGateway;
        emit GatewaySet(_gateway, _isGateway);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "zero treasury");
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }

    /// @notice Switch the ERC-20 used for registration fees. Defaults to USDC.
    /// @dev    Settlement and seller payouts always use the immutable `usdc` —
    ///         this setter only affects the fee pull path in `register()`.
    function setRegistrationFeeToken(IERC20 _token) external onlyOwner {
        require(address(_token) != address(0), "zero token");
        emit RegistrationFeeTokenUpdated(
            address(registrationFeeToken),
            address(_token)
        );
        registrationFeeToken = _token;
    }

    function setRegistrationFee(uint256 _fee) external onlyOwner {
        emit RegistrationFeeUpdated(registrationFee, _fee);
        registrationFee = _fee;
    }

    function setRegistrationBurnBps(uint16 _bps) external onlyOwner {
        require(_bps <= MAX_REG_BURN_BPS, "bps too high");
        emit RegistrationBurnBpsUpdated(registrationBurnBps, _bps);
        registrationBurnBps = _bps;
    }

    function setServiceFeeBps(uint16 _bps) external onlyOwner {
        require(_bps <= MAX_SERVICE_FEE_BPS, "bps too high");
        emit ServiceFeeBpsUpdated(serviceFeeBps, _bps);
        serviceFeeBps = _bps;
    }

    function setMaxListingsPerAccount(uint8 _max) external onlyOwner {
        emit MaxListingsPerAccountUpdated(maxListingsPerAccount, _max);
        maxListingsPerAccount = _max;
    }

    // ---------- Listings ----------

    /// @notice Register a new listing. When `registrationFee > 0`, caller must
    ///         pre-approve that amount of `registrationFeeToken` to this
    ///         contract; the fee is split between `BURN_ADDRESS` and
    ///         `treasury` per `registrationBurnBps`.
    function register(
        address payout,
        string calldata metadataURI
    ) external nonReentrant returns (uint256 listingId) {
        require(payout != address(0), "zero payout");
        if (maxListingsPerAccount != 0) {
            require(
                listingsOwnedCount[msg.sender] < maxListingsPerAccount,
                "too many listings"
            );
        }

        uint256 fee = registrationFee;
        if (fee > 0) {
            IERC20 feeToken = registrationFeeToken;
            uint256 burnAmt = (fee * registrationBurnBps) / BPS_DIVISOR;
            if (burnAmt > 0) {
                feeToken.safeTransferFrom(msg.sender, BURN_ADDRESS, burnAmt);
            }
            uint256 treasuryAmt = fee - burnAmt;
            if (treasuryAmt > 0) {
                feeToken.safeTransferFrom(msg.sender, treasury, treasuryAmt);
            }
        }

        listingId = nextListingId++;
        _listings[listingId] = Listing({
            owner: msg.sender,
            payout: payout,
            metadataURI: metadataURI,
            active: true
        });
        listingsOwnedCount[msg.sender] += 1;

        emit ListingRegistered(listingId, msg.sender, payout, metadataURI, fee);
    }

    function updateMetadata(uint256 listingId, string calldata metadataURI) external {
        Listing storage l = _listings[listingId];
        require(l.owner == msg.sender, "not owner");
        l.metadataURI = metadataURI;
        emit ListingMetadataUpdated(listingId, metadataURI);
    }

    function updatePayout(uint256 listingId, address payout) external {
        require(payout != address(0), "zero payout");
        Listing storage l = _listings[listingId];
        require(l.owner == msg.sender, "not owner");
        l.payout = payout;
        emit ListingPayoutUpdated(listingId, payout);
    }

    /// @notice Listing owner OR contract admin can deactivate. Deactivation
    ///         blocks new settlements. Already-accrued `claimable` balances
    ///         stay claimable.
    function deactivate(uint256 listingId) external {
        Listing storage l = _listings[listingId];
        require(l.owner != address(0), "not found");
        require(l.owner == msg.sender || msg.sender == owner(), "not authorized");
        require(l.active, "already inactive");
        l.active = false;
        emit ListingDeactivated(listingId, msg.sender);
    }

    function reactivate(uint256 listingId) external {
        Listing storage l = _listings[listingId];
        require(l.owner == msg.sender, "not owner");
        require(!l.active, "already active");
        l.active = true;
        emit ListingReactivated(listingId);
    }

    function getListing(uint256 listingId) external view returns (Listing memory) {
        Listing memory l = _listings[listingId];
        require(l.owner != address(0), "not found");
        return l;
    }

    // ---------- Settlement ----------

    /// @notice Settle a successful x402 job. Pulls `amount` USDC from `buyer`
    ///         via EIP-3009 receiveWithAuthorization, splits into seller
    ///         payout and service fee, credits pull-pattern balances.
    /// @dev    Whitelisted-gateway only. Gateway has verified the buyer
    ///         payment auth and the seller response off-chain before calling.
    ///         The signed authorization's `to` MUST equal address(this) —
    ///         otherwise USDC.receiveWithAuthorization reverts. Replay is
    ///         prevented by USDC's per-(from, nonce) bookkeeping; the
    ///         active-listing check adds defense-in-depth.
    function settle(
        uint256 listingId,
        bytes32 jobRef,
        address buyer,
        uint256 amount,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external onlyGateway nonReentrant {
        require(amount > 0, "amount zero");
        Listing storage l = _listings[listingId];
        require(l.owner != address(0), "listing not found");
        require(l.active, "listing inactive");

        IERC20WithAuthorization(address(usdc)).receiveWithAuthorization(
            buyer,
            address(this),
            amount,
            validAfter,
            validBefore,
            nonce,
            v, r, s
        );

        uint256 fee = (amount * serviceFeeBps) / BPS_DIVISOR;
        uint256 sellerNet = amount - fee;

        claimable[l.payout] += sellerNet;
        if (fee > 0) {
            claimable[treasury] += fee;
        }

        emit Settled(listingId, jobRef, buyer, l.payout, amount, fee);
    }

    // ---------- Claims ----------

    function claim() external nonReentrant {
        uint256 amt = claimable[msg.sender];
        require(amt > 0, "nothing to claim");
        claimable[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amt);
        emit Claimed(msg.sender, amt);
    }
}