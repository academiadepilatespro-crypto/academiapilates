ALTER TABLE public.contas_pagar ADD COLUMN IF NOT EXISTS anexo_path text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('contas_pagar_anexos', 'contas_pagar_anexos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "contas_pagar_anexos_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "contas_pagar_anexos_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "contas_pagar_anexos_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "contas_pagar_anexos_delete_authenticated" ON storage.objects;

CREATE POLICY "contas_pagar_anexos_select_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'contas_pagar_anexos');

CREATE POLICY "contas_pagar_anexos_insert_authenticated"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'contas_pagar_anexos');

CREATE POLICY "contas_pagar_anexos_update_authenticated"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'contas_pagar_anexos')
WITH CHECK (bucket_id = 'contas_pagar_anexos');

CREATE POLICY "contas_pagar_anexos_delete_authenticated"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'contas_pagar_anexos');
