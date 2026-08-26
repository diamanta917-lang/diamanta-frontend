-- ============================================================
-- DIAMANTA v17 - Migración: Fix delete_user (error 409)
-- ------------------------------------------------------------
-- Problema: al eliminar un usuario sin operarias ni prendas,
-- delete_user devolvía 409 (foreign key violation). El RPC solo
-- limpiaba las tablas de negocio, pero si profiles o auth.identities
-- no tienen ON DELETE CASCADE, el DELETE FROM auth.users queda
-- bloqueado por esas referencias.
--
-- Solución:
--   1. Limpiar todas las FK de negocio (igual que antes).
--   2. Eliminar auth.identities y el perfil EXPLÍCITAMENTE antes
--      de borrar auth.users (funciona con o sin CASCADE).
-- Idempotente. Ejecutar en el SQL Editor de Supabase.
-- ============================================================

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

    -- Limpiar todas las FK de negocio que referencian al usuario
    UPDATE operarias         SET supervisor_id      = NULL WHERE supervisor_id      = p_user_id;
    UPDATE garments          SET current_supervisor_id = NULL WHERE current_supervisor_id = p_user_id;
    UPDATE garments          SET imported_by        = NULL WHERE imported_by        = p_user_id;
    UPDATE movements         SET user_id            = NULL WHERE user_id            = p_user_id;
    UPDATE movements         SET from_supervisor_id = NULL WHERE from_supervisor_id = p_user_id;
    UPDATE movements         SET to_supervisor_id   = NULL WHERE to_supervisor_id   = p_user_id;
    UPDATE audit_log         SET user_id            = NULL WHERE user_id            = p_user_id;
    UPDATE area_transitions  SET from_supervisor_id = NULL WHERE from_supervisor_id = p_user_id;
    UPDATE area_transitions  SET to_supervisor_id   = NULL WHERE to_supervisor_id   = p_user_id;

    -- Limpiar identidades de auth (evita FK sin CASCADE en auth.identities)
    DELETE FROM auth.identities WHERE user_id = p_user_id;

    -- Eliminar el perfil explícitamente antes de auth.users
    DELETE FROM public.profiles WHERE id = p_user_id;

    -- Eliminar el usuario de auth (cascada sobre refresh_tokens, sessions, mfa, etc.)
    DELETE FROM auth.users WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION delete_user(UUID) TO authenticated;

-- ============================================================
-- FIN
-- ============================================================