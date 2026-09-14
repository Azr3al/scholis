const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
] as const;

function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function composeHomeLede(sessionCount: number): string[] {
  if (sessionCount <= 0) return ["No classes scheduled today."];
  const word = capitalize(numberWord(sessionCount));
  const noun = sessionCount === 1 ? "session" : "sessions";
  return [`${word} ${noun} today.`];
}
