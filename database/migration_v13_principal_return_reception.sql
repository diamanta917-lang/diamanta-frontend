-- ============================================================
-- DIAMANTA v13 - Migración: Devolución Principal -> Recepción
-- ------------------------------------------------------------
-- Problema:
--   Al devolver una prenda desde Revisión Principal, la función
--   return_garment_from_review la dejaba en 'Requiere corrección'
--   directamente, por lo que:
--     - NO aparecía en el módulo "Recepción de Prendas" del área
--       destino (ese módulo solo muestra estado 'Pendiente Recepcion').
--     - Mantenía la operaria del área anterior, impidiendo que la
--       supervisora reasignara la prenda.
-- Cambios:
--   1. return_garment_from_review: la prenda queda 'Pendiente
--      Recepcion' en el área destino, sin operaria asignada y con
--      la observación registrada. La supervisora la recepciona y
--      la reasigna a la misma operaria u otra.
--   2. area_transitions: se registra la devolución con observación.
--   3. Fix de datos: prendas ya devueltas por revisión principal.
-- Idempotente.
-- ============================================================

-- ============================================================
-- 1. RETURN_GARMENT_FROM_REVIEW: devolver a recepción del área
-- ============================================================

CREATE OR REPLACE FUNCTION return_garment_from_review(
    p_garment_id UUID,
    p_supervisor_principal_id UUID,
    p_dest_area_id UUID,
    p_observation TEXT
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

    IF v_garment.is_finished OR v_garment.status = 'Terminado' THEN
        RAISE EXCEPTION 'La prenda ya está terminada y no puede devolverse';
    END IF;

    -- Buscar supervisora activa del área de destino
    SELECT id INTO v_dest_supervisor_id
    FROM profiles
    WHERE area_id = p_dest_area_id
      AND role = 'supervisor'
      AND is_active = true
    ORDER BY full_name
    LIMIT 1;

    -- Registrar la devolución en el historial de transiciones
    INSERT INTO area_transitions (garment_id, from_area_id, to_area_id, from_supervisor_id, to_supervisor_id, action, observation)
    VALUES (
        p_garment_id,
        v_garment.current_area_id,
        p_dest_area_id,
        p_supervisor_principal_id,
        v_dest_supervisor_id,
        'Devolución por Revisión Principal',
        p_observation
    );

    -- Actualizar prenda: queda pendiente de recepción en el área
    -- destino, liberada de la operaria para que la supervisora
    -- la reasigne a la misma operaria u otra
    UPDATE garments
    SET status = 'Pendiente Recepcion',
        current_area_id = p_dest_area_id,
        current_supervisor_id = v_dest_supervisor_id,
        operaria_id = NULL,
        assigned_at = NULL,
        return_count = COALESCE(v_garment.return_count, 0) + 1,
        updated_at = now()
    WHERE id = p_garment_id;

    -- Registrar movimiento con la observación y la operaria anterior
    INSERT INTO movements (
        garment_id, user_id, action, from_status, to_status,
        from_area_id, to_area_id, from_supervisor_id, to_supervisor_id,
        old_operaria_id, observation
    )
    VALUES (
        p_garment_id,
        p_supervisor_principal_id,
        'Revisión Principal — Devuelta con observación',
        v_garment.status,
        'Pendiente Recepcion',
        v_garment.current_area_id,
        p_dest_area_id,
        v_garment.current_supervisor_id,
        v_dest_supervisor_id,
        v_garment.operaria_id,
        p_observation
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. FIX DE DATOS: prendas ya devueltas por revisión principal
--    que siguen en 'Requiere corrección'
-- ============================================================

UPDATE garments g
SET status = 'Pendiente Recepcion',
    operaria_id = NULL,
    assigned_at = NULL,
    updated_at = now()
WHERE g.status = 'Requiere corrección'
  AND EXISTS (
      SELECT 1 FROM movements m
      WHERE m.garment_id = g.id
        AND m.action LIKE 'Revisión Principal — Devuelta%'
  );

-- ============================================================
-- FIN
-- ============================================================