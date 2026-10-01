# Mobile Responsiveness & Validation — Full Audit + Fixes

Date: 2026-10-01 · Scope: whole app, all 4 roles (organization / institution / trainer / student)

---

## 1. Method

A real-browser audit (Playwright + Chromium) drove the running app:

- Logged in **via the API** for each role, then loaded **every NAV route × {390px, 768px}**
  = **78 page-loads**.
- Measured page-level horizontal overflow (`documentElement.scrollWidth − innerWidth`),
  walked the DOM for offending elements, captured console errors and uncaught
  `pageerror`s, and opened the primary "create" modal on 6 pages to test the
  mobile bottom-sheet behaviour.
- Separate focused probes for computed styles, and an API/curl suite for the
  server-side validation rules.

Harness lives in `audit/` (`responsive-audit.mjs`, `probe.mjs`, `validation-test.mjs`,
`results.json`, `shots/`).

---

## 2. Responsive result

| Metric (78 page-loads) | Before | After |
|---|---|---|
| Page-level horizontal overflow | 0 | **0** |
| Uncaught page errors | 0 | **0** |
| Modal overflow at 390px | 0 | **0** |
| Console errors | 0 | **0** |

The foundation was already strong (off-canvas drawer ≤880px, tables scroll
horizontally, single-column forms + bottom-sheet modals ≤620px, global overflow
guard). The audit's key job was to find what that guard was **hiding**.

### Root-cause bug found — CSS cascade ordering (systemic)

`styles.css` had the **primary responsive `@media` block in the middle of the
file** (~line 1107), while several component base styles are defined **after**
it (`.kanban-board{display:grid}`, `.toasts{…}`). With equal specificity, **later
source wins** — so the mobile overrides were silently defeated.

- **Symptom:** the **Leads kanban board stayed a 5-column grid on phones** and was
  **clipped** by `.body{overflow-x:hidden}` (the naive overflow check reported
  `0`, because it was *clipping*, not *scrolling* — the user simply couldn't reach
  the off-screen columns). Toasts also didn't go full-width on mobile.
- **Fix:** moved the entire responsive block to the **end** of the stylesheet so
  overrides always win. Verified with a computed-style probe:
  - 390px → board is now `display:flex; flex-direction:column`, columns full width
    (right edge 374 ≤ 390). ✔
  - 768px → still a scrollable 5-column grid (board has its own `overflow-x:auto`). ✔
- **Rule to keep:** responsive `@media` overrides must be the **last** rules in
  the stylesheet.

---

## 3. Validation result

### What already existed (solid)
- A declarative middleware `backend/src/middleware/validate.js` —
  `validate({ body: { field: 'string' | 'email' | 'phone' | 'int' | 'number' |
  'amount' | 'date' | 'bool' | 'array' | '?optional' } })` — applied to most
  mutating routes, returning `400` with a field-level message.
- Per-service `requireFields` / `oneOf` domain checks.
- Good client-side validation on **Login**; the two **payment** handlers already
  validated `amount > 0` and `≤ outstanding`.

### Gaps found & fixed
| Area | Issue | Fix |
|---|---|---|
| Assessment scores | `saveScore` accepted **any** finite number (e.g. −5 or 9999) | Server now enforces **0 ≤ score ≤ max_score**; client mirrors it before submit |
| Student / Trainer / Lead create | `email`/`phone` were never shape-checked | Added optional `'?email'` / `'?phone'` checks (validate only when provided) |
| Student add/edit (client) | No format feedback | Name required + email/phone format, inline error |
| Lead create (client) | No format feedback | Org + contact required + email/phone format, inline error |

### Verified (server, via curl)
- score `999` and `-5` → `400 "score must be between 0 and 100"`
- `email:"not-an-email"` → `400 "email must be a valid email"`
- `phone:"abc"` → `400 "phone must be a valid phone number"`
- valid student (name + email + phone + customer) → created, then deleted

### Verified (client, via Playwright)
- Invalid lead email → inline **"Enter a valid email address"** shown and
  **0 network requests** fired (submit blocked before the round trip).

### Build
- `vite build` clean — **419 modules**, CSS 40.4 kB. (Only the pre-existing,
  benign `xlsx` dynamic/static import warning.)

---

## 4. Known, intentional (not bugs)

- **PATCH routes** mostly update a status/one field and rely on the service-level
  guards rather than the shape middleware — by design; each is role-gated.
- A few lower-traffic create forms rely on the server's `400` surfacing as a
  toast rather than an inline field message. Functionally correct; could be
  upgraded to inline errors later if desired.

---

## 5. Activation note

The live backend on `:4000` must be **restarted** to pick up the server-side
validation changes (score range + optional email/phone), and the frontend
rebuilt/restarted for the CSS + JSX changes.
