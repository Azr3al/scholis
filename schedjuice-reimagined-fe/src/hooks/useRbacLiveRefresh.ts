"use client";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/** Pure: true when a raw websocket payload is an `rbac.updated` event. Tolerates non-JSON frames. */
export function isRbacUpdateMessage(data: string): boolean {
  try {
    const msg = JSON.parse(data);
    return msg?.type === "rbac.updated";
  } catch {
    return false;
  }
}

/**
 * Invalidates the cached `["profile"]` query whenever an `rbac.updated` frame arrives on the
 * already-open chat/notifications websocket, so permission changes take effect without a reload.
 * Inert until Plan 5 emits the event; harmless to mount now.
 */
export function useRbacLiveRefresh(socket: { addEventListener?: Function } | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!socket?.addEventListener) return;
    const handler = (e: MessageEvent) => {
      if (isRbacUpdateMessage((e as MessageEvent<string>).data)) {
        qc.invalidateQueries({ queryKey: ["profile"] });
      }
    };
    (socket as { addEventListener: Function }).addEventListener("message", handler);
    return () =>
      (socket as { removeEventListener?: Function }).removeEventListener?.(
        "message",
        handler,
      );
  }, [socket, qc]);
}
