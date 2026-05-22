# Dream-E Admin Panel & Multi-User Management — Implementation Plan

## 1. Overview

Transform Dream-E from a single-user local tool into a multi-user server application with:

- **User registration/login** (already exists — auth system in `server/auth/`)
- **Per-user project isolation** (already exists — projects table has `user_id` FK)
- **Centralized API key management** — admin stores keys server-side, users never see them
- **Usage tracking** — log every LLM call, image gen, TTS call per user
- **Rate limiting** — per-user daily quotas for each API type
- **Admin panel** — web UI for managing users, keys, limits, and viewing usage

---

## 2. What Already Exists (No Changes Needed)

| Component | Location | Status |
|---|---|---|
| User registration (email/password) | `server/auth/routes.cjs` | Working |
| Google OAuth login | `server/auth/routes.cjs` | Working |
| JWT auth (access + refresh tokens) | `server/utils/jwt.cjs` | Working |
| Auth middleware (`requireAuth`) | `server/auth/middleware.cjs` | Working |
| SQLite database (sql.js WASM) | `server/db.cjs` | Working |
| Users table | `server/db.cjs` SCHEMA_SQL | Working |
| Projects table (user_id FK) | `server/db.cjs` SCHEMA_SQL | Working |
| Assets table + file storage | `server/db.cjs` + `server/assets/` | Working |
| Sessions table (refresh tokens) | `server/db.cjs` SCHEMA_SQL | Working |
| Project CRUD routes | `server/projects/routes.cjs` | Working |

---

## 3. New Database Tables

Add to `SCHEMA_SQL` in `server/db.cjs`:

### 3.1 `admin_config` — Centralized API Keys & Model Settings

```sql
CREATE TABLE IF NOT EXISTS admin_config (
  key TEXT PRIMARY KEY,           -- e.g. 'image_provider', 'gemini_api_key'
  value TEXT NOT NULL,            -- encrypted for secrets, plain for settings
  is_secret INTEGER DEFAULT 0,   -- 1 = value is AES-256-GCM encrypted
  updated_at INTEGER NOT NULL
);
```

**Config keys to support:**

| Key | Type | Description |
|---|---|---|
| `image_provider` | setting | 'bfl' / 'gemini' / 'openai-compatible' |
| `image_model` | setting | Model name (e.g., 'flux-2-pro', 'imagen-3.0') |
| `image_api_key` | secret | API key for image generation |
| `image_endpoint` | setting | Custom endpoint URL (for OpenAI-compatible) |
| `llm_provider` | setting | 'gemini' / 'openai-compatible' |
| `llm_model` | setting | Model name (e.g., 'gemini-2.5-flash') |
| `llm_api_key` | secret | API key for LLM |
| `llm_endpoint` | setting | Custom endpoint URL |
| `tts_model` | setting | TTS model name |
| `tts_api_key` | secret | API key for TTS (may share with LLM) |
| `tts_voice` | setting | Default voice ID |
| `default_image_style` | setting | Style prompt appended to all image prompts |
| `encryption_key_check` | internal | Hash to verify the master encryption key |

### 3.2 `usage_log` — Per-User API Usage Tracking

```sql
CREATE TABLE IF NOT EXISTS usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  api_type TEXT NOT NULL,         -- 'llm' / 'image' / 'tts'
  provider TEXT NOT NULL,         -- 'gemini' / 'bfl' / 'openai' etc.
  model TEXT NOT NULL,            -- specific model used
  tokens_in INTEGER DEFAULT 0,   -- input tokens (LLM only)
  tokens_out INTEGER DEFAULT 0,  -- output tokens (LLM only)
  image_count INTEGER DEFAULT 0, -- number of images generated
  audio_seconds REAL DEFAULT 0,  -- TTS audio duration in seconds
  cost_estimate REAL DEFAULT 0,  -- estimated cost in USD (optional)
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_type ON usage_log(api_type, created_at);
```

### 3.3 `user_limits` — Per-User Daily Quotas

