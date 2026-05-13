export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  const abs = Math.abs(bytes);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = abs;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  const sign = bytes < 0 ? "-" : "";
  return `${sign}${v < 10 && u > 0 ? v.toFixed(1) : Math.round(v)} ${units[u]}`;
}
