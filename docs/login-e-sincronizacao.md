# Login e sincronização (Supabase)

O app usa o projeto Supabase **banco-de-horas** (`kmcjdzirxwnowokxlcqx`, região São Paulo, plano gratuito).

- **Login sem senha:** a pessoa informa o e-mail e recebe um código numérico (6 a 10 dígitos, conforme a configuração "Email OTP Length" do Supabase) para digitar no app. Na primeira vez, a conta é criada automaticamente.
- **Dados:** cada conta tem uma linha na tabela `public.user_data`, com todo o estado do app em JSON. Row Level Security garante que cada pessoa só lê e grava os próprios dados.
- **Sincronização:** o app continua salvando no aparelho (funciona sem internet) e envia para a nuvem cerca de 1,5 s depois de cada alteração. Ao voltar para o app, busca o que foi feito em outros aparelhos. Se os dois lados mudaram, pergunta qual versão manter (função `save_user_data`, com controle de versão).
- **Estrutura do banco:** `supabase/migrations/20261123000000_user_data_sync.sql` (já aplicada).
- **Biblioteca:** `vendor/supabase.js` (supabase-js 2.45.4, licença MIT), servida junto do app.

## Configuração no painel (feita uma vez, pelo administrador)

Painel: https://supabase.com/dashboard/project/kmcjdzirxwnowokxlcqx

### 1. Endereço do app (obrigatório)
**Authentication → URL Configuration**
- **Site URL:** `https://arthur1806.github.io/banco-de-horas-app/`
- **Redirect URLs → Add URL:** `https://arthur1806.github.io/banco-de-horas-app/**`

Sem isso, o link do e-mail leva a pessoa para o endereço errado.

### 2. Envio de e-mails (obrigatório para outras pessoas)
O servidor de e-mail padrão do Supabase **só envia para os membros da sua organização no Supabase**, e com limite de poucos e-mails por hora. Para os colegas receberem o link, configure um SMTP próprio em **Authentication → Emails → SMTP Settings → Enable custom SMTP**.

Opções gratuitas:

| Serviço | Host / porta | Usuário / senha | Observações |
|---|---|---|---|
| **Gmail** | `smtp.gmail.com` / `587` | seu Gmail / **senha de app** (exige verificação em duas etapas; crie em myaccount.google.com → Segurança → Senhas de app) | até ~500 e-mails/dia; remetente = seu Gmail |
| **Brevo** | `smtp-relay.brevo.com` / `587` | login SMTP / chave SMTP do painel Brevo | 300 e-mails/dia grátis; verifique o e-mail remetente |
| **Resend** | `smtp.resend.com` / `465` | `resend` / sua API key | exige um domínio próprio verificado |

Preencha **Sender email** (o mesmo do serviço) e **Sender name** (`Banco de Horas`).

Depois de ativar, o limite padrão é de **30 e-mails por hora**. Se precisar de mais, ajuste em **Authentication → Rate Limits**.

### 3. E-mails só com o código (obrigatório)
**Authentication → Emails → Templates**. Edite **os dois** modelos: o Supabase usa "Confirm signup" para quem está criando a conta e "Magic Link" para quem já tem conta.
- **Confirm signup:** assunto `Seu código do Banco de Horas`; corpo: conteúdo de `supabase/email-templates/confirmar-cadastro.html`
- **Magic Link:** assunto `Seu código do Banco de Horas`; corpo: conteúdo de `supabase/email-templates/link-de-acesso.html`

Os modelos trazem só o código (`{{ .Token }}`), sem link. Assim funciona em qualquer aparelho ou navegador.

## Como as pessoas usam
1. Abrem o link do app → **Entrar** (topo) ou **"Já tenho conta — entrar com e-mail"** na tela de boas-vindas.
2. Informam o e-mail → recebem o código → digitam no app.
3. Na primeira vez, os dados que já estavam no aparelho são enviados para a conta. Num aparelho novo, os dados da conta são carregados.
4. **Sair** (Ajustes → Conta, ou o ícone no topo) limpa o aparelho. Os dados continuam na conta.

## Privacidade
Os dados das pessoas (horários, registros, observações) ficam no seu projeto Supabase. Só cada pessoa acessa a própria linha pelo app. Como dono do projeto, você consegue ver os dados pelo painel.
