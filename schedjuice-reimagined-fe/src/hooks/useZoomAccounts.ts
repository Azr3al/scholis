"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  disconnectPersonalZoomOAuth,
  disconnectZoomAccount,
  fetchPersonalZoomStatus,
  fetchZoomAccountUsers,
  fetchZoomAccounts,
  reconnectPersonalZoomOAuth,
  reconnectZoomAccount,
  setZoomDefaultHost,
  startPersonalZoomOAuth,
  startZoomOAuth,
} from "@/lib/zoom-api";
import { zoomAccountType } from "@/types/zoom-account";

export const ZOOM_ACCOUNTS_QUERY_KEY = ["zoom", "accounts"] as const;
export const ZOOM_PERSONAL_STATUS_QUERY_KEY = ["zoom", "personal", "status"] as const;

export function usePersonalZoomStatus(enabled = true) {
  return useQuery({
    queryKey: ZOOM_PERSONAL_STATUS_QUERY_KEY,
    queryFn: fetchPersonalZoomStatus,
    enabled,
  });
}

export function useStartPersonalZoomOAuth() {
  return useMutation({
    mutationFn: startPersonalZoomOAuth,
    onSuccess: (authorizeUrl) => {
      window.location.assign(authorizeUrl);
    },
  });
}

export function useReconnectPersonalZoomOAuth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reconnectPersonalZoomOAuth,
    onSuccess: (authorizeUrl) => {
      window.location.assign(authorizeUrl);
      void qc.invalidateQueries({ queryKey: ZOOM_PERSONAL_STATUS_QUERY_KEY });
    },
  });
}

export function useDisconnectPersonalZoomOAuth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: disconnectPersonalZoomOAuth,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ZOOM_PERSONAL_STATUS_QUERY_KEY });
    },
  });
}

export function useZoomAccounts(enabled = true) {
  return useQuery({
    queryKey: ZOOM_ACCOUNTS_QUERY_KEY,
    queryFn: fetchZoomAccounts,
    enabled,
  });
}

export function useStartZoomOAuth() {
  return useMutation({
    mutationFn: () => startZoomOAuth(),
    onSuccess: (authorizeUrl) => {
      window.location.assign(authorizeUrl);
    },
  });
}

export function useReconnectZoomAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reconnectZoomAccount,
    onSuccess: (authorizeUrl) => {
      window.location.assign(authorizeUrl);
      void qc.invalidateQueries({ queryKey: ZOOM_ACCOUNTS_QUERY_KEY });
    },
  });
}

export function useDisconnectZoomAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: disconnectZoomAccount,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ZOOM_ACCOUNTS_QUERY_KEY });
    },
  });
}

export function useZoomAccountUsers(accountPk: number | null, open: boolean) {
  return useQuery({
    queryKey: ["zoom", "accounts", accountPk, "users"],
    queryFn: () => fetchZoomAccountUsers(accountPk!),
    enabled: Boolean(accountPk) && open,
  });
}

export function useSetZoomDefaultHost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountPk,
      defaultHostZoomUserId,
    }: {
      accountPk: number;
      defaultHostZoomUserId: string;
    }) => setZoomDefaultHost(accountPk, defaultHostZoomUserId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ZOOM_ACCOUNTS_QUERY_KEY });
    },
  });
}

export function accountLabel(a: zoomAccountType): string {
  const name = (a.account_name || "").trim();
  if (name) return name;
  return a.account_id;
}
