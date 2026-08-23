-- ============================================================
-- DIAMANTA v12 - Migración: Fix flujo de transición de áreas
-- ------------------------------------------------------------
-- Problema:
--   Al pasar una prenda a otra área, transition_garment_to_area
--   actualizaba current_area_id / current_supervisor_id pero NO
--   liberaba la operaria_id. La prenda quedaba "pegada" a la
--   operaria del área anterior y, al llegar al área destino:
--     - No aparecía en "Asignar" -> pestaña "Sin Asignar"
--       (esa consulta exige operaria_id IS NULL).
--     - El escaneo la marcaba como "Prenda de otra área".
--     - La UI mostraba el área de la operaria anterior.
-- Cambios:
--   1. transition_garment_to_area: limpiar operaria_id/assigned_at
--   2. reception_garment: limpiar operaria_id/assigned_at
--   3. Fix de datos: liberar operaria_id de prendas ya enviadas
--   4. sync_garment_location: ubicación para 'Pendiente de revisión'
-- Idempotente.
-- ============================================================

-- ============================================================
-- 1. TRANSITION_GARMENT_TO_AREA: liberar la operaria al enviar
-- ============================================================

CREATE OR REPLACE FUNCTION transition_garment_to_area(
    p_garment_id UUID,
    p_dest_area_id UUID,
    p_supervisor_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_garment RECORD;
    v_dest_supervisor_id UUID;
BEGIN
    SELECT * INTO v_garment FROM garments WHERE id = p_garment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Prenda no encontrada';
    END IF;

    IF v_garment.status NOT IN ('Aprobada', 'Aprobado') THEN
        RAISE EXCEPTION 'La prenda debe estar aprobada para pasar a otra área (estado actual: %)', v_garment.status;
    END IF;

    -- Obtener la supervisora del área destino (la primera activa del área)
    SELECT id INTO v_dest_supervisor_id
    FROM profiles
    WHERE area_id = p_dest_area_id
      AND role = 'supervisor'
      AND is_active = true
    ORDER BY full_name
    LIMIT 1;

    -- Insertar en area_transitions
    INSERT INTO area_transitions (garment_id, from_area_id, to_area_id, from_supervisor_id, to_supervisor_id, action)
    VALUES (
        p_garment_id,
        v_garment.current_area_id,
        p_dest_area_id,
        p_supervisor_id,
        v_dest_supervisor_id,
        'Pasar a área'
    );

    -- Actualizar la prenda: liberar la operaria para que la
    -- supervisora del área destino pueda asignarla a sus operarias
    UPDATE garments
    SET status = 'Pendiente Recepcion',
        current_area_id = p_dest_area_id,
        current_supervisor_id = v_dest_supervisor_id,
        operaria_id = NULL,
        assigned_at = NULL,
        updated_at = now()
    WHERE id = p_garment_id;

    -- Insertar movimiento (registrar la operaria anterior en el historial)
    INSERT INTO movements (garment_id, user_id, action, from_status, to_status, from_area_id, to_area_id, from_supervisor_id, to_supervisor_id, old_operaria_id)
    VALUES (
        p_garment_id,
        p_supervisor_id,
        'Pasar a área',
        v_garment.status,
        'Pendiente Recepcion',
        v_garment.current_area_id,
        p_dest_area_id,
        p_supervisor_id,
        v_dest_supervisor_id,
        v_garment.operaria_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. RECEPTION_GARMENT: liberar la operaria al recepcionar
-- ============================================================

CREATE OR REPLACE FUNCTION reception_garment(
    p_garment_id UUID,
    p_supervisor_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_garment RECORD;
    v_supervisor_area UUID;
BEGIN
    SELECT * INTO v_garment FROM garments WHERE id = p_garment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Prenda no encontrada';
    END IF;

    IF v_garment.status <> 'Pendiente Recepcion' THEN
        RAISE EXCEPTION 'La prenda no está pendiente de recepción (estado actual: %)', v_garment.status;
    END IF;

    -- Validar que la supervisora pertenece al área destino
    SELECT area_id INTO v_supervisor_area FROM profiles WHERE id = p_supervisor_id;

    IF v_garment.current_area_id IS DISTINCT FROM v_supervisor_area THEN
        RAISE EXCEPTION 'La prenda no pertenece a su área';
    END IF;

    -- Actualizar prenda: queda sin operaria, lista para asignación
    UPDATE garments
    SET status = 'Pendiente de revisión',
        current_supervisor_id = p_supervisor_id,
        operaria_id = NULL,
        assigned_at = NULL,
        updated_at = now()
    WHERE id = p_garment_id;

    -- Insertar movimiento
    INSERT INTO movements (garment_id, user_id, action, from_status, to_status, to_area_id, to_supervisor_id, old_operaria_id)
    VALUES (
        p_garment_id,
        p_supervisor_id,
        'Recepción de prenda en área',
        'Pendiente Recepcion',
        'Pendiente de revisión',
        v_garment.current_area_id,
        p_supervisor_id,
        v_garment.operaria_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. FIX DE DATOS: liberar operaria_id de prendas ya enviadas
-- ============================================================

-- Prendas pendientes de recepción en otra área
UPDATE garments
SET operaria_id = NULL,
    assigned_at = NULL,
    updated_at = now()
WHERE status = 'Pendiente Recepcion'
  AND operaria_id IS NOT NULL;

-- Prendas ya recepcionadas ('Pendiente de revisión') cuya operaria
-- pertenece a un área distinta a la actual de la prenda
UPDATE garments g
SET operaria_id = NULL,
    assigned_at = NULL,
    updated_at = now()
FROM operarias o
WHERE g.status IN ('Pendiente de revisión', 'Pendiente de Revision')
  AND g.operaria_id IS NOT NULL
  AND o.id = g.operaria_id
  AND o.area_id IS DISTINCT FROM g.current_area_id;

-- ============================================================
-- 4. SYNC_GARMENT_LOCATION: ubicación en 'Pendiente de revisión'
-- ============================================================

CREATE OR REPLACE FUNCTION sync_garment_location()
RETURNS TRIGGER AS $$
DECLARE
    v_center_name TEXT;
    v_area_name TEXT;
BEGIN
    SELECT name INTO v_center_name FROM production_centers WHERE id = NEW.production_center_id;
    SELECT name INTO v_area_name FROM areas WHERE id = NEW.current_area_id;

    NEW.current_location := CASE
        WHEN NEW.status = 'En Produccion'           THEN 'En Produccion'
        WHEN NEW.status = 'En Control de Calidad'   THEN 'En Control de Calidad'
        WHEN NEW.status = 'Almacen'                 THEN 'Almacen'
        WHEN NEW.status = 'Terminado'              THEN 'Terminado'
        WHEN NEW.status = 'Pendiente de revisión' AND v_area_name IS NOT NULL
            THEN v_area_name
        WHEN NEW.status = 'Pendiente de revisión'   THEN 'Pendiente de revisión'
        WHEN NEW.status = 'Pendiente Recepcion' AND v_area_name IS NOT NULL
            THEN 'Pendiente Recepción - ' || v_area_name
        WHEN NEW.status = 'Pendiente Recepcion'     THEN 'Pendiente Recepción'
        WHEN NEW.status = 'Aprobada'                THEN 'Aprobada'
        WHEN NEW.status = 'Devuelta' AND v_center_name IS NOT NULL
            THEN 'Centro Produccion - ' || v_center_name
        WHEN NEW.status = 'Devuelta'                THEN 'Centro Produccion'
        ELSE NEW.current_location
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_garment_location ON garments;
CREATE TRIGGER trg_sync_garment_location
    BEFORE UPDATE OF status, production_center_id, current_area_id ON garments
    FOR EACH ROW EXECUTE FUNCTION sync_garment_location();

-- ============================================================
-- FIN
-- ============================================================