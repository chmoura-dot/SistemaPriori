import { 
  AppService, 
  Customer, 
  CustomerStatus, 
  Plan, 
  Subscription, 
  SubscriptionStatus, 
  Payment,
  Psychologist,
  Room,
  Appointment,
  AppointmentStatus,
  HealthPlan,
  Expense,
  ExpenseCategory,
  AppointmentType,
  AttendanceMode,
  BillingBatch,
  BillingBatchStatus,
  WaitingListEntry,
  User,
  UserRole
} from './types';

const STORAGE_KEYS = {
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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const seedData = () => {
  // Migration for plan names in existing storage
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

  const psychologists: Psychologist[] = [
    { 
      id: 'psy1', 
      name: 'Dra. Ana Beatriz', 
      email: 'ana@priori.com',
      specialties: ['Neuropsicologia', 'Terapia Cognitivo-Comportamental'], 
      phone: '(11) 99999-1111',
      active: true,
      availability: [
        { dayOfWeek: 1, startTime: '08:00', endTime: '18:00' },
        { dayOfWeek: 3, startTime: '08:00', endTime: '18:00' },
        { dayOfWeek: 5, startTime: '08:00', endTime: '12:00' },
      ]
    },
    { 
      id: 'psy2', 
      name: 'Dr. Ricardo Mello', 
      email: 'ricardo@priori.com',
      specialties: ['Terapia Cognitivo-Comportamental', 'Psicologia Clínica'], 
      phone: '(11) 99999-2222',
      active: true,
      availability: [
        { dayOfWeek: 2, startTime: '09:00', endTime: '19:00' },
        { dayOfWeek: 4, startTime: '09:00', endTime: '19:00' },
      ]
    },
    { 
      id: 'psy3', 
      name: 'Dra. Juliana Costa', 
      email: 'juliana@priori.com',
      specialties: ['Psicologia Infantil', 'Orientação Parental'], 
      phone: '(11) 99999-3333',
      active: true,
      availability: [
        { dayOfWeek: 1, startTime: '13:00', endTime: '20:00' },
        { dayOfWeek: 2, startTime: '13:00', endTime: '20:00' },
        { dayOfWeek: 3, startTime: '13:00', endTime: '20:00' },
      ]
    },
    { 
      id: 'psy4', 
      name: 'Dr. Marcos Oliveira', 
      email: 'marcos@priori.com',
      specialties: ['Terapia de Casal', 'Sexualidade Humana'], 
      phone: '(11) 99999-4444',
      active: true,
      availability: [
        { dayOfWeek: 5, startTime: '14:00', endTime: '21:00' },
        { dayOfWeek: 6, startTime: '08:00', endTime: '13:00' },
      ]
    },
    { 
      id: 'psy5', 
      name: 'Dra. Fernanda Lima', 
      email: 'fernanda@priori.com',
      specialties: ['Psicologia Clínica', 'Psicanálise'], 
      phone: '(11) 99999-5555',
      active: true,
      availability: [
        { dayOfWeek: 1, startTime: '08:00', endTime: '17:00' },
        { dayOfWeek: 2, startTime: '08:00', endTime: '17:00' },
        { dayOfWeek: 3, startTime: '08:00', endTime: '17:00' },
        { dayOfWeek: 4, startTime: '08:00', endTime: '17:00' },
      ]
    },
    { 
      id: 'psy6', 
      name: 'Dr. Paulo Souza', 
      email: 'paulo@priori.com',
      specialties: ['Avaliação Neuropsicológica', 'Reabilitação Cognitiva'], 
      phone: '(11) 99999-6666',
      active: true,
      availability: [
        { dayOfWeek: 4, startTime: '08:00', endTime: '18:00' },
        { dayOfWeek: 5, startTime: '08:00', endTime: '18:00' },
      ]
    },
    { 
      id: 'psy7', 
      name: 'Dra. Cláudia Mendes', 
      email: 'claudia@priori.com',
      specialties: ['Terapia de Aceitação e Compromisso', 'Mindfulness'], 
      phone: '(11) 99999-7777',
      active: true,
      availability: [
        { dayOfWeek: 1, startTime: '08:00', endTime: '20:00' },
        { dayOfWeek: 2, startTime: '08:00', endTime: '20:00' },
      ]
    },
  ];

  const rooms: Room[] = [
    { id: 'room1', name: 'Sala 01', active: true },
    { id: 'room2', name: 'Sala 02', active: true },
    { id: 'room3', name: 'Sala 03', active: true },
    { id: 'room4', name: 'Sala 04', active: true },
    { id: 'room5', name: 'Sala 05', active: true },
    { id: 'room6', name: 'Sala 06', active: true },
  ];

  const customers: Customer[] = [
    { 
      id: '1', 
      name: 'João Silva', 
      email: 'joao@email.com', 
      phone: '(11) 98888-7777',
      healthPlan: HealthPlan.AMS_PETROBRAS,
      psychologistId: 'psy1',
      status: CustomerStatus.ACTIVE, 
      notes: 'Paciente recorrente', 
      createdAt: new Date().toISOString() 
    },
    { 
      id: '2', 
      name: 'Maria Santos', 
      email: 'maria@email.com', 
      phone: '(11) 97777-6666',
      healthPlan: HealthPlan.PARTICULAR,
      psychologistId: 'psy2',
      status: CustomerStatus.ACTIVE, 
      notes: 'Valor negociado', 
      customPrice: 180,
      customRepassAmount: 120,
      createdAt: new Date().toISOString() 
    },
    { 
      id: '3', 
      name: 'Pedro Oliveira', 
      email: 'pedro@email.com', 
      phone: '(11) 96666-5555',
      healthPlan: HealthPlan.MEDSENIOR,
      psychologistId: 'psy3',
      status: CustomerStatus.ACTIVE, 
      notes: 'Atendimento de 30 min', 
      createdAt: new Date().toISOString() 
    },
    { 
      id: '4', 
      name: 'Carla Souza', 
      email: 'carla@email.com', 
      phone: '(11) 95555-4444',
      healthPlan: HealthPlan.PORTO_SAUDE,
      psychologistId: 'psy4',
      status: CustomerStatus.ACTIVE, 
      notes: 'Atendimento de 30 min', 
      createdAt: new Date().toISOString() 
    },
    { 
      id: '5', 
      name: 'Lucas Ferreira', 
      email: 'lucas@email.com', 
      phone: '(11) 94444-3333',
      healthPlan: HealthPlan.GAMA,
      psychologistId: 'psy5',
      status: CustomerStatus.ACTIVE, 
      notes: '', 
      createdAt: new Date().toISOString() 
    },
    { 
      id: '6', 
      name: 'Beatriz Lima', 
      email: 'beatriz@email.com', 
      phone: '(11) 93333-2222',
      healthPlan: HealthPlan.SAUDE_CAIXA,
      psychologistId: 'psy6',
      status: CustomerStatus.ACTIVE, 
      notes: '', 
      createdAt: new Date().toISOString() 
    },
    { 
      id: '7', 
      name: 'Roberto Almeida', 
      email: 'roberto@email.com', 
      phone: '(11) 92222-1111',
      healthPlan: HealthPlan.FUNDACAO_SAUDE,
      psychologistId: 'psy1',
      status: CustomerStatus.ACTIVE, 
      notes: '', 
      createdAt: new Date().toISOString() 
    },
    { 
      id: '8', 
      name: 'Amanda Costa', 
      email: 'amanda@email.com', 
      phone: '(11) 91111-0000',
      healthPlan: HealthPlan.PARTICULAR,
      psychologistId: 'psy2',
      status: CustomerStatus.ACTIVE, 
      notes: '', 
      createdAt: new Date().toISOString() 
    },
    { 
      id: '9', 
      name: 'Felipe Rocha', 
      email: 'felipe@email.com', 
      phone: '(11) 90000-9999',
      healthPlan: HealthPlan.PARTICULAR,
      psychologistId: 'psy7',
      status: CustomerStatus.ACTIVE, 
      notes: 'Paciente novo', 
      createdAt: new Date().toISOString() 
    },
  ];

  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().split('T')[0];

  const appointments: Appointment[] = [
    {
      id: 'app1',
      customerId: '1',
      psychologistId: 'psy1',
      roomId: 'room1',
      mode: AttendanceMode.PRESENCIAL,
      type: AppointmentType.ADULTO,
      date: today,
      dayOfWeek: new Date().getDay(),
      startTime: '08:00',
      endTime: '08:40',
      status: AppointmentStatus.ACTIVE,
      confirmedPatient: true,
      confirmedPsychologist: true,
      isRecurring: true,
      recurrenceGroupId: 'group1',
      createdAt: new Date().toISOString()
    },
    {
      id: 'app2',
      customerId: '2',
      psychologistId: 'psy2',
      roomId: 'room2',
      mode: AttendanceMode.PRESENCIAL,
      type: AppointmentType.ADULTO,
      date: today,
      dayOfWeek: new Date().getDay(),
      startTime: '09:00',
      endTime: '09:40',
      status: AppointmentStatus.ACTIVE,
      confirmedPatient: false,
      confirmedPsychologist: false,
      isRecurring: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'app3',
      customerId: '3',
      psychologistId: 'psy3',
      roomId: 'room1',
      mode: AttendanceMode.PRESENCIAL,
      type: AppointmentType.INFANTIL,
      date: today,
      dayOfWeek: new Date().getDay(),
      startTime: '13:00',
      endTime: '13:30',
      status: AppointmentStatus.ACTIVE,
      confirmedPatient: true,
      confirmedPsychologist: true,
      isRecurring: true,
      recurrenceGroupId: 'group2',
      needsRenewal: true, // This one shows the alert
      createdAt: new Date().toISOString()
    },
    {
      id: 'app4',
      customerId: '5',
      psychologistId: 'psy5',
      mode: AttendanceMode.ONLINE,
      type: AppointmentType.ADULTO,
      date: today,
      dayOfWeek: new Date().getDay(),
      startTime: '10:00',
      endTime: '10:40',
      status: AppointmentStatus.ACTIVE,
      confirmedPatient: false,
      confirmedPsychologist: false,
      isRecurring: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'app5',
      customerId: '9',
      psychologistId: 'psy7',
      roomId: 'room3',
      mode: AttendanceMode.PRESENCIAL,
      type: AppointmentType.ADULTO,
      date: today,
      dayOfWeek: new Date().getDay(),
      startTime: '08:00',
      endTime: '08:40',
      status: AppointmentStatus.ACTIVE,
      confirmedPatient: true,
      confirmedPsychologist: true,
      isRecurring: true,
      recurrenceGroupId: 'group3',
      createdAt: new Date().toISOString()
    }
  ];

  localStorage.setItem(STORAGE_KEYS.PSYCHOLOGISTS, JSON.stringify(psychologists));
  localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
  localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
  localStorage.setItem(STORAGE_KEYS.APPOINTMENTS, JSON.stringify(appointments));

  const plans: Plan[] = [
    { 
      id: '1', 
      name: 'Particular', 
      procedures: [
        { type: AppointmentType.ADULTO, code: '10101012', description: 'Consulta em consultório (no horário normal ou preestabelecido)', price: 150, repassAmount: 100, isOneTimeCharge: false },
        { type: AppointmentType.INFANTIL, code: '10101012', description: 'Consulta em consultório (no horário normal ou preestabelecido)', price: 150, repassAmount: 100, isOneTimeCharge: false },
        { type: AppointmentType.CASAL, code: '50000470', description: 'Sessão de Psicoterapia Individual', price: 200, repassAmount: 140, isOneTimeCharge: false },
        { type: AppointmentType.NEUROPSICOLOGICA, code: '95110011', description: 'Avaliação Neuropsicológica', price: 1500, repassAmount: 1000, isOneTimeCharge: true },
      ],
      active: true, 
      createdAt: new Date().toISOString() 
    },
    { 
      id: '2', 
      name: 'AMS Petrobras', 
      procedures: [
        { type: AppointmentType.ADULTO, code: '50000470', description: 'Sessão de Psicoterapia Individual', price: 120, repassAmount: 80, isOneTimeCharge: false },
        { type: AppointmentType.INFANTIL, code: '50000470', description: 'Sessão de Psicoterapia Individual', price: 120, repassAmount: 80, isOneTimeCharge: false },
        { type: AppointmentType.NEUROPSICOLOGICA, code: '95110011', description: 'Avaliação Neuropsicológica', price: 1200, repassAmount: 800, isOneTimeCharge: true },
      ],
      active: true, 
      createdAt: new Date().toISOString() 
    },
    { 
      id: '3', 
      name: 'Medsenior', 
      procedures: [
        { type: AppointmentType.ADULTO, code: 'MED-01', description: 'Psicoterapia Adulto', price: 110, repassAmount: 70, isOneTimeCharge: false },
        { type: AppointmentType.NEUROPSICOLOGICA, code: 'MED-02', description: 'Avaliação Neuropsicológica', price: 1000, repassAmount: 650, isOneTimeCharge: true },
      ],
      active: true, 
      createdAt: new Date().toISOString() 
    },
    { 
      id: '4', 
      name: 'Porto Seguro', 
      procedures: [
        { type: AppointmentType.ADULTO, code: 'POR-01', description: 'Psicoterapia Adulto', price: 130, repassAmount: 90, isOneTimeCharge: false },
        { type: AppointmentType.NEUROPSICOLOGICA, code: 'POR-02', description: 'Avaliação Neuropsicológica', price: 1100, repassAmount: 750, isOneTimeCharge: true },
      ],
      active: true, 
      createdAt: new Date().toISOString() 
    },
    { 
      id: '5', 
      name: 'Gama Saúde', 
      procedures: [
        { type: AppointmentType.ADULTO, code: 'GAM-01', description: 'Psicoterapia Adulto', price: 100, repassAmount: 65, isOneTimeCharge: false },
      ],
      active: true, 
      createdAt: new Date().toISOString() 
    },
    { 
      id: '6', 
      name: 'Saúde Caixa', 
      procedures: [
        { type: AppointmentType.ADULTO, code: 'CAI-01', description: 'Psicoterapia Adulto', price: 115, repassAmount: 75, isOneTimeCharge: false },
      ],
      active: true, 
      createdAt: new Date().toISOString() 
    },
    { 
      id: '7', 
      name: 'Fundação Saúde Itaú', 
      procedures: [
        { type: AppointmentType.ADULTO, code: 'ITA-01', description: 'Psicoterapia Adulto', price: 105, repassAmount: 68, isOneTimeCharge: false },
      ],
      active: true, 
      createdAt: new Date().toISOString() 
    },
  ];

  const subscriptions: Subscription[] = [
    { 
      id: '1', 
      customerId: '1', 
      planId: '2', 
      startDate: '2024-01-01', 
      nextRenewal: '2024-02-01', 
      status: SubscriptionStatus.ACTIVE, 
      createdAt: new Date().toISOString() 
    },
    { 
      id: '2', 
      customerId: '2', 
      planId: '1', 
      startDate: '2024-01-15', 
      nextRenewal: '2024-02-15', 
      status: SubscriptionStatus.ACTIVE, 
      createdAt: new Date().toISOString() 
    },
    { 
      id: '3', 
      customerId: '3', 
      planId: '2', 
      startDate: '2023-12-01', 
      nextRenewal: '2024-01-01', 
      status: SubscriptionStatus.EXPIRED, 
      createdAt: new Date().toISOString() 
    },
  ];

  const payments: Payment[] = [
    { id: '1', subscriptionId: '1', amount: 500, repassAmount: 350, paidAt: '2024-01-01', createdAt: new Date().toISOString() },
    { id: '2', subscriptionId: '2', amount: 150, repassAmount: 100, paidAt: '2024-01-15', createdAt: new Date().toISOString() },
  ];

  const expenses: Expense[] = [
    {
      id: 'exp1',
      description: 'Aluguel do Consultório',
      amount: 2500,
      category: ExpenseCategory.RENT,
      date: new Date().toISOString().split('T')[0],
      isRecurring: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'exp2',
      description: 'Internet e Telefone',
      amount: 200,
      category: ExpenseCategory.UTILITIES,
      date: new Date().toISOString().split('T')[0],
      isRecurring: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'exp3',
      description: 'Imposto Simples Nacional',
      amount: 450,
      category: ExpenseCategory.TAX,
      date: new Date().toISOString().split('T')[0],
      isRecurring: true,
      createdAt: new Date().toISOString()
    }
  ];

  localStorage.setItem(STORAGE_KEYS.PLANS, JSON.stringify(plans));
  localStorage.setItem(STORAGE_KEYS.SUBSCRIPTIONS, JSON.stringify(subscriptions));
  localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(payments));
  localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
};

