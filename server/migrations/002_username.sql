-- Usernames: chosen once during account setup, lowercase, unique, never changed.
-- Safe to run twice: the runner skips steps that already happened, the updates are guarded.
ALTER TABLE users ADD COLUMN username VARCHAR(20) NULL;

ALTER TABLE users ADD UNIQUE KEY users_username_key (username);

-- Appending an ENUM value is a metadata-only change.
ALTER TABLE users MODIFY COLUMN status ENUM('password_pending', 'active', 'username_pending') NOT NULL DEFAULT 'password_pending';

-- username_pending accounts have a password, so the 001 rule (active <=> password) no longer holds.
ALTER TABLE users DROP CONSTRAINT users_password_matches_status;

-- Demo accounts get their email's local part; everyone else picks a username on next sign-in.
UPDATE users SET username = SUBSTRING_INDEX(email, '@', 1) WHERE is_demo = TRUE AND username IS NULL;

UPDATE users SET status = 'username_pending' WHERE status = 'active' AND is_demo = FALSE AND username IS NULL;

-- Only enforced where CHECK is on; the app keeps the same rules either way.
ALTER TABLE users ADD CONSTRAINT users_password_set CHECK ((status = 'password_pending') = (password_hash IS NULL));

ALTER TABLE users ADD CONSTRAINT users_username_set CHECK ((status = 'active') = (username IS NOT NULL));
