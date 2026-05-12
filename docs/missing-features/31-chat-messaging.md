---
topic: chat / messaging within a sesi
depends-on: [22-sesi-system.md, 30-real-time-websockets.md]
enables: []
key-concepts: [in-session-chat, message-history, pagination, presence]
---

# 31 — Chat & Messaging

## TL;DR

Provide a lightweight chat tied to each `sesi`. Messages are stored in `sesi_chat_messages` (defined in [22](./22-sesi-system.md)) and broadcast through the WebSocket hub ([30](./30-real-time-websockets.md)) on the `sesi:<sesiID>` room. REST endpoints back the chat history; WS pushes deliver new-message events. Optional **presence** (who is currently watching) is held in the hub and exposed via `sesi:presence` events.

Checklist:

- [ ] Endpoints `GET /api/sesi/{id}/messages` and `POST /api/sesi/{id}/messages` already specified in [22](./22-sesi-system.md) §5.3.
- [ ] Implement the handler with WS publish on insert.
- [ ] Add presence tracking in the hub (count + userIds joined to a room).
- [ ] Add an emoji-friendly text input on the frontend.
- [ ] Add lightweight moderation: guru can delete any message in their kelas's sesi.

---

## 1. Scope and non-scope

In scope:

- Per-sesi text chat with paginated history.
- Live delivery via WebSocket.
- Presence (who is online in this sesi room).
- Moderation: delete by author (5 min window) or guru.

Out of scope (for v1):

- Direct messages between users.
- Class-wide chat outside a sesi.
- File attachments (later — see [33](./33-file-uploads.md)).
- Reactions, replies, threads.
- Read receipts.

## 2. Data model

`sesi_chat_messages` from [22](./22-sesi-system.md) §3.3 — already defined. Add a `deleted_at` column to support soft-delete:

```sql
ALTER TABLE sesi_chat_messages ADD COLUMN deleted_at TEXT;
ALTER TABLE sesi_chat_messages ADD COLUMN deleted_by_user_id TEXT REFERENCES users(id);
CREATE INDEX idx_sesi_chat_deleted ON sesi_chat_messages(sesi_id, deleted_at);
```

Soft-deleted messages still show in history but with `body=null` and a "(deleted)" indicator. Hard delete requires admin.

## 3. API contract

### 3.1 Send

```
POST /api/sesi/{id}/messages
{ "body": "Salam, semua! Mulai materi sekarang." }
```

Response:

```json
{ "data": { "id": "01HZ...", "sesiId": "01HZ...", "userId": "01HZM...", "body": "...", "createdAt": "..." } }
```

Side effects:

- Insert row.
- Publish `sesi:message_new` to `sesi:<sesiID>`.
- Author has 5 minutes to delete via `DELETE /api/sesi/{id}/messages/{messageId}`.

### 3.2 List

```
GET /api/sesi/{id}/messages?before=<ULID>&limit=50
```

Cursor pagination with `before` for back-fill (initial load). Returns messages ordered descending by `created_at` then `id`.

### 3.3 Delete

```
DELETE /api/sesi/{id}/messages/{messageId}
```

- Author within 5 min: sets `deleted_at`, `deleted_by_user_id`.
- Guru / pengurus / admin: same regardless of time.

Emits `sesi:message_deleted` with the messageId.

## 4. Validation

| Field | Rule |
|---|---|
| `body` | `required,min=1,max=2000` |

Server strips outer whitespace, runs a simple safety filter:

- Disallow zero-width characters and Unicode bidi controls.
- Rate limit: 30 messages per minute per user per sesi (token bucket).

## 5. Presence

Extend the hub to track which users are subscribed to each room:

```go
type Room struct {
    key     string
    clients map[*Client]struct{}
    userIDs map[string]int // ref-count per user (one user may have multiple tabs)
}

func (r *Room) add(c *Client)    { r.clients[c] = struct{}{}; r.userIDs[c.UserID]++ }
func (r *Room) remove(c *Client) {
    delete(r.clients, c)
    if r.userIDs[c.UserID]--; r.userIDs[c.UserID] == 0 { delete(r.userIDs, c.UserID) }
}

func (r *Room) snapshotPresence() []string {
    out := make([]string, 0, len(r.userIDs))
    for id := range r.userIDs { out = append(out, id) }
    return out
}
```

Emit `sesi:presence` on subscribe/unsubscribe with the current list:

```json
{ "kind":"sesi:presence", "room":"sesi:01HZ...", "payload":{ "userIds": ["01HZ..."], "count": 5 }, "at":"..." }
```

Throttled to 1 update per second per room.

## 6. Frontend

`web/app/src/components/SesiChat.tsx`:

- Loads last 50 via REST on mount, then attaches a WS handler.
- "Load older" button uses `?before=` cursor.
- Composer is `<textarea>` with Ctrl/Cmd+Enter to send.
- Renders soft-deleted messages as italic muted "(deleted)".
- Renders presence as avatars in the header.

URL state: `?msg=<messageId>` deep-links and scrolls to a specific message.

## 7. Test plan

`internal/store/sesi_chat_test.go`:

- Create + List roundtrips.
- List with `before` returns older only.
- Delete by author within 5 min works; outside the window returns `403`.

`internal/handler/sesi_chat_test.go`:

- Non-enrolled user POSTs → 403.
- Rate-limit triggers after 31st message.
- Body with zero-width chars is rejected.

## 8. Open questions

- **Direct messages**: should pengurus or guru DM a murid? Recommendation: not in v1; route through `notifications` instead.
- **History export**: should a kelas's full chat be exportable? Yes — leverage `/api/sesi/export.csv` per-sesi export with a `?chat=true` flag.
- **Censorship list**: per-scope banned-word list? Recommendation: defer.
