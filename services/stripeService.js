require('dotenv').config();

const { stripe, webhookSecret } = require('../config/stripe');
const { getWebClientBaseUrl } = require('../utils/clientAppUrl');
const { toStripeConnectAddress } = require('../utils/auAddress');

const getConnectBusinessUrl = () => {
  const fromEnv = process.env.STRIPE_CONNECT_BUSINESS_URL || process.env.WEB_APP_URL;
  if (fromEnv) return String(fromEnv).trim().replace(/\/$/, '');
  return getWebClientBaseUrl();
};

/** NDIS / disability support — Stripe merchant category code for connected worker profiles. */
const CONNECT_MCC = process.env.STRIPE_CONNECT_MCC || '8398';

const formatAuPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return undefined;
  if (digits.startsWith('61')) return `+${digits}`;
  if (digits.startsWith('0')) return `+61${digits.slice(1)}`;
  return `+61${digits}`;
};

const buildIndividualAddress = (addressText) => {
  const { address, error } = toStripeConnectAddress(addressText);
  if (address) return address;
  const line1 = String(addressText || '').trim().slice(0, 200);
  if (!line1) return { line1: 'Unknown', city: 'Sydney', state: 'NSW', postal_code: '2000', country: 'AU' };
  throw new Error(error || 'Invalid address for Stripe payouts.');
};

/**
 * Base URL for Stripe Connect return/refresh redirects.
 * Set APP_URL on Railway to your public API origin, e.g. https://athletic-heart-backend-production.up.railway.app
 */
const resolveAppBaseUrl = () => {
  const trim = (u) => String(u || '').replace(/\/$/, '');
  if (process.env.APP_URL) return trim(process.env.APP_URL);
  const railwayHost = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railwayHost) {
    const h = String(railwayHost).replace(/^https?:\/\//, '').split('/')[0];
    if (h) return `https://${h}`;
  }
  if (process.env.RAILWAY_STATIC_URL) return trim(process.env.RAILWAY_STATIC_URL);
  if (process.env.EXPO_PUBLIC_API_URL) return trim(process.env.EXPO_PUBLIC_API_URL);
  if (process.env.VITE_API_URL) return trim(process.env.VITE_API_URL);
  return 'http://localhost:3000';
};

/** Custom Connect (in-app BSB) is default — worker never signs up for Stripe. Set STRIPE_CONNECT_MODE=express for hosted onboarding. */
const useCustomConnect = () => String(process.env.STRIPE_CONNECT_MODE || 'custom').toLowerCase() !== 'express';

const buildIndividualPayload = ({ email, firstName, lastName, phone, address, dob, idNumber }) => {
  const individual = {
    first_name: String(firstName || '').trim() || 'Worker',
    last_name: String(lastName || '').trim() || 'User',
    email: String(email || '').trim(),
    address: buildIndividualAddress(address),
  };
  const ph = formatAuPhone(phone);
  if (ph) individual.phone = ph;
  if (dob?.day && dob?.month && dob?.year) {
    individual.dob = { day: dob.day, month: dob.month, year: dob.year };
  }
  const idDigits = String(idNumber || '').replace(/\D/g, '');
  if (idDigits.length >= 8 && idDigits.length <= 9) {
    individual.id_number = idDigits;
  }
  return individual;
};

const buildCustomWorkerAccountBase = ({ email, firstName, lastName, tosAcceptanceIp, phone, address, dob }) => ({
  country: 'AU',
  email: String(email || '').trim(),
  business_type: 'individual',
  business_profile: {
    url: getConnectBusinessUrl(),
    mcc: CONNECT_MCC,
    product_description: 'Disability and community support services via Summit Staffing.',
  },
  capabilities: {
    transfers: { requested: true },
  },
  individual: buildIndividualPayload({ email, firstName, lastName, phone, address, dob }),
  // AU platform + AU connected accounts must use `full`, not `recipient` (recipient is cross-border only).
  tos_acceptance: {
    date: Math.floor(Date.now() / 1000),
    ip: tosAcceptanceIp || '127.0.0.1',
    service_agreement: 'full',
  },
  settings: {
    payouts: {
      schedule: { interval: 'daily' },
    },
  },
});

/**
 * Custom Connect worker (no Stripe dashboard). Uses controller properties — do NOT pass `type` with `controller`.
 * @see https://docs.stripe.com/connect/migrate-to-controller-properties
 */
const createCustomWorkerAccount = async ({ email, firstName, lastName, tosAcceptanceIp, phone, address, dob }) => {
  const base = buildCustomWorkerAccountBase({ email, firstName, lastName, tosAcceptanceIp, phone, address, dob });

  try {
    return await stripe.accounts.create({
      ...base,
      controller: {
        stripe_dashboard: { type: 'none' },
        fees: { payer: 'application' },
        losses: { payments: 'application' },
        requirement_collection: 'application',
      },
    });
  } catch (controllerErr) {
    const msg = String(controllerErr?.message || '').toLowerCase();
    if (/mutually exclusive|may not provide the `type`/i.test(msg)) {
      throw controllerErr;
    }
    return stripe.accounts.create({
      type: 'custom',
      ...base,
    });
  }
};

