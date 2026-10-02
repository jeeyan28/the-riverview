# Lobby TV availability board

Scope: the guest-facing board entered with View on TV or Fullscreen at `/lobby-monitor`. Mode: Operate. Walk-in guests should identify a facility, a numbered unit, its availability, and its rate or remaining time. Keep the existing setup filters and table view. Scrolling is expected when the inventory extends beyond the viewport; never shrink the grid to fit one screen.

## Direction contract

THESIS: a readable venue availability board with large unit numbers and plain status labels. Optimize for the guest standing away from the screen.

OWN-WORLD: inherit Riverview's Inter, navy surfaces, teal accents, light-theme support, and semantic status colors. Green availability also carries an explicit label; occupied and unavailable units remain distinct.

STORY: find the facility and room type, choose an available number, then ask staff to start. Remaining time includes units and does not promise immediate availability after expiry.

FIRST VIEWPORT: title and clock above the existing facility/type sections. Cards retain the preview layout, including unit number, status, active-session timer and hourly rate. Fullscreen hides setup controls and adds each facility's status counts; further facilities remain reachable by scrolling.

FORM: preserve the established facility/type groups, navy/teal surfaces and status colors. Fullscreen and cast mode place Available, Occupied, Ending Soon and Overdue counts immediately above each facility. Preview, fullscreen and cast use the same card markup, typography, padding and grid rules. Grid columns respond normally to viewport width, while card height and text never scale with screen height or room count. Facility filters only hide other facilities. Room-type options follow the selected facility; changing facilities resets that secondary filter.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Scoped finish review — October 2, 2026

The latest user direction replaces the previous one-screen fitting requirement: preserve the normal grid dimensions across display modes and allow scrolling. The isolated browser fixture passed with 60 rooms: preview, fullscreen and cast had identical card widths, heights, padding and font sizes at 1280×720. Increasing only screen height to 900 preserved that geometry. The scroll region reached the final Court section; Billiards filtering retained 44 Billiards units with the same widths and hid other facilities. Four status counts remain above each facility. Production build and 23 presentation tests passed. Verdict: scoped direction met. Casting hardware is outside the local fixture check. No new product image assets were introduced.
