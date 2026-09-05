"use client";

import { useEffect, useState } from "react";

const HINTS = [
  "Gathering the conversation…",
  "Almost there…",
  "Syncing messages…",
];

export default function ChatLoadingHints() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => {
      setI((n) => (n + 1) % HINTS.length);
    }, 2800);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="py-8 text-center text-sm text-muted-foreground tabular-nums">
      {HINTS[i]}
    </div>
  );
}
