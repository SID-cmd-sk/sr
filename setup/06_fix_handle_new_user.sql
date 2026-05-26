-- ============================================================
-- SR PLATFORM — Fix handle_new_user trigger
-- Run this in Supabase SQL Editor if signUp returns
-- "Database error saving new user"
-- ============================================================

-- Make the trigger resilient: catch any exception so the
-- auth.users insert succeeds even if public.users insert fails.
-- The frontend will create the profile manually as fallback.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, name, email, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'User')::user_role,
    'active'
  )
  ON CONFLICT (id) DO UPDATE SET
    name   = EXCLUDED.name,
    email  = EXCLUDED.email,
    status = CASE WHEN public.users.status = 'pending' THEN 'active' ELSE public.users.status END;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user skipped for %: %', NEW.email, SQLERRM;
  RETURN NEW;
END;
$$;

-- Make sure the trigger exists
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
