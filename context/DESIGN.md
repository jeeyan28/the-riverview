# DESIGN.md — The Riverview

Source of truth for visual and interaction design. This documents the system that already exists in code (`FrontEnd/src/styles/`) and formalizes it so future work doesn't drift into inconsistent, "AI slop" patterns.

## 1. Brand Colors

| Token | Dark theme (default) | Light theme | Usage |
|---|---|---|---|
| `--surface` | `#101d33` | `#F2F7F5` | Page background |
| `--surface-alt` | `#16243f` | `#FFFFFF` | Secondary surface / raised panels |
| `--card-light` | `#1c2c4a` | `#E7F0ED` | Card backgrounds |
| `--text-main` | `#F1F3F7` | `#17312D` | Primary text |
| `--text-muted-light` | `#9aa4b8` | `#58706B` | Secondary text |
| `--teal` | `#00C9A7` | `#00C9A7` | Primary accent / CTA / brand color (backgrounds, dark-surface text) |
| `--teal-text` | `#00C9A7` (= `--teal`) | `#007361` | Teal for text, icons, and focus outlines (AA-safe on light) |
| `--teal-strong` | `#00AD90` | `#007361` | Emphasized accent text (prices, eyebrows) |
| `--space-panel` | `#16243f` | `#FFFFFF` | Theme-aware “Our Spaces” feature panel |
| `--warning` | `#e0a13a` | `#e0a13a` | Warnings, alerts |
| `--border` | `rgba(255,255,255,.12)` | `rgba(18,68,60,.16)` | Dividers, outlines |

**Rule — teal contrast:** Teal on dark background = 7.96:1 (safe for text). Teal on light background = **2.01:1 — fails WCAG AA**. On the light theme, raw `--teal` is accent/background only — never text, icons, or focus outlines on light surfaces. Use `--teal-text` (light: `#007361`) for any teal-colored text, icon, or outline; it resolves to `--teal` in dark, so call sites need no theme branching.

Theme switching is handled via `[data-theme="light"]` CSS variable overrides and applies to customer pages, authentication, footer, and the complete admin shell. Light mode uses a pale green-gray canvas, white raised surfaces, dark green-gray text, and a light sidebar so the selected appearance is immediately recognizable.

## 2. Typography

- **Font:** Inter, sans-serif — the only font in the system.
- Remove the unused `Sour Gummy` `@import` in `style.css` — it's dead weight, not applied anywhere.
- `--font-body` and `--font-display` both currently resolve to Inter. Keep this single-family approach; differentiate hierarchy through **weight and size**, not multiple typefaces.

| Style | Size | Weight | Use |
|---|---|---|---|
| Display | 1.5rem+ | 700 | Dashboard headline numbers, big stats |
| Heading | 1.08–1.2rem | 700 | Section/panel titles |
| Body | 0.9–1rem | 400–500 | Default text |
| Small/meta | 0.72–0.8rem | 500–600 | Labels, timestamps, badges |

## 3. Spacing Scale

Current code uses raw px values (4, 6, 8, 9, 10, 12, 14, 16, 20...) with no consistent system. **Going forward, use this 4px-based scale only:**

```
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-5: 20px
--space-6: 24px
--space-8: 32px
--space-10: 40px
```

Existing off-scale values (6px, 9px, 10px, 14px) are grandfathered in — don't mass-refactor them — but **no new code should introduce a new off-scale spacing value.**

## 4. Radius Scale

Current values are scattered (7–20px plus 999px pills) with no naming. **New tokens:**

```
--radius-sm: 8px    /* inputs, small buttons, badges */
--radius-md: 12px   /* cards, panels */
--radius-lg: 16px   /* modals, large containers */
--radius-pill: 999px /* pills, avatars, toggle tracks */
```

## 5. Elevation & Shadows

Two shadow families already exist in the code — keep both, named explicitly:

- **Depth shadow** (default elevation): `0 10px 24px rgba(6,12,24,.2)` — for cards/panels lifting off the surface.
- **Accent/glow shadow** (teal, for emphasis/focus/active state): `0 0 0 1px var(--teal) inset, 0 0 28px rgba(0,201,167,.24), 0 16px 36px rgba(6,12,24,.3)` — reserve for the *one* focal/active element on screen, not decoration. Overusing the glow flattens its meaning.

## 6. Breakpoints

Current code has 11 different `max-width` values — that's drift, not intentional responsive design. **Standardize to:**

```
--bp-mobile: 640px   /* phone */
--bp-tablet: 900px   /* tablet / small laptop */
--bp-desktop: 1200px /* full desktop */
```

New responsive CSS should only use these three. Staff will primarily use the room/status monitor on mobile — mobile breakpoint behavior is not an edge case, it's a primary use case.

## 7. Motion & Animation

The existing `.12s–.3s` transitions in the codebase already lean the right direction — this section formalizes it into concrete, checkable rules instead of vague taste.

### Easing tokens (add these, use them everywhere)

Built-in CSS easings (`ease`, `ease-in-out`, `linear`) are too weak/generic to feel intentional. Add real curve tokens and use only these:

```css
--ease-out:     cubic-bezier(0.23, 1, 0.32, 1);     /* entrances, most UI feedback */
--ease-in-out:  cubic-bezier(0.77, 0, 0.175, 1);    /* on-screen movement, dragging */
--ease-drawer:  cubic-bezier(0.32, 0.72, 0, 1);     /* bottom sheets / drawers (mobile status panel) */
```

- **Never use `ease-in` on something entering the screen.** It starts slow — exactly when the user is watching closest — and makes the UI feel sluggish. Ease-in is for things *leaving*.
- If none of the three tokens fit a specific case, pull a curve from a reputable easing reference — don't hand-roll an arbitrary `cubic-bezier()` value.

### Hard rules

| Rule | Why |
|---|---|
| Animate only `transform` and `opacity` | These run on the GPU. Animating `width`, `height`, `margin`, `padding`, `top`/`left` forces layout recalculation — visibly janky, especially on the staff mobile view. |
| Never animate from `scale(0)` | Nothing in the real world appears from nothing. Start from `scale(0.9–0.97)` + `opacity: 0` instead. |
| Popovers/dropdowns/tooltips scale from their trigger, not the center | Set `transform-origin` to where the trigger element is. **Modals are the exception** — they're centered in the viewport, so `transform-origin: center` is correct there. |
| Gate hover animations behind `@media (hover: hover) and (pointer: fine)` | Without this, touch devices fire hover styles on tap — a real risk here since staff use the status monitor on phones. |
| Keep UI feedback under ~300ms | A 180ms dropdown feels more responsive than a 400ms one. The codebase's existing .12–.3s range is correct — don't drift longer. |
| Use transitions, not keyframes, for anything interruptible | Toggles, panel open/close, drag states get re-triggered rapidly. Keyframes restart from zero on interruption; transitions retarget smoothly from the current state. Reserve keyframes for self-contained/looping effects (e.g. a loading spinner). |
| Stagger group reveals | When multiple items enter together (e.g. a list of bookings loading in), offset each by ~40ms rather than animating them all at once — reads as considered, not accidental. |

### Reduced motion

`prefers-reduced-motion: reduce` is already implemented in at least one stylesheet — extend it everywhere. Reduced motion means **fewer and gentler animations, not zero**:
- Keep: opacity and color transitions (they aid comprehension of state changes).
- Remove: transform-based movement (slide, scale, translate).

### What NOT to animate

Don't animate high-frequency actions (every keystroke, hovering down a long list). Reserve motion for state changes the user should actually notice: a booking gets confirmed, a room's status flips, a panel opens.

### Tooling

The `motion` (Motion/Framer Motion) library is the standard for anything beyond a simple CSS transition — drag interactions, orchestrated multi-element sequences, gesture-driven UI. Don't reach for it for a plain fade; a CSS transition is cheaper and sufficient.

## 8. Accessibility (WCAG AA)

