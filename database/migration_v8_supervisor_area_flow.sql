-- ============================================================
-- DIAMANTA v8 - Migración: Flujo Multi-Área con Supervisoras
-- ------------------------------------------------------------
-- Cambios:
--   1. profiles: area_id + rol supervisora_principal
--   2. operarias: supervisor_id (la supervisora específica)
--   3. garments: current_area_id, current_supervisor_id, first_area_id, is_finished
--   4. movements: from/to area_id, from/to supervisor_id, old/new operaria_id
--   5. Nueva tabla area_transitions
--   6. Renombrar estado 'Despachada' -> 'Terminado'
--   7. Nuevos estados: 'Aprobada', 'Pendiente Recepcion'
--   8. Nuevas RPCs
--   9. Actualizar RPCs existentes
-- Idempotente.
-- ============================================================

-- ============================================================
-- 1. PROFILES: area_id + nuevo rol supervisora_principal
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES areas(id);

-- Ampliar el CHECK de role para incluir supervisora_principal
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'supervisor', 'supervisora_principal'));

-- Índice para buscar supervisoras por área
CREATE INDEX IF NOT EXISTS idx_profiles_area_id ON profiles(area_id);

-- RLS: permitir que supervisoras actualicen su propio area_id no aplica;
-- el admin gestiona area_id. Politica existente ya cubre update.

-- ============================================================
-- 2. OPERARIAS: supervisor_id (asignada por el admin)
-- ============================================================

ALTER TABLE operarias ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_operarias_supervisor_id ON operarias(supervisor_id);

-- ============================================================
-- 3. GARMENTS: area y supervisora actuales, is_finished
-- ============================================================

ALTER TABLE garments ADD COLUMN IF NOT EXISTS current_area_id      UUID REFERENCES areas(id);
ALTER TABLE garments ADD COLUMN IF NOT EXISTS current_supervisor_id UUID REFERENCES profiles(id);
ALTER TABLE garments ADD COLUMN IF NOT EXISTS first_area_id       UUID REFERENCES areas(id);
ALTER TABLE garments ADD COLUMN IF NOT EXISTS is_finished          BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_garments_current_area_id       ON garments(current_area_id);
CREATE INDEX IF NOT EXISTS idx_garments_current_supervisor_id ON garments(current_supervisor_id);
CREATE INDEX IF NOT EXISTS idx_garments_is_finished           ON garments(is_finished);

-- ============================================================
-- 4. MOVEMENTS: tracing de área, supervisora y operaria
-- ============================================================

ALTER TABLE movements ADD COLUMN IF NOT EXISTS from_area_id        UUID REFERENCES areas(id);
ALTER TABLE movements ADD COLUMN IF NOT EXISTS to_area_id          UUID REFERENCES areas(id);
ALTER TABLE movements ADD COLUMN IF NOT EXISTS from_supervisor_id  UUID REFERENCES profiles(id);
ALTER TABLE movements ADD COLUMN IF NOT EXISTS to_supervisor_id    UUID REFERENCES profiles(id);
ALTER TABLE movements ADD COLUMN IF NOT EXISTS old_operaria_id    UUID REFERENCES operarias(id);
ALTER TABLE movements ADD COLUMN IF NOT EXISTS new_operaria_id    UUID REFERENCES operarias(id);

CREATE INDEX IF NOT EXISTS idx_movements_from_area_id ON movements(from_area_id);
CREATE INDEX IF NOT EXISTS idx_movements_to_area_id   ON movements(to_area_id);
CREATE INDEX IF NOT EXISTS idx_movements_to_supervisor_id ON movements(to_supervisor_id);

-- ============================================================
-- 5. TABLA area_transitions (NUEVA)
-- ============================================================

CREATE TABLE IF NOT EXISTS area_transitions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    garment_id         UUID NOT NULL REFERENCES garments(id) ON DELETE CASCADE,
    from_area_id       UUID REFERENCES areas(id),
    to_area_id         UUID NOT NULL REFERENCES areas(id),
    from_supervisor_id UUID REFERENCES profiles(id),
    to_supervisor_id   UUID REFERENCES profiles(id),
    action             TEXT NOT NULL,
    observation        TEXT,
    created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_area_transitions_garment_id ON area_transitions(garment_id);
