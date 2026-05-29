-- =============================================================
-- BU SQL'İ SUPABASE DASHBOARD > SQL EDITOR'DE ÇALIŞTIR
-- =============================================================
-- Her satırı kopyalayıp "Run" yap. Hata vermeden geçerse başardın.
-- =============================================================

-- 1) settings tablosuna RLS aç ve herkes okuyup yazabilsin
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_settings" ON public.settings;
CREATE POLICY "allow_all_settings"
  ON public.settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2) Eğer settings tablosunda hiç satır yoksa ekle
INSERT INTO public.settings (marquee_text)
SELECT '💈 İMAJ ERKEK KUAFÖRÜNE HOŞ GELDİNİZ!'
WHERE NOT EXISTS (SELECT 1 FROM public.settings);

-- 3) services tablosuna RLS aç
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_services" ON public.services;
CREATE POLICY "allow_all_services"
  ON public.services
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 4) appointments tablosuna RLS aç
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_appointments" ON public.appointments;
CREATE POLICY "allow_all_appointments"
  ON public.appointments
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 5) profiles okuma izni
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_read_profiles" ON public.profiles;
CREATE POLICY "allow_read_profiles"
  ON public.profiles
  FOR SELECT
  USING (true);

-- Bitti! Şimdi uygulamana dön ve tekrar dene.
