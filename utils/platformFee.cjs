/** Summit platform fee: 15% of shift total; worker receives 85%. (Node CJS) */
const PLATFORM_FEE_RATE = 0.15;
const WORKER_PAYOUT_RATE = 1 - PLATFORM_FEE_RATE;

function computePlatformFeeBreakdown(amount) {
  const total = Number(amount || 0);
  const platformFee = Number((total * PLATFORM_FEE_RATE).toFixed(2));
  const workerPayout = Number((total - platformFee).toFixed(2));
  return { total, platformFee, commission: platformFee, workerPayout };
}

function workerPayoutFromTotal(total) {
  return computePlatformFeeBreakdown(total).workerPayout;
}

module.exports = {
  PLATFORM_FEE_RATE,
  WORKER_PAYOUT_RATE,
  computePlatformFeeBreakdown,
  workerPayoutFromTotal,
};
