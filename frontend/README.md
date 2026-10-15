# CampusPass Frontend

A modern, high-performance, responsive React 19 + TypeScript frontend for **CampusPass** — the institutional smart campus attendance system featuring PIN authentication, 3D face verification, GPS geofencing, and an administrative workspace.

---

## 🚀 Key Architectural Highlights

- **Framework & Tooling:** React 19, TypeScript 5.8, Vite 6, `oxlint` (zero warnings/errors).
- **Routing:** `react-router-dom` v7 with route-based code-splitting (`React.lazy` + `Suspense`), deep-linking, browser history navigation, and role-based route guards (`ProtectedRoute`, `AdminRoute`, `StaffRoute`, `PublicOnlyRoute`).
- **Styling Architecture:** 100% pure vanilla CSS using custom CSS variables (Design Tokens) in `src/styles/tokens.css` and `src/index.css`. No external UI libraries or Tailwind.
- **Adaptive Dark Mode:** Zero-flash inline script initialization with system theme fallback (`prefers-color-scheme`) and user-override toggle stored in `localStorage`.
- **Modular Component Library:** In-house accessible UI components (`Button`, `Card`, `Badge`, `Modal`, `ConfirmDialog`, `Table`, `StatCard`, `Stepper`, `EmptyState`, `Skeleton`, `Spinner`) located in `src/components/ui/`.
- **Strict File Bounds:** No file exceeds 400 lines; complex flows are split into single-responsibility sub-components.
- **Zero Browser Blockers:** Replaced all native `window.alert()` and `window.confirm()` calls with non-blocking toast notifications (`useToast`) and accessible confirm dialogs (`useConfirm`).

---

## 📁 Project Structure

```
frontend/
├── index.html                  # Branded shell, theme-color meta, fonts, zero-flash theme script
├── .env.example                # Example environment configuration
├── package.json
├── vite.config.ts
├── src/
│   ├── main.tsx                # React root mount
│   ├── index.css               # Global reset, typography, and responsive breakpoints
│   ├── styles/
│   │   └── tokens.css          # Color tokens, radii, shadows, spacing, motion
│   ├── types/
│   │   └── index.ts            # Domain entities, API request/response types
│   ├── api/
│   │   ├── request.ts          # Central fetch client with Bearer auth, 401 handling, Blob exports
│   │   ├── endpoints.ts        # API endpoint definitions
│   │   └── client.ts           # Typed API facade
│   ├── auth/
│   │   ├── context.ts          # AuthContext definition
│   │   ├── AuthProvider.tsx    # AuthProvider with sessionStorage persistence
│   │   ├── useAuth.ts          # useAuth hook
│   │   ├── Guards.tsx          # ProtectedRoute, AdminRoute, StaffRoute, PublicOnlyRoute
│   │   └── index.ts
│   ├── hooks/
│   │   ├── useCamera.ts        # MediaDevices camera streaming & canvas capture
│   │   ├── useGeolocation.ts   # GPS coordinates acquisition & accuracy tracking
│   │   ├── useTheme.ts         # Light / Dark theme management
│   │   ├── useDebounce.ts      # Input debounce utility
│   │   ├── usePolling.ts       # Polling interval helper
│   │   ├── useOnlineStatus.ts  # Browser navigator.onLine connectivity watcher
│   │   ├── toast/              # Toast notification context & hook
│   │   ├── confirm/            # Modal confirm dialog context & hook
│   │   └── index.ts
│   ├── components/
│   │   └── ui/                 # Reusable atomic UI components & modular stylesheets
│   ├── features/
│   │   ├── auth/               # LoginPage (PIN login, waking server indicator)
│   │   ├── verify/             # Staff check-in & check-out 3-step wizard
│   │   │   ├── CheckInPage.tsx
│   │   │   ├── CameraScanner.tsx
│   │   │   ├── LocationGeofenceCard.tsx
│   │   │   ├── ReviewConfirmCard.tsx
│   │   │   ├── AttendanceSuccessCard.tsx
│   │   │   ├── AttendanceHistoryTable.tsx
│   │   │   └── LeaveDutyForm.tsx
│   │   ├── admin/              # Admin workspace
│   │   │   ├── AdminLayout.tsx # Sidebar, header, notification drawer, breadcrumbs
│   │   │   ├── OverviewPage.tsx# Stats, SVG donut chart, rules, recent activity
│   │   │   ├── StaffPage.tsx   # Staff roster, PIN reset, face enroll, add staff
│   │   │   ├── HistoryPage.tsx # Attendance logs with filters and CSV export
│   │   │   ├── RequestsPage.tsx# Leave/OD approvals and reviews
│   │   │   ├── AuditPage.tsx   # Security audit journal
│   │   │   ├── NotificationsPage.tsx # Admin notification list
│   │   │   └── AlertsPage.tsx  # Absence alerts with direct WhatsApp wa.me links
│   │   └── privacy/            # Privacy notice regarding face & GPS processing
│   └── app/
│       ├── App.tsx             # Root providers wrapper (Theme, Auth, Toast, Confirm)
│       └── AppRoutes.tsx       # Route tree with React.lazy and Suspense fallbacks
```

---

## 🛠 Available Scripts

In the `frontend` directory, you can run:

| Command | Description |
|---|---|
| `npm run dev` | Starts the Vite dev server (defaults to port 5173 or 5180) |
| `npm run build` | Runs TypeScript compilation (`tsc -b`) and Vite production bundling |
| `npm run lint` | Runs `oxlint` across the codebase |
| `npm run preview` | Previews the production build locally |

---

## 🔐 Environment Variables

Create a `.env` file in `/frontend`:

```env
# Optional override for the backend URL (falls back to https://campuspass-ignite.onrender.com or http://127.0.0.1:8100)
VITE_API_URL=https://campuspass-ignite.onrender.com
```

---

## 📱 Responsive & Accessible Design

- **Mobile First:** Staff check-in (`/check-in`) is optimized for mobile touch devices (min-width 375px) with bottom action bar thumb placement and haptic visual states.
- **Desktop First:** Admin dashboard (`/admin/*`) features collapsible sidebar navigation, data tables with horizontal scroll containers, and slide-over panels.
- **Accessibility:** Semantic HTML5 elements (`<main>`, `<header>`, `<nav>`, `<aside>`, `<section>`, `<footer>`), `aria-*` tags, keyboard escape handlers, and `prefers-reduced-motion` compliance.
