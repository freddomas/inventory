export function todayLocal(now = new Date()) {
  return formatLocalDate(now);
}

export function formatLocalDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateFromLocalDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addLocalDays(value, delta) {
  const date = dateFromLocalDate(value);
  date.setDate(date.getDate() + delta);
  return formatLocalDate(date);
}

export function weekDaysLocal(value) {
  const base = dateFromLocalDate(value);
  const day = base.getDay() || 7;
  base.setDate(base.getDate() - day + 1);
  return Array.from({ length: 7 }, (_, index) => addLocalDays(formatLocalDate(base), index));
}

export function localWeekdayIndex(value) {
  return dateFromLocalDate(value).getDay();
}
