-- Alinha o contrato financeiro com o front-end e preserva as regras de agenda/pausa.
ALTER TABLE public.mensalidades
  ADD COLUMN IF NOT EXISTS plano_id integer,
  ADD COLUMN IF NOT EXISTS pausa_inicio date,
  ADD COLUMN IF NOT EXISTS pausa_fim date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mensalidades_plano_id_fkey'
  ) THEN
    ALTER TABLE public.mensalidades
      ADD CONSTRAINT mensalidades_plano_id_fkey
      FOREIGN KEY (plano_id) REFERENCES public.planos(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.mensalidades m
SET plano_id = p.id
FROM public.planos p
WHERE m.plano_id IS NULL
  AND lower(trim(m.plano)) = lower(trim(p.nome));

CREATE OR REPLACE FUNCTION public.update_parcela_status()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Cancelamento é um estado terminal e não pode ser reclassificado
  -- como pendente/atrasado pelo vencimento.
  IF NEW.status = 'cancelada' THEN
    RETURN NEW;
  END IF;

  IF NEW.data_pagamento IS NOT NULL THEN
    NEW.status = 'pago';
  ELSIF NEW.vencimento < CURRENT_DATE THEN
    NEW.status = 'atrasado';
  ELSE
    NEW.status = 'pendente';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sincronizar_pausa_financeira()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  dias_pausa integer;
BEGIN
  IF NEW.pausa_inicio IS NULL OR NEW.pausa_fim IS NULL
     OR NEW.pausa_fim < NEW.pausa_inicio THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.pausa_inicio IS NOT DISTINCT FROM OLD.pausa_inicio
     AND NEW.pausa_fim IS NOT DISTINCT FROM OLD.pausa_fim THEN
    RETURN NEW;
  END IF;

  dias_pausa := (NEW.pausa_fim - NEW.pausa_inicio) + 1;

  UPDATE public.mensalidades m
  SET pausa_inicio = NEW.pausa_inicio,
      pausa_fim = NEW.pausa_fim,
      atualizado_em = now()
  WHERE m.aluno_id = NEW.aluno_id
    AND m.status = 'ativa';

  -- Férias estendem a cobrança: parcelas futuras são deslocadas pelo
  -- número de dias da pausa; parcelas pagas/canceladas permanecem intactas.
  UPDATE public.parcelas p
  SET vencimento = p.vencimento + dias_pausa
  FROM public.mensalidades m
  WHERE p.mensalidade_id = m.id
    AND m.aluno_id = NEW.aluno_id
    AND m.status = 'ativa'
    AND p.status NOT IN ('pago', 'cancelada')
    AND p.vencimento >= NEW.pausa_inicio;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sincronizar_pausa_financeira_trigger ON public.planos_alunos;
CREATE TRIGGER sincronizar_pausa_financeira_trigger
AFTER INSERT OR UPDATE OF pausa_inicio, pausa_fim ON public.planos_alunos
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_pausa_financeira();
