# Metro Scales backend

Cloud API for Metro Scales: the dealer manages customers (shops) and registers WiFi weighing scales by MAC address; shop owners manage items, per-branch prices, stock, purchases, scale settings and see sales reports. Used by the Flutter app and the Angular admin panel.

Stack: NestJS 11, Prisma 5, PostgreSQL.

## Run locally

```bash
cp .env.example .env          # set DATABASE_URL
npm install
npm run db:migrate            # create tables
npm run db:seed               # dealer admin + demo shop
npm run start:dev             # http://localhost:3000/api
```

Demo logins after `db:seed`:

| Who | Email | Password / PIN |
|---|---|---|
| Dealer admin | admin@metroscales.local | admin12345 |
| Shop owner | owner@demo.local | 1234 |
| Shop staff (one branch) | staff@demo.local | 1111 |

## Tests

```bash
npm test                      # unit tests
npm run test:e2e:db           # once: create the <db>_test database schema
npm run test:e2e              # API tests against <db>_test
```

## Who can do what

| Role | Scope |
|---|---|
| `DEALER_ADMIN` | Everything. `/api/admin/*` plus every shop endpoint by passing `customerId`. |
| `OWNER` | Their own shop: all branches, items, prices, users, scale settings. |
| `STAFF` | Only the branches assigned to them; can view items, update stock, add purchases, see reports. Cannot change prices, items or scale settings. |

Shop users log in with email + numeric PIN; the dealer with email + password. Both go to `POST /api/auth/login` as `{ email, secret }`.

## API overview

All responses are `{ success, data, message, meta }`. Money and quantities are plain numbers.

- `auth`: `login`, `refresh`, `logout`, `me` (GET/PATCH), `change-secret`
- `admin` (dealer): `dashboard`, `customers` (list/get/create/update), `scales` (registry: list/create/update/delete)
- `branches`: list/get/create/update/delete, `:id/bill-settings` (GET/PUT)
- `categories`, `items` (list with `branchId` for price and stock, `next-plu`, CRUD, `delete-all`)
- `branches/:id/prices` (PUT bulk), `branches/:id/stock` (PUT bulk, `clear`, `movements`), `branches/:id/purchases`
- `scales`: list/detail, PATCH parameters, `wifi`, `print-format`, `shortcuts`, `commands` (PUSH_ITEMS, PULL_ITEMS, CLEAR_PLU)
- `reports`: `summary`, `daily`, `daily.csv`, `bills`, `items`, DELETE `bills`
- `users`: shop owner manages staff and PINs

## Scale connection (not built yet)

The real scale protocol is still unknown; it will be learned with the traffic logger before this part is built. The code is ready for it:

- Changes that a scale needs (prices, items, bill settings, print format, shortcuts, WiFi, store name) are queued in `ScaleCommand` as `PENDING`.
- `ScaleIngestService` (`src/modules/gateway`) holds everything that happens when a scale talks to the cloud: heartbeat by MAC, bill upload (idempotent, reduces stock), taking pending commands, acknowledging them, importing items read from a scale.
- Until the protocol adapter exists, `DEVICE_SIMULATOR=true` exposes those as plain HTTP under `/api/device-sim/:mac/...` so the apps can be tested with fake scales. It has no login, so keep it off on a public server.

```bash
# Fake scale: go online, then sell 0.5 kg of PLU 1
curl -X POST localhost:3000/api/device-sim/0023F01A9740/heartbeat
curl -X POST localhost:3000/api/device-sim/0023F01A9740/bills -H 'content-type: application/json' \
  -d '{"billNo":"1001","billedAt":"2026-10-06T10:00:00Z","lines":[{"plu":1,"quantity":0.5}]}'
```

A scale counts as online if it was heard from in the last 2 minutes.

## Deploy

Production runs on Vercel (project `metroscales-backend`, https://metroscales-backend.vercel.app) with a Neon Postgres database (`metroscales-db`, Singapore) connected through the Vercel Marketplace, which sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED`. `vercel.json` runs `prisma migrate deploy` on every build. Deploy with `vercel deploy --prod`. Create the dealer admin once with `SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... npm run db:seed:prod` against the unpooled URL.

Vercel only serves HTTP requests. If the scale protocol turns out to need a long-lived TCP or MQTT connection, run the gateway on a server that stays up; `render.yaml` deploys the whole backend to Render.
