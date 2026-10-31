import { useEffect, useState } from "react";

// Counts down to a timestamp (ms). Returns whole seconds left.
export function useCountdown(expiresAt, onExpire) {
  const [left, setLeft] = useState(() => (expiresAt ? Math.max(0, Math.round((expiresAt - Date.now()) / 1000)) : 0));

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const s = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) onExpire?.();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  return expiresAt ? left : 0;
}
