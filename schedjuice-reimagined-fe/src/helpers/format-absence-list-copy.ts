export function formatAbsenceListDate(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return ymd;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export function formatAbsenceListCopy(params: {
  className: string;
  dateYmd: string;
  presentCount: number;
  totalCount: number;
  presentPercent: number;
  studentNames: string[];
}): string {
  const date = formatAbsenceListDate(params.dateYmd);
  const header = `${params.className} ${date}`.trim();
  const summary = `${params.presentCount} out of ${params.totalCount} (${params.presentPercent}%)`;
  const lines = [header, summary, "absent list"];
  for (const name of params.studentNames) {
    lines.push(`- ${name}`);
  }
  return lines.join("\n");
}
