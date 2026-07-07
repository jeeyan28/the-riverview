# PROJECT

Completed:
- React migration
- Authentication
- Booking
- Admin
- PayMongo
- Cloudinary
- Home page redesign to match reference image (Home.png) — hero, rooms
  header, spaces showcase, and about section converted from the old
  full-navy dark theme to the light theme shown in the reference image;
  header now stays solid/light instead of transparent-over-dark-hero;
  spaces showcase rebuilt as alternating image/text cards; hero
  duplicate avatar row removed; Log in button restyled to solid teal.
- Hero carousel: added clickable left/right arrow buttons (visible on
  hover, hidden on mobile since the carousel itself is mobile-hidden),
  and smoothed the crossfade transition timing/easing.
- Room cards: fixed the price-list row markup to actually use the
  existing `.price-name` (bright/white) and `.price-pax` (muted)
  classes defined in style.css — previously both the room variant name
  and pax count rendered as one plain low-contrast span, so the name
  never got the clear white treatment style.css already provided for it.
- Room grid: switched `.room-grid` from a fixed 4-column CSS Grid to a
  centered, wrapping flexbox layout, so when there are fewer than a
  full row of rooms they're centered instead of left-aligned. Removed
  the now-obsolete `grid-template-columns` responsive overrides and
  replaced the loading/error/empty placeholder divs' `gridColumn: '1/-1'`
  inline style (a no-op under flexbox) with `width: '100%'`.
- Booking modal close button: `.bk-modal` scrolled as one block, so the
  absolutely-positioned `.bk-close` (✕) scrolled out of view on longer
  steps. `.bk-modal` is now a fixed-height flex column (header pinned,
  no longer scrolls); only `.bk-body` scrolls internally. Close button
  now stays visible at all scroll positions.
- Footer social icons hover bug: enhancements.css's link-underline-sweep
  rule (`.footer-col a`) matched any `<a>` nested in a `.footer-col`,
  including the round social icon buttons nested inside `.social-icons`
  — so hovering them also applied `width: fit-content` and an underline
  meant for text links, distorting the circular buttons. Scoped the rule
  to `.footer-col > a` (direct children only, i.e. just the Explore nav
  links), which naturally excludes the nested social icons.
- Footer modernization: added a subtle top hairline + soft teal radial
  glow behind the brand column (ambient accent, matches existing
  --glow-teal/teal token already used elsewhere on the site); social
  icons now get a teal glow-ring on hover (var(--glow-teal)) alongside
  the existing lift; added a small "Back to top" link (reuses the
  existing #home anchor, no new IDs needed) next to the copyright/
  address line, restructured into `.footer-bottom-left` so the three
  pieces (copyright+address, back-to-top) lay out cleanly on both
  desktop and mobile.

Known Issues:
- None newly introduced. Pre-existing items from FEATURE_REQUESTS.md
  (profile page items) are still open and were NOT touched in this task.

Modified Files:
- frontend-react/src/styles/style.css (earlier task)
- frontend-react/src/styles/enhancements.css
- frontend-react/src/components/Footer.jsx

Next Task:
- Pick next item from FEATURE_REQUESTS.md (profile page items — red
  color fix, combining profile/password, booking history, Google vs
  manual account editing).