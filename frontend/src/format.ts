/** Duration as m:ss, matching the mockup's "0:42" and "24:31". */
export function formatDuration(seconds: number | null): string {
  if (seconds == null) {
    return '--:--';
  }
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/**
 * "Aug 18" for this year, "Aug 18, 2025" otherwise -- the year is only worth
 * the space once it is ambiguous.
 */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}
