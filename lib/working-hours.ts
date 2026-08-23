import type { ICountry, IShedule } from "@/types/country";

/** IANA TZ for corridor countries — weekday/hours are those of the corridor, not the phone. */
const COUNTRY_TIME_ZONES: Record<string, string> = {
  ru: "Europe/Moscow",
  civ: "Africa/Abidjan",
  sen: "Africa/Dakar",
  cam: "Africa/Douala",
  cg: "Africa/Brazzaville",
};

const WEEKDAY_TO_JS: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

export function timeZoneForCountryCode(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return COUNTRY_TIME_ZONES[code.toLowerCase()];
}

export function getClockInTimeZone(
  timeZone?: string,
  date = new Date(),
): { day: number; hour: number } {
  if (!timeZone) {
    return { day: date.getDay(), hour: date.getHours() };
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hourRaw = parts.find((p) => p.type === "hour")?.value ?? "0";
  const day = WEEKDAY_TO_JS[weekday.slice(0, 3).toLowerCase()];
  const hour = Number(hourRaw);

  return {
    day: Number.isInteger(day) ? day : date.getDay(),
    hour: Number.isFinite(hour) ? hour : date.getHours(),
  };
}

/**
 * True when the corridor clock is outside working weekdays (0–6) or hours.
 * `workingDate` uses the same 0=Sunday … 6=Saturday as `Date.getDay()`.
 */
export function isOutsideWorkingSchedule(
  shedule: IShedule | null | undefined,
  timeZone?: string,
  date = new Date(),
): boolean {
  if (
    !shedule ||
    !Array.isArray(shedule.workingDate) ||
    shedule.workingDate.length === 0
  ) {
    return false;
  }

  const { day, hour } = getClockInTimeZone(timeZone, date);
  const isWorkingDay = shedule.workingDate.includes(day);
  const from = Number(shedule.workingFrom);
  const to = Number(shedule.workingTo);
  const isWorkingHour =
    Number.isFinite(from) && Number.isFinite(to) && hour >= from && hour < to;

  return !isWorkingDay || !isWorkingHour;
}

export type ScheduleBlockReason = "closed-day" | "closed-hours";

/** Why the corridor is closed right now, or null if it is open. */
export function getScheduleBlockReason(
  shedule: IShedule | null | undefined,
  timeZone?: string,
  date = new Date(),
): ScheduleBlockReason | null {
  if (
    !shedule ||
    !Array.isArray(shedule.workingDate) ||
    shedule.workingDate.length === 0
  ) {
    return null;
  }

  const { day, hour } = getClockInTimeZone(timeZone, date);
  if (!shedule.workingDate.includes(day)) return "closed-day";

  const from = Number(shedule.workingFrom);
  const to = Number(shedule.workingTo);
  const isWorkingHour =
    Number.isFinite(from) && Number.isFinite(to) && hour >= from && hour < to;

  return isWorkingHour ? null : "closed-hours";
}

export function resolveTransferSchedule(
  countries: ICountry[],
  originCode: string | undefined,
  destinationCode: string | undefined,
  userCountry?: ICountry,
): IShedule | undefined {
  const list = countries ?? [];
  const origin = list.find((c) => c.name === originCode);
  const destination = list.find((c) => c.name === destinationCode);
  const russia = list.find((c) => c.name === "ru");

  return (
    origin?.shedule ??
    destination?.shedule ??
    russia?.shedule ??
    userCountry?.shedule
  );
}

export function formatScheduleHour(hour: number) {
  return `${hour}h00`;
}
