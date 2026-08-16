-- Função pública para consultar horários já ocupados de um psicólogo sem
-- expor dados de quem reservou (a RLS de appointments só deixa paciente/
-- psicólogo envolvidos e admin lerem a linha inteira).

create or replace function public.get_busy_slots(p_psychologist_id uuid)
returns table(starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select starts_at, ends_at
  from public.appointments
  where psychologist_id = p_psychologist_id
    and status in ('scheduled', 'confirmed')
    and starts_at > now();
$$;

grant execute on function public.get_busy_slots(uuid) to anon, authenticated;
