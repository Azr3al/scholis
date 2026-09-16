"use client";
import { Button, Dialog } from "@/components/primitives";
import { LogOut } from "iconoir-react";
import { logout } from "@/helpers/auth";

const LogoutButton = () => {
  return (
    <Dialog.Root>
      <Dialog.Trigger render={<div className="flex text-destructive items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-secondary focus:bg-secondary transition-colors">
          <LogOut className="w-5 h-5" />
          <span>Logout</span>
        </div>} />
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
        <div>
          <Dialog.Title>Are you absolutely sure?</Dialog.Title>
          <Dialog.Description>
            This action will log you out of the application.
          </Dialog.Description>
        </div>
        <div>
          <Button
            onClick={() => logout()}
            type="submit"
            className="bg-destructive hover:bg-destructive/90"
          >
            Confirm
          </Button>
        </div>
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default LogoutButton;
