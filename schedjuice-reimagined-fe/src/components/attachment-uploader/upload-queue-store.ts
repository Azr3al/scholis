"use client";

import { create } from "zustand";

export type UploadStatus =
  | "queued"
  | "uploading"
  | "paused"
  | "success"
  | "error"
  | "canceled";

export interface UploadQueueItem {
  id: string;
  fileName: string;
  fileSize: number;
  progress: number; // 0..1
  status: UploadStatus;
  speedBps?: number;
  etaSeconds?: number;
  url?: string | null;
  errorMessage?: string;
  abort?: () => void;
  resume?: () => void;
  terminate?: () => void;
  // internal tracking for ETA/speed
  _lastBytesSent?: number;
  _lastTimestamp?: number;
}

interface UploadQueueState {
  items: UploadQueueItem[];
  addItem: (item: { fileName: string; fileSize: number }) => string;
  setUploading: (id: string) => void;
  updateProgress: (
    id: string,
    sent: number,
    total: number,
    tickMs?: number
  ) => void;
  markSuccess: (id: string, url: string | null) => void;
  markError: (id: string, message: string) => void;
  markCanceled: (id: string) => void;
  markPaused?: (id: string) => void;
  setAbort: (id: string, abort: () => void) => void;
  setResume?: (id: string, resume: () => void) => void;
  setTerminate?: (id: string, terminate: () => void) => void;
  cleanupIfDone: () => void;
}

export const useUploadQueueStore = create<UploadQueueState>((set, get) => ({
  items: [],
  addItem: (item) => {
    const id = crypto.randomUUID();
    set((s) => ({
      items: [...s.items, { progress: 0, status: "queued", ...item, id }],
    }));
    return id;
  },
  setUploading: (id) =>
    set((s) => ({
      items: s.items.map((it) =>
        it.id === id ? { ...it, status: "uploading" } : it
      ),
    })),
  updateProgress: (id, sent, total) =>
    set((s) => {
      const now = Date.now();
      return {
        items: s.items.map((it) => {
          if (it.id !== id) return it;
          const prevTs = it._lastTimestamp ?? now - 500; // assume 0.5s before
          const prevBytes = it._lastBytesSent ?? sent;
          const dtSec = Math.max(0.001, (now - prevTs) / 1000);
          const dBytes = Math.max(0, sent - prevBytes);
          const speed = dBytes / dtSec; // bytes/sec
          const remaining = Math.max(0, (total || 0) - sent);
          const eta = speed > 0 ? remaining / speed : undefined;
          return {
            ...it,
            progress: total ? Math.min(1, sent / total) : it.progress,
            speedBps: Number.isFinite(speed) && speed > 0 ? speed : it.speedBps,
            etaSeconds: eta,
            _lastBytesSent: sent,
            _lastTimestamp: now,
          } as UploadQueueItem;
        }),
      };
    }),
  markSuccess: (id, url) => {
    set((s) => ({
      items: s.items.map((it) =>
        it.id === id ? { ...it, status: "success", progress: 1, url } : it
      ),
    }));
    get().cleanupIfDone();
  },
  markError: (id, message) =>
    set((s) => ({
      items: s.items.map((it) =>
        it.id === id ? { ...it, status: "error", errorMessage: message } : it
      ),
    })),
  markCanceled: (id) => {
    set((s) => ({
      items: s.items.map((it) =>
        it.id === id ? { ...it, status: "canceled" } : it
      ),
    }));
    get().cleanupIfDone();
  },
  markPaused: (id) =>
    set((s) => ({
      items: s.items.map((it) =>
        it.id === id ? { ...it, status: "paused" } : it
      ),
    })),
  setAbort: (id, abort) =>
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, abort } : it)),
    })),
  setTerminate: (id, terminate) =>
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, terminate } : it)),
    })),
  setResume: (id, resume) =>
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, resume } : it)),
    })),
  cleanupIfDone: () => {
    const { items } = get();
    const hasActive = items.some(
      (it) => it.status === "queued" || it.status === "uploading"
    );
    if (!hasActive) {
      set({ items: [] });
    }
  },
}));
