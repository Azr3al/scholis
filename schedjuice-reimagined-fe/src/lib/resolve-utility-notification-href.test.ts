import { describe, expect, it } from "vitest";
import { resolveUtilityNotificationHref } from "./resolve-utility-notification-href";

describe("resolveUtilityNotificationHref", () => {
  describe("known routes", () => {
    it("resolves /class/course/[id] with id", () => {
      expect(
        resolveUtilityNotificationHref("/class/course/[id]", { id: 42 })
      ).toBe("/courses/42");
    });

    it("resolves /class/course/[id] with courseId", () => {
      expect(
        resolveUtilityNotificationHref("/class/course/[id]", {
          courseId: "abc-123",
        })
      ).toBe("/courses/abc-123");
    });

    it("returns null for /class/course/[id] without course id", () => {
      expect(
        resolveUtilityNotificationHref("/class/course/[id]", {})
      ).toBeNull();
    });

    it("resolves /class/course/assignment/[id]", () => {
      expect(
        resolveUtilityNotificationHref("/class/course/assignment/[id]", {
          id: 7,
        })
      ).toBe("/assignments/7");
    });

    it("returns null for /class/course/assignment/[id] without id", () => {
      expect(
        resolveUtilityNotificationHref("/class/course/assignment/[id]", {})
      ).toBeNull();
    });

    it("resolves /class/course/[id]/announcement/[announcementId]", () => {
      expect(
        resolveUtilityNotificationHref(
          "/class/course/[id]/announcement/[announcementId]",
          { id: 1, announcementId: 99 }
        )
      ).toBe("/announcements/99");
    });

    it("returns null for announcement route without announcementId", () => {
      expect(
        resolveUtilityNotificationHref(
          "/class/course/[id]/announcement/[announcementId]",
          { id: 1 }
        )
      ).toBeNull();
    });

    it("resolves /class/course/attendance/marking/[eventIndex]", () => {
      expect(
        resolveUtilityNotificationHref(
          "/class/course/attendance/marking/[eventIndex]",
          { id: 5, eventIndex: 2 }
        )
      ).toBe("/courses/5/attendance/marking/2");
    });

    it("resolves attendance marking with courseId", () => {
      expect(
        resolveUtilityNotificationHref(
          "/class/course/attendance/marking/[eventIndex]",
          { courseId: "c-1", eventIndex: 0 }
        )
      ).toBe("/courses/c-1/attendance/marking/0");
    });

    it("returns null for attendance marking without course id", () => {
      expect(
        resolveUtilityNotificationHref(
          "/class/course/attendance/marking/[eventIndex]",
          { eventIndex: 2 }
        )
      ).toBeNull();
    });

    it("returns null for attendance marking without eventIndex", () => {
      expect(
        resolveUtilityNotificationHref(
          "/class/course/attendance/marking/[eventIndex]",
          { id: 5 }
        )
      ).toBeNull();
    });

    it("resolves /crm/issues with issue query param", () => {
      expect(
        resolveUtilityNotificationHref("/crm/issues", { issue: 12 })
      ).toBe("/crm/issues?issue=12");
    });

    it("resolves /crm/issues without issue param", () => {
      expect(resolveUtilityNotificationHref("/crm/issues", {})).toBe("/crm/issues");
    });

    it("resolves /complaints/[id]", () => {
      expect(
        resolveUtilityNotificationHref("/complaints/[id]", { id: 8 })
      ).toBe("/complaints/8");
    });

    it("returns null for /complaints/[id] without id", () => {
      expect(resolveUtilityNotificationHref("/complaints/[id]", {})).toBeNull();
    });
  });

  describe("generic fallback", () => {
    it("substitutes bracket segments from params", () => {
      expect(
        resolveUtilityNotificationHref("/custom/[foo]/[bar]", {
          foo: "a",
          bar: "b",
        })
      ).toBe("/custom/a/b");
    });

    it("appends extra params as query string", () => {
      expect(
        resolveUtilityNotificationHref("/custom/[id]", {
          id: 10,
          tab: "details",
        })
      ).toBe("/custom/10?tab=details");
    });

    it("returns path with query only when no bracket segments match", () => {
      expect(
        resolveUtilityNotificationHref("/reports/summary", {
          month: "2026-05",
          active: true,
        })
      ).toBe("/reports/summary?month=2026-05&active=true");
    });

    it("returns null when unresolved bracket segments remain", () => {
      expect(
        resolveUtilityNotificationHref("/custom/[id]/[missing]", { id: 1 })
      ).toBeNull();
    });

    it("skips null and undefined param values", () => {
      expect(
        resolveUtilityNotificationHref("/custom/[id]", {
          id: null,
          extra: undefined,
        })
      ).toBeNull();
    });

  });
});
