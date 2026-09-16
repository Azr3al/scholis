import { Button, buttonVariants } from "@/components/primitives";
import { NavArrowLeft as ArrowLeft } from "iconoir-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface IAdaptiveBackButton {
  to: string;
}

const AdaptiveBackButton: React.FC<IAdaptiveBackButton> = ({ to }) => {
  return (
    <Link
      href={to}
      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8 w-8 p-0")}
    >
      <ArrowLeft aria-hidden />
    </Link>
  );
};

export default AdaptiveBackButton;
