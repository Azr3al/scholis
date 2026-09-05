"use client";

import { useCallback, useEffect, useState } from "react";

const DEFAULT_COOLDOWN_SECONDS = 30;

export function useResendCooldown(defaultSeconds = DEFAULT_COOLDOWN_SECONDS) {
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    if (secondsRemaining <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsRemaining]);

  const startCooldown = useCallback(
    (seconds?: number) => {
      setSecondsRemaining(seconds ?? defaultSeconds);
    },
    [defaultSeconds],
  );

  return {
    secondsRemaining,
    canResend: secondsRemaining === 0,
    startCooldown,
  };
}
