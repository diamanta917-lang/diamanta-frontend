-- ============================================================
-- DIAMANTA - Sistema de Trazabilidad y Control de Flujo
-- Esquema Completo de Base de Datos para Supabase (PostgreSQL)
-- Incluye todas las migraciones v1-v8 consolidadas.
-- Ejecutar en SQL Editor de Supabase para una instalación nueva.
-- ============================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 2. TABLAS DEL SISTEMA
-- ============================================================

-- 2.1 Áreas de Producción
CREATE TABLE areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2.2 Perfiles de Usuario (extiende auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'supervisor', 'supervisora_principal')),
    area_id UUID REFERENCES areas(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2.3 Operarias (trabajadoras de producción)
CREATE TABLE operarias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    area_id UUID NOT NULL REFERENCES areas(id),
    supervisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2.4 Estados de Prenda
CREATE TABLE garment_statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    color TEXT DEFAULT 'secondary',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2.5 Motivos de Devolución
CREATE TABLE return_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2.6 Centros de Producción
CREATE TABLE production_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2.7 Operarios de Centros de Producción
CREATE TABLE pc_operarias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_center_id UUID NOT NULL REFERENCES production_centers(id),
    full_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2.8 Ubicaciones Físicas
CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2.9 Prendas (Garments)
CREATE TABLE garments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barcode TEXT NOT NULL UNIQUE,
    reference TEXT,
    product_name TEXT,
    category TEXT,
    origin TEXT,
    product_id TEXT,
    product_reference TEXT,
    estado_original TEXT,
    categoria_producto TEXT,
    status TEXT NOT NULL DEFAULT 'Pendiente de revisión',
    operaria_id UUID REFERENCES operarias(id) ON DELETE SET NULL,
    current_location TEXT DEFAULT 'Almacén',
    return_count INTEGER DEFAULT 0,
    excel_import_id TEXT,
    imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    production_center_id UUID REFERENCES production_centers(id),
    pc_operaria_id UUID REFERENCES pc_operarias(id),
    location_id UUID REFERENCES locations(id),
    assigned_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    current_area_id UUID REFERENCES areas(id),
    current_supervisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    first_area_id UUID REFERENCES areas(id),
    is_finished BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2.10 Movimientos (Historial)
CREATE TABLE movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    garment_id UUID NOT NULL REFERENCES garments(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    return_reason_id UUID REFERENCES return_reasons(id),
    observation TEXT,
    from_location_id UUID REFERENCES locations(id),
    to_location_id UUID REFERENCES locations(id),
    from_area_id UUID REFERENCES areas(id),
    to_area_id UUID REFERENCES areas(id),
    from_supervisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    to_supervisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    old_operaria_id UUID REFERENCES operarias(id),
    new_operaria_id UUID REFERENCES operarias(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2.11 Transiciones de Área
CREATE TABLE area_transitions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    garment_id         UUID NOT NULL REFERENCES garments(id) ON DELETE CASCADE,
    from_area_id       UUID REFERENCES areas(id),
    to_area_id         UUID NOT NULL REFERENCES areas(id),
    from_supervisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    to_supervisor_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action             TEXT NOT NULL,
    observation        TEXT,
    created_at         TIMESTAMPTZ DEFAULT now()
);

-- 2.12 Auditoría
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    ip_address TEXT,
    record_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. ÍNDICES
-- ============================================================

CREATE INDEX idx_garments_barcode ON garments(barcode);
CREATE INDEX idx_garments_reference ON garments(reference);
CREATE INDEX idx_garments_product_name ON garments(product_name);
CREATE INDEX idx_garments_status ON garments(status);
CREATE INDEX idx_garments_category ON garments(category);
CREATE INDEX idx_garments_origin ON garments(origin);
CREATE INDEX idx_garments_operaria_id ON garments(operaria_id);
CREATE INDEX idx_garments_created_at ON garments(created_at);
CREATE INDEX idx_garments_location_id ON garments(location_id);
CREATE INDEX idx_garments_assigned_at ON garments(assigned_at);
CREATE INDEX idx_garments_finished_at ON garments(finished_at);
CREATE INDEX idx_garments_current_area_id ON garments(current_area_id);
CREATE INDEX idx_garments_current_supervisor_id ON garments(current_supervisor_id);
CREATE INDEX idx_garments_is_finished ON garments(is_finished);
CREATE INDEX idx_garments_production_center ON garments(production_center_id);
CREATE INDEX idx_garments_pc_operaria ON garments(pc_operaria_id);

CREATE INDEX idx_movements_garment_id ON movements(garment_id);
CREATE INDEX idx_movements_user_id ON movements(user_id);
CREATE INDEX idx_movements_created_at ON movements(created_at DESC);
CREATE INDEX idx_movements_to_status ON movements(to_status);
CREATE INDEX idx_movements_from_area_id ON movements(from_area_id);
CREATE INDEX idx_movements_to_area_id ON movements(to_area_id);
CREATE INDEX idx_movements_to_supervisor_id ON movements(to_supervisor_id);

CREATE INDEX idx_operarias_full_name ON operarias(full_name);
CREATE INDEX idx_operarias_area_id ON operarias(area_id);
CREATE INDEX idx_operarias_supervisor_id ON operarias(supervisor_id);

CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_module ON audit_log(module);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_area_id ON profiles(area_id);

CREATE INDEX idx_locations_name ON locations(name);

CREATE INDEX idx_pc_operarias_center ON pc_operarias(production_center_id);

CREATE INDEX idx_area_transitions_garment_id ON area_transitions(garment_id);
CREATE INDEX idx_area_transitions_to_area_id ON area_transitions(to_area_id);
CREATE INDEX idx_area_transitions_created_at ON area_transitions(created_at DESC);

CREATE INDEX idx_garments_fulltext ON garments USING gin(
    to_tsvector('spanish', coalesce(barcode, '') || ' ' ||
                               coalesce(reference, '') || ' ' ||
                               coalesce(product_name, '') || ' ' ||
                               coalesce(category, '') || ' ' ||
                               coalesce(origin, ''))
);

-- ============================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- 4.1 profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles son visibles por usuarios autenticados"
    ON profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Solo admin puede insertar profiles"
    ON profiles FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
        OR id = auth.uid()
    );

CREATE POLICY "Usuarios pueden actualizar su propio profile"
    ON profiles FOR UPDATE TO authenticated
    USING (id = auth.uid() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- 4.2 areas
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Areas visibles por todos los usuarios autenticados"
    ON areas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Solo admin puede gestionar areas"
    ON areas FOR ALL TO authenticated
    USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
    WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- 4.3 operarias
ALTER TABLE operarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operarias visibles por todos los usuarios autenticados"
    ON operarias FOR SELECT TO authenticated USING (true);

CREATE POLICY "Solo admin puede gestionar operarias"
    ON operarias FOR ALL TO authenticated
    USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
    WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- 4.4 garment_statuses
ALTER TABLE garment_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Estados visibles por todos"
    ON garment_statuses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Solo admin puede gestionar estados"
    ON garment_statuses FOR ALL TO authenticated
    USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
    WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- 4.5 return_reasons
ALTER TABLE return_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Motivos visibles por todos"
    ON return_reasons FOR SELECT TO authenticated USING (true);

CREATE POLICY "Solo admin puede gestionar motivos"
    ON return_reasons FOR ALL TO authenticated
    USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
    WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- 4.6 production_centers
ALTER TABLE production_centers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_centers_select" ON production_centers
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "production_centers_all" ON production_centers
    FOR ALL TO authenticated
    USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
    WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- 4.7 pc_operarias
ALTER TABLE pc_operarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pc_operarias_select" ON pc_operarias
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "pc_operarias_all" ON pc_operarias
    FOR ALL TO authenticated
    USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
    WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- 4.8 locations
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ubicaciones visibles por todos"
    ON locations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Solo admin puede gestionar ubicaciones"
    ON locations FOR INSERT TO authenticated
    WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Solo admin puede actualizar ubicaciones"
    ON locations FOR UPDATE TO authenticated
    USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Solo admin puede eliminar ubicaciones"
    ON locations FOR DELETE TO authenticated
    USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- 4.9 garments
ALTER TABLE garments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Prendas visibles por todos los usuarios autenticados"
    ON garments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Solo admin puede insertar prendas"
    ON garments FOR INSERT TO authenticated
    WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin y supervisor pueden actualizar prendas"
    ON garments FOR UPDATE TO authenticated
    USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'supervisor'));

