-- ============================================================
-- MIGRATION v9 — Devolución desde Revisión Principal
-- Permite que la supervisora principal devuelva una prenda
-- con observación al área que elija.
-- ============================================================

-- 9.1 Función RPC: Devolver prenda desde revisión principal
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

    -- Actualizar prenda
    UPDATE garments
    SET status = 'Requiere corrección',
        current_area_id = p_dest_area_id,
        current_supervisor_id = v_dest_supervisor_id,
        updated_at = now()
    WHERE id = p_garment_id;

    -- Registrar movimiento
    INSERT INTO movements (
        garment_id, user_id, action, from_status, to_status,
        from_area_id, to_area_id, from_supervisor_id, to_supervisor_id, observation
    )
    VALUES (
        p_garment_id,
        p_supervisor_principal_id,
        'Revisión Principal — Devuelta con observación',
        v_garment.status,
        'Requiere corrección',
        v_garment.current_area_id,
        p_dest_area_id,
        v_garment.current_supervisor_id,
        v_dest_supervisor_id,
        p_observation
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;