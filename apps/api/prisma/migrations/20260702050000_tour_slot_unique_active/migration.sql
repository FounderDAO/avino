-- Эксклюзивность слота тура (spec 2026-07-02-tour-slot-exclusivity-design):
-- один активный (PENDING/CONFIRMED) запрос на (listing, date, window).
--
-- Guard перед созданием unique-индекса: среди существующих активных заявок
-- на один слот оставить одну — приоритет CONFIRMED (владелец уже выбрал),
-- затем самая ранняя created_at; остальные -> DECLINED.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY listing_id, requested_date, window_start, window_end
           ORDER BY (status = 'CONFIRMED') DESC, created_at ASC, id ASC
         ) AS rn
  FROM tour_requests
  WHERE status IN ('PENDING', 'CONFIRMED')
)
UPDATE tour_requests t
SET status = 'DECLINED', updated_at = NOW()
FROM ranked r
WHERE t.id = r.id AND r.rn > 1;

-- Частичный уникальный индекс: DECLINED/CANCELLED выпадают из условия,
-- то есть DECLINE/CANCEL освобождают слот автоматически.
CREATE UNIQUE INDEX tour_requests_active_slot_key
  ON tour_requests (listing_id, requested_date, window_start, window_end)
  WHERE status IN ('PENDING', 'CONFIRMED');