- **Contrast:** minimum 4.5:1 for body text, 3:1 for large text (18px+/bold 14px+) and UI component boundaries. See color table above for verified pairs — don't introduce new text/background combinations without checking contrast.
- **Keyboard navigation:** every interactive element (buttons, form fields, the room/status monitor's actionable cards) must be reachable and operable via keyboard alone.
- **Visible focus states:** never remove `:focus` outlines without replacing them with an equally visible custom focus style (the teal accent/glow shadow is a good candidate for this).
- **Real-time updates:** since room/court status pushes live changes, status changes must not solely rely on color (e.g. red = occupied) — pair color with text/icon so colorblind users aren't excluded.

## 9. Icons & Charts

- **Icons:** `lucide-react` — the standard icon set. Don't mix in another icon library or inline SVGs for standard UI icons.
- **Charts:** `chart.js` — standard for analytics dashboards and revenue forecasting visualizations.

## 10. Required Product Patterns

### Shared dialogs
- Login, customer, and admin dialogs render through the active app shell's modal layer so animated page content cannot change their fixed-position coordinate system. Dialogs stay centered in the visible viewport at phone, tablet, and desktop widths, account for device safe areas, and scroll internally when their content is tall.

### Customer surface
- The header must keep readable navigation text in both themes, expose the same theme control on desktop and mobile, and place account, announcements, and sign-in actions inside the mobile menu without clipping.
- At phone and tablet widths up to 900px, the customer shell keeps Home, Reserve, Contact, and Account in a bottom tab bar that accounts for device safe areas. The full-screen menu carries secondary navigation and preferences, and temporarily disables the tab bar while open.
- Facility cards provide separate **Details** and **Reserve** actions. Details open the dedicated `/rooms/:roomId` page, where customers can compare every type/variant, capacity, exact hourly rate, amenities, status, and available-unit count before checkout. Reserving a listed room type carries that choice into the booking flow.
- On phones, facility cards become compact image-and-content rows. They show only the two most useful amenities; the Details action opens the dedicated facility page with every room type and its complete information.
- “Our Spaces” shows one featured facility at a time in a navy panel set on the page surface: facility name, description, teal pill action to its managed room and rates, and two overlapping circular photos (text left, photos right on desktop; stacked on phones). A panel footer keeps Previous/Next pill controls that name the adjacent facilities, centered dot pagination, arrow-key navigation, and horizontal touch swipes on phones. The panel retains light text and controls in both site themes.
- Route, session, and post-login waits use the same compact Riverview billiards loader. The mobile version avoids costly blur effects, fits dynamic viewport and safe-area bounds, and keeps its motion transform-only. The public shell renders while its session check runs; authentication redirects as soon as the account handoff is ready and never holds the user behind a fake percentage sequence.
- Profile, reservation details, booking, reschedule, cancellation, and authentication dialogs use the shared modal behavior: labelled dialog, focus containment, Escape/close affordance, internal scrolling, and stacked full-width actions on phones.
- Phone booking dialogs show one current step and a short progress bar. Review information is grouped into one flat summary, while policies and secondary account-security controls use progressive disclosure.
- Time selection in the booking dialog responds immediately. A server hold is created only when the customer continues, preserving double-booking protection without blocking tentative taps. Each start tile uses one plain state: **Available**, **Unavailable**, **Ends after closing**, or **Selected · ends [time]**. Single-unit rooms omit inventory fractions, multi-unit counts cover the customer's full selected duration, and payment summaries say **Down payment due now** and **Balance due at venue**.
- The payment step separates the amount decision from the payment method, shows the peso value for every payable-hour option, and gives selected choices a checkmark in addition to color. Reservation summaries and history name the customer's actual method—GCash, Maya, QR Ph, or Credit / Debit Card—while PayMongo remains provider metadata only.
- Reservation details lead with total charge, paid amount, and balance so a downpayment never looks like full payment.
- Receipt actions save a PNG from the current page. Messenger and other embedded browsers show the receipt image with save instructions and a return control when direct downloads are unreliable.
- The footer contains only useful venue facts, navigation, reservation, directions, support, and legal links. Appearance switching stays in the navigation.

### Admin surface
- Authentication uses the shared `/login` login-and-sign-up screen. Existing Staff, Supervisor, and Owner accounts sign in there and open the workspace assigned to their role automatically; the retired `/admin/login` URL redirects into this shared flow and never presents a second authentication UI.
- Live Monitor payment actions follow the money state: fully paid reservations show a compact confirmation, existing downpayments show the remaining balance, and unpaid pay-after-play sessions require the full charge when finishing. Payment cells pair a status badge with the due amount.
- Analytics and report service dates default to today in Asia/Manila. Today, Last 7 days, and This month are one-tap choices; native From/To inputs appear when Custom dates is selected. Settings change history shows ten entries per page with Previous and Next navigation.
- At phone and tablet widths up to 900px, the staff shell exposes every permitted admin destination in a horizontally swipeable bottom tab bar that accounts for device safe areas. The active destination scrolls into view, and the sidebar opened by More contains the complete permission-filtered admin navigation with a customer-site shortcut.
- **More** remains pinned at the right edge of the mobile navigation. Staff sees only Live Monitor and Reservations; Supervisor and Owner receive the overview, reporting, facility, user, log, and settings destinations allowed by their permissions.
- Supervisor dashboard queues remain a three-item row on tablets and phones, with compact two-column quick actions on phones, so operational summaries do not become a long stack of oversized cards.
- Live Monitor leads with physical-unit availability and keeps payment state/balance visible on every active session. Starting a walk-in provides whole-hour choices and explicit **pay before play** or **pay after play** choices.
- Live Monitor cards stay compact and keep Extend, Finish, and accidental-start cancellation on one reachable action row at phone widths.
- Reports contains a dedicated **Live sessions** view with service-date controls, summary totals, room-type totals, an activity table, and Excel export. Live Monitor stays focused on the active floor.
- Facilities uses a responsive image-led card catalog with visible room rates, inventory health, and direct **Add room** and **Manage** actions. The persistent **Add facility** action opens the editor directly with a free-name field and an initial room; Billiards, KTV, and Court remain optional quick-start templates. Any uniquely named facility joins the customer catalog, Live Monitor, and reports. Its two-section editor covers inventory count/start number, capacity, hourly and time-based pricing, guest surcharge, availability, and guest-facing imagery; validation stays inside the dialog and long forms scroll with actions always reachable.
- Reports, Settings, and Login History use plain labels, compact summaries, and one clear primary task. Date filtering uses Today, Last 7 days, This month, and native From/To inputs.
- Tables stay real tables on tablets/desktops and scroll inside labelled containers when their columns cannot fit. On phones, primary operational controls and modal actions span the available width.

## 11. Component Foundation

- **Bootstrap 5.3.3** is actively used and stays as part of the system, alongside the custom CSS-variable design system above.
- Rule to prevent drift: when a Bootstrap utility class and a custom token conflict (e.g. Bootstrap's default spacing vs. this doc's spacing scale), **the custom token wins** — Bootstrap is for layout/grid/component scaffolding, not the source of truth for brand colors, spacing, or radius.

## 12. Anti-Slop Checklist

Generic AI-generated interfaces tend to converge on the same handful of tells, regardless of what the product actually is. Before shipping a new screen or component, check it doesn't fall into these:

- ❌ **Purple-to-blue gradients** as a default decorative background/button treatment. Not part of this brand — teal-on-navy/cream is the identity, don't drift toward generic SaaS gradients.
- ❌ **Cards nested inside cards.** If a "card" contains another bordered/shadowed "card," flatten the hierarchy — use spacing and typography weight to separate content, not another box.
- ❌ **Gray text on colored backgrounds.** Every text/background pairing must be checked against the contrast table in Section 8 — don't eyeball it.
- ❌ **A rounded-square icon tile sitting above every heading** as a default decorative pattern. Icons (lucide-react) should earn their place functionally (status indicators, action buttons) — not as generic visual filler.
- ❌ **Introducing a new font, color, radius, or spacing value "just for this one screen."** If it's not in this doc, it doesn't ship — extend the doc first, don't improvise inline.
- ❌ **Copy-pasting a generic dashboard layout** without considering what staff/admin actually need to see first (e.g. live room status matters more on a staff view than a decorative stat card).

This list isn't exhaustive — the underlying rule is: every visual choice should trace back to something in this doc or a real user need, not to "what AI templates usually look like."
