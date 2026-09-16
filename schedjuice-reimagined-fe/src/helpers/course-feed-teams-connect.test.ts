import { describe, expect, it } from "vitest";

import { shouldPromptMicrosoftTeamsConnect } from "./course-feed-teams-connect";

describe("shouldPromptMicrosoftTeamsConnect", () => {
  it("prompts when Teams is on and Microsoft is not connected", () => {
    expect(shouldPromptMicrosoftTeamsConnect(true, true, false)).toBe(true);
  });

  it("does not prompt when Microsoft is connected", () => {
    expect(shouldPromptMicrosoftTeamsConnect(true, true, true)).toBe(false);
  });

  it("does not prompt when Post to Teams is off", () => {
    expect(shouldPromptMicrosoftTeamsConnect(true, false, false)).toBe(false);
  });

  it("does not prompt when course is not Teams-eligible", () => {
    expect(shouldPromptMicrosoftTeamsConnect(false, true, false)).toBe(false);
  });
});
