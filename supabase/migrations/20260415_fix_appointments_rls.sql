-- Corrigir RLS da tabela appointments
-- O problema: RLS estava habilitado mas sem políticas, bloqueando todo acesso via anon key
-- Isso causava o frontend não ver nenhum agendamento (retornava 0 registros)

-- Habilitar RLS (caso não esteja)
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas se existirem (para evitar conflito)
DROP POLICY IF EXISTS "Allow all for authenticated" ON appointments;
DROP POLICY IF EXISTS "appointments_authenticated_all" ON appointments;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON appointments;
DROP POLICY IF EXISTS "Allow authenticated users full access" ON appointments;

-- Criar política que permite TUDO para usuários autenticados
-- (mesma abordagem usada em holidays e clinic_closures)
CREATE POLICY "Allow all for authenticated" ON appointments
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Comentário explicativo
COMMENT ON TABLE appointments IS 
  'Tabela de agendamentos. RLS habilitado: apenas usuários autenticados têm acesso total.';
