import { Button, Popover } from "@/components/primitives";
import { themeSchema } from "@/types/theme";
import * as z from "zod";
import ColorProvider from "./color-provider";
import { InfoCircle as Info } from "iconoir-react";

interface DemoComponentProps {
  theme: z.infer<typeof themeSchema>;
}

const DemoComponent: React.FC<DemoComponentProps> = ({ theme }) => {
  return (
    <div>
      <ColorProvider theme={theme}></ColorProvider>
      <div>
        <div>
          <h3 className="flex gap-3">
            <span>Card title (card text)</span>
            <Popover.Root>
              <Popover.Trigger
                type="button"
                className="inline-flex text-muted-foreground hover:text-foreground"
                aria-label="More info"
              >
                <Info className="h-4 w-4" />
              </Popover.Trigger>
              <Popover.Portal>
        <Popover.Positioner>
        <Popover.Popup>
                <p>This is a popover text</p>
              </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
            </Popover.Root>
          </h3>
          <p>
            Click the info icon to open a popover (this is muted text)
          </p>
        </div>
        <div className="space-y-3">
          <p>Hover over the ghost button to see the muted background color.</p>
          <div className="space-x-3">
            <Button type="button">primary</Button>
            <Button type="button" variant={"secondary"}>
              secondary
            </Button>
            <Button type="button" variant="secondary">
              outline
            </Button>
            <Button type="button" variant={"ghost"}>
              ghost 👻
            </Button>
            <Button type="button" variant="danger">
              destructive
            </Button>
          </div>
        </div>
      </div>
      <p>This is the background text color.</p>
      <div className="space-y-2 w-full  text-foreground *:p-2 *:rounded-lg *:max-w-sm">
        <div className="bg-status-blue text-white">Status Blue</div>
        <div className="bg-success text-success-foreground">Success</div>
        <div className="bg-warning/15 text-warning-foreground">Warning</div>
        <div className="bg-destructive text-white">Destructive Red</div>
      </div>
    </div>
  );
};

export default DemoComponent;
