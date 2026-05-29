-- ============================================================
-- Berber Otomasyon — Randevu Tablosu Şema Düzeltmesi
-- ============================================================
-- Bu SQL dosyasını Supabase Dashboard > SQL Editor'de çalıştırın.
-- ============================================================

DO $$
BEGIN
  -- 1. user_id sütunu varsa customer_id olarak yeniden adlandır
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='user_id') THEN
      ALTER TABLE public.appointments RENAME COLUMN user_id TO customer_id;
  END IF;

  -- 2. Eksik sütunları tabloya ekle
  
  -- barber_id: Randevunun hangi berbere ait olduğu (tablo boş olduğu için doğrudan uuid eklenebilir)
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='barber_id') THEN
      ALTER TABLE public.appointments ADD COLUMN barber_id uuid;
  END IF;

  -- total_duration: Randevu toplam süresi (dakika)
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='total_duration') THEN
      ALTER TABLE public.appointments ADD COLUMN total_duration integer NOT NULL DEFAULT 0;
  END IF;

  -- total_price: Randevu toplam fiyatı
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='total_price') THEN
      ALTER TABLE public.appointments ADD COLUMN total_price numeric(10,2) NOT NULL DEFAULT 0.00;
  END IF;

  -- customer_note: Müşteri notu
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='customer_note') THEN
      ALTER TABLE public.appointments ADD COLUMN customer_note text;
  END IF;

  -- barber_note: Berberin notu
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='barber_note') THEN
      ALTER TABLE public.appointments ADD COLUMN barber_note text;
  END IF;

  -- updated_at: Son güncellenme zamanı
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='updated_at') THEN
      ALTER TABLE public.appointments ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;

END $$;

-- 3. SCHEMA CACHE'İ YENİLE
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- TAMAMLANDI ✅
-- ═══════════════════════════════════════════════════════════════
