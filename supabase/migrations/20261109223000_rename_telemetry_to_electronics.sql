-- Telemetria deixa de ser uma área independente; seu registro passa a ser Eletrônica.
-- O mesmo area_id é mantido para preservar atividades, perfis, agenda e histórico.
-- Códigos históricos das atividades não são reescritos; novas atividades usam ELT.

begin;

do $$
declare
  v_area_id uuid;
begin
  select id into v_area_id
    from public.areas
    where slug = 'telemetria'
    for update;

  if v_area_id is null then
    if exists (select 1 from public.areas where slug = 'eletronica' and code_prefix = 'ELT') then
      return;
    end if;
    raise exception 'Não foi encontrada a área Telemetria para atualizar.';
  end if;

  if exists (select 1 from public.areas where slug = 'eletronica' and id <> v_area_id) then
    raise exception 'Já existe outra área com slug eletronica; revise os dados antes de continuar.';
  end if;
  if exists (select 1 from public.areas where code_prefix = 'ELT' and id <> v_area_id) then
    raise exception 'A sigla ELT já está atribuída a outra área; revise os dados antes de continuar.';
  end if;

  update public.areas
    set name = 'Eletrônica - ELT',
        slug = 'eletronica',
        code_prefix = 'ELT',
        notes = 'Circuitos, sensores, instrumentação, sistemas embarcados, automação, controle e telemetria.'
    where id = v_area_id;
end;
$$;

commit;
