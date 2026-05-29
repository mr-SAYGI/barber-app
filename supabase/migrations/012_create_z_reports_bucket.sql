-- ============================================================
-- Supabase Storage: z_raporlari Bucket
-- ============================================================
-- Otomatik Z raporu (CSV) dosyalarının saklanacağı depo
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('z_raporlari', 'z_raporlari', false)
ON CONFLICT (id) DO NOTHING;

-- RLS politikalarını sıfırla/yeniden oluştur (önlem olarak)
-- Sadece admin rolüne sahip kullanıcılar okuyabilir
DROP POLICY IF EXISTS "z_raporlari_admin_select" ON storage.objects;
CREATE POLICY "z_raporlari_admin_select" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'z_raporlari' 
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Backend (service role) zaten bypass edeceği için insert/delete 
-- politikasına gerek yok, ancak admin frontend'den de listeleme yapabilsin
-- diye admin'e okuma izni veriyoruz.
