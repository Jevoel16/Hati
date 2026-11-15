-- Several payment QRs per member (GCash, Maya, each bank), so the payer can pick one they have.
-- Safe to run twice: the table is created only once and the copy skips QRs already copied.
CREATE TABLE IF NOT EXISTS payment_qrs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  label VARCHAR(40) NOT NULL,
  payload VARCHAR(512) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY payment_qrs_user_label_key (user_id, label),
  CONSTRAINT payment_qrs_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- The single QR from 003 becomes the member's first method.
INSERT INTO payment_qrs (id, user_id, label, payload, created_at)
SELECT UUID(), u.id, 'QR Ph', u.payment_qr, UTC_TIMESTAMP(3)
FROM users u
WHERE u.payment_qr IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM payment_qrs p WHERE p.user_id = u.id);

ALTER TABLE users DROP COLUMN payment_qr;
