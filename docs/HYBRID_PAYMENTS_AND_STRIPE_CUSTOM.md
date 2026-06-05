# Hybrid payments & Stripe Custom Connect (Summit Staffing)

## What is implemented in code

### Pipeline A — Private pay
- At booking: card **pre-authorization** (`paymentPipelineService.createBookingAuthorization`).
- After timesheet **approved** (24h dispute window via cron): **capture** hold, **15%** platform / **85%** worker via `stripe.transfers.create` (separate charge & transfer).
- Participants save cards under **Payment Details → Saved cards** (Stripe Customer + Setup Session).

### Pipeline B — Funded (NDIS plan-managed)
- Rate validator: `utils/ndisParticipantRates.mjs` (min floor + NDIS max cap, midnight splitter).
- On approval: PDF invoice, email to plan manager, unique **EFT reference** (`PLATFORM_EFT_*` env).

### Worker bank (Custom Connect)
- **UI:** Payment Details → BSB + account number (no Stripe dashboard for workers).
- **API:** `POST /api/payments/connect/bank-details`
- **DB:** only `workers.stripe_account_id` (`acct_…`) — never raw BSB/account in PostgreSQL.
- **Stripe:** `createCustomWorkerAccount` + `attachAustralianBankAccount` in `services/stripeService.js`.

## Stripe confirmation (Summit platform)

Stripe confirmed platform `acct_1TYQb7PSsh0SXGiX` (Australia) can create **Custom** connected accounts immediately via API — no separate “enable Custom” step.

Minimum API parameters (already used in `createCustomWorkerAccount`):

- `type: custom`
- `country: AU`
- `capabilities: { transfers: { requested: true } }`

Workers have **no Stripe dashboard**; BSB/account are collected in-app and sent via `attachAustralianBankAccount`.

### Platform compliance (your responsibility)

- Terms of service must reference Stripe’s Connected Account Agreement
- Collect verification info when Stripe requests it (DOB, address, ID) via API
- Fraud vetting on workers before payout
- Review onboarding requirements at least every 6 months

## Railway configuration

```env
STRIPE_CONNECT_MODE=custom
STRIPE_SECRET_KEY=sk_live_...   # or sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=https://your-api.up.railway.app
PLATFORM_EFT_BSB=...
PLATFORM_EFT_ACCOUNT=...
PLATFORM_EFT_ACCOUNT_NAME=Summit Staffing Pty Ltd
ENABLE_TIMESHEET_CRON=true
INVOICE_PAYMENT_TERMS_DAYS=14
```

Redeploy after changing variables.

## Stripe Dashboard note

Your Connect **platform profile** may still show Express from an earlier setup. Stripe Support confirmed Custom API creation works for this account regardless — use in-app BSB flow, not Express onboarding.

## Testing worker BSB

1. Worker → **Payment Details**.
2. Enter holder name, BSB (6 digits), account number → **Save bank account**.
3. `GET /api/payments/connect/status` should show `bank_account.last4` and `connect_mode: "custom"`.

## Testing private pay

1. Participant → save card in Payment Details.
2. Book worker (private funding) → confirm authorization.
3. Complete shift → submit timesheet → wait approval (or dispute within 24h).
4. Verify capture + transfer in Stripe Dashboard → Payments / Connect transfers.
