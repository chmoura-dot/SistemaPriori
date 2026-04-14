# Checklist Final para Deploy e Migração - Horários Internos

## Migração no Banco de Dados
- [x] Executar o script `supabase/migrations/20260330_add_internal_appointments_fields.sql` no Supabase para adicionar os campos necessários.
- [x] Verificar se a constraint `check_internal_customer` está aplicada corretamente.

## Backend (Edge Functions)
- [x] Fazer deploy das funções atualizadas:
  - `whatsapp-reminder` (filtra `is_internal = false` ✅)
  - `daily-agenda-email` (inclui internos na agenda ✅ — corrigido em 14/04/2026)
  - `daily-confirmation-email` (filtra `is_internal = false` ✅)
  - `stale-confirmation-nag` (filtra `is_internal = false` ✅)
  - `clinic-daily-summary` (inclui internos na agenda ✅)
- [ ] **PENDENTE:** Fazer deploy das funções no Supabase após as correções de código.
  ```bash
  supabase functions deploy daily-agenda-email --no-verify-jwt
  supabase functions deploy whatsapp-reminder --no-verify-jwt
  supabase functions deploy daily-confirmation-email --no-verify-jwt
  supabase functions deploy stale-confirmation-nag --no-verify-jwt
  supabase functions deploy clinic-daily-summary --no-verify-jwt
  ```
- [ ] Testar as funções para garantir que os filtros estão corretos.

## Frontend
- [x] Deploy do frontend com as mudanças no `SchedulePage` para suportar horários internos.
- [ ] Testar criação, edição e visualização de horários internos.
- [x] Confirmar que horários internos não geram faturamento nem repasse.
- [x] Confirmar que horários internos aparecem no e-mail de agenda do psicólogo.

## Testes Finais
- [ ] Criar um horário interno presencial e verificar bloqueio de sala.
- [ ] Criar um horário interno online e verificar bloqueio de psicólogo.
- [x] Confirmar que horários internos não geram WhatsApp de confirmação.
- [x] Confirmar que horários internos aparecem nos e-mails de agenda.

## Segurança
- [x] Revogar service_role key antiga (exposta em `supabase_cron_update.sql`).
- [x] Revogar Supabase Secret Key comprometida.
- [x] Substituir chaves hardcoded por placeholders nos arquivos SQL.
- [x] Adicionar `supabase_cron_update.sql` e `setup_emails_cron.sql` ao `.gitignore`.
- [ ] Executar `supabase_cron_update.sql` no SQL Editor do Supabase com a **nova** service_role key.
- [ ] Limpar histórico do Git para remover chaves antigas (ver `SECURITY.md`).

## Limpeza
- [x] Remover scripts de teste do repositório ou garantir que não contenham chaves hardcoded.
- [x] Verificar que não há tokens ou segredos hardcoded no código.

---

Este checklist deve ser seguido para garantir uma implantação segura e sem regressões.
