// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPoolAdapter} from "./interfaces/IPoolAdapter.sol";

/// @title MosaicVault
/// @notice ERC-4626 vault over USDG that spreads capital across registered pool adapters,
/// keeps an idle buffer for cheap withdrawals, rebalances under threshold + cooldown, and
/// charges a performance fee on yield only via a price-per-share high-water mark.
contract MosaicVault is ERC4626, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_PERFORMANCE_FEE_BPS = 3_000;
    uint256 internal constant PPS_SCALE = 1e18;
    uint256 internal constant YEAR = 365 days;
    /// @dev Ceiling on any rate an adapter reports (1000% APY). Adapters are trusted code, but a
    /// buggy or compromised one must not be able to overflow the planning math or the EMA casts.
    uint256 internal constant MAX_RATE_BPS = 100_000;
    /// @dev Shares carry 6 extra decimals (12 total) so round-trip rounding loss is <= 1 asset wei
    /// and donation/inflation attacks are uneconomic.
    uint8 internal constant DECIMALS_OFFSET = 6;
    uint256 internal constant SHARES_PER_ASSET = 10 ** uint256(DECIMALS_OFFSET);

    struct AdapterConfig {
        bool registered;
        uint16 targetWeightBps;
        uint16 maxWeightBps;
        uint256 maxAssets; // per-adapter cap, 0 = uncapped
    }

    // ---------- registry ----------
    IPoolAdapter[] public adapters;
    mapping(address => AdapterConfig) public adapterConfig;
    uint16 public totalTargetBps;

    // ---------- params ----------
    uint16 public bufferTargetBps = 600;
    uint16 public rebalanceThresholdBps = 50;
    uint16 public defaultMaxWeightBps = 4_000;
    uint16 public performanceFeeBps = 1_000;
    uint256 public rebalanceCooldown = 24 hours;
    uint256 public depositCap = 2_000_000e6;
    address public feeRecipient;

    // ---------- rebalance economics ----------
    /// @notice Worst shortfall tolerated on a single unwind, and on the round trip as a whole.
    uint16 public maxSlippageBps = 10;
    /// @notice Window the expected yield change of a rebalance is measured over.
    uint256 public rebalanceHorizon = 30 days;
    /// @notice Owner-maintained estimate of what one rebalance costs (gas etc.), in asset units.
    uint256 public rebalanceCostAssets;
    /// @notice How much expected yield a rebalance may give up, in bps of the assets it moves.
    /// Restoring targets is a risk decision, so a small drag is allowed; anything worse must pay
    /// for itself. Set to 0 to require every rebalance to be yield-positive net of cost.
    uint16 public maxRebalanceDragBps = 50;

    // ---------- scoring ----------
    /// @notice When on, keepers may set target weights from the on-chain score (never past maxWeightBps).
    bool public scoringEnabled;
    /// @notice Weight given to a fresh rate sample when updating the EMA.
    uint16 public rateEmaAlphaBps = 2_000;
    /// @notice Ceiling on the keeper-reported gas estimate, so a compromised keeper cannot price
    /// rebalancing out of existence. Set it at deployment to a few multiples of a real rebalance.
    uint256 public maxRebalanceCostAssets = type(uint256).max;

    // ---------- state ----------
    uint256 public lastRebalance;
    uint256 public highWaterMarkPps = PPS_SCALE; // price per share, 1e18-scaled
    mapping(address => bool) public isKeeper;

    /// @notice Smoothed rate and mean absolute deviation per adapter, sampled by keeper actions.
    /// `emaDevBps` relative to `emaRateBps` is the volatility term of the score.
    struct RateStat {
        uint64 emaRateBps;
        uint64 emaDevBps;
        uint32 lastUpdate;
    }

    mapping(address => RateStat) public rateStat;

    // ---------- events ----------
    event AdapterAdded(address indexed adapter, uint16 maxWeightBps);
    event AdapterRemoved(address indexed adapter);
    event TargetWeightsSet(uint16[] weightsBps);
    event AdapterCapSet(address indexed adapter, uint256 maxAssets);
    event AdapterMaxWeightSet(address indexed adapter, uint16 maxWeightBps);
    event KeeperSet(address indexed keeper, bool allowed);
    event BufferTargetSet(uint16 bps);
    event RebalanceThresholdSet(uint16 bps);
    event RebalanceCooldownSet(uint256 seconds_);
    event PerformanceFeeSet(uint16 bps);
    event FeeRecipientSet(address indexed recipient);
    event DepositCapSet(uint256 cap);
    event Deployed(uint256 totalDeployed);
    event AdapterDeposit(address indexed adapter, uint256 assets);
    event AdapterWithdraw(address indexed adapter, uint256 requested, uint256 received);
    event Rebalanced(uint256 deployedAssets, uint256 maxDeviationBps, uint256 timestamp);
    event FeeAccrued(uint256 feeAssets, uint256 feeShares, uint256 newHighWaterMarkPps);
    event EmergencyWithdraw(address indexed adapter, uint256 received);
    event MaxSlippageSet(uint16 bps);
    event RebalanceHorizonSet(uint256 seconds_);
    event RebalanceCostSet(uint256 assets);
    event MaxRebalanceDragSet(uint16 bps);
    event ScoringEnabledSet(bool enabled);
    event RateEmaAlphaSet(uint16 bps);
    event MaxRebalanceCostSet(uint256 assets);
    event RatesRecorded(uint256 timestamp);
    event ScoredWeightsApplied(uint16[] weightsBps, uint256[] scores);

    // ---------- errors ----------
    error NotKeeper();
    error AdapterAlreadyRegistered();
    error AdapterNotRegistered();
    error AdapterNotEmpty();
    error AdapterHasWeight();
    error AssetMismatch();
    error LengthMismatch();
    error WeightsMustSumTo10000();
    error WeightExceedsMax(uint256 index, uint16 weight, uint16 max);
    error InvalidBps();
    error FeeTooHigh();
    error ZeroAddress();
    error TargetsNotSet();
    error NothingToDeploy();
    error CooldownActive(uint256 readyAt);
    error DeviationBelowThreshold(uint256 maxDeviationBps, uint16 threshold);
    error InsufficientLiquidity(uint256 requested, uint256 available);
    error SlippageExceeded(uint256 requested, uint256 received);
    error RebalanceNotProfitable(int256 netAssets, int256 minNetAssets);
    error NothingToMove();
    error ScoringDisabled();
    error CapsBelowFull();
    error NoScore();
    error CostAboveCeiling(uint256 assets, uint256 ceiling);

    modifier onlyKeeper() {
        if (!isKeeper[msg.sender] && msg.sender != owner()) revert NotKeeper();
        _;
    }

    constructor(IERC20 asset_, address owner_, address feeRecipient_)
        ERC20("Mosaic USDG Vault", "mUSDG")
        ERC4626(asset_)
        Ownable(owner_)
    {
        if (feeRecipient_ == address(0)) revert ZeroAddress();
        feeRecipient = feeRecipient_;
        isKeeper[owner_] = true;
        emit KeeperSet(owner_, true);
    }

    // =====================================================================
    // Registry & admin
    // =====================================================================

    function adaptersLength() external view returns (uint256) {
        return adapters.length;
    }

    function addAdapter(IPoolAdapter adapter) external onlyOwner {
        if (address(adapter) == address(0)) revert ZeroAddress();
        if (adapterConfig[address(adapter)].registered) revert AdapterAlreadyRegistered();
        if (adapter.asset() != asset()) revert AssetMismatch();
        adapters.push(adapter);
        adapterConfig[address(adapter)] =
            AdapterConfig({registered: true, targetWeightBps: 0, maxWeightBps: defaultMaxWeightBps, maxAssets: 0});
        emit AdapterAdded(address(adapter), defaultMaxWeightBps);
    }

    /// @notice Remove an adapter. It must hold nothing and carry zero target weight.
    function removeAdapter(IPoolAdapter adapter) external onlyOwner {
        AdapterConfig memory cfg = adapterConfig[address(adapter)];
        if (!cfg.registered) revert AdapterNotRegistered();
        if (adapter.totalAssets() != 0) revert AdapterNotEmpty();
        if (cfg.targetWeightBps != 0) revert AdapterHasWeight();
        uint256 len = adapters.length;
        for (uint256 i; i < len; ++i) {
            if (adapters[i] == adapter) {
                for (uint256 j = i; j + 1 < len; ++j) adapters[j] = adapters[j + 1];
                adapters.pop();
                break;
            }
        }
        delete adapterConfig[address(adapter)];
        emit AdapterRemoved(address(adapter));
    }

    /// @notice Set target weights (bps) in registry order. Must sum to 10_000 and respect per-adapter caps.
    function setTargetWeights(uint16[] calldata weightsBps) external onlyOwner {
        uint256 len = adapters.length;
        if (weightsBps.length != len) revert LengthMismatch();
        uint256 sum;
        for (uint256 i; i < len; ++i) {
            AdapterConfig storage cfg = adapterConfig[address(adapters[i])];
            if (weightsBps[i] > cfg.maxWeightBps) revert WeightExceedsMax(i, weightsBps[i], cfg.maxWeightBps);
            cfg.targetWeightBps = weightsBps[i];
            sum += weightsBps[i];
        }
        if (len > 0 && sum != BPS) revert WeightsMustSumTo10000();
        totalTargetBps = uint16(sum);
        emit TargetWeightsSet(weightsBps);
    }

    function setAdapterCap(IPoolAdapter adapter, uint256 maxAssets) external onlyOwner {
        if (!adapterConfig[address(adapter)].registered) revert AdapterNotRegistered();
        adapterConfig[address(adapter)].maxAssets = maxAssets;
        emit AdapterCapSet(address(adapter), maxAssets);
    }

    function setAdapterMaxWeight(IPoolAdapter adapter, uint16 maxWeightBps) external onlyOwner {
        AdapterConfig storage cfg = adapterConfig[address(adapter)];
        if (!cfg.registered) revert AdapterNotRegistered();
        if (maxWeightBps > BPS) revert InvalidBps();
        cfg.maxWeightBps = maxWeightBps;
        emit AdapterMaxWeightSet(address(adapter), maxWeightBps);
    }

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        isKeeper[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    function setBufferTargetBps(uint16 bps) external onlyOwner {
        if (bps > BPS) revert InvalidBps();
        bufferTargetBps = bps;
        emit BufferTargetSet(bps);
    }

    function setRebalanceThresholdBps(uint16 bps) external onlyOwner {
        if (bps > BPS) revert InvalidBps();
        rebalanceThresholdBps = bps;
        emit RebalanceThresholdSet(bps);
    }

    function setRebalanceCooldown(uint256 seconds_) external onlyOwner {
        rebalanceCooldown = seconds_;
        emit RebalanceCooldownSet(seconds_);
    }

    function setPerformanceFeeBps(uint16 bps) external onlyOwner {
        if (bps > MAX_PERFORMANCE_FEE_BPS) revert FeeTooHigh();
        _accrueFee();
        performanceFeeBps = bps;
        emit PerformanceFeeSet(bps);
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        feeRecipient = recipient;
        emit FeeRecipientSet(recipient);
    }

    function setMaxSlippageBps(uint16 bps) external onlyOwner {
        if (bps > BPS) revert InvalidBps();
        maxSlippageBps = bps;
        emit MaxSlippageSet(bps);
    }

    function setRebalanceHorizon(uint256 seconds_) external onlyOwner {
        rebalanceHorizon = seconds_;
        emit RebalanceHorizonSet(seconds_);
    }

    /// @notice Update the assumed cost of one rebalance (gas priced in USDG), from an off-chain oracle.
    /// @dev Keeper-callable but bounded: an inflated estimate would otherwise block every rebalance.
    function setRebalanceCostAssets(uint256 assets) external onlyKeeper {
        if (assets > maxRebalanceCostAssets) revert CostAboveCeiling(assets, maxRebalanceCostAssets);
        rebalanceCostAssets = assets;
        emit RebalanceCostSet(assets);
    }

    function setMaxRebalanceCostAssets(uint256 assets) external onlyOwner {
        maxRebalanceCostAssets = assets;
        if (rebalanceCostAssets > assets) {
            rebalanceCostAssets = assets;
            emit RebalanceCostSet(assets);
        }
        emit MaxRebalanceCostSet(assets);
    }

    function setMaxRebalanceDragBps(uint16 bps) external onlyOwner {
        if (bps > BPS) revert InvalidBps();
        maxRebalanceDragBps = bps;
        emit MaxRebalanceDragSet(bps);
    }

    function setScoringEnabled(bool enabled) external onlyOwner {
        scoringEnabled = enabled;
        emit ScoringEnabledSet(enabled);
    }

    function setRateEmaAlphaBps(uint16 bps) external onlyOwner {
        if (bps == 0 || bps > BPS) revert InvalidBps();
        rateEmaAlphaBps = bps;
        emit RateEmaAlphaSet(bps);
    }

    function setDepositCap(uint256 cap) external onlyOwner {
        depositCap = cap;
        emit DepositCapSet(cap);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Pull everything from one adapter back to idle. Owner only.
    function emergencyWithdraw(IPoolAdapter adapter) external onlyOwner nonReentrant {
        if (!adapterConfig[address(adapter)].registered) revert AdapterNotRegistered();
        uint256 held = adapter.totalAssets();
        uint256 got = held == 0 ? 0 : adapter.withdraw(held);
        emit EmergencyWithdraw(address(adapter), got);
    }

    // =====================================================================
    // Accounting views
    // =====================================================================

    function idleAssets() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    function deployedAssets() public view returns (uint256 total) {
        uint256 len = adapters.length;
        for (uint256 i; i < len; ++i) total += adapters[i].totalAssets();
    }

    function totalAssets() public view override returns (uint256) {
        return idleAssets() + deployedAssets();
    }

    function _decimalsOffset() internal pure override returns (uint8) {
        return DECIMALS_OFFSET;
    }

    /// @notice Price per share, 1e18-scaled: assets per 10^decimalsOffset shares
    /// (i.e. 1e18 == 1 USDG per "one USDG-unit of shares"). Starts at 1e18.
    function pricePerShare() public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return PPS_SCALE;
        return totalAssets().mulDiv(PPS_SCALE * SHARES_PER_ASSET, supply);
    }

    /// @notice Current weight (bps of deployed assets) and target for adapter `i`.
    function allocation(uint256 i)
        external
        view
        returns (address adapter, uint256 assets, uint256 currentBps, uint16 targetBps, uint256 rateBps)
    {
        IPoolAdapter a = adapters[i];
        assets = a.totalAssets();
        uint256 deployed = deployedAssets();
        currentBps = deployed == 0 ? 0 : (assets * BPS) / deployed;
        targetBps = adapterConfig[address(a)].targetWeightBps;
        rateBps = a.currentRateBps();
        adapter = address(a);
    }

    /// @notice Assets that could actually leave the vault right now: idle plus, per adapter,
    /// whatever the venue has free cash for. Illiquid (borrowed-out) balances are excluded.
    function withdrawalCapacity() public view returns (uint256 capacity) {
        capacity = idleAssets();
        uint256 len = adapters.length;
        for (uint256 i; i < len; ++i) capacity += adapters[i].availableLiquidity();
    }

    /// @notice Capacity split out per adapter, in registry order, alongside what each holds.
    function liquidityByAdapter() external view returns (uint256[] memory held, uint256[] memory available) {
        uint256 len = adapters.length;
        held = new uint256[](len);
        available = new uint256[](len);
        for (uint256 i; i < len; ++i) {
            held[i] = adapters[i].totalAssets();
            available[i] = adapters[i].availableLiquidity();
        }
    }

    /// @notice Largest redemption `owner_` could complete right now, in shares.
    function maxRedeem(address owner_) public view override returns (uint256) {
        uint256 shares = balanceOf(owner_);
        uint256 byLiquidity = _convertToShares(withdrawalCapacity(), Math.Rounding.Floor);
        return shares < byLiquidity ? shares : byLiquidity;
    }

    /// @notice Largest withdrawal `owner_` could complete right now, in assets.
    function maxWithdraw(address owner_) public view override returns (uint256) {
        uint256 byShares = _convertToAssets(balanceOf(owner_), Math.Rounding.Floor);
        uint256 cap = withdrawalCapacity();
        return byShares < cap ? byShares : cap;
    }

    /// @notice Fee that would be accrued right now, in assets.
    function pendingFeeAssets() public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0 || performanceFeeBps == 0) return 0;
        uint256 pps = pricePerShare();
        if (pps <= highWaterMarkPps) return 0;
        uint256 gainAssets = (pps - highWaterMarkPps).mulDiv(supply, PPS_SCALE * SHARES_PER_ASSET);
        return (gainAssets * performanceFeeBps) / BPS;
    }

    // =====================================================================
    // ERC-4626 overrides
    // =====================================================================

    function maxDeposit(address) public view override returns (uint256) {
        if (paused()) return 0;
        uint256 ta = totalAssets();
        return ta >= depositCap ? 0 : depositCap - ta;
    }

    function maxMint(address receiver) public view override returns (uint256) {
        uint256 md = maxDeposit(receiver);
        return md == 0 ? 0 : _convertToShares(md, Math.Rounding.Floor);
    }

    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        _accrueFee();
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver) public override nonReentrant whenNotPaused returns (uint256) {
        _accrueFee();
        return super.mint(shares, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner_)
        public
        override
        nonReentrant
        returns (uint256)
    {
        _accrueFee();
        return super.withdraw(assets, receiver, owner_);
    }

    function redeem(uint256 shares, address receiver, address owner_) public override nonReentrant returns (uint256) {
        _accrueFee();
        return super.redeem(shares, receiver, owner_);
    }

    /// @dev Serve from idle; if insufficient, unwind adapters in registry order. No partial fills.
    function _withdraw(address caller, address receiver, address owner_, uint256 assets, uint256 shares)
        internal
        override
    {
        uint256 idle = idleAssets();
        if (idle < assets) {
            uint256 need = assets - idle;
            uint256 len = adapters.length;
            for (uint256 i; i < len && need > 0; ++i) {
                IPoolAdapter a = adapters[i];
                uint256 held = a.totalAssets();
                if (held == 0) continue;
                uint256 ask = need > held ? held : need;
                uint256 got = a.withdraw(ask);
                emit AdapterWithdraw(address(a), ask, got);
                need = got >= need ? 0 : need - got;
            }
            if (need > 0) revert InsufficientLiquidity(assets, assets - need);
        }
        super._withdraw(caller, receiver, owner_, assets, shares);
    }

    // =====================================================================
    // Fee
    // =====================================================================

    /// @notice Mint accrued performance fee (on yield above the high-water mark) to feeRecipient.
    function accrueFee() external nonReentrant {
        _accrueFee();
    }

    function _accrueFee() internal {
        uint256 supply = totalSupply();
        if (supply == 0) {
            highWaterMarkPps = PPS_SCALE;
            return;
        }
        uint256 ta = totalAssets();
        uint256 pps = ta.mulDiv(PPS_SCALE * SHARES_PER_ASSET, supply);
        if (pps <= highWaterMarkPps) return;
        if (performanceFeeBps == 0) {
            highWaterMarkPps = pps;
            return;
        }
        uint256 gainAssets = (pps - highWaterMarkPps).mulDiv(supply, PPS_SCALE * SHARES_PER_ASSET);
        uint256 feeAssets = (gainAssets * performanceFeeBps) / BPS;
        // shares such that feeRecipient's claim equals feeAssets after the mint
        uint256 feeShares = feeAssets == 0 ? 0 : feeAssets.mulDiv(supply, ta - feeAssets);
        if (feeShares == 0) {
            // Fee rounds to zero: still ratchet the mark so this gain is never re-counted
            // against later depositors (that would be a fee on principal).
            highWaterMarkPps = pps;
            return;
        }
        _mint(feeRecipient, feeShares);
        highWaterMarkPps = ta.mulDiv(PPS_SCALE * SHARES_PER_ASSET, supply + feeShares);
        emit FeeAccrued(feeAssets, feeShares, highWaterMarkPps);
    }

    // =====================================================================
    // Rate statistics
    // =====================================================================

    /// @notice Rate used for planning: the smoothed sample once one exists, else the spot rate.
    function effectiveRateBps(IPoolAdapter a) public view returns (uint256) {
        RateStat memory st = rateStat[address(a)];
        return st.lastUpdate == 0 ? _clampRate(a.currentRateBps()) : st.emaRateBps;
    }

    function _clampRate(uint256 rateBps) internal pure returns (uint256) {
        return rateBps > MAX_RATE_BPS ? MAX_RATE_BPS : rateBps;
    }

    /// @notice Sample every adapter's rate into its EMA and mean-absolute-deviation.
    /// Called by `deploy()` / `rebalance()`; keepers can call it on its own to build history.
    function pokeRates() external onlyKeeper {
        _recordRates();
    }

    function _recordRates() internal {
        uint256 alpha = rateEmaAlphaBps;
        uint256 len = adapters.length;
        for (uint256 i; i < len; ++i) {
            address a = address(adapters[i]);
            uint256 spot = _clampRate(adapters[i].currentRateBps());
            RateStat storage st = rateStat[a];
            if (st.lastUpdate == 0) {
                st.emaRateBps = uint64(spot);
                st.emaDevBps = 0;
            } else {
                uint256 prev = st.emaRateBps;
                uint256 dev = spot > prev ? spot - prev : prev - spot;
                st.emaRateBps = uint64((prev * (BPS - alpha) + spot * alpha) / BPS);
                st.emaDevBps = uint64((uint256(st.emaDevBps) * (BPS - alpha) + dev * alpha) / BPS);
            }
            st.lastUpdate = uint32(block.timestamp);
        }
        emit RatesRecorded(block.timestamp);
    }

    // =====================================================================
    // Allocation scoring
    // =====================================================================

    /// @notice Score each adapter on rate, liquidity, utilization and rate volatility.
    /// @dev score = rate x liquidity x (1 - utilization/2) x (1 - min(0.5, dev/rate)), every factor
    /// in bps. A pool paying well but lent out to the last dollar, or whose rate swings, scores
    /// below a steadier one paying slightly less.
    ///
    /// The four factors are multiplied without dividing back down: only the ratio between scores
    /// matters, and dividing at each step would floor a low-rate pool's score to zero and drop it
    /// out of the book entirely. Bounded by MAX_RATE_BPS x BPS^3 (~1e17), so it cannot overflow.
    /// A zero score means the adapter is genuinely unfundable: no rate, no free cash, or no cap.
    function scoreAdapter(uint256 i) public view returns (uint256 score) {
        IPoolAdapter a = adapters[i];
        // An adapter the owner has capped at zero weight is out of the running entirely; giving it
        // a score would let the proportional split hand it weight it is not allowed to hold.
        if (adapterConfig[address(a)].maxWeightBps == 0) return 0;
        uint256 rate = effectiveRateBps(a);
        if (rate == 0) return 0;

        uint256 held = a.totalAssets();
        uint256 liqBps = BPS;
        if (held != 0) {
            uint256 avail = a.availableLiquidity();
            liqBps = avail >= held ? BPS : (avail * BPS) / held;
        }

        uint256 util = a.utilizationBps();
        if (util > BPS) util = BPS;
        uint256 utilBps = BPS - util / 2;

        RateStat memory st = rateStat[address(a)];
        uint256 volPenalty;
        if (st.lastUpdate != 0 && st.emaRateBps != 0) {
            volPenalty = (uint256(st.emaDevBps) * BPS) / st.emaRateBps;
            if (volPenalty > BPS / 2) volPenalty = BPS / 2;
        }
        uint256 volBps = BPS - volPenalty;

        score = rate * liqBps * utilBps * volBps;
    }

    /// @notice Target weights implied by the current scores, capped at each adapter's maxWeightBps
    /// with the overflow redistributed to those with room. Sums to exactly 10_000.
    function computeTargetWeights() public view returns (uint16[] memory weights, uint256[] memory scores) {
        uint256 len = adapters.length;
        weights = new uint16[](len);
        scores = new uint256[](len);
        if (len == 0) return (weights, scores);

        uint256 totalScore;
        uint256 scoredCapSum;
        for (uint256 i; i < len; ++i) {
            scores[i] = scoreAdapter(i);
            if (scores[i] == 0) continue; // an unscored adapter is never funded, so its cap is not capacity
            totalScore += scores[i];
            scoredCapSum += adapterConfig[address(adapters[i])].maxWeightBps;
        }
        if (totalScore == 0) revert NoScore();
        if (scoredCapSum < BPS) revert CapsBelowFull();

        // Proportional split, then push the part that overflows caps onto the uncapped remainder.
        // Each pass fixes at least one adapter, so `len` passes always converge.
        uint256 remainingBps = BPS;
        uint256 remainingScore = totalScore;
        for (uint256 pass; pass < len && remainingBps > 0 && remainingScore > 0; ++pass) {
            bool capped;
            uint256 nextBps = remainingBps;
            uint256 nextScore = remainingScore;
            for (uint256 i; i < len; ++i) {
                if (weights[i] != 0 || scores[i] == 0) continue;
                uint256 want = (scores[i] * remainingBps) / remainingScore;
                uint16 max = adapterConfig[address(adapters[i])].maxWeightBps;
                if (want >= max && max != 0) {
                    weights[i] = max;
                    nextBps -= max;
                    nextScore -= scores[i];
                    capped = true;
                }
            }
            remainingBps = nextBps;
            remainingScore = nextScore;
            if (!capped) break;
        }

        uint256 assigned;
        for (uint256 i; i < len; ++i) {
            if (weights[i] == 0 && scores[i] != 0 && remainingScore != 0) {
                weights[i] = uint16((scores[i] * remainingBps) / remainingScore);
            }
            assigned += weights[i];
        }

        // Integer division leaves at most a few bps unassigned. It goes to adapters that were
        // actually scored, never to one the scorer rejected, and never past a cap.
        if (assigned < BPS) {
            uint256 dust = BPS - assigned;
            for (uint256 i; i < len && dust > 0; ++i) {
                if (scores[i] == 0) continue;
                uint16 max = adapterConfig[address(adapters[i])].maxWeightBps;
                if (weights[i] >= max) continue;
                uint256 room = max - weights[i];
                uint256 add = dust > room ? room : dust;
                weights[i] += uint16(add);
                dust -= add;
            }
            if (dust != 0) revert CapsBelowFull();
        }
    }

    /// @notice Adopt the scored weights as targets. Keeper-callable, but bounded by the
    /// owner-set per-adapter caps, so a compromised keeper cannot concentrate the book.
    function applyScoredWeights() external onlyKeeper returns (uint16[] memory weights) {
        if (!scoringEnabled) revert ScoringDisabled();
        _recordRates();
        uint256[] memory scores;
        (weights, scores) = computeTargetWeights();
        uint256 len = adapters.length;
        uint256 sum;
        for (uint256 i; i < len; ++i) {
            AdapterConfig storage cfg = adapterConfig[address(adapters[i])];
            // Belt and braces: the scoring math already respects the caps, and this makes sure a
            // future change to it can never widen what a keeper is allowed to do.
            if (weights[i] > cfg.maxWeightBps) revert WeightExceedsMax(i, weights[i], cfg.maxWeightBps);
            cfg.targetWeightBps = weights[i];
            sum += weights[i];
        }
        if (len > 0 && sum != BPS) revert WeightsMustSumTo10000();
        totalTargetBps = uint16(sum);
        emit TargetWeightsSet(weights);
        emit ScoredWeightsApplied(weights, scores);
    }

    // =====================================================================
    // Keeper: deploy & rebalance
    // =====================================================================

    /// @notice Push idle above the buffer target into adapters pro-rata to target weights.
    function deploy() external onlyKeeper nonReentrant whenNotPaused {
        if (totalTargetBps != BPS) revert TargetsNotSet();
        uint256 idle = idleAssets();
        uint256 buffer = (totalAssets() * bufferTargetBps) / BPS;
        if (idle <= buffer) revert NothingToDeploy();
        _recordRates();
        uint256 excess = idle - buffer;
        uint256 deployedNow;
        uint256 len = adapters.length;
        for (uint256 i; i < len; ++i) {
            IPoolAdapter a = adapters[i];
            AdapterConfig memory cfg = adapterConfig[address(a)];
            uint256 amt = (excess * cfg.targetWeightBps) / BPS;
            amt = _capForAdapter(a, cfg, amt);
            if (amt == 0) continue;
            _pushToAdapter(a, amt);
            deployedNow += amt;
        }
        if (deployedNow == 0) revert NothingToDeploy();
        emit Deployed(deployedNow);
    }

    /// @dev What a rebalance would do right now, before any state is touched.
    struct Plan {
        uint256 deployed;
        uint256 maxDeviationBps;
        uint256 movedTotal; // assets planned to be pulled from over-weight adapters
        int256 expectedGainAssets; // yield change over `rebalanceHorizon`, before cost
        uint256[] pulls;
        uint256[] pushes;
    }

    function _plan() internal view returns (Plan memory p) {
        uint256 len = adapters.length;
        p.pulls = new uint256[](len);
        p.pushes = new uint256[](len);
        uint256[] memory held = new uint256[](len);
        for (uint256 i; i < len; ++i) {
            held[i] = adapters[i].totalAssets();
            p.deployed += held[i];
        }

        uint256[] memory target = new uint256[](len);
        int256 rateWeighted;
        for (uint256 i; i < len; ++i) {
            IPoolAdapter a = adapters[i];
            uint16 w = adapterConfig[address(a)].targetWeightBps;
            target[i] = (p.deployed * w) / BPS;
            uint256 curBps = p.deployed == 0 ? 0 : (held[i] * BPS) / p.deployed;
            uint256 dev = curBps > w ? curBps - w : w - curBps;
            if (dev > p.maxDeviationBps) p.maxDeviationBps = dev;

            if (held[i] > target[i]) {
                // Never plan to pull more than the venue can actually pay out.
                uint256 ask = held[i] - target[i];
                uint256 avail = a.availableLiquidity();
                if (ask > avail) ask = avail;
                p.pulls[i] = ask;
                p.movedTotal += ask;
                rateWeighted -= int256(ask * effectiveRateBps(a));
            }
        }

        uint256 budget = p.movedTotal;
        for (uint256 i; i < len && budget > 0; ++i) {
            if (held[i] >= target[i]) continue;
            IPoolAdapter a = adapters[i];
            uint256 amt = target[i] - held[i];
            if (amt > budget) amt = budget;
            amt = _capForAdapter(a, adapterConfig[address(a)], amt);
            uint256 room = a.maxDeposit();
            if (amt > room) amt = room;
            if (amt == 0) continue;
            p.pushes[i] = amt;
            budget -= amt;
            rateWeighted += int256(amt * effectiveRateBps(a));
        }

        p.expectedGainAssets = (rateWeighted * int256(rebalanceHorizon)) / int256(BPS * YEAR);
    }

    /// @notice Dry-run of `rebalance()` for keepers: what moves, what it is expected to earn or
    /// give up over the horizon, and whether the cooldown, threshold and economics all clear.
    function previewRebalance()
        external
        view
        returns (
            bool ok,
            uint256 maxDeviationBps,
            uint256 movedTotal,
            int256 netGainAssets,
            int256 minNetGainAssets,
            uint256 readyAt
        )
    {
        Plan memory p = _plan();
        maxDeviationBps = p.maxDeviationBps;
        movedTotal = p.movedTotal;
        netGainAssets = p.expectedGainAssets - int256(rebalanceCostAssets);
        minNetGainAssets = -int256((p.movedTotal * maxRebalanceDragBps) / BPS);
        readyAt = lastRebalance + rebalanceCooldown;
        ok = !paused() && totalTargetBps == BPS && block.timestamp >= readyAt
            && p.maxDeviationBps > rebalanceThresholdBps && p.movedTotal > 0 && netGainAssets >= minNetGainAssets;
    }

    /// @notice Move funds from over-weight to under-weight adapters when the deviation clears the
    /// threshold, the cooldown has elapsed, and the move is worth its cost.
    /// @dev Three gates beyond the deviation: the plan only pulls what venues can actually pay
    /// (no forced partial fills), each unwind must land within `maxSlippageBps` of what was asked,
    /// and total assets must survive the round trip within that same bound.
    function rebalance() external onlyKeeper nonReentrant whenNotPaused {
        if (totalTargetBps != BPS) revert TargetsNotSet();
        uint256 readyAt = lastRebalance + rebalanceCooldown;
        if (block.timestamp < readyAt) revert CooldownActive(readyAt);

        _recordRates();
        Plan memory p = _plan();
        if (p.maxDeviationBps <= rebalanceThresholdBps) {
            revert DeviationBelowThreshold(p.maxDeviationBps, rebalanceThresholdBps);
        }
        if (p.movedTotal == 0) revert NothingToMove();

        // Economics: pay for the gas, or at worst give up no more yield than the drag allowance.
        int256 net = p.expectedGainAssets - int256(rebalanceCostAssets);
        int256 minNet = -int256((p.movedTotal * maxRebalanceDragBps) / BPS);
        if (net < minNet) revert RebalanceNotProfitable(net, minNet);

        uint256 taBefore = totalAssets();
        uint256 len = adapters.length;

        // 1) pull from over-weight, each unwind guarded by min output
        uint256 budget;
        for (uint256 i; i < len; ++i) {
            uint256 ask = p.pulls[i];
            if (ask == 0) continue;
            uint256 got = adapters[i].withdraw(ask);
            emit AdapterWithdraw(address(adapters[i]), ask, got);
            if (got * BPS < ask * (BPS - maxSlippageBps)) revert SlippageExceeded(ask, got);
            budget += got;
        }

        // 2) push to under-weight, bounded by what was actually pulled
        for (uint256 i; i < len && budget > 0; ++i) {
            uint256 amt = p.pushes[i];
            if (amt == 0) continue;
            if (amt > budget) amt = budget;
            IPoolAdapter a = adapters[i];
            amt = _capForAdapter(a, adapterConfig[address(a)], amt);
            if (amt == 0) continue;
            _pushToAdapter(a, amt);
            budget -= amt;
        }

        // 3) the round trip must not have leaked value (anything unplaced simply stays idle)
        uint256 taAfter = totalAssets();
        if (taAfter * BPS < taBefore * (BPS - maxSlippageBps)) revert SlippageExceeded(taBefore, taAfter);

        lastRebalance = block.timestamp;
        emit Rebalanced(p.deployed, p.maxDeviationBps, block.timestamp);
    }

    function _capForAdapter(IPoolAdapter a, AdapterConfig memory cfg, uint256 amt) internal view returns (uint256) {
        uint256 room = a.maxDeposit();
        if (amt > room) amt = room;
        if (cfg.maxAssets == 0) return amt;
        uint256 held = a.totalAssets();
        if (held >= cfg.maxAssets) return 0;
        uint256 capRoom = cfg.maxAssets - held;
        return amt > capRoom ? capRoom : amt;
    }

    function _pushToAdapter(IPoolAdapter a, uint256 amt) internal {
        IERC20(asset()).forceApprove(address(a), amt);
        a.deposit(amt);
        emit AdapterDeposit(address(a), amt);
    }
}
