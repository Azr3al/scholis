import { describe, expect, it } from "vitest";
import { bindAwardPreview, readMainTeacher, readMainTeacherName } from "./bind-award-preview";

describe("bindAwardPreview", () => {
  it("passes student, course, and title through", () => {
    const binder = bindAwardPreview({
      studentName: "Alex Rivera",
      courseName: "Year 10 Maths",
      awardTitle: "Top 1",
    });
    expect(binder.studentName).toBe("Alex Rivera");
    expect(binder.courseName).toBe("Year 10 Maths");
    expect(binder.awardTitle).toBe("Top 1");
  });

  it("defaults omitted photo and gender to null", () => {
    const binder = bindAwardPreview({
      studentName: "Sam",
      courseName: "Art",
      awardTitle: "Effort",
    });
    expect(binder.awardImageUrl).toBeNull();
    expect(binder.gender).toBeNull();
    expect(binder.mtName).toBe("");
    expect(binder.mtSignatureUrl).toBeNull();
    expect(binder.namedUsers).toEqual({});
  });

  it("keeps an explicit photo url and gender", () => {
    const binder = bindAwardPreview({
      studentName: "Sam",
      courseName: "Art",
      awardTitle: "Effort",
      awardImageUrl: "https://img/award.png",
      gender: "FEMALE",
    });
    expect(binder.awardImageUrl).toBe("https://img/award.png");
    expect(binder.gender).toBe("FEMALE");
  });

  it("passes through an explicit main teacher name", () => {
    const binder = bindAwardPreview({
      studentName: "Sam",
      courseName: "Art",
      awardTitle: "Effort",
      mtName: "admin",
    });
    expect(binder.mtName).toBe("admin");
  });

  it("passes through an explicit main teacher signature url", () => {
    const binder = bindAwardPreview({
      studentName: "Sam",
      courseName: "Art",
      awardTitle: "Effort",
      mtName: "Daw Su",
      mtSignatureUrl: "https://cdn.example/mt.png",
    });
    expect(binder.mtName).toBe("Daw Su");
    expect(binder.mtSignatureUrl).toBe("https://cdn.example/mt.png");
  });

  it("reads the first main teacher name from a user-courses roster", () => {
    expect(
      readMainTeacherName({
        data: {
          data: [
            { user: { name: "admin" } },
            { user: { name: "Other" } },
          ],
        },
      }),
    ).toBe("admin");
    expect(readMainTeacherName({ data: { data: [] } })).toBe("");
    expect(readMainTeacherName({ data: { data: [{ user: {} }] } })).toBe("");
    expect(readMainTeacherName(undefined)).toBe("");
  });

  it("reads the first main teacher signature url from a user-courses roster", () => {
    expect(
      readMainTeacher({
        data: {
          data: [
            {
              user: {
                name: "Daw Su",
                user_signature_url: "https://cdn.example/mt.png",
              },
            },
            { user: { name: "Other", user_signature_url: "https://other.png" } },
          ],
        },
      }),
    ).toEqual({
      name: "Daw Su",
      signatureUrl: "https://cdn.example/mt.png",
    });
    expect(
      readMainTeacher({ data: { data: [{ user: { name: "admin" } }] } }),
    ).toEqual({ name: "admin", signatureUrl: null });
    expect(readMainTeacher({ data: { data: [] } })).toEqual({
      name: "",
      signatureUrl: null,
    });
  });

  it("fills period and currentDate with a non-empty date string", () => {
    const binder = bindAwardPreview({
      studentName: "Sam",
      courseName: "Art",
      awardTitle: "Effort",
    });
    expect(binder.period.length).toBeGreaterThan(0);
    expect(binder.currentDate.length).toBeGreaterThan(0);
    expect(binder.currentDate).toMatch(/\d{4}/);
  });
});
