-- ============================================================
-- DIAMANTA - Migración v6: Fechas de Asignación y Finalización
-- ============================================================

ALTER TABLE garments ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE garments ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_garments_assigned_at ON garments(assigned_at);
CREATE INDEX IF NOT EXISTS idx_garments_finished_at ON garments(finished_at);
