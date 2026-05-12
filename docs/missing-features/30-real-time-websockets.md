---
topic: WebSocket layer for real-time events
depends-on: [22-sesi-system.md]
enables: [31-chat-messaging.md, 32-notifications.md]
key-concepts: [websocket-hub, room-semantics, jwt-auth, broadcast, single-instance]
---

# 30 — Real-time WebSocket Layer

## TL;DR

Introduce a small, in-process WebSocket hub in `internal/realtime/`. Clients connect to `GET /api/realtime?token=<short-lived-jwt>`. The connection is auto-joined to **rooms** keyed by resource (`user:<userID>`, `kelas:<kelasID>`, `sesi:<sesiID>`). Handlers publish events to rooms via a `Publisher` interface; the hub broadcasts to all sockets joined to that room. No external broker — single-process is enough for ppgus's expected scale; document where to swap in NATS / Redis later.

Checklist:

- [ ] Add `nhooyr.io/websocket` dependency (or `github.com/gorilla/websocket`).
- [ ] Create `internal/realtime/` with `hub.go`, `client.go`, `room.go`, `publisher.go`.
- [ ] Add `GET /api/realtime` upgrade endpoint (auth required).
- [ ] Add `POST /api/auth/realtime-token` returning a short-lived JWT scoped to realtime.
- [ ] Wire publisher into store layers ([21](./21-materi-system.md), [22](./22-sesi-system.md)).
- [ ] Document event taxonomy (§5).

---

## 1. Why this is needed

ppgus has no real-time channel. Sitrac uses Socket.IO; gnrs is HTTP-only. For ppgus to support live attendance updates, chat ([31](./31-chat-messaging.md)), notifications ([32](./32-notifications.md)), and grade broadcasts, a server-pushed channel is needed.

Reasons to prefer raw WebSocket over Socket.IO:

- No upstream Socket.IO server library in Go matches the protocol exactly. Either we build a sub-protocol ourselves or we adopt a library that diverges from sitrac's Socket.IO 4.x.
- Our event model is small. Raw WS + JSON envelope is enough.
- Smaller dep footprint; one library.

## 2. Library choice

Two reasonable options:

| Library | Pros | Cons |
|---|---|---|
| `nhooyr.io/websocket` | Modern API; context-aware; small | Less battle-tested than gorilla |
| `gorilla/websocket` | Battle-tested; widely deployed | Older API |

Recommendation: `nhooyr.io/websocket`. It plays well with `context.Context`, has fewer hidden globals, and is small.

## 3. Package layout

```
internal/realtime/
├── hub.go        // Hub: rooms, clients, in/out goroutines
├── room.go       // Room: subscribers, broadcast
├── client.go     // Client: per-connection state
├── publisher.go  // Publisher interface; in-process implementation
├── events.go     // Event envelope + known event kinds
└── hub_test.go
```

## 4. Core types

```go
// internal/realtime/events.go
package realtime

import "encoding/json"

type Envelope struct {
    Kind    string          `json:"kind"`
    Room    string          `json:"room"`
    Payload json.RawMessage `json:"payload"`
    At      string          `json:"at"` // RFC3339Nano
}
```

```go
// internal/realtime/hub.go
type Hub struct {
    mu    sync.RWMutex
    rooms map[string]*Room
    log   *slog.Logger
    pub   Publisher
}

func NewHub(log *slog.Logger) *Hub {
    h := &Hub{rooms: map[string]*Room{}, log: log}
    h.pub = &inProcessPublisher{hub: h}
    return h
}

func (h *Hub) Subscribe(roomKey string, c *Client) {
    h.mu.Lock()
    r, ok := h.rooms[roomKey]
    if !ok {
        r = newRoom(roomKey)
        h.rooms[roomKey] = r
    }
    r.add(c)
    h.mu.Unlock()
}

func (h *Hub) Unsubscribe(roomKey string, c *Client) {
    h.mu.Lock()
    defer h.mu.Unlock()
    r, ok := h.rooms[roomKey]
    if !ok { return }
    r.remove(c)
    if r.empty() {
        delete(h.rooms, roomKey)
    }
}

func (h *Hub) Broadcast(envelope Envelope) {
    h.mu.RLock()
    r, ok := h.rooms[envelope.Room]
    h.mu.RUnlock()
    if !ok { return }
    r.broadcast(envelope)
}

func (h *Hub) Publisher() Publisher { return h.pub }
```

