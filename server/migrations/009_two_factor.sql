-- 2-step sign-in (authenticator app codes) for staff accounts.
-- totp_secret is encrypted with a key derived from JWT_SECRET; recovery codes are stored hashed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery TEXT[];
