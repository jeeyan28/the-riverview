# The Riverview

A reservation and venue management system for The Riverview's KTV rooms, billiards, and basketball facilities. Customers can browse facilities, reserve hourly slots, pay online, and manage reservations. Staff use the admin area for bookings, walk-ins, room sessions, payments, reports, and venue settings.

## Stack and structure

| Directory | Purpose |
| --- | --- |
| `frontend/` | React 18, React Router, and Vite; customer pages and the admin interface |
| `backend/` | Express 5 API, Mongoose models, authentication, payment integrations, and reservation jobs |
| `.github/` | Continuous integration and Dependabot for both packages and GitHub Actions |

The API uses MongoDB for application data and sessions, Cloudinary for uploaded images, Gmail SMTP for email, PayMongo for primary online payments, and Xendit as an optional fallback. Reports export to Excel through ExcelJS. Booking dates and schedules use the Asia/Manila business timezone.

### Code ownership

| Module | Responsibility |
| --- | --- |
| `frontend/src/services/api.js` | Shared JSON requests, typed errors, cancellation, and file downloads; requests default to 30 seconds and downloads to 60 seconds |
| `frontend/src/services/auth.js` | Authentication and password-recovery endpoints and required response fields |
| `frontend/src/context/AuthContext.jsx` | Cached identity, session refresh, login/logout, and protection against outdated responses; the API remains the authority for access |
| `backend/utils/http.js` | Shared payment-provider JSON transport, with a 15-second deadline covering headers and the response body |
| `backend/utils/reservationJobs.js` | Reservation job ordering, independent failure handling, and shared execution for concurrent calls within a process |
| `backend/utils/reservationScheduler.js` | Minute scheduling and stopping active work; the authenticated HTTP trigger stays in `routes/reservationJobsRoutes.js` |
| `backend/scripts/checkSyntax.js` | Active maintenance command used locally and by CI to check all backend JavaScript without starting the API |

Add application requests through the shared service layer so credentials, deadlines, validation errors, and cancellation behave consistently. Payment-provider writes are not automatically retried after ambiguous failures; safe PayMongo reads can retry once. Verify payment status before repeating a payment action.

## Run locally

You need Node.js **22.12 or newer**, npm, and MongoDB configured as a **replica set**. MongoDB Atlas also supports the transactions used to prevent conflicting reservations; a standalone local MongoDB server does not.

From the repository root:

```powershell
npm ci --prefix backend
npm ci --prefix frontend
```

For a new checkout, copy the environment templates. Keep any existing `.env` files instead of replacing them:

```powershell
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (!(Test-Path frontend/.env)) { Copy-Item frontend/.env.example frontend/.env }
```

Edit `backend/.env`, setting `MONGO_URI` and `SESSION_SECRET`. Generate a session secret with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Configure Gmail before using email registration or password recovery. Configure the other integrations before using their respective features.

Start the API and frontend in separate terminals:

```powershell
npm start --prefix backend
```

```powershell
npm run dev --prefix frontend
```

