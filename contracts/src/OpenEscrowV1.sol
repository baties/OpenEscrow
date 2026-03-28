// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title OpenEscrowV1
 * @notice OpenEscrowV1.sol — UUPS-upgradeable milestone-based escrow for USDC and USDT.
 *
 * This contract is the on-chain authority for fund custody and release.
 * Handles: deal creation, USDC/USDT deposit, milestone submission, approval,
 *          rejection, fund release, and cancellation with refund rules.
 * Does NOT: store off-chain metadata (title, description, links) — that lives
 *           in the API database. Does NOT perform any dispute arbitration,
 *           voting, or on-chain governance.
 *
 * Upgrade pattern: UUPS proxy (EIP-1822 via OpenZeppelin UUPSUpgradeable).
 *   - Deploy: use scripts/deploy.ts which calls upgrades.deployProxy()
 *   - Upgrade: use scripts/upgrade.ts which calls upgrades.upgradeProxy()
 *   - Only the contract owner may authorize upgrades (_authorizeUpgrade).
 *
 * Storage layout: must be preserved across upgrades. New storage vars must be
 * appended before __gap. Do NOT reorder or remove existing storage vars.
 *   slot 0 — USDC address
 *   slot 1 — USDT address
 *   slot 2 — dealCounter
 *   slot 3 — deals mapping
 *   slots 5-49 — reserved by __gap (45 slots for future additions)
 *
 * State machine (mirrors CLAUDE.md Section G):
 *   DRAFT → AGREED → FUNDED → COMPLETED / CANCELLED
 *   Per milestone: PENDING → SUBMITTED → APPROVED / REJECTED
 *
 * Security: OpenZeppelin Initializable, UUPSUpgradeable, OwnableUpgradeable,
 *           ReentrancyGuardUpgradeable, SafeERC20. Fail-closed on all invalid states.
 */

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract OpenEscrowV1 is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    using SafeERC20 for IERC20;

    // ─── Enums ────────────────────────────────────────────────────────────────

    /**
     * @notice On-chain deal states. Mirrors the API-side DealStatus enum.
     * @dev DRAFT and AGREED are pre-deposit states; no funds in contract yet.
     *      FUNDED means the full deposit has been received by this contract.
     *      COMPLETED means all milestones are APPROVED; funds fully released.
     *      CANCELLED is terminal; refund rules applied at cancellation time.
     */
    enum DealState {
        DRAFT,      // 0 — created, awaiting freelancer agreement
        AGREED,     // 1 — freelancer confirmed; awaiting client deposit
        FUNDED,     // 2 — deposit received; milestones in progress
        COMPLETED,  // 3 — all milestones approved; deal finished
        CANCELLED   // 4 — cancelled; refund applied per CLAUDE.md Section C
    }

    /**
     * @notice Per-milestone states.
     */
    enum MilestoneState {
        PENDING,    // 0 — awaiting freelancer submission
        SUBMITTED,  // 1 — freelancer submitted; awaiting client decision
        APPROVED,   // 2 — client approved; funds released to freelancer
        REJECTED    // 3 — client rejected; back to PENDING for revision
    }

    // ─── Structs ──────────────────────────────────────────────────────────────

    /**
     * @notice Represents a single milestone within a deal.
     * @param amount   Token amount for this milestone (in token's smallest unit).
     * @param state    Current state of this milestone.
     * @param released Whether funds for this milestone have been released.
     */
    struct Milestone {
        uint256 amount;
        MilestoneState state;
        bool released;
    }

    /**
     * @notice Represents a full deal on-chain.
     * @param client         Address of the client (deal creator, fund depositor).
     * @param freelancer     Address of the freelancer.
     * @param token          ERC-20 token address (USDC or USDT).
     * @param totalAmount    Sum of all milestone amounts; equals deposit amount.
     * @param state          Current deal state.
     * @param milestones     Array of milestones for this deal.
     * @param releasedAmount Total amount already released to the freelancer.
     */
    struct Deal {
        address client;
        address freelancer;
        address token;
        uint256 totalAmount;
        DealState state;
        Milestone[] milestones;
        uint256 releasedAmount;
    }

    // ─── Storage (slots 0-4) — DO NOT reorder; must match across upgrades ──────
    //
    // Slot 0: USDC
    // Slot 1: USDT
    // Slot 2: dealCounter
    // Slot 3: deals
    // Slot 4: _reentrantStatus (inline reentrancy guard — avoids ReentrancyGuard
    //         constructor which breaks @openzeppelin/hardhat-upgrades validation)
    // Slots 5-49: __gap (45 slots reserved for future state variables)

    /// @notice Accepted USDC token address (set in initialize, mutable for upgrade flexibility).
    address public USDC;

    /// @notice Accepted USDT token address (set in initialize, mutable for upgrade flexibility).
    address public USDT;

    /// @notice Auto-incrementing deal counter; becomes the on-chain deal ID.
    uint256 public dealCounter;

    /// @notice Maps on-chain deal ID → Deal struct.
    mapping(uint256 => Deal) private deals;

    /// @dev Reentrancy guard status. 1 = NOT_ENTERED, 2 = ENTERED.
    ///      Initialized to 1 in initialize() so the first call is always valid.
    uint256 private _reentrantStatus;

    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    // ─── Events ───────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when a new deal is created by a client.
     * @param dealId         On-chain deal identifier.
     * @param client         Address of the client.
     * @param freelancer     Address of the freelancer.
     * @param token          ERC-20 token address (USDC or USDT).
     * @param totalAmount    Total deal value in token units.
     * @param milestoneCount Number of milestones in the deal.
     */
    event DealCreated(
        uint256 indexed dealId,
        address indexed client,
        address indexed freelancer,
        address token,
        uint256 totalAmount,
        uint256 milestoneCount
    );

    /**
     * @notice Emitted when the freelancer agrees to the deal terms.
     * @param dealId     On-chain deal identifier.
     * @param freelancer Address of the agreeing freelancer.
     */
    event DealAgreed(
        uint256 indexed dealId,
        address indexed freelancer
    );

    /**
     * @notice Emitted when the client deposits the full deal amount.
     * @param dealId  On-chain deal identifier.
     * @param client  Address of the depositing client.
     * @param token   ERC-20 token address.
     * @param amount  Amount deposited (must equal totalAmount).
     */
    event DealFunded(
        uint256 indexed dealId,
        address indexed client,
        address token,
        uint256 amount
    );

    /**
     * @notice Emitted when a freelancer submits a milestone for review.
     * @param dealId         On-chain deal identifier.
     * @param milestoneIndex Zero-based index of the submitted milestone.
     * @param freelancer     Address of the submitting freelancer.
     */
    event MilestoneSubmitted(
        uint256 indexed dealId,
        uint256 indexed milestoneIndex,
        address indexed freelancer
    );

    /**
     * @notice Emitted when a client approves a milestone.
     * @param dealId         On-chain deal identifier.
     * @param milestoneIndex Zero-based index of the approved milestone.
     * @param client         Address of the approving client.
     */
    event MilestoneApproved(
        uint256 indexed dealId,
        uint256 indexed milestoneIndex,
        address indexed client
    );

    /**
     * @notice Emitted when a client rejects a milestone.
     * @param dealId         On-chain deal identifier.
     * @param milestoneIndex Zero-based index of the rejected milestone.
     * @param client         Address of the rejecting client.
     */
    event MilestoneRejected(
        uint256 indexed dealId,
        uint256 indexed milestoneIndex,
        address indexed client
    );

    /**
     * @notice Emitted when funds are released to the freelancer for an approved milestone.
     * @param dealId         On-chain deal identifier.
     * @param milestoneIndex Zero-based index of the milestone whose funds are released.
     * @param freelancer     Address receiving the funds.
     * @param token          ERC-20 token address.
     * @param amount         Amount released.
     */
    event FundsReleased(
        uint256 indexed dealId,
        uint256 indexed milestoneIndex,
        address indexed freelancer,
        address token,
        uint256 amount
    );

    /**
     * @notice Emitted when a deal is cancelled.
     * @param dealId       On-chain deal identifier.
     * @param cancelledBy  Address of the party that triggered cancellation.
     * @param refundAmount Amount refunded to the client (0 if DRAFT/AGREED).
     */
    event DealCancelled(
        uint256 indexed dealId,
        address indexed cancelledBy,
        uint256 refundAmount
    );

    // ─── Errors ───────────────────────────────────────────────────────────────

    /// @notice Thrown when caller is not the expected party for an action.
    error Unauthorized(address caller, string expectedRole);

    /// @notice Thrown when a deal does not exist.
    error DealNotFound(uint256 dealId);

    /// @notice Thrown when a deal state transition is invalid.
    error InvalidDealState(uint256 dealId, DealState current, DealState required);

    /// @notice Thrown when a milestone index is out of bounds.
    error InvalidMilestoneIndex(uint256 dealId, uint256 milestoneIndex);

    /// @notice Thrown when a milestone state transition is invalid.
    error InvalidMilestoneState(uint256 dealId, uint256 milestoneIndex, MilestoneState current);

    /// @notice Thrown when an unsupported token is used.
    error UnsupportedToken(address token);

    /// @notice Thrown when milestone amounts don't match expected total.
    error AmountMismatch(uint256 provided, uint256 expected);

    /// @notice Thrown when milestone array is empty or invalid.
    error InvalidMilestones();

    // ─── Constructor / Initializer ────────────────────────────────────────────

    /**
     * @notice Disables direct initialization of the implementation contract.
     * @dev Required by UUPS pattern — prevents anyone from calling initialize()
     *      on the bare implementation (only the proxy should be initialized).
     *      @custom:oz-upgrades-unsafe-allow constructor
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the proxy. Called once by the deploy script via deployProxy().
     * @dev Replaces the constructor for the upgradeable pattern.
     *      Sets accepted token addresses and initializes all OZ base contracts.
     *      No hardcoded addresses — must be provided at deploy time.
     * @param _usdc Address of the USDC ERC-20 token on the target network.
     * @param _usdt Address of the USDT ERC-20 token on the target network.
     */
    function initialize(address _usdc, address _usdt) external initializer {
        __Ownable_init(msg.sender);
        // UUPSUpgradeable (OZ v5) has no __init function — uses namespaced storage.

        _reentrantStatus = _NOT_ENTERED; // Initialize inline reentrancy guard.

        if (_usdc == address(0) || _usdt == address(0)) revert UnsupportedToken(address(0));
        USDC = _usdc;
        USDT = _usdt;
    }

    // ─── UUPS Authorization ───────────────────────────────────────────────────

    /**
     * @notice Restricts contract upgrades to the owner.
     * @dev Required override for UUPSUpgradeable. The empty body is intentional —
     *      access control is enforced entirely by the onlyOwner modifier.
     * @param newImplementation Address of the new implementation contract (unused in body).
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // onlyOwner modifier handles authorization — no additional body logic needed.
        // newImplementation is validated by the UUPS upgrade mechanism before this is called.
        (newImplementation); // silence unused-variable warning
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────

    // Prevents reentrant calls. Uses storage slot 4 (_reentrantStatus).
    // Identical semantics to OpenZeppelin ReentrancyGuard — defined inline
    // to avoid inheriting a contract with a constructor (the OZ plugin flags
    // constructors in inherited contracts as incompatible with UUPS upgradeability).
    modifier nonReentrant() {
        if (_reentrantStatus == _ENTERED) revert("ReentrancyGuard: reentrant call");
        _reentrantStatus = _ENTERED;
        _;
        _reentrantStatus = _NOT_ENTERED;
    }

    /**
     * @dev Reverts if dealId does not correspond to an existing deal.
     *      A deal exists if its client address is non-zero.
     * @param dealId The deal identifier to validate.
     */
    modifier dealExists(uint256 dealId) {
        if (deals[dealId].client == address(0)) revert DealNotFound(dealId);
        _;
    }

    /**
     * @dev Reverts if the current deal state is not exactly `required`.
     * @param dealId   The deal identifier.
     * @param required The state the deal must currently be in.
     */
    modifier inDealState(uint256 dealId, DealState required) {
        if (deals[dealId].state != required) {
            revert InvalidDealState(dealId, deals[dealId].state, required);
        }
        _;
    }

    // ─── External Functions ───────────────────────────────────────────────────

    /**
     * @notice Creates a new deal with a set of milestones.
     * @dev The caller becomes the client. Deal starts in DRAFT state.
     *      Milestones are stored with their individual amounts on-chain.
     *      The token must be USDC or USDT — any other address reverts.
     *      The sum of milestone amounts becomes the deal's totalAmount.
     * @param freelancer       Address of the freelancer party.
     * @param token            ERC-20 token address (must be USDC or USDT).
     * @param milestoneAmounts Array of per-milestone amounts in token units.
     *                         Must have at least 1 element; no zeros allowed.
     * @return dealId          The on-chain identifier of the newly created deal.
     * @custom:throws UnsupportedToken If token is not USDC or USDT.
     * @custom:throws InvalidMilestones If milestoneAmounts is empty or contains a zero.
     */
    function createDeal(
        address freelancer,
        address token,
        uint256[] calldata milestoneAmounts
    ) external returns (uint256 dealId) {
        if (token != USDC && token != USDT) revert UnsupportedToken(token);
        if (freelancer == address(0)) revert Unauthorized(address(0), 'freelancer');
        if (milestoneAmounts.length == 0) revert InvalidMilestones();

        uint256 total = 0;
        dealId = ++dealCounter;
        Deal storage deal = deals[dealId];
        deal.client = msg.sender;
        deal.freelancer = freelancer;
        deal.token = token;
        deal.state = DealState.DRAFT;
        deal.releasedAmount = 0;

        for (uint256 i = 0; i < milestoneAmounts.length; ) {
            uint256 amt = milestoneAmounts[i];
            if (amt == 0) revert InvalidMilestones();
            total += amt;
            deal.milestones.push(Milestone({
                amount: amt,
                state: MilestoneState.PENDING,
                released: false
            }));
            unchecked { ++i; }
        }
        deal.totalAmount = total;

        emit DealCreated(dealId, msg.sender, freelancer, token, total, milestoneAmounts.length);
    }

    /**
     * @notice Freelancer agrees to the deal terms, advancing state to AGREED.
     * @dev Only the designated freelancer may call this.
     *      Deal must currently be in DRAFT state.
     * @param dealId On-chain deal identifier.
     * @custom:throws Unauthorized If caller is not the freelancer.
     * @custom:throws InvalidDealState If deal is not in DRAFT state.
     */
    function agreeToDeal(uint256 dealId)
        external
        dealExists(dealId)
        inDealState(dealId, DealState.DRAFT)
    {
        Deal storage deal = deals[dealId];
        if (msg.sender != deal.freelancer) revert Unauthorized(msg.sender, 'freelancer');

        deal.state = DealState.AGREED;
        emit DealAgreed(dealId, msg.sender);
    }

    /**
     * @notice Client deposits the full deal amount into escrow.
     * @dev Only the client may call this. Deal must be in AGREED state.
     *      Transfers exactly `deal.totalAmount` of `deal.token` from caller
     *      to this contract using SafeERC20 (handles non-standard tokens).
     *      Caller must have approved this contract for at least totalAmount.
     * @param dealId On-chain deal identifier.
     * @custom:throws Unauthorized If caller is not the client.
     * @custom:throws InvalidDealState If deal is not in AGREED state.
     */
    function deposit(uint256 dealId)
        external
        nonReentrant
        dealExists(dealId)
        inDealState(dealId, DealState.AGREED)
    {
        Deal storage deal = deals[dealId];
        if (msg.sender != deal.client) revert Unauthorized(msg.sender, 'client');

        uint256 amount = deal.totalAmount;
        deal.state = DealState.FUNDED;

        IERC20(deal.token).safeTransferFrom(msg.sender, address(this), amount);

        emit DealFunded(dealId, msg.sender, deal.token, amount);
    }

    /**
     * @notice Freelancer marks a milestone as submitted for review.
     * @dev Only the freelancer may call this. Deal must be FUNDED.
     *      Milestone must be in PENDING state (initial or after REJECTED→PENDING reset).
     *      Milestones must be submitted in sequence — milestone N requires N-1 APPROVED.
     * @param dealId         On-chain deal identifier.
     * @param milestoneIndex Zero-based index of the milestone to submit.
     * @custom:throws Unauthorized If caller is not the freelancer.
     * @custom:throws InvalidDealState If deal is not in FUNDED state.
     * @custom:throws InvalidMilestoneIndex If milestoneIndex is out of bounds.
     * @custom:throws InvalidMilestoneState If milestone is not in PENDING state.
     */
    function submitMilestone(uint256 dealId, uint256 milestoneIndex)
        external
        dealExists(dealId)
        inDealState(dealId, DealState.FUNDED)
    {
        Deal storage deal = deals[dealId];
        if (msg.sender != deal.freelancer) revert Unauthorized(msg.sender, 'freelancer');
        if (milestoneIndex >= deal.milestones.length) {
            revert InvalidMilestoneIndex(dealId, milestoneIndex);
        }

        for (uint256 i = 0; i < milestoneIndex; ) {
            if (deal.milestones[i].state != MilestoneState.APPROVED) {
                revert InvalidMilestoneState(dealId, i, deal.milestones[i].state);
            }
            unchecked { ++i; }
        }

        Milestone storage milestone = deal.milestones[milestoneIndex];
        if (milestone.state != MilestoneState.PENDING) {
            revert InvalidMilestoneState(dealId, milestoneIndex, milestone.state);
        }

        milestone.state = MilestoneState.SUBMITTED;
        emit MilestoneSubmitted(dealId, milestoneIndex, msg.sender);
    }

    /**
     * @notice Client approves a submitted milestone and triggers fund release.
     * @dev Only the client may call this. Deal must be FUNDED.
     *      Milestone must be in SUBMITTED state.
     *      Releases milestone funds to the freelancer via SafeERC20.
     *      If this was the final milestone, deal state advances to COMPLETED.
     * @param dealId         On-chain deal identifier.
     * @param milestoneIndex Zero-based index of the milestone to approve.
     * @custom:throws Unauthorized If caller is not the client.
     * @custom:throws InvalidDealState If deal is not in FUNDED state.
     * @custom:throws InvalidMilestoneIndex If milestoneIndex is out of bounds.
     * @custom:throws InvalidMilestoneState If milestone is not in SUBMITTED state.
     */
    function approveMilestone(uint256 dealId, uint256 milestoneIndex)
        external
        nonReentrant
        dealExists(dealId)
        inDealState(dealId, DealState.FUNDED)
    {
        Deal storage deal = deals[dealId];
        if (msg.sender != deal.client) revert Unauthorized(msg.sender, 'client');
        if (milestoneIndex >= deal.milestones.length) {
            revert InvalidMilestoneIndex(dealId, milestoneIndex);
        }

        Milestone storage milestone = deal.milestones[milestoneIndex];
        if (milestone.state != MilestoneState.SUBMITTED) {
            revert InvalidMilestoneState(dealId, milestoneIndex, milestone.state);
        }

        // CEI pattern: mark state before external transfer.
        milestone.state = MilestoneState.APPROVED;
        milestone.released = true;
        deal.releasedAmount += milestone.amount;

        address token = deal.token;
        address freelancer = deal.freelancer;
        uint256 amount = milestone.amount;

        IERC20(token).safeTransfer(freelancer, amount);

        emit MilestoneApproved(dealId, milestoneIndex, msg.sender);
        emit FundsReleased(dealId, milestoneIndex, freelancer, token, amount);

        bool allApproved = true;
        for (uint256 i = 0; i < deal.milestones.length; ) {
            if (deal.milestones[i].state != MilestoneState.APPROVED) {
                allApproved = false;
                break;
            }
            unchecked { ++i; }
        }
        if (allApproved) {
            deal.state = DealState.COMPLETED;
        }
    }

    /**
     * @notice Client rejects a submitted milestone.
     * @dev Only the client may call this. Deal must be FUNDED.
     *      Milestone must be in SUBMITTED state.
     *      After rejection the milestone reverts to PENDING, enabling resubmission.
     * @param dealId         On-chain deal identifier.
     * @param milestoneIndex Zero-based index of the milestone to reject.
     * @custom:throws Unauthorized If caller is not the client.
     * @custom:throws InvalidDealState If deal is not in FUNDED state.
     * @custom:throws InvalidMilestoneIndex If milestoneIndex is out of bounds.
     * @custom:throws InvalidMilestoneState If milestone is not in SUBMITTED state.
     */
    function rejectMilestone(uint256 dealId, uint256 milestoneIndex)
        external
        dealExists(dealId)
        inDealState(dealId, DealState.FUNDED)
    {
        Deal storage deal = deals[dealId];
        if (msg.sender != deal.client) revert Unauthorized(msg.sender, 'client');
        if (milestoneIndex >= deal.milestones.length) {
            revert InvalidMilestoneIndex(dealId, milestoneIndex);
        }

        Milestone storage milestone = deal.milestones[milestoneIndex];
        if (milestone.state != MilestoneState.SUBMITTED) {
            revert InvalidMilestoneState(dealId, milestoneIndex, milestone.state);
        }

        milestone.state = MilestoneState.PENDING;
        emit MilestoneRejected(dealId, milestoneIndex, msg.sender);
    }

    /**
     * @notice Cancels a deal, applying the appropriate refund rules.
     * @dev Either the client or the freelancer may cancel.
     *      Refund rules (per CLAUDE.md Section C):
     *        - DRAFT or AGREED → no funds to refund (deposit not yet made).
     *        - FUNDED → all unreleased milestone amounts returned to client.
     *        - Released milestones are irreversible; those amounts are NOT refunded.
     *      COMPLETED and already-CANCELLED deals cannot be cancelled.
     * @param dealId On-chain deal identifier.
     * @custom:throws Unauthorized If caller is not the client or freelancer.
     * @custom:throws InvalidDealState If deal is COMPLETED or already CANCELLED.
     */
    function cancelDeal(uint256 dealId)
        external
        nonReentrant
        dealExists(dealId)
    {
        Deal storage deal = deals[dealId];

        if (msg.sender != deal.client && msg.sender != deal.freelancer) {
            revert Unauthorized(msg.sender, 'client or freelancer');
        }

        if (deal.state == DealState.COMPLETED) {
            revert InvalidDealState(dealId, deal.state, DealState.CANCELLED);
        }
        if (deal.state == DealState.CANCELLED) {
            revert InvalidDealState(dealId, deal.state, DealState.CANCELLED);
        }

        DealState previousState = deal.state;
        deal.state = DealState.CANCELLED;

        uint256 refundAmount = 0;

        if (previousState == DealState.FUNDED) {
            refundAmount = deal.totalAmount - deal.releasedAmount;
            if (refundAmount > 0) {
                address token = deal.token;
                address client = deal.client;
                IERC20(token).safeTransfer(client, refundAmount);
            }
        }

        emit DealCancelled(dealId, msg.sender, refundAmount);
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /**
     * @notice Returns the full on-chain state of a deal.
     * @param dealId On-chain deal identifier.
     * @return client         Client wallet address.
     * @return freelancer     Freelancer wallet address.
     * @return token          ERC-20 token address.
     * @return totalAmount    Total deal value in token units.
     * @return state          Current DealState enum value.
     * @return releasedAmount Amount already released to the freelancer.
     * @return milestoneCount Number of milestones in the deal.
     */
    function getDeal(uint256 dealId)
        external
        view
        dealExists(dealId)
        returns (
            address client,
            address freelancer,
            address token,
            uint256 totalAmount,
            DealState state,
            uint256 releasedAmount,
            uint256 milestoneCount
        )
    {
        Deal storage deal = deals[dealId];
        return (
            deal.client,
            deal.freelancer,
            deal.token,
            deal.totalAmount,
            deal.state,
            deal.releasedAmount,
            deal.milestones.length
        );
    }

    /**
     * @notice Returns the on-chain state of a specific milestone.
     * @param dealId         On-chain deal identifier.
     * @param milestoneIndex Zero-based index of the milestone.
     * @return amount   Milestone token amount.
     * @return state    Current MilestoneState enum value.
     * @return released Whether funds for this milestone have been released.
     */
    function getMilestone(uint256 dealId, uint256 milestoneIndex)
        external
        view
        dealExists(dealId)
        returns (uint256 amount, MilestoneState state, bool released)
    {
        Deal storage deal = deals[dealId];
        if (milestoneIndex >= deal.milestones.length) {
            revert InvalidMilestoneIndex(dealId, milestoneIndex);
        }
        Milestone storage m = deal.milestones[milestoneIndex];
        return (m.amount, m.state, m.released);
    }

    /**
     * @notice Checks whether a given token address is accepted by this contract.
     * @param token ERC-20 token address to check.
     * @return True if token is USDC or USDT, false otherwise.
     */
    function isSupportedToken(address token) external view returns (bool) {
        return token == USDC || token == USDT;
    }

    // ─── Storage Gap ─────────────────────────────────────────────────────────

    /**
     * @dev Reserved storage slots for future upgrades.
     *      Own storage uses slots 0-3 (USDC, USDT, dealCounter, deals).
     *      __gap covers slots 5-49, giving 45 slots for new state variables
     *      in future versions without disrupting the storage layout.
     *      When adding a new storage var in V2+: append before __gap and
     *      reduce the gap size by the number of slots consumed.
     *      Own slots used: 0=USDC, 1=USDT, 2=dealCounter, 3=deals, 4=_reentrantStatus.
     */
    // solhint-disable-next-line var-name-mixedcase
    uint256[45] private __gap;
}
