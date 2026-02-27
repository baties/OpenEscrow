// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title OpenEscrow
 * @notice OpenEscrow.sol — on-chain milestone-based escrow for USDC and USDT.
 *
 * This contract is the on-chain authority for fund custody and release.
 * Handles: deal creation, USDC/USDT deposit, milestone submission, approval,
 *          rejection, fund release, and cancellation with refund rules.
 * Does NOT: store off-chain metadata (title, description, links) — that lives
 *           in the API database. Does NOT perform any dispute arbitration,
 *           voting, or on-chain governance.
 *
 * State machine (mirrors CLAUDE.md Section G):
 *   DRAFT → AGREED → FUNDED → COMPLETED / CANCELLED
 *   Per milestone: PENDING → SUBMITTED → APPROVED / REJECTED
 *
 * Supported tokens: USDC and USDT only (addresses injected at construction).
 * Target network: Sepolia testnet (chainId 11155111). Mainnet after audit.
 *
 * Security: uses OpenZeppelin ReentrancyGuard, SafeERC20, and Ownable.
 * Fail-closed: all state transitions revert on invalid inputs or bad state.
 */

import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract OpenEscrow is ReentrancyGuard, Ownable {
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
        CANCELLED   // 4 — cancelled; refund applied per Section C
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
     * @param amount  Token amount for this milestone (in token's smallest unit).
     * @param state   Current state of this milestone.
     * @param released Whether funds for this milestone have been released.
     */
    struct Milestone {
        uint256 amount;
        MilestoneState state;
        bool released;
    }

    /**
     * @notice Represents a full deal on-chain.
     * @param client       Address of the client (deal creator, fund depositor).
     * @param freelancer   Address of the freelancer.
     * @param token        ERC-20 token address (USDC or USDT).
     * @param totalAmount  Sum of all milestone amounts; equals deposit amount.
     * @param state        Current deal state.
     * @param milestones   Array of milestones for this deal.
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

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice Accepted USDC token address (set at construction, immutable).
    address public immutable USDC;

    /// @notice Accepted USDT token address (set at construction, immutable).
    address public immutable USDT;

    /// @notice Auto-incrementing deal counter; becomes the on-chain deal ID.
    uint256 public dealCounter;

    /// @notice Maps on-chain deal ID → Deal struct.
    mapping(uint256 => Deal) private deals;

    // ─── Events ───────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when a new deal is created by a client.
     * @param dealId       On-chain deal identifier.
     * @param client       Address of the client.
     * @param freelancer   Address of the freelancer.
     * @param token        ERC-20 token address (USDC or USDT).
     * @param totalAmount  Total deal value in token units.
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
     * @param dealId        On-chain deal identifier.
     * @param milestoneIndex Zero-based index of the submitted milestone.
     * @param freelancer    Address of the submitting freelancer.
     */
    event MilestoneSubmitted(
        uint256 indexed dealId,
        uint256 indexed milestoneIndex,
        address indexed freelancer
    );

    /**
     * @notice Emitted when a client approves a milestone.
     * @param dealId        On-chain deal identifier.
     * @param milestoneIndex Zero-based index of the approved milestone.
     * @param client        Address of the approving client.
     */
    event MilestoneApproved(
        uint256 indexed dealId,
        uint256 indexed milestoneIndex,
        address indexed client
    );

    /**
     * @notice Emitted when a client rejects a milestone.
     * @param dealId        On-chain deal identifier.
     * @param milestoneIndex Zero-based index of the rejected milestone.
     * @param client        Address of the rejecting client.
     */
    event MilestoneRejected(
        uint256 indexed dealId,
        uint256 indexed milestoneIndex,
        address indexed client
    );

    /**
     * @notice Emitted when funds are released to the freelancer for an approved milestone.
     * @param dealId        On-chain deal identifier.
     * @param milestoneIndex Zero-based index of the milestone whose funds are released.
     * @param freelancer    Address receiving the funds.
     * @param token         ERC-20 token address.
     * @param amount        Amount released.
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

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @notice Deploys the OpenEscrow contract.
     * @dev Immutably sets accepted token addresses. Owner is set to deployer.
     *      No hardcoded addresses — must be provided at deployment time.
     * @param _usdc  Address of the USDC ERC-20 token on the target network.
     * @param _usdt  Address of the USDT ERC-20 token on the target network.
     */
    constructor(address _usdc, address _usdt) Ownable(msg.sender) {
        if (_usdc == address(0) || _usdt == address(0)) revert UnsupportedToken(address(0));
        USDC = _usdc;
        USDT = _usdt;
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────

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
        // Validate token is USDC or USDT.
        if (token != USDC && token != USDT) revert UnsupportedToken(token);

        // Validate freelancer address.
        if (freelancer == address(0)) revert Unauthorized(address(0), 'freelancer');

        // Must have at least one milestone.
        if (milestoneAmounts.length == 0) revert InvalidMilestones();

        // Build milestones, compute total.
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
     *      Agreement is recorded on-chain; off-chain metadata update
     *      (agreed_at timestamp) is handled by the API indexer.
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
     *      Milestones must be submitted in sequence order (i.e., submit milestone N
     *      only after milestone N-1 is APPROVED).
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

        // Enforce sequential submission: all prior milestones must be APPROVED.
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

        // Mark approved and released before external call (CEI pattern).
        milestone.state = MilestoneState.APPROVED;
        milestone.released = true;
        deal.releasedAmount += milestone.amount;

        address token = deal.token;
        address freelancer = deal.freelancer;
        uint256 amount = milestone.amount;

        // Release funds to freelancer.
        IERC20(token).safeTransfer(freelancer, amount);

        emit MilestoneApproved(dealId, milestoneIndex, msg.sender);
        emit FundsReleased(dealId, milestoneIndex, freelancer, token, amount);

        // Check if all milestones are now approved → complete the deal.
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
     *      Rejection reason is recorded off-chain by the API; this call
     *      only records the on-chain state change.
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

        // Revert milestone to PENDING, enabling the freelancer to revise and resubmit.
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

        // Only client or freelancer may cancel.
        if (msg.sender != deal.client && msg.sender != deal.freelancer) {
            revert Unauthorized(msg.sender, 'client or freelancer');
        }

        // Cannot cancel a completed or already-cancelled deal.
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
            // Refund = totalAmount minus what has already been released.
            refundAmount = deal.totalAmount - deal.releasedAmount;

            if (refundAmount > 0) {
                address token = deal.token;
                address client = deal.client;
                // Transfer unreleased funds back to client.
                IERC20(token).safeTransfer(client, refundAmount);
            }
        }
        // DRAFT and AGREED: no funds were deposited, refundAmount stays 0.

        emit DealCancelled(dealId, msg.sender, refundAmount);
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /**
     * @notice Returns the full on-chain state of a deal.
     * @dev Returns all deal fields except the milestones array (use getMilestone).
     * @param dealId On-chain deal identifier.
     * @return client        Client wallet address.
     * @return freelancer    Freelancer wallet address.
     * @return token         ERC-20 token address.
     * @return totalAmount   Total deal value in token units.
     * @return state         Current DealState enum value.
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
}
