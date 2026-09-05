// src/app/(design)/components/_demos/overlays-demo.tsx
"use client";

import {
  AlertDialog,
  Button,
  Dialog,
  Menu,
  Popover,
  Sheet,
  ToastProvider,
  Tooltip,
  TooltipProvider,
  useToast,
} from "@/components/primitives";

function ToastDemoButton() {
  const toast = useToast();
  return (
    <Button
      variant="secondary"
      onClick={() => toast.add({ title: "Saved", description: "Your changes were saved." })}
    >
      Show toast
    </Button>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 border-b border-border py-5">{children}</div>;
}

export function OverlaysDemo() {
  return (
    <ToastProvider>
      <TooltipProvider>
        <section>
          <h2 className="mb-2 font-serif text-2xl">Overlays</h2>

          <Row>
            <Dialog.Root>
              <Dialog.Trigger render={<Button>Open dialog</Button>} />
              <Dialog.Portal>
                <Dialog.Backdrop />
                <Dialog.Popup>
                  <Dialog.Title>Edit course</Dialog.Title>
                  <Dialog.Description>Update the course details below.</Dialog.Description>
                  <div className="flex justify-end gap-2">
                    <Dialog.Close render={<Button variant="ghost">Cancel</Button>} />
                    <Dialog.Close render={<Button>Save</Button>} />
                  </div>
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>

            <AlertDialog.Root>
              <AlertDialog.Trigger render={<Button variant="danger">Delete</Button>} />
              <AlertDialog.Portal>
                <AlertDialog.Backdrop />
                <AlertDialog.Popup>
                  <AlertDialog.Title>Delete course?</AlertDialog.Title>
                  <AlertDialog.Description>This cannot be undone.</AlertDialog.Description>
                  <div className="flex justify-end gap-2">
                    <AlertDialog.Close render={<Button variant="ghost">Keep</Button>} />
                    <AlertDialog.Close render={<Button variant="danger">Delete</Button>} />
                  </div>
                </AlertDialog.Popup>
              </AlertDialog.Portal>
            </AlertDialog.Root>

            <Sheet.Root>
              <Sheet.Trigger render={<Button variant="secondary">Open sheet</Button>} />
              <Sheet.Portal>
                <Sheet.Backdrop />
                <Sheet.Popup side="right">
                  <Sheet.Title>Filters</Sheet.Title>
                  <Sheet.Description>Refine the roster.</Sheet.Description>
                  <Sheet.Close render={<Button className="mt-auto">Done</Button>} />
                </Sheet.Popup>
              </Sheet.Portal>
            </Sheet.Root>
          </Row>

          <Row>
            <Popover.Root>
              <Popover.Trigger render={<Button variant="secondary">Popover</Button>} />
              <Popover.Portal>
                <Popover.Positioner>
                  <Popover.Popup>
                    <Popover.Title className="font-medium">Quick note</Popover.Title>
                    <Popover.Description className="text-sm text-text-secondary">
                      Popovers anchor to the trigger.
                    </Popover.Description>
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>

            <Tooltip.Root>
              <Tooltip.Trigger render={<Button variant="ghost">Hover me</Button>} />
              <Tooltip.Portal>
                <Tooltip.Positioner>
                  <Tooltip.Popup>Saves automatically</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>

            <Menu.Root>
              <Menu.Trigger render={<Button variant="secondary">Menu</Button>} />
              <Menu.Portal>
                <Menu.Positioner>
                  <Menu.Popup>
                    <Menu.Item>Rename</Menu.Item>
                    <Menu.Item>Duplicate</Menu.Item>
                    <Menu.Separator />
                    <Menu.Item>Archive</Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>

            <ToastDemoButton />
          </Row>
        </section>
      </TooltipProvider>
    </ToastProvider>
  );
}
