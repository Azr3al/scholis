import { describe, expect, it } from "vitest";
import {
  buildIdCard,
  buildIdCardFromDataSheetRow,
  buildIdCardPreview,
} from "./build-id-card";
import { DEFAULT_STAFF_ACCENT, DEFAULT_STUDENT_ACCENT } from "./types";

const account = (over: Record<string, unknown> = {}) =>
  ({
    name: "Thiri Kyaw",
    email: "thiri@example.com",
    phone_number: "+95 9 700000000",
    roles: ["teacher"],
    profile_image: null,
    profile_image_url: null,
    id_photo_url: null,
    blood_type: null,
    emergency_contact_name: null,
    emergency_contact_phone_number: null,
    emergency_contact_relationship: null,
    id_verify_token: "tok_abc",
    id_verify_code: "v_abc12345",
    ...over,
  }) as never;

const tenant = (over: Record<string, unknown> = {}) =>
  ({ name: "Schedjuice Education", logo: "/logo.png", ...over }) as never;

const sheetRow = (over: Record<string, unknown> = {}) =>
  ({
    id: 1,
    name: "Thiri Kyaw",
    code: "S001",
    has_id_photo: true,
    blood_type: "O+",
    id_verify_token: "tok_abc",
    id_verify_code: "v_abc12345",
    id_card_class_name: null,
    id_card_class_display: null,
    communication_email: "thiri@example.com",
    emergency_contact_name: "Su Su",
    emergency_contact_phone_number: "+95 9 711111111",
    emergency_contact_relationship: "Sister",
    nrc_passport: null,
    date_of_birth: null,
    gender: null,
    region: null,
    roles: ["teacher"],
    ...over,
  }) as never;

describe("buildIdCardFromDataSheetRow", () => {
  it("forces student audience even when row has staff roles", () => {
    const vm = buildIdCardFromDataSheetRow(
      sheetRow({ roles: ["admin"] }),
      tenant(),
      "student",
    );
    expect(vm.role).toBe("student");
    expect(vm.roleLabel).toBe("Student");
  });

  it("buildIdCardFromDataSheetRow resolves class from sheet row override", () => {
    const vm = buildIdCardFromDataSheetRow(
      sheetRow({
        roles: ["student"],
        code: "S001",
        id_card_class_name: "Year 2",
        id_card_class_display: "Year 1",
      }),
      tenant(),
      "student",
    );
    expect(vm.className).toBe("Year 2");
    expect(vm.studentId).toBe("S001");
  });

  it("buildIdCardFromDataSheetRow uses display when override is null", () => {
    const vm = buildIdCardFromDataSheetRow(
      sheetRow({
        roles: ["student"],
        id_card_class_name: null,
        id_card_class_display: "Year 1",
      }),
      tenant(),
      "student",
    );
    expect(vm.className).toBe("Year 1");
  });
});

describe("buildIdCard", () => {

  it("maps verifyCode and verifyToken from account", () => {
    const vm = buildIdCard(account(), tenant());
    expect(vm.verifyToken).toBe("tok_abc");
    expect(vm.verifyCode).toBe("v_abc12345");
  });

  it("maps studentId and className for student cards", () => {
    const vm = buildIdCard(
      account({
        roles: ["student"],
        code: " S001 ",
        id_card_class_display: "Year 1",
      }),
      tenant(),
    );
    expect(vm.studentId).toBe("S001");
    expect(vm.className).toBe("Year 1");
  });

  it("omits studentId and className on staff cards", () => {
    const vm = buildIdCard(
      account({
        roles: ["teacher"],
        code: "T001",
        id_card_class_display: "Year 1",
      }),
      tenant(),
    );
    expect(vm.studentId).toBeNull();
    expect(vm.className).toBeNull();
  });

  it("prefers id_photo_url, then profile_image_url, then profile_image", () => {
    expect(
      buildIdCard(account({ id_photo_url: "a", profile_image_url: "b" }), tenant())
        .photoUrl,
    ).toBe("a");
    expect(
      buildIdCard(account({ profile_image_url: "b", profile_image: "c" }), tenant())
        .photoUrl,
    ).toBe("b");
    expect(buildIdCard(account({ profile_image: "c" }), tenant()).photoUrl).toBe("c");
    expect(buildIdCard(account(), tenant()).photoUrl).toBeNull();
  });

  it("uses tenant accent + org-name/logo overrides when present", () => {
    const vm = buildIdCard(
      account(),
      tenant({
        id_card_staff_accent: "#123456",
        id_card_org_name: "SDEC",
        id_card_logo: "/brand.png",
      }),
    );
    expect(vm.accent).toBe("#123456");
    expect(vm.orgName).toBe("SDEC");
    expect(vm.orgLogoUrl).toBe("/brand.png");
  });

  it("includes emergency only when a phone exists", () => {
    expect(buildIdCard(account(), tenant()).emergency).toBeNull();
    const vm = buildIdCard(
      account({
        emergency_contact_phone_number: "+95 9 711111111",
        emergency_contact_name: "Su Su",
        emergency_contact_relationship: "Sister",
      }),
      tenant(),
    );
    expect(vm.emergency).toEqual({
      name: "Su Su",
      phone: "+95 9 711111111",
      relationship: "Sister",
    });
  });

  it("picks the highest-priority staff role for the title", () => {
    expect(
      buildIdCard(account({ roles: ["teacher", "manager"] }), tenant()).roleLabel,
    ).toBe("Manager");
  });
});

describe("buildIdCardPreview", () => {
  it("forces student role and student accent regardless of account roles", () => {
    const vm = buildIdCardPreview(
      account({ roles: ["admin"] }),
      tenant({ id_card_student_accent: "#ff0000" }),
      "student",
    );
    expect(vm.role).toBe("student");
    expect(vm.roleLabel).toBe("Student");
    expect(vm.accent).toBe("#ff0000");
  });

  it("forces staff role and staff accent regardless of account roles", () => {
    const vm = buildIdCardPreview(
      account({ roles: ["student"] }),
      tenant({ id_card_staff_accent: "#00ff00" }),
      "staff",
    );
    expect(vm.role).toBe("staff");
    expect(vm.roleLabel).toBe("Teacher");
    expect(vm.accent).toBe("#00ff00");
  });

  it("uses sample student ID and class for staff viewers in student preview", () => {
    const vm = buildIdCardPreview(
      account({ roles: ["admin"], code: null, id_card_class_display: null }),
      tenant(),
      "student",
    );
    expect(vm.studentId).toBe("S001");
    expect(vm.className).toBe("Year 1");
  });

  it("keeps real student ID and class when present in student preview", () => {
    const vm = buildIdCardPreview(
      account({
        roles: ["student"],
        code: "STU-42",
        id_card_class_display: "Grade 7",
      }),
      tenant(),
      "student",
    );
    expect(vm.studentId).toBe("STU-42");
    expect(vm.className).toBe("Grade 7");
  });
});
