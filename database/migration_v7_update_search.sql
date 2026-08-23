-- ============================================================
-- DIAMANTA - Migración v7: Actualizar search_garments RPC
-- ============================================================

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
        g.created_at,
        g.updated_at
    FROM garments g
    LEFT JOIN operarias o ON o.id = g.operaria_id
    LEFT JOIN areas a ON a.id = o.area_id
    LEFT JOIN locations l ON l.id = g.location_id
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
    ORDER BY g.updated_at DESC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
