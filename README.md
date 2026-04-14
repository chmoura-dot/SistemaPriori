# Sistema Priori — Clínica de Psicologia Núcleo Priori

Sistema de gestão clínica desenvolvido para o **Núcleo Priori**, cobrindo agendamentos, faturamento, repasses, confirmações e comunicação automatizada com psicólogos e pacientes.

---

## 🏗️ Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Estilização | Tailwind CSS v4 |
| Backend / DB | Supabase (PostgreSQL + RLS) |
| Edge Functions | Deno (Supabase Functions) |
| E-mail | Resend |
| WhatsApp | Z-API |
| Deploy Frontend | Vercel |
| Cron Jobs | pg_cron (Supabase) |

---

## 📁 Estrutura do Projeto

```
SistemaPriori/
├── src/
│   ├── pages/           # Páginas da aplicação
│   ├── components/      # Componentes reutilizáveis
│   ├── services/        # Serviços (supabaseService.ts, api.ts)
│   ├── lib/             # Utilitários (supabase.ts, utils.ts, excel.ts)
│   └── App.tsx          # Roteamento principal
├── supabase/
│   ├── functions/       # Edge Functions (Deno)
│   │   ├── whatsapp-reminder/        # Lembrete WhatsApp diário
│   │   ├── daily-agenda-email/       # Agenda diária para psicólogos
│   │   ├── daily-confirmation-email/ # Pedido de confirmação de atendimentos
│   │   ├── stale-confirmation-nag/   # Cobrança de pendências antigas
│   │   ├── clinic-daily-summary/     # Resumo diário para coordenação
│   │   ├── renewal-reminder-email/   # Alerta de renovação de agenda
│   │   ├── ams-password-alert/       # Alerta de senhas AMS Petrobras
│   │   ├── confirm-appointment/      # Confirmação de atendimento (link mágico)
│   │   ├── invite-psychologist/      # Convite para psicólogos
│   │   └── resend-confirmation/      # Reenvio de confirmação
│   └── migrations/      # Migrações do banco de dados
├── scripts/             # Scripts utilitários de desenvolvimento
├── deploy-all-functions.sh  # Script de deploy das Edge Functions
├── supabase_cron_update.sql # Template de configuração dos cron jobs
└── setup_emails_cron.sql    # Template alternativo de cron jobs
```

---

## ⚙️ Configuração Local

### Pré-requisitos
- Node.js 20+
- Supabase CLI (`npm install -g supabase`)

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
Crie um arquivo `.env.local` na raiz do projeto:
```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key_aqui
```

> ⚠️ **NUNCA** coloque a `service_role key` no frontend ou em arquivos versionados.

### 3. Rodar em desenvolvimento
```bash
npm run dev
```
Acesse: http://localhost:3000

---

## 🚀 Deploy

### Frontend (Vercel)
O deploy é automático via GitHub. Cada push na branch `main` dispara um novo deploy.

Variáveis de ambiente necessárias no Vercel:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Edge Functions (Supabase)
```bash
# Deploy de todas as funções de uma vez
bash deploy-all-functions.sh

# Ou individualmente
supabase functions deploy nome-da-funcao --no-verify-jwt
```

