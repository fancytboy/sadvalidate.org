import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, createTimer } from '../js/timer.js';

test('formatTime renders m:ss with zero-padded seconds', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(5), '0:05');
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(1800), '30:00');
  assert.equal(formatTime(3600), '60:00');
});

test('formatTime clamps negatives to 0:00', () => {
  assert.equal(formatTime(-5), '0:00');
});

// A fake clock that captures the interval callback so we can drive ticks manually.
function fakeClock() {
  let cb = null, id = 0;
  return {
    setIntervalImpl: (fn) => { cb = fn; return ++id; },
    clearIntervalImpl: () => { cb = null; },
    tick(n = 1) { for (let i = 0; i < n; i++) if (cb) cb(); },
    isRunning() { return cb !== null; }
  };
}

test('createTimer counts down once per tick and reports remaining', () => {
  const clock = fakeClock();
  const ticks = [];
  const timer = createTimer({
    onTick: r => ticks.push(r),
    onExpire: () => {},
    setIntervalImpl: clock.setIntervalImpl,
    clearIntervalImpl: clock.clearIntervalImpl
  });
  timer.start(3);
  assert.equal(ticks[0], 3); // initial paint
  clock.tick();
  assert.equal(timer.getRemaining(), 2);
  clock.tick();
  assert.equal(timer.getRemaining(), 1);
});

test('createTimer fires onExpire exactly once at zero and keeps ticking', () => {
  const clock = fakeClock();
  let expireCount = 0;
  const timer = createTimer({
    onTick: () => {},
    onExpire: () => { expireCount++; },
    setIntervalImpl: clock.setIntervalImpl,
    clearIntervalImpl: clock.clearIntervalImpl
  });
  timer.start(2);
  clock.tick(); // 1
  clock.tick(); // 0 -> expire
  clock.tick(); // still 0, no second expire
  assert.equal(timer.getRemaining(), 0);
  assert.equal(expireCount, 1);
});

test('stop halts the interval', () => {
  const clock = fakeClock();
  const timer = createTimer({
    onTick: () => {}, onExpire: () => {},
    setIntervalImpl: clock.setIntervalImpl,
    clearIntervalImpl: clock.clearIntervalImpl
  });
  timer.start(10);
  assert.ok(clock.isRunning());
  timer.stop();
  assert.ok(!clock.isRunning());
});

test('setRemaining overrides the clock and clears expiry when positive', () => {
  const clock = fakeClock();
  let expireCount = 0;
  const timer = createTimer({
    onTick: () => {}, onExpire: () => { expireCount++; },
    setIntervalImpl: clock.setIntervalImpl,
    clearIntervalImpl: clock.clearIntervalImpl
  });
  timer.start(1);
  clock.tick(); // 0 -> expire #1
  assert.equal(expireCount, 1);
  timer.setRemaining(120); // user bumped the timer back up
  assert.equal(timer.getRemaining(), 120);
  clock.tick();
  assert.equal(timer.getRemaining(), 119);
  // and it can expire again later
  timer.setRemaining(1);
  clock.tick();
  assert.equal(expireCount, 2);
});
