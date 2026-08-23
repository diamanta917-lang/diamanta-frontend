-- ============================================================
-- DIAMANTA v10 - Migración: Recepción por Control de Calidad
-- ------------------------------------------------------------
-- Cambios:
--   1. Nuevo estado 'Recibido por control de calidad'
--      (la prenda fue escaneada y recepcionada por control de
--       calidad, queda pendiente de revisión)
--   2. Auditoría: mapear el nuevo estado a módulo Control de Calidad
-- Idempotente.
-- ============================================================

-- ============================================================
-- 1. NUEVO ESTADO
-- ============================================================

INSERT INTO garment_statuses (name, description, color) VALUES
    ('Recibido por control de calidad', 'Prenda recibida por control de calidad, pendiente de revisión', 'info')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 2. AUDITORÍA: mapear nuevo estado al módulo Control de Calidad
-- ============================================================

CREATE OR REPLACE FUNCTION auto_audit_on_movement()
RETURNS TRIGGER AS $$
DECLARE
    v_user_email TEXT;
    v_module     TEXT;
BEGIN
    v_module := CASE
        WHEN NEW.to_status = 'En Produccion'           THEN 'Asignacion'
        WHEN NEW.to_status = 'Pendiente Recepcion'     THEN 'Pasar a Área'
        WHEN NEW.to_status = 'Pendiente de revisión'   THEN 'Recepción'
        WHEN NEW.to_status = 'Terminado'               THEN 'Revisión Principal'
        WHEN NEW.to_status = 'Aprobada'                THEN 'Control de Calidad'
        WHEN NEW.to_status = 'Recibido por control de calidad' THEN 'Control de Calidad'
        WHEN NEW.to_status = 'En Control de Calidad'   THEN 'Control de Calidad'
        WHEN NEW.action LIKE 'Control de Calidad%'     THEN 'Control de Calidad'
        WHEN NEW.action LIKE 'Reasignación%'           THEN 'Reasignación'
        WHEN NEW.action LIKE 'Pasar a área%'           THEN 'Pasar a Área'
        WHEN NEW.action LIKE 'Recepción%'              THEN 'Recepción'
        WHEN NEW.action LIKE 'Revisión Principal%'     THEN 'Revisión Principal'
        WHEN NEW.to_status IN ('Almacen','Terminado')  THEN 'Entrega'
        WHEN NEW.to_status = 'Devuelta'                THEN 'Devolucion'
        ELSE 'Movimiento'
    END;

    SELECT COALESCE(p.email, u.email) INTO v_user_email
    FROM auth.users u
    LEFT JOIN profiles p ON p.id = u.id
    WHERE u.id = NEW.user_id
    LIMIT 1;

    INSERT INTO audit_log (user_id, user_email, action, module, record_id, details)
    VALUES (
        NEW.user_id,
        v_user_email,
        COALESCE(NEW.action, 'Cambio de estado'),
        v_module,
        NEW.garment_id::TEXT,
        jsonb_build_object(
            'movement_id',      NEW.id,
            'garment_id',       NEW.garment_id,
            'from_status',      NEW.from_status,
            'to_status',        NEW.to_status,
            'from_area_id',     NEW.from_area_id,
            'to_area_id',       NEW.to_area_id,
            'return_reason_id', NEW.return_reason_id,
            'observation',      NEW.observation,
            'old_operaria_id',  NEW.old_operaria_id,
            'new_operaria_id',  NEW.new_operaria_id
        )
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_audit_on_movement ON movements;
CREATE TRIGGER trg_auto_audit_on_movement
    AFTER INSERT ON movements
    FOR EACH ROW EXECUTE FUNCTION auto_audit_on_movement();

-- ============================================================
-- 3. DASHBOARD: agregar conteo de prendas recibidas por CC
-- ============================================================

CREATE OR REPLACE FUNCTION get_dashboard_metrics()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'en_produccion',        (SELECT COUNT(*) FROM garments WHERE status = 'En Produccion'),
        'en_calidad',           (SELECT COUNT(*) FROM garments WHERE status = 'En Control de Calidad'),
        'almacen',              (SELECT COUNT(*) FROM garments WHERE status = 'Almacen'),
        'terminadas',           (SELECT COUNT(*) FROM garments WHERE status = 'Terminado' OR is_finished = true),
        'devueltas',            (SELECT COUNT(*) FROM garments WHERE status = 'Devuelta'),
        'pendientes',           (SELECT COUNT(*) FROM garments WHERE status = 'Pendiente de revisión'),
        'asignadas',            (SELECT COUNT(*) FROM garments WHERE status = 'Asignada'),
        'aprobadas',            (SELECT COUNT(*) FROM garments WHERE status = 'Aprobada'),
        'recibidas_calidad',    (SELECT COUNT(*) FROM garments WHERE status = 'Recibido por control de calidad'),
        'pendiente_recepcion',  (SELECT COUNT(*) FROM garments WHERE status = 'Pendiente Recepcion'),
        'requiere_correccion',  (SELECT COUNT(*) FROM garments WHERE status = 'Requiere corrección'),
        'total_prendas',        (SELECT COUNT(*) FROM garments),
        'por_supervisor',       (SELECT json_agg(
                                    json_build_object(
                                        'supervisor_id', supervisor_id,
                                        'supervisor_name', supervisor_name,
                                        'area_name', area_name,
                                        'total', total,
                                        'pendientes', pendientes,
                                        'asignadas', asignadas,
                                        'aprobadas', aprobadas,
                                        'requiere_correccion', requiere_correccion,
                                        'en_produccion', en_produccion
                                    )
                                  ) FROM get_supervisor_load()),
        'por_operaria',         (SELECT json_agg(
                                    json_build_object(
                                        'operaria_id', operaria_id,
                                        'operaria_name', operaria_name,
                                        'supervisor_name', supervisor_name,
                                        'area_name', area_name,
                                        'total', total,
                                        'pendientes', pendientes,
                                        'asignadas', asignadas,
                                        'aprobadas', aprobadas,
                                        'requiere_correccion', requiere_correccion,
                                        'en_produccion', en_produccion
                                    )
                                  ) FROM get_operaria_load())
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FIN
-- ============================================================
