# AI Whiteboard

A collaborative whiteboard where a team draws together in real time and an AI turns prompts into sticky notes, outlines, flow diagrams and charts directly on the canvas.

**Stack:** React 19 + Vite + Tailwind 4 (client) · Express + Socket.IO + PostgreSQL/Neon (server) · Neon Auth (JWT) · Google Gemini (AI) · Neon Object Storage (images).

```
client/   React SPA — SVG canvas, tools, presence, AI panel
server/   REST API + Socket.IO — Postgres persistence, auth, Gemini, uploads
```

---

## How it works

### The core loop

The board page owns an `elements` array — that array is the source of truth for what you see. Everything else is a way of keeping it in sync:

1. **Load** — `GET /api/whiteboards/:id` returns the board, all its elements (ordered by `z`) and its members in one shot.
2. **Local gesture** — dragging, resizing, drawing or typing mutates the local array immediately. No network round-trip in the gesture.
3. **Stream the motion** — while a drag is in flight, `element:live` packets are broadcast over Socket.IO (throttled to ~50ms) so collaborators see the element move. Cursors stream the same way (`presence:cursor`, ~45ms). Live packets are **not** persisted.
4. **Persist at gesture end** — one `PATCH`/`POST`/`DELETE` per change. The server writes to Postgres and broadcasts the authoritative row to the room.
5. **Receive** — every other client applies `element:created` / `element:updated` / `element:deleted` to its local array.

Echo suppression: every REST write carries an `x-socket-id` header, and `emitToBoard()` broadcasts with `.except(thatSocketId)`. The client that made the change never receives its own write back — it already has the state.

### Optimistic create + temp ids

New elements are added locally with a `crypto.randomUUID()` temp id, then `POST`ed. When the server responds with the real id, the client remaps it in `elements`, `selectedIds` and `past`/`future`. If the write fails, the element is rolled back.

### Undo / redo

Snapshots of the `elements` array (max 100) are pushed to a history stack before each mutating gesture — but only if the gesture actually changed something (`checkpoint()` sets a pending snapshot; a `useEffect` commits it once the array differs). Undo/redo then **diffs** the restored snapshot against the current state (`reconcile()`): missing elements are deleted, new ones created, changed ones updated. So history is just a set of REST calls — no separate undo endpoint.

### Auth (Neon Auth)

There is no password code in this repo. Sign-in/sign-up go through `@neondatabase/auth-ui` at `/auth/:pathname`, and the session JWT is kept in memory by `client/src/lib/neonAuth.js`.

The server never trusts the client's identity claims — it verifies the token itself:

- `server/src/config/neonAuth.js` pulls the Neon Auth **JWKS** (`$NEON_AUTH_URL/.well-known/jwks.json`) through `jose` and verifies the JWT signature.
- Non-JWT tokens fall back to `GET $NEON_AUTH_URL/get-session`.
- The verified `email` is upserted into `users` on every request (JIT provisioning) — first API call creates the row.

The same verifier guards HTTP (`requireAuth`) and the Socket.IO handshake (`io.use`). Socket connections carry the token in `handshake.auth.token`.

### Realtime rooms

On `wb:join` the server checks `owner OR whiteboard_members` membership before joining the Socket.IO room `wb:<boardId>`, then emits `presence:sync` with the current viewers. Room events:

| Direction | Event | Purpose |
|---|---|---|
| C→S | `wb:join` / `wb:leave` | join/leave the room (access-checked) |
| C→S | `presence:cursor` | pointer position |
| C→S | `element:live` | in-flight drag/draw state |
| S→C | `presence:sync` / `join` / `leave` | viewer list |
| S→C | `element:created` / `updated` / `deleted` | persisted change (echo-suppressed) |
| S→C | `board:updated`, `member:added` / `member:removed` | metadata + sharing |

### AI (Gemini)

`server/src/services/aiService.js` wraps `@google/genai`. Every prompt demands **JSON only**, and `extractJson()` tolerates fenced code blocks / surrounding prose before `JSON.parse` — then the controller sanitizes shapes (string lengths, id references, node/edge validation, row caps). Bad or empty output becomes a `502` with a readable message, quota errors become `429`.

