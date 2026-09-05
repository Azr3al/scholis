"use client";

import { Dialog } from "@/components/primitives";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const rows = [
  { combo: "J or ↓", action: "Next question" },
  { combo: "K or ↑", action: "Previous question" },
  { combo: "F", action: "Mark current question for review" },
  { combo: "Ctrl / ⌘ + Enter", action: "Open review-before-submit dialog" },
  { combo: "Shift + /", action: "Open this shortcuts list" },
] as const;

export function QuizShortcutsDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="max-w-md">
          <Dialog.Title>Quiz shortcuts</Dialog.Title>
          <Dialog.Description>
            Disabled while typing in a blank or text box (except shortcuts from the list where noted).
          </Dialog.Description>
          <table className="text-text-primary w-full text-sm">
            <thead>
              <tr className="border-b text-left text-text-muted">
                <th className="pb-2 pr-3 font-medium">Shortcut</th>
                <th className="pb-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.action} className="border-border border-b">
                  <td className="py-2 pr-3 font-mono text-xs">{r.combo}</td>
                  <td className="py-2">{r.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
