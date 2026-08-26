-- ============================================================
-- DIAMANTA v16 - Migración: Textos visibles "Supervisora" -> "Supervisor"
-- ------------------------------------------------------------
-- Actualiza descripciones y etiquetas almacenadas en la BD que
-- se muestran en la interfaz (estados de prenda y cargas).
-- Idempotente. Ejecutar en el SQL Editor de Supabase.
-- ============================================================

UPDATE garment_statuses
SET description = 'Prenda terminada y aprobada por supervisor principal'
WHERE name = 'Terminado';

UPDATE garment_statuses
SET description = 'Prenda aprobada por supervisor, lista para pasar a otra área'
WHERE name = 'Aprobada';

-- ============================================================
-- FIN
-- ============================================================