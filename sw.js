/*
 * Service worker do Banco de Horas.
 *
 * Objetivo: permitir instalar o app (PWA) e abrir a tela mesmo sem internet,
 * SEM atrapalhar atualizações e SEM guardar dados privados.
 *
 * - Só trata requisições GET do PRÓPRIO site (mesma origem). Chamadas ao
 *   Supabase (outra origem) nunca passam por aqui: sessões, tokens e dados das
 *   pessoas não são interceptados nem guardados em cache.
 * - Requisições com cabeçalho Authorization são ignoradas.
 * - Estratégia "rede primeiro": com internet, sempre busca a versão nova
 *   (revalidando o cache HTTP do GitHub Pages); o cache só é usado quando a
 *   rede falha. Assim nunca serve arquivos antigos indefinidamente.
 * - O cache tem o nome da versão; versões antigas são apagadas ao ativar.
 *   A versão vem do parâmetro ?v= usado no registro (APP_BUILD no index.html).
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `banco-de-horas-${VERSION}`;
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './vendor/supabase.js',
  './vendor/591.supabase.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Busca cada arquivo sem o cache HTTP; um arquivo que falhar não impede a instalação.
    await Promise.all(SHELL.map(async path => {
      try {
        const res = await fetch(new Request(path, { cache: 'reload' }));
        if (res.ok) await cache.put(path, res);
      } catch (e) { /* sem rede durante a instalação: tenta de novo na próxima visita */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('banco-de-horas-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Supabase e outros domínios: não intercepta
  if (req.headers.has('authorization')) return;
  if (url.pathname.endsWith('/sw.js')) return;

  const isPage = req.mode === 'navigate' || (req.destination === 'document');
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // Páginas: revalida com o servidor (no-cache) para pegar publicações novas.
      const res = await fetch(isPage ? new Request(req, { cache: 'no-cache' }) : req);
      if (res.ok && res.type === 'basic') cache.put(isPage ? './index.html' : req, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      const hit = isPage
        ? (await cache.match('./index.html')) || (await cache.match('./'))
        : await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (isPage) return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Banco de Horas</title><body style="font-family:system-ui;background:#08090b;color:#eeeff2;display:grid;place-items:center;height:100vh;margin:0;text-align:center"><div><h1 style="font-size:20px">Sem conexão</h1><p style="color:#a3a7b0">Conecte-se à internet e abra o app novamente.</p></div>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return Response.error();
    }
  })());
});
