// Este arquivo compõe o supabaseService a partir dos serviços de domínio.
// A lógica foi dividida em:
//   src/services/supabase/helpers.ts              — mappers e utilitários
//   src/services/supabase/authService.ts          — autenticação
//   src/services/supabase/psychologistService.ts  — psicólogos e salas
//   src/services/supabase/appointmentService.ts   — leitura de agendamentos
//   src/services/supabase/appointmentWriteService.ts — criação/edição de agendamentos
//   src/services/supabase/customerService.ts      — pacientes, planos, assinaturas, pagamentos
//   src/services/supabase/financeService.ts       — despesas, faturamento, repasses, configurações
//   src/services/supabase/configService.ts        — lista de espera, feriados, fechamentos, NFS-e
import { AppService } from './types';
import { authService } from './supabase/authService';
import { psychologistService } from './supabase/psychologistService';
import { appointmentReadService } from './supabase/appointmentService';
import { appointmentWriteService } from './supabase/appointmentWriteService';
import { customerService } from './supabase/customerService';
import { financeService } from './supabase/financeService';
import { configService } from './supabase/configService';

export const supabaseService: AppService = {
  ...authService,
  ...psychologistService,
  ...appointmentReadService,
  ...appointmentWriteService,
  ...customerService,
  ...financeService,
  ...configService,
};
