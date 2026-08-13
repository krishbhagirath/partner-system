export function formatDay(dayOfWeek: string) {
  return dayOfWeek.charAt(0) + dayOfWeek.slice(1).toLowerCase();
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function toClockTime(date: Date) {
  return date.toISOString().slice(11, 16);
}

export function formatComponentType(componentType: string) {
  return componentType === "LAB" ? "Lab" : "Tutorial";
}

export function formatStatus(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function formatUserDisplayName(user: {
  displayName: string | null;
  email: string;
  name: string | null;
}) {
  return user.displayName ?? user.name ?? user.email;
}

export function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  const last = words[words.length - 1];

  if (!first) {
    return "?";
  }

  if (words.length === 1 || !last) {
    return first.slice(0, 2).toUpperCase();
  }

  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

export function formatSectionLabel(section: {
  courseCode: string;
  componentType: string;
  sectionCode: string;
}) {
  return `${section.courseCode} — ${formatComponentType(section.componentType)} ${section.sectionCode}`;
}

/** Display a stored term ("2026 Fall") as season-first ("Fall 2026"). */
export function formatTerm(term: string) {
  const year = term.match(/\b(20\d{2})\b/)?.[1];
  const season = term.match(/\b(fall|winter|spring|summer)\b/i)?.[1];

  if (year && season) {
    return `${season.charAt(0).toUpperCase()}${season.slice(1).toLowerCase()} ${year}`;
  }

  return term;
}

export function formatRelativeTime(date: Date, now: Date = new Date()) {
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
  }

  const diffDays = Math.round(diffHours / 24);

  if (diffDays === 1) {
    return "Yesterday";
  }

  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  return formatDate(date);
}
