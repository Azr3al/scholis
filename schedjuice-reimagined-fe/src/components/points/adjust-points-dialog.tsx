"use client";
import { Button, Dialog, Input, Select, Textarea, buttonVariants, useToast } from "@/components/primitives";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { postPointTransaction } from "@/lib/points-api";
import type { PointType } from "@/types/points";
import { isAdjustPointsSubmitDisabled } from "./adjust-points-form";

export { isAdjustPointsSubmitDisabled } from "./adjust-points-form";

export function AdjustPointsDialog({
  userId,
  userName,
  pointTypes,
  open,
  onOpenChange,
  onAdjusted,
}: {
  userId: number;
  userName?: string;
  pointTypes: PointType[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdjusted?: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const activeTypes = useMemo(
    () =>
      pointTypes
        .filter((pt) => pt.is_active)
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    [pointTypes],
  );

  const [pointTypeId, setPointTypeId] = useState<string>("");
  const [delta, setDelta] = useState("1");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedId = pointTypeId ? Number(pointTypeId) : null;
  const submitDisabled = isAdjustPointsSubmitDisabled({
    pointTypeId: selectedId,
    delta,
    note,
    saving,
  });

  function reset() {
    setPointTypeId("");
    setDelta("1");
    setNote("");
  }

  async function submit() {
    if (submitDisabled || selectedId == null) return;

    setSaving(true);
    try {
      await postPointTransaction(userId, {
        point_type_id: selectedId,
        delta: Number(delta),
        note: note.trim(),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["user-points", userId] }),
        queryClient.invalidateQueries({ queryKey: ["staff-points-sheet"] }),
      ]);
      toast.add({ title: "Points updated." });
      reset();
      onOpenChange(false);
      onAdjusted?.();
    } catch {
      toast.add({
        type: "error",
        title: "Error",
        description: "Failed to adjust points.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="max-w-md">
        <div>
          <Dialog.Title>
            Adjust points{userName ? ` — ${userName}` : ""}
          </Dialog.Title>
        </div>
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            To correct a mistake, post an offsetting entry with an explanation.
          </p>
          {activeTypes.length === 0 ? (
            <p className="text-sm text-text-muted">
              No active point types available.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <label htmlFor="adjust-point-type">Point type</label>
                <Select
                  value={pointTypeId}
                  onValueChange={setPointTypeId}
                  className="w-full"
                  placeholder="Select point type"
                  items={activeTypes.map((pt) => ({
                    value: String(pt.id),
                    label: pt.name,
                  }))}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="adjust-delta">Delta</label>
                <Input
                  id="adjust-delta"
                  type="number"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="adjust-note">Note</label>
                <Textarea
                  id="adjust-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Reason for this adjustment (required)"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={submitDisabled}>
                  {saving ? "Saving…" : "Save adjustment"}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
