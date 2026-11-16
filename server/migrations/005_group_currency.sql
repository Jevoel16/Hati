-- Each group keeps its amounts in one currency, picked when it is created. No conversion.
-- Safe to run twice: the runner skips a column that already exists, and the ENUM change is the same both times.
ALTER TABLE `groups` ADD COLUMN currency CHAR(3) NOT NULL DEFAULT 'PHP';

-- Appending an ENUM value is a metadata-only change.
ALTER TABLE activity_log MODIFY COLUMN action ENUM(
  'group_created', 'group_renamed', 'member_joined', 'member_left', 'member_removed',
  'role_changed', 'expense_added', 'expense_edited', 'expense_deleted',
  'settlement_added', 'settlement_deleted', 'currency_changed'
) NOT NULL;
