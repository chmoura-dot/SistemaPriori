-- Criação da Tabela de Fila de Espera
CREATE TABLE IF NOT EXISTS waiting_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  phone TEXT,
  preferred_days INTEGER[] DEFAULT '{}', -- Array de 0-6 (Domingo a Sábado)
  preferred_hours TEXT[] DEFAULT '{}', -- Array de strings "HH:mm"
  psychologist_id UUID REFERENCES psychologists(id) ON DELETE SET NULL,
  notes TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'called', 'resolved', 'canceled'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE waiting_list ENABLE ROW LEVEL SECURITY;

-- Política de acesso total para usuários autenticados (Coordenação/Admin)
CREATE POLICY "Allow all for authenticated users" ON waiting_list
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
