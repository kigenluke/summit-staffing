/**
 * Determines payment pipeline from participant funding metadata.
 * Private pay → card authorize/hold + capture on timesheet approval.
 * Funded (NDIS / home care) → plan-managed invoice + EFT reconciliation.
 */

const PRIVATE_FUNDING_TYPES = new Set(['private']);

const FUNDED_FUNDING_TYPES = new Set(['ndis', 'support_at_home', 'waiting', 'other']);

const getPaymentPipeline = (participant) => {
  const ft = String(participant?.funding_type || '').trim().toLowerCase();
  if (PRIVATE_FUNDING_TYPES.has(ft)) return 'private_pay';
  if (FUNDED_FUNDING_TYPES.has(ft)) return 'funded';
  // Default: treat unknown as funded (NDIS caps + invoicing) unless explicitly private
  return ft ? 'funded' : 'funded';
};

const isPrivatePay = (participant) => getPaymentPipeline(participant) === 'private_pay';

const isFundedAccount = (participant) => getPaymentPipeline(participant) === 'funded';

const requiresPlanManagerDetails = (participant) => {
  if (!isFundedAccount(participant)) return false;
  const mgmt = String(participant?.management_type || '').toLowerCase();
  return mgmt === 'plan_managed' || mgmt === 'ndia';
};

module.exports = {
  PRIVATE_FUNDING_TYPES,
  FUNDED_FUNDING_TYPES,
  getPaymentPipeline,
  isPrivatePay,
  isFundedAccount,
  requiresPlanManagerDetails,
};