The interesting part is that **the server does the layout, not the model**:

- **Brainstorm** → the model returns short texts; the controller lays them out in a grid with rotating sticky colors.
- **Outline** → a title `text` element plus a `bullet` element stacked underneath.
- **Diagram** → the model returns `{nodes, edges}`; the controller topologically levels the graph, packs each level into a row, sizes nodes by shape (ellipse/rect/diamond), and draws `arrow` elements clipped to node borders with `borderPoint()`.
- **Chart** → one `chart` element (bar/line/pie/donut) with 3–8 rows.
- **Edit selection** → text-bearing elements (and charts) are sent with their ids, edited content comes back keyed by the same ids, then written to Postgres.
- **Summary** → the board's text/sticky/bullet content is flattened and summarized into headline / themes / action items / questions (returned, not placed).

Because AI results are **inserted server-side**, they're persisted first and then broadcast as `element:created` — everyone on the board watches the generated content appear, while the requester merges the same rows from the HTTP response.

### Images

Multer buffers the upload in memory (images only, 8MB max), then:

- **Neon Object Storage configured** → `PutObject` to the bucket, URL is returned.
- **Not configured** → written to `server/uploads/` and served from `/uploads` (30-day cache).

Deleting an image element (or a whole board) deletes the backing object/file via `fileCleanup`.

### Rendering

The canvas is a plain **SVG surface** with a camera `{x, y, zoom}` transform — no canvas library. `ElementRenderer` draws the 12 element types (`text`, `sticky`, `rect`, `ellipse`, `diamond`, `line`, `arrow`, `draw`, `bullet`, `image`, `chart`, `emoji`); freehand strokes are smoothed with `perfect-freehand`. Hit-testing, bounds, rotation handles and world↔screen math live in `client/src/lib/canvas.js`. PNG/SVG export re-renders the same element list offscreen (`client/src/lib/exportCanvas.js`).

---

## API

All routes require `Authorization: Bearer <Neon Auth JWT>` except `GET /api/health`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | liveness |
| GET | `/api/whiteboards` | boards you own or are a member of |
| POST | `/api/whiteboards` | `{ title, description, background, bg_color }` |
| GET | `/api/whiteboards/:id` | `{ board, elements, members }` |
| PATCH | `/api/whiteboards/:id` | owner/editor |
| DELETE | `/api/whiteboards/:id` | owner only; also deletes image uploads |
| POST/DELETE | `/api/whiteboards/:id/members[/:userId]` | owner only; email-based invite, `editor`\|`viewer` |
| POST | `/api/whiteboards/:id/elements` | `{ type, data, z }` |
| POST | `/api/whiteboards/:id/elements/bulk` | `{ elements: [...] }` |
| PATCH | `/api/whiteboards/:id/elements/:elementId` | `{ data?, z? }` |
| DELETE | `/api/whiteboards/:id/elements/:elementId` | |
| POST | `/api/whiteboards/:id/uploads` | multipart `image` |
| POST | `/api/whiteboards/:id/ai/brainstorm` | `{ topic, count, x, y }` |
| POST | `/api/whiteboards/:id/ai/outline` | `{ topic, count, x, y }` |
| POST | `/api/whiteboards/:id/ai/diagram` | `{ topic, count, x, y }` |
| POST | `/api/whiteboards/:id/ai/chart` | `{ topic, x, y }` |
| POST | `/api/whiteboards/:id/ai/edit` | `{ instruction, ids }` |
| POST | `/api/whiteboards/:id/ai/summary` | `{ }` → `{ summary }` |

`/api/boards/*` is an alias of `/api/whiteboards/*`.

Access is enforced by `requireBoardAccess` (owner or member) and `requireEditAccess` (owner or `editor` role — viewers are read-only, including on socket events).

## Data model

```
users            id · name · email (unique) · avatar_url · created_at
whiteboards      id · title · description · background · bg_color · owner_id → users
whiteboard_members  (whiteboard_id, user_id) PK · role editor|viewer
elements         id · whiteboard_id · type · data JSONB · z (double, stack order)
                   created_by → users (nullable) · timestamps
```