CREATE INDEX IF NOT EXISTS idx_area_transitions_to_area_id ON area_transitions(to_area_id);
CREATE INDEX IF NOT EXISTS idx_area_transitions_created_at ON area_transitions(created_at DESC);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_area_transitions_updated_at ON area_transitions;
-- (area_transitions no tiene updated_at, solo created_at)

-- RLS
ALTER TABLE area_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "area_transitions_select" ON area_transitions;
CREATE POLICY "area_transitions_select" ON area_transitions
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "area_transitions_insert" ON area_transitions;
CREATE POLICY "area_transitions_insert" ON area_transitions
    FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- 6. RENOMBRAR ESTADO 'Despachada' -> 'Terminado'
-- ============================================================

UPDATE garments SET status = 'Terminado' WHERE status = 'Despachada';
UPDATE movements SET from_status = 'Terminado' WHERE from_status = 'Despachada';
UPDATE movements SET to_status   = 'Terminado' WHERE to_status   = 'Despachada';

UPDATE garment_statuses
SET name = 'Terminado',
    description = 'Prenda terminada y aprobada por supervisora principal',
    color = 'success'
WHERE name = 'Despachada';

-- Eliminar duplicado si 'Despachada' y 'Terminado' coexistian
DELETE FROM garment_statuses WHERE name = 'Despachada';

-- ============================================================
-- 7. NUEVOS ESTADOS
-- ============================================================

INSERT INTO garment_statuses (name, description, color) VALUES
    ('Aprobada',            'Prenda aprobada por supervisora, lista para pasar a otra área', 'success'),
    ('Pendiente Recepcion', 'Prenda enviada a otra área, pendiente de recepción',            'info')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 8. NUEVAS RPCs
-- ============================================================

