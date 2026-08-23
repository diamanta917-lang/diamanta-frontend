-- ============================================================
-- DIAMANTA v3 - Migración: Control de Calidad
-- Reemplaza los módulos Entregar y Devolucion por Control de Calidad unificado.
-- Ejecutar en SQL Editor de Supabase.
-- ============================================================

-- 1. Actualizar RPC get_dashboard_metrics para incluir almacen y pendientes
CREATE OR REPLACE FUNCTION get_dashboard_metrics()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'en_produccion', (SELECT COUNT(*) FROM garments WHERE status = 'En Produccion'),
        'en_calidad',    (SELECT COUNT(*) FROM garments WHERE status = 'En Control de Calidad'),
        'almacen',       (SELECT COUNT(*) FROM garments WHERE status = 'Almacen'),
        'despachadas',   (SELECT COUNT(*) FROM garments WHERE status = 'Despachada'),
        'devueltas',     (SELECT COUNT(*) FROM garments WHERE status = 'Devuelta'),
        'pendientes',    (SELECT COUNT(*) FROM garments WHERE status = 'Pendiente de revisión'),
        'total_prendas', (SELECT COUNT(*) FROM garments)
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Actualizar trigger auto_audit_on_movement para manejar el nuevo flujo de Control de Calidad
CREATE OR REPLACE FUNCTION auto_audit_on_movement()
RETURNS TRIGGER AS $$
DECLARE
    v_user_email TEXT;
    v_module     TEXT;
    v_action     TEXT;
BEGIN
    v_module := CASE
        WHEN NEW.to_status = 'En Produccion' THEN 'Asignacion'
        WHEN NEW.to_status = 'En Control de Calidad' THEN 'Control de Calidad'
        WHEN NEW.action LIKE 'Control de Calidad%' THEN 'Control de Calidad'
        WHEN NEW.to_status IN ('Almacen','Despachada') THEN 'Entrega'
        WHEN NEW.to_status = 'Devuelta' THEN 'Devolucion'
        ELSE 'Movimiento'
    END;

    v_action := COALESCE(NEW.action, 'Cambio de estado');

    SELECT COALESCE(p.email, u.email) INTO v_user_email
    FROM auth.users u
    LEFT JOIN profiles p ON p.id = u.id
    WHERE u.id = NEW.user_id
    LIMIT 1;

    INSERT INTO audit_log (user_id, user_email, action, module, record_id, details)
    VALUES (
        NEW.user_id,
        v_user_email,
        v_action,
        v_module,
        NEW.garment_id::TEXT,
        jsonb_build_object(
            'movement_id',    NEW.id,
            'garment_id',     NEW.garment_id,
            'from_status',    NEW.from_status,
            'to_status',      NEW.to_status,
            'return_reason_id', NEW.return_reason_id,
            'observation',    NEW.observation
        )
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_audit_on_movement ON movements;
CREATE TRIGGER trg_auto_audit_on_movement
    AFTER INSERT ON movements
    FOR EACH ROW EXECUTE FUNCTION auto_audit_on_movement();


-- 3. Actualizar trigger sync_garment_location para incluir 'En Control de Calidad'
CREATE OR REPLACE FUNCTION sync_garment_location()
RETURNS TRIGGER AS $$
DECLARE
    v_center_name TEXT;
BEGIN
    SELECT name INTO v_center_name FROM production_centers WHERE id = NEW.production_center_id;

    NEW.current_location := CASE
        WHEN NEW.status = 'En Produccion'          THEN 'En Produccion'
        WHEN NEW.status = 'En Control de Calidad'   THEN 'En Control de Calidad'
        WHEN NEW.status = 'Almacen'                 THEN 'Almacen'
        WHEN NEW.status = 'Despachada'              THEN 'Despachada'
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
    BEFORE UPDATE OF status, production_center_id ON garments
    FOR EACH ROW EXECUTE FUNCTION sync_garment_location();
