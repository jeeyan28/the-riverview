# Security review

Reviewed on **October 7, 2026**. This records a source, dependency, and isolated behavior review of the working repository. It is not a certification of the deployed service.

## Fixed in this cleanup

| Area | Finding and change |
| --- | --- |
| Query validation | Express 5 exposes `req.query` as a getter. Validated conversions and stripped fields were being lost. Middleware now installs the normalized query, and public availability endpoints reject invalid IDs, duplicate field values, and invalid calendars. See the [Express 5 migration guide](https://expressjs.com/en/guide/migrating-5/). |
| Calendar inputs | Booking and payment validation now reject impossible calendar dates and malformed hourly start times. |
| Payment callbacks | PayMongo acknowledged requests before booking work finished. It now waits for verified booking processing and returns a retryable error on temporary failures. Database failures are no longer treated as permanent slot conflicts. This follows the acknowledgment and retry behavior in [PayMongo's webhook documentation](https://docs.paymongo.com/reference/webhook-resource). |
| Receipt delivery | Payment finalization now awaits the receipt attempt so serverless execution can finish the work. An SMTP failure is logged while preserving the confirmed booking. |
| Session invalidation | Password, role, and active-status changes rotate an account session stamp. Old sessions are rejected; a self-service password change replaces the session cookie. A temporary password-hash bypass is consumed after use. |
| Staff access | Accounts created by an authorized administrator for staff roles are marked verified and can log in. Public customer verification remains required. |
| Authentication throttling | Added network throttling to Google login and password recovery, plus account throttling for password changes. Existing login and OTP limits remain active. |
| CSRF / origins | Unsafe browser requests require an approved Origin or valid approved Referer. Missing or malformed headers are rejected. Provider webhooks have their own signature/token checks. See [OWASP's CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). |
| Background jobs | The authenticated reservation job expires no-shows in serverless deployments too. HTTP and timer triggers share a process-local runner. Independent stages continue after a failure, and partial failures return `503` for retry. |
| HTTP / payment transport | Shared frontend requests and downloads have deadlines through body consumption, cancellation, and structured errors. Both payment providers share bounded JSON transport. Malformed successful JSON is rejected, and ambiguous PayMongo writes are not automatically retried; safe reads can retry once. |
| Browser sessions | Delayed session checks cannot overwrite a newer login, logout, profile update, or explicit session expiration. Failed logout retains the cached identity and displays an error. Checkout clears an expired identity directly after an authoritative `401`. |
| Recovery / exports | Password recovery uses the shared service and requires a valid reset token. Spreadsheet downloads reject unexpected content types, retain HTTP errors, and clean up temporary browser URLs. Changing report filters cancels outdated requests. |
| Application lifecycle | Local shutdown drains active HTTP and scheduled work before closing database resources, with a 30-second deadline. Toast timers and session requests are cleaned up on unmount. Confirmation dialogs use native button activation, so Enter on Cancel cannot also confirm. |
| Database connections | Concurrent requests share connection establishment, and later requests can reconnect after disconnection. |
| Error handling / caching | Global and local route handlers hide unexpected database/provider error details while preserving known client errors. API responses use `Cache-Control: no-store`. Invalid upload types return `400` and oversized files return `413`. Multipart file, field, and part counts are bounded. |
| Configuration | Missing core secrets fail startup; production requires an explicit allowed origin and a longer session secret. Environment variants are ignored by Git, with tracked examples allowed. |
| Browser storage | Authentication, initial theme selection, and monitor presets tolerate unavailable browser storage. |
| Dependencies | Patched vulnerable direct/transitive packages, removed unused Axios and extraneous installed packages, and corrected Dependabot directory casing. ExcelJS uses a scoped UUID override compatible with its CommonJS v4 usage. |
| Maintenance | Added secret-free CI for clean installs, syntax, frontend builds, and dependency audits on Node 22 and 24, plus weekly GitHub Actions dependency updates. |

## Verification

| Check | Result |
| --- | --- |
| Backend behavior suite before deletion | 142 passed, 0 failed |
| Frontend behavior suite before deletion | 69 passed, 0 failed |
| Receipt completion and SMTP-failure checks | Both passed after the receipt fix |
| Local route error handling | Five route handlers hid unexpected errors; a known booking conflict retained its message; all six checks passed |
| Frontend production build after cleanup | Passed |
| Backend syntax | All 75 current source files passed; the corrected startup module was checked again |
| Finishing-pass isolated behavior checks | 49 passed: 8 shared requests, 5 provider transport, 8 authentication, 4 reservation jobs, 9 service integrations, 7 lifecycle, and 8 UI lifecycle checks |
| GitHub workflow | Configured for Node 22 / 24; equivalent syntax, build, and audit commands passed locally on Node 25.6.1; remote runs await a push |
| Backend full npm audit, including development dependencies | 0 known vulnerabilities; initial audit reported 9 |
| Frontend full npm audit, including development dependencies | 0 known vulnerabilities; initial audit reported 3 |
| Installed package trees | No missing or invalid direct dependencies |
| Runtime import/asset traversal | No remaining unreferenced source files/assets identified by the traversal |
| Targeted scan of current tracked source | No matching private keys, payment secret keys, AWS access IDs, credential-bearing MongoDB URIs, or GitHub tokens |

The tests used isolated models, browser/hook harnesses, HTTP responses, and provider responses. No production database, customer data, real payment, or real refund was changed. All 45 project test and fixture files were removed after validation as requested. Temporary review and verification scripts are also removed from the final checkout. The syntax checker remains because it is an active maintenance command used by CI.

## Remaining operational risks and limits

- **Live integrations still need deployment validation.** MongoDB transactions, Gmail delivery, Cloudinary uploads, OAuth dashboard settings, payment callbacks, refund execution, and TV casting were not exercised against live services or hardware.
- **Serverless jobs require a scheduler.** Without scheduled authenticated calls to `/api/jobs/reservations`, no-show expiration, queued closure refunds, and notification delivery will not run reliably. Setup is documented in [README.md](README.md).
- **Job execution is not globally serialized.** Sharing a run prevents overlap within one process. Separate serverless instances can still overlap; existing database leases and provider reconciliation are required. Queued email delivery is at least once and can duplicate a message after an interrupted acknowledgment.
- **Rate limits use process-local memory.** They reset on cold starts and are not shared across serverless instances. Database-backed account lockout and OTP rules remain active, but stronger network-wide enforcement needs a shared rate-limit store or hosting-layer rules.
- **Account existence can be inferred.** Existing login and registration responses distinguish some missing-account, existing-account, and verification conditions. This remains an account-enumeration exposure; generic authentication responses would require a coordinated API and UI behavior change.
- **Receipts are not a durable mail queue.** Finalization waits for the receipt attempt, but a failed receipt is logged rather than automatically retried. Venue-closure notification emails have separate queued delivery. Review SMTP errors when reconciling customer receipts.
- **Paid slot conflicts require manual review.** If a verified payment arrives after the slot becomes unavailable, the system reports and logs the conflict. The operator must reconcile or refund the payment; it must not be treated as permission to charge again.
- **Frontend assets remain substantial.** The production build still includes large shared CSS and some large active images. They are used by the current interface and were preserved; mobile-load performance can be improved separately.
- **The secret scan is limited.** It checks selected patterns in the current tracked source, not every credential format, historical commit, local environment file, or provider dashboard.
- **Behavior regression tests were removed by request.** CI checks syntax, builds, and advisories. The temporary isolated checks passed before deletion, but future behavior changes require deliberate revalidation.

Zero npm advisories means no known advisories were reported for these lockfiles at review time. It does not prove that all application or deployment vulnerabilities have been eliminated. Re-run dependency audits when versions change and keep live provider secrets in the backend hosting environment.

