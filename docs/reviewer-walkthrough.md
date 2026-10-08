# Reviewer and usability task script

This is an executable manual walkthrough of the local demo. Accounts, payments/email and forecast history are synthetic. Participant sessions have **not** been conducted; browser checks and screenshots are separate evidence.

## Start

From the repository root:

```powershell
npm ci --prefix backend
npm ci --prefix frontend
npm run demo --prefix backend
```

Open http://127.0.0.1:5501 in a fresh window. Every demo account uses `Evaluate2026!`. Check desktop and 390px mobile widths and the visible synthetic notice. The launcher owns a disposable local replica set and ignores application `.env`.

For participants, give one task at a time without naming controls. Start a stopwatch when the task is read; stop on completion/abandonment. Record actual completion, elapsed time, errors/help and the participant's words. Ask each comprehension question without coaching. Expected outcomes below are for the facilitator, not supplied answers. Do not infer participant results from automation.

## Customer tasks

1. **Find a suitable slot before signing in.** Open KTV Rooms. Choose Standard KTV, a future date, two hours and three guests; select an available start. Explain total, deposit/full payment, inclusions, capacity and timezone. Expected: public inventory/prices without an anonymous hold. Inspect VIP KTV to understand the fee applying to every guest when zero are included. Ask: “What do you pay now, and what might remain due?”
2. **Continue through sign-in.** Use “Sign in to reserve,” then `customer@riverview.demo`. Expected: facility/date/time/duration/guests survive, server revalidation and a genuine hold precede guest details. If unavailable, other selections remain and alternatives appear. Ask: “Did anything change after signing in?”
3. **Understand checkout and refresh.** Complete guest details, continue to payment and refresh before paying. Expected: the original eligible checkout resumes. Use “Simulate successful payment”; confirmation/receipt appear through the real booking engine. Ask: “When is the reservation confirmed, and what would you do if payment kept being checked?” Expected comprehension: check the existing attempt; do not start another charge while unresolved.
4. **Inspect a receipt.** Use the confirmation receipt action and account reservation history; inspect `DEMO-UPCOMING-001` if needed. Expected: recorded charges and receipt stay accessible despite pending/attention email. Ask: “Does an email delay mean the reservation failed?”
5. **Release an unpaid hold.** While signed in, select an available future Basketball Court time and continue to guest details. Go Back to the hours picker, then continue again and close the reservation. Expected: both actions release the hold and reopen that time; neither creates a booking or payment. After successful checkout, the confirmed booking keeps that time unavailable to another customer. Ask: “When does picking a time become a confirmed reservation?”
6. **Keyboard, theme and recovery.** Tab through controls, switch theme, open/close a dialog with Escape and observe focus return. Check mobile for covered controls/overflow. For deterministic service outages use maintained browser/component tests, not production service changes; identity/draft should survive with retry.

## Staff tasks

Sign out, sign in as `staff@riverview.demo`, and open `/admin`.

1. **Find a booking.** Open Reservations; search `DEMO-UPCOMING-001`. Inspect schedule, balance and receipt. Expected: discoverable operational information without exposing customer records through public slots.
2. **Read a room session.** Open Monitor, view the occupied billiards session for `Synthetic, Walk-in`, and inspect times/amount/status. Close with Escape. Check keyboard/mobile layout. Avoid operational mutations if keeping initial examples for later tasks.
3. **Check role restrictions.** Try opening Reports as staff. Expected: the server denies financial reporting independently of navigation.

Sign out and sign in as `owner@riverview.demo` or `supervisor@riverview.demo`.

4. **Inspect a confirmed reservation.** Open Reservations, search `DEMO-UPCOMING-001`, and open its details. Read its recorded payment, remaining balance and receipt status. Existing booking refund mutations are disabled in the synthetic financial walkthrough. Ask: “Does a delayed receipt email change the reservation status?”
5. **Interpret forecasts.** Open Forecasting; compare historical/forecast labels, model/baseline errors, folds/samples, horizon and synthetic notice. Change horizon/window; interpret insufficient history and switch theme. Ask: “Does this synthetic backtest or heuristic range guarantee future revenue?”

## Measurement sheet

Use anonymous labels. Leave unrun rows blank. Completion means the intended result, not merely a clicked button.

| Participant / viewport | Task | Completed / abandoned | Seconds | Errors / help | Confusion / comprehension quote |
| --- | --- | --- | ---: | --- | --- |
| | Customer 1–2: slot/sign-in | | | | |
| | Customer 3: checkout/status | | | | |
| | Customer 4: receipt | | | | |
| | Customer 5: unpaid hold release | | | | |
| | Staff 1–3: booking/session/role | | | | |
| | Staff 4: reservation details | | | | |
| | Staff 5: forecast evidence | | | | |

Observed automation limits: demo financial mutations are read-only; real dashboards/email are untested. Older unrelated hook warnings remain. No participant completion percentages, elapsed times or research conclusions are claimed.

## Repeat or stop

With the launcher running, copy its exact printed local demo URI into a second terminal:

```powershell
$env:DEMO_MONGO_URI = 'mongodb://127.0.0.1:27028/riverview_demo_local?replicaSet=riverview-demo'
npm run demo:reset --prefix backend
Remove-Item Env:DEMO_MONGO_URI
```

Reset refuses other names/hosts and populated databases without the ownership marker. Do not substitute an application URI. `Ctrl+C` stops the launcher and deletes its owned temporary database.

Automated companion: `npm run test:e2e --prefix frontend` starts the isolated demo when needed and runs eight scenarios on each desktop/mobile project. [README](../README.md#tests-and-ci) lists other commands and actual results.
