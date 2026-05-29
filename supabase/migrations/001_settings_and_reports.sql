-- ============================================================
-- Berber Otomasyon — Veritabanı Güncelleme Migrasyonu
-- ============================================================
-- Bu SQL dosyasını Supabase Dashboard > SQL Editor'de çalıştırın.
-- Sırasıyla:
--   1. settings tablosu (TV kayan yazı vb.)
--   2. daily_reports tablosu (Z raporu)
--   3. RLS politikaları
--   4. Otomatik Z raporu oluşturan fonksiyon & trigger
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- 1. SETTINGS TABLOSU (Tek Satır Mantığı — Singleton Pattern)
-- ═══════════════════════════════════════════════════════════════
-- TV ekranında gösterilecek kayan yazı (marquee), Wi-Fi şifresi,
-- salon adı, kampanya metinleri gibi uygulama geneli ayarları
-- tek bir satırda tutar. Birden fazla satır oluşturulmasını
-- CHECK constraint ile engeller.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.settings (
    id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Singleton Garantisi: Tabloda sadece 1 satır olabilir.
    -- 'singleton' sütunu her zaman TRUE olmalıdır ve UNIQUE'tir.
    singleton       boolean     NOT NULL DEFAULT TRUE,
    CONSTRAINT settings_singleton_check CHECK (singleton = TRUE),
    CONSTRAINT settings_singleton_unique UNIQUE (singleton),

    -- ─── TV Ekranı Ayarları ───────────────────────────────────
    salon_name          text        NOT NULL DEFAULT 'Gentleman''s Club',
    marquee_text        text        NOT NULL DEFAULT '💈 Berber Otomasyonuna Hoş Geldiniz • Randevularınızı mobil uygulamamızdan alabilirsiniz!',
    marquee_speed_seconds integer   NOT NULL DEFAULT 20,       -- Kayan yazı tam döngü süresi (saniye)
    wifi_password       text        DEFAULT NULL,               -- Wi-Fi şifresi (NULL = gösterme)
    youtube_video_id    text        DEFAULT 'dQw4w9WgXcQ',     -- TV arka plan YouTube video ID

    -- ─── Kampanya & Duyuru ────────────────────────────────────
    campaign_text       text        DEFAULT NULL,               -- Aktif kampanya metni (NULL = yok)
    campaign_active     boolean     NOT NULL DEFAULT FALSE,

    -- ─── Genel İşletme Ayarları ──────────────────────────────
    currency_symbol     text        NOT NULL DEFAULT '₺',
    default_slot_interval_minutes integer NOT NULL DEFAULT 30,  -- Randevu slot aralığı

    -- ─── Zaman Damgaları ─────────────────────────────────────
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Varsayılan ayar satırını ekle (henüz yoksa)
INSERT INTO public.settings (singleton)
VALUES (TRUE)
ON CONFLICT ON CONSTRAINT settings_singleton_unique DO NOTHING;

-- updated_at otomatik güncellemesi
CREATE OR REPLACE FUNCTION update_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_settings_updated_at ON public.settings;
CREATE TRIGGER trg_settings_updated_at
    BEFORE UPDATE ON public.settings
    FOR EACH ROW EXECUTE FUNCTION update_settings_updated_at();

COMMENT ON TABLE public.settings IS 'Uygulama geneli ayarlar (singleton). TV kayan yazısı, kampanya, Wi-Fi şifresi vb.';


-- ═══════════════════════════════════════════════════════════════
-- 2. DAILY_REPORTS TABLOSU (Z Raporu / Günlük Özet)
-- ═══════════════════════════════════════════════════════════════
-- Her gün sonunda otomatik veya manuel tetiklenerek o günün
-- toplam randevu, ciro, iptal gibi özet verilerini saklar.
-- Raporlar berber bazlı tutulur → çoklu berber desteği.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.daily_reports (
    id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    barber_id           uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    report_date         date        NOT NULL,                   -- Raporun ait olduğu gün

    -- ─── Randevu İstatistikleri ───────────────────────────────
    total_appointments  integer     NOT NULL DEFAULT 0,         -- Toplam randevu sayısı
    completed_count     integer     NOT NULL DEFAULT 0,         -- Tamamlanan
    cancelled_count     integer     NOT NULL DEFAULT 0,         -- İptal edilen
    no_show_count       integer     NOT NULL DEFAULT 0,         -- Gelmedi

    -- ─── Mali Veriler ─────────────────────────────────────────
    gross_revenue       numeric(10,2) NOT NULL DEFAULT 0.00,    -- Brüt ciro (tamamlanan)
    cancelled_revenue   numeric(10,2) NOT NULL DEFAULT 0.00,    -- İptal edilen potansiyel ciro
    avg_ticket          numeric(10,2) NOT NULL DEFAULT 0.00,    -- Ortalama fiş tutarı

    -- ─── Zaman Metrikleri ─────────────────────────────────────
    total_service_minutes integer   NOT NULL DEFAULT 0,         -- Toplam hizmet süresi (dk)
    first_appointment   time        DEFAULT NULL,               -- Günün ilk randevusu
    last_appointment    time        DEFAULT NULL,               -- Günün son randevusu

    -- ─── En Popüler Hizmet ───────────────────────────────────
    top_service_name    text        DEFAULT NULL,               -- En çok yapılan hizmet adı
    top_service_count   integer     DEFAULT 0,                  -- Kaç kez yapıldı

    -- ─── Rapor Meta ──────────────────────────────────────────
    is_auto_generated   boolean     NOT NULL DEFAULT TRUE,      -- Otomatik mi yoksa manuel mi
    notes               text        DEFAULT NULL,               -- Berber notu (opsiyonel)
    created_at          timestamptz NOT NULL DEFAULT now(),

    -- Aynı berber + aynı gün = tek rapor
    CONSTRAINT daily_reports_unique_day UNIQUE (barber_id, report_date)
);

-- Hızlı sorgu için indeks
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON public.daily_reports(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_reports_barber ON public.daily_reports(barber_id, report_date DESC);

COMMENT ON TABLE public.daily_reports IS 'Günlük Z raporu. Her berber için gün sonunda toplam randevu, ciro ve performans özeti.';


-- ═══════════════════════════════════════════════════════════════
-- 3. Z RAPORU OTOMATİK OLUŞTURMA FONKSİYONU
-- ═══════════════════════════════════════════════════════════════
-- Bu fonksiyon belirtilen berber ve tarih için appointments
-- tablosundan verileri toplayarak daily_reports'a yazar.
-- UPSERT kullanır → aynı gün tekrar çağrılırsa günceller.
--
-- Kullanım:
--   SELECT generate_daily_report('berber-uuid', '2026-05-25');
--   SELECT generate_daily_report('berber-uuid'); -- bugün
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.generate_daily_report(
    p_barber_id uuid,
    p_date      date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_report_id         uuid;
    v_total             integer;
    v_completed         integer;
    v_cancelled         integer;
    v_no_show           integer;
    v_gross             numeric(10,2);
    v_cancelled_rev     numeric(10,2);
    v_avg_ticket        numeric(10,2);
    v_total_minutes     integer;
    v_first_appt        time;
    v_last_appt         time;
    v_top_service       text;
    v_top_count         integer;
BEGIN
    -- Toplam randevu sayıları
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'completed'),
        COUNT(*) FILTER (WHERE status = 'cancelled'),
        COUNT(*) FILTER (WHERE status = 'no_show')
    INTO v_total, v_completed, v_cancelled, v_no_show
    FROM public.appointments
    WHERE barber_id = p_barber_id
      AND starts_at::date = p_date;

    -- Mali veriler (sadece tamamlanan randevular)
    SELECT
        COALESCE(SUM(total_price), 0),
        CASE WHEN COUNT(*) > 0
             THEN ROUND(SUM(total_price) / COUNT(*), 2)
             ELSE 0
        END
    INTO v_gross, v_avg_ticket
    FROM public.appointments
    WHERE barber_id = p_barber_id
      AND starts_at::date = p_date
      AND status = 'completed';

    -- İptal edilen potansiyel ciro
    SELECT COALESCE(SUM(total_price), 0)
    INTO v_cancelled_rev
    FROM public.appointments
    WHERE barber_id = p_barber_id
      AND starts_at::date = p_date
      AND status = 'cancelled';

    -- Zaman metrikleri
    SELECT
        COALESCE(SUM(total_duration), 0),
        MIN(starts_at::time),
        MAX(starts_at::time)
    INTO v_total_minutes, v_first_appt, v_last_appt
    FROM public.appointments
    WHERE barber_id = p_barber_id
      AND starts_at::date = p_date
      AND status IN ('completed', 'confirmed', 'in_progress');

    -- En popüler hizmet
    SELECT s.name, COUNT(*)
    INTO v_top_service, v_top_count
    FROM public.appointment_services aps
    JOIN public.appointments a ON a.id = aps.appointment_id
    JOIN public.services s ON s.id = aps.service_id
    WHERE a.barber_id = p_barber_id
      AND a.starts_at::date = p_date
      AND a.status = 'completed'
    GROUP BY s.name
    ORDER BY COUNT(*) DESC
    LIMIT 1;

    -- UPSERT: varsa güncelle, yoksa ekle
    INSERT INTO public.daily_reports (
        barber_id, report_date,
        total_appointments, completed_count, cancelled_count, no_show_count,
        gross_revenue, cancelled_revenue, avg_ticket,
        total_service_minutes, first_appointment, last_appointment,
        top_service_name, top_service_count,
        is_auto_generated
    ) VALUES (
        p_barber_id, p_date,
        v_total, v_completed, v_cancelled, v_no_show,
        v_gross, v_cancelled_rev, v_avg_ticket,
        v_total_minutes, v_first_appt, v_last_appt,
        v_top_service, COALESCE(v_top_count, 0),
        TRUE
    )
    ON CONFLICT ON CONSTRAINT daily_reports_unique_day
    DO UPDATE SET
        total_appointments  = EXCLUDED.total_appointments,
        completed_count     = EXCLUDED.completed_count,
        cancelled_count     = EXCLUDED.cancelled_count,
        no_show_count       = EXCLUDED.no_show_count,
        gross_revenue       = EXCLUDED.gross_revenue,
        cancelled_revenue   = EXCLUDED.cancelled_revenue,
        avg_ticket          = EXCLUDED.avg_ticket,
        total_service_minutes = EXCLUDED.total_service_minutes,
        first_appointment   = EXCLUDED.first_appointment,
        last_appointment    = EXCLUDED.last_appointment,
        top_service_name    = EXCLUDED.top_service_name,
        top_service_count   = EXCLUDED.top_service_count,
        is_auto_generated   = TRUE
    RETURNING id INTO v_report_id;

    RETURN v_report_id;
END;
$$;

COMMENT ON FUNCTION public.generate_daily_report IS 'Belirtilen berber ve tarih için Z raporunu otomatik oluşturur/günceller.';


-- ═══════════════════════════════════════════════════════════════
-- 4. ROW LEVEL SECURITY (RLS) POLİTİKALARI
-- ═══════════════════════════════════════════════════════════════

-- ─── settings tablosu ────────────────────────────────────────
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir (TV ekranı, müşteri uygulaması vb.)
CREATE POLICY "settings_select_all" ON public.settings
    FOR SELECT USING (true);

-- Sadece admin güncelleyebilir
CREATE POLICY "settings_update_admin" ON public.settings
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
        )
    );

