-- ============================================================
-- Berber Otomasyon — Çalışma Saatleri Tablosu Düzeltmesi
-- ============================================================
-- Bu SQL dosyasını Supabase Dashboard > SQL Editor'de çalıştırın.
-- ============================================================

-- Önceki hatalı tabloyu (varsa) sil
DROP TABLE IF EXISTS public.working_hours CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- WORKING_HOURS TABLOSU
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.working_hours (
    id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    barber_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    day_of_week   integer     NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time    time        NOT NULL DEFAULT '09:00:00',
    end_time      time        NOT NULL DEFAULT '19:00:00',
    is_off        boolean     NOT NULL DEFAULT FALSE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    
    -- Bir berberin aynı gün için sadece tek çalışma saati kaydı olabilir
    UNIQUE(barber_id, day_of_week)
);

COMMENT ON TABLE public.working_hours IS 'Berberlerin haftanın günlerine göre çalışma saatleri (0=Pazar, 1=Pazartesi)';

-- ═══════════════════════════════════════════════════════════════
-- RLS POLİTİKALARI
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.working_hours ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir (müşteri saat seçerken)
CREATE POLICY "working_hours_select_all" ON public.working_hours
    FOR SELECT USING (true);

-- Admin tüm işlemleri yapabilir
CREATE POLICY "working_hours_admin_all" ON public.working_hours
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
-- SCHEMA CACHE YENİLEME
-- ═══════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- TAMAMLANDI ✅
-- ═══════════════════════════════════════════════════════════════
