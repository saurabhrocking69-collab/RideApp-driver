import { useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';

const MAPS_KEY = 'AIzaSyAK3HFrZsahMLNVUFgxGAQMw_6OATDD8q4';

type NavStep = {
  html: string;
  text: string;
  maneuver: string;
  endLat: number;
  endLng: number;
  distanceM: number;
};

// How close counts as having reached a step's end point. Google's step ends
// sit at the junction itself, and a phone GPS fix is routinely 10-20m out, so
// this has to be forgiving enough to trigger while still inside the junction.
const ARRIVE_STEP_M = 30;

// How far off the actual route line counts as "left the route".
//
// This used to be measured as "distance to the current step's END point grew
// by 150m from its minimum", which was wrong in both directions:
//   - MISSED real deviations — turn off onto a parallel road that still heads
//     toward the same junction and the distance keeps shrinking, so the driver
//     was never flagged and kept getting turns for a road they had left.
//   - FALSE positives — a legitimately curved step (flyover, loop, service
//     road) moves you away from its end point while perfectly on-route.
// Measuring perpendicular distance to the route polyline is what actually
// answers "am I still on this road".
const OFF_ROUTE_M = 60;

// Consecutive off-route fixes before rerouting. Urban GPS routinely throws a
// single fix 50-100m out (tall buildings, tunnels); one bad sample must not
// tear up a correct route.
const OFF_ROUTE_STRIKES = 3;

// How long to wait before retrying a failed reroute fetch. A reroute that
// fails used to be swallowed silently, leaving the driver navigating a stale
// route for the rest of the trip with no indication anything was wrong.
const REROUTE_RETRY_MS = 5000;

// Haversine distance in metres
function distM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Google's encoded-polyline format → [lat, lng] pairs.
function decodePolyline(enc: string): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  let i = 0, lat = 0, lng = 0;
  while (i < enc.length) {
    let b = 0, shift = 0, result = 0;
    do { b = enc.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = enc.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}

// Metres from a point to the NEAREST SEGMENT of the route — not to the nearest
// vertex, which would read as "off route" halfway along any long straight.
// Uses a local equirectangular projection: exact enough well under a kilometre
// (all that matters here) and far cheaper than haversine per segment.
function distToRouteM(lat: number, lng: number, pts: Array<[number, number]>): number {
  if (pts.length === 0) return Infinity;
  if (pts.length === 1) return distM(lat, lng, pts[0][0], pts[0][1]);
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180);
  const px = lng * mPerDegLng, py = lat * mPerDegLat;
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][1] * mPerDegLng,     ay = pts[i][0] * mPerDegLat;
    const bx = pts[i + 1][1] * mPerDegLng, by = pts[i + 1][0] * mPerDegLat;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + t * dx, cy = ay + t * dy;
    const d = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
    if (d < best) best = d;
  }
  return best;
}

// Strip HTML tags + convert common abbreviations to speakable text
function htmlToSpeak(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, 'aur')
    .replace(/\bN\b/g, 'North').replace(/\bS\b/g, 'South').replace(/\bE\b/g, 'East').replace(/\bW\b/g, 'West')
    .replace(/\bft\b/g, 'feet').replace(/\bmi\b/g, 'mile')
    .replace(/\s+/g, ' ').trim();
}

