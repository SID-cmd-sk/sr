-- Run this in Supabase SQL Editor
-- Creates a function that deletes an auth user and all FK references

CREATE OR REPLACE FUNCTION public.delete_auth_user(uid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM audit_log WHERE user_id = uid;
  DELETE FROM auth.users WHERE id = uid;
  DELETE FROM public.users WHERE id = uid;
  RETURN true;
END;
$$;
