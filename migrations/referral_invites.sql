-- Refer-a-worker / refer-a-participant email invites
CREATE TABLE IF NOT EXISTS referral_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_email TEXT,
  role TEXT NOT NULL CHECK (role IN ('worker', 'participant')),
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_invites_token_idx ON referral_invites (token);
CREATE INDEX IF NOT EXISTS referral_invites_referrer_idx ON referral_invites (referrer_user_id);
