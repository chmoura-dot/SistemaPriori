export enum CustomerStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive'
}

export enum InactivationReason {
  DESISTENCIA = 'Desistência',
  PERDA_PLANO = 'Perda do Plano',
  ALTA_PSICOLOGO = 'Liberação / Alta por psicólogo'
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled'
}

export enum RepasseStatus {
  PENDING = 'pending',
  PAID = 'paid'
}

export enum HealthPlan {
  AMS_PETROBRAS = 'AMS Petrobras',
  PAE = 'PAE',
  PORTO_SAUDE = 'Porto Saude',
  MEDSENIOR = 'Medsenior',
  REAL_GRANDEZA = 'Real Grandeza',
  SAUDE_BLUE = 'Saude Blue',
  GAMA = 'Gama Saude',
  SAUDE_CAIXA = 'Saude Caixa',
  FUNDACAO_SAUDE = 'Fundação Saúde Itaú',
  PARTICULAR = 'Particular'
}

export enum RecurrenceFrequency {
  SEMANAL = 'Semanal',
  QUINZENAL = 'Quinzenal'
}

export enum AppointmentType {
  INFANTIL = 'Psicoterapia Infantil',
  ADULTO = 'Psicoterapia Adulto',
  CASAL = 'Terapia de Casal',
  NEUROPSICOLOGICA = 'Avaliação Neuropsicológica'
}

export enum AttendanceMode {
  PRESENCIAL = 'Presencial',
  ONLINE = 'On-line'
}

export enum AppointmentStatus {
  ACTIVE = 'active',
  RELEASED = 'released',
  CANCELED = 'canceled'
}

export enum BillingBatchStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  PARTIALLY_PAID = 'partially_paid',
  PAID = 'paid'
}


export enum ExpenseCategory {
  // Infraestrutura e Fixos
  RENT = 'Aluguel e Condomínio',
  UTILITIES = 'Água / Luz / Internet / Telefone',
  MAINTENANCE = 'Manutenção e Limpeza',

  // Despesas com Pessoal
  SALARY = 'Folha de Pagamento / Salários',
  PRO_LABORE = 'Pró-labore (Retirada de Sócios)',

  // Operacional da Clínica
  PSYCH_MATERIALS = 'Materiais e Testes Psicológicos',
  SUPPLIES = 'Suprimentos e Copa',

  // Tecnologia e Vendas
  MARKETING = 'Marketing e Publicidade',
  SOFTWARE = 'Softwares e Sistemas',

  // Financeiro e Administrativo
  TAX = 'Impostos e Contabilidade',
  BANK_FEES = 'Taxas Bancárias / Maquininhas',
  LOAN = 'Empréstimos e Financiamentos',

  // Gerais
  OTHER = 'Outras Despesas'
}

export enum UserRole {
  ADMIN = 'admin',
  SECRETARIA = 'secretaria'
}
