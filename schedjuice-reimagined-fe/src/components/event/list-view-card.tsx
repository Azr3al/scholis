import React from "react";
import { formatDate } from "@/helpers/date";

export interface EventCardProps {
  date: Date;
  time_from: string;
  time_to: string;
  room?: string;
  event_title: string;
}

export const EventCard: React.FC<EventCardProps> = ({
  date,
  time_from,
  time_to,
  room,
  event_title,
}) => {
  const isToday = () => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const indicatorColor = isToday() ? "bg-green-500" : "bg-gray-500";

  return (
    <div className="flex items-center bg-card border border-border/30 rounded-lg overflow-hidden hover:shadow-sm transition-shadow h-16">
      <div className={`w-1 h-full ${indicatorColor} flex-shrink-0`} />

      <div className="flex items-center justify-between w-full px-4 gap-6">
        <div className="flex items-center gap-4 min-w-0">
          <span className="text-sm font-medium text-foreground min-w-[90px]">
            {formatDate(date, "EEEE")}
          </span>
          <span className="text-sm text-foreground min-w-[90px]">
            {formatDate(date, "dd/MM/yyyy")}
          </span>
          <span className="inline-flex items-center justify-center px-3 py-1 rounded-md bg-blue-100 text-blue-600 text-xs font-medium  min-w-[90px]">
            {event_title}
          </span>

          <div className="flex flex-col px-3 min-w-[140px]">
            <span className="text-sm text-foreground ">
              {time_to ? `${time_from} - ${time_to}` : time_from}
            </span>
            {room && <span className="text-xs text-gray-600">{room}</span>}
          </div>
        </div>
      </div>
    </div>
  );
};
