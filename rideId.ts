// Rides use a UUID primary key internally (rides.id) — never show that raw
// 36-char string to drivers. This is the one short, masked code shown
// instead, e.g. "#SP3F66AFA6" — kept identical to the customer app's
// src/rideId.ts so the same ride reads the same code on both sides.
export function shortRideId(id: string | number | null | undefined): string {
  return '#SP' + String(id || '').slice(-8).toUpperCase();
}
