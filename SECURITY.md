# Security and verification

Review begun on **October 7, 2026**, with finishing checks on October 8. This describes current local source and isolated behavior; it does not certify deployed services or live integrations. No production database, real charge/refund, credential, Git publication or deployment was changed.

## Authentication and authorization

- Missing/invalid sessions and deactivated, unverified or version-mismatched accounts receive authoritative authentication failures. A database lookup failure returns `503 SESSION_UNAVAILABLE` with a request ID and safe log, instead of falsely expiring the account.
- Cached frontend identity keeps navigation coherent; protected operations require current server authorization. Outages disable unverified actions and offer retry without deleting drafts. Revision/abort guards prevent delayed checks from overwriting newer login/logout/profile state.
- Logout succeeds only after server-session destruction. Store/network failure preserves identity and actionable feedback; retry is safe. Success clears sensitive session-related identity/draft/checkout state.
- Password, role and active-status model changes rotate a random string session stamp. Direct database administration must rotate it too, as in README owner provisioning. API roles/finance/refund permissions enforce hierarchy independently of navigation visibility.
- Cookies are HTTP-only, secure in production and `SameSite=Lax`. Unsafe browser requests require an exact approved Origin or approved Referer. Callbacks have separate verification. Production `trust proxy=1` must match the deployed topology.
- Atomic MongoDB rate counters enforce shared network/account limits across instances, with hashed keys and logical/TTL expiry. Datastore failure fails closed with a temporary service response. Account lockout/OTP rules remain; some existing responses still reveal account-existence/verification differences.

## Reservations, payments and refunds

Inventory checks/booking creation use the existing transaction/counter engine; expired holds stop blocking without waiting for TTL deletion. Server prices/capacity, overnight Manila dates and closures remain authoritative. Public slots expose aggregated quotes/inventory without customer/payment identities and create no anonymous hold.

Attempts are saved before provider creation. Stable flow/client keys, fingerprints and partial unique provider IDs make duplicate/concurrent verification converge. PHP uses integer centavos. Retrieved evidence must match amount/currency, user and original payment association. Browser state/return parameters cannot establish success.

PayMongo callbacks check HMAC on the raw body, test/live signature and five-minute timestamp freshness. Xendit uses a timing-safe callback token and server retrieval. Success acknowledgment follows durable booking/payment state; transient persistence/outbox failures remain retryable.

Ambiguous writes stay uncertain and reconcile the original provider; they cannot automatically repeat creation or switch fallback. A missing identifier is bound only after retrieved evidence matches the original attempt. A payment received without a booking retains its reason, safe references, expected/received balances and provider history. The customer sees a payment reference and venue contact options. Historical paid callbacks without trustworthy original reservation snapshots preserve the original payment outcome.

Existing booking financial actions need explicit server permissions. Already queued historical attempt refunds continue through the closure-refund engine/ledger. Status checks never submit. Preparation retries require evidence that nothing was submitted. Ambiguous submissions reconcile the original request first; verified confirmations change balances once. Demo booking financial writes are blocked in server/UI.

Payment models store no card numbers, CVC, passwords, session cookies or provider secrets. Customer attempt status requires authentication and original checkout ownership and excludes private metadata. Only that customer receives eligible original checkout credentials after hold/quote checks; browser drafts do not persist tokens.

## Delivery and distributed work

Booking and required receipt jobs share a MongoDB transaction; SMTP runs outside retryable transactions. Whitelisted snapshots, booking/version deduplication, pending/sending/sent/attention states, attempts, backoff, owner leases, stable Message-ID and delivery history preserve the recorded outcome. Delivery stops after five unsuccessful automatic attempts. SMTP failure does not undo booking confirmation or receipt access.

Notifications have durable bounded claims/retries too. Timeout retains the claim until lease expiry; stale workers cannot overwrite later claims. SMTP is **at least once**: acceptance before an acknowledgment is lost can cause duplicate delivery on retry.

MongoDB job owner/version leases coordinate workers through renewal, expiry and fencing. Queues have independent claim/acknowledgment rules. The runner has bounded batches and a 45-second default deadline propagated to external transports. Partial errors remain retryable/visible; overlaps do not start another claimed run. Queues still require a functioning scheduler. Fencing cannot make MongoDB and provider writes one atomic transaction.

A temporary hold creates no booking or payment. Before payment submission, returning to the hours picker or closing the reservation releases the customer-owned hold; abandoned holds expire after 20 minutes. Confirmed bookings occupy their scheduled interval after the temporary hold is removed. Unresolved submitted payments retain their original reconciliation safeguards.

## Configuration, isolation and contracts

