-- ============================================================
-- DIAMANTA - Funciones RPC adicionales
-- ============================================================

-- Contar prendas por estado
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

-- Obtener devoluciones por área
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

-- Obtener tendencia mensual
CREATE OR REPLACE FUNCTION get_monthly_trend()
RETURNS TABLE(mes TEXT, despachadas BIGINT, devueltas BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        TO_CHAR(m.created_at, 'YYYY-MM') AS mes,
        COUNT(*) FILTER (WHERE m.to_status = 'Despachada')::BIGINT AS despachadas,
        COUNT(*) FILTER (WHERE m.to_status = 'Devuelta')::BIGINT AS devueltas
    FROM movements m
    WHERE m.created_at >= NOW() - INTERVAL '12 months'
    GROUP BY TO_CHAR(m.created_at, 'YYYY-MM')
    ORDER BY mes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Obtener productividad diaria
CREATE OR REPLACE FUNCTION get_daily_productivity(p_days INTEGER DEFAULT 7)
RETURNS TABLE(fecha DATE, revisadas BIGINT, devueltas BIGINT, aprobadas BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.created_at::DATE AS fecha,
        COUNT(*)::BIGINT AS revisadas,
        COUNT(*) FILTER (WHERE m.return_reason_id IS NOT NULL)::BIGINT AS devueltas,
        COUNT(*) FILTER (WHERE m.to_status = 'Despachada')::BIGINT AS aprobadas
    FROM movements m
    WHERE m.created_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY m.created_at::DATE
    ORDER BY fecha DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Obtener resumen de importación
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
