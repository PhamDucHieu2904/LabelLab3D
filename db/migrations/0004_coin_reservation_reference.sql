PRAGMA foreign_keys = ON;

-- Keep the original quote reference on the hold itself. This closes the
-- crash window where the debit committed before ledger_id was linked, so a
-- later expiry sweep can repair the hold without trusting client input.
ALTER TABLE coin_reservations ADD COLUMN reference TEXT NOT NULL DEFAULT '';
