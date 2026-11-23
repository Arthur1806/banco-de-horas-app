# Instalação como aplicativo (PWA)

## Arquivos
- `manifest.webmanifest`: nome, ícones, `display: standalone`, `start_url`/`scope` relativos (`./`).
- `sw.js`: service worker mínimo, registrado como `sw.js?v=<APP_BUILD>` com escopo `./`.
- `index.html`: o bloco **INSTALAÇÃO DO APP (PWA)** concentra tudo: detecção de plataforma (`pwaPlatform`), detecção de instalação (`isAppInstalled`), regras de exibição (`shouldOfferInstall`), convite (`openInstallPrompt`), guia do iPhone (`openIOSGuide`), cartão em Ajustes (`renderInstallCard`) e aviso de nova versão (`watchForUpdates`).
- `icons/`: 192, 512, maskable 512, apple-touch-icon 180 e favicon 32.

Todos os caminhos são relativos, então funcionam em `https://arthur1806.github.io/banco-de-horas-app/`.

## Como funciona
**Android (Chrome, Edge, Samsung Internet):** o app guarda o evento `beforeinstallprompt`. O convite só aparece quando esse evento existe. "Instalar aplicativo" abre a confirmação nativa do navegador. O resultado é registrado: se a pessoa aceita, o convite não aparece mais; se recusa, só depois de 7 dias.

**iPhone/iPad:** não existe instalação automática. "Instalar aplicativo" abre um guia em 3 passos (Compartilhar → Adicionar à Tela de Início → Adicionar). No iPhone, o app instalado tem dados separados do Safari. Por isso, quem tem dados no aparelho e não tem conta recebe o aviso para entrar antes.

**Navegadores internos (Instagram, Facebook, Line, Telegram, WebViews):** o convite orienta a abrir no Safari ou no Chrome e oferece "Copiar link". Esses navegadores não permitem instalar.

**Computador:** não há convite automático. O cartão **Ajustes → Aplicativo** mostra o botão de instalar quando o navegador permite.

## Regras do convite (localStorage)
| Chave | Uso |
|---|---|
| `pwa_install_completed` | `1` quando instalou (ou abriu como app): não convida mais |
| `pwa_install_dismissed_at` | data do "Agora não" ou da recusa: espera 7 dias |
| `pwa_install_prompt_version` | aumente `PWA_PROMPT_VERSION` no código para convidar todos de novo |
| `pwa_install_closed_session` (sessionStorage) | não mostra de novo na mesma sessão |

## Service worker
- Só trata GET do próprio site. **Nunca intercepta o Supabase** (outra origem) nem requisições com `Authorization`: sessões, tokens e dados não vão para o cache.
- "Rede primeiro": com internet, sempre busca a versão nova. O cache é usado só sem rede, para o app abrir offline (os dados continuam no aparelho e sincronizam quando a internet volta).
- O nome do cache inclui a versão (`APP_BUILD`). Caches antigos são apagados quando a nova versão ativa.

## Publicar uma nova versão
1. Altere o app.
2. Em `index.html`, aumente `APP_BUILD` (ex.: `2026.11.23-1` → `2026.11.24-1`). Isso renova o service worker e o cache.
3. Envie para a `main`. O GitHub Pages publica em 1 a 2 minutos.
4. Quem estiver com o app aberto recebe o aviso **"Nova versão disponível · Atualizar"** ao voltar para ele. Quem abrir depois já recebe a versão nova.

## Testes em aparelhos reais
1. **Android/Chrome, primeiro acesso:** o convite aparece → Instalar → janela nativa → aceitar → o ícone aparece na tela inicial → o app abre em tela cheia.
2. **Android, recusar** na janela nativa → recarregar → não aparece de novo.
3. **Android, "Agora não"** → não aparece por 7 dias.
4. **iPhone/Safari, primeiro acesso:** o convite aparece → Instalar → guia → Compartilhar → Adicionar à Tela de Início → abrir pelo ícone (tela cheia, sem barra do Safari, barra de status sem sobrepor o topo).
5. **iPhone, app instalado:** entrar com a conta → os dados aparecem.
6. **App instalado** (Android e iPhone): o convite nunca aparece. Ajustes → Aplicativo mostra "App instalado".
7. **Instagram:** abrir o link pelo Direct/bio → o convite pede para abrir no Safari/Chrome → Copiar link funciona.
8. **WhatsApp:** abrir o link pela conversa. No Android, o WhatsApp costuma abrir no Chrome ou numa "aba personalizada", que não é detectável: nesse caso use o menu ⋮ → "Abrir no Chrome".
9. **Sem internet:** com o app já aberto uma vez, ativar o modo avião → o app abre com os dados do aparelho.
10. **Atualização:** publicar uma versão com `APP_BUILD` novo → com o app aberto, sair e voltar → o aviso "Nova versão disponível" aparece → Atualizar.