CREATE POLICY "Solo admin puede eliminar prendas"
    ON garments FOR DELETE TO authenticated
    USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- 4.10 movements
ALTER TABLE movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Movimientos visibles por todos"
    ON movements FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuarios autenticados pueden insertar movimientos"
    ON movements FOR INSERT TO authenticated WITH CHECK (true);

-- 4.11 area_transitions
ALTER TABLE area_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "area_transitions_select" ON area_transitions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "area_transitions_insert" ON area_transitions
    FOR INSERT TO authenticated WITH CHECK (true);

-- 4.12 audit_log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auditoria visible solo para admin"
    ON audit_log FOR SELECT TO authenticated
    USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Sistema puede insertar auditoria"
    ON audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- 5. FUNCIONES (RPC)
-- ============================================================

-- 5.1 Incrementar contador de devoluciones
CREATE OR REPLACE FUNCTION increment_return_count(p_garment_id UUID)
RETURNS INTEGER AS $$
DECLARE
    new_count INTEGER;
BEGIN
    UPDATE garments
    SET return_count = return_count + 1,
        updated_at = now()
    WHERE id = p_garment_id
    RETURNING return_count INTO new_count;

    RETURN new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5.2 Registrar auditoría
CREATE OR REPLACE FUNCTION log_audit(
    p_user_id UUID,
    p_user_email TEXT,
    p_action TEXT,
    p_module TEXT,
    p_ip_address TEXT DEFAULT NULL,
    p_record_id TEXT DEFAULT NULL,
    p_details JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    new_id UUID;
BEGIN
    INSERT INTO audit_log (user_id, user_email, action, module, ip_address, record_id, details)
    VALUES (p_user_id, p_user_email, p_action, p_module, p_ip_address, p_record_id, p_details)
    RETURNING id INTO new_id;

    RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5.3 Métricas del dashboard (v8)
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

-- 5.4 Búsqueda global de prendas (v8)
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

-- 5.5 Contar prendas por estado
CREATE OR REPLACE FUNCTION count_garments_by_status()
RETURNS TABLE(status TEXT, count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT g.status, COUNT(*)::BIGINT
    FROM garments g
    GROUP BY g.status
    ORDER BY g.status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5.6 Obtener devoluciones por área
CREATE OR REPLACE FUNCTION get_returns_by_area()
RETURNS TABLE(area_name TEXT, return_count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT a.name, COUNT(*)::BIGINT
    FROM movements m
    JOIN garments g ON g.id = m.garment_id
    JOIN operarias o ON o.id = g.operaria_id
    JOIN areas a ON a.id = o.area_id
    WHERE m.return_reason_id IS NOT NULL
    GROUP BY a.name
    ORDER BY return_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5.7 Tendencia mensual (v8 - Terminado)
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

-- 5.8 Productividad diaria (v8 - Terminado)
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

-- 5.9 Resumen de importación
CREATE OR REPLACE FUNCTION get_import_summary()
RETURNS TABLE(
    import_id TEXT,
    total INTEGER,
    imported INTEGER,
    date TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        g.excel_import_id,
        COUNT(*)::INTEGER,
        COUNT(*)::INTEGER,
        MAX(g.created_at)
    FROM garments g
    WHERE g.excel_import_id IS NOT NULL
    GROUP BY g.excel_import_id
    ORDER BY MAX(g.created_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5.10 Prendas por ubicación física
CREATE OR REPLACE FUNCTION get_garments_by_location()
RETURNS TABLE(location_name TEXT, total BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT COALESCE(l.name, 'Sin ubicación'), COUNT(*)::BIGINT
    FROM garments g
    LEFT JOIN locations l ON l.id = g.location_id
    GROUP BY l.name
    ORDER BY total DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5.11 Prendas por current_location
CREATE OR REPLACE FUNCTION get_garments_by_current_location()
RETURNS TABLE(location_name TEXT, total BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT COALESCE(g.current_location, 'Sin ubicación'), COUNT(*)::BIGINT
    FROM garments g
    GROUP BY g.current_location
    ORDER BY total DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5.12 Prendas activas de una supervisora (v8)
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

-- 5.13 Prendas activas de una operaria (v8)
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

-- 5.14 Carga de trabajo por supervisora (v8)
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

-- 5.15 Carga de trabajo por operaria (v8)
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

-- 5.16 Historial completo de una prenda (v8)
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

-- 5.17 Pasar prenda a otra área (v8)
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

    SELECT id INTO v_dest_supervisor_id
    FROM profiles
    WHERE area_id = p_dest_area_id
      AND role = 'supervisor'
      AND is_active = true
    ORDER BY full_name
    LIMIT 1;

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

-- 5.18 Recepción de prenda en otra área (v8)
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

-- 5.19 Supervisora principal marca prenda como Terminado (v8)
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

    SELECT role INTO v_role FROM profiles WHERE id = p_supervisor_principal_id;

    IF v_role IS NULL OR (v_role <> 'supervisora_principal' AND v_role <> 'admin') THEN
        RAISE EXCEPTION 'Solo la supervisora principal o el administrador pueden terminar prendas';
    END IF;

    UPDATE garments
    SET status = 'Terminado',
        is_finished = true,
        finished_at = now(),
        updated_at = now()
    WHERE id = p_garment_id;

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

-- 5.20 Reasignar prenda a otra operaria (v8)
CREATE OR REPLACE FUNCTION reassign_garment_operaria(
    p_garment_id UUID,
    p_new_operaria_id UUID,
    p_user_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_garment RECORD;
    v_old_operaria_id UUID;
BEGIN
    SELECT * INTO v_garment FROM garments WHERE id = p_garment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Prenda no encontrada';
    END IF;

    v_old_operaria_id := v_garment.operaria_id;

    UPDATE garments
    SET operaria_id = p_new_operaria_id,
        updated_at = now()
    WHERE id = p_garment_id;

    INSERT INTO movements (garment_id, user_id, action, old_operaria_id, new_operaria_id, from_status, to_status)
    VALUES (
        p_garment_id,
        p_user_id,
        'Reasignación de operaria',
        v_old_operaria_id,
        p_new_operaria_id,
        v_garment.status,
        v_garment.status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5.21 Eliminar usuario completamente (v8)
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

    UPDATE operarias        SET supervisor_id         = NULL WHERE supervisor_id         = p_user_id;
    UPDATE garments         SET current_supervisor_id = NULL WHERE current_supervisor_id = p_user_id;
    UPDATE garments         SET imported_by           = NULL WHERE imported_by           = p_user_id;
    UPDATE movements        SET user_id               = NULL WHERE user_id               = p_user_id;
    UPDATE movements        SET from_supervisor_id    = NULL WHERE from_supervisor_id    = p_user_id;
    UPDATE movements        SET to_supervisor_id      = NULL WHERE to_supervisor_id      = p_user_id;
    UPDATE audit_log        SET user_id               = NULL WHERE user_id               = p_user_id;
    UPDATE area_transitions SET from_supervisor_id    = NULL WHERE from_supervisor_id    = p_user_id;
    UPDATE area_transitions SET to_supervisor_id      = NULL WHERE to_supervisor_id      = p_user_id;

    DELETE FROM auth.users WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. TRIGGERS
-- ============================================================

-- 6.1 Crear profile automáticamente al registrarse
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- 6.2 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_areas_updated_at
    BEFORE UPDATE ON areas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_operarias_updated_at
    BEFORE UPDATE ON operarias FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_garments_updated_at
    BEFORE UPDATE ON garments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_production_centers_updated_at
    BEFORE UPDATE ON production_centers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pc_operarias_updated_at
    BEFORE UPDATE ON pc_operarias FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_locations_updated_at
    BEFORE UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6.3 Sincronizar current_location con el estado (v8)
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

CREATE TRIGGER trg_sync_garment_location
    BEFORE UPDATE OF status, production_center_id, current_area_id ON garments
    FOR EACH ROW EXECUTE FUNCTION sync_garment_location();

-- 6.4 Auditoría automática de movimientos (v8)
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

CREATE TRIGGER trg_auto_audit_on_movement
    AFTER INSERT ON movements
    FOR EACH ROW EXECUTE FUNCTION auto_audit_on_movement();

-- 6.5 Prenda Terminada no puede reasignarse (v8)
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

CREATE TRIGGER trg_prevent_despachada_change
    BEFORE UPDATE ON garments
    FOR EACH ROW EXECUTE FUNCTION prevent_despachada_change();

-- ============================================================
-- 7. DATOS INICIALES (SEED)
-- ============================================================

-- 7.1 Áreas de Producción
INSERT INTO areas (name, description) VALUES
    ('Tejido a Maquina', 'Producción de tejido en máquinas industriales'),
    ('Tejido a Mano', 'Producción de tejido artesanal manual'),
    ('Costura', 'Proceso de costura y ensamblaje de prendas'),
    ('Acabado', 'Proceso de acabado final de prendas'),
    ('Bordado', 'Proceso de bordado decorativo'),
    ('Preacabado', 'Proceso de preacabado antes del acabado final'),
    ('Vaporizado', 'Proceso de vaporizado y planchado')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

-- 7.2 Estados de Prenda
INSERT INTO garment_statuses (name, description, color) VALUES
    ('Pendiente de revisión', 'Prenda pendiente de ser revisada', 'warning'),
    ('En Produccion', 'Prenda en proceso de producción', 'info'),
    ('En Control de Calidad', 'Prenda siendo inspeccionada por calidad', 'primary'),
    ('Devuelta', 'Prenda devuelta por defectos', 'danger'),
    ('Almacen', 'Prenda en almacén', 'secondary'),
    ('Terminado', 'Prenda terminada y aprobada por supervisora principal', 'success'),
    ('Aprobada', 'Prenda aprobada por supervisora, lista para pasar a otra área', 'success'),
    ('Pendiente Recepcion', 'Prenda enviada a otra área, pendiente de recepción', 'info')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, color = EXCLUDED.color;

-- 7.3 Motivos de Devolución
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

-- 7.4 Centros de Producción
INSERT INTO production_centers (name, description) VALUES
    ('Tejido a Maquina', 'Centro de reparación de tejido a máquina'),
    ('Tejido a Mano', 'Centro de reparación de tejido a mano'),
    ('Costura', 'Centro de reparación de costura'),
    ('Acabado', 'Centro de reparación de acabado'),
    ('Bordado', 'Centro de reparación de bordado')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

-- 7.5 Ubicaciones Físicas
INSERT INTO locations (name, description) VALUES
    ('Tejido a Máquina', 'Proceso de tejido con máquina'),
    ('Bordado', 'Área de bordado y detallado'),
    ('Tejido a Mano', 'Proceso de tejido manual'),
    ('Acabado', 'Remates, botones, ojales, revisión final'),
    ('Preacabado', 'Procesos previos al acabado final'),
    ('Costura', 'Línea de confección y ensamblaje'),
    ('Vaporizado', 'Área de vaporizado y planchado')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- FIN
-- ============================================================