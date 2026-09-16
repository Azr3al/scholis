"use client";
import { Button } from "@/components/primitives";

import { useState } from "react";
import { Clock, LogIn, LogOut } from "iconoir-react";
import { useCampusCheckin } from "@/hooks/useCampusCheckin";
import { CampusCheckinDialog } from "@/components/campus-checkin/campus-checkin-dialog";

export const CampusCheckinButton = () => {
  const { status, isLoading, error } = useCampusCheckin();
  const [open, setOpen] = useState(false);

  if (error || (!isLoading && !status)) {
    return null;
  }

  const canCheckOut = status?.can_check_out ?? false;
  const canCheckIn = status?.can_check_in ?? false;
  const isDoneForToday = Boolean(status) && !canCheckIn && !canCheckOut;
  const mode = canCheckOut ? "checkout" : "checkin";

  const buttonText = canCheckOut
    ? "Check Out"
    : isDoneForToday
      ? "Done for today"
      : "Check In";

  const icon = canCheckOut ? (
    <LogOut className="h-4 w-4 md:mr-2" />
  ) : isDoneForToday ? (
    <Clock className="h-4 w-4 md:mr-2" />
  ) : (
    <LogIn className="h-4 w-4 md:mr-2" />
  );

  return (
    <CampusCheckinDialog
      open={open}
      onOpenChange={setOpen}
      mode={mode}
      status={status}
    >
      <Button
        variant={isDoneForToday ? "secondary" : "primary"}
        disabled={isLoading || isDoneForToday}
        className="w-full gap-2 sm:w-auto sm:min-w-34 active:scale-[0.98]"
      >
        {icon}
        <span>{buttonText}</span>
      </Button>
    </CampusCheckinDialog>
  );
};
