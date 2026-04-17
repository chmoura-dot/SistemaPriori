#!/bin/bash
# ============================================================
# Script de Deploy - Edge Functions do Núcleo Priori
# ============================================================
# Uso: bash deploy-all-functions.sh
# Pré-requisito: Supabase CLI instalado e autenticado
#   npm install -g supabase
#   supabase login
# ============================================================

set -e  # Para o script se qualquer comando falhar

echo "🚀 Iniciando deploy das Edge Functions do Núcleo Priori..."
echo ""

# 1. Lembretes de WhatsApp
echo "📱 [1/5] Deploy: whatsapp-reminder..."
supabase functions deploy whatsapp-reminder --no-verify-jwt
echo "   ✅ whatsapp-reminder deployado!"
echo ""

# 2. Agenda Diária dos Psicólogos
echo "📅 [2/5] Deploy: daily-agenda-email..."
supabase functions deploy daily-agenda-email --no-verify-jwt
echo "   ✅ daily-agenda-email deployado!"
echo ""

# 3. E-mail de Confirmação de Atendimentos
echo "✉️  [3/5] Deploy: daily-confirmation-email..."
supabase functions deploy daily-confirmation-email --no-verify-jwt
echo "   ✅ daily-confirmation-email deployado!"
echo ""

# 4. Aviso de Pendências Atrasadas
echo "⚠️  [4/5] Deploy: stale-confirmation-nag..."
supabase functions deploy stale-confirmation-nag --no-verify-jwt
echo "   ✅ stale-confirmation-nag deployado!"
echo ""

# 5. Resumo Diário da Clínica
echo "🏥 [5/5] Deploy: clinic-daily-summary..."
supabase functions deploy clinic-daily-summary --no-verify-jwt
echo "   ✅ clinic-daily-summary deployado!"
echo ""

# 6. Página de Confirmação (Links WhatsApp/E-mail)
echo "🔗 [6/6] Deploy: confirm-appointment..."
supabase functions deploy confirm-appointment --no-verify-jwt
echo "   ✅ confirm-appointment deployado!"
echo ""

echo "============================================================"
echo "✅ Todas as funções foram deployadas com sucesso!"
echo ""
echo "⚠️  LEMBRETE: Após o deploy, execute o script SQL de cron"
echo "   no Supabase Dashboard > SQL Editor:"
echo "   → supabase_cron_update.sql (com a nova service_role key)"
echo "============================================================"