-- 8.1 Prendas activas de una supervisora
CREATE OR REPLACE FUNCTION get_garments_by_supervisor(p_supervisor_id UUID)
RETURNS TABLE(
    id UUID,
    barcode TEXT,
    reference TEXT,
    product_name TEXT,
    category TEXT,
    status TEXT,
    operaria_id UUID,
    operaria_name TEXT,
    area_id UUID,
    area_name TEXT,
    current_area_id UUID,
    current_area_name TEXT,
    return_count INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        g.id,
        g.barcode,
        g.reference,
        g.product_name,
        g.category,
        g.status,
        o.id,
        o.full_name,
        o.area_id,
        a.name,
        g.current_area_id,
        ca.name,
        g.return_count,
        g.created_at,
        g.updated_at
    FROM garments g
    LEFT JOIN operarias o ON o.id = g.operaria_id
    LEFT JOIN areas a ON a.id = o.area_id
    LEFT JOIN areas ca ON ca.id = g.current_area_id
    WHERE g.current_supervisor_id = p_supervisor_id
      AND g.is_finished = false
    ORDER BY g.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8.2 Prendas activas de una operaria
CREATE OR REPLACE FUNCTION get_garments_by_operaria(p_operaria_id UUID)
RETURNS TABLE(
    id UUID,
    barcode TEXT,
    reference TEXT,
    product_name TEXT,
    category TEXT,
    status TEXT,
    area_id UUID,
    area_name TEXT,
    current_area_id UUID,
    current_area_name TEXT,
    return_count INTEGER,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        g.id,
        g.barcode,
        g.reference,
        g.product_name,
        g.category,
        g.status,
        o.area_id,
        a.name,
        g.current_area_id,
        ca.name,
        g.return_count,
        g.created_at,
        g.updated_at
    FROM garments g
    JOIN operarias o ON o.id = g.operaria_id
    LEFT JOIN areas a ON a.id = o.area_id
    LEFT JOIN areas ca ON ca.id = g.current_area_id
    WHERE g.operaria_id = p_operaria_id
      AND g.is_finished = false
    ORDER BY g.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8.3 Carga de trabajo por supervisora
CREATE OR REPLACE FUNCTION get_supervisor_load()
RETURNS TABLE(
    supervisor_id UUID,
    supervisor_name TEXT,
    area_name TEXT,
    total BIGINT,
    pendientes BIGINT,
    asignadas BIGINT,
    aprobadas BIGINT,
    requiere_correccion BIGINT,
    en_produccion BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.full_name,
        COALESCE(a.name, 'Sin área'),
        COUNT(g.id)::BIGINT,
        COUNT(g.id) FILTER (WHERE g.status = 'Pendiente de revisión')::BIGINT,
        COUNT(g.id) FILTER (WHERE g.status = 'Asignada')::BIGINT,
        COUNT(g.id) FILTER (WHERE g.status = 'Aprobada')::BIGINT,
        COUNT(g.id) FILTER (WHERE g.status = 'Requiere corrección')::BIGINT,
        COUNT(g.id) FILTER (WHERE g.status = 'En produccion' OR g.status = 'En Produccion')::BIGINT
    FROM profiles p
    LEFT JOIN areas a ON a.id = p.area_id
    LEFT JOIN garments g ON g.current_supervisor_id = p.id AND g.is_finished = false
    WHERE p.role = 'supervisor'
      AND p.is_active = true
    GROUP BY p.id, p.full_name, a.name
    ORDER BY p.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8.4 Carga de trabajo por operaria
CREATE OR REPLACE FUNCTION get_operaria_load()
RETURNS TABLE(
    operaria_id UUID,
    operaria_name TEXT,
    supervisor_name TEXT,
    area_name TEXT,
    total BIGINT,
    pendientes BIGINT,
    asignadas BIGINT,
    aprobadas BIGINT,
    requiere_correccion BIGINT,
    en_produccion BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        o.id,
        o.full_name,
        COALESCE(p.full_name, 'Sin supervisora'),
        COALESCE(a.name, 'Sin área'),
        COUNT(g.id)::BIGINT,
        COUNT(g.id) FILTER (WHERE g.status = 'Pendiente de revisión')::BIGINT,
        COUNT(g.id) FILTER (WHERE g.status = 'Asignada')::BIGINT,
        COUNT(g.id) FILTER (WHERE g.status = 'Aprobada')::BIGINT,
        COUNT(g.id) FILTER (WHERE g.status = 'Requiere corrección')::BIGINT,
        COUNT(g.id) FILTER (WHERE g.status = 'En produccion' OR g.status = 'En Produccion')::BIGINT
    FROM operarias o
    LEFT JOIN profiles p ON p.id = o.supervisor_id
    LEFT JOIN areas a ON a.id = o.area_id
    LEFT JOIN garments g ON g.operaria_id = o.id AND g.is_finished = false
    WHERE o.is_active = true
    GROUP BY o.id, o.full_name, p.full_name, a.name
    ORDER BY o.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8.5 Historial completo de una prenda (movements + area_transitions)
CREATE OR REPLACE FUNCTION get_garment_full_history(p_garment_id UUID)
RETURNS TABLE(
    event_date TIMESTAMPTZ,
    action TEXT,
    from_area TEXT,
    to_area TEXT,
    from_supervisor TEXT,
    to_supervisor TEXT,
    old_operaria TEXT,
    new_operaria TEXT,
    from_status TEXT,
    to_status TEXT,
    reason TEXT,
    observation TEXT
) AS $$
BEGIN
    RETURN QUERY
    -- Movimientos
    SELECT
        m.created_at,
        m.action,
        fa.name,
        ta.name,
        fp.full_name,
        tp.full_name,
        oo.full_name,
        no.full_name,
        m.from_status,
        m.to_status,
        rr.name,
        m.observation
    FROM movements m
    LEFT JOIN areas fa ON fa.id = m.from_area_id
    LEFT JOIN areas ta ON ta.id = m.to_area_id
    LEFT JOIN profiles fp ON fp.id = m.from_supervisor_id
    LEFT JOIN profiles tp ON tp.id = m.to_supervisor_id
    LEFT JOIN operarias oo ON oo.id = m.old_operaria_id
    LEFT JOIN operarias no ON no.id = m.new_operaria_id
    LEFT JOIN return_reasons rr ON rr.id = m.return_reason_id
    WHERE m.garment_id = p_garment_id

    UNION ALL

    -- Transiciones de área
    SELECT
        t.created_at,
        t.action,
        fa.name,
        ta.name,
        fp.full_name,
        tp.full_name,
        NULL::TEXT,
        NULL::TEXT,
        NULL::TEXT,
        NULL::TEXT,
        NULL::TEXT,
        t.observation
    FROM area_transitions t
    LEFT JOIN areas fa ON fa.id = t.from_area_id
    LEFT JOIN areas ta ON ta.id = t.to_area_id
    LEFT JOIN profiles fp ON fp.id = t.from_supervisor_id
    LEFT JOIN profiles tp ON tp.id = t.to_supervisor_id
    WHERE t.garment_id = p_garment_id

    ORDER BY event_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8.6 Pasar prenda a otra área
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

    -- Actualizar la prenda
    UPDATE garments
    SET status = 'Pendiente Recepcion',
        current_area_id = p_dest_area_id,
        current_supervisor_id = v_dest_supervisor_id,
        updated_at = now()
    WHERE id = p_garment_id;

    -- Insertar movimiento
    INSERT INTO movements (garment_id, user_id, action, from_status, to_status, from_area_id, to_area_id, from_supervisor_id, to_supervisor_id)
    VALUES (
        p_garment_id,
        p_supervisor_id,
        'Pasar a área',
        v_garment.status,
        'Pendiente Recepcion',
        v_garment.current_area_id,
        p_dest_area_id,
        p_supervisor_id,
        v_dest_supervisor_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8.7 Recepcionar prenda en el área destino
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

    -- Actualizar prenda
    UPDATE garments
    SET status = 'Pendiente de revisión',
        current_supervisor_id = p_supervisor_id,
        updated_at = now()
    WHERE id = p_garment_id;

    -- Insertar movimiento
    INSERT INTO movements (garment_id, user_id, action, from_status, to_status, to_area_id, to_supervisor_id)
    VALUES (
        p_garment_id,
        p_supervisor_id,
        'Recepción de prenda en área',
        'Pendiente Recepcion',
        'Pendiente de revisión',
        v_garment.current_area_id,
        p_supervisor_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8.8 Supervisora principal marca prenda como Terminado
CREATE OR REPLACE FUNCTION finish_garment(
    p_garment_id UUID,
    p_supervisor_principal_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_garment RECORD;
    v_role TEXT;
BEGIN
    SELECT * INTO v_garment FROM garments WHERE id = p_garment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Prenda no encontrada';
    END IF;

    -- Validar rol de supervisora_principal o admin
    SELECT role INTO v_role FROM profiles WHERE id = p_supervisor_principal_id;

    IF v_role IS NULL OR (v_role <> 'supervisora_principal' AND v_role <> 'admin') THEN
        RAISE EXCEPTION 'Solo la supervisora principal o el administrador pueden terminar prendas';
    END IF;

    -- Actualizar prenda
    UPDATE garments
    SET status = 'Terminado',
        is_finished = true,
        finished_at = now(),
        updated_at = now()
    WHERE id = p_garment_id;

    -- Insertar movimiento
    INSERT INTO movements (garment_id, user_id, action, from_status, to_status)
    VALUES (
        p_garment_id,
        p_supervisor_principal_id,
        'Revisión Principal — Terminado',
        v_garment.status,
        'Terminado'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8.9 Reasignar prenda a otra operaria (misma supervisora)
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
BEGIN
    SELECT * INTO v_garment FROM garments WHERE id = p_garment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Prenda no encontrada';
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

-- 8.10 Eliminar usuario completamente (auth.users + profiles por cascade)
-- Limpia todas las FK que referencian al usuario antes de borrarlo
CREATE OR REPLACE FUNCTION delete_user(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_requester_role TEXT;
BEGIN
    SELECT role INTO v_requester_role FROM profiles WHERE id = auth.uid();
    IF v_requester_role IS NULL OR v_requester_role <> 'admin' THEN
        RAISE EXCEPTION 'Solo el administrador puede eliminar usuarios';
    END IF;

    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'No puede eliminar su propia cuenta';
    END IF;

    -- Limpiar todas las FK que referencian al usuario
    UPDATE operarias        SET supervisor_id     = NULL WHERE supervisor_id     = p_user_id;
    UPDATE garments         SET current_supervisor_id = NULL WHERE current_supervisor_id = p_user_id;
    UPDATE garments         SET imported_by      = NULL WHERE imported_by      = p_user_id;
    UPDATE movements        SET user_id           = NULL WHERE user_id           = p_user_id;
    UPDATE movements        SET from_supervisor_id = NULL WHERE from_supervisor_id = p_user_id;
    UPDATE movements        SET to_supervisor_id   = NULL WHERE to_supervisor_id   = p_user_id;
    UPDATE audit_log        SET user_id           = NULL WHERE user_id           = p_user_id;
    UPDATE area_transitions SET from_supervisor_id = NULL WHERE from_supervisor_id = p_user_id;
    UPDATE area_transitions SET to_supervisor_id   = NULL WHERE to_supervisor_id   = p_user_id;

    -- Eliminar de auth.users (cascada automaticamente a profiles por ON DELETE CASCADE)
    DELETE FROM auth.users WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8.11 Ajustar FK constraints para permitir eliminacion
-- garments.operaria_id -> SET NULL al eliminar operaria
ALTER TABLE garments DROP CONSTRAINT IF EXISTS garments_operaria_id_fkey;
ALTER TABLE garments ADD CONSTRAINT garments_operaria_id_fkey
    FOREIGN KEY (operaria_id) REFERENCES operarias(id) ON DELETE SET NULL;

-- garments.current_supervisor_id -> SET NULL al eliminar profile
ALTER TABLE garments DROP CONSTRAINT IF EXISTS garments_current_supervisor_id_fkey;
ALTER TABLE garments ADD CONSTRAINT garments_current_supervisor_id_fkey
    FOREIGN KEY (current_supervisor_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- garments.imported_by -> SET NULL al eliminar auth user
ALTER TABLE garments DROP CONSTRAINT IF EXISTS garments_imported_by_fkey;
ALTER TABLE garments ADD CONSTRAINT garments_imported_by_fkey
    FOREIGN KEY (imported_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- movements.user_id -> SET NULL al eliminar auth user
ALTER TABLE movements DROP CONSTRAINT IF EXISTS movements_user_id_fkey;
ALTER TABLE movements ADD CONSTRAINT movements_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- operarias.supervisor_id -> SET NULL al eliminar profile
ALTER TABLE operarias DROP CONSTRAINT IF EXISTS operarias_supervisor_id_fkey;
ALTER TABLE operarias ADD CONSTRAINT operarias_supervisor_id_fkey
    FOREIGN KEY (supervisor_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- ============================================================
-- 9. ACTUALIZAR RPCs EXISTENTES
-- ============================================================

-- Eliminar funciones cuyo tipo de retorno cambia (no se puede usar CREATE OR REPLACE)
DROP TRIGGER IF EXISTS trg_sync_garment_location ON garments;
DROP TRIGGER IF EXISTS trg_auto_audit_on_movement ON movements;
DROP TRIGGER IF EXISTS trg_prevent_despachada_change ON garments;
DROP FUNCTION IF EXISTS get_dashboard_metrics();
DROP FUNCTION IF EXISTS get_monthly_trend();
DROP FUNCTION IF EXISTS get_daily_productivity(INTEGER);
DROP FUNCTION IF EXISTS search_garments(TEXT);
DROP FUNCTION IF EXISTS sync_garment_location();
DROP FUNCTION IF EXISTS auto_audit_on_movement();
DROP FUNCTION IF EXISTS prevent_despachada_change();

-- 9.1 Dashboard metrics
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

-- 9.2 Tendencia mensual (Despachada -> Terminado)
CREATE OR REPLACE FUNCTION get_monthly_trend()
RETURNS TABLE(mes TEXT, terminadas BIGINT, devueltas BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        TO_CHAR(m.created_at, 'YYYY-MM') AS mes,
        COUNT(*) FILTER (WHERE m.to_status = 'Terminado')::BIGINT AS terminadas,
        COUNT(*) FILTER (WHERE m.to_status = 'Devuelta')::BIGINT AS devueltas
    FROM movements m
    WHERE m.created_at >= NOW() - INTERVAL '12 months'
    GROUP BY TO_CHAR(m.created_at, 'YYYY-MM')
    ORDER BY mes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9.3 Productividad diaria (Despachada -> Terminado)
CREATE OR REPLACE FUNCTION get_daily_productivity(p_days INTEGER DEFAULT 7)
RETURNS TABLE(fecha DATE, revisadas BIGINT, devueltas BIGINT, terminadas BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.created_at::DATE AS fecha,
        COUNT(*)::BIGINT AS revisadas,
        COUNT(*) FILTER (WHERE m.return_reason_id IS NOT NULL)::BIGINT AS devueltas,
        COUNT(*) FILTER (WHERE m.to_status = 'Terminado')::BIGINT AS terminadas
    FROM movements m
    WHERE m.created_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY m.created_at::DATE
    ORDER BY fecha DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9.4 Actualizar search_garments con area y supervisora
DROP FUNCTION IF EXISTS search_garments(text);

CREATE OR REPLACE FUNCTION search_garments(p_search TEXT)
RETURNS TABLE(
    id UUID,
    barcode TEXT,
    reference TEXT,
    product_name TEXT,
    category TEXT,
    origin TEXT,
    status TEXT,
    current_location TEXT,
    return_count INTEGER,
    operaria_name TEXT,
    area_name TEXT,
    location_id UUID,
    location_name TEXT,
    assigned_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    is_finished BOOLEAN,
    current_area_name TEXT,
    current_supervisor_name TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        g.id,
        g.barcode,
        g.reference,
        g.product_name,
        g.category,
        g.origin,
        g.status,
        g.current_location,
        g.return_count,
        o.full_name AS operaria_name,
        a.name AS area_name,
        g.location_id,
        l.name AS location_name,
        g.assigned_at,
        g.finished_at,
        g.is_finished,
        ca.name AS current_area_name,
        p.full_name AS current_supervisor_name,
        g.created_at,
        g.updated_at
    FROM garments g
    LEFT JOIN operarias o ON o.id = g.operaria_id
    LEFT JOIN areas a ON a.id = o.area_id
    LEFT JOIN locations l ON l.id = g.location_id
    LEFT JOIN areas ca ON ca.id = g.current_area_id
    LEFT JOIN profiles p ON p.id = g.current_supervisor_id
    WHERE
        g.barcode ILIKE '%' || p_search || '%'
        OR g.reference ILIKE '%' || p_search || '%'
        OR g.product_name ILIKE '%' || p_search || '%'
        OR g.category ILIKE '%' || p_search || '%'
        OR g.origin ILIKE '%' || p_search || '%'
        OR g.status ILIKE '%' || p_search || '%'
        OR g.current_location ILIKE '%' || p_search || '%'
        OR o.full_name ILIKE '%' || p_search || '%'
        OR a.name ILIKE '%' || p_search || '%'
        OR l.name ILIKE '%' || p_search || '%'
        OR ca.name ILIKE '%' || p_search || '%'
        OR p.full_name ILIKE '%' || p_search || '%'
    ORDER BY g.updated_at DESC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9.5 Actualizar sync_garment_location
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

-- 9.6 Actualizar auto_audit_on_movement
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

-- 9.7 Actualizar prevent_despachada_change (Despachada -> Terminado)
CREATE OR REPLACE FUNCTION prevent_despachada_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'Terminado'
       AND NEW.status = 'Terminado'
       AND (OLD.operaria_id IS DISTINCT FROM NEW.operaria_id
            OR OLD.production_center_id IS DISTINCT FROM NEW.production_center_id
            OR OLD.pc_operaria_id IS DISTINCT FROM NEW.pc_operaria_id) THEN
        RAISE EXCEPTION 'RN-16: Una prenda Terminada no puede ser devuelta ni reasignada (codigo=%)', OLD.barcode;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_despachada_change ON garments;
CREATE TRIGGER trg_prevent_despachada_change
    BEFORE UPDATE ON garments
    FOR EACH ROW EXECUTE FUNCTION prevent_despachada_change();

-- ============================================================
-- 10. ACTUALIZAR TRIGGER handle_new_user
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, email, full_name, role, area_id)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'supervisor'),
        NULLIF(NEW.raw_user_meta_data->>'area_id', '')::UUID
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FIN
-- ============================================================