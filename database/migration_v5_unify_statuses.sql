-- ============================================================
-- DIAMANTA - Migración v5: Unificar estados duplicados
-- ============================================================
-- Elimina el duplicado de "Pendiente de Revision" y "Pendiente de revisión"
-- Renombra "En proceso" a "En produccion"
-- ============================================================

UPDATE garments SET status = 'Pendiente de revisión' WHERE status = 'Pendiente de Revision';
UPDATE garments SET status = 'En produccion' WHERE status = 'En proceso';

UPDATE movements SET from_status = 'Pendiente de revisión' WHERE from_status = 'Pendiente de Revision';
UPDATE movements SET to_status = 'Pendiente de revisión' WHERE to_status = 'Pendiente de Revision';
UPDATE movements SET from_status = 'En produccion' WHERE from_status = 'En proceso';
UPDATE movements SET to_status = 'En produccion' WHERE to_status = 'En proceso';

DELETE FROM garment_statuses WHERE name = 'Pendiente de Revision';
UPDATE garment_statuses SET name = 'En produccion', description = 'Prenda en producción' WHERE name = 'En proceso';
