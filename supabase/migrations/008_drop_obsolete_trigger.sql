-- ============================================================
-- Berber Otomasyon — Eski Tetikleyiciyi Temizleme
-- ============================================================
-- Bu SQL dosyasını Supabase Dashboard > SQL Editor'de çalıştırın.
-- ============================================================

-- Yeni sistemimizde çalışma saati (working_hours) ve müsaitlik
-- kontrolleri Next.js API tarafında ve yeni check_appointment_availability
-- fonksiyonu ile yapılmaktadır.
-- Tablo isimleri ve sütunları değiştiği için hata veren eski 
-- tetikleyiciyi siliyoruz.

DROP TRIGGER IF EXISTS check_working_hours_before_insert ON public.appointments;

DROP FUNCTION IF EXISTS public.validate_working_hours();

NOTIFY pgrst, 'reload schema';
