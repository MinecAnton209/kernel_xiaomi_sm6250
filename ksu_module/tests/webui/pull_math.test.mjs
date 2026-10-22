import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEAD_ZONE,
  MAX_OFFSET,
  PULL_DISTANCE_PER_TURN,
  TRIGGER_DISTANCE,
  exceedsDeadZone,
  indicatorOffset,
  indicatorOpacity,
  pullProgress,
  shouldRefresh,
  startsPull,
} from '../../webui/src/logic/pullMath.ts';

test('pullProgress is one turn per 120px and never negative', () => {
  assert.equal(pullProgress(0), 0);
  assert.equal(pullProgress(PULL_DISTANCE_PER_TURN), 1);
  assert.equal(pullProgress(PULL_DISTANCE_PER_TURN / 2), 0.5);
  assert.equal(pullProgress(PULL_DISTANCE_PER_TURN * 2), 2);
  assert.equal(pullProgress(-50), 0);
});

test('indicatorOffset follows the finger at half speed', () => {
  assert.equal(indicatorOffset(0), 0);
  assert.equal(indicatorOffset(40), 20);
  assert.equal(indicatorOffset(TRIGGER_DISTANCE), TRIGGER_DISTANCE / 2);
});

test('indicatorOffset is capped and ignores upward drags', () => {
  assert.equal(indicatorOffset(10_000), MAX_OFFSET);
  assert.equal(indicatorOffset(MAX_OFFSET * 2), MAX_OFFSET);
  assert.equal(indicatorOffset(-30), 0);
});

test('indicatorOffset never decreases as the pull grows', () => {
  let previous = -1;
  for (let dy = -20; dy <= 400; dy += 5) {
    const offset = indicatorOffset(dy);
    assert.ok(offset >= previous, `offset dropped at dy=${dy}`);
    previous = offset;
  }
});

test('indicatorOpacity fades in and stays within 0..1', () => {
  assert.equal(indicatorOpacity(0), 0);
  assert.equal(indicatorOpacity(-10), 0);
  assert.ok(indicatorOpacity(30) > 0 && indicatorOpacity(30) < 1);
  assert.equal(indicatorOpacity(200), 1);
  assert.equal(indicatorOpacity(10_000), 1);
});

test('shouldRefresh needs the trigger distance, exactly at it counts', () => {
  assert.equal(shouldRefresh(TRIGGER_DISTANCE - 1), false);
  assert.equal(shouldRefresh(TRIGGER_DISTANCE), true);
  assert.equal(shouldRefresh(TRIGGER_DISTANCE + 100), true);
  assert.equal(shouldRefresh(0), false);
  assert.equal(shouldRefresh(-200), false);
});

test('a refresh needs more than a full dead zone worth of travel', () => {
  assert.ok(TRIGGER_DISTANCE > DEAD_ZONE);
});

test('exceedsDeadZone uses the straight line distance', () => {
  assert.equal(exceedsDeadZone(0, 0), false);
  assert.equal(exceedsDeadZone(0, DEAD_ZONE - 1), false);
  assert.equal(exceedsDeadZone(0, DEAD_ZONE), true);
  assert.equal(exceedsDeadZone(DEAD_ZONE, 0), true);
  assert.equal(exceedsDeadZone(-DEAD_ZONE, 0), true);
  assert.equal(exceedsDeadZone(6, 6), true);
  assert.equal(exceedsDeadZone(5, 5), false);
});

test('startsPull accepts a mostly vertical drag downwards', () => {
  assert.equal(startsPull(0, 20), true);
  assert.equal(startsPull(5, 20), true);
  assert.equal(startsPull(-5, 20), true);
});

test('startsPull rejects upward, horizontal and diagonal drags', () => {
  assert.equal(startsPull(0, -20), false);
  assert.equal(startsPull(20, 0), false);
  assert.equal(startsPull(0, 0), false);
  assert.equal(startsPull(20, 20), false);
  assert.equal(startsPull(-30, 20), false);
});
