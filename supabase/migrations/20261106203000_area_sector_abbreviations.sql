-- Nomes e siglas oficiais das áreas. Códigos já atribuídos às atividades são preservados.
begin;

update public.areas set name = 'Gestão de Pessoas - GP', code_prefix = 'GP'
where slug = 'gestao-de-pessoas';
update public.areas set name = 'Administrativo Financeiro - AF', code_prefix = 'AF'
where slug = 'administrativo-financeiro';
update public.areas set name = 'Marketing - MKT', code_prefix = 'MKT'
where slug = 'marketing';
update public.areas set name = 'Mecânica Naval - MEC', code_prefix = 'MEC'
where slug = 'mecanica-naval';
update public.areas set name = 'Elétrica - ELE', code_prefix = 'ELE'
where slug = 'eletrica';
update public.areas set name = 'Telemetria - TEL', code_prefix = 'TEL'
where slug = 'telemetria';

commit;
