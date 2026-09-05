"use client";

import { useState } from "react";
import { LogOut } from "iconoir-react";
import { AnimatePresence, motion } from "motion/react";
import { AlertDialog } from "@/components/primitives/alert-dialog";
import { Button } from "@/components/primitives/button";
import { crossfade } from "@/lib/sj/motion";
import { logout } from "@/helpers/auth";
import { SettingsPaneSwitcher } from "@/components/record/settings/settings-pane-switcher";
import { useSettingsPane } from "@/components/record/settings/use-settings-pane";
import { AppearancePane } from "@/components/record/settings/appearance-pane";
import { PasswordPane } from "@/components/record/settings/password-pane";

export function RecordSettings({ userId }: { userId: string }) {
  const { pane, setPane } = useSettingsPane();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="sj-root flex flex-col gap-8">
      <header className="space-y-1">
        <h2 className="font-serif text-2xl text-text-primary">Settings</h2>
        <p className="text-sm text-text-muted">Manage your account preferences.</p>
      </header>

      <SettingsPaneSwitcher pane={pane} onPaneChange={setPane} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pane}
          variants={crossfade}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {pane === "appearance" ? (
            <AppearancePane userId={userId} />
          ) : (
            <PasswordPane />
          )}
        </motion.div>
      </AnimatePresence>

      <div className="border-t border-border pt-6 md:hidden">
        <Button variant="danger" onClick={() => setConfirmOpen(true)}>
          <LogOut width={16} height={16} aria-hidden />
          Log out
        </Button>
      </div>

      <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup>
            <AlertDialog.Title>Log out?</AlertDialog.Title>
            <AlertDialog.Description>
              You will be returned to the sign-in screen.
            </AlertDialog.Description>
            <div className="mt-2 flex justify-end gap-2">
              <AlertDialog.Close render={<Button variant="ghost">Cancel</Button>} />
              <Button variant="danger" onClick={() => logout()}>
                Log out
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