Open [http://localhost:5501](http://localhost:5501). The frontend proxies `/api` requests to port `3000`. [http://localhost:3000](http://localhost:3000) returns the API and database status.

To preview a production frontend build, keep the backend running, stop the frontend dev server, and run:

```powershell
npm run build --prefix frontend
npm run preview --prefix frontend
```

Preview also uses port `5501` and the local API proxy. If you change the backend port, update both proxy targets in `frontend/vite.config.js`.

## Environment configuration

Templates contain variable names and empty credential fields. Real `.env` files are ignored by Git. Backend secrets belong in the backend environment or hosting dashboard.

| Backend variables | Purpose |
| --- | --- |
| `MONGO_URI`, `SESSION_SECRET` | Required database connection and cookie signing secret |
| `NODE_ENV`, `PORT` | Set `development` and `3000` locally; use `production` when deployed |
| `APP_BASE_URL` | Allowed frontend origins, separated by commas; locally `http://localhost:5501` |
| `APP_PUBLIC_URL` | Optional public frontend URL used in notification emails |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Gmail account and app password for verification, recovery, receipts, and notifications |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Google OAuth login credentials |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Facility photos, payment proof, and QR image uploads |
| `PAYMONGO_SECRET_KEY`, `PAYMONGO_PUBLIC_KEY`, `PAYMONGO_WEBHOOK_SECRET` | Primary payment integration and webhook verification |
| `PAYMONGO_RETURN_BASE_URL`, `PAYMONGO_API_BASE` | Frontend payment return URL and optional API endpoint override |
| `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`, `XENDIT_RETURN_BASE_URL` | Optional fallback payments; the return URL must be HTTPS |
| `CRON_SECRET` | Bearer token for scheduled reservation jobs on serverless hosting |

Use exact origins in `APP_BASE_URL`, without paths or trailing slashes. Production startup requires an explicit `APP_BASE_URL` and a `SESSION_SECRET` of at least 32 characters. List each approved frontend origin explicitly.

| Frontend variables | Purpose |
| --- | --- |
| `VITE_API_URL` | Leave empty when using the local proxy or Vercel rewrite |
| `VITE_GOOGLE_CLIENT_ID` | Public Google client ID; must match the backend client |
| `VITE_PAYMONGO_API_BASE` | Optional override; defaults to `https://api.paymongo.com/v1` |

Every `VITE_` variable is public in the browser bundle. Never put a database password, session secret, SMTP password, payment secret key, or webhook secret in the frontend. Frontend environment changes require a rebuild.

For Google login, add the frontend's origin to the OAuth application's authorized JavaScript origins.

## Create the first owner

There are no default owner credentials or automatic account seed scripts.

1. Register your real owner account through the frontend and complete email verification.
2. An authorized database administrator can promote that verified account in the application's database using `mongosh`:

   ```javascript
   db.users.updateOne(
     { email: "owner@example.com", isVerified: true, isActive: true },
     { $set: { role: "super_admin" } }
   );
   ```

   Replace the example email and confirm that exactly one intended account was updated.

3. Sign out, sign in again at `/login`, and open `/admin`.
4. Create other staff accounts from the admin Users page.

Roles are `user` (customer), `staff`, `manager` (Supervisor), and `super_admin` (Owner). Staff can operate rooms and manage bookings. Supervisors and owners have broader reporting and configuration access; account management also enforces role hierarchy. Administrator-created staff accounts can sign in immediately. Public customer registration still requires verification.

## Reservations and operations

- Online reservations use whole-hour start times and durations of 1–5 hours, subject to configured operating hours, closures, capacity, and pricing.
- Customers choose a first-hour deposit or full payment when available. The server calculates charges and verifies provider payment status before confirming a booking.
- Reservation changes, cancellation reviews, closure refunds, room session extensions, and historical financial records use the existing business rules in the API.
- The admin Monitor and `/lobby-monitor` support room status displays. TV presentation and casting require compatible browser and receiver hardware.
- Settings control the catalog, pricing, opening hours, holidays, and venue information. Reports, analytics, forecasts, login history, and audit logs are permission protected.

## Deployment

The repository includes configuration for **two Vercel projects**:

| Project | Root directory | Configuration |
| --- | --- | --- |
| API | `backend` | `backend/vercel.json` builds and routes requests to `server.js` |
| Frontend | `frontend` | Vite build, `dist` output, API rewrite, and SPA fallback |

For existing Vercel projects, update their Root Directory settings to `backend` and `frontend` before deploying the renamed folders.

Set backend environment variables on the API project and public frontend variables on the frontend project. Set `NODE_ENV=production`, HTTPS frontend origins, and explicit payment return URLs. Use a MongoDB account limited to this application's database and configure network access for the deployment.

`frontend/vercel.json` currently rewrites `/api` to `https://the-riverview-ejap.vercel.app`. Change that destination if your backend hostname differs. Keep the API rewrite above the SPA fallback.

Keep browser API requests on the frontend origin through this rewrite. The session cookie is HTTP-only, uses `SameSite=Lax`, and is secure in production; calling an unrelated backend domain directly can prevent cookies from working.

Configure payment callbacks on the backend's public HTTPS URL:

| Provider | Endpoint | Events handled |
| --- | --- | --- |
| PayMongo | `/api/payments/paymongo/webhook` | `payment.paid`, `payment_intent.succeeded`, `payment.refunded`, `payment.refund.updated` |
| Xendit | `/api/payments/xendit/webhook` | `payment_session.completed`, `refund.succeeded`, `refund.failed` |

Subscribe to the events available for your payment product in the provider dashboard. PayMongo uses the signed raw request body; Xendit uses its callback token and server-side payment verification. Use matching test or live credentials across each provider's configuration.

### Scheduled jobs

A continuously running backend processes reservation jobs every minute. Serverless deployments require an external scheduler; no cron schedule is included in `vercel.json`.

Schedule an HTTPS `GET` to `/api/jobs/reservations`, preferably every minute, with:

```text
Authorization: Bearer <CRON_SECRET>
```

This expires no-show reservations, retries pending venue-closure refunds, and delivers queued notification emails. The endpoint returns `401` if the secret is missing or incorrect. Avoid placing the token in a query string.

Jobs run in that order, but a failed stage does not prevent the others from running. Partial failures return `503` so the scheduler can retry. Concurrent triggers in one backend process share the current run; separate serverless instances still depend on the existing database claims and provider reconciliation. Notification delivery is at least once, so an interrupted SMTP acknowledgment can result in a duplicate email.

A continuously running backend handles `SIGINT` and `SIGTERM` by stopping new scheduled work, draining HTTP requests and the current job, then closing the session store and database. Shutdown has a 30-second deadline. Serverless imports do not start timers or an HTTP listener.

Before accepting live bookings, verify registration and recovery email, image uploads, Google login if enabled, payment return flows, webhook delivery and retries, refunds, scheduled jobs, and the venue's approved terms and privacy content in the deployed environment.

## Maintenance and validation

```powershell
npm run check --prefix backend
npm run build --prefix frontend
npm audit --prefix backend
npm audit --prefix frontend
```

The GitHub workflow runs clean dependency installs, backend syntax checks, the production frontend build, and dependency audits on Node 22 and 24 for pushes and pull requests. Audit gates reject moderate or higher advisories. It uses a read-only repository token and requires no application secrets. The same build, syntax, and audit commands passed locally; remote workflow runs will occur after these changes are pushed.

Commit both package lockfiles when updating dependencies. Dependabot checks both packages and GitHub Actions weekly.

During the October 7, 2026 cleanup, **142 backend tests and 69 frontend tests passed before deletion**. All project test files were then removed at the owner's request. Obsolete migration scripts, an unused preview runner, unused modules, and unused images were also removed. The normal start and build commands do not depend on those files.

The finishing pass also passed **49 focused checks** for request handling, payment-provider transport, authentication races, password recovery, exports, logout feedback, job recovery, and shutdown. Those temporary verification files were removed after validation. The frontend production build and all 75 backend source syntax checks pass. Both full npm audits reported zero known vulnerabilities at review time. CI covers syntax, builds, and dependency advisories; it does not replace the removed behavior tests or live integration validation. See [SECURITY.md](SECURITY.md) for fixes, evidence, and remaining limitations.

### Common setup problems

| Symptom | Check |
| --- | --- |
| API exits on startup | Required `MONGO_URI` / `SESSION_SECRET`; production origin and secret requirements |
| Transaction errors when reserving | MongoDB must run as a replica set |
| `403 Request origin not allowed` | Exact frontend origin in `APP_BASE_URL`; browser mutation requests need a trusted Origin or Referer |
| Repeated login prompts | HTTPS, same-origin API rewrite, correct session secret, and MongoDB session storage |
| OTP or email does not arrive | Gmail app password, mailbox access, spam folder, and backend logs |
| Stale no-shows or pending closure notifications | Serverless scheduler and `CRON_SECRET` |
| Payment succeeded but reservation needs review | Check the provider payment and server logs before another charge; an unavailable slot requires manual review/refund |

