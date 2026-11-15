-- A member's own QR Ph text (GCash, Maya or bank), so others can pay them the exact amount.
ALTER TABLE users ADD COLUMN payment_qr VARCHAR(512) NULL;
