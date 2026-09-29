import test from 'node:test';
import assert from 'node:assert/strict';
import { createLobbyTvLayout, fitLobbyHeader } from '../src/utils/lobbyTvLayout.js';

function verifyFits(counts, width, height) {
  const layout = createLobbyTvLayout(counts, width, height);
  const usedHeight = layout.rows.reduce((total, row) => total + row.height, 0)
    + Math.max(0, layout.rows.length - 1) * layout.gap;
  assert.ok(Math.abs(usedHeight - height) < 0.00001);
  assert.deepEqual(layout.rows.flatMap((row) => row.sections.map((section) => section.index)), counts.map((_, index) => index));
  assert.ok(Number.isFinite(layout.fontSize) && layout.fontSize >= 1 && layout.fontSize <= 72);
  assert.ok(Number.isFinite(layout.gap) && layout.gap > 0);
  assert.ok(Number.isFinite(layout.headerHeight) && layout.headerHeight > 0);
  assert.ok(Number.isFinite(layout.pad) && layout.pad > 0 && layout.pad < 64);

  for (const row of layout.rows) {
    assert.ok(Number.isFinite(row.height) && row.height > layout.headerHeight);
    const spans = row.sections.reduce((total, section) => total + section.span, 0);
    for (const section of row.sections) {
      const sectionWidth = (width - (row.sections.length - 1) * layout.gap) * section.span / spans;
      const cellWidth = (sectionWidth - (section.columns - 1) * layout.gap) / section.columns;
      const cellHeight = (row.height - layout.headerHeight - (section.roomRows - 1) * layout.gap) / section.roomRows;
      assert.ok(Number.isFinite(cellWidth) && cellWidth > 0);
      assert.ok(Number.isFinite(cellHeight) && cellHeight > 0);
      assert.ok(section.columns * section.roomRows >= counts[section.index]);
      assert.ok(section.columns * (section.roomRows - 1) < counts[section.index]);
    }
  }
  return layout;
}

test('every category and room fits in one screen across sparse and dense inventories', () => {
  for (const counts of [[1], [4, 1, 2], [12, 4, 2, 2, 4, 1, 1], [18, 2, 1, 1, 5], [120, 7, 4]]) {
    verifyFits(counts, 1920, 900);
    verifyFits(counts, 1280, 560);
  }
});

test('small and extremely dense layouts keep finite positive geometry without dropping rooms', () => {
  verifyFits([50000, 2, 1], 320, 180);
  verifyFits(Array(30).fill(1), 1, 1);
});

test('larger categories receive more screen area than small categories', () => {
  const layout = verifyFits([18, 2], 1920, 900);
  const areas = [];
  for (const row of layout.rows) {
    const spans = row.sections.reduce((total, section) => total + section.span, 0);
    for (const section of row.sections) {
      const width = (1920 - (row.sections.length - 1) * layout.gap) * section.span / spans;
      areas[section.index] = width * (row.height - layout.headerHeight);
    }
  }
  assert.ok(areas[0] > areas[1] * 2);
});

test('a 1080p display gives dense categories larger common typography than a 720p display', () => {
  const counts = [12, 6, 4, 3, 6, 2, 2];
  const small = verifyFits(counts, 1280, 560);
  const large = verifyFits(counts, 1920, 900);
  assert.ok(large.fontSize > small.fontSize);
  assert.ok(large.fontSize >= 20);
});

test('every room stays readable on a 1080p TV without scrolling', () => {
  for (const counts of [[4, 3, 3, 2, 5, 2, 2], [12, 6, 4, 3, 6, 2, 2], [40], [8, 6, 6, 4, 4, 4, 3, 3, 3, 2, 2, 2]]) {
    const layout = verifyFits(counts, 1920, 900);
    assert.ok(layout.fontSize >= 28, `expected readable type, got ${layout.fontSize}`);
  }
});

test('layouts are deterministic and empty categories produce no rows', () => {
  assert.deepEqual(createLobbyTvLayout([4, 4, 2], 1920, 900), createLobbyTvLayout([4, 4, 2], 1920, 900));
  const empty = createLobbyTvLayout([], 1920, 900);
  assert.deepEqual(empty.rows, []);
  assert.ok(Number.isFinite(empty.gap) && Number.isFinite(empty.headerHeight) && Number.isFinite(empty.fontSize));
});

test('category headers keep the availability count without sacrificing the category name', () => {
  const label = 'Billiards · Shared Room';
  const metas = ['4 available'];
  const wide = fitLobbyHeader(820, 64, label, metas);
  assert.equal(wide.meta, '4 available');
  assert.ok(wide.fontSize >= 20 && wide.fontSize <= 28);

  const cramped = fitLobbyHeader(150, 56, label, metas);
  assert.equal(cramped.meta, '');
  assert.ok(cramped.fontSize >= 12 && cramped.fontSize <= 28);

  const medium = fitLobbyHeader(340, 64, label, metas);
  assert.equal(medium.meta, '4 available');
  assert.ok(medium.fontSize >= 16);
});

test('a busy 60-space venue keeps large room numbers on a 1080p TV', () => {
  const layout = verifyFits([24, 10, 6, 4, 10, 4, 2], 1872, 914);
  assert.ok(layout.fontSize * 1.5 >= 36, `room numbers are ${layout.fontSize * 1.5}px`);
});
