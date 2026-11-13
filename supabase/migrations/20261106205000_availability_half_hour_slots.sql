-- Disponibilidades em blocos de 30 minutos: início entre 07:00 e 20:30.
-- Os registros horários existentes continuam válidos.
begin;

alter table public.member_availability_slots
  drop constraint if exists member_availability_slots_hour_range;

alter table public.member_availability_slots
  drop constraint if exists member_availability_slots_half_hour_range;

alter table public.member_availability_slots
  add constraint member_availability_slots_half_hour_range check (
    hour_start >= time '07:00'
    and hour_start <= time '20:30'
    and date_part('minute', hour_start) in (0, 30)
    and date_part('second', hour_start) = 0
  );

commit;
