"use client";

import { useEffect, useState } from "react";

/** Counts from 0 to `value` in ~400ms (ease-out); jumps straight there if the user prefers reduced motion. */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const duration = reduce ? 0 : 400;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{shown}</>;
}
