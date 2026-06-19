const pool = require('../config/database');
const { stripe } = require('../config/stripe');
const { fetchFileBuffer } = require('./fileFetchService');
const {
  completeCustomWorkerAccountProfile,
  getConnectAccountHealth,
  listWorkerBankAccounts,
} = require('./stripeService');

const PHOTO_ID_TYPES = ['passport', 'drivers_license'];

const findWorkerPhotoIdDocument = async (workerId) => {
  const res = await pool.query(
    `SELECT file_url, document_type, status
     FROM worker_documents
     WHERE worker_id = $1
       AND document_type = ANY($2::text[])
       AND file_url IS NOT NULL
       AND file_url <> ''
       AND status IN ('approved', 'pending')
     ORDER BY
       CASE WHEN status = 'approved' THEN 0 ELSE 1 END,
       CASE document_type WHEN 'passport' THEN 0 WHEN 'drivers_license' THEN 1 ELSE 2 END,
       created_at DESC
     LIMIT 1`,
    [workerId, PHOTO_ID_TYPES]
  );
  return res.rowCount > 0 ? res.rows[0] : null;
};

const uploadStripeIdentityFile = async (buffer, filename, contentType) => {
  if (!stripe) throw new Error('Stripe is not configured');
  return stripe.files.create({
    purpose: 'identity_document',
    file: {
      data: buffer,
      name: filename || 'identity.jpg',
      type: contentType || 'application/octet-stream',
    },
  });
};

/**
 * Push approved Passport / Driver's Licence from compliance uploads to Stripe Connect.
 * Also sets personal ID number (TFN) required for AU payouts.
 */
const syncWorkerIdentityToStripe = async (accountId, workerId, personalIdNumber) => {
  const idDigits = String(personalIdNumber || '').replace(/\D/g, '');
  if (idDigits.length < 8 || idDigits.length > 9) {
    return { ok: false, error: 'Personal ID number (TFN) must be 8 or 9 digits.' };
  }

  const doc = await findWorkerPhotoIdDocument(workerId);
  if (!doc) {
    return {
      ok: false,
      error:
        'Upload your Passport or Driver\'s Licence in Profile → Compliance documents first, then complete payout setup here.',
      code: 'photo_id_missing',
    };
  }

  const { buffer, contentType, filename } = await fetchFileBuffer(doc.file_url);
  const stripeFile = await uploadStripeIdentityFile(buffer, filename, contentType);

  await stripe.accounts.update(accountId, {
    individual: {
      id_number: idDigits,
      verification: {
        document: {
          front: stripeFile.id,
        },
      },
    },
  });

  return {
    ok: true,
    document_type: doc.document_type,
    document_status: doc.status,
    stripe_file_id: stripeFile.id,
  };
};

/** Full Stripe Connect payout setup after bank + profile data collected in app. */
const completeWorkerStripePayoutSetup = async ({
  accountId,
  worker,
  dob,
  personalIdNumber,
  clientIp,
}) => {
  await completeCustomWorkerAccountProfile(
    accountId,
    {
      email: worker.email,
      firstName: worker.first_name,
      lastName: worker.last_name,
      phone: worker.phone,
      address: worker.address,
      dob,
      idNumber: personalIdNumber,
    },
    clientIp
  );

  const identity = await syncWorkerIdentityToStripe(accountId, worker.id, personalIdNumber);

  const account = await stripe.accounts.retrieve(accountId);
  let bankAccount = null;
  try {
    const banks = await listWorkerBankAccounts(accountId);
    const primary = banks.find((b) => b.default_for_currency) || banks[0];
    if (primary) {
      bankAccount = { last4: primary.last4, account_holder_name: primary.account_holder_name || null };
    }
  } catch (_) {}

  const health = getConnectAccountHealth(account, bankAccount);
  return { identity, health, account };
};

module.exports = {
  findWorkerPhotoIdDocument,
  syncWorkerIdentityToStripe,
  completeWorkerStripePayoutSetup,
};
