import { createContext, useContext } from "react";
import { CalendarView, RecurringMode } from "./types";
import { FormattedEvents } from "@/helpers/calendar";
import { courseType, eventType } from "@/types/course";
import type { OverlapMergeEntry } from "@/types/course-schedule";
interface CalendarContextType {
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
  currentView: CalendarView;
  setCurrentView: (view: CalendarView) => void;
  days: Date[];
  events: FormattedEvents;
  setEvents?: (events: eventType[]) => void;
  areEventsSelectable: boolean;
  onEventClick?: (event: eventType) => void;
  selectedEvents?: eventType[];
  recurringMode: RecurringMode;
  setRecurringMode: (mode: RecurringMode) => void;
  setSelectedEvents?: (events: eventType[]) => void;
  showableViews: CalendarView[];
  isEventAddOrEditMode: boolean;
  selectedEvent: eventType | null;
  setSelectedEvent: (event: eventType | null) => void;
  course: courseType | null;
  showRecurringMode: boolean;
  isInEventSelectionMode: boolean;
  setIsInEventSelectionMode: (isInEventSelectionMode: boolean) => void;
  setCourse?: (course: courseType) => void;
  isLoading?: boolean;
  renderEvent?: (event: eventType) => React.ReactNode;
  pendingOverlapMerges: OverlapMergeEntry[];
  setPendingOverlapMerges: (entries: OverlapMergeEntry[]) => void;
  mergePendingOverlapMerges: (entries: OverlapMergeEntry[]) => void;
}

export const CalendarContext = createContext<CalendarContextType | undefined>(undefined);

export const useCalendar = () => {
  const context = useContext(CalendarContext);
  if (!context) {
    throw new Error('useCalendar must be used within a CalendarProvider');
  }
  return context;
}; 