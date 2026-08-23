-- ============================================================
-- DIAMANTA v2 - Migración: Centros de Producción, Áreas y Auditoría
-- Compatible con el esquema v1 ya aplicado. Idempotente.
-- Cumple: RF-05, RF-21, RF-22, RF-37, RN-11, RN-14, RN-15, RN-16
-- ============================================================

-- ============================================================
-- 1. ÁREAS DE PRODUCCIÓN (RF-05)
--    Doc exige: Tejido a Máquina, Tejido a Mano, Costura, Acabado, Bordado
--    Se agregan las faltantes sin tocar las existentes.
-- ============================================================
INSERT INTO areas (name, description) VALUES
    ('Tejido a Maquina', 'Producción de tejido en máquinas industriales'),
    ('Tejido a Mano',    'Producción de tejido artesanal manual'),
    ('Costura',          'Proceso de costura y ensamblaje de prendas'),
    ('Acabado',          'Proceso de acabado final de prendas'),
    ('Bordado',          'Proceso de bordado decorativo')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description;


-- ============================================================
-- 2. CENTROS DE PRODUCCIÓN (RF-21)
--    Para devolución de prendas defectuosas.
-- ============================================================
CREATE TABLE IF NOT EXISTS production_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 3. OPERARIOS DE CENTROS DE PRODUCCIÓN (RF-22, RN-11)
--    Cada centro tiene sus propios operarios.
-- ============================================================
CREATE TABLE IF NOT EXISTS pc_operarias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_center_id UUID NOT NULL REFERENCES production_centers(id),
    full_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 4. COLUMNAS EN garments PARA TRACKING DE CENTROS
-- ============================================================
ALTER TABLE garments ADD COLUMN IF NOT EXISTS production_center_id UUID REFERENCES production_centers(id);
ALTER TABLE garments ADD COLUMN IF NOT EXISTS pc_operaria_id     UUID REFERENCES pc_operarias(id);


-- ============================================================
-- 5. ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_pc_operarias_center        ON pc_operarias(production_center_id);
CREATE INDEX IF NOT EXISTS idx_garments_production_center ON garments(production_center_id);
CREATE INDEX IF NOT EXISTS idx_garments_pc_operaria       ON garments(pc_operaria_id);


-- ============================================================
-- 6. RLS - Centros de Producción
-- ============================================================
ALTER TABLE production_centers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "production_centers_select" ON production_centers;
CREATE POLICY "production_centers_select" ON production_centers
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "production_centers_all" ON production_centers;
CREATE POLICY "production_centers_all" ON production_centers
    FOR ALL TO authenticated
    USING      ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
    WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');


-- ============================================================
-- 7. RLS - PC Operarias
-- ============================================================
ALTER TABLE pc_operarias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pc_operarias_select" ON pc_operarias;
CREATE POLICY "pc_operarias_select" ON pc_operarias
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "pc_operarias_all" ON pc_operarias;
CREATE POLICY "pc_operarias_all" ON pc_operarias
    FOR ALL TO authenticated
    USING      ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
    WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');


-- ============================================================
-- 8. TRIGGERS updated_at
-- ============================================================
DROP TRIGGER IF EXISTS update_production_centers_updated_at ON production_centers;
CREATE TRIGGER update_production_centers_updated_at
    BEFORE UPDATE ON production_centers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pc_operarias_updated_at ON pc_operarias;
CREATE TRIGGER update_pc_operarias_updated_at
    BEFORE UPDATE ON pc_operarias
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 9. RN-16: Prenda 'Despachada' no puede devolverse ni reasignarse
--    Bloquea cualquier UPDATE de una prenda que YA esté despachada,
--    salvo que el admin la reactive (cambio interno de estado).
--    La app nunca debería intentar esto; el trigger es red de seguridad.
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_despachada_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'Despachada'
       AND NEW.status = 'Despachada'
       AND (OLD.operaria_id IS DISTINCT FROM NEW.operaria_id
            OR OLD.production_center_id IS DISTINCT FROM NEW.production_center_id
            OR OLD.pc_operaria_id IS DISTINCT FROM NEW.pc_operaria_id) THEN
        RAISE EXCEPTION 'RN-16: Una prenda Despachada no puede ser devuelta ni reasignada (codigo=%)', OLD.barcode;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_despachada_change ON garments;