// Meters → readable label
function distLabel(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} kilometre`;
  if (m >= 100)  return `${Math.round(m / 50) * 50} metre`;
  return `${Math.round(m)} metre`;
}

export function useVoiceNav({ driverLat, driverLng, destLat, destLng, active, muted = false, phase }: {
  driverLat: number | null;
  driverLng: number | null;
  destLat:   number | null;
  destLng:   number | null;
  active:    boolean;
  // Silences speech only. Routing, step advancement, the turn arrow and the
  // distance countdown all keep running — muting the voice must not take the
  // navigation away, which is what happened when the caller folded this into
  // `active` instead.
  muted?:    boolean;
  phase:     'to_pickup' | 'to_drop';
}) {
  const [steps, setSteps]           = useState<NavStep[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [nextDistM, setNextDistM]   = useState(0);
  // Per-step, per-tier announcement keys ("3:far", "3:near") — see the effect
  // below for why a single "last announced index" was not enough.
  const announced        = useRef<Set<string>>(new Set());
  const isSpeaking       = useRef(false);
  // Bumped to force a re-route; see OFF_ROUTE_M.
  const [routeSeq, setRouteSeq] = useState(0);
  // Decoded route line, for "am I still on this road" (see distToRouteM).
  const [routePts, setRoutePts] = useState<Array<[number, number]>>([]);
  // True from the moment we notice the driver has left the route until a new
  // route actually arrives — surfaced to the UI so the driver is told, instead
  // of silently staring at an instruction for a road they're no longer on.
  const [rerouting, setRerouting] = useState(false);
  // Consecutive fixes measured off the route line.
  const offStrikesRef    = useRef(0);

  // A newer instruction always matters more than one still being spoken —
  // "turn right now" must not be swallowed because "in 500 metres…" is still
  // playing. The old version returned early while speaking and silently
  // dropped the more urgent line.
  // Kept in a ref so the announcement effect doesn't need `muted` in its deps —
  // toggling mute must not re-run step logic or re-trigger announcements.
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
    // Cut off anything mid-sentence the moment the driver mutes.
    if (muted) { try { Speech.stop(); } catch (_e) {} }
  }, [muted]);

  const speak = (text: string) => {
    if (mutedRef.current) return;
    try { Speech.stop(); } catch (_e) {}
    isSpeaking.current = true;
    Speech.speak(text, {
      language: 'hi-IN',
      pitch: 1.0, rate: 0.9,
      onDone: () => { isSpeaking.current = false; },
      onError: () => { isSpeaking.current = false; },
    });
  };

  // Fetch directions when origin/destination change
  useEffect(() => {
    if (!active || driverLat == null || driverLng == null || destLat == null || destLng == null) {
      setSteps([]); setCurrentIdx(0); announced.current.clear();
      setRoutePts([]); setRerouting(false); offStrikesRef.current = 0;
      return;
    }
    let cancelled = false;
    let retryTimer: any = null;
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${driverLat},${driverLng}&destination=${destLat},${destLng}&mode=driving&key=${MAPS_KEY}`;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const rawSteps = data.routes?.[0]?.legs?.[0]?.steps ?? [];
        if (rawSteps.length === 0) throw new Error('no route');
        // Prefer the per-step geometry (finer than overview_polyline, which is
        // simplified and can cut corners enough to read as 30-40m off-route).
        const pts: Array<[number, number]> = [];
        for (const s of rawSteps) {
          if (s.polyline?.points) pts.push(...decodePolyline(s.polyline.points));
        }
        setRoutePts(pts.length ? pts : decodePolyline(data.routes[0].overview_polyline?.points || ''));
        setRerouting(false);
        offStrikesRef.current = 0;
        const parsed: NavStep[] = rawSteps.map((s: any, idx: number) => ({
          html: s.html_instructions,
          text: htmlToSpeak(s.html_instructions),
          maneuver: s.maneuver || '',
          // Fallback chain: step end → next step start → destination → 0 (never NaN)
          endLat: s.end_location?.lat ?? rawSteps[idx + 1]?.start_location?.lat ?? destLat ?? 0,
          endLng: s.end_location?.lng ?? rawSteps[idx + 1]?.start_location?.lng ?? destLng ?? 0,
          distanceM: s.distance?.value ?? 0,
        }));
        setSteps(parsed);
        setCurrentIdx(0);
        announced.current.clear();
        if (parsed.length > 0) {
          const label = phase === 'to_pickup' ? 'Pickup ki taraf chal rahe hain.' : 'Drop point ki taraf chal rahe hain.';
          speak(`${label} ${distLabel(parsed[0].distanceM)} mein ${parsed[0].text}`);
          announced.current.add('0:far');
        }
      })
      .catch(() => {
        // A failed reroute used to be swallowed here, which left the driver on
        // a stale route permanently: routeSeq had already been bumped, so
        // nothing tried again until they drifted far enough to trip the
        // detector a second time. Retry until it lands, and keep the
        // "rerouting" banner up so they know the route on screen is not live.
        if (cancelled) return;
        retryTimer = setTimeout(() => {
          if (!cancelled) setRouteSeq(v => v + 1);
        }, REROUTE_RETRY_MS);
      });
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
  }, [active, destLat, destLng, phase, routeSeq]);

  // Advance through steps + announce as the driver approaches each turn.
  useEffect(() => {
    if (!active || !steps.length || driverLat == null || driverLng == null) return;

    // Advance PAST a step once its end point has been reached, rather than
    // picking whichever of the next few step-ends is nearest.
    //
    // The old "nearest end wins" rule kept showing a turn after the driver had
    // already taken it: having just passed step N's end, that end is still the
    // closest one, so the arrow only changed once the driver got more than
    // halfway to step N+1's end. Drivers saw the turn they had just completed
    // instead of the one coming up.
    let idx = currentIdx;
    while (
      idx < steps.length - 1 &&
      distM(driverLat, driverLng, steps[idx].endLat, steps[idx].endLng) < ARRIVE_STEP_M
    ) {
      idx++;
    }
    const dist = distM(driverLat, driverLng, steps[idx].endLat, steps[idx].endLng);
    if (idx !== currentIdx) setCurrentIdx(idx);
    if (!isNaN(dist)) setNextDistM(dist);

    // Off-route detection, measured against the route LINE (see OFF_ROUTE_M).
    // Without this the route was fetched exactly once and never again — the
    // fetch effect deliberately leaves driverLat/Lng out of its deps to avoid
    // refetching on every GPS tick — so a driver who missed a turn kept being
    // told about turns from a road they were no longer on, for the whole trip.
    if (routePts.length > 1 && !rerouting) {
      const off = distToRouteM(driverLat, driverLng, routePts);
      if (off > OFF_ROUTE_M) {
        offStrikesRef.current += 1;
        if (offStrikesRef.current >= OFF_ROUTE_STRIKES) {
          offStrikesRef.current = 0;
          setRerouting(true);
          // Say it as well as show it — the driver is watching the road, not
          // the screen, and this is the one moment they need to know the
          // instruction they can hear is about to change.
          speak('Aap route se hat gaye hain. Naya raasta bana rahe hain.');
          setRouteSeq(v => v + 1);  // refetch directions from where they are
        }
      } else {
        offStrikesRef.current = 0;   // back on the line — forget the near-misses
      }
    }

    // Announce each step at most once per tier, so pre-announcing the NEXT
    // turn can't cancel that turn's own at-the-junction call. The old code
    // stored a single lastAnnouncedIdx, so priming step N+1 early meant the
    // "Abhi …" prompt for step N+1 was skipped entirely — the driver heard the
    // turn only well in advance, never at the moment of turning.
    const announce = (i: number, tier: 'far' | 'near', threshold: number) => {
      if (i >= steps.length) return;
      const key = `${i}:${tier}`;
      if (announced.current.has(key)) return;
      const d = distM(driverLat, driverLng, steps[i].endLat, steps[i].endLng);
      if (isNaN(d) || d >= threshold) return;
      announced.current.add(key);
      speak(tier === 'near' ? `Abhi ${steps[i].text}` : `${distLabel(d)} mein ${steps[i].text}`);
    };

    // While rerouting, the on-screen route is known-stale — don't read out
    // turns from it. The new route announces itself the moment it lands.
    if (rerouting) return;

    announce(idx, 'far', 250);
    announce(idx, 'near', 90);
    if (dist < 90) announce(idx + 1, 'far', 600);  // prime the following turn
  }, [driverLat, driverLng, steps, active, currentIdx, routePts, rerouting]);

  const currentInstruction = steps[currentIdx]?.text ?? '';
  const currentManeuver    = steps[currentIdx]?.maneuver ?? '';

  return { currentInstruction, currentManeuver, nextDistM, stepCount: steps.length, currentStep: currentIdx, rerouting };
}
