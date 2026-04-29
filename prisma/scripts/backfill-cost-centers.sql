-- =============================================================================
-- One-off backfill: assign cost_center_id to existing journal_lines.
-- =============================================================================
--
-- Why this exists:
--   We added the `CostCenter` analytical dimension after the ledger had
--   already accumulated entries (98 lines on the production DB at the time
--   of writing). New entries are auto-tagged by `postEntry()` and
--   `postReservationEntries()`, but historical lines stay NULL. This
--   script tags them deterministically so the cost-center reports are
--   meaningful out of the gate.
--
-- Safety properties:
--   * Idempotent — only touches rows where `cost_center_id IS NULL`.
--   * Wrapped in a transaction; abort with `ROLLBACK;` to discard.
--   * Limited to revenue + expense accounts (asset/liability/equity stay
--     untouched — they don't need a cost dimension).
--   * Soft-resolves CC codes via lookup; missing rows in `cost_centers`
--     are silently skipped, so this can run before or after
--     `db:seed-cost-centers`.
--
-- Mapping rules (decided with the property operator):
--   Revenue 4010 (reservation/extension) → derived from unit_type.category:
--     studio     → CC-220  إيراد الاستوديوهات
--     apartment  → CC-230  إيراد الشقق
--     hotel_room → CC-210  إيراد الغرف الفندقية
--     suite      → CC-210  (treated as hotel-grade)
--     fallback   → CC-290  إيرادات إضافية
--   Revenue 4010 (reversal of a reservation entry) → same rule, but the
--     unit-type lookup is done on the *original* entry's reservation.
--   Revenue 4020 (other / manual)                   → CC-290
--   Expense 5010 الرواتب والأجور                     → CC-120 الاستقبال
--                                                      (per operator: all
--                                                      historical payroll
--                                                      is for reception
--                                                      staff)
--   Expense 5020 كهرباء وماء وإنترنت                 → CC-160 المرافق المشتركة
--   Expense 5030 الصيانة                             → CC-140 الصيانة
--   Expense 5040 الضيافة                             → CC-120 الاستقبال
--   Expense 5050 مصروفات متنوعة                      → CC-110 الإدارة العامة
--   Expense 5060 تسويق وإعلانات                      → CC-150 التسويق والمبيعات
--   Expense 5070 أتعاب مهنية ورسوم حكومية            → CC-110 الإدارة العامة
--   Expense 5080 خدمات تقنية واشتراكات               → CC-110 الإدارة العامة
-- =============================================================================

BEGIN;

-- Snapshot the BEFORE state into a temp table for the audit report.
CREATE TEMP TABLE _cc_backfill_before AS
SELECT
  COUNT(*) FILTER (WHERE jl.cost_center_id IS NULL)     AS untagged,
  COUNT(*) FILTER (WHERE jl.cost_center_id IS NOT NULL) AS already_tagged,
  COUNT(*)                                              AS total_revenue_expense
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
JOIN accounts a ON a.id = jl.account_id
WHERE a.type IN ('revenue', 'expense');

-- Build a single CTE that resolves the target CC code per line, then
-- joins to cost_centers to translate to the FK id.
WITH proposal AS (
  SELECT
    jl.id AS line_id,
    CASE
      -- Reservation/extension revenue → unit-type category
      WHEN a.code = '4010' AND je.source IN ('reservation', 'extension') THEN
        CASE ut.category
          WHEN 'studio'     THEN 'CC-220'
          WHEN 'apartment'  THEN 'CC-230'
          WHEN 'hotel_room' THEN 'CC-210'
          WHEN 'suite'      THEN 'CC-210'
          ELSE 'CC-290'
        END
      -- Reversal of a reservation revenue → same rule on the original
      WHEN a.code = '4010' AND je.source = 'reversal' THEN
        (SELECT
           CASE ut2.category
             WHEN 'studio'     THEN 'CC-220'
             WHEN 'apartment'  THEN 'CC-230'
             WHEN 'hotel_room' THEN 'CC-210'
             WHEN 'suite'      THEN 'CC-210'
             ELSE 'CC-290'
           END
         FROM journal_entries orig
         LEFT JOIN reservations r2  ON r2.id  = orig.source_ref_id
         LEFT JOIN units u2         ON u2.id  = r2.unit_id
         LEFT JOIN unit_types ut2   ON ut2.id = u2.unit_type_id
         WHERE orig.id = je.reversal_of_id)
      WHEN a.code = '4020' THEN 'CC-290'
      WHEN a.code = '5010' THEN 'CC-120'
      WHEN a.code = '5020' THEN 'CC-160'
      WHEN a.code = '5030' THEN 'CC-140'
      WHEN a.code = '5040' THEN 'CC-120'
      WHEN a.code = '5050' THEN 'CC-110'
      WHEN a.code = '5060' THEN 'CC-150'
      WHEN a.code = '5070' THEN 'CC-110'
      WHEN a.code = '5080' THEN 'CC-110'
      ELSE NULL
    END AS proposed_cc_code
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
  JOIN accounts a ON a.id = jl.account_id
  LEFT JOIN reservations r ON r.id = je.source_ref_id
                          AND je.source IN ('reservation', 'extension')
  LEFT JOIN units u ON u.id = r.unit_id
  LEFT JOIN unit_types ut ON ut.id = u.unit_type_id
  WHERE a.type IN ('revenue', 'expense')
    AND jl.cost_center_id IS NULL
)
UPDATE journal_lines jl
SET cost_center_id = cc.id
FROM proposal pr
JOIN cost_centers cc ON cc.code = pr.proposed_cc_code
WHERE jl.id = pr.line_id
  AND jl.cost_center_id IS NULL;  -- defence-in-depth race guard

-- AFTER snapshot for the audit report.
SELECT
  b.untagged       AS untagged_before,
  b.already_tagged AS already_tagged_before,
  b.total_revenue_expense AS total_lines,
  (
    SELECT COUNT(*)
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
    JOIN accounts a ON a.id = jl.account_id
    WHERE a.type IN ('revenue', 'expense')
      AND jl.cost_center_id IS NULL
  ) AS untagged_after
FROM _cc_backfill_before b;

-- Per-CC distribution after the backfill.
SELECT
  cc.code,
  cc.name,
  COUNT(*) AS lines,
  ROUND(SUM(jl.debit)::numeric, 2)  AS debit,
  ROUND(SUM(jl.credit)::numeric, 2) AS credit
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
JOIN accounts a ON a.id = jl.account_id
JOIN cost_centers cc ON cc.id = jl.cost_center_id
WHERE a.type IN ('revenue', 'expense')
GROUP BY cc.code, cc.name
ORDER BY cc.code;

DROP TABLE _cc_backfill_before;

COMMIT;
