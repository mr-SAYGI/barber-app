-- ============================================================
-- Berber Otomasyon — Tatil Yönetimi Migrasyonu
-- ============================================================
-- Bu SQL dosyasını Supabase Dashboard > SQL Editor'de çalıştırın.
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- 1. HOLIDAYS TABLOSU (Resmi Tatiller & Manuel Tatiller)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.holidays (
    id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    holiday_date  date        NOT NULL,
    name          text        NOT NULL DEFAULT 'Tatil',
    is_off        boolean     NOT NULL DEFAULT TRUE,
    is_manual     boolean     NOT NULL DEFAULT FALSE,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- Her tarih için tek kayıt
CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_date
    ON public.holidays(holiday_date);

COMMENT ON TABLE public.holidays IS 'Resmi ve manuel tatil günleri. is_manual=false → API ile çekilen, is_manual=true → Admin tarafından eklenen.';


-- ═══════════════════════════════════════════════════════════════
-- 2. ROW LEVEL SECURITY (RLS) POLİTİKALARI
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir (müşteri takvimi, TV ekranı vs.)
DROP POLICY IF EXISTS "holidays_select_all" ON public.holidays;
CREATE POLICY "holidays_select_all" ON public.holidays
    FOR SELECT USING (true);

-- Admin tüm işlemleri yapabilir
DROP POLICY IF EXISTS "holidays_admin_all" ON public.holidays;
CREATE POLICY "holidays_admin_all" ON public.holidays
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
        )
    );

-- ═══════════════════════════════════════════════════════════════
-- 3. GRANT İZİNLERİ (service_role için)
-- ═══════════════════════════════════════════════════════════════

GRANT ALL ON public.holidays TO authenticated;
GRANT ALL ON public.holidays TO anon;
GRANT ALL ON public.holidays TO service_role;


-- ═══════════════════════════════════════════════════════════════
-- TAMAMLANDI ✅
-- ═══════════════════════════════════════════════════════════════
-- Oluşturulan tablo:
--   • holidays — Resmi tatiller & özel tatil günleri
--
-- RLS Politikaları:
--   • Herkes okur, sadece admin yönetir
--   • service_role tam yetkili (cron job için)
-- ═══════════════════════════════════════════════════════════════
