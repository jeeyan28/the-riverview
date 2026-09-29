# Lobby TV availability board

Scope: the guest-facing board entered with Display on TV at `/lobby-monitor`. Mode: Operate. Walk-in guests should identify a facility, a numbered unit, its availability, and its rate or remaining time without scrolling. Keep the existing setup filters and table view.

## Direction contract

THESIS: a readable venue availability board with large unit numbers and plain status labels. Optimize for the guest standing away from the screen.

OWN-WORLD: inherit Riverview's Inter, navy surfaces, teal accents, light-theme support, and semantic status colors. Green availability also carries an explicit label; occupied and unavailable units remain distinct.

STORY: find the facility and room type, choose an available number, then ask staff to start. Remaining time includes units and does not promise immediate availability after expiry.

FIRST VIEWPORT: compact title, guest instruction, availability total and clock above a screen-filling set of facility/type sections. Cards prioritize the unit number, status, then hourly rate or time remaining. Partial rows fill their category width. A quiet footer retains update health and exit.

FORM: a precisely scoped extension of the established grouped board; no new visual identity or concept seed. The existing packing algorithm adapts to inventory and screen size.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
