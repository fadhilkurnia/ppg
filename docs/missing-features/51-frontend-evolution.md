---
topic: frontend evolution — persona dashboards, i18n, PWA, mobile-first
depends-on: [12-user-and-roles.md]
enables: []
key-concepts: [persona-dashboard, i18n-id-en, pwa-manifest, service-worker, bottom-nav, design-tokens]
---

# 51 — Frontend Evolution

## TL;DR

Evolve `web/app/` along three axes:

1. **Persona-first dashboards** (mirror sitrac-v3): one "Hari Ini" view per role (admin / pengurus / guru / ortu / murid).
2. **Internationalisation** (id, en) and **right-to-left** support for Arabic blocks.
3. **PWA**: manifest, service worker, offline cache for read-only views, install prompt.

All changes are additive within `web/app/` (no rewrite). The existing TanStack Router + TanStack Query + Tailwind setup stays.

Checklist:

- [ ] Route layout: `/_authed/home` that branches by role.
- [ ] Bottom-tab nav under 820 px (drop sidebar).
- [ ] i18n via `react-i18next` (or `@lingui/react`); locale stored in `localStorage` and on user profile.
- [ ] PWA: `web/app/public/manifest.webmanifest`, `web/app/src/sw.ts`.
- [ ] Offline cache for `GET` lists (kelas, sesi, materi).
- [ ] Design tokens via Tailwind CSS variables for sitrac-v3-style palette.

---

## 1. Persona-first dashboards

The current SPA has a single `/dashboard` route. Sitrac-v3's UX insight: each role wants one obvious next action. Adopt the same shape.

### 1.1 Routing

```
/_authed/home
├── role=admin     → AdminHome     (stats grid + recent activity_log)
├── role=pengurus  → PengurusHome  (scope summary + pending approvals)
├── role=guru      → GuruHome      (today's sesi + ungraded materi)
├── role=ortu      → OrtuHome      (children cards: today, latest grade, attendance)
└── role=murid     → MuridHome     (Mengajar Hari Ini: live sesi if any, upcoming sesi, my raport)
```

Implementation: `_authed/home.tsx` reads `useAuth().role` and renders the matching component. Each component lives in `web/app/src/routes/_authed/home/<role>.tsx`.

### 1.2 Existing dashboard

Keep `/dashboard` for compatibility. Redirect `/` → `/_authed/home` for newly-onboarded users; admins can still bookmark `/dashboard` for the stats grid.

## 2. Mobile-first navigation

Today the layout is a sidebar on desktop. Mirror sitrac-v3:

- ≥ 820 px: sidebar (current).
- < 820 px: bottom-tab nav with at most five tabs. Tab choice depends on role.

| Role | Bottom tabs |
|---|---|
| admin | Home / Kelas / Users / Pustaka / Settings |
| pengurus | Home / Kelas / Murid / Pustaka / Profil |
| guru | Home / Kelas / Materi / Pustaka / Profil |
| ortu | Home / Anak / Notifications / Pustaka / Profil |
| murid | Home / Kelas / Materi / Pustaka / Profil |

Implementation: a `<BottomNav>` component rendered conditionally via `useMediaQuery("(max-width: 820px)")`.

### 2.1 Layout component

Add `web/app/src/components/Layout.tsx` (consolidate from existing fragments). Slots: `sidebar`, `header`, `main`, `bottomNav`.

## 3. i18n

### 3.1 Library

Use `react-i18next` (5.x). It is small and supports interpolation, plurals, namespaces, and lazy-load.

### 3.2 Locales

Bootstrap with `id` and `en`. Locale files at `web/app/src/locales/{id,en}/{common,home,kelas,materi,sesi,raport}.json`.

### 3.3 Detection

Order of preference:

1. `user.preferredLocale` (column added to `users` in a later migration).
2. `localStorage.locale`.
3. `navigator.language`.
4. Fallback `id`.

### 3.4 Right-to-left for Arabic blocks

Arabic surat/hadits text within otherwise-Latin pages uses inline `<span dir="rtl" lang="ar" className="font-amiri">...</span>`. No global RTL switch — the rest of the SPA stays LTR even for Indonesian/English speakers reading Arabic.

### 3.5 Date / number formatting

Use `Intl.DateTimeFormat` and `Intl.NumberFormat` with the current locale, not hard-coded `toLocaleString()` calls. Wrap in helpers in `lib/intl.ts`.

## 4. Persona-aware navigation strings

