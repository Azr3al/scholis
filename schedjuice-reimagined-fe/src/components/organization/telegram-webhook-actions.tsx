"use client";
import { AlertDialog, Button, buttonVariants, useToast } from "@/components/primitives";

import { reRegisterTelegramWebhook } from "@/app/client-api/telegram";
import { useMutation } from "@tanstack/react-query";

type TelegramWebhookActionsProps = {
  isTelegramOn: boolean;
  telegramBotUsername?: string | null;
};

export function TelegramWebhookActions({
  isTelegramOn,
  telegramBotUsername,
}: TelegramWebhookActionsProps) {
  const toast = useToast();

  const reRegisterMutation = useMutation({
    mutationFn: (rotateCredentials: boolean) =>
      reRegisterTelegramWebhook(rotateCredentials),
    onSuccess: () => {
      toast.add({
        description: "Telegram webhook re-registered successfully.",
      });
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.add({
        type: "error",
        description:
          error.response?.data?.message ??
          "Could not re-register the Telegram webhook.",
      });
    },
  });

  if (!isTelegramOn || !telegramBotUsername) {
    return null;
  }

  const isLoading = reRegisterMutation.isPending;

  return (
    <div className="space-y-3 rounded-md border border-dashed p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Webhook delivery</p>
        <p className="text-sm text-muted-foreground">
          Re-register syncs Telegram to this server using your current webhook
          credentials. Use rotate only if the routing key may be stale or leaked
          after a database restore.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isLoading}
          isLoading={isLoading && reRegisterMutation.variables === false}
          onClick={() => reRegisterMutation.mutate(false)}
        >
          Re-register webhook
        </Button>
        <AlertDialog.Root>
          <AlertDialog.Trigger render={<Button
              type="button"
              variant="secondary" size="sm"
              disabled={isLoading}
            >
              Rotate webhook credentials
            </Button>} />
          <AlertDialog.Portal>
        <AlertDialog.Backdrop />
        <AlertDialog.Popup>
            <div>
              <AlertDialog.Title>Rotate webhook credentials?</AlertDialog.Title>
              <AlertDialog.Description>
                This generates a new routing key and secret, then registers them
                with Telegram. The old webhook URL stops working immediately until
                registration completes.
              </AlertDialog.Description>
            </div>
            <div>
              <AlertDialog.Close>Cancel</AlertDialog.Close>
              <Button
                variant="danger" disabled={isLoading}
                isLoading={isLoading && reRegisterMutation.variables === true}
                onClick={() => reRegisterMutation.mutate(true)}
              >
                Rotate credentials
              </Button>
            </div>
          </AlertDialog.Popup>
      </AlertDialog.Portal>
        </AlertDialog.Root>
      </div>
    </div>
  );
}
