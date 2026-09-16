import { getDateISOString, sortEvents } from "@/helpers/date";
import {
  eventType,
  partiallyOmittedCourseSchema,
} from "@/types/course";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { v4 as uuid } from "uuid";
import { isSabbath } from "mm-cal-js";

interface CourseCreateOrUpdateState {
  isCourseAlreadyCreated: boolean;
  setIsCourseAlreadyCreated: (isCreated: boolean) => void;
  courseData: Partial<typeof partiallyOmittedCourseSchema>;
  setCourseData: (
    courseData: Partial<typeof partiallyOmittedCourseSchema>
  ) => void;

  chosenDate: Date;
  setChosenDate: (date: Date) => void;

  isEditing: boolean;
  setIsEditing: (isEditing: boolean) => void;

  events: { [date: string]: Partial<eventType>[] };
  setEvents: (events: { [date: string]: Partial<eventType>[] }) => void;
  eventFormEvent: { event: Partial<eventType> | null; isNew: boolean };
  setEventFormEvent: (event: Partial<eventType> | null, isNew: boolean) => void;
  addOrUpdateEvent: (event: Partial<eventType>) => void;
  deleteEvent: (event: Partial<eventType>) => void;

  selectedEvents: number[];
  addSelectedEvent: (eventId: number) => void;
  removeSelectedEvent: (eventId: number) => void;

  bulkAddEvents: (
    time_from: string,
    time_to: string,
    repeat_days: number[],
    isCloseOnSabbath: boolean
  ) => void;
  bulkDeleteEvents: (eventIds: number[]) => void;

  deletedEventIds: number[];
  reset: () => void;
}

const useCourseCreateUpdateStore = create(
  immer<CourseCreateOrUpdateState>((set) => ({
    isCourseAlreadyCreated: false,
    setIsCourseAlreadyCreated: (isCreated: boolean) =>
      set((state) => {
        state.isCourseAlreadyCreated = isCreated;
      }),
    courseData: {},
    setCourseData: (courseData: Partial<typeof partiallyOmittedCourseSchema>) =>
      set((state) => {
        state.courseData = { ...state.courseData, ...courseData };
      }),

    chosenDate: new Date(),
    setChosenDate: (date: Date) =>
      set((state) => {
        state.chosenDate = date;
      }),

    isEditing: false,
    setIsEditing: (isEditing: boolean) =>
      set((state) => {
        state.isEditing = isEditing;
      }),

    events: {},
    setEvents: (events: { [date: string]: Partial<eventType>[] }) =>
      set((state) => {
        state.events = events;
      }),
    eventFormEvent: { event: null, isNew: true },
    setEventFormEvent: (event: Partial<eventType> | null, isNew: boolean) =>
      set((state) => {
        state.eventFormEvent = { event, isNew };
      }),
    addOrUpdateEvent: (event: Partial<eventType>) =>
      set((state) => {
        state.isEditing = true;

        if (state.events[getDateISOString(event.date!)]?.length > 0) {
          let lst: any[] = [];
          state.events[getDateISOString(event.date!)]
            .filter((e) => e.id !== event.id)
            .map((e) => lst.push({ ...e }));
          lst.push({ ...event });
          lst = lst.sort((a, b) => sortEvents(a.time_from, b.time_from));
          state.events[getDateISOString(event.date!)] = [];
          lst.map((e) => state.events[getDateISOString(event.date!)].push(e));
        } else {
          state.events[getDateISOString(event.date!)] = [
            { ...event, id: uuid(), isNew: true },
          ];
        }
      }),
    deleteEvent: (event: Partial<eventType>) =>
      set((state) => {
        state.isEditing = true;

        if (state.events[getDateISOString(event.date!)]?.length > 0) {
          let lst: any[] = [];
          state.events[getDateISOString(event.date!)]
            .filter((e) => e.id != event.id)
            .map((e) => {
              lst.push(e);
            });

          state.events[getDateISOString(event.date!)] = [];
          lst.map((e) => state.events[getDateISOString(event.date!)].push(e));
        }
        state.removeSelectedEvent(event.id);
        state.deletedEventIds.push(event.id);
      }),

    selectedEvents: [],
    addSelectedEvent: (eventId: number) =>
      set((state) => {
        state.selectedEvents.push(eventId);
      }),
    removeSelectedEvent: (eventId: number) =>
      set((state) => {
        state.selectedEvents = state.selectedEvents.filter(
          (i) => i !== eventId
        );
      }),
    bulkAddEvents: (
      time_from: string,
      time_to: string,
      repeat_days: number[],
      isCloseOnSabbath: boolean
    ) =>
      set((state) => {
        state.isEditing = true;

        const startDate = new Date(
          state.courseData.start_date.getFullYear(),
          state.courseData.start_date.getMonth(),
          state.courseData.start_date.getDate()
        );
        while (startDate <= state.courseData.end_date) {
          if (repeat_days.includes(startDate.getDay()) && !(
            isCloseOnSabbath ? isSabbath(startDate)===1 : false
          )) {
            if (state.events[getDateISOString(startDate)]?.length > 0) {
              let lst: any[] = [];
              state.events[getDateISOString(startDate)].map((e) => lst.push(e));
              lst.push({
                date: new Date(startDate),
                title: "lecture event",
                time_from,
                time_to,
                id: uuid(),
                isNew: true,
              });
              lst = lst.sort((a, b) => sortEvents(a.time_from, b.time_from));
              state.events[getDateISOString(startDate)] = [];
              lst.map((e) => state.events[getDateISOString(startDate)].push(e));
            } else {
              state.events[getDateISOString(startDate)] = [
                {
                  date: new Date(startDate),
                  time_from,
                  time_to,
                  id: uuid(),
                  title: "lecture event",
                  isNew: true,
                },
              ];
            }
          }
          startDate.setDate(startDate.getDate() + 1);
        }
      }),
    bulkDeleteEvents: (eventIds: number[]) =>
      set((state) => {
        state.isEditing = true;
        Object.keys(state.events).map((k) => {
          let lst: any[] = [];
          state.events[k].map((e) => {
            if (!eventIds.includes(e.id)) lst.push(e);
          });
          state.events[k] = lst;
        });
        state.selectedEvents = state.selectedEvents.filter(
          (i) => !eventIds.includes(i)
        );
        eventIds.map((i) => state.deletedEventIds.push(i));
      }),
    deletedEventIds: [],

    reset: () =>
      set((state) => {
        state.isCourseAlreadyCreated = false;
        state.courseData = {};
        state.chosenDate = new Date();
        state.isEditing = false;
        state.events = {};
        state.eventFormEvent = { event: null, isNew: true };
      }),
  }))
);

export default useCourseCreateUpdateStore;
