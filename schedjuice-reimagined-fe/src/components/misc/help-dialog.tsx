"use client";
import { Button, Dialog, buttonVariants } from "@/components/primitives";

import { HelpCircle } from "iconoir-react";

interface HelpDialogProps {
  title: string;
  content: React.ReactNode;
}

const HelpDialog: React.FC<HelpDialogProps> = ({ title, content }) => {
  return (
    <Dialog.Root>
      <Dialog.Trigger>
        <Button variant={"ghost"} className="space-x-2" type="button">
          <HelpCircle></HelpCircle>
          <span>Help</span>
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
        <div>
          <Dialog.Title>{title}</Dialog.Title>
        </div>
        {content}
        <div>
          <Dialog.Close render={<Button>Close</Button>} />
        </div>
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default HelpDialog;
