// bytes format for storage
export const formatBytes = (size: number | null | undefined) => {
  const n = size || 0;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let s = n;
  let u = 0;
  while (s >= 1024 && u < units.length - 1) {
    s /= 1024;
    u++;
  }
  return `${s.toFixed(s < 10 && u > 0 ? 1 : 0)} ${units[u]}`;
};
