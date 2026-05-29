-- ============================================================
-- Berber Otomasyon — Manuel Randevularda Çakışmayı İzin Verme
-- ============================================================
-- Bu SQL dosyasını Supabase Dashboard > SQL Editor'de çalıştırın.
-- ============================================================

-- Tüm mevcut dışlama (exclusion) kısıtlamalarını bulup dinamik olarak kaldırıyoruz
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.appointments'::regclass 
        AND contype = 'x'
    LOOP
        EXECUTE 'ALTER TABLE public.appointments DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- Kısıtlamayı yeniden ekliyoruz, ancak adminin oluşturduğu 
-- manuel randevuları (customer_id = barber_id) HİÇBİR ŞEKİLDE 
-- engellememesi için WHERE koşuluna "customer_id != barber_id" ekliyoruz.
ALTER TABLE public.appointments
ADD CONSTRAINT no_overlapping_appointments
EXCLUDE USING gist (
    barber_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
)
WHERE (status NOT IN ('cancelled', 'no_show') AND customer_id != barber_id);

NOTIFY pgrst, 'reload schema';
