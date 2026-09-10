// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
}

/// @notice Minimal lending-pool simulator (stands in for Turret and other venues).
/// Balances accrue interest at a configurable per-second rate via a global index.
/// Interest is paid by minting the mock asset on withdraw (test/dev only).
/// `simulateBorrow` removes cash so that utilization > 0 and withdrawals can be illiquid.
contract MockLendingPool is Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant RAY = 1e18;
    uint256 public constant YEAR = 365 days;
    uint256 public constant BPS = 10_000;

    IERC20 public immutable asset;
    string public name;

    uint256 public ratePerSecond; // RAY-scaled, e.g. 9% APY => 0.09e18 / YEAR
    uint256 public apyBps; // as configured, for exact reporting
    uint256 public index = RAY; // grows with interest
    uint256 public lastAccrual;

    uint256 public totalScaled; // sum of scaled balances
    uint256 public borrowed; // cash lent out; unavailable for withdrawal
    mapping(address => uint256) internal scaled;

    event RateSet(uint256 apyBps, uint256 ratePerSecond);
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 requested, uint256 actual);
    event Borrowed(uint256 amount);
    event Repaid(uint256 amount);

    constructor(IERC20 asset_, string memory name_, uint256 apyBps) Ownable(msg.sender) {
        asset = asset_;
        name = name_;
        lastAccrual = block.timestamp;
        _setRate(apyBps);
    }

    // ---------- owner ----------

    function setRateBps(uint256 apyBps) external onlyOwner {
        _accrue();
        _setRate(apyBps);
    }

    /// @notice Move cash out of the pool to simulate borrowers taking liquidity.
    function simulateBorrow(uint256 amount) external onlyOwner {
        _accrue();
        require(amount <= availableLiquidity(), "pool: insufficient liquidity");
        borrowed += amount;
        _payOut(msg.sender, amount);
        emit Borrowed(amount);
    }

    function repay(uint256 amount) external onlyOwner {
        _accrue();
        require(amount <= borrowed, "pool: over-repay");
        borrowed -= amount;
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit Repaid(amount);
    }

    // ---------- user ----------

    function deposit(uint256 amount) external {
        _accrue();
        require(amount > 0, "pool: zero");
        uint256 s = (amount * RAY + index - 1) / index; // round up in favor of depositor
        scaled[msg.sender] += s;
        totalScaled += s;
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    /// @notice Withdraw up to `amount`; capped by available liquidity. Returns actual.
    function withdraw(uint256 amount) external returns (uint256 actual) {
        _accrue();
        uint256 bal = balanceOf(msg.sender);
        require(amount <= bal, "pool: exceeds balance");
        uint256 avail = availableLiquidity();
        actual = amount > avail ? avail : amount;
        if (actual == 0) return 0;
        uint256 s = (actual * RAY + index - 1) / index; // round up scaled burn
        if (s > scaled[msg.sender]) s = scaled[msg.sender];
        scaled[msg.sender] -= s;
        totalScaled -= s;
        _payOut(msg.sender, actual);
        emit Withdrawn(msg.sender, amount, actual);
    }

    // ---------- views ----------

    function currentIndex() public view returns (uint256) {
        uint256 dt = block.timestamp - lastAccrual;
        if (dt == 0 || ratePerSecond == 0) return index;
        return index + (index * ratePerSecond * dt) / RAY;
    }

    function balanceOf(address user) public view returns (uint256) {
        return (scaled[user] * currentIndex()) / RAY;
    }

    /// @notice Total supplied including accrued interest.
    function totalSupplied() public view returns (uint256) {
        return (totalScaled * currentIndex()) / RAY;
    }

    /// @notice Cash that can leave the pool right now.
    function availableLiquidity() public view returns (uint256) {
        uint256 ts = totalSupplied();
        return ts > borrowed ? ts - borrowed : 0;
    }

    /// @notice borrowed / totalSupplied in bps.
    function utilization() external view returns (uint256) {
        uint256 ts = totalSupplied();
        if (ts == 0) return 0;
        return (borrowed * BPS) / ts;
    }

    function currentRateBps() external view returns (uint256) {
        return apyBps;
    }

    // ---------- internal ----------

    function _setRate(uint256 apyBps_) internal {
        apyBps = apyBps_;
        ratePerSecond = (apyBps_ * RAY) / BPS / YEAR;
        emit RateSet(apyBps_, ratePerSecond);
    }

    function _accrue() internal {
        index = currentIndex();
        lastAccrual = block.timestamp;
    }

    /// @dev Pays `amount`, minting the mock asset for any interest not backed by cash.
    function _payOut(address to, uint256 amount) internal {
        uint256 cash = asset.balanceOf(address(this));
        if (cash < amount) IMintable(address(asset)).mint(address(this), amount - cash);
        asset.safeTransfer(to, amount);
    }
}
