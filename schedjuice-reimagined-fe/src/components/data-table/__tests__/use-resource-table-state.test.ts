import { describe, expect, it } from "vitest";
import {
  createResourceTableState,
  resourceTableUrlKeys,
} from "../use-resource-table-state";

describe("createResourceTableState", () => {
  it("updates page and q without colliding namespaces", () => {
    const campuses = createResourceTableState({ namespace: "campuses" });
    const courses = createResourceTableState({ namespace: "courses" });

    const nextCampuses = campuses.setState({ page: 2, q: "main" });
    const nextCourses = courses.setState({ page: 5, q: "math" });

    expect(nextCampuses.page).toBe(2);
    expect(nextCampuses.q).toBe("main");
    expect(nextCampuses.namespace).toBe("campuses");

    expect(nextCourses.page).toBe(5);
    expect(nextCourses.q).toBe("math");
    expect(nextCourses.namespace).toBe("courses");

    expect(resourceTableUrlKeys("campuses")).not.toEqual(
      resourceTableUrlKeys("courses"),
    );
  });

  it("does not share sorts/filters refs across instances after init", () => {
    const seedSorts = ["name"];
    const seedFilters = { active: true };

    const a = createResourceTableState({
      namespace: "campuses",
      initial: { sorts: seedSorts, filters: seedFilters },
    });
    const b = createResourceTableState({
      namespace: "courses",
      initial: { sorts: seedSorts, filters: seedFilters },
    });
    const c = createResourceTableState({ namespace: "rooms" });

    expect(a.sorts).not.toBe(b.sorts);
    expect(a.filters).not.toBe(b.filters);
    expect(a.sorts).not.toBe(seedSorts);
    expect(a.filters).not.toBe(seedFilters);
    expect(c.sorts).not.toBe(a.sorts);
    expect(c.filters).not.toBe(a.filters);

    a.sorts.push("code");
    a.filters.region = "west";
    expect(b.sorts).toEqual(["name"]);
    expect(b.filters).toEqual({ active: true });
    expect(c.sorts).toEqual([]);
    expect(c.filters).toEqual({});
  });
});
