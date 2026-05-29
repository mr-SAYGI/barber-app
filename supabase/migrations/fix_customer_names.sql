-- ── 1. Fix handle_new_user trigger ──────────────────────
-- Ensure full_name and phone are copied from user_metadata
-- to profiles when a new auth user is created.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'phone',
    COALESCE(NEW.raw_user_meta_data->>'role', 'customer')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(
      EXCLUDED.full_name, 
      public.profiles.full_name
    ),
    phone = COALESCE(
      EXCLUDED.phone, 
      public.profiles.phone
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Make sure the trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── 2. Fix RLS on profiles table ────────────────────────
-- TV screen uses anon browser client. It must be able to
-- read profiles that are linked to appointments.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow reading profiles for appointment display (anon + auth)
DROP POLICY IF EXISTS "profiles_read_for_appointments" 
  ON public.profiles;

CREATE POLICY "profiles_read_for_appointments"
  ON public.profiles
  FOR SELECT
  USING (true);

-- Only allow users to update their own profile
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);


-- ── 3. Ensure FK exists ──────────────────────────────────
-- appointments.customer_id must reference profiles.id
-- for profiles!customer_id join to work in Supabase

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'appointments_customer_id_fkey'
    AND table_name = 'appointments'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_customer_id_fkey
      FOREIGN KEY (customer_id)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;


-- ── 4. Backfill existing profiles ───────────────────────
-- Fix existing profiles where full_name is null by pulling
-- from auth.users metadata (for already created guest users)

UPDATE public.profiles p
SET 
  full_name = COALESCE(
    p.full_name, 
    au.raw_user_meta_data->>'full_name'
  ),
  phone = COALESCE(
    p.phone, 
    au.raw_user_meta_data->>'phone'
  )
FROM auth.users au
WHERE p.id = au.id
  AND (p.full_name IS NULL OR p.phone IS NULL);
