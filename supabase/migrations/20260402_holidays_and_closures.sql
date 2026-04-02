-- Tabela de feriados (dias pontuais)
CREATE TABLE IF NOT EXISTS holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'nacional', -- nacional, estadual, municipal, facultativo
  recurring BOOLEAN DEFAULT false, -- se repete todo ano (ex: Natal = true, Carnaval = false)
  clinic_open BOOLEAN DEFAULT false, -- se a clínica abre mesmo assim (ex: ponto facultativo)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de períodos de fechamento (intervalos de vários dias)
CREATE TABLE IF NOT EXISTS clinic_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS para holidays
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON holidays FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RLS para clinic_closures
ALTER TABLE clinic_closures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON clinic_closures FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Pré-carregar feriados nacionais e do RJ para 2026
INSERT INTO holidays (date, name, type, recurring, clinic_open) VALUES
  -- Nacionais 2026
  ('2026-01-01', 'Confraternização Universal (Ano Novo)', 'nacional', true, false),
  ('2026-01-20', 'Dia de São Sebastião (RJ)', 'estadual', true, false),
  ('2026-02-16', 'Carnaval (Segunda-feira)', 'nacional', false, false),
  ('2026-02-17', 'Carnaval (Terça-feira)', 'nacional', false, false),
  ('2026-02-18', 'Quarta-feira de Cinzas (meio dia)', 'facultativo', false, true),
  ('2026-04-03', 'Sexta-feira Santa', 'nacional', false, false),
  ('2026-04-21', 'Tiradentes', 'nacional', true, false),
  ('2026-05-01', 'Dia do Trabalho', 'nacional', true, false),
  ('2026-06-04', 'Corpus Christi', 'nacional', false, false),
  ('2026-09-07', 'Independência do Brasil', 'nacional', true, false),
  ('2026-10-12', 'Nossa Senhora Aparecida', 'nacional', true, false),
  ('2026-11-02', 'Finados', 'nacional', true, false),
  ('2026-11-15', 'Proclamação da República', 'nacional', true, false),
  ('2026-11-20', 'Consciência Negra', 'nacional', true, false),
  ('2026-12-25', 'Natal', 'nacional', true, false),
  -- Pontos facultativos 2026
  ('2026-12-24', 'Véspera de Natal', 'facultativo', true, true),
  ('2026-12-31', 'Véspera de Ano Novo', 'facultativo', true, true);
