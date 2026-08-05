-- =====================================================================
-- HARDENING DE SEGURANÇA E INTEGRIDADE - NÚCLEO PRIORI
-- =====================================================================

-- 1. Garante que o RLS está ativo nas tabelas sensíveis
ALTER TABLE IF EXISTS customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS psychologists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS repasses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS billing_batches ENABLE ROW LEVEL SECURITY;

-- 2. Remove políticas genéricas anteriores que permitiam acesso total a 'authenticated'
DROP POLICY IF EXISTS "Allow all for authenticated" ON appointments;
DROP POLICY IF EXISTS "Allow all for authenticated" ON customers;
DROP POLICY IF EXISTS "Allow all for authenticated" ON psychologists;
DROP POLICY IF EXISTS "Allow all for authenticated" ON repasses;

-- 3. Cria políticas restritivas baseadas no ID do usuário autenticado (auth.uid())
-- Isso garante que um usuário só manipule registros vinculados ao seu próprio escopo ou permissão

-- Garante que não haverá conflito de nomes se você rodar o script mais de uma vez
DROP POLICY IF EXISTS "Isolate appointments by user or psychologist" ON appointments;
CREATE POLICY "Isolate appointments by user or psychologist" ON appointments
    FOR ALL TO authenticated
    USING (
      psychologist_id::text = auth.uid()::text 
      OR EXISTS (
        SELECT 1 FROM psychologists p 
        WHERE p.id::text = auth.uid()::text AND p.active = true
      )
    )
    WITH CHECK (
      psychologist_id::text = auth.uid()::text 
      OR EXISTS (
        SELECT 1 FROM psychologists p 
        WHERE p.id::text = auth.uid()::text AND p.active = true
      )
    );

DROP POLICY IF EXISTS "Restrict customers access to authenticated staff" ON customers;
CREATE POLICY "Restrict customers access to authenticated staff" ON customers
    FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Isolate repasses for target psychologist" ON repasses;
CREATE POLICY "Isolate repasses for target psychologist" ON repasses
    FOR ALL TO authenticated
    USING (
      psychologist_id::text = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM psychologists p 
        WHERE p.id::text = auth.uid()::text AND p.active = true
      )
    )
    WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Blindagem de Integridade Financeira (Foreign Keys com Restrição de Deleção)
-- Previne deleções em cascata indesejadas em registros contábeis
ALTER TABLE IF EXISTS repasses 
    DROP CONSTRAINT IF EXISTS repasses_psychologist_id_fkey,
    ADD CONSTRAINT repasses_psychologist_id_fkey 
    FOREIGN KEY (psychologist_id) 
    REFERENCES psychologists(id) 
    ON DELETE RESTRICT;
