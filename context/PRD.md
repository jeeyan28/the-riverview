# PRD — The Riverview

## 1. Overview
The Riverview is a local recreation venue offering **billiards, KTV, and court rental** as its core paid services. (The Riverview premises also hosts a separate gaming-hub tenant business — that business is explicitly **out of scope** for this system.)

The venue currently runs largely on manual processes: bookings and customer communication happen over Facebook/Messenger, reports are typed manually into Excel, and room/court status is tracked by hand. This system introduces a unified booking, monitoring, and reporting platform to reduce that manual workload — it does not need to fully eliminate FB/Messenger usage (customers can still be redirected there for chat/support, and some bookings may still originate there and get entered manually).

## 2. Problem Statement
Admin and staff have no real system — booking, reporting, and status tracking are manual and scattered across FB Messenger and Excel. This causes double-booking risk, delayed status visibility, and time-consuming manual reporting. Admin/staff are also first-time users of any real software system, so ease of use is a primary constraint, not an afterthought.

## 3. Users & Roles
| Role | Access Level | Responsibilities |
|---|---|---|
| Owner | Full admin access | Same functional access as Supervisor |
| Supervisor | Full admin access | Manages day-to-day business operations |
| Staff | Operational access | Monitors room/court/table status (mobile-friendly), checks booking status |
| Customer | Self-service account | Books & pays for reservations directly |

*(Owner and Supervisor currently have equivalent access — no distinct permission split for MVP.)*

## 4. In-Scope Services & Pricing
| Service | Type | Price |
|---|---|---|
| Court | Standard (7AM–5PM) | ₱350/hr |
| Court | Standard (5PM–12AM) | ₱400/hr |
| Court | Official games (scoreboard, timer, sound) | ₱500/hr |
| Billiards | Shared Room | ₱150/hr |
| Billiards | Solo Regular | ₱200/hr |
| Billiards | Solo Big Room | ₱250/hr |
| Billiards | VIP (KTV + Pool, max 10 pax) | ₱400/hr (+₱50/head over base) |
| KTV | Standard Room | ₱300/hr |
| Add-on | Corkage fee (outside food/drinks) | ₱200 flat |

Room/table/court **inventory (counts) is admin-configurable**, not hardcoded — admin can add, edit, or remove units and pricing as the business changes.

## 5. Core Booking Rules
- Bookings: **minimum 1 hour, maximum 5 hours, hourly increments only**
- Customer must be logged into their own account to book online
- **Required downpayment** via online payment to confirm a booking
- Booking is **auto-confirmed the instant downpayment succeeds** — no staff approval step
- **Reschedule**: allowed up to 2 times per booking, must be requested at least 3 hours before the booked start time
- **Cancellation**: requires admin approval; admin manually decides and processes any refund (no automatic refund)
- **No-show** (no cancellation/reschedule, customer doesn't appear): downpayment is **automatically forfeited**, no admin action needed
- **Walk-ins / FB-originated bookings**: staff can create a manual booking for a customer without an account; no downpayment enforced for these (they pay on-site)

## 6. MVP Feature Set
1. Customer accounts & self-service booking (date/time-range picker, service + room-type selection)
2. Downpayment-based online payment, auto-confirmation
3. Reschedule flow (2x limit, 3-hour cutoff)
4. Admin-gated cancellation + manual refund handling
5. Automatic no-show forfeiture
6. Staff-side manual/walk-in booking creation
7. Real-time (push-based) room/court/table status monitoring for staff (mobile-friendly)
8. Admin dashboard: booking management, filterable by date range
9. Analytics dashboard: visual charts (revenue trends, occupancy, popular services/time slots)
10. Reports: dashboard view **and** exportable report (PDF/Excel), filterable by date range
11. AI-assisted revenue forecasting — statistical/trend-based model on historical booking & revenue data, admin selects the forecast range (daily/weekly/monthly)
12. Configurable room/table/court inventory & pricing (admin-managed, not hardcoded)

## 7. Out of Scope (v1)
- Any Riverview tenant business other than billiards, KTV, and court (e.g. the gaming hub)
- In-system chat/messaging (customers are redirected to the business FB page/contact info for inquiries)
- Multi-location/franchise support (single physical location only)
- Automated online refunds (refunds are manual/admin-processed)
- LLM-based forecasting (using statistical/trend model instead)

## 8. Technical Context (not hard requirements, current reality)
- Backend: Node.js/Express
- Frontend: Vite + React
- Likely MongoDB (Mongoose-style `model/` folder present)
- Deployed on Vercel
- Real-time status updates imply a push mechanism (e.g. WebSockets) — to be detailed in ARCHITECTURE.md

## 9. Success Metrics
- Manually logging a booking (from FB/walk-in) takes under 1 minute in the system, reducing admin/staff workload vs. pure FB tracking
- Room/court/table status changes reflect in real time (push-based, under ~2 seconds) across all staff devices — no manual refresh
- Zero double-booked slots after launch
- Admin/staff (first-time software users) can complete core tasks — create a booking, check status, view a report — without external help within their first week of use