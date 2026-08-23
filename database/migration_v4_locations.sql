-- ============================================================
-- DIAMANTA - Migración v4: Ubicaciones Físicas de Prendas
-- ============================================================

-- 1. Tabla de ubicaciones físicas (estantes, racks, cajas, módulos, etc.)
CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Agregar location_id a garments
ALTER TABLE garments ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id);

-- 3. Agregar from_location / to_location a movements para rastrear cambios de ubicación
ALTER TABLE movements ADD COLUMN IF NOT EXISTS from_location_id UUID REFERENCES locations(id);
ALTER TABLE movements ADD COLUMN IF NOT EXISTS to_location_id UUID REFERENCES locations(id);

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_garments_location_id ON garments(location_id);
CREATE INDEX IF NOT EXISTS idx_locations_name ON locations(name);

-- 5. Trigger updated_at
CREATE TRIGGER update_locations_updated_at
    BEFORE UPDATE ON locations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 6. RLS policies
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ubicaciones visibles por todos"
    ON locations FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Solo admin puede gestionar ubicaciones"
    ON locations FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    );

CREATE POLICY "Solo admin puede actualizar ubicaciones"
    ON locations FOR UPDATE
    TO authenticated
    USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    );

CREATE POLICY "Solo admin puede eliminar ubicaciones"
    ON locations FOR DELETE
    TO authenticated
    USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    );

-- 7. Datos semilla (áreas de producción)
INSERT INTO locations (name, description) VALUES
    ('Tejido a Máquina', 'Proceso de tejido con máquina'),
    ('Bordado', 'Área de bordado y detallado'),
    ('Tejido a Mano', 'Proceso de tejido manual'),
    ('Acabado', 'Remates, botones, ojales, revisión final'),
    ('Preacabado', 'Procesos previos al acabado final'),
    ('Costura', 'Línea de confección y ensamblaje'),
    ('Vaporizado', 'Área de vaporizado y planchado')
ON CONFLICT (name) DO NOTHING;

-- 8. RPC: conteo de prendas por ubicación física (locations table)
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

-- 9. RPC: conteo de prendas por current_location (flujo de producción)
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
