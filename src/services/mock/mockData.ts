import {
  Customer, CustomerStatus, HealthPlan,
  Plan, AppointmentType,
  Subscription, SubscriptionStatus,
  Payment, Psychologist, Room, Appointment,
  AppointmentStatus, AttendanceMode, Expense, ExpenseCategory,
} from '../types';

export const STORAGE_KEYS = {
  AUTH: 'priori_auth',
  USER: 'priori_user',
  CUSTOMERS: 'priori_customers',
  PLANS: 'priori_plans',
  SUBSCRIPTIONS: 'priori_subscriptions',
  PAYMENTS: 'priori_payments',
  PSYCHOLOGISTS: 'priori_psychologists',
  ROOMS: 'priori_rooms',
  APPOINTMENTS: 'priori_appointments',
  EXPENSES: 'priori_expenses',
  BILLING_BATCHES: 'priori_billing_batches',
  WAITING_LIST: 'priori_waiting_list',
};

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const getFromStorage = <T>(key: string): T[] => {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
};

export const saveToStorage = <T>(key: string, data: T[]) => {
  localStorage.setItem(key, JSON.stringify(data));
};

const seedData = () => {
  // Migração de nomes de planos em storage existente
  const existingPlans = getFromStorage<Plan>(STORAGE_KEYS.PLANS);
  if (existingPlans.length > 0) {
    let changed = false;
    const updatedPlans = existingPlans.map(p => {
      const name = p.name.trim().toLowerCase();
      if (name === 'gama') { p.name = 'Gama Saúde'; changed = true; }
      if (name === 'saude caixa' || name === 'saúde caixa') { p.name = 'Saúde Caixa'; changed = true; }
      if (name === 'fundação saude' || name === 'fundacao saude') { p.name = 'Fundação Saúde Itaú'; changed = true; }
      if (name === 'médico sênior' || name === 'medico senior') { p.name = 'Medsenior'; changed = true; }
      return p;
    });
    if (changed) saveToStorage(STORAGE_KEYS.PLANS, updatedPlans);
  }

  const existingCustomers = getFromStorage<Customer>(STORAGE_KEYS.CUSTOMERS);
  if (existingCustomers.length > 0) {
    let changed = false;
    const updatedCustomers = existingCustomers.map(c => {
      const plan = (c.healthPlan as any || '').toString().trim().toLowerCase();
      if (plan === 'gama') { c.healthPlan = HealthPlan.GAMA; changed = true; }
      if (plan === 'saude caixa' || plan === 'saúde caixa') { c.healthPlan = HealthPlan.SAUDE_CAIXA; changed = true; }
      if (plan === 'fundação saude' || plan === 'fundacao saude') { c.healthPlan = HealthPlan.FUNDACAO_SAUDE; changed = true; }
      if (plan === 'médico sênior' || plan === 'medico senior') { c.healthPlan = HealthPlan.MEDSENIOR; changed = true; }
      return c;
    });
    if (changed) saveToStorage(STORAGE_KEYS.CUSTOMERS, updatedCustomers);
  }

  // ── Dados iniciais ────────────────────────────────────────────────────────
  const avl = (dow: number, s: string, e: string) => ({ dayOfWeek: dow, startTime: s, endTime: e });
  const psychologists: Psychologist[] = [
    { id: 'psy1', name: 'Dra. Ana Beatriz', email: 'ana@priori.com', phone: '(11) 99999-1111', active: true,
      specialties: ['Neuropsicologia', 'Terapia Cognitivo-Comportamental'],
      availability: [avl(1,'08:00','18:00'), avl(3,'08:00','18:00'), avl(5,'08:00','12:00')] },
    { id: 'psy2', name: 'Dr. Ricardo Mello', email: 'ricardo@priori.com', phone: '(11) 99999-2222', active: true,
      specialties: ['Terapia Cognitivo-Comportamental', 'Psicologia Clínica'],
      availability: [avl(2,'09:00','19:00'), avl(4,'09:00','19:00')] },
    { id: 'psy3', name: 'Dra. Juliana Costa', email: 'juliana@priori.com', phone: '(11) 99999-3333', active: true,
      specialties: ['Psicologia Infantil', 'Orientação Parental'],
      availability: [avl(1,'13:00','20:00'), avl(2,'13:00','20:00'), avl(3,'13:00','20:00')] },
    { id: 'psy4', name: 'Dr. Marcos Oliveira', email: 'marcos@priori.com', phone: '(11) 99999-4444', active: true,
      specialties: ['Terapia de Casal', 'Sexualidade Humana'],
      availability: [avl(5,'14:00','21:00'), avl(6,'08:00','13:00')] },
    { id: 'psy5', name: 'Dra. Fernanda Lima', email: 'fernanda@priori.com', phone: '(11) 99999-5555', active: true,
      specialties: ['Psicologia Clínica', 'Psicanálise'],
      availability: [avl(1,'08:00','17:00'), avl(2,'08:00','17:00'), avl(3,'08:00','17:00'), avl(4,'08:00','17:00')] },
    { id: 'psy6', name: 'Dr. Paulo Souza', email: 'paulo@priori.com', phone: '(11) 99999-6666', active: true,
      specialties: ['Avaliação Neuropsicológica', 'Reabilitação Cognitiva'],
      availability: [avl(4,'08:00','18:00'), avl(5,'08:00','18:00')] },
    { id: 'psy7', name: 'Dra. Cláudia Mendes', email: 'claudia@priori.com', phone: '(11) 99999-7777', active: true,
      specialties: ['Terapia de Aceitação e Compromisso', 'Mindfulness'],
      availability: [avl(1,'08:00','20:00'), avl(2,'08:00','20:00')] },
  ];

  const rooms: Room[] = [
    { id: 'room1', name: 'Sala 01', active: true }, { id: 'room2', name: 'Sala 02', active: true },
    { id: 'room3', name: 'Sala 03', active: true }, { id: 'room4', name: 'Sala 04', active: true },
    { id: 'room5', name: 'Sala 05', active: true }, { id: 'room6', name: 'Sala 06', active: true },
  ];

  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const customers: Customer[] = [
    { id: '1', name: 'João Silva',     email: 'joao@email.com',    phone: '(11) 98888-7777', healthPlan: HealthPlan.AMS_PETROBRAS,   psychologistId: 'psy1', status: CustomerStatus.ACTIVE, notes: 'Paciente recorrente', createdAt: now },
    { id: '2', name: 'Maria Santos',   email: 'maria@email.com',   phone: '(11) 97777-6666', healthPlan: HealthPlan.PARTICULAR,      psychologistId: 'psy2', status: CustomerStatus.ACTIVE, notes: 'Valor negociado', customPrice: 180, customRepassAmount: 120, createdAt: now },
    { id: '3', name: 'Pedro Oliveira', email: 'pedro@email.com',   phone: '(11) 96666-5555', healthPlan: HealthPlan.MEDSENIOR,       psychologistId: 'psy3', status: CustomerStatus.ACTIVE, notes: 'Atendimento de 30 min', createdAt: now },
    { id: '4', name: 'Carla Souza',    email: 'carla@email.com',   phone: '(11) 95555-4444', healthPlan: HealthPlan.PORTO_SAUDE,    psychologistId: 'psy4', status: CustomerStatus.ACTIVE, notes: 'Atendimento de 30 min', createdAt: now },
    { id: '5', name: 'Lucas Ferreira', email: 'lucas@email.com',   phone: '(11) 94444-3333', healthPlan: HealthPlan.GAMA,           psychologistId: 'psy5', status: CustomerStatus.ACTIVE, notes: '', createdAt: now },
    { id: '6', name: 'Beatriz Lima',   email: 'beatriz@email.com', phone: '(11) 93333-2222', healthPlan: HealthPlan.SAUDE_CAIXA,   psychologistId: 'psy6', status: CustomerStatus.ACTIVE, notes: '', createdAt: now },
    { id: '7', name: 'Roberto Almeida',email: 'roberto@email.com', phone: '(11) 92222-1111', healthPlan: HealthPlan.FUNDACAO_SAUDE, psychologistId: 'psy1', status: CustomerStatus.ACTIVE, notes: '', createdAt: now },
    { id: '8', name: 'Amanda Costa',   email: 'amanda@email.com',  phone: '(11) 91111-0000', healthPlan: HealthPlan.PARTICULAR,     psychologistId: 'psy2', status: CustomerStatus.ACTIVE, notes: '', createdAt: now },
    { id: '9', name: 'Felipe Rocha',   email: 'felipe@email.com',  phone: '(11) 90000-9999', healthPlan: HealthPlan.PARTICULAR,     psychologistId: 'psy7', status: CustomerStatus.ACTIVE, notes: 'Paciente novo', createdAt: now },
  ];

  const dow = new Date().getDay();
  const appointments: Appointment[] = [
    { id: 'app1', customerId: '1', psychologistId: 'psy1', roomId: 'room1', mode: AttendanceMode.PRESENCIAL, type: AppointmentType.ADULTO, date: today, dayOfWeek: dow, startTime: '08:00', endTime: '08:40', status: AppointmentStatus.ACTIVE, confirmedPatient: true,  confirmedPsychologist: true,  isRecurring: true,  recurrenceGroupId: 'group1', createdAt: now },
    { id: 'app2', customerId: '2', psychologistId: 'psy2', roomId: 'room2', mode: AttendanceMode.PRESENCIAL, type: AppointmentType.ADULTO, date: today, dayOfWeek: dow, startTime: '09:00', endTime: '09:40', status: AppointmentStatus.ACTIVE, confirmedPatient: false, confirmedPsychologist: false, isRecurring: false, createdAt: now },
    { id: 'app3', customerId: '3', psychologistId: 'psy3', roomId: 'room1', mode: AttendanceMode.PRESENCIAL, type: AppointmentType.INFANTIL,date: today, dayOfWeek: dow, startTime: '13:00', endTime: '13:30', status: AppointmentStatus.ACTIVE, confirmedPatient: true,  confirmedPsychologist: true,  isRecurring: true,  recurrenceGroupId: 'group2', needsRenewal: true, createdAt: now },
    { id: 'app4', customerId: '5', psychologistId: 'psy5', mode: AttendanceMode.ONLINE,     type: AppointmentType.ADULTO, date: today, dayOfWeek: dow, startTime: '10:00', endTime: '10:40', status: AppointmentStatus.ACTIVE, confirmedPatient: false, confirmedPsychologist: false, isRecurring: false, createdAt: now },
    { id: 'app5', customerId: '9', psychologistId: 'psy7', roomId: 'room3', mode: AttendanceMode.PRESENCIAL, type: AppointmentType.ADULTO, date: today, dayOfWeek: dow, startTime: '08:00', endTime: '08:40', status: AppointmentStatus.ACTIVE, confirmedPatient: true,  confirmedPsychologist: true,  isRecurring: true,  recurrenceGroupId: 'group3', createdAt: now },
  ];

  localStorage.setItem(STORAGE_KEYS.PSYCHOLOGISTS, JSON.stringify(psychologists));
  localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
  localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
  localStorage.setItem(STORAGE_KEYS.APPOINTMENTS, JSON.stringify(appointments));

  const plans: Plan[] = [
    { id: '1', name: 'Particular', active: true, createdAt: now, procedures: [
      { type: AppointmentType.ADULTO,         code: '10101012', description: 'Consulta em consultório (no horário normal ou preestabelecido)', price: 150,  repassAmount: 100,  isOneTimeCharge: false },
      { type: AppointmentType.INFANTIL,       code: '10101012', description: 'Consulta em consultório (no horário normal ou preestabelecido)', price: 150,  repassAmount: 100,  isOneTimeCharge: false },
      { type: AppointmentType.CASAL,          code: '50000470', description: 'Sessão de Psicoterapia Individual',                              price: 200,  repassAmount: 140,  isOneTimeCharge: false },
      { type: AppointmentType.NEUROPSICOLOGICA,code:'95110011', description: 'Avaliação Neuropsicológica',                                     price: 1500, repassAmount: 1000, isOneTimeCharge: true  },
    ]},
    { id: '2', name: 'AMS Petrobras', active: true, createdAt: now, procedures: [
      { type: AppointmentType.ADULTO,          code: '50000470', description: 'Sessão de Psicoterapia Individual', price: 120,  repassAmount: 80,  isOneTimeCharge: false },
      { type: AppointmentType.INFANTIL,        code: '50000470', description: 'Sessão de Psicoterapia Individual', price: 120,  repassAmount: 80,  isOneTimeCharge: false },
      { type: AppointmentType.NEUROPSICOLOGICA,code: '95110011', description: 'Avaliação Neuropsicológica',        price: 1200, repassAmount: 800, isOneTimeCharge: true  },
    ]},
    { id: '3', name: 'Medsenior', active: true, createdAt: now, procedures: [
      { type: AppointmentType.ADULTO,          code: 'MED-01', description: 'Psicoterapia Adulto',         price: 110,  repassAmount: 70,  isOneTimeCharge: false },
      { type: AppointmentType.NEUROPSICOLOGICA,code: 'MED-02', description: 'Avaliação Neuropsicológica',  price: 1000, repassAmount: 650, isOneTimeCharge: true  },
    ]},
    { id: '4', name: 'Porto Seguro', active: true, createdAt: now, procedures: [
      { type: AppointmentType.ADULTO,          code: 'POR-01', description: 'Psicoterapia Adulto',        price: 130,  repassAmount: 90,  isOneTimeCharge: false },
      { type: AppointmentType.NEUROPSICOLOGICA,code: 'POR-02', description: 'Avaliação Neuropsicológica', price: 1100, repassAmount: 750, isOneTimeCharge: true  },
    ]},
    { id: '5', name: 'Gama Saúde',         active: true, createdAt: now, procedures: [{ type: AppointmentType.ADULTO, code: 'GAM-01', description: 'Psicoterapia Adulto', price: 100, repassAmount: 65, isOneTimeCharge: false }] },
    { id: '6', name: 'Saúde Caixa',        active: true, createdAt: now, procedures: [{ type: AppointmentType.ADULTO, code: 'CAI-01', description: 'Psicoterapia Adulto', price: 115, repassAmount: 75, isOneTimeCharge: false }] },
    { id: '7', name: 'Fundação Saúde Itaú',active: true, createdAt: now, procedures: [{ type: AppointmentType.ADULTO, code: 'ITA-01', description: 'Psicoterapia Adulto', price: 105, repassAmount: 68, isOneTimeCharge: false }] },
  ];

  const subscriptions: Subscription[] = [
    { id: '1', customerId: '1', planId: '2', startDate: '2024-01-01', nextRenewal: '2024-02-01', status: SubscriptionStatus.ACTIVE,  createdAt: now },
    { id: '2', customerId: '2', planId: '1', startDate: '2024-01-15', nextRenewal: '2024-02-15', status: SubscriptionStatus.ACTIVE,  createdAt: now },
    { id: '3', customerId: '3', planId: '2', startDate: '2023-12-01', nextRenewal: '2024-01-01', status: SubscriptionStatus.EXPIRED, createdAt: now },
  ];

  const payments: Payment[] = [
    { id: '1', subscriptionId: '1', amount: 500, repassAmount: 350, paidAt: '2024-01-01', createdAt: now },
    { id: '2', subscriptionId: '2', amount: 150, repassAmount: 100, paidAt: '2024-01-15', createdAt: now },
  ];

  const expenses: Expense[] = [
    { id: 'exp1', description: 'Aluguel do Consultório',   amount: 2500, category: ExpenseCategory.RENT,      date: today, isRecurring: true, createdAt: now },
    { id: 'exp2', description: 'Internet e Telefone',      amount: 200,  category: ExpenseCategory.UTILITIES, date: today, isRecurring: true, createdAt: now },
    { id: 'exp3', description: 'Imposto Simples Nacional', amount: 450,  category: ExpenseCategory.TAX,       date: today, isRecurring: true, createdAt: now },
  ];

  localStorage.setItem(STORAGE_KEYS.PLANS,         JSON.stringify(plans));
  localStorage.setItem(STORAGE_KEYS.SUBSCRIPTIONS,  JSON.stringify(subscriptions));
  localStorage.setItem(STORAGE_KEYS.PAYMENTS,       JSON.stringify(payments));
  localStorage.setItem(STORAGE_KEYS.EXPENSES,       JSON.stringify(expenses));
};

seedData();
