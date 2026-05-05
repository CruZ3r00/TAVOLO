# Lessons

## 2026-05-05 — Project Guidance First

- Start every non-trivial task in this repository by reading `CLAUDE.md` and applying its workflow constraints before exploring or editing code.
- Attempt the code-review graph first as requested by project instructions; if unavailable in the current session, state the fallback and proceed with local files.

## 2026-05-05 — Environment Files Are Sensitive

- Do not print `.env` values while debugging. Inspect only variable names or targeted non-secret config code, and avoid broad `grep` output on `.env` files.

## 2026-05-05 — Missing TLS CA Needs A Complete Dev Fallback

- If a DB config references a missing custom CA while `rejectUnauthorized=true`, simply omitting `ca` may still fail with `self-signed certificate in certificate chain`; development fallback must either use a valid CA or explicitly set `rejectUnauthorized=false`, while production should fail loudly.
- Do not infer production hard-fail only from `NODE_ENV` in local Strapi config; local `.env` can carry production-like values. Use an explicit opt-in such as `DATABASE_SSL_FAIL_ON_MISSING_CA=true`.

## 2026-05-05 — Owner Orders Navigation Scope

- When grouping owner navigation under `Ordini`, include only production departments (`cucina`, `bar`, `pizzeria`, `sg`). Keep `sala`, `manager`, `prenotazioni` and `menu` as independent owner sections unless the user explicitly asks to group them too.

## 2026-05-05 — Do Not Treat Visual Checks As Functional Verification

- For interactive UI changes, verify the actual event path: clickable control type, route guard, target route metadata, state watcher/reload path, and runtime/API availability.
- If the runtime is unavailable (`node`/`npm` missing or servers not listening), say exactly which functional checks could not be run instead of presenting static inspection as end-to-end verification.
