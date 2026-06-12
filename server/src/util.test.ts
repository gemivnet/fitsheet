import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDaysStr, finiteNum, hourOfDay, isDayStr, titleCase, todayStr } from './util';

test('addDaysStr crosses DST boundaries without skipping a day', () => {
  // US spring-forward (2026-03-08) and fall-back (2026-11-01)
  assert.equal(addDaysStr('2026-03-07', 1), '2026-03-08');
  assert.equal(addDaysStr('2026-03-08', 1), '2026-03-09');
  assert.equal(addDaysStr('2026-10-31', 1), '2026-11-01');
  assert.equal(addDaysStr('2026-11-01', 1), '2026-11-02');
  assert.equal(addDaysStr('2026-11-02', -1), '2026-11-01');
  // month/year rollover
  assert.equal(addDaysStr('2026-01-01', -1), '2025-12-31');
  assert.equal(addDaysStr('2026-12-31', 1), '2027-01-01');
});

test('isDayStr accepts only YYYY-MM-DD strings', () => {
  assert.equal(isDayStr('2026-06-12'), true);
  assert.equal(isDayStr('2026-6-12'), false);
  assert.equal(isDayStr('garbage'), false);
  assert.equal(isDayStr(''), false);
  assert.equal(isDayStr(undefined), false);
  assert.equal(isDayStr(20260612), false);
});

test('finiteNum rejects NaN/Infinity/empty and keeps zero', () => {
  assert.equal(finiteNum(150), 150);
  assert.equal(finiteNum('150'), 150);
  assert.equal(finiteNum(0), 0);
  assert.equal(finiteNum('abc'), null);
  assert.equal(finiteNum(Infinity), null);
  assert.equal(finiteNum(null), null);
  assert.equal(finiteNum(''), null);
});

test('hourOfDay bounds to 0-23 integers', () => {
  assert.equal(hourOfDay(0), 0);
  assert.equal(hourOfDay(23), 23);
  assert.equal(hourOfDay('12'), 12);
  assert.equal(hourOfDay(24), null);
  assert.equal(hourOfDay(-1), null);
  assert.equal(hourOfDay(2.5), null);
  assert.equal(hourOfDay('lunch'), null);
});

test('todayStr formats a local calendar date', () => {
  assert.match(todayStr(new Date('2026-06-12T12:00:00')), /^2026-06-12$/);
});

test('titleCase canonicalizes restaurant names', () => {
  assert.equal(titleCase('chipotle'), 'Chipotle');
  assert.equal(titleCase('in and out'), 'In and Out');
});
