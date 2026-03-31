# Checklist Final para Deploy e Migração - Horários Internos

## Migração no Banco de Dados
- [x] Executar o script `supabase/migrations/20260330_add_internal_appointments_fields.sql` no Supabase para adicionar os campos necessários.
- [ ] Verificar se a constraint `check_internal_customer` está aplicada corretamente.

## Backend (Edge Functions)
- [ ] Fazer deploy das funções atualizadas:
  - `whatsapp-reminder` (filtrar `is_internal = false`)
  - `daily-agenda-email` (incluir internos na agenda)
  - `daily-confirmation-email` (filtrar `is_internal = false`)
  - `stale-confirmation-nag` (filtrar `is_internal = false`)
  - `clinic-daily-summary` (incluir internos na agenda)
- [ ] Testar as funções para garantir que os filtros estão corretos.

## Frontend
- [ ] Deploy do frontend com as mudanças no `SchedulePage` para suportar horários internos.
- [ ] Testar criação, edição e visualização de horários internos.
- [ ] Confirmar que horários internos não geram faturamento nem repasse.
- [ ] Confirmar que horários internos aparecem no e-mail de agenda do psicólogo.

## Testes Finais
- [ ] Criar um horário interno presencial e verificar bloqueio de sala.
- [ ] Criar um horário interno online e verificar bloqueio de psicólogo.
- [ ] Confirmar que horários internos não geram WhatsApp de confirmação.
- [ ] Confirmar que horários internos aparecem nos e-mails de agenda.

## Limpeza
- [ ] Remover scripts de teste do repositório ou garantir que não contenham chaves hardcoded.
- [ ] Verificar que não há tokens ou segredos hardcoded no código.

---

Este checklist deve ser seguido para garantir uma implantação segura e sem regressões.