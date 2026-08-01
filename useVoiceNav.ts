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

// While on-route the distance to the current step's end only shrinks. If it
// grows by more than this, the driver has left the route (missed the turn,
// took a different road) and every remaining instruction is now wrong — so
// re-route from where they actually are. Generous enough not to trip on GPS
// jitter, which is metres, not hundreds of them.
const OFF_ROUTE_M = 150;

// Haversine distance in metres
function distM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

export function useVoiceNav({ driverLat, driverLng, destLat, destLng, active, phase }: {
  driverLat: number | null;
  driverLng: number | null;
  destLat:   number | null;
  destLng:   number | null;
  active:    boolean;
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
  // Closest the driver has been to the current step's end, to detect moving away.
  const minDistRef       = useRef(Infinity);

  // A newer instruction always matters more than one still being spoken —
  // "turn right now" must not be swallowed because "in 500 metres…" is still
  // playing. The old version returned early while speaking and silently
  // dropped the more urgent line.
  const speak = (text: string) => {
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
      return;
    }
    let cancelled = false;
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${driverLat},${driverLng}&destination=${destLat},${destLng}&mode=driving&key=${MAPS_KEY}`;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const rawSteps = data.routes?.[0]?.legs?.[0]?.steps ?? [];
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
      .catch(() => {});
    return () => { cancelled = true; };
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
    if (idx !== currentIdx) { setCurrentIdx(idx); minDistRef.current = Infinity; }
    if (!isNaN(dist)) setNextDistM(dist);

    // Off-route detection. Without this the route was fetched exactly once and
    // never again — the fetch effect deliberately leaves driverLat/Lng out of
    // its deps to avoid refetching on every GPS tick — so a driver who missed a
    // turn kept being told about turns from a road they were no longer on, for
    // the rest of the trip.
    if (!isNaN(dist)) {
      if (dist < minDistRef.current) {
        minDistRef.current = dist;
      } else if (dist > minDistRef.current + OFF_ROUTE_M) {
        minDistRef.current = Infinity;
        setRouteSeq(v => v + 1);   // refetch directions from the current position
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

    announce(idx, 'far', 250);
    announce(idx, 'near', 90);
    if (dist < 90) announce(idx + 1, 'far', 600);  // prime the following turn
  }, [driverLat, driverLng, steps, active, currentIdx]);

  const currentInstruction = steps[currentIdx]?.text ?? '';
  const currentManeuver    = steps[currentIdx]?.maneuver ?? '';

  return { currentInstruction, currentManeuver, nextDistM, stepCount: steps.length, currentStep: currentIdx };
}