-- Kimse silemesin veya yeni satır ekleyemesin (singleton)
CREATE POLICY "settings_no_insert" ON public.settings
    FOR INSERT WITH CHECK (false);
CREATE POLICY "settings_no_delete" ON public.settings
    FOR DELETE USING (false);


-- ─── daily_reports tablosu ───────────────────────────────────
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

-- Admin tüm raporları görebilir
CREATE POLICY "reports_select_admin" ON public.daily_reports
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
        )
    );

-- Berber sadece kendi raporlarını görebilir
CREATE POLICY "reports_select_own" ON public.daily_reports
    FOR SELECT USING (
        barber_id = auth.uid()
    );

-- Sadece admin veya sistem (service role) rapor oluşturabilir
CREATE POLICY "reports_insert_admin" ON public.daily_reports
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('admin', 'barber')
        )
    );

-- Rapor güncelleme sadece admin
CREATE POLICY "reports_update_admin" ON public.daily_reports
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
        )
    );

-- Rapor silme yasak
CREATE POLICY "reports_no_delete" ON public.daily_reports
    FOR DELETE USING (false);


-- ═══════════════════════════════════════════════════════════════
-- 5. SUPABASE CRON İLE OTOMATİK GECE RAPORU (OPSİYONEL)
-- ═══════════════════════════════════════════════════════════════
-- Aşağıdaki SQL, Supabase pg_cron extension'ı aktifse
-- her gece 23:55'te tüm berberlerin Z raporunu oluşturur.
-- pg_cron aktif değilse bu bloğu atlayabilirsiniz.
-- ═══════════════════════════════════════════════════════════════

/*
-- pg_cron extension'ını etkinleştir (henüz yapılmadıysa)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Her gece 23:55'te tüm aktif berberler için rapor oluştur
SELECT cron.schedule(
    'nightly-z-report',              -- job adı
    '55 23 * * *',                   -- her gece 23:55
    $$
    SELECT generate_daily_report(id, CURRENT_DATE)
    FROM public.profiles
    WHERE role = 'barber' AND is_available = TRUE;
    $$
);
*/


-- ═══════════════════════════════════════════════════════════════
-- TAMAMLANDI ✅
-- ═══════════════════════════════════════════════════════════════
-- Çalıştırılan tablolar:
--   • settings         — TV kayan yazı & uygulama ayarları
--   • daily_reports    — Günlük Z raporu
--
-- Çalıştırılan fonksiyonlar:
--   • generate_daily_report(barber_id, date) — Z raporu üretici
--   • update_settings_updated_at()          — Trigger fonksiyonu
--
-- RLS Politikaları:
--   • settings: Herkes okur, sadece admin günceller
--   • daily_reports: Admin hepsini, berber kendininkini görür
-- ═══════════════════════════════════════════════════════════════
