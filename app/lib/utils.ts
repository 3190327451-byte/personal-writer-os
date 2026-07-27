import type { SessionSegment } from "./types";

export function countWords(text: string) {
  const han = text.match(/\p{Script=Han}/gu)?.length ?? 0;
  const rest = text.replace(/\p{Script=Han}/gu, " ");
  const latinAndNumbers =
    rest.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*|\d+(?:\.\d+)?/g)?.length ?? 0;
  return han + latinAndNumbers;
}

export function localDateKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function nextMidnight(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(24, 0, 0, 0);
  return date.getTime();
}

export function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

export function sessionDuration(
  segments: SessionSegment[],
  now = Date.now(),
) {
  return segments.reduce((total, segment) => {
    if (segment.endedAt !== null) {
      return total + segment.durationMs;
    }
    return total + Math.max(0, now - segment.startedAt);
  }, 0);
}