```go
// internal/realtime/publisher.go
type Publisher interface {
    Publish(kind, room string, payload any)
}

type inProcessPublisher struct{ hub *Hub }

func (p *inProcessPublisher) Publish(kind, room string, payload any) {
    b, _ := json.Marshal(payload)
    p.hub.Broadcast(Envelope{
        Kind:    kind,
        Room:    room,
        Payload: b,
        At:      time.Now().UTC().Format(time.RFC3339Nano),
    })
}
```

```go
// internal/realtime/client.go
type Client struct {
    UserID string
    Conn   *websocket.Conn
    out    chan Envelope
    rooms  map[string]struct{}
}

func (c *Client) writeLoop(ctx context.Context) {
    for {
        select {
        case <-ctx.Done(): return
        case env, ok := <-c.out:
            if !ok { return }
            data, _ := json.Marshal(env)
            c.Conn.Write(ctx, websocket.MessageText, data)
        }
    }
}

func (c *Client) readLoop(ctx context.Context, hub *Hub) {
    for {
        _, data, err := c.Conn.Read(ctx)
        if err != nil { return }
        var msg struct{ Op, Room string }
        if json.Unmarshal(data, &msg) != nil { continue }
        switch msg.Op {
        case "subscribe":
            if c.canJoin(msg.Room) {
                hub.Subscribe(msg.Room, c)
            }
        case "unsubscribe":
            hub.Unsubscribe(msg.Room, c)
        case "ping":
            c.out <- Envelope{Kind: "pong", At: time.Now().UTC().Format(time.RFC3339Nano)}
        }
    }
}
```

`canJoin` checks the room key against the user's permissions.

## 5. Event taxonomy

| Kind | Room | Trigger | Payload |
|---|---|---|---|
| `sesi:started` | `kelas:<kelasID>` | `sesi.PromoteToActive` | `{ sesiId, kelasId, startedAt }` |
| `sesi:ended` | `kelas:<kelasID>` | `sesi.PromoteToEnded` | `{ sesiId, kelasId, endedAt }` |
| `sesi:cancelled` | `kelas:<kelasID>` | guru cancels | `{ sesiId, reason? }` |
| `sesi:attendance_updated` | `sesi:<sesiID>` | attendance write | `{ sesiId, userId, status, viaQR }` |
| `sesi:message_new` | `sesi:<sesiID>` | chat post | `{ sesiId, messageId, userId, body, createdAt }` |
| `pencapaian:update` | `kelas:<kelasID>` | grade write | `{ assignmentId, userId, materiId, status, mark? }` |
| `notification:new` | `user:<userID>` | notification insert | `{ id, kind, subject, body, link }` |
| `kelas:enrollment_updated` | `kelas:<kelasID>` | enrol/unenrol | `{ kelasId, userId, action }` |
| `pong` | direct | client `ping` | `-` |

Kind names mirror sitrac's Socket.IO names where they exist to ease porting.

## 6. Authentication

Use a **short-lived JWT** passed as a query parameter or `Sec-WebSocket-Protocol`.

Flow:

1. SPA calls `POST /api/auth/realtime-token`. Server returns `{ "data": { "token": "<jwt>", "expiresIn": 60 } }`.
2. SPA opens `wss://host/api/realtime?token=<jwt>`.
3. Server validates JWT. Claims: `{ "sub": "<userID>", "typ": "rt", "exp": ..., "iat": ... }`.
4. On success, `Client.UserID` is set; client auto-subscribes to `user:<userID>`.

### 6.1 Reconnection

If the token expires while connected, the server closes the socket with code 4001 `token_expired`. The SPA detects and refetches a new token.

## 7. Wire format

Server-to-client envelopes are JSON objects:

```json
{ "kind": "sesi:message_new", "room": "sesi:01HZ...", "payload": { ... }, "at": "2026-05-12T18:00:00.123Z" }
```

Client-to-server commands:

```json
{ "op": "subscribe",   "room": "sesi:01HZ..." }
{ "op": "unsubscribe", "room": "sesi:01HZ..." }
{ "op": "ping" }
```

