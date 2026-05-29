-- ============================================================
-- Eski Randevuların Notlarını Düzeltme
-- ============================================================
-- Müşteri arayüzünden alınan eski randevularda [Müşteri] etiketi
-- bulunmadığı için isimler anonim ("Müşteri") olarak görünüyordu.
-- Bu script, eski randevuların customer_note alanına müşteri 
-- profilindeki (ad soyad ve telefon) bilgisini [Müşteri] etiketi
-- ile ekleyerek geçmiş randevuların doğru görünmesini sağlar.
-- ============================================================

DO $$
DECLARE
    rec RECORD;
    v_full_name TEXT;
    v_phone TEXT;
    v_new_note TEXT;
BEGIN
    FOR rec IN 
        SELECT a.id, a.customer_id, a.customer_note, p.full_name, p.phone
        FROM public.appointments a
        JOIN public.profiles p ON a.customer_id = p.id
        WHERE a.customer_note IS NULL 
           OR (a.customer_note NOT LIKE '%[Manuel]%' AND a.customer_note NOT LIKE '%[Müşteri]%')
    LOOP
        v_full_name := COALESCE(rec.full_name, '');
        v_phone := COALESCE(rec.phone, '');
        
        -- Yeni not metnini oluştur (Varsa eski notu da sona ekle)
        v_new_note := '';
        IF v_full_name != '' THEN
            v_new_note := '[Müşteri] ' || v_full_name;
        END IF;
        
        IF v_phone != '' THEN
            IF v_new_note != '' THEN
                v_new_note := v_new_note || ' | ';
            END IF;
            v_new_note := v_new_note || 'Tel: ' || v_phone;
        END IF;

        IF rec.customer_note IS NOT NULL AND rec.customer_note != '' THEN
            IF v_new_note != '' THEN
                v_new_note := v_new_note || ' | ';
            END IF;
            v_new_note := v_new_note || 'Not: ' || rec.customer_note;
        END IF;

        -- Eğer isim oluşturabildiysek güncelle
        IF v_new_note != '' THEN
            UPDATE public.appointments 
            SET customer_note = v_new_note 
            WHERE id = rec.id;
        END IF;
    END LOOP;
END $$;