const attachAustralianBankAccount = async (accountId, { accountHolderName, bsb, accountNumber }) => {
  const routing = String(bsb).replace(/\D/g, '');
  const accountNum = String(accountNumber).replace(/\D/g, '');
  const bankPayload = {
    country: 'AU',
    currency: 'aud',
    account_holder_name: accountHolderName,
    routing_number: routing,
    account_number: accountNum,
  };

  try {
    const token = await stripe.tokens.create({ bank_account: bankPayload });
    return stripe.accounts.createExternalAccount(accountId, {
      external_account: token.id,
      default_for_currency: true,
    });
  } catch (_) {
    return stripe.accounts.createExternalAccount(accountId, {
      external_account: {
        object: 'bank_account',
        ...bankPayload,
      },
      default_for_currency: true,
    });
  }
};

/** Replace any existing payout bank on the connected account. */
const replaceWorkerBankAccount = async (accountId, details) => {
  const banks = await listWorkerBankAccounts(accountId);
  for (const bank of banks) {
    await stripe.accounts.deleteExternalAccount(accountId, bank.id);
  }
  return attachAustralianBankAccount(accountId, details);
};

const listWorkerBankAccounts = async (accountId) => {
  const list = await stripe.accounts.listExternalAccounts(accountId, {
    object: 'bank_account',
    limit: 5,
  });
  return list.data || [];
};

/** Fill Stripe Connect requirements for AU custom worker accounts (platform-collected). */
const completeCustomWorkerAccountProfile = async (
  accountId,
  { email, firstName, lastName, phone, address, dob, idNumber },
  clientIp
) => {
  const payload = {
    business_type: 'individual',
    business_profile: {
      url: getConnectBusinessUrl(),
      mcc: CONNECT_MCC,
      product_description: 'Disability and community support services engaged via Summit Staffing.',
    },
    individual: buildIndividualPayload({ email, firstName, lastName, phone, address, dob, idNumber }),
    tos_acceptance: {
      date: Math.floor(Date.now() / 1000),
      ip: clientIp || '127.0.0.1',
      service_agreement: 'full',
    },
  };
  return stripe.accounts.update(accountId, payload);
};

/** Old Express / broken Custom accounts cannot receive transfers — create a fresh Custom account. */
const shouldReplaceConnectAccount = (account) => {
  if (!account) return true;
  if (account.type === 'express' || account.type === 'standard') return true;
  const transfersCap = account.capabilities?.transfers;
  if (transfersCap === 'inactive') return true;
  const pastDue = account.requirements?.past_due || [];
  if (pastDue.includes('tos_acceptance.date') || pastDue.includes('tos_acceptance.ip')) return true;
  return false;
};

const summarizeAccountRequirements = (account) => {
  const req = account?.requirements || {};
  return {
    disabled_reason: req.disabled_reason || null,
    currently_due: req.currently_due || [],
    eventually_due: req.eventually_due || [],
    past_due: req.past_due || [],
    pending_verification: req.pending_verification || [],
  };
};

const getConnectAccountHealth = (account, bankAccount) => {
  const transfersCap = account.capabilities?.transfers;
  const transfersActive = transfersCap === 'active';
  const requirements = summarizeAccountRequirements(account);
  const allReqFields = [
    ...(requirements.currently_due || []),
    ...(requirements.eventually_due || []),
    ...(requirements.past_due || []),
    ...(requirements.pending_verification || []),
  ];
  const needsIdentityVerification = allReqFields.some((field) =>
    /verification\.document|verification\.additional_document|id_number|identity|document/i.test(String(field))
  );
  const hasPastDue = (requirements.past_due || []).length > 0;
  const restricted =
    Boolean(requirements.disabled_reason) ||
    hasPastDue ||
    transfersCap === 'inactive' ||
    (account.payouts_enabled === false && Boolean(bankAccount?.last4));
  const payoutReady = transfersActive && Boolean(bankAccount?.last4) && account.payouts_enabled !== false;
  let accountStatus = 'pending';
  if (restricted) accountStatus = 'restricted';
  else if (payoutReady) accountStatus = 'enabled';

  return {
    transfersActive,
    restricted,
    payoutReady,
    account_status: accountStatus,
    requirements,
    needsIdentityVerification,
  };
};

