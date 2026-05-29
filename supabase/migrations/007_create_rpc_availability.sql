-- ============================================================
-- Berber Otomasyon — RPC Fonksiyonu Ekleme
-- ============================================================
-- Supabase Dashboard > SQL Editor kısmından çalıştırınız.
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_appointment_availability(
    p_barber_id uuid,
    p_starts_at timestamptz,
    p_ends_at timestamptz
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_conflicts uuid[];
BEGIN
    SELECT array_agg(id) INTO v_conflicts
    FROM public.appointments
    WHERE barber_id = p_barber_id
      AND status NOT IN ('cancelled', 'no_show')
      AND (
          (starts_at < p_ends_at AND ends_at > p_starts_at)
      );

    IF v_conflicts IS NULL THEN
        RETURN json_build_object('is_available', true, 'conflict_ids', '[]'::json);
    ELSE
        RETURN json_build_object('is_available', false, 'conflict_ids', json_to_recordset(v_conflicts));
    END IF;
END;
$$;

-- Everyone can execute this function
GRANT EXECUTE ON FUNCTION public.check_appointment_availability(uuid, timestamptz, timestamptz) TO public, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
