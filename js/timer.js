export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function createTimer({
  onTick = () => {},
  onExpire = () => {},
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval
} = {}) {
  let remaining = 0;
  let handle = null;
  let expired = false;

  function tick() {
    remaining -= 1;
    if (remaining <= 0) {
      remaining = 0;
      if (!expired) {
        expired = true;
        onExpire();
      }
    }
    onTick(remaining);
  }

  function stop() {
    if (handle !== null) {
      clearIntervalImpl(handle);
      handle = null;
    }
  }

  return {
    start(durationSec) {
      stop();
      remaining = Math.max(0, Math.floor(durationSec));
      expired = remaining <= 0;
      onTick(remaining);
      handle = setIntervalImpl(tick, 1000);
    },
    stop,
    setRemaining(sec) {
      remaining = Math.max(0, Math.floor(sec));
      if (remaining > 0) expired = false;
      onTick(remaining);
    },
    getRemaining() {
      return remaining;
    }
  };
}
