-- O cancelamento de uma mensalidade precisa ter representação persistida nas parcelas futuras.
ALTER TABLE public.parcelas
  DROP CONSTRAINT IF EXISTS parcelas_status_check;

ALTER TABLE public.parcelas
  ADD CONSTRAINT parcelas_status_check
  CHECK (status IN ('pago', 'pendente', 'atrasado', 'cancelada'));
