ALTER TABLE public.appointments 
  DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE public.appointments 
  ADD CONSTRAINT appointments_status_check 
  CHECK (status IN (
    'pending','confirmed','in_progress',
    'completed','cancelled','no_show'
  ));
