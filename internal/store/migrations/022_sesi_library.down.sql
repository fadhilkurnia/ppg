-- SQLite < 3.35 can't drop columns; we leave them in place. The
-- application will simply ignore the unknown fields after a rollback.
SELECT 1;
