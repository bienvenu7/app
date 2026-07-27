import type { IShedule } from "@/types/country";

function getLocalClock(date = new Date()) {
  return {
    day: date.getDay(),
    hour: date.getHours(),
  };
}

/** True when the user's local time is outside the country working schedule. */
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

  const { day, hour } = getLocalClock();
  const isWorkingDay = shedule.workingDate.includes(day);
  const isWorkingHour =
    hour >= shedule.workingFrom && hour < shedule.workingTo;

  return !isWorkingDay || !isWorkingHour;
}

export function formatScheduleHour(hour: number) {
  return `${hour}h00`;
}
