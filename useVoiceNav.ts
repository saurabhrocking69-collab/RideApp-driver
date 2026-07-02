import { useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';

const MAPS_KEY = 'AIzaSyAK3HFrZsahMLNVUFgxGAQMw_6OATDD8q4';

type NavStep = {
  html: string;
  text: string;
  endLat: number;
  endLng: number;
  distanceM: number;
};

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
  const lastAnnouncedIdx = useRef(-1);
  const isSpeaking       = useRef(false);

  const speak = (text: string) => {
    if (isSpeaking.current) return;
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
      setSteps([]); setCurrentIdx(0); lastAnnouncedIdx.current = -1;
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
          // Fallback chain: step end → next step start → destination → 0 (never NaN)
          endLat: s.end_location?.lat ?? rawSteps[idx + 1]?.start_location?.lat ?? destLat ?? 0,
          endLng: s.end_location?.lng ?? rawSteps[idx + 1]?.start_location?.lng ?? destLng ?? 0,
          distanceM: s.distance?.value ?? 0,
        }));
        setSteps(parsed);
        setCurrentIdx(0);
        lastAnnouncedIdx.current = -1;
        if (parsed.length > 0) {
          const label = phase === 'to_pickup' ? 'Pickup ki taraf chal rahe hain.' : 'Drop point ki taraf chal rahe hain.';
          speak(`${label} ${distLabel(parsed[0].distanceM)} mein ${parsed[0].text}`);
          lastAnnouncedIdx.current = 0;
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [active, destLat, destLng, phase]);

  // Announce next instruction when driver approaches a turn (within 200m)
  useEffect(() => {
    if (!active || !steps.length || driverLat == null || driverLng == null) return;

    // Find the first upcoming step the driver hasn't passed
    let nearest = currentIdx;
    let nearestDist = Infinity;
    for (let i = currentIdx; i < Math.min(currentIdx + 3, steps.length); i++) {
      const d = distM(driverLat, driverLng, steps[i].endLat, steps[i].endLng);
      if (!isNaN(d) && d < nearestDist) { nearestDist = d; nearest = i; }
    }
    setCurrentIdx(nearest);
    setNextDistM(nearestDist);

    // Announce 250m before the turn, and once more at 80m
    const announceAt = (idx: number, distThreshold: number) => {
      if (idx === lastAnnouncedIdx.current) return;
      if (idx >= steps.length) return;
      const d = distM(driverLat, driverLng, steps[idx].endLat, steps[idx].endLng);
      if (d < distThreshold) {
        lastAnnouncedIdx.current = idx;
        const announcement = d < 100
          ? `Abhi ${steps[idx].text}`
          : `${distLabel(d)} mein ${steps[idx].text}`;
        speak(announcement);
      }
    };

    announceAt(nearest, 250);
    if (nearestDist < 80) announceAt(nearest + 1, 600); // prime the next turn early
  }, [driverLat, driverLng]);

  const currentInstruction = steps[currentIdx]?.text ?? '';

  return { currentInstruction, nextDistM, stepCount: steps.length, currentStep: currentIdx };
}