```sql
CREATE TABLE IF NOT EXISTS user_limits (
  user_id TEXT PRIMARY KEY,
  max_projects INTEGER DEFAULT 20,
  daily_llm_tokens INTEGER DEFAULT 500000,     -- max input+output tokens per day
  daily_images INTEGER DEFAULT 50,              -- max image generations per day
  daily_tts_seconds REAL DEFAULT 600,           -- max TTS audio seconds per day
  is_admin INTEGER DEFAULT 0,                   -- 1 = admin access
  is_active INTEGER DEFAULT 1,                  -- 0 = account disabled
  notes TEXT DEFAULT '',                        -- admin notes about this user
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 3.4 Alter `users` table

Add column (via migration logic, not ALTER TABLE in SQLite — use a flag or check):

```sql
-- Add is_admin column if not exists (handled via migration code)
-- users.is_admin INTEGER DEFAULT 0
```

Actually, prefer to use the `user_limits.is_admin` field instead of altering the users table, to avoid SQLite ALTER TABLE limitations.

---

## 4. Encryption for API Keys

### 4.1 Encryption Approach

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Master key**: Derived from an environment variable `DREAME_ADMIN_SECRET` using PBKDF2 with a static salt stored in the config table
- **Per-value**: Each secret gets a unique IV (initialization vector) prepended to the ciphertext
- **Storage format**: `base64(iv + ciphertext + authTag)` in the `value` column when `is_secret = 1`
- **Node.js crypto module**: Built-in, no extra dependencies

### 4.2 New File: `server/utils/crypto.cjs`

```javascript
// encrypt(plaintext, masterKey) → base64 string
// decrypt(encrypted, masterKey) → plaintext string
// deriveMasterKey(envSecret) → 32-byte key via PBKDF2
```

### 4.3 Environment Variable

```
DREAME_ADMIN_SECRET=your-secret-passphrase-here
```

If not set, fall back to a generated random key stored in `server-data/.admin-key` (for development). Print a warning at startup if using the file-based key.

---

## 5. Server-Side API Routing Changes

### 5.1 Current Flow (Client Sends Keys)

```
Browser (AI Settings store) → POST /api/generate-image { apiKey, model, ... }
                              → vite.config.ts middleware → external API
```

### 5.2 New Flow (Server Manages Keys)

```
Browser (no API keys) → POST /api/v2/ai/generate-image { prompt, entityIds, ... }
                        → server/ai/routes.cjs (auth required)
                        → reads admin_config for provider/model/key
                        → checks user_limits + usage_log for quota
                        → calls external API with server-stored key
                        → logs usage to usage_log
                        → returns result to browser
