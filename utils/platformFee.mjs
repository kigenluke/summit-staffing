/** Summit platform fee: 15% of shift total; worker receives 85%. */
export const PLATFORM_FEE_RATE = 0.15;
export const WORKER_PAYOUT_RATE = 1 - PLATFORM_FEE_RATE;

export function computePlatformFeeBreakdown(amount) {
  const total = Number(amount || 0);
  const platformFee = Number((total * PLATFORM_FEE_RATE).toFixed(2));
  const workerPayout = Number((total - platformFee).toFixed(2));
  return { total, platformFee, commission: platformFee, workerPayout };
}

export function workerPayoutFromTotal(total) {
  return computePlatformFeeBreakdown(total).workerPayout;
}

const platformFeeDefault = {
  PLATFORM_FEE_RATE,
  WORKER_PAYOUT_RATE,
  computePlatformFeeBreakdown,
  workerPayoutFromTotal,
};

export default platformFeeDefault;