All sidebar / bottom-nav labels go through `t()`:

```tsx
<NavLink to="/_authed/kelas">{t("nav.kelas")}</NavLink>
```

The string catalog in `id/common.json`:

```json
{ "nav": { "home": "Beranda", "kelas": "Kelas", "materi": "Materi", "anak": "Anak", "profil": "Profil" } }
```

## 5. PWA

### 5.1 Manifest

`web/app/public/manifest.webmanifest`:

```json
{
  "name": "PPG Dashboard",
  "short_name": "PPG",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#fbf8ef",
  "theme_color": "#5b6f4e",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Link from `index.html`:

```html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#5b6f4e" />
```

### 5.2 Service worker

Use `vite-plugin-pwa` (Workbox-backed). Strategies:

- HTML shell: `NetworkFirst` (so a redeploy invalidates the SPA quickly).
- API `GET /kelas`, `GET /materi`, `GET /sesi` (idempotent reads): `StaleWhileRevalidate`, max 50 entries per cache, max age 1 day.
- Media downloads: `CacheFirst`, 30 days, max 100 entries.
- WS upgrades: bypass.

The service worker also enables future offline self-attendance ([23](./23-qr-attendance.md) §8 open question): a queue of pending POSTs that flush when online.

### 5.3 Install prompt

Listen for `beforeinstallprompt`; show a button on `OrtuHome` / `MuridHome` once per session.

## 6. Design tokens

The current SPA uses Tailwind. Sitrac-v3 introduced a warm-earth palette via CSS variables. Adopt the same tokens in Tailwind config:

```js
// web/app/tailwind.config.ts
theme: {
  extend: {
    colors: {
      brand: {
        cream: "var(--ppgus-cream, #fbf8ef)",
        sage:  "var(--ppgus-sage,  #5b6f4e)",
        gold:  "var(--ppgus-gold,  #b88a3a)",
        ink:   "var(--ppgus-ink,   #2c2520)",
      }
    },
    fontFamily: {
      sans: ["Inter", "system-ui", "sans-serif"],
      amiri: ["Amiri", "serif"],
    }
  }
}
```

Use Tailwind classes `bg-brand-cream`, `text-brand-sage`, etc. CSS variables in `web/app/src/index.css` set the defaults and could be overridden per-scope via `<html data-scope="...">`.

## 7. Components to add

| Component | Purpose |
|---|---|
| `<Layout>` | Sidebar + bottom-nav routing |
| `<BottomNav>` | Mobile nav with role-aware tabs |
| `<PersonaHome>` | Switch component for `/home` |
| `<LocaleSwitcher>` | en/id toggle in profile |
| `<ScopePicker>` | tree picker for daerah/desa/kelompok |
| `<NotificationBell>` | bell + dropdown ([32](./32-notifications.md)) |
| `<QRDisplay>` and `<QRScanner>` | from [23](./23-qr-attendance.md) |
| `<BulkImporter>` / `<BulkExporter>` | from [24](./24-bulk-operations.md) |
| `<MediaUpload>` | from [33](./33-file-uploads.md) |
| `<SesiChat>` | from [31](./31-chat-messaging.md) |
| `<Avatar>` | initials fallback; `media_bank` image |

## 8. Existing routes — keep working

The following must keep working after the new layout lands:

- `/login`
- `/dashboard`
- `/students`, `/students/$id`
- `/teachers`, `/teachers/$id`
- `/attendance`, `/sessions`, `/achievement`

Add new routes alongside; do not delete existing ones.

## 9. Accessibility

- Every interactive element has a label (`aria-label` or visible text).
- Focus styles visible (`focus-visible:` Tailwind variants).
- Contrast ratio ≥ 4.5:1 for body text against the sage/cream palette.
- Bottom-tab buttons ≥ 44 × 44 px.

## 10. Performance

- Lazy-load heavy routes via Router's `lazy: () => import(...)` (raport, pustaka, media bank, scanner).
- TanStack Query: configure `staleTime: 60_000` and `gcTime: 5*60_000` to cut refetches.
- Tree-shake icons (`lucide-react` is per-icon imports already).

## 11. Open questions

- **Animation framework**: Framer Motion adds ~50 kB; the existing UI uses pure CSS transitions. Recommendation: avoid for v1.
- **Dark mode**: defer; Tailwind tokens can later add `dark:` variants.
- **Component library swap**: not needed — current bespoke components match the style; resist adding shadcn/Mantine.
