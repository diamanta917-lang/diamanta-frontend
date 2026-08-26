-- ============================================================
-- DIAMANTA v15 - Migración: Editar correo de un usuario
-- ------------------------------------------------------------
-- Cambios:
--   1. RPC change_user_email: permite al admin cambiar el correo
--      de un usuario, actualizando auth.users (identidad de login)
--      y profiles.email. El correo se deja confirmado para evitar
--      el problema de "email not confirmed".
-- Idempotente.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

CREATE OR REPLACE FUNCTION change_user_email(p_user_id UUID, p_new_email TEXT)
RETURNS VOID AS $$
DECLARE
    v_requester_role TEXT;
    v_user_exists BOOLEAN;
    v_email_in_use BOOLEAN;
BEGIN
    SELECT role INTO v_requester_role FROM profiles WHERE id = auth.uid();

    IF v_requester_role IS NULL OR v_requester_role <> 'admin' THEN
        RAISE EXCEPTION 'Solo el administrador puede cambiar el correo de un usuario';
    END IF;

    IF p_new_email IS NULL OR trim(p_new_email) = '' THEN
        RAISE EXCEPTION 'El correo no puede estar vacío';
    END IF;

    SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) INTO v_user_exists;
    IF NOT v_user_exists THEN
        RAISE EXCEPTION 'El usuario no existe';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM auth.users WHERE lower(email) = lower(p_new_email) AND id <> p_user_id
    ) INTO v_email_in_use;
    IF v_email_in_use THEN
        RAISE EXCEPTION 'Ese correo ya está registrado en el sistema';
    END IF;

    UPDATE auth.users
    SET email = p_new_email,
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = p_user_id;

    UPDATE public.profiles
    SET email = p_new_email,
        updated_at = now()
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El perfil del usuario no existe';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION change_user_email(UUID, TEXT) TO authenticated;

-- ============================================================
-- FIN
-- ============================================================