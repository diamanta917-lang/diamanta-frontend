-- ============================================================
-- DIAMANTA v18 - Migración: Validación de supervisor al
-- reasignar prenda por devolución/observación
-- ------------------------------------------------------------
-- Problema:
--   La función reassign_garment_operaria permitía reasignar una
--   prenda a CUALQUIER operaria sin validar que dicha operaria
--   pertenezca al supervisor autenticado. Un supervisor de área
--   podía, vía API, devolver una prenda a una operaria de otra
--   área.
-- Cambios:
--   1. reassign_garment_operaria: usa auth.uid() para validar que
--      el supervisor de área solo reasigne a operarias de su
--      propia área (operarias.supervisor_id = auth.uid()).
--      El admin no tiene restricción.
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION reassign_garment_operaria(
    p_garment_id UUID,
    p_new_operaria_id UUID,
    p_return_reason_id UUID,
    p_observation TEXT
)
RETURNS VOID AS $$
DECLARE
    v_garment RECORD;
    v_old_operaria_id UUID;
    v_new_supervisor_id UUID;
    v_old_supervisor_id UUID;
    v_user_role TEXT;
    v_operaria_supervisor_id UUID;
BEGIN
    SELECT * INTO v_garment FROM garments WHERE id = p_garment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Prenda no encontrada';
    END IF;

    -- Validación de seguridad: el supervisor de área solo puede
    -- reasignar a operarias de su propia área. El admin no tiene
    -- restricción.
    SELECT role INTO v_user_role FROM profiles WHERE id = auth.uid();

    IF v_user_role IS DISTINCT FROM 'admin' THEN
        SELECT supervisor_id INTO v_operaria_supervisor_id
        FROM operarias WHERE id = p_new_operaria_id;

        IF v_operaria_supervisor_id IS NULL OR v_operaria_supervisor_id <> auth.uid() THEN
            RAISE EXCEPTION 'Solo puede devolver prendas a operarias de su propia área';
        END IF;
    END IF;

    v_old_operaria_id := v_garment.operaria_id;

    -- Obtener supervisora de la nueva operaria
    SELECT supervisor_id INTO v_new_supervisor_id FROM operarias WHERE id = p_new_operaria_id;

    -- Obtener supervisora de la operaria anterior
    IF v_old_operaria_id IS NOT NULL THEN
        SELECT supervisor_id INTO v_old_supervisor_id FROM operarias WHERE id = v_old_operaria_id;
    END IF;

    -- Incrementar contador de devoluciones
    PERFORM increment_return_count(p_garment_id);

    -- Actualizar prenda
    UPDATE garments
    SET operaria_id = p_new_operaria_id,
        status = 'Requiere corrección',
        current_supervisor_id = v_new_supervisor_id,
        updated_at = now()
    WHERE id = p_garment_id;

    -- Insertar movimiento
    INSERT INTO movements (
        garment_id, action, from_status, to_status,
        return_reason_id, observation,
        old_operaria_id, new_operaria_id,
        from_supervisor_id, to_supervisor_id
    )
    VALUES (
        p_garment_id,
        'Reasignación a otra operaria',
        v_garment.status,
        'Requiere corrección',
        p_return_reason_id,
        p_observation,
        v_old_operaria_id,
        p_new_operaria_id,
        v_old_supervisor_id,
        v_new_supervisor_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FIN
-- ============================================================
