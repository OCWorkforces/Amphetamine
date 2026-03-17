/** Allowlisted Meet URL prefixes */
export const MEET_URL_ALLOWLIST = [
  "https://meet.google.com/",
  "https://calendar.google.com/",
  "https://accounts.google.com/",
] as const;

/** Returns true if the URL starts with an allowlisted Google Meet domain */
export function isAllowedMeetUrl(url: string): boolean {
  return MEET_URL_ALLOWLIST.some((prefix) => url.startsWith(prefix));
}
