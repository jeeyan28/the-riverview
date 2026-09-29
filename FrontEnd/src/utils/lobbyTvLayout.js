const TILE_PAD_MAX = 20;
const TILE_PAD_RATIO = 0.085;
const TEXT_WIDTH_EM = 4.25;
const TEXT_HEIGHT_EM = 3.35;
const FONT_MAX = 72;
const FONT_MIN = 8;
const HEADER_FONT_MAX = 28;
const HEADER_FONT_MIN = 12;
const HEADER_READABLE_FONT = 20;
const CHAR_EM = 0.58;
const HEADER_CHROME = 24;

function boundedTargets(counts, columns, limit) {
  const targets = new Set([1]);
  for (const count of counts) {
    for (let span = 1; span <= columns; span += 1) {
      targets.add(Math.ceil(count / span));
    }
  }
  const ordered = [...targets].sort((a, b) => a - b);
  if (ordered.length <= limit) return ordered;
  if (limit === 1) return [ordered[Math.floor(ordered.length / 2)]];
  return Array.from({ length: limit }, (_, index) => (
    ordered[Math.round(index * (ordered.length - 1) / (limit - 1))]
  ));
}

function packSections(counts, columns, targetRows) {
  const rows = [];
  let current = null;
  for (let index = 0; index < counts.length; index += 1) {
    const span = Math.min(columns, Math.ceil(counts[index] / targetRows));
    const roomRows = Math.ceil(counts[index] / span);
    if (!current || current.span + span > columns) {
      current = { span: 0, roomRows: 0, sections: [] };
      rows.push(current);
    }
    current.span += span;
    current.roomRows = Math.max(current.roomRows, roomRows);
    current.sections.push({ index, columns: span, roomRows, span });
  }
  return rows;
}

export function fitLobbyHeader(width, headerHeight, label, metaOptions = []) {
  const contentWidth = Math.max(24, (Number.isFinite(width) ? width : 0) - HEADER_CHROME);
  const contentHeight = Math.max(16, (Number.isFinite(headerHeight) ? headerHeight : 56) - 12);
  const preferred = Math.min(HEADER_FONT_MAX, contentHeight / 1.2);
  const words = String(label).split(/\s+/);
  const readableAt = (meta) => {
    for (let fontSize = preferred; fontSize >= HEADER_FONT_MIN; fontSize -= 0.5) {
      const labelWidth = contentWidth - (meta ? String(meta).length * fontSize * 0.8 * CHAR_EM + 12 : 0);
      if (labelWidth < 24) continue;
      let lines = 1;
      let used = 0;
      for (const word of words) {
        const wordWidth = word.length * fontSize * CHAR_EM;
        if (used && used + fontSize * CHAR_EM + wordWidth > labelWidth) { lines += 1; used = 0; }
        const wrappedLines = Math.max(1, Math.ceil(wordWidth / labelWidth));
        lines += wrappedLines - 1;
        used = wrappedLines > 1 ? wordWidth % labelWidth : used + (used ? fontSize * CHAR_EM : 0) + wordWidth;
      }
      if (lines * fontSize * 1.2 <= contentHeight) return fontSize;
    }
    return HEADER_FONT_MIN;
  };
  const candidates = metaOptions
    .filter((meta) => !!meta)
    .map((meta) => ({ meta: String(meta), fontSize: readableAt(meta) }));

  const comfortable = candidates.find((candidate) => candidate.fontSize >= HEADER_READABLE_FONT);
  if (comfortable) return comfortable;

  const tightest = candidates
    .filter((candidate) => candidate.fontSize >= 16)
    .sort((a, b) => b.fontSize - a.fontSize)[0];
  if (tightest) return tightest;

  return {
    fontSize: readableAt(''),
    meta: '',
  };
}

export function createLobbyTvLayout(counts, width, height) {
  const roomCounts = counts.map((count) => Math.max(1, Math.floor(Number(count) || 1)));
  const availableWidth = Math.max(1, Number.isFinite(width) ? width : 1);
  const availableHeight = Math.max(1, Number.isFinite(height) ? height : 1);
  const largeDisplay = availableWidth >= 1600 && availableHeight >= 800;
  const preferredGap = largeDisplay ? 16 : 8;
  const preferredHeader = largeDisplay ? 64 : 56;
  if (!roomCounts.length) {
    return { gap: preferredGap, headerHeight: preferredHeader, fontSize: 36, pad: 14, rows: [] };
  }

  const totalRooms = roomCounts.reduce((total, count) => total + count, 0);
  const maxColumns = Math.min(12, totalRooms);
  const targetLimit = Math.max(1, Math.min(128, Math.floor(12000 / (roomCounts.length * maxColumns))));
  let best = null;

  for (let columns = 1; columns <= maxColumns; columns += 1) {
    for (const targetRows of boundedTargets(roomCounts, columns, targetLimit)) {
      const shelves = packSections(roomCounts, columns, targetRows);
      const totalRoomRows = shelves.reduce((total, shelf) => total + shelf.roomRows, 0);
      const gap = Math.min(preferredGap, availableWidth / (columns * 3), availableHeight / (totalRoomRows * 3));
      const headerHeight = Math.min(preferredHeader, availableHeight / (shelves.length * 3));
      const cardHeight = (availableHeight - shelves.length * headerHeight - (totalRoomRows - 1) * gap) / totalRoomRows;

      const cells = [];
      const rows = shelves.map((shelf) => {
        const rowHeight = headerHeight + shelf.roomRows * cardHeight + (shelf.roomRows - 1) * gap;
        const shelfWidth = availableWidth - (shelf.sections.length - 1) * gap;
        const sections = shelf.sections.map((section) => {
          const sectionWidth = shelfWidth * section.span / shelf.span;
          const cellWidth = (sectionWidth - (section.columns - 1) * gap) / section.columns;
          const cellHeight = (rowHeight - headerHeight - (section.roomRows - 1) * gap) / section.roomRows;
          cells.push({ cellWidth, cellHeight });
          return { ...section, width: sectionWidth };
        });
        return { height: rowHeight, sections };
      });

      const narrowest = cells.reduce(
        (smallest, cell) => ({ cellWidth: Math.min(smallest.cellWidth, cell.cellWidth), cellHeight: Math.min(smallest.cellHeight, cell.cellHeight) }),
        { cellWidth: Infinity, cellHeight: Infinity }
      );
      const pad = Math.max(3, Math.min(
        TILE_PAD_MAX,
        narrowest.cellWidth * TILE_PAD_RATIO,
        narrowest.cellHeight * TILE_PAD_RATIO
      ));
      const font = cells.reduce((smallest, cell) => Math.min(
        smallest,
        (cell.cellWidth - 2 * pad) / TEXT_WIDTH_EM,
        (cell.cellHeight - 2 * pad) / TEXT_HEIGHT_EM
      ), Infinity);

      if (Number.isFinite(font) && (!best || font > best.font)) {
        best = { font, layout: { gap, headerHeight, pad, rows } };
      }
    }
  }

  if (!best) {
    return { gap: preferredGap, headerHeight: preferredHeader, fontSize: FONT_MIN, pad: 6, rows: [] };
  }
  return { ...best.layout, fontSize: Math.max(FONT_MIN, Math.min(FONT_MAX, best.font)) };
}
