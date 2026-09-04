export const TIME_PRESETS = [60, 90, 105, 120] as const;

export const ATTEMPT_PRESETS = [1, 2, 3, 4, 5] as const;

export const formatAttemptPresetLabel = (count: number): string =>
  count === 1 ? '1 attempt' : `${String(count)} attempts`;

export const formatPresetLabel = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  let hourLabel: string;
  if (remainder === 0) {
    hourLabel = hours === 1 ? '1 hr' : `${String(hours)} hr`;
  } else {
    hourLabel =
      hours === 1
        ? `1 hr ${String(remainder)} min`
        : `${String(hours)} hr ${String(remainder)} min`;
  }
  return `${String(minutes)} min (${hourLabel})`;
};
