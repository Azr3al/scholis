import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/hooks/useUser";
import { useTenant } from "@/hooks/useTenant";
import { fetchEntity } from "@/app/client-api/utils";
import { buildIdCard } from "@/lib/id-card/build-id-card";
import { buildVerifyUrl } from "@/lib/id-card/verify-url";
import { generateQrDataUrl } from "@/lib/id-card/qr";
import type { CardViewModel } from "@/lib/id-card/types";
import type { accountType } from "@/types/user";

type UseIdCardResult = {
  vm: CardViewModel | null;
  qrDataUrl: string;
  isLoading: boolean;
  isError: boolean;
};

/** `userId` defaults to the current viewer (self-service). */
export function useIdCard(userId?: number): UseIdCardResult {
  const { user: viewer } = useUser();
  const { tenant } = useTenant();
  const targetId = userId ?? viewer?.id;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["id-card-user", targetId],
    enabled: Boolean(targetId),
    queryFn: () => fetchEntity("users", targetId as number),
  });

  const account = (data?.data?.data ?? null) as accountType | null;
  const vm = account && tenant ? buildIdCard(account, tenant) : null;

  const [qrDataUrl, setQrDataUrl] = useState("");
  useEffect(() => {
    if (!vm || (!vm.verifyCode && !vm.verifyToken)) {
      setQrDataUrl("");
      return;
    }
    const url = buildVerifyUrl(window.location.origin, vm);
    let active = true;
    generateQrDataUrl(url).then((next) => {
      if (active) setQrDataUrl(next);
    });
    return () => {
      active = false;
    };
  }, [vm?.verifyCode, vm?.verifyToken]);

  return { vm, qrDataUrl, isLoading, isError };
}