Missing required secrets fail startup; production requires explicit origins and a session secret of at least 32 characters. Secrets belong in backend configuration; `VITE_` values are public. Environment variants are ignored, with empty credential templates retained. No local `.env` contents were read.

Tests never default to the application database. They create a disposable replica set or accept a local `riverview_test_*` URI; destructive cleanup refuses other names/hosts. Missing database setup fails the required suite. Fixture provider/SMTP responses exercise real transactions and claims without production services.

Demo uses a local `riverview_demo_*` database with a synthetic ownership marker. Populated unowned databases, inherited provider/SMTP/OAuth/upload credentials and production mode are refused. The launcher ignores normal `.env`, clears public API/OAuth overrides and visibly simulates payments/email. Reset is limited to the owned demo database. Demo passwords authorize only that environment.

New collections/indexes are additive. Startup waits for critical indexes. Xendit records have read-through compatibility; historical PayMongo evidence is linked to an existing booking or retained as the original payment outcome without rewriting financial history. No bulk financial migration is included. Operators must resolve existing uniqueness collisions before rollout.

OpenAPI uses actual Joi/access metadata and source hashes. Hashing and validation-function serialization normalize line endings for consistent LF/CRLF checkouts; source drift still fails validation. CI rejects drift, invalid request examples, broken references and inconsistent path/security definitions. Unexpected API errors hide internal exceptions; known validation/conflict outcomes stay actionable. Monitor database failure now has service-error classification instead of invalid-ID response. Existing upload bounds and no-store API caching remain.

## Local evidence

Commands and final results are in [README.md](README.md#tests-and-ci). Verified behavior includes **95 backend unit tests**, **63 frontend unit tests**, **27 component tests**, **29 real replica-set integration tests**, and **18 desktop/mobile Chromium checks**. Backend syntax passed for 119 source files. Both lint commands passed: backend was clean, frontend had 0 errors and 22 legacy hook warnings. The production build and contract gate passed (56 paths / 68 operations); both full audits reported 0 vulnerabilities. A targeted scan of 334 tracked/intended source/configuration/document files found no selected secret-pattern matches, excluding ignored environments and lockfiles. Documentation code fences and 40 local links passed a disposable stdin check.

Coverage includes missing/stale sessions, dependency failures, failed logout, competing auth responses, server permissions, popup handoff and server-verified same-tab returns, quote/hold invalidation, overnight capacity, concurrent callbacks, mismatched evidence, uncertainty/conflicts, historical recovery, refund reconciliation, outbox retry/lease expiry/crashes, shared limits/jobs, unpaid hold release, confirmed inventory and deterministic forecasts without future training observations.

The existing Node 22/24 CI workflow runs retained behavior suites, production build, contract and full audits. Local commands used Node 25.6.1. The [reported GitHub run](https://github.com/jeeyan28/the-riverview/actions/runs/37710894112) stopped at API contract drift from checkout line endings. The corrected contract gate and LF/CRLF/source-drift regressions passed locally on Node 22.23.3 and 24.21.0; verification on GitHub awaits a new push. Browser captures/agent walkthroughs are not participant research. Fixtures do not prove provider sandbox delivery.

## Material limits

- Provider sandbox verification needs explicitly supplied PayMongo test secret/public/webhook keys or Xendit test secret/callback token, dashboard subscriptions/access, and reachable HTTPS callback/return URLs. Exercise synthetic success, decline/expiry, browser/webhook ordering, duplicates, conflicts/reconciliation and supported refund outcomes. No real charges/refunds are authorized for this review.
- Real Gmail, Cloudinary, Google dashboard settings, deployed cron/function limits and TV/casting hardware were not exercised. Verify enabled integrations in their intended environment.
- External provider uncertainty can require authorized dashboard investigation. Database uniqueness and local payment records do not establish external financial success.
- SMTP can duplicate after uncertain acknowledgment. Sustained backlog requires repeated jobs/monitoring; bounded batches do not guarantee throughput.
- Existing long-duration customer sessions and some account-enumerating responses remain. Policy changes need coordinated API/UI work.
- Forecast evaluation reflects current ledger history, including later refund revisions, rather than reconstructed financial state at each historical origin. Synthetic metrics and heuristic bands do not prove accuracy/coverage.
- Older unrelated hooks retain lint warnings. Critical auth/booking/polling/monitor hooks enforce dependencies as errors; zero lint errors does not mean every legacy hook was refactored.
- Targeted secret scans cover selected current-source patterns, excluding ignored `.env`, Git history, dashboards and unknown formats. npm audits report known lockfile advisories at review time, not all application risks or future safety.

Report suspected vulnerabilities privately to the maintainer with affected route, a minimal synthetic reproduction and impact. Do not publish customer data, cookies, provider secrets or payment proof in a public issue.
