# Project AI / API Key Inventory & Recommendations
**Project:** Mira-CRM  
**Date:** 2026-10-01  
**Author:** Claude Code audit  
**Status:** Draft — review before committing

---

## 1. Executive Summary

The codebase uses **one primary AI provider key** (OpenRouter) to drive the Mira assistant chat feature. The key is loaded from environment variables at runtime — it is **not hard‑coded** in source — but several places still carry placeholder/demo credentials, hard‑coded fallbacks, and predictable tokens that should be hardened before production.

**Current AI model stack:**
- Primary: `nvidia/nemotron-3-super-120b-a12b:free`
- Fallback: `inclusionai/ling-3.0-flash-sante:free`

---

## 2. Complete AI / LLM Implementation Map

| # | File | Lines | What it does |
|---|------|-------|--------------|
| 1 | `backend/.env.example` | 30-36 | OpenRouter config block: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, fallback, max tokens, timeout |
| 2 | `backend/src/config/index.js` | 39-57 | `assistant` config object: `apiKey`, `baseUrl`, `model`, `fallbackModel`, `maxTokens`, `temperature`, `timeoutMs`, `maxHistory` |
| 3 | `backend/src/services/assistant.service.js` | 1-230 | Full Mira assistant service |
| 3a | ↳ | 97 | System prompt — Mira role-scoped CRM assistant |
| 3b | ↳ | 123-152 | `callModel()` — HTTP POST to OpenRouter `/chat/completions` |
| 3c | ↳ | 136 | Request body `{ model, messages, max_tokens, temperature }` |
| 3d | ↳ | 178-187 | `prepareMessages()` — validates/cleans conversation history |
| 3e | ↳ | 191-213 | `chat()` — tries primary model, then fallback on rate‑limit errors |
| 4 | `backend/src/app.js` | 251-255 | `POST /api/assistant/chat` route, guarded by `requireAuth` + `aiLimiter` |
| 5 | `backend/src/middleware/ratelimit.js` | 51 | "20 messages / 10 min per role-scoped identity" |
| 6 | `frontend/src/Assistant.jsx` | 1-231 | Floating chat widget component |
| 6a | ↳ | 7-31 | Role-shaped starter prompt suggestions |
| 6b | ↳ | 114 | Calls `api.assistantChat(next)` to send conversation to server |
| 7 | `frontend/src/api.js` | 84 | `assistantChat` method → `req('/assistant/chat', POST)` |
| 8 | `backend/src/db/seed.js` | 134,137,141,144 | Seed data mentions "AI/ML", "GenAI" |
| 9 | `frontend/src/pages/Training.jsx` | 176 | Placeholder "Expertise (e.g., AI/ML, Full Stack)" |
| 10 | `frontend/src/pages/Finance.jsx` | 1179 | Comment "Dynamic projection model" |

---

## 3. All API Key / Token / Secret Locations

### 3.1 OpenRouter AI Key (the one you asked about)
| File | Line | Value / Pattern | Severity |
|------|------|-----------------|----------|
| `backend/.env.example` | 32 | `# OPENROUTER_API_KEY=sk-or-v1-your-key-here` | INFO — placeholder |
| `backend/src/config/index.js` | 46 | `apiKey: process.env.OPENROUTER_API_KEY \|\| ''` | INFO — env-driven |
| `backend/src/services/assistant.service.js` | 131 | `Authorization: Bearer ${apiKey}` | INFO — runtime header |

✅ The live key itself is **not committed** — it comes from `process.env.OPENROUTER_API_KEY`. Good.

### 3.2 Other Credentials Found
| File | Line | Issue | Severity |
|------|------|-------|----------|
| `docker-compose.yml` | 6, 9 | Hardcoded MySQL passwords: `root`, `edunexus` | **HIGH** |
| `frontend/src/pages/Login.jsx` | 40 | Demo password `'org123'` in React state | **HIGH** |
| `frontend/src/pages/Login.jsx` | 151 | Renders demo password in UI | **HIGH** |
| `backend/src/config/index.js` | 25 | Default MySQL password `'mira'` if env unset | **MEDIUM** |
| `backend/.env.example` | 49 | Placeholder SMTP pass `abcd efgh ijkl mnop` | MEDIUM |
| `backend/src/services/auth.service.js` | 44 | Predictable demo token `demo-${user.id}` | LOW |
| `backend/src/services/campaign.service.js` | 752 | Hardcoded preview open token | LOW |
| `frontend/src/pages/ColdMail.jsx` | 269 | SMTP pass example displayed in UI | LOW |
| `backend/src/utils/password.js` | 4 | Comment: "DEMO-GRADE password hashing" | LOW |

### 3.3 Environment Variable Wiring
All AI/LLM env vars are read in **one central place** — `backend/src/config/index.js`:
```
OPENROUTER_API_KEY
OPENROUTER_BASE_URL  →  https://openrouter.ai/api/v1
OPENROUTER_MODEL     →  nvidia/nemotron-3-super-120b-a12b:free
OPENROUTER_MODEL_FALLBACK → inclusionai/ling-3.0-flash-sante:free
OPENROUTER_MAX_TOKENS → 900
OPENROUTER_TEMPERATURE → 0.3
OPENROUTER_TIMEOUT_MS → 45000
```
Plus SMTP and outreach config. Full list in the agent output.

---

## 4. Same API Key Used Elsewhere?

**No.** The Penrouter / OpenRouter key is only used in one place:
- `backend/src/services/assistant.service.js` → `callModel()` → OpenRouter `/chat/completions`

It is **not** shared with email, database, auth, or any other service. Each service has its own credential (SMTP_PASS, MYSQL_PASSWORD, etc.).

---

## 5. Suggestions & Hardening Checklist

### Immediate (before production)
- [ ] Move `docker-compose.yml` passwords to env vars or secrets manager
- [ ] Remove demo password `'org123'` from `Login.jsx` — use a proper auth flow
- [ ] Replace `demo-${user.id}` token with a cryptographically random token
- [ ] Remove hardcoded `open_token: 'preview0000...'` from campaign service

### Short-term
- [ ] Add `.env` validation on backend startup (fail fast if `OPENROUTER_API_KEY` missing)
- [ ] Rotate the OpenRouter key if it was ever committed (check git history)
- [ ] Add rate-limiting header logging for `/api/assistant/chat`
- [ ] Store fallback model name in env var too (already done ✅)

### Longer-term
- [ ] Use a secrets manager (AWS Secrets Manager / HashiCorp Vault / Doppler) instead of `.env` files
- [ ] Add API key encryption-at-rest for `OPENROUTER_API_KEY` in config
- [ ] Implement usage quotas per user/role beyond the existing 20 msg/10min limiter
- [ ] Add response logging (sanitised) for assistant chat to audit AI behaviour

---

## 6. Security Notes

- `backend/src/services/assistant.service.js:65` actively strips `password|hash|token|secret|api_?key` from data **before** sending to the LLM — good practice ✅
- `backend/src/services/email.service.js:10` comment confirms SMTP password never leaves the module ✅
- `.gitignore` correctly excludes `.env`, `.env.local`, `backend/.env`, `frontend/.env` ✅
- No **real** production secrets found in the scan — only placeholders and demo values ✅

---

## 7. Generated Files

This document was generated as `Project-AI-Key-Inventory.docx` in the project root.

---

*End of report.*