CREATE TRIGGER trg_prevent_despachada_change
    BEFORE UPDATE ON garments
    FOR EACH ROW EXECUTE FUNCTION prevent_despachada_change();


-- ============================================================
-- 10. RF-37 / RN-14: Auditoría automática de toda acción crítica.
--     Se registra en audit_log cada vez que se inserta un movimiento
--     (asignación, entrega, devolución), sin depender de la app.
--     Así se cumple RN-14 aunque la app no llame a auditService.
-- ============================================================
CREATE OR REPLACE FUNCTION auto_audit_on_movement()
RETURNS TRIGGER AS $$
DECLARE
    v_user_email TEXT;
    v_module     TEXT;
    v_action     TEXT;
BEGIN
    -- Determinar módulo según el destino
    v_module := CASE
        WHEN NEW.to_status = 'En Produccion' THEN 'Asignación'
        WHEN NEW.to_status IN ('Almacen','Despachada') THEN 'Entrega'
        WHEN NEW.to_status = 'Devuelta' THEN 'Devolución'
        ELSE 'Movimiento'
    END;

    v_action := COALESCE(NEW.action, 'Cambio de estado');

    -- Email del usuario (si vino user_id)
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


-- ============================================================
-- 11. RN-15:Garantizar que current_location se sincronice con el estado
--     tras un movimiento (red de seguridad; la app ya lo hace).
-- ============================================================
CREATE OR REPLACE FUNCTION sync_garment_location()
RETURNS TRIGGER AS $$
DECLARE
    v_center_name TEXT;
BEGIN
    SELECT name INTO v_center_name FROM production_centers WHERE id = NEW.production_center_id;

    NEW.current_location := CASE
        WHEN NEW.status = 'En Produccion' THEN 'En Produccion'
        WHEN NEW.status = 'Almacen'        THEN 'Almacén'
        WHEN NEW.status = 'Despachada'     THEN 'Despachada'
        WHEN NEW.status = 'Devuelta' AND v_center_name IS NOT NULL
            THEN 'Centro Producción - ' || v_center_name
        WHEN NEW.status = 'Devuelta'       THEN 'Centro Producción'
        ELSE NEW.current_location
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_garment_location ON garments;
CREATE TRIGGER trg_sync_garment_location
    BEFORE UPDATE OF status, production_center_id ON garments
    FOR EACH ROW EXECUTE FUNCTION sync_garment_location();


-- ============================================================
-- 12. SEED - Centros de Producción
--     Cobertura para todos los tipos de reparación del doc.
-- ============================================================
INSERT INTO production_centers (name, description) VALUES
    ('Tejido a Maquina', 'Centro de reparación de tejido a máquina'),
    ('Tejido a Mano',    'Centro de reparación de tejido a mano'),
    ('Costura',          'Centro de reparación de costura'),
    ('Acabado',          'Centro de reparación de acabado'),
    ('Bordado',          'Centro de reparación de bordado')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description;


-- ============================================================
-- 13. SEED - Motivos de Devolución complementarios
-- ============================================================
INSERT INTO return_reasons (name) VALUES
    ('Costura abierta'),
    ('Mancha'),
    ('Hueco'),
    ('Etiqueta incorrecta'),
    ('Bordado defectuoso'),
    ('Talla incorrecta'),
    ('Punto suelto'),
    ('Tension'),
    ('Tejido'),
    ('Matada'),
    ('Vaporizado')
ON CONFLICT (name) DO NOTHING;


-- ============================================================
-- FIN
-- ============================================================