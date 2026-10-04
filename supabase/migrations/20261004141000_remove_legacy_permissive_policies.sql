DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name, p.polname AS policy_name
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('alunos','aulas','avaliacoes','avaliacao_documentos','contas_pagar','categorias_contas','categorias_receitas','config_estudio','config_juros','documentos','enderecos','eventos','exercicios','ficha_exercicios','fichas_treino','formas_pagamento','lista_espera','mensalidades','metas','outras_receitas','parcelas','planos','planos_alunos','planos_horarios','saude_alunos','aulas_agendadas','capacidade_horario','controle_faltas','historico_renovacoes','matriculas','aulas_treinos','sessoes','logs_auditoria','relatorios_gerados','usuarios')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policy_name, r.schema_name, r.table_name);
  END LOOP;
END $$;

DO $$
DECLARE t text;
  tables_to_secure text[] := ARRAY['alunos','aulas','avaliacoes','avaliacao_documentos','contas_pagar','categorias_contas','categorias_receitas','config_estudio','config_juros','documentos','enderecos','eventos','exercicios','ficha_exercicios','fichas_treino','formas_pagamento','lista_espera','mensalidades','metas','outras_receitas','parcelas','planos','planos_alunos','planos_horarios','saude_alunos','aulas_agendadas','capacidade_horario','controle_faltas','historico_renovacoes','matriculas','aulas_treinos','sessoes','logs_auditoria','relatorios_gerados'];
BEGIN
 FOREACH t IN ARRAY tables_to_secure LOOP
  IF to_regclass('public.' || t) IS NOT NULL THEN
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('CREATE POLICY "staff_all_%s" ON public.%I FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff())',t,t);
  END IF;
 END LOOP;
END $$;

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usuarios_self_select" ON public.usuarios FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "usuarios_self_update" ON public.usuarios FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
