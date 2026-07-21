// Service Worker do Rota 8 ERP — apenas cache de arquivos estáticos para
// permitir instalação como app (PWA) e uso offline básico da casca do app.
// Não interfere em nenhuma lógica de negócio do sistema.
const CACHE_NAME = 'rota8-erp-cache-v4';
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) { return caches.delete(name); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  // Somente GET; deixa tudo mais (Firebase, APIs) passar direto pela rede
  if (event.request.method !== 'GET') return;

  // Network-first: busca sempre a versão mais nova primeiro.
  // Só usa a cópia salva em cache se estiver offline (sem rede).
  // Isso garante que o app instalado (ícone) e o navegador mostrem
  // sempre o mesmo conteúdo, o mais atual possível.
  //
  // Para a página principal (navegação/index.html), a busca na rede
  // recebe um parâmetro variável (?_cb=timestamp) — isso só afeta a
  // requisição interna que o Service Worker faz, não muda a URL que
  // aparece pro usuário. Isso é necessário porque a CDN do GitHub Pages
  // (Fastly) guarda cópias da página por conta própria e, sem esse
  // truque, pode devolver uma versão antiga mesmo quando pedimos a mais
  // nova diretamente da rede.
  var isAppShell = event.request.mode === 'navigate' || event.request.url.indexOf('index.html') !== -1;
  var fetchRequest = event.request;
  if (isAppShell) {
    var bustedUrl = new URL(event.request.url);
    bustedUrl.searchParams.set('_cb', Date.now());
    fetchRequest = new Request(bustedUrl.toString(), {
      method: 'GET',
      headers: event.request.headers,
      credentials: event.request.credentials,
      cache: 'no-store'
    });
  }

  event.respondWith(
    fetch(fetchRequest).then(function(response) {
      if (response && response.status === 200 && response.type === 'basic') {
        var responseClone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseClone);
        });
      }
      return response;
    }).catch(function() {
      return caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        // Se a URL exata não estiver no cache (ex.: abertura pelo ícone
        // do app com URL levemente diferente), cai para a casca do app
        // já salva em vez de deixar a resposta vazia (o que gerava a
        // tela "Esta página não está funcionando").
        return caches.match('./index.html');
      });
    })
  );
});
