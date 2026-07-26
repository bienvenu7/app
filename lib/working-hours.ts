import type { IShedule } from "@/types/country";

const MOSCOW_TZ = "Europe/Moscow";

const WEEKDAY_TO_NUMBER: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getMoscowClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MOSCOW_TZ,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");

  return {
    day: WEEKDAY_TO_NUMBER[weekday] ?? 0,
    hour: Number.isFinite(hour) ? hour : 0,
  };
}

/** True when now (Moscow) is outside the country working schedule. */
export function isOutsideWorkingSchedule(
  shedule: IShedule | null | undefined,
): boolean {
  if (
    !shedule ||
    !Array.isArray(shedule.workingDate) ||
    shedule.workingDate.length === 0
  ) {
    return false;
  }

  const { day, hour } = getMoscowClock();
  const isWorkingDay = shedule.workingDate.includes(day);
  const isWorkingHour =
    hour >= shedule.workingFrom && hour < shedule.workingTo;

  return !isWorkingDay || !isWorkingHour;
}

export function formatScheduleHour(hour: number) {
  return `${hour}h00`;
}
