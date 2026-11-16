-- When the user finished or skipped the guided tour; NULL means it has not been seen yet.
-- Safe to run twice: the runner skips a column that already exists.
ALTER TABLE users ADD COLUMN onboarded_at DATETIME(3) NULL;
