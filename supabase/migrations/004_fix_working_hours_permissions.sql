-- ============================================================
-- Berber Otomasyon — Working Hours İzinleri Düzeltmesi
-- ============================================================
-- Bu SQL dosyasını Supabase Dashboard > SQL Editor'de çalıştırın.
-- ============================================================

-- 'working_hours' tablosu için eksik olan GRANT (erişim) izinlerini ekliyoruz.
-- Bu izinler olmadığı için "permission denied for table working_hours" hatası alıyordunuz.

GRANT ALL ON public.working_hours TO authenticated;
GRANT ALL ON public.working_hours TO anon;
GRANT ALL ON public.working_hours TO service_role;

-- Schema cache'i yenile
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- TAMAMLANDI ✅
-- ═══════════════════════════════════════════════════════════════
