-- 028 — Drop the `kategori` mechanism from doa library.
--
-- The kategori filter and per-row category are no longer used by the
-- application code (store, handler, frontend all stopped reading or
-- writing the column). Physically dropping the column would break the
-- gzipped hadits/doa seed bundle (which still references kategori in its
-- INSERTs), so we keep the column in place and just retire the index that
-- powered the old "filter by kategori" UX.

DROP INDEX IF EXISTS idx_compact_kategori;