```

### 5.3 New Route Group: `server/ai/routes.cjs`

All AI routes require authentication (`requireAuth` middleware).

| Route | Method | Description |
|---|---|---|
| `POST /ai/generate-image` | POST | Image generation (provider from admin config) |
| `POST /ai/chat` | POST | LLM chat completion (provider from admin config) |
| `POST /ai/chat-reset` | POST | Reset chat history |
| `POST /ai/generate-tts` | POST | TTS generation (provider from admin config) |
| `GET  /ai/config` | GET | Returns non-secret config to frontend (provider names, model names, default style — NO API keys) |

### 5.4 Usage Tracking Middleware

Before each AI route handler, check:
1. User is authenticated
2. User account is active (`is_active = 1`)
3. User has not exceeded daily quota for this API type
4. If quota exceeded → return `429 Too Many Requests` with remaining quota info

After each successful AI call:
1. Insert a row into `usage_log` with tokens/images/seconds used
2. Include provider, model, and timestamp

### 5.5 Frontend Changes

- **Remove API key fields from AI Settings UI** — users no longer enter keys
- **AI Settings shows read-only config**: which provider/model is active (fetched from `GET /ai/config`)
- **Image gen, TTS, chat calls** route through `/api/v2/ai/*` instead of `/api/generate-image`, `/api/generate-tts`, `/api/chat`
- **Quota display**: Show remaining daily quota in the AI Settings panel or status bar

---

## 6. Admin Panel

### 6.1 Access Control

- Admin panel accessible at `/admin` route in the frontend
- Requires login + `is_admin = 1` in `user_limits` table
- First user to register can be auto-promoted to admin (or via env var `DREAME_ADMIN_EMAIL`)
- Admin routes in the API are protected by `requireAdmin` middleware

### 6.2 Admin API Routes: `server/admin/routes.cjs`

All require `requireAdmin` middleware.

| Route | Method | Description |
|---|---|---|
| **Users** | | |
| `GET /admin/users` | GET | List all users with limits + usage summary |
| `GET /admin/users/:id` | GET | Single user detail with full usage history |
| `PATCH /admin/users/:id/limits` | PATCH | Update user limits (quotas, active, admin) |
| `DELETE /admin/users/:id` | DELETE | Delete user and all their data |
| **Config** | | |
| `GET /admin/config` | GET | Get all config (secrets are masked) |
| `PUT /admin/config` | PUT | Set config values (encrypts secrets) |
| **Usage** | | |
| `GET /admin/usage` | GET | Aggregated usage stats (by day, by user, by API type) |
| `GET /admin/usage/:userId` | GET | Usage history for specific user |
| **System** | | |
| `GET /admin/stats` | GET | System overview (total users, projects, storage, DB size) |

### 6.3 Admin Panel Frontend Pages

New React pages under `src/components/admin/`:

#### 6.3.1 Dashboard (`/admin`)
- Total users, total projects, total storage used
- Usage summary for today (LLM tokens, images, TTS seconds)
- Recent registrations
- System health indicators

#### 6.3.2 Users (`/admin/users`)
- Table with columns: Email, Display Name, Projects, Usage Today, Limits, Status, Actions
- Click row → opens user detail panel
- Inline editing for limits (max projects, daily tokens, daily images, daily TTS)
- Toggle: Active/Disabled
- Toggle: Admin/Regular user
- Delete user button (with confirmation)

#### 6.3.3 AI Configuration (`/admin/config`)
- **Image Generation tab**: Provider dropdown, model selector, API key field (masked), endpoint URL
- **LLM / Writer tab**: Provider dropdown, model selector, API key field (masked), endpoint URL
- **TTS tab**: Model selector, API key field (masked), default voice
- **Defaults tab**: Default image style prompt, other global settings
- Save button → encrypts secrets and stores in admin_config
- Test button → makes a small test call to verify the key works

#### 6.3.4 Usage Analytics (`/admin/usage`)
- Date range picker
- Charts: daily token usage, daily image count, daily TTS seconds
- Breakdown by user (table)
- Breakdown by provider/model
- Export as CSV

---

## 7. Frontend Changes Summary

### 7.1 Remove from User-Facing UI
- API key input fields in AI Settings
- Provider/model selectors in AI Settings (these become read-only, showing what the admin configured)

### 7.2 Add to User-Facing UI
- Quota indicator (e.g., "Images: 12/50 today" in status bar or AI Settings)
- Friendly error when quota exceeded: "Daily image limit reached. Contact admin."

### 7.3 Route Changes
- All AI calls go through `/api/v2/ai/*` (authenticated, server-managed keys)
- Old `/api/generate-image`, `/api/generate-tts`, `/api/chat` routes removed from vite.config.ts middleware
- New admin routes at `/api/v2/admin/*`

### 7.4 New Frontend Routes
- `/admin` → Admin Dashboard
- `/admin/users` → User Management
- `/admin/config` → AI Configuration
- `/admin/usage` → Usage Analytics
- Protected by admin check (redirect to login if not admin)

---

## 8. Security Considerations

| Concern | Mitigation |
|---|---|
| API keys in database | AES-256-GCM encryption with env-based master key |
| API keys in transit | Never sent to browser; only admin can view (masked) |
| Admin access | Requires `is_admin` flag in DB + auth middleware |
| SQL injection | Parameterized queries (sql.js supports `?` placeholders) |
| CSRF | httpOnly cookies for refresh tokens (already implemented) |
| Brute force | Rate limiting on auth endpoints (add express-rate-limit) |
| User isolation | All project/usage queries filter by `user_id` from JWT |
| Quota bypass | Server-side check before every AI call (not client-side) |
| Master key rotation | Re-encrypt all secrets when DREAME_ADMIN_SECRET changes |
| First admin setup | `DREAME_ADMIN_EMAIL` env var auto-promotes first matching user |

---

## 9. Implementation Sequence

```
Phase 1: Database Schema + Encryption (server-only, no UI changes)
  1.1  Add admin_config, usage_log, user_limits tables to db.cjs
  1.2  Create server/utils/crypto.cjs (AES-256-GCM encrypt/decrypt)
  1.3  Add migration logic for existing users → create user_limits rows
  1.4  Admin seeding: DREAME_ADMIN_EMAIL env var

Phase 2: Server-Side AI Routes (replaces client-side API calls)
  2.1  Create server/ai/routes.cjs with image, chat, tts endpoints
  2.2  Quota checking middleware (reads user_limits + usage_log)
  2.3  Usage logging after each successful call
  2.4  Mount at /api/v2/ai/* in server/index.cjs
  2.5  Move image gen logic from vite.config.ts → server/ai/imageGen.cjs
  2.6  Move chat logic from vite.config.ts → server/ai/chat.cjs
  2.7  Move TTS logic from vite.config.ts → server/ai/tts.cjs

Phase 3: Admin API Routes
  3.1  Create server/admin/routes.cjs
  3.2  requireAdmin middleware
  3.3  User CRUD + limits endpoints
  3.4  Config get/set endpoints (with encryption)
  3.5  Usage aggregation endpoints
  3.6  System stats endpoint

Phase 4: Admin Panel Frontend
  4.1  Admin layout component with sidebar nav
  4.2  Dashboard page (stats overview)
  4.3  Users page (table + inline editing)
  4.4  AI Config page (providers, models, keys)
  4.5  Usage page (charts + tables)
  4.6  Route protection (redirect if not admin)

Phase 5: Frontend AI Integration Changes
  5.1  Replace /api/generate-image calls with /api/v2/ai/generate-image
  5.2  Replace /api/generate-tts calls with /api/v2/ai/generate-tts
  5.3  Replace /api/chat calls with /api/v2/ai/chat
  5.4  Remove API key fields from AI Settings UI
  5.5  Add quota display to UI
  5.6  Clean up old middleware from vite.config.ts

Phase 6: Testing & Hardening
  6.1  Test user registration → login → project CRUD → AI calls
  6.2  Test quota enforcement (exceed limit → 429)
  6.3  Test admin panel CRUD
  6.4  Test encryption/decryption cycle
  6.5  Test user isolation (user A can't see user B's projects)
  6.6  Verify no API keys are leaked to browser
```

---

## 10. Files to Create/Modify

| File | Action | Description |
|---|---|---|
| `server/db.cjs` | MODIFY | Add 3 new tables + migration logic |
| `server/utils/crypto.cjs` | CREATE | AES-256-GCM encrypt/decrypt + key derivation |
| `server/ai/routes.cjs` | CREATE | AI proxy routes (image, chat, TTS) |
| `server/ai/imageGen.cjs` | CREATE | Image gen logic (moved from vite.config.ts) |
| `server/ai/chat.cjs` | CREATE | Chat logic (moved from vite.config.ts) |
| `server/ai/tts.cjs` | CREATE | TTS logic (moved from vite.config.ts) |
| `server/ai/quotaCheck.cjs` | CREATE | Quota enforcement middleware |
| `server/ai/usageLogger.cjs` | CREATE | Usage logging helper |
| `server/admin/routes.cjs` | CREATE | Admin API routes |
| `server/admin/middleware.cjs` | CREATE | requireAdmin middleware |
| `server/index.cjs` | MODIFY | Mount /ai and /admin route groups |
| `vite.config.ts` | MODIFY | Remove AI middleware, keep only dev proxy |
| `src/components/admin/` | CREATE | Admin panel React pages (4-5 files) |
| `src/stores/useImageGenStore.ts` | MODIFY | Remove API key fields, add quota state |
| `src/services/aiChatService.ts` | MODIFY | Route through /api/v2/ai/chat |
| `src/App.tsx` | MODIFY | Add /admin routes |

---

## 11. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DREAME_ADMIN_SECRET` | Yes (prod) | Master passphrase for encrypting API keys in DB |
| `DREAME_ADMIN_EMAIL` | Optional | Email address auto-promoted to admin on first login |
| `JWT_SECRET` | Yes | Already exists — used for JWT signing |
| `NODE_ENV` | Optional | 'production' enforces email confirmation |
| `DREAME_PORT` | Optional | Server port (default 5173) |

---

## 12. Additional Admin Features

| Feature | Description |
|---|---|
| **User activity log** | Last login timestamp, login count |
| **Project count per user** | Shown in user table, enforced by max_projects limit |
| **Storage usage per user** | Sum of asset sizes, shown in user detail |
| **Bulk user actions** | Enable/disable multiple users at once |
| **Config change history** | Log who changed what config and when |
| **System backup** | Download the SQLite DB file from admin panel |
| **Announcement banner** | Set a message displayed to all users (maintenance, updates) |
| **User search/filter** | Search by email, filter by active/inactive/admin |
| **API key test** | "Test Connection" button that makes a minimal API call to verify key works |
| **Auto-disable on abuse** | If a user makes unusual number of requests, auto-flag for review |
