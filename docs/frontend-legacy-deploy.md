# Frontend legacy deploy checks

Questi controlli servono solo per la build frontend legacy generata da Vite.
Non richiedono modifiche a Strapi, Supabase, database o variabili segrete.

## Asset JavaScript

Se un browser legacy mostra `expected expression, got '<'` su un file
`/assets/*.js`, quel file sta ricevendo HTML invece di JavaScript. In staging,
verificare che gli asset hashati esistano davvero dopo il deploy e che Nginx non
applichi il fallback SPA agli asset.

Configurazione consigliata:

```nginx
location /assets/ {
  try_files $uri =404;
  add_header Cache-Control "public, max-age=31536000, immutable";
}

location / {
  try_files $uri $uri/ /index.html;
}
```

Il fallback a `/index.html` deve valere per le route dell'app, non per i file JS
e CSS generati in `dist/assets`.

## Realtime Supabase

La realtime è opzionale per l'interfaccia: se il websocket viene rifiutato dal
browser o dalla rete, l'app deve continuare a funzionare con polling e fetch
HTTP normali.
