# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Customers create accounts, inspect facility types, reserve whole-hour slots, pay the required online downpayment, and manage their reservations.
- Staff are first-time operations-software users who need a fast mobile view of reservations, walk-ins, room status, time, and payment state.
- Owners and supervisors manage bookings, facilities, schedules, users, reporting, revenue, and forecasting.

## Product Purpose

The Riverview replaces scattered Facebook messages, paper notes, and manually maintained spreadsheets with one booking, live-monitoring, and reporting system for billiards, KTV, and court rental. Success means staff can start and close a session without ambiguity, customers understand every booking and balance, and reports reconcile to actual hourly facility use and payments.

## Positioning

One service-date ledger connects each reservation or walk-in to its exact facility unit, whole-hour session, payment state, and collected revenue while preserving the venue's familiar daily-report workflow.

## Operating Context

- The venue operates in Asia/Manila and takes online reservations, Facebook-originated manual reservations, and walk-ins.
- Online customers pay a required downpayment; the remaining balance is collected and recorded on site.
- Walk-ins may start unpaid, so staff must see and update unpaid, partial, and paid states while the session is active.
- Staff monitor facility units from phones and tablets with updates polling about every two seconds.
- Admin reports are filtered by service date and exported to Excel or print/PDF.

## Capabilities and Constraints

- Paid services are limited to billiards, KTV, and court rental.
- Online and live-monitor sessions use whole-hour increments only; customer bookings are 1–5 hours.
- Pricing is calculated per facility type and per hour, including court time bands, VIP guest surcharges, and the flat corkage add-on.
- Online downpayment confirms a reservation automatically. A confirmed reservation can retain an outstanding on-site balance.
- Monitoring has its own daily, monthly, or custom-date operational report with time in, time out, hours, rate, charges, collected amount, balance, source, and payment status.
- Forecasting is deterministic/statistical; it does not call an LLM.
- Owner and supervisor have full admin access. Staff have operational booking and monitoring access without finance-wide settings or reports.

## Brand Commitments

The product is The Riverview. Its established identity uses Inter, navy and cream surfaces, teal as the primary accent, clear status colors, restrained motion, and familiar language for first-time software users.

## Evidence on Hand

- Product, architecture, schema, rules, and design truth live in `context/`.
- Existing venue imagery and logo assets live in `FrontEnd/src/assets/`.
- The user supplied a photo of the venue's current spreadsheet workflow as a reference for the structure of the monitoring report. It is reference material, not content to reproduce verbatim.

## Product Principles

1. Show payment state anywhere staff must decide whether a guest can start, continue, or leave.
2. Make the service date the primary reporting control and keep common choices one tap away.
3. Calculate charges from actual whole hours and the selected facility type; never infer revenue from generic room averages.
4. Keep operational actions fast on phones and explanation-rich for customers.
5. Use one canonical ledger so monitoring, reservations, dashboards, and exports agree.

## Accessibility & Inclusion

Meet WCAG AA, preserve keyboard access and visible focus, pair status colors with labels or icons, support reduced motion, and keep all core staff workflows usable at phone and tablet widths.