Keep alive: server sends a heartbeat envelope every 30 s; client must `ping` every 25 s. Idle sockets are closed after 60 s.

## 8. Wiring store ↔ realtime

Store packages receive a `realtime.Publisher` via constructor injection.

```go
type Sesi struct {
    db  *sql.DB
    pub realtime.Publisher
}

func (s *Sesi) MarkAttendance(ctx context.Context, in MarkAttendanceInput) error {
    // ... INSERT/UPDATE ...
    s.pub.Publish("sesi:attendance_updated", "sesi:"+in.SesiID, map[string]any{
        "sesiId": in.SesiID,
        "userId": in.UserID,
        "status": in.Status,
        "viaQR":  in.ViaQR,
    })
    return nil
}
```

In `main.go`:

```go
hub := realtime.NewHub(logger)
sesi := store.NewSesi(db, hub.Publisher())
```

A `nopPublisher` is provided for unit tests where you do not want a hub running.

## 9. Permissions matrix for room joins

| Room | Allowed user types |
|---|---|
| `user:<X>` | The user with `id == X`, or admin |
| `kelas:<K>` | Guru of K; enrolled murid; ortu of an enrolled murid; pengurus in K's scope; admin |
| `sesi:<S>` | Same as `kelas:<S.kelasID>` |
| `scope:<P>` | Pengurus/admin in P |

Server-side enforcement in `canJoin()`. A user attempting to join a forbidden room gets `{ "kind":"error", "payload":{"code":"forbidden_room","room":"sesi:..."}}` and the request is dropped.

## 10. Frontend integration

`web/app/src/lib/realtime.ts`:

```ts
type Handler = (env: Envelope) => void

class Realtime {
    private ws?: WebSocket
    private handlers = new Set<Handler>()
    private rooms = new Set<string>()

    async connect() {
        const { token } = await fetch("/api/auth/realtime-token", { method: "POST" }).then(r => r.json()).then(r => r.data)
        this.ws = new WebSocket(`/api/realtime?token=${token}`)
        this.ws.onmessage = (e) => this.handlers.forEach(h => h(JSON.parse(e.data)))
        this.ws.onclose = (e) => { if (e.code === 4001) this.connect() }
    }

    subscribe(room: string) {
        this.rooms.add(room)
        this.ws?.send(JSON.stringify({ op: "subscribe", room }))
    }
    on(handler: Handler) { this.handlers.add(handler); return () => this.handlers.delete(handler) }
}

export const realtime = new Realtime()
```

Components join rooms via `useEffect(() => { realtime.subscribe(`sesi:${id}`); return () => realtime.unsubscribe(`sesi:${id}`) }, [id])`.

TanStack Query cache invalidation on event:

```ts
realtime.on(env => {
    if (env.kind === "sesi:attendance_updated") {
        qc.invalidateQueries({ queryKey: ["sesi", env.payload.sesiId, "attendances"] })
    }
})
```

## 11. Scaling notes

Single-process is fine for ppgus's scale (≤ ~1000 concurrent users). When that breaks:

- **Option A: Redis pub/sub.** Add a `redisPublisher` that publishes envelopes to Redis; each app process subscribes and forwards to local clients.
- **Option B: NATS.** Same shape, lower latency.
- **Option C: Sticky-session load balancer.** Cheaper, weaker.

The `Publisher` interface is the abstraction point.

## 12. Test plan

`internal/realtime/hub_test.go`:

- Subscribe two clients to the same room; broadcast → both receive.
- Unsubscribe → no longer receives.
- Empty room is removed.
- `canJoin` rejects forbidden room.

`internal/handler/realtime_test.go`:

- Connect without token → 401.
- Connect with valid token → sends `pong` on `ping`.
- Server closes with 4001 on token expiry.

## 13. Open questions

- **Per-event server-side rate limit**: bursts of `sesi:attendance_updated` during a 30-murid scan-frenzy. Recommendation: coalesce in the hub (max 10/s per room).
- **At-least-once vs at-most-once**: WebSocket gives at-most-once. Combine with TanStack Query refetch on focus for resyncing.
- **Connection upgrade in dev**: behind Vite's proxy, WS upgrades must be allowed. Add `proxy: { '/api/realtime': { target: ..., ws: true } }` to `web/app/vite.config.ts`.
