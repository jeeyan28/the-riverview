# RULES.md — The Riverview

Coding and implementation rules for this codebase. Covers both Backend (Node/Express) and Frontend (Vite/React).

## 1. SOLID

Code should follow SOLID principles. *(Stated at a high level for now — let me know if you want to dictate specifics for any of the five, otherwise this stays a general principle rather than a detailed checklist.)*

## 2. DRY — 4 or more, extract it

If the same logic is repeated **4 or more times across the codebase** (not just within one file), extract it into a shared helper. This is a going-forward rule for new code and for code you're already touching — not a mandate to go back and refactor everything currently at or above that threshold.

## 3. KISS

- Ship new business logic as the simplest version that satisfies the actual requirement.
- **Soft size limit for new code:** a file growing past **~500 lines**, or a React component accumulating more than **~10 `useState` calls**, is a signal to split it up. This is a soft limit for new code — existing files already over that size (e.g. `BookingModal.jsx`, `Monitor.jsx`) are grandfathered and don't need a retroactive rewrite.

## 4. Error Handling (Backend)

Standard error response going forward:

```js
try {
  // ...
} catch (err) {
  console.error(err);
  res.status(500).json({ message: "Server error." });
}
```

- Response shape is just `{ message: "..." }` — no success flags, no error codes.
- Existing routes using a different shape (e.g. `err.status`/`err.message` passthrough) don't need to be changed unless you're already editing that handler for another reason.

## 5. Input Validation

- All new mutating routes (POST/PUT/PATCH/DELETE) must use `validate()` with a Joi schema.
- `auth.js`, `roomRoutes.js`, and `userRoutes.js` use route-specific Joi schemas. Keep both request bodies and identifier params validated when adding account or catalog mutations.

## 6. Frontend Conventions

- No TypeScript, no PropTypes, for now. Don't introduce either on your own initiative.

## 7. Testing

No test framework currently exists in the project. Testing is encouraged but not required.

## 8. Naming & Style Baseline

Documenting what's already consistent in the codebase, so new code matches:

- Backend files: `camelCase.js` (e.g. `bookingHelper.js`, `roomRoutes.js`).
- Variables/functions: `camelCase`. Mongoose model names: `PascalCase` singular (`Booking`, `Room`).
- Domain-rule constants (`MAX_RESCHEDULES`, `LOCK_DURATION_MINUTES`): `UPPER_SNAKE_CASE`, declared near the model they govern, exported — never a bare number at the call site.
- Frontend components: `PascalCase.jsx`.
- No linter or formatter (ESLint/Prettier) is currently configured on either Backend or Frontend.

## 9. Agent Workflow Rules

- **Task breakdown:** work step by step / task by task — both across separate tasks the user gives, and within a single request if it's large. Avoid doing one big task in one pass; avoid burning too much context/tokens on a single giant change.
- **Ask, don't assume:** if anything about a task is unclear, ask a clarifying question rather than deciding unilaterally.
- **Minimal code comments:** don't over-comment code. Comments should be short, plain labels (e.g. `// signup`, `// login form`), not long explanations. Applies to new code, and to existing over-commented code encountered while working nearby — simplify it when already there.
- **Check context before acting:** before making a change, check the surrounding code/context to confirm the task is safe and will integrate smoothly — don't edit blind.
- **Clarify new tasks upfront:** when a new task is given, first make sure its scope is clear, ask if there are specific preferences/constraints, and also offer a suggested approach for approval before starting the work.
- **Wait for explicit instruction:** don't start a new task on your own initiative — only begin work when the user explicitly says so.
- **Stop after finishing, let the user check:** once a task is done, stop and let the user review it themselves. Don't run extensive self-analysis or re-verification passes afterward just to double-check — that burns tokens without being asked.
- **Double-check before presenting as done:** before handing off a finished task, double-check it to make sure no errors happen and the result still aligns with the project's context (PRD/ARCHITECTURE/DESIGN/SCHEMA as relevant).
- **Purpose of this section:** these rules exist to reduce token usage, while still making sure each task that *is* started gets fully finished.

## 10. Booking, Monitoring, and Finance Invariants

- Use `utils/roomPricing.js` for every customer booking, walk-in session, and extension charge. Frontend totals are previews; the backend result is authoritative.
- Accept whole-hour inputs only: 1–5 hours for bookings and 1–24 hours for Live Monitor sessions/extensions.
- Never infer collected revenue from `paymentStatus` alone. Persist and report explicit `paidAmount` and `refundedAmount` values.
- Preserve a reservation's verified downpayment when its session starts. Do not add it twice when the booking and session are linked.
- Keep charges, collected revenue, refunds, and outstanding balances distinct in API responses, UI labels, and exports.
- Use Asia/Manila service-date boundaries for dashboard, analytics, forecast, sales-report, and Live Monitor report queries.
- Saving customer-facing facility inventory must synchronize idle monitor units without replacing an occupied unit.

## 11. Known Debt (flagged, not yet fixed)

1. **Error-shape inconsistency:** some legacy routes use `err.status`/`err.message` passthrough instead of the standardized `{ message: "Server error." }` shape — see Section 4.
2. Reschedule cutoff, operating hours, Court time-band pricing, guest surcharges, and corkage are resolved in the shared pricing path; keep ARCHITECTURE.md and SCHEMA.md synchronized if those policies change.
