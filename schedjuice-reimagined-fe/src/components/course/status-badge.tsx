import { courseStatus } from "@/types/course";
import { cn } from "@/lib/utils";

export interface StatusBadgeProps {
  status: courseStatus;
  border?: boolean;
  bg?: boolean;
  pingAnimation?: boolean;
}

const StatusBadge = ({
  status,
  border = true, //default true
  bg = true, // default true
  pingAnimation = false,
}: StatusBadgeProps) => {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-secondary relative",
        {
          "border-green-200": status === courseStatus.active,
          "border-orange-200": status === courseStatus.planned,
          "border-red-200": status === courseStatus.ended,
          "border-gray-200": status === courseStatus.paused,
        },
        {
          "h-[25px] capitalize gap-1 ": true,
          "bg-black/10  backdrop-blur-2xl":
            border && ["planned", "active", "ended", "paused"].includes(status),
          "bg-transparent": border == false,
        }
      )}
    >
      {bg && (
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-[95%] blur-xs h-[85%] rounded-full border-1 border-white"
          )}
        ></div>
      )}
      <div
        className={cn(
          {
            "h-2.5 w-2.5 rounded-full relative ": [
              "planned",
              "active",
              "ended",
              "paused",
            ].includes(status),
          },
          {
            "bg-green-500": status === "active",
            "bg-orange-500": status === "planned",
            "bg-red-500": status === "ended",
            "bg-gray-500": status === "paused",
          }
        )}
      >
        {status === "active" && pingAnimation && (
          <span className="animate-ping absolute top-0 left-0 w-full h-full rounded-full bg-green-500 "></span>
        )}
      </div>
      <div
        className={cn({
          "text-green-500 ": status === "active",
          "text-orange-500": status === "planned",
          "text-red-500 bg-transparent": status === "ended",
          "text-gray-500": status === "paused",
        })}
      >
        {status?.toLocaleLowerCase()}
      </div>
    </span>
  );
};

export default StatusBadge;
