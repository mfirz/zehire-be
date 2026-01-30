export function hoursFromNow(n: number): string {
  return new Date(Date.now() + n * 60 * 60 * 1000).toISOString();
}

export function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();
}

export function minutesFromNow(n: number): string {
  return new Date(Date.now() + n * 60 * 1000).toISOString();
}

export function hoursAgo(n: number): string {
  return hoursFromNow(-n);
}

export function daysAgo(n: number): string {
  return daysFromNow(-n);
}

export function minutesAgo(n: number): string {
  return minutesFromNow(-n);
}
