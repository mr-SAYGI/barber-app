-- ============================================================
-- Berber Otomasyon — Randevu Tablosu ve İzin Onarımı
-- ============================================================
-- Bu SQL dosyasını Supabase Dashboard > SQL Editor'de çalıştırın.
-- ============================================================

-- 1. EKSİK ERİŞİM İZİNLERİNİ ONAYLA (Permission Denied hatalarını çözer)
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- 2. APPOINTMENTS TABLOSU SÜTUN DÜZELTMESİ (starts_at does not exist hatasını çözer)
DO $$
BEGIN
  -- Eğer tablo "start_time" kullanıyorsa, kodun beklediği "starts_at" olarak değiştir
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='start_time') THEN
      ALTER TABLE public.appointments RENAME COLUMN start_time TO starts_at;
  END IF;
  
  -- Aynı şekilde "end_time" varsa "ends_at" olarak değiştir
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='end_time') THEN
      ALTER TABLE public.appointments RENAME COLUMN end_time TO ends_at;
  END IF;
  
  -- Eğer "starts_at" sütunu hiç yoksa (ne start_time ne starts_at yoksa) oluştur
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='starts_at') THEN
      ALTER TABLE public.appointments ADD COLUMN starts_at timestamptz NOT NULL DEFAULT now();
  END IF;

  -- Aynı mantıkla "ends_at" sütunu kontrolü
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='ends_at') THEN
      ALTER TABLE public.appointments ADD COLUMN ends_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- 3. SCHEMA CACHE'İ YENİLE (PostgREST API'nin yeni yapıyı görmesi için)
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- TAMAMLANDI ✅
-- ═══════════════════════════════════════════════════════════════
