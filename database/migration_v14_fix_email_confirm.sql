-- ============================================================
-- DIAMANTA v14 - Migración: Confirmación automática de email
-- ------------------------------------------------------------
-- Problema: los usuarios creados por el admin quedaban con el
-- email "sin confirmar" y al iniciar sesión daban
-- "email not confirmed". La RPC confirm_user_email llamada desde
-- el frontend fallaba (permisos/owner) y el error se ignoraba.
--
-- Solución:
--   1. El trigger handle_new_user confirma el email de forma
--      automática e inmediata al crearse el usuario
--      (UPDATE auth.users SET email_confirmed_at = now()).
--      Así NO depende de la RPC llamada por separado.
--   2. Se mantiene/refuerza la RPC confirm_user_email como
--      respaldo, con GRANT EXECUTE explícito para que la anon/
--      authenticated key pueda invocarla.
--
-- Idempotente: se puede ejecutar varias veces sin error.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

-- ============================================================
-- 1. TRIGGER handle_new_user (confirma email + guarda area_id)
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Confirmar el email automáticamente (el admin es quien crea al usuario).
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = NEW.id;

    -- Crear el perfil con rol, nombre y área enviados desde el formulario.
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
    -- Nunca bloquea el registro del usuario: el perfil se sincroniza desde el frontend.
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 2. RPC confirm_user_email (respaldo, solo admin)
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

-- Permitir que la anon/authenticated key invoque la RPC.
GRANT EXECUTE ON FUNCTION confirm_user_email(UUID) TO anon, authenticated, service_role;

-- ============================================================
-- FIN
-- ============================================================