Elements are schemaless on purpose: `data` holds per-type geometry and content (`x y w h`, `text`, `fill`, `stroke`, `items`, `src`, `chartType`, points of a `draw` stroke…), so adding a new element type needs no migration. Indexes cover owner, board, and member lookups.

---

## Running it locally

**Prerequisites:** Node 18+, a Neon (Postgres) database, a Neon Auth instance, a Gemini API key.

### 1. Server

```bash
cd server
npm install
```

Create `server/.env`:

```ini
PORT=5050
NODE_ENV=development
CLIENT_URL=http://localhost:5050        # CORS origin → the Vite dev server

DATABASE_URL=postgresql://...           # Neon pooled connection string

NEON_AUTH_URL=https://<your-auth>.neon.tech   # JWKS + get-session base URL

GEMINI_API_KEY=...                      # Google AI Studio key
GEMINI_MODEL=gemini-2.0-flash           # optional, this is the default

# Optional — S3-compatible image storage; omit to write to server/uploads/
NEON_STORAGE_ENDPOINT=https://...
NEON_STORAGE_REGION=...
NEON_STORAGE_ACCESS_KEY_ID=...
NEON_STORAGE_SECRET_ACCESS_KEY=...
NEON_STORAGE_BUCKET=...
PUBLIC_URL=http://localhost:5050        # only for local upload URLs behind a proxy
```

Then create the tables and start:

```bash
npm run db:init   # applies src/db/schema.sql
npm run dev       # node --watch index.js → http://localhost:5050
```

### 2. Client

```bash
cd client
npm install
```

Create `client/.env`:

```ini
VITE_API_URL=http://localhost:5050/api
VITE_SOCKET_URL=http://localhost:5050
VITE_NEON_AUTH_URL=https://<your-auth>.neon.tech   # required for sign-in
VITE_NEON_DATA_API_URL=                            # optional, defaults to the above
```

```bash
npm run dev    # vite → http://localhost:5173
npm run lint   # oxlint
```

Open `http://localhost:5173`, sign up, create a board from the dashboard, share it by email from the Share modal, and invite the same person in a second browser window to see presence and live updates.

---

## Project layout

```
client/src/
  App.jsx                    routes (Neon Auth vs legacy), Toaster
  pages/Landing|Dashboard|WhiteboardPage|Login|Register|NotFound
  components/board/          Canvas, Toolbar, TopBar, StylePanel, AIPanel,
                             ElementRenderer, ChartEditor, ShareModal, …
  context/AuthContext.jsx    session state
  lib/api.js                 axios client: token refresh, retries, typed API groups
  lib/socket.js              socket singleton + connect with fresh token
  lib/neonAuth.js            Neon Auth SDK wrapper, in-memory JWT cache
  lib/canvas.js              geometry, hit-test, tools, transforms
  lib/exportCanvas.js        offscreen PNG/SVG export

server/src/
  config/                    db pool · neonAuth (JWKS) · storage (S3) · uploads
  middleware/                auth · whiteboardAccess · upload (multer) · errors
  controllers/               whiteboard · element · ai · upload · user
  routes/                    /api → users + whiteboards
  services/aiService.js      Gemini prompts + JSON extraction/validation
  socket/ + realtime/        Socket.IO setup, rooms, echo-suppressed broadcast
  db/                        schema.sql, init.js
```

## Design notes / limits

- **Postgres is the source of truth**; Socket.IO only fans out. A client that misses events re-fetches on load — there is no delta/OT sync, which is fine for a small number of concurrent editors on one board.
- `element:live` is fire-and-forget and lossy by design (throttled); the persisted `PATCH` on gesture end is what matters.
- Element `data` is unvalidated JSON beyond "is an object" — types are enforced (`VALID_TYPES`), field validation is the client's job.
- The `db:seed` npm script points at a seed file that doesn't exist yet; `db:init` is the only migration step.

## License

ISC
