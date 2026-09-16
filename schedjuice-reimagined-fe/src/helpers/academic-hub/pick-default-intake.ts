import type { HubIntake } from "@/hooks/academic-hub/use-intakes";

export function pickDefaultIntake(intakes: HubIntake[]): HubIntake | undefined {
  if (intakes.length === 0) return undefined;
  const today = new Date().toISOString().slice(0, 10);
  const covering = intakes.find(
    (i) =>
      i.start_date <= today && (!i.end_date || i.end_date >= today),
  );
  return covering ?? intakes[0];
}