const getFromStorage = <T>(key: string): T[] => {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
};

const saveToStorage = <T>(key: string, data: T[]) => {
  localStorage.setItem(key, JSON.stringify(data));
};

seedData();

export const mockService: AppService = {
  getInvoices: async (_params) => {
    await delay(200);
    return [];
  },

  createInvoice: async (_data) => {
    await delay(300);
    return { success: true };
  },

  login: async (email, password) => {
    await delay(500);
    
    let role: UserRole | null = null;
    const normalizedEmail = email.toLowerCase().trim();
    
    if ((normalizedEmail === 'admin@priori.com' || normalizedEmail === 'admin@prioriclinica.com.br') && password === 'admin123') {
      role = UserRole.ADMIN;
    } else if ((normalizedEmail === 'secretaria@priori.com' || normalizedEmail === 'secretaria@prioriclinica.com.br') && password === 'sec123') {
      role = UserRole.SECRETARIA;
    }
    
    if (role) {
      const user: User = { email: normalizedEmail, role };
      localStorage.setItem(STORAGE_KEYS.AUTH, 'true');
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      return user;
    }
    
    return null;
  },
  logout: () => {
    localStorage.removeItem(STORAGE_KEYS.AUTH);
    localStorage.removeItem(STORAGE_KEYS.USER);
  },
  isAuthenticated: () => {
    return localStorage.getItem(STORAGE_KEYS.AUTH) === 'true';
  },
  getCurrentUser: () => {
    const userData = localStorage.getItem(STORAGE_KEYS.USER);
    return userData ? JSON.parse(userData) : null;
  },

  getPsychologists: async () => {
    await delay(200);
    return getFromStorage<Psychologist>(STORAGE_KEYS.PSYCHOLOGISTS);
  },
  createPsychologist: async (data) => {
    await delay(500);
    const psychologists = getFromStorage<Psychologist>(STORAGE_KEYS.PSYCHOLOGISTS);
    const newPsychologist: Psychologist = {
      ...data,
      id: Math.random().toString(36).substr(2, 9),
    };
    saveToStorage(STORAGE_KEYS.PSYCHOLOGISTS, [...psychologists, newPsychologist]);
    return newPsychologist;
  },
  updatePsychologist: async (id, data) => {
    await delay(500);
    const psychologists = getFromStorage<Psychologist>(STORAGE_KEYS.PSYCHOLOGISTS);
    const index = psychologists.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Psychologist not found');
    const updated = { ...psychologists[index], ...data };
    psychologists[index] = updated;
    saveToStorage(STORAGE_KEYS.PSYCHOLOGISTS, psychologists);
    return updated;
  },
  deletePsychologist: async (id) => {
    await delay(500);
    const psychologists = getFromStorage<Psychologist>(STORAGE_KEYS.PSYCHOLOGISTS);
    saveToStorage(STORAGE_KEYS.PSYCHOLOGISTS, psychologists.filter(p => p.id !== id));
  },

  getRooms: async () => {
    await delay(200);
    return getFromStorage<Room>(STORAGE_KEYS.ROOMS);
  },

  getAppointments: async (date) => {
    await delay(300);
    const appointments = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    if (date) {
      return appointments.filter(a => a.date === date);
    }
    return appointments;
  },

  createAppointment: async (data) => {
    await delay(500);
    const appointments = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    
    const customers = getFromStorage<Customer>(STORAGE_KEYS.CUSTOMERS);
    const plans = getFromStorage<Plan>(STORAGE_KEYS.PLANS);
    const customer = customers.find(c => c.id === data.customerId);
    const plan = plans.find(p => p.name === customer?.healthPlan);
    const procedure = plan?.procedures?.find(proc => proc.type === data.type);

    const basePrice = data.customPrice ?? (customer?.customPrice ?? procedure?.price);
    const baseRepass = data.customRepassAmount ?? (customer?.customRepassAmount ?? procedure?.repassAmount);

    const createSingle = (date: string, isRecurring: boolean, groupId?: string, needsRenewal?: boolean) => {
      // Conflict check for Presencial
      if (data.mode === AttendanceMode.PRESENCIAL && data.roomId) {
        const conflict = appointments.find(a => {
          if (a.date !== date || a.roomId !== data.roomId || a.mode !== AttendanceMode.PRESENCIAL) return false;
          return data.startTime < a.endTime && data.endTime > a.startTime;
        });
        if (conflict) {
          throw new Error(`Conflito em ${date}: Sala ocupada (${conflict.startTime} - ${conflict.endTime}).`);
        }
      }

      const dateObj = new Date(date + 'T12:00:00');
      const newApp: Appointment = {
        ...data,
        id: Math.random().toString(36).substr(2, 9),
        date,
        dayOfWeek: dateObj.getDay(),
        status: data.status || AppointmentStatus.ACTIVE,
        isRecurring,
        recurrenceGroupId: groupId,
        needsRenewal,
        customPrice: basePrice,
        customRepassAmount: baseRepass,
        confirmedPatient: false,
        confirmedPsychologist: false,
        createdAt: new Date().toISOString(),
      };
      return newApp;
    };

    if (data.isRecurring) {
      const groupId = Math.random().toString(36).substr(2, 9);
      const newApps: Appointment[] = [];
      
      for (let i = 0; i < 4; i++) {
        const d = new Date(data.date + 'T12:00:00');
        d.setDate(d.getDate() + (i * 7));
        const dateStr = d.toISOString().split('T')[0];
        
        // The 4th session (index 3) is the last of this block, so it needs renewal
        newApps.push(createSingle(dateStr, true, groupId, i === 3));
      }
      
      saveToStorage(STORAGE_KEYS.APPOINTMENTS, [...appointments, ...newApps]);
      return newApps[0];
    } else {
      const newApp = createSingle(data.date, false);
      saveToStorage(STORAGE_KEYS.APPOINTMENTS, [...appointments, newApp]);
      return newApp;
    }
  },

  updateAppointment: async (id, data) => {
    await delay(300);
    const appointments = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    const appIndex = appointments.findIndex(a => a.id === id);
    if (appIndex === -1) throw new Error('Appointment not found');
    
    const originalApp = appointments[appIndex];
    
    // If psychologist is changing and it's part of a recurring group, 
    // we might want to update all future ones in the same group.
    // For simplicity in the mock, if it's a recurrence group, we update all future ones.
    if (data.psychologistId && originalApp.recurrenceGroupId) {
      const updated = appointments.map(a => {
        if (a.recurrenceGroupId === originalApp.recurrenceGroupId && a.date >= originalApp.date) {
          return { ...a, ...data };
        }
        return a.id === id ? { ...a, ...data } : a;
      });
      saveToStorage(STORAGE_KEYS.APPOINTMENTS, updated);
      return updated.find(a => a.id === id)!;
    }

    const updated = appointments.map(a => a.id === id ? { ...a, ...data } : a);
    saveToStorage(STORAGE_KEYS.APPOINTMENTS, updated);
    return updated.find(a => a.id === id)!;
  },

  deleteAppointment: async (id) => {
    await delay(500);
    const appointments = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    saveToStorage(STORAGE_KEYS.APPOINTMENTS, appointments.filter(a => a.id !== id));
  },

  getCustomers: async () => {
    await delay(300);
    return getFromStorage<Customer>(STORAGE_KEYS.CUSTOMERS);
  },
  createCustomer: async (data) => {
    await delay(500);
    const customers = getFromStorage<Customer>(STORAGE_KEYS.CUSTOMERS);
    const newCustomer: Customer = {
      ...data,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
    };
    saveToStorage(STORAGE_KEYS.CUSTOMERS, [...customers, newCustomer]);
    return newCustomer;
  },
  updateCustomer: async (id, data) => {
    await delay(500);
    const customers = getFromStorage<Customer>(STORAGE_KEYS.CUSTOMERS);
    const index = customers.findIndex(c => c.id === id);
    if (index === -1) throw new Error('Customer not found');
    const updated = { ...customers[index], ...data };
    customers[index] = updated;
    saveToStorage(STORAGE_KEYS.CUSTOMERS, customers);
    return updated;
  },
  deleteCustomer: async (id) => {
    await delay(500);
    const customers = getFromStorage<Customer>(STORAGE_KEYS.CUSTOMERS);
    saveToStorage(STORAGE_KEYS.CUSTOMERS, customers.filter(c => c.id !== id));
  },

  getPlans: async () => {
    await delay(300);
    return getFromStorage<Plan>(STORAGE_KEYS.PLANS);
  },
  createPlan: async (data) => {
    await delay(500);
    const plans = getFromStorage<Plan>(STORAGE_KEYS.PLANS);
    const newPlan: Plan = {
      ...data,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
    };
    saveToStorage(STORAGE_KEYS.PLANS, [...plans, newPlan]);
    return newPlan;
  },
  updatePlan: async (id, data) => {
    await delay(500);
    const plans = getFromStorage<Plan>(STORAGE_KEYS.PLANS);
    const index = plans.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Plan not found');
    const updated = { ...plans[index], ...data };
    plans[index] = updated;
    saveToStorage(STORAGE_KEYS.PLANS, plans);
    return updated;
  },
  deletePlan: async (id) => {
    await delay(500);
    const plans = getFromStorage<Plan>(STORAGE_KEYS.PLANS);
    saveToStorage(STORAGE_KEYS.PLANS, plans.filter(p => p.id !== id));
  },

  getSubscriptions: async () => {
    await delay(300);
    const subs = getFromStorage<Subscription>(STORAGE_KEYS.SUBSCRIPTIONS);
    const today = new Date().toISOString().split('T')[0];
    
    // Auto-expire logic
    let changed = false;
    const updatedSubs = subs.map(s => {
      if (s.status === SubscriptionStatus.ACTIVE && today > s.nextRenewal) {
        changed = true;
        return { ...s, status: SubscriptionStatus.EXPIRED };
      }
      return s;
    });

    if (changed) {
      saveToStorage(STORAGE_KEYS.SUBSCRIPTIONS, updatedSubs);
    }
    
    return updatedSubs;
  },
  createSubscription: async (data) => {
    await delay(500);
    const subs = getFromStorage<Subscription>(STORAGE_KEYS.SUBSCRIPTIONS);
    const newSub: Subscription = {
      ...data,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
    };
    saveToStorage(STORAGE_KEYS.SUBSCRIPTIONS, [...subs, newSub]);
    return newSub;
  },
  updateSubscription: async (id, data) => {
    await delay(500);
    const subs = getFromStorage<Subscription>(STORAGE_KEYS.SUBSCRIPTIONS);
    const index = subs.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Subscription not found');
    const updated = { ...subs[index], ...data };
    subs[index] = updated;
    saveToStorage(STORAGE_KEYS.SUBSCRIPTIONS, subs);
    return updated;
  },
  deleteSubscription: async (id) => {
    await delay(500);
    const subs = getFromStorage<Subscription>(STORAGE_KEYS.SUBSCRIPTIONS);
    saveToStorage(STORAGE_KEYS.SUBSCRIPTIONS, subs.filter(s => s.id !== id));
  },

  getPayments: async () => {
    await delay(300);
    return getFromStorage<Payment>(STORAGE_KEYS.PAYMENTS);
  },
  createPayment: async (data) => {
    await delay(500);
    const payments = getFromStorage<Payment>(STORAGE_KEYS.PAYMENTS);
    const newPayment: Payment = {
      ...data,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
    };
    saveToStorage(STORAGE_KEYS.PAYMENTS, [...payments, newPayment]);

    // Update subscription renewal
    const subs = getFromStorage<Subscription>(STORAGE_KEYS.SUBSCRIPTIONS);
    const subIndex = subs.findIndex(s => s.id === data.subscriptionId);
    if (subIndex !== -1) {
      const sub = subs[subIndex];
      const nextRenewalDate = new Date(sub.nextRenewal);
      nextRenewalDate.setDate(nextRenewalDate.getDate() + 30);
      
      subs[subIndex] = {
        ...sub,
        status: SubscriptionStatus.ACTIVE,
        nextRenewal: nextRenewalDate.toISOString().split('T')[0]
      };
      saveToStorage(STORAGE_KEYS.SUBSCRIPTIONS, subs);
    }

    return newPayment;
  },
  listPaymentsBySubscription: async (subscriptionId) => {
    await delay(300);
    const payments = getFromStorage<Payment>(STORAGE_KEYS.PAYMENTS);
    return payments.filter(p => p.subscriptionId === subscriptionId);
  },

  // Expenses
  getExpenses: async () => {
    await delay(300);
    return getFromStorage<Expense>(STORAGE_KEYS.EXPENSES);
  },
  createExpense: async (data) => {
    await delay(500);
    const expenses = getFromStorage<Expense>(STORAGE_KEYS.EXPENSES);
    const newExpense: Expense = {
      ...data,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
    };
    saveToStorage(STORAGE_KEYS.EXPENSES, [...expenses, newExpense]);
    return newExpense;
  },
  updateExpense: async (id, data) => {
    await delay(500);
    const expenses = getFromStorage<Expense>(STORAGE_KEYS.EXPENSES);
    const index = expenses.findIndex(e => e.id === id);
    if (index === -1) throw new Error('Expense not found');
    const updated = { ...expenses[index], ...data };
    expenses[index] = updated;
    saveToStorage(STORAGE_KEYS.EXPENSES, expenses);
    return updated;
  },
  deleteExpense: async (id) => {
    await delay(500);
    const expenses = getFromStorage<Expense>(STORAGE_KEYS.EXPENSES);
    saveToStorage(STORAGE_KEYS.EXPENSES, expenses.filter(e => e.id !== id));
  },

  // Billing
  getBillingBatches: async () => {
    await delay(300);
    return getFromStorage<BillingBatch>(STORAGE_KEYS.BILLING_BATCHES);
  },
  createBillingBatch: async (data) => {
    await delay(500);
    const batches = getFromStorage<BillingBatch>(STORAGE_KEYS.BILLING_BATCHES);
    const newBatch: BillingBatch = {
      ...data,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
    };
    saveToStorage(STORAGE_KEYS.BILLING_BATCHES, [...batches, newBatch]);

    // Update appointments with the batch ID
    const appointments = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    const updatedAppointments = appointments.map(a => {
      if (data.appointmentIds.includes(a.id)) {
        return { ...a, billingBatchId: newBatch.id };
      }
      return a;
    });
    saveToStorage(STORAGE_KEYS.APPOINTMENTS, updatedAppointments);

    return newBatch;
  },
  updateBillingBatch: async (id, data) => {
    await delay(500);
    const batches = getFromStorage<BillingBatch>(STORAGE_KEYS.BILLING_BATCHES);
    const index = batches.findIndex(b => b.id === id);
    if (index === -1) throw new Error('Billing batch not found');
    const updated = { ...batches[index], ...data };
    batches[index] = updated;
    saveToStorage(STORAGE_KEYS.BILLING_BATCHES, batches);
    return updated;
  },
  deleteBillingBatch: async (id) => {
    await delay(500);
    const batches = getFromStorage<BillingBatch>(STORAGE_KEYS.BILLING_BATCHES);
    const batch = batches.find(b => b.id === id);
    if (!batch) return;

    saveToStorage(STORAGE_KEYS.BILLING_BATCHES, batches.filter(b => b.id !== id));

    // Clear batch ID from appointments
    const appointments = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    const updatedAppointments = appointments.map(a => {
      if (a.billingBatchId === id) {
        const { billingBatchId, ...rest } = a;
        return rest as Appointment;
      }
      return a;
    });
    saveToStorage(STORAGE_KEYS.APPOINTMENTS, updatedAppointments);
  },

  updatePassword: async (_newPassword: string) => {
    await delay(500);
  },

  getAppointmentsByRange: async (startDate: string, endDate: string) => {
    await delay(300);
    const appointments = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    return appointments.filter(a => a.date >= startDate && a.date <= endDate);
  },

  getAppointmentsNeedingRenewal: async () => {
    await delay(300);
    const appointments = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    return appointments.filter(a => a.needsRenewal);
  },

  deleteFutureAppointments: async (groupId: string, fromDate: string) => {
    await delay(500);
    const appointments = getFromStorage<Appointment>(STORAGE_KEYS.APPOINTMENTS);
    saveToStorage(STORAGE_KEYS.APPOINTMENTS, appointments.filter(a => 
      !(a.recurrenceGroupId === groupId && a.date >= fromDate)
    ));
  },

  // Repasses
  getRepasses: async () => {
    await delay(300);
    const repasses = localStorage.getItem('priori_repasses');
    return repasses ? JSON.parse(repasses) : [];
  },
  createRepasse: async (data) => {
    await delay(500);
    const repasses = await mockService.getRepasses();
    const newRepasse = {
      ...data,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem('priori_repasses', JSON.stringify([...repasses, newRepasse]));
    return newRepasse;
  },
  updateRepasse: async (id, data) => {
    await delay(500);
    const repasses = await mockService.getRepasses();
    const index = repasses.findIndex((r: any) => r.id === id);
    if (index === -1) throw new Error('Repasse not found');
    const updated = { ...repasses[index], ...data };
    repasses[index] = updated;
    localStorage.setItem('priori_repasses', JSON.stringify(repasses));
    return updated;
  },
  deleteRepasse: async (id) => {
    await delay(500);
    const repasses = await mockService.getRepasses();
    localStorage.setItem('priori_repasses', JSON.stringify(repasses.filter((r: any) => r.id !== id)));
  },

  // Settings
  getSettings: async () => {
    await delay(200);
    const settings = localStorage.getItem('priori_settings');
    return settings ? JSON.parse(settings) : {
      id: 'settings1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  },
  updateSettings: async (id, data) => {
    await delay(500);
    const settings = await mockService.getSettings();
    const updated = { ...settings, ...data, updatedAt: new Date().toISOString() };
    localStorage.setItem('priori_settings', JSON.stringify(updated));
    return updated;
  },

  // Waiting List
  getWaitingList: async () => {
    await delay(250);
    return getFromStorage<WaitingListEntry>(STORAGE_KEYS.WAITING_LIST);
  },

  createWaitingListEntry: async (entry) => {
    await delay(400);
    const list = getFromStorage<WaitingListEntry>(STORAGE_KEYS.WAITING_LIST);
    const newEntry: WaitingListEntry = {
      ...entry,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
    };
    saveToStorage(STORAGE_KEYS.WAITING_LIST, [...list, newEntry]);
    return newEntry;
  },

  updateWaitingListEntry: async (id, entry) => {
    await delay(400);
    const list = getFromStorage<WaitingListEntry>(STORAGE_KEYS.WAITING_LIST);
    const idx = list.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error('Waiting list entry not found');
    const updated = { ...list[idx], ...entry };
    list[idx] = updated;
    saveToStorage(STORAGE_KEYS.WAITING_LIST, list);
    return updated;
  },

  deleteWaitingListEntry: async (id) => {
    await delay(400);
    const list = getFromStorage<WaitingListEntry>(STORAGE_KEYS.WAITING_LIST);
    saveToStorage(
      STORAGE_KEYS.WAITING_LIST,
      list.filter((e) => e.id !== id)
    );
  },
};
