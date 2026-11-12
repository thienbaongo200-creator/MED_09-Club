-- Non-destructive migration: allow at most one reversal row per original transaction.
-- Run only against the intended MED-09 database after reviewing duplicate history.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM dbo.giao_dich_quy
    WHERE giao_dich_goc_id IS NOT NULL
    GROUP BY giao_dich_goc_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add reversal uniqueness: duplicate reversals already exist';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS UX_giao_dich_quy_giao_dich_goc
    ON dbo.giao_dich_quy(giao_dich_goc_id)
    WHERE giao_dich_goc_id IS NOT NULL;
END $$;
