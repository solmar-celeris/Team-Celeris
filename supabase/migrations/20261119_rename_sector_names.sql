-- Persist the SolMar Celeris sector name changes in version control.
-- The area IDs remain unchanged so existing assignments and history are preserved.
UPDATE public.areas
SET name = 'Financeiro - FIN', slug = 'financeiro', code_prefix = 'FIN'
WHERE id = '11ba2786-e723-4a44-a5d1-b4b3e816e4d4';

UPDATE public.areas
SET name = 'Gestão - GES', slug = 'gestao', code_prefix = 'GES'
WHERE id = '19628629-912e-4ae3-b992-37fc72c01e53';

UPDATE public.areas
SET name = 'Telemetria - TEL', slug = 'telemetria', code_prefix = 'TEL'
WHERE id = 'a75a0b74-d744-43e8-89b8-408903aa0801';
