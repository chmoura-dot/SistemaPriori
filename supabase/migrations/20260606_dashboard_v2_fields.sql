-- Dashboard V2: novos campos para métricas avançadas
-- Campos opcionais — impacto zero no código existente.

-- 1) Fonte de captação do paciente (para CAC segmentado)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS acquisition_source TEXT;

-- 2) Data da triagem/primeira entrevista (para taxa de conversão)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS triagem_date DATE;

-- 3) Flag de no-show (diferente de cancelamento formal)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS no_show BOOLEAN DEFAULT FALSE;

-- Índices de suporte para queries do dashboard
CREATE INDEX IF NOT EXISTS idx_appointments_no_show ON appointments (no_show) WHERE no_show = TRUE;
CREATE INDEX IF NOT EXISTS idx_customers_acquisition_source ON customers (acquisition_source) WHERE acquisition_source IS NOT NULL;
