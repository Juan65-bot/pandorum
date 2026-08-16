-- Mantém psychologists.rating_avg / rating_count em sincronia com public.reviews.

create or replace function public.refresh_psychologist_rating()
returns trigger as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.psychologist_id, old.psychologist_id);

  update public.psychologists
  set
    rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where psychologist_id = target_id), 0),
    rating_count = (select count(*) from public.reviews where psychologist_id = target_id)
  where id = target_id;

  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists reviews_refresh_rating on public.reviews;
create trigger reviews_refresh_rating
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_psychologist_rating();
