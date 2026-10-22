-- When a password changes (by the user or an admin), every older sign-in stops working.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION users_password_changed() RETURNS trigger AS $$
BEGIN
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN
    NEW.password_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_password_changed_trg ON users;
CREATE TRIGGER users_password_changed_trg BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION users_password_changed();
