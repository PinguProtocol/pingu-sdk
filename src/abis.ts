// Human-readable ABI format for better readability
// ethers.js supports both formats

export const ERC20_ABI = [
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address recipient, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

export const DATA_STORE_ABI = [
  "function getAddress(string key) view returns (address)",
];

export const ORDERS_ABI = [
  "function submitSimpleOrders(tuple(uint256 orderId, address user, address asset, string market, uint256 margin, uint256 size, uint256 price, uint256 fee, bool isLong, uint8 orderType, bool isReduceOnly, uint256 timestamp, uint256 expiry, uint256 cancelOrderId)[] params, uint256[] orderIdsToCancel) payable",
  "function cancelOrder(uint256 orderId)",
  "function cancelOrders(uint256[] orderIds)",
];

export const ORDER_STORE_ABI = [
  "function getUserOrders(address user) view returns (tuple(uint256 orderId, address user, address asset, string market, uint256 margin, uint256 size, uint256 price, uint256 fee, bool isLong, uint8 orderType, bool isReduceOnly, uint256 timestamp, uint256 expiry, uint256 cancelOrderId)[])",
];

export const POSITIONS_ABI = [
  "function addMargin(address asset, string market, uint256 margin) payable",
  "function removeMargin(address asset, string market, uint256 margin, bytes[] priceUpdateData) payable",
];

export const POSITION_STORE_ABI = [
  "function getUserPositions(address user) view returns (tuple(address user, address asset, string market, bool isLong, uint256 size, uint256 margin, int256 fundingTracker, uint256 price, uint256 timestamp)[])",
  "function getOI(address asset, string market) view returns (uint256)",
  "function getOILong(address asset, string market) view returns (uint256)",
  "function getOIShort(address asset, string market) view returns (uint256)",
];

export const MARKET_STORE_ABI = [
  "function getMarketList() view returns (string[])",
  "function get(string _market) view returns (tuple(string name, string category, address chainlinkFeed, uint256 maxLeverage, uint256 maxDeviation, uint256 fee, uint256 liqThreshold, uint256 fundingFactor, uint256 minOrderAge, uint256 pythMaxAge, bytes32 pythFeed, bool allowChainlinkExecution, bool isReduceOnly))",
  "function getMany(string[] _markets) view returns (tuple(string name, string category, address chainlinkFeed, uint256 maxLeverage, uint256 maxDeviation, uint256 fee, uint256 liqThreshold, uint256 fundingFactor, uint256 minOrderAge, uint256 pythMaxAge, bytes32 pythFeed, bool allowChainlinkExecution, bool isReduceOnly)[])",
];

export const POOL_ABI = [
  "function deposit(address asset, uint256 amount, uint256 lockupPeriodIndex) payable",
  "function withdraw(address asset, uint256 amount)",
  "function getDepositTaxBps(address asset, uint256 amount, uint256 lockupPeriodIndex) view returns (uint256)",
  "function getWithdrawalTaxBps(address asset, uint256 amount) view returns (uint256)",
  "function getGlobalUPL(address asset) view returns (int256)",
];

export const POOL_STORE_ABI = [
  "function getBalance(address asset) view returns (uint256)",
  "function getBalances(address[] _assets) view returns (uint256[])",
  "function getUserClpBalance(address asset, address account) view returns (uint256)",
  "function getClpSupply(address asset) view returns (uint256)",
  "function getUnlockedClpBalance(address asset, address account) view returns (uint256)",
  "function getLockedClpBalance(address asset, address account) view returns (uint256)",
];

export const RISK_STORE_ABI = [
  "function getMaxOI(string market, address asset) view returns (uint256)",
  "function getMaxPositionSize(string market, address asset) view returns (uint256)",
];

export const FUNDING_STORE_ABI = [
  "function getFundingTracker(address asset, string market) view returns (int256)",
  "function getLastCappedEmaFundingRate(address asset, string market) view returns (int256)",
  "function getLastUpdated(address asset, string market) view returns (uint256)",
];

export const FUNDING_ABI = [
  "function getRealTimeFundingTracker(address asset, string market) view returns (int256)",
  "function getAccruedFunding(address asset, string market, uint256 size, int256 fundingTracker) view returns (int256)",
];
