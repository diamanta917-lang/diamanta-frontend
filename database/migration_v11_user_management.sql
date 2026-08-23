-- ============================================================
-- DIAMANTA v11 - Migración: Gestión de usuarios y contraseñas
-- ------------------------------------------------------------
-- Cambios:
--   1. RPC confirm_user_email: confirma el email de un usuario
--      creado por el admin (evita que quede sin confirmar).
--   2. RPC reset_user_password: permite al admin cambiar la
--      contraseña de cualquier usuario (funciona desde el
--      frontend con la anon key).
--   3. Actualiza handle_new_user para que también guarde area_id
--      y mantenga el rol enviado desde el formulario.
-- Idempotente.
-- ============================================================

-- ============================================================
-- 1. CONFIRMAR EMAIL DE UN USUARIO (solo admin)
-- ============================================================

CREATE OR REPLACE FUNCTION confirm_user_email(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_requester_role TEXT;
BEGIN
    SELECT role INTO v_requester_role FROM profiles WHERE id = auth.uid();

    IF v_requester_role IS NULL OR v_requester_role <> 'admin' THEN
        RAISE EXCEPTION 'Solo el administrador puede confirmar usuarios';
    END IF;

    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El usuario no existe';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. CAMBIAR CONTRASEÑA DE UN USUARIO (solo admin)
-- ============================================================

CREATE OR REPLACE FUNCTION reset_user_password(p_user_id UUID, p_new_password TEXT)
RETURNS VOID AS $$
DECLARE
    v_requester_role TEXT;
    v_user_exists BOOLEAN;
BEGIN
    SELECT role INTO v_requester_role FROM profiles WHERE id = auth.uid();

    IF v_requester_role IS NULL OR v_requester_role <> 'admin' THEN
        RAISE EXCEPTION 'Solo el administrador puede cambiar contraseñas';
    END IF;

    SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) INTO v_user_exists;
    IF NOT v_user_exists THEN
        RAISE EXCEPTION 'El usuario no existe';
    END IF;

    IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
        RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres';
    END IF;

    UPDATE auth.users
    SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. TRIGGER handle_new_user (incluye area_id y es a prueba de fallos)
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, area_id)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'supervisor'),
        NULLIF(NEW.raw_user_meta_data->>'area_id', '')::UUID
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Nunca bloquea el registro del usuario: el perfil se sincroniza desde el frontend
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- FIN
-- ============================================================