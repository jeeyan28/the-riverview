# Lobby TV availability board

Scope: the guest-facing board entered with Display on TV at `/lobby-monitor`. Mode: Operate. Walk-in guests should identify a facility, a numbered unit, its availability, and its rate or remaining time without scrolling. Keep the existing setup filters and table view.

## Direction contract

THESIS: a readable venue availability board with large unit numbers and plain status labels. Optimize for the guest standing away from the screen.

OWN-WORLD: inherit Riverview's Inter, navy surfaces, teal accents, light-theme support, and semantic status colors. Green availability also carries an explicit label; occupied and unavailable units remain distinct.

STORY: find the facility and room type, choose an available number, then ask staff to start. Remaining time includes units and does not promise immediate availability after expiry.

FIRST VIEWPORT: compact title, guest instruction, availability total and clock above a screen-filling set of facility/type sections. Cards prioritize the unit number, status, then hourly rate or time remaining. Partial rows fill their category width. A quiet footer retains update health and exit.

FORM: preserve the established facility/type groups, navy/teal surfaces and status colors. Fullscreen and cast mode place Available, Occupied, Ending Soon and Overdue counts immediately above each facility. Slightly larger cards and type aid reading from a distance. Size cards from the complete inventory so facility filters simply hide the other facilities without stretching the remaining tiles. Room-type options follow the selected facility; changing facilities resets that secondary filter.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Scoped finish review — October 2, 2026

Verdict: the requested refinement preserves the grouped design. The 21-space fixture fits at 1920×1080 and 1280×720 with no clipped card text. Facility filtering preserves card geometry; switching facilities clears the room-type filter. The 390px setup view has no horizontal overflow. Fullscreen and a simulated presentation receiver both expose the facility status rows. Casting hardware was not part of this local visual check. No new product image assets were introduced.
