-- Usernames: chosen once during account setup, lowercase, unique, never changed.
-- The 001 CHECK (active <=> password set) is replaced by this rule, enforced in code:
-- password_hash is NULL only in password_pending; username is set only in active.
-- DDL commits statement by statement in TiDB, so every step is safe to run twice.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(20) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (username);

-- Appending an ENUM value is a metadata-only change in TiDB.
ALTER TABLE users MODIFY COLUMN status ENUM('password_pending', 'active', 'username_pending') NOT NULL DEFAULT 'password_pending';

-- Demo accounts get their email's local part; everyone else picks a username on next sign-in.
UPDATE users SET username = SUBSTRING_INDEX(email, '@', 1) WHERE is_demo = TRUE AND username IS NULL;

UPDATE users SET status = 'username_pending' WHERE status = 'active' AND is_demo = FALSE AND username IS NULL;
