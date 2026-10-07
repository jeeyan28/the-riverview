import { useEffect, useState } from 'react';

// Ticks `now` once a second while `active` is true — drives resend-cooldown
// and OTP-expiry countdowns without each screen managing its own interval.
export function useCountdownClock(active) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  return now;
}