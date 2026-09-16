"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  disconnectPersonalMicrosoftOAuth,
  disconnectServiceMicrosoftOAuth,
  fetchPersonalMicrosoftStatus,
  fetchServiceMicrosoftStatus,
  reconnectPersonalMicrosoftOAuth,
  reconnectServiceMicrosoftOAuth,
  startPersonalMicrosoftOAuth,
  startServiceMicrosoftOAuth,
} from "@/app/client-api/microsoft";

export const MS_PERSONAL_STATUS_QUERY_KEY = [
  "microsoft",
  "personal",
  "status",
] as const;
export const MS_SERVICE_STATUS_QUERY_KEY = [
  "microsoft",
  "service",
  "status",
] as const;

function authorizeUrlFromResponse(res: { data: { authorize_url?: string } }) {
  const url = res.data?.authorize_url;
  if (!url) {
    throw new Error("No authorize URL returned.");
  }
  return url;
}

export function usePersonalMicrosoftStatus(enabled = true) {
  return useQuery({
    queryKey: MS_PERSONAL_STATUS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetchPersonalMicrosoftStatus();
      return res.data.data;
    },
    enabled,
  });
}

export function useStartPersonalMicrosoftOAuth() {
  return useMutation({
    mutationFn: async (opts?: { returnPath?: string }) => {
      const res = await startPersonalMicrosoftOAuth(opts);
      return authorizeUrlFromResponse(res);
    },
    onSuccess: (authorizeUrl) => {
      window.location.assign(authorizeUrl);
    },
  });
}

export function useReconnectPersonalMicrosoftOAuth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opts?: { returnPath?: string }) => {
      const res = await reconnectPersonalMicrosoftOAuth(opts);
      return authorizeUrlFromResponse(res);
    },
    onSuccess: (authorizeUrl) => {
      window.location.assign(authorizeUrl);
      void qc.invalidateQueries({ queryKey: MS_PERSONAL_STATUS_QUERY_KEY });
    },
  });
}

export function useDisconnectPersonalMicrosoftOAuth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await disconnectPersonalMicrosoftOAuth();
      return res.data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: MS_PERSONAL_STATUS_QUERY_KEY });
    },
  });
}

export function useServiceMicrosoftStatus(
  enabled = true,
  organizationId?: number | string,
) {
  return useQuery({
    queryKey: serviceStatusQueryKey(organizationId),
    queryFn: async () => {
      const res = await fetchServiceMicrosoftStatus(organizationId);
      return res.data.data;
    },
    enabled,
  });
}

export function serviceStatusQueryKey(organizationId?: number | string) {
  return organizationId != null
    ? [...MS_SERVICE_STATUS_QUERY_KEY, organizationId]
    : MS_SERVICE_STATUS_QUERY_KEY;
}

export type ServiceMicrosoftOAuthVars = {
  organizationId?: number | string;
  returnPath?: string;
};

export function useStartServiceMicrosoftOAuth() {
  return useMutation({
    mutationFn: async (vars: ServiceMicrosoftOAuthVars = {}) => {
      const res = await startServiceMicrosoftOAuth(vars);
      return authorizeUrlFromResponse(res);
    },
    onSuccess: (authorizeUrl) => {
      window.location.assign(authorizeUrl);
    },
  });
}

export function useReconnectServiceMicrosoftOAuth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: ServiceMicrosoftOAuthVars = {}) => {
      const res = await reconnectServiceMicrosoftOAuth(vars);
      return authorizeUrlFromResponse(res);
    },
    onSuccess: (authorizeUrl, vars) => {
      window.location.assign(authorizeUrl);
      void qc.invalidateQueries({
        queryKey: serviceStatusQueryKey(vars?.organizationId),
      });
    },
  });
}

export function useDisconnectServiceMicrosoftOAuth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (organizationId?: number | string) => {
      const res = await disconnectServiceMicrosoftOAuth(organizationId);
      return res.data.data;
    },
    onSuccess: (_data, organizationId) => {
      void qc.invalidateQueries({
        queryKey: serviceStatusQueryKey(organizationId),
      });
    },
  });
}