const createConnectedAccount = async (workerEmail) => {
  const email = String(workerEmail || '').trim();
  if (!email || !email.includes('@')) {
    throw Object.assign(new Error('Worker email is missing or invalid. Update your account email first.'), { code: 'email_invalid' });
  }

  // Some Stripe accounts reject capabilities on create; retry with minimal payload.
  try {
    return await stripe.accounts.create({
      type: 'express',
      country: 'AU',
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
  } catch (err) {
    return stripe.accounts.create({
      type: 'express',
      country: 'AU',
      email,
    });
  }
};

const createAccountLink = async (accountId) => {
  const appUrl = resolveAppBaseUrl();
  const isLocal =
    /localhost|127\.0\.0\.1/i.test(appUrl) || String(appUrl).startsWith('http://');
  if (process.env.NODE_ENV === 'production' && isLocal) {
    throw Object.assign(
      new Error(
        'Set APP_URL on the server to your public https URL (e.g. https://your-app.up.railway.app). Stripe rejects localhost or http return URLs in production.'
      ),
      { code: 'app_url_invalid' }
    );
  }
  const refreshUrl = `${appUrl}/stripe/refresh`;
  const returnUrl = `${appUrl}/stripe/return`;

  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding'
  });
};

/** Hosted Stripe page for ID document + personal ID number (Custom Connect workers). */
const createConnectVerificationLink = async (accountId) => {
  const webAppUrl = getWebClientBaseUrl();
  const refreshUrl = `${webAppUrl}/payments?stripe=verify_refresh`;
  const returnUrl = `${webAppUrl}/payments?stripe=verify_done`;

  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
    collection_options: { fields: 'currently_due' },
  });
};

const createAccountLoginLink = async (accountId) => {
  return stripe.accounts.createLoginLink(accountId);
};

const PLATFORM_FEE_RATE = 0.15;

const createPaymentIntent = async ({ amountCents, currency = 'aud', bookingId, metadata = {} }) => {
  return stripe.paymentIntents.create({
    amount: amountCents,
    currency,
    payment_method_types: ['card', 'au_becs_debit'],
    metadata: {
      bookingId: String(bookingId),
      platform_fee_rate: String(PLATFORM_FEE_RATE),
      ...metadata,
    },
  });
};

/** Private pay: pre-authorize estimated shift total (manual capture). */
const createAuthorizationHold = async ({
  amountCents,
  currency = 'aud',
  bookingId,
  customerId,
  paymentMethodId,
  metadata = {},
}) => {
  return stripe.paymentIntents.create({
    amount: amountCents,
    currency,
    customer: customerId,
    payment_method: paymentMethodId,
    capture_method: 'manual',
    confirm: true,
    off_session: true,
    metadata: {
      bookingId: String(bookingId),
      pipeline: 'private_pay',
      payment_kind: 'authorization_hold',
      ...metadata,
    },
  });
};

const updatePaymentIntentAmount = async (paymentIntentId, amountCents) =>
  stripe.paymentIntents.update(paymentIntentId, { amount: amountCents });

const capturePaymentIntent = async (paymentIntentId, amountToCaptureCents = null) => {
  const params = amountToCaptureCents != null ? { amount_to_capture: amountToCaptureCents } : {};
  return stripe.paymentIntents.capture(paymentIntentId, params);
};

const cancelPaymentIntent = async (paymentIntentId) => stripe.paymentIntents.cancel(paymentIntentId);

const createTransfer = async ({ amountCents, destination, sourceTransaction, metadata = {} }) => {
  const params = {
    amount: amountCents,
    currency: 'aud',
    destination,
    metadata,
  };
  if (sourceTransaction) {
    params.source_transaction = sourceTransaction;
  }
  return stripe.transfers.create(params);
};

const createCheckoutSession = async ({
  amountCents,
  currency = 'aud',
  bookingId,
  workerId,
  participantId,
  successUrl,
  cancelUrl,
}) => {
  return stripe.checkout.sessions.create({
    mode: 'payment',
    locale: 'en-AU',
    success_url: successUrl,
    cancel_url: cancelUrl,
    payment_method_types: ['card', 'au_becs_debit'],
    billing_address_collection: 'auto',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: amountCents,
          product_data: {
            name: `Booking #${bookingId} payment`,
          },
        },
      },
    ],
    metadata: {
      bookingId: String(bookingId),
      workerId: String(workerId),
      participantId: String(participantId),
    },
    payment_intent_data: {
      metadata: {
        bookingId: String(bookingId),
        workerId: String(workerId),
        participantId: String(participantId),
        platform_fee_rate: String(PLATFORM_FEE_RATE),
      },
    },
  });
};

const verifyWebhookSignature = (payloadBuffer, signature) => {
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  }
  return stripe.webhooks.constructEvent(payloadBuffer, signature, webhookSecret);
};

module.exports = {
  stripe,
  resolveAppBaseUrl,
  useCustomConnect,
  PLATFORM_FEE_RATE,
  createCustomWorkerAccount,
  attachAustralianBankAccount,
  replaceWorkerBankAccount,
  listWorkerBankAccounts,
  createConnectedAccount,
  createAccountLink,
  createConnectVerificationLink,
  createAccountLoginLink,
  createPaymentIntent,
  createAuthorizationHold,
  updatePaymentIntentAmount,
  capturePaymentIntent,
  cancelPaymentIntent,
  createCheckoutSession,
  createTransfer,
  verifyWebhookSignature,
  completeCustomWorkerAccountProfile,
  summarizeAccountRequirements,
  getConnectAccountHealth,
  shouldReplaceConnectAccount,
};
