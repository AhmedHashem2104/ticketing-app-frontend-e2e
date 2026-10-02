# Matchpass — end-to-end tests

Playwright tests that drive the **production builds** of the Matchpass fan site, staff dashboard and mock API
(from [`../ticketing-app-frontend-monorepo`](../ticketing-app-frontend-monorepo)) through complete business journeys,
the way fans and staff actually use the product.

## Journeys covered

| Spec                | What a fan does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `01-discovery`      | Home, category chips, browse with search/filters kept in the URL, empty states, match & concert pages, presale codes, 404s                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `02-auth`           | Sign up with field validation, OTP verification, duplicate numbers, log in, redirect back after login, open-redirect protection, httpOnly session cookie (nothing in storage)                                                                                                                                                                                                                                                                                                                                                                                                        |
| `03-fan-id`         | New fan blocked from match tickets → Fan ID wizard (document, photo uploads with type checks, selfie, review) → background identity check → approved → can buy                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `04-match-purchase` | Waiting room → zone with **one ticket per Fan ID** (fans who already hold a ticket are blocked) → hosted card page (validation, declined card back to checkout, success) → confirmation, calendar, parking; exact seats; InstaPay approval                                                                                                                                                                                                                                                                                                                                           |
| `05-shows-purchase` | Arena ticket types + promo codes + mobile wallet approval; concert hall seats + Fawry bill paid at an outlet; cinema tab with two films, showtimes & VIP recliners; concerts without Fan ID                                                                                                                                                                                                                                                                                                                                                                                          |
| `06-after-purchase` | Stub tickets and alerts, live signed QR & locked QRs, transfer to a Fan ID **accepted by the recipient in their own browser**, cancelling a pending transfer, resale at up to face value, refund wizard → tracking → cancel                                                                                                                                                                                                                                                                                                                                                          |
| `07-accessibility`  | axe WCAG 2.1 AA scans (incl. colour contrast) of 23 screens, skip link and keyboard focus                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `08-account`        | Forgot / reset password, login rate limiting, sign out from the account menu, preferences & linked fans, notification bell, **buying on official resale**, **automatic refunds for a cancelled event**, gate QR verification, CSP                                                                                                                                                                                                                                                                                                                                                    |
| `09-arabic`         | Language switch on any page (remembered), first visit follows the browser's language, `/ar` right to left with Cairo, no English left on key pages, Arabic validation, a full purchase in Arabic incl. the provider's card page, Arabic 404, axe on Arabic pages                                                                                                                                                                                                                                                                                                                     |
| `10-dashboard`      | Staff sign-in (deep link → sign in → back, wrong password, httpOnly cookie, sign-out), **menus per role** and sections refused by URL, organisers see only their events, Fan ID approve / reject → the fans are told, refund reject / approve → tickets valid again / credit, order & fan lookup, suspend / reactivate + audit log, **admin cancels an event** → automatic refunds, **organiser asks to postpone → admin approves**, gate scanner (admit once, refuse copies and fakes), Arabic dashboard, axe on every admin screen, phone layout, BFF only proxies staff endpoints |
| `mobile`            | Phone viewport (Pixel 7, iPhone 15): menu sheet navigation, purchase, no horizontal scrolling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Browsers: everything runs in Chromium; the purchase, account, Arabic and dashboard journeys (`04`, `05`, `08`, `09`, `10`) also run in Firefox and WebKit, and `mobile` in WebKit (iPhone 15).

Every test also fails if the page throws or React reports a hydration error in the browser console.

## Running

```sh
pnpm install
pnpm install:browsers          # first time only (Chromium, Firefox, WebKit)
pnpm build:app                 # builds web + dashboard + mock API in ../ticketing-app-frontend-monorepo
pnpm test                      # starts the servers (site 3100, dashboard 3101, API 4100) and runs every journey
pnpm test:chrome               # Chromium only (fastest)
pnpm test:ui                   # interactive mode
pnpm load                      # load test the running app (BASE_URL, CONNECTIONS, DURATION)
pnpm report                    # open the last HTML report
```

`pnpm test:full` does the build and test in one go (what CI runs).

### Watching the journeys in a real browser

```sh
pnpm test:watch                                  # headed Chromium
SLOW_MO=400 pnpm test:watch                      # bash: slowed down so each step can be followed
$env:SLOW_MO=400; pnpm test:watch                # PowerShell
pnpm test:watch tests/04-match-purchase.spec.ts  # a single journey
```

When `SLOW_MO` is set, the per-test timeout is raised to 5 minutes.

Environment overrides: `MONOREPO_DIR` (path to the monorepo), `WEB_PORT`, `DASHBOARD_PORT`, `API_PORT`.
Locally, servers already running on those ports are reused.

## How it stays deterministic

- Every test starts by calling the mock API's `POST /api/__test__/reset`, which re-seeds the accounts
  (Omar `10 1234 5482`, Youssef `10 9876 5432`, Karim `11 5555 5555` — password `matchpass123`, OTP `123456`), events,
  tickets, refunds and resale listings.
- Tests sign in by setting the same httpOnly session cookie the app's BFF sets after login (`mp_session` for fans, `mp_staff` for staff — seeded staff `admin@matchpass.app`, `ops@matchpass.app`, `hany@nilefc.example`, `dina@nilelive.example`, password `matchpass-staff`).
- Payment providers are simulated: the hosted card page is served by the mock API, wallet/InstaPay approvals take 1 second,
  and Fawry payments are triggered with a test route. The identity check takes 2 seconds.
- Tests run serially (one worker) because the mock API state is shared.
- The waiting room runs with `QUEUE_TIME_SCALE=0.15` so a fan reaches the front in a couple of seconds.
- The browser runs in the `Africa/Cairo` time zone, matching the product's market.
