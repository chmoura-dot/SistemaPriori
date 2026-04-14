# 🔒 Guia de Segurança — Sistema Priori

Este documento descreve as práticas de segurança obrigatórias para o Sistema Priori.

---

## ⚠️ Tipos de Chaves e Onde Usá-las

### 1. `anon key` (Chave Pública)
- **Onde fica:** `.env.local` como `VITE_SUPABASE_ANON_KEY`
- **Onde é usada:** Frontend (navegador)
- **Pode ser exposta?** Sim — é pública por design
- **Permissões:** Limitadas pelas regras de RLS do banco

### 2. `service_role key` (Chave Secreta — CRÍTICA)
- **Onde fica:** Variáveis de ambiente das Edge Functions no Supabase Dashboard
- **Onde é usada:** Edge Functions, scripts de servidor
- **Pode ser exposta?** ❌ **NUNCA** — tem acesso root ao banco
- **Permissões:** Bypassa TODAS as regras de segurança (RLS)

---

## 🚫 Regras Absolutas

1. **NUNCA** commite a `service_role key` em nenhum arquivo do repositório
2. **NUNCA** compartilhe chaves secretas por chat, e-mail ou mensagem
3. **NUNCA** coloque a `service_role key` no frontend ou em variáveis `VITE_*`
4. **NUNCA** deixe chaves em arquivos `.sql` versionados

---

## ✅ Boas Práticas

### Variáveis de Ambiente
```
# .env.local (NÃO versionado — já no .gitignore)
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...  ← OK, é pública
```

### Scripts SQL com Chaves
Os arquivos `supabase_cron_update.sql` e `setup_emails_cron.sql` contêm **placeholders** (`SUA_SERVICE_ROLE_KEY`).

**Fluxo correto:**
1. Copie o arquivo: `cp supabase_cron_update.sql supabase_cron_update.local.sql`
2. Preencha a chave real no arquivo `.local.sql`
3. Execute no Supabase Dashboard > SQL Editor
4. **Não commite** o arquivo `.local.sql` (já está no `.gitignore`)

---

## 🔄 Procedimento de Rotação de Chaves

Se uma chave for comprometida (exposta em repositório, chat, etc.):

### Passo 1: Revogar imediatamente
1. Acesse: Supabase Dashboard → Settings → API
2. Clique em **"Reset"** na `service_role key`
3. A chave antiga é invalidada instantaneamente

### Passo 2: Atualizar todos os locais
Após gerar a nova chave, atualize em:
- [ ] Supabase Dashboard → Settings → Edge Functions → Secrets
- [ ] Supabase Dashboard → SQL Editor → Execute `supabase_cron_update.sql` com nova chave
- [ ] Qualquer outro serviço externo que use a chave

### Passo 3: Limpar histórico do Git (se a chave foi commitada)
```bash
# ⚠️ ATENÇÃO: Isso reescreve o histórico do Git
# Faça backup antes e avise outros colaboradores

# Instalar BFG Repo Cleaner (mais simples que git filter-branch)
brew install bfg

# Remover a chave do histórico (substitua pela chave real)
bfg --replace-text <(echo 'CHAVE_COMPROMETIDA==>REMOVIDO') .

# Limpar e forçar push
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force --all
git push --force --tags
```

**Alternativa com git filter-branch:**
```bash
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch supabase_cron_update.sql" \
  --prune-empty --tag-name-filter cat -- --all
git push origin --force --all
```

---

## 🔍 Verificação de Segurança

Para verificar se há chaves expostas no código:
```bash
# Buscar padrões de JWT (service_role keys começam com eyJ)
grep -r "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=dist

# Buscar padrões de Supabase Secret Keys
grep -r "sb_secret_" . \
  --exclude-dir=node_modules \
  --exclude-dir=.git
```

---

## 📋 Checklist de Segurança Periódico

Execute mensalmente:

- [ ] Verificar se há chaves hardcoded no código (`grep -r "eyJ" .`)
- [ ] Revisar quem tem acesso ao Supabase Dashboard
- [ ] Verificar logs de acesso suspeito no Supabase
- [ ] Confirmar que `.env.local` não foi commitado acidentalmente
- [ ] Revisar permissões RLS das tabelas críticas (patients, appointments)

---

## 📞 Em Caso de Incidente

Se suspeitar de acesso não autorizado:

1. **Revogar todas as chaves imediatamente** (Supabase Dashboard → Settings → API)
2. Verificar logs de acesso no Supabase Dashboard → Logs
3. Verificar se dados de pacientes foram acessados
4. Gerar novas chaves e atualizar todos os serviços
5. Documentar o incidente

---

*Última atualização: Abril 2026*