Variáveis de ambiente necessárias nas Edge Functions (configurar no Supabase Dashboard > Settings > Edge Functions):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`

---

## ⏰ Cron Jobs (Automações)

Os cron jobs são configurados via `pg_cron` no Supabase. Para configurar:

1. Abra o arquivo `supabase_cron_update.sql`
2. Substitua `SUA_SERVICE_ROLE_KEY` pela service_role key do seu projeto
3. Execute o script no **Supabase Dashboard > SQL Editor**
4. **Não salve o arquivo com a chave real** — use apenas localmente

| Job | Horário (BRT) | Descrição |
|-----|--------------|-----------|
| `whatsapp-reminder` | 06:00 diário | Lembrete WhatsApp para pacientes |
| `daily-agenda-email` | 06:00 diário | Agenda do dia para psicólogos |
| `clinic-daily-summary` | 07:00 diário | Resumo para coordenação |
| `daily-confirmation-email` | 06:00–20:00 (horária) | Pedido de confirmação de atendimentos |
| `stale-confirmation-nag` | 08:00 quarta-feira | Cobrança de pendências antigas |
| `renewal-reminder-email` | 08:00 diário | Alerta de renovação de agenda |
| `ams-password-alert` | 07:00 segunda-feira | Alerta de senhas AMS Petrobras |

---

## 🗄️ Banco de Dados

### Principais Tabelas
| Tabela | Descrição |
|--------|-----------|
| `appointments` | Agendamentos (inclui horários internos) |
| `customers` | Pacientes |
| `psychologists` | Psicólogos |
| `rooms` | Salas de atendimento |
| `billing_batches` | Lotes de faturamento |
| `payments` | Pagamentos |
| `expenses` | Despesas da clínica |
| `subscriptions` | Assinaturas/planos dos pacientes |
| `appointment_tokens` | Tokens de confirmação (link mágico) |
| `settings` | Configurações do sistema (Z-API, etc.) |
| `waiting_list` | Lista de espera |

### Horários Internos
Agendamentos com `is_internal = true` representam horários sem paciente (supervisão, reunião, etc.). Eles:
- ✅ Aparecem na agenda do psicólogo (e-mail diário)
- ✅ Bloqueiam sala/psicólogo para outros agendamentos
- ❌ Não geram faturamento
- ❌ Não geram repasse
- ❌ Não geram WhatsApp de confirmação

---

## 🔒 Segurança

Consulte o arquivo `SECURITY.md` para diretrizes completas de segurança.

**Regras básicas:**
- Nunca commite chaves secretas no Git
- Use `.env.local` para variáveis locais (já no `.gitignore`)
- Scripts SQL com chaves reais devem ser executados localmente e nunca versionados
- A `service_role key` tem acesso total ao banco — trate como senha root

---

## 📋 Páginas do Sistema

| Rota | Página | Descrição |
|------|--------|-----------|
| `/` | Dashboard | Visão geral e métricas |
| `/agenda` | SchedulePage | Agendamentos e horários |
| `/pacientes` | CustomersPage | Gestão de pacientes |
| `/psicologos` | PsychologistsPage | Gestão de psicólogos |
| `/faturamento` | BillingPage | Faturamento por convênio |
| `/repasse` | RepassePage | Repasses para psicólogos |
| `/financeiro` | FinancialPage | Visão financeira geral |
| `/despesas` | ExpensesPage | Controle de despesas |
| `/pagamentos` | PaymentsPage | Pagamentos recebidos |
| `/planos` | PlansPage | Planos e assinaturas |
| `/nfse` | NfsePage | Notas fiscais de serviço |
| `/lista-espera` | WaitingListPage | Lista de espera |
| `/feriados` | HolidaysPage | Feriados e fechamentos |
| `/capacidade` | CapacityPage | Capacidade de atendimento |
| `/configuracoes` | SettingsPage | Configurações do sistema |
| `/confirmacao/:id` | ConfirmationPage | Confirmação de atendimento (paciente) |
| `/confirmacao` | MagicConfirmationPage | Confirmação via link mágico (psicólogo) |

---

## 🛠️ Scripts Úteis

```bash
npm run dev          # Servidor de desenvolvimento
npm run build        # Build de produção
npm run lint         # Verificação de tipos TypeScript
npm run clean        # Limpar pasta dist
npm run deploy:all-functions  # Deploy de todas as Edge Functions
```

---

## 📞 Suporte

Sistema desenvolvido para uso interno do **Núcleo Priori**.  
Em caso de dúvidas técnicas, consulte o `deployment_checklist.md` ou o `SECURITY.md`.
