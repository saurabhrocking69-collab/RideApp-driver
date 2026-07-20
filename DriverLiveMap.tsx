import { useRef, useEffect, useState, memo } from 'react';
import { Animated, Linking, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import MapView, { Marker, Polyline, Circle, Polygon, AnimatedRegion, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

const MAPS_KEY = 'AIzaSyAK3HFrZsahMLNVUFgxGAQMw_6OATDD8q4';
const API      = 'https://rideapp-backend-production-5e1c.up.railway.app';

// Google Maps navigation blue — high-contrast on every road colour
const NAV_BLUE  = '#1A73E8';
const NAV_WHITE = '#FFFFFF';

import { C } from './theme';

type DemandZone = { lat: number; lng: number; heat: 'high' | 'medium' | 'low'; ride_count: number; avg_fare: number; area_name?: string | null };
type RideStatus = 'matched' | 'arrived' | 'started' | null;

const HEAT_FILL:   Record<string, string> = { high: 'rgba(255,45,120,0.25)', medium: 'rgba(245,158,11,0.18)', low: 'rgba(5,150,105,0.14)' };
const HEAT_STROKE: Record<string, string> = { high: 'rgba(255,45,120,0.60)', medium: 'rgba(245,158,11,0.60)', low: 'rgba(5,150,105,0.50)' };
const CELL = 0.009;

const VEHICLE_ICONS: Record<string, string> = {
  bike: '🏍️', green_bike: '⚡', auto: '🛺', electric_auto: '🌿',
  eriksha: '🛵', car: '🚕', luxury: '🚙',
};

function zonePolygon(lat: number, lng: number) {
  return [
    { latitude: lat - CELL, longitude: lng - CELL },
    { latitude: lat - CELL, longitude: lng + CELL },
    { latitude: lat + CELL, longitude: lng + CELL },
    { latitude: lat + CELL, longitude: lng - CELL },
  ];
}

// Map a Google maneuver string to a directional arrow icon.
function turnIconName(m: string): any {
  if (/uturn/.test(m)) return 'arrow-undo';
  if (/left/.test(m))  return 'arrow-back';
  if (/right/.test(m)) return 'arrow-forward';
  return 'arrow-up';
}

// ── Polyline decoder ──────────────────────────────────────────────────────────
function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const pts: { latitude: number; longitude: number }[] = [];
  let idx = 0, lat = 0, lng = 0;
  while (idx < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    pts.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return pts;
}

// ── Compass bearing ───────────────────────────────────────────────────────────
function computeBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toR = (d: number) => d * Math.PI / 180;
  const dL = toR(lng2 - lng1);
  const l1 = toR(lat1), l2 = toR(lat2);
  const y = Math.sin(dL) * Math.cos(l2);
  const x = Math.cos(l1) * Math.sin(l2) - Math.sin(l1) * Math.cos(l2) * Math.cos(dL);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// ── Driver self-marker — large circle with bearing arrow ──────────────────────
function DriverMarker({ vehicleType, heading }: { vehicleType: string; heading: number }) {
  const icon = VEHICLE_ICONS[vehicleType] || '🛺';
  return (
    <View style={styles.driverOuter}>
      <View style={[styles.bearingArrow, { transform: [{ rotate: `${heading}deg` }] }]}>
        <View style={styles.bearingTip} />
      </View>
      <View style={styles.driverInner}>
        <Text style={{ fontSize: 20 }}>{icon}</Text>
      </View>
    </View>
  );
}

// ── Pickup marker — green ring ────────────────────────────────────────────────
function PickupMarker() {
  return (
    <View style={styles.pickupRing}>
      <View style={styles.pickupDot} />
    </View>
  );
}

// ── Drop marker — pin ─────────────────────────────────────────────────────────
function DropMarker() {
  return (
    <View style={styles.dropOuter}>
      <View style={styles.dropPin}><View style={styles.dropHole} /></View>
      <View style={styles.dropTail} />
    </View>
  );
}

// ── Customer marker ───────────────────────────────────────────────────────────
function CustomerMarker() {
  return (
    <View style={styles.customerRing}>
      <Text style={{ fontSize: 16 }}>🧑</Text>
    </View>
  );
}

// ── ETA chip ──────────────────────────────────────────────────────────────────
function EtaChip({ eta, distance }: { eta: string; distance: string }) {
  if (!eta) return null;
  return (
    <View style={styles.etaChip}>
      <View style={[styles.etaDot, { backgroundColor: NAV_BLUE }]} />
      <Text style={styles.etaTime}>{eta}</Text>
      <View style={styles.etaSep} />
      <Text style={styles.etaDist}>{distance}</Text>
    </View>
  );
}

// ── Re-centre button ──────────────────────────────────────────────────────────
function RecenterBtn({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.recenterBtn} onPress={onPress} activeOpacity={0.8}>
      <Text style={{ fontSize: 18 }}>🎯</Text>
    </TouchableOpacity>
  );
}

// ── Hot-zone colour legend — explains what the shaded areas mean ──────────────
function ZoneLegend() {
  const items: { label: string; color: string }[] = [
    { label: 'High',   color: 'rgba(255,45,120,0.85)' },
    { label: 'Medium', color: 'rgba(245,158,11,0.85)' },
    { label: 'Low',    color: 'rgba(5,150,105,0.75)'  },
  ];
  return (
    <View style={styles.legend}>
      {items.map(it => (
        <View key={it.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: it.color }} />
          <Text style={styles.legendTxt}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Status badge overlay ──────────────────────────────────────────────────────
function StatusBadge({ status }: { status: RideStatus }) {
  if (!status) return null;
  const cfg: Record<string, { label: string; bg: string }> = {
    matched: { label: '🚗 Pickup jao',     bg: NAV_BLUE },
    arrived: { label: '📍 Pickup pe ho',   bg: C.green  },
    started: { label: '🛣️ Trip chal rahi', bg: C.pink   },
  };
  const c = cfg[status];
  if (!c) return null;
  return (
    <View style={[styles.statusBadge, { backgroundColor: c.bg }]}>
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>{c.label}</Text>
    </View>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface DriverLiveMapProps {
  pickupCoords?:  { lat: number; lng: number } | null;
  dropCoords?:    { lat: number; lng: number } | null;
  driverLat?:     number | null;
  driverLng?:     number | null;
  customerLat?:   number | null;
  customerLng?:   number | null;
  vehicleType?:   string;
  rideStatus?:    RideStatus;
  showTraffic?:   boolean;
  followDriver?:  boolean;
  navMode?:       boolean;   // full-screen turn-by-turn nav — enables heading-up camera + blue route
  driverAccuracy?: number | null;
  chosenRoutePolyline?: string | null; // customer-selected route (encoded) — driver navigates THIS path during the trip
  chosenRouteType?: string | null;      // 'shortest' | 'fastest' — badge nudges the driver to follow a chosen SHORTEST route
  height?:        number;
}

function safeNum(v: any, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isFinite(n) ? n : fallback;
}

// ── Main component ────────────────────────────────────────────────────────────
export const DriverLiveMap = memo(function DriverLiveMap({
  pickupCoords: rawPickup,
  dropCoords:   rawDrop,
  driverLat:    rawDriverLat,
  driverLng:    rawDriverLng,
  customerLat:  rawCustomerLat,
  customerLng:  rawCustomerLng,
  vehicleType   = 'auto',
  rideStatus    = null,
  showTraffic   = false,
  followDriver  = false,
  navMode       = false,
  driverAccuracy,
  chosenRoutePolyline = null,
  chosenRouteType = null,
  height        = 260,
}: DriverLiveMapProps) {
  // Sanitize all incoming coordinates
  const pickupCoords = rawPickup && isFinite(safeNum(rawPickup.lat, NaN)) && isFinite(safeNum(rawPickup.lng, NaN))
    ? { lat: safeNum(rawPickup.lat, 26.8467), lng: safeNum(rawPickup.lng, 80.9462) } : null;
  const dropCoords = rawDrop && isFinite(safeNum(rawDrop.lat, NaN)) && isFinite(safeNum(rawDrop.lng, NaN))
    ? { lat: safeNum(rawDrop.lat, 26.8467), lng: safeNum(rawDrop.lng, 80.9462) } : null;
  const driverLat = rawDriverLat != null && isFinite(safeNum(rawDriverLat, NaN)) ? safeNum(rawDriverLat, 0) : null;
  const driverLng = rawDriverLng != null && isFinite(safeNum(rawDriverLng, NaN)) ? safeNum(rawDriverLng, 0) : null;
  const customerLat = rawCustomerLat != null && isFinite(safeNum(rawCustomerLat, NaN)) ? safeNum(rawCustomerLat, 0) : null;
  const customerLng = rawCustomerLng != null && isFinite(safeNum(rawCustomerLng, NaN)) ? safeNum(rawCustomerLng, 0) : null;

  const mapRef  = useRef<MapView>(null);
  const prevPos = useRef<{ lat: number; lng: number } | null>(null);
  // heading is persisted as a ref so camera effect always reads the latest value
  const headingRef = useRef(0);
  const [heading, setHeading] = useState(0);

  const driverRegion = useRef(
    new AnimatedRegion({
      latitude:  driverLat ?? pickupCoords?.lat ?? 26.8467,
      longitude: driverLng ?? pickupCoords?.lng ?? 80.9462,
      latitudeDelta: 0.01, longitudeDelta: 0.01,
    })
  ).current;

  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [etaText, setEtaText]   = useState('');
  const [distText, setDistText] = useState('');
  const [demandZones, setDemandZones] = useState<DemandZone[]>([]);
  // Turn points along the route — a small arrow drawn on the road at each turn.
  const [turnPoints, setTurnPoints] = useState<{ lat: number; lng: number; maneuver: string }[]>([]);

  // Demand zones when idle
  useEffect(() => {
    if (rideStatus || driverLat == null || driverLng == null) { setDemandZones([]); return; }
    let cancelled = false;
    const fetchZones = () => {
      fetch(`${API}/api/driver/demand-zones?lat=${driverLat}&lng=${driverLng}`)
        .then(r => r.json())
        .then(d => { if (!cancelled && Array.isArray(d.zones)) setDemandZones(d.zones); })
        .catch(() => {});
    };
    fetchZones();
    const iv = setInterval(fetchZones, 90000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [!!rideStatus, Math.round((driverLat || 0) * 100), Math.round((driverLng || 0) * 100)]);

  // Driver position animation + bearing tracking
  useEffect(() => {
    if (driverLat == null || driverLng == null) return;
    if (prevPos.current) {
      const { lat: pl, lng: pg } = prevPos.current;
      if (Math.abs(driverLat - pl) > 0.00001 || Math.abs(driverLng - pg) > 0.00001) {
        const newHeading = computeBearing(pl, pg, driverLat, driverLng);
        headingRef.current = newHeading;
        setHeading(newHeading);
      }
    }
    prevPos.current = { lat: driverLat, lng: driverLng };
    driverRegion.timing({
      latitude: driverLat, longitude: driverLng,
      latitudeDelta: 0.01, longitudeDelta: 0.01,
      duration: 1400, useNativeDriver: false,
    } as any).start();
  }, [driverLat, driverLng]);

  // Camera follow driver
  useEffect(() => {
    if (!followDriver || driverLat == null || driverLng == null || !mapRef.current) return;
    if (navMode) {
      // Heading-up nav camera: road always faces direction of travel
      mapRef.current.animateCamera(
        {
          center:   { latitude: driverLat, longitude: driverLng },
          heading:  headingRef.current,
          pitch:    30,    // slight forward tilt — 3D nav feel
          zoom:     17,    // street level: ~1 block visible ahead
          altitude: 300,   // iOS equivalent
        },
        { duration: 900 }
      );
    } else {
      mapRef.current.animateToRegion(
        { latitude: driverLat, longitude: driverLng, latitudeDelta: 0.012, longitudeDelta: 0.012 },
        900
      );
    }
  }, [followDriver, navMode, driverLat, driverLng, heading]);

  // Route fetch — always from driver's live position to destination
  // matched → driver live → pickup
  // started → driver live → drop  (NOT pickup→drop which confused drivers)
  useEffect(() => {
    if (rideStatus === 'arrived' || rideStatus === null) {
      setRouteCoords([]); setEtaText(''); setDistText(''); return;
    }
    let origin:      string | null = null;
    let destination: string | null = null;

    if (rideStatus === 'matched' && driverLat != null && driverLng != null && pickupCoords) {
      origin      = `${driverLat},${driverLng}`;
      destination = `${pickupCoords.lat},${pickupCoords.lng}`;
    } else if (rideStatus === 'started' && dropCoords && driverLat != null && driverLng != null) {
      // Live position → drop, so the route is always what's *remaining*, not total
      origin      = `${driverLat},${driverLng}`;
      destination = `${dropCoords.lat},${dropCoords.lng}`;
    }
    if (!origin || !destination) return;

    // During the trip, if the customer chose a specific route (e.g. bike
    // shortest), draw THAT committed path so the driver navigates exactly what
    // the fare was priced on — not a fresh "fastest" route that could be longer.
    // We still fetch the live leg below, but only for the ETA/distance numbers.
    const drawChosen = rideStatus === 'started' && !!chosenRoutePolyline;
    if (drawChosen) {
      try { setRouteCoords(decodePolyline(chosenRoutePolyline as string)); } catch (_e) {}
    }

    let cancelled = false;
    fetch(`https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=driving&key=${MAPS_KEY}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const route = data.routes?.[0];
        if (!route) return;
        if (!drawChosen) setRouteCoords(decodePolyline(route.overview_polyline?.points || ''));
        const leg = route.legs?.[0];
        if (leg) {
          setEtaText(leg.duration?.text || ''); setDistText(leg.distance?.text || '');
          // Pull turn points from the step maneuvers → arrows on the road.
          const turns = (leg.steps || [])
            .filter((s: any) => s.maneuver && /turn|roundabout|ramp|fork|merge|uturn/.test(s.maneuver) && s.start_location)
            .map((s: any) => ({ lat: s.start_location.lat, lng: s.start_location.lng, maneuver: s.maneuver }));
          setTurnPoints(turns);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [
    rideStatus, chosenRoutePolyline,
    pickupCoords?.lat, pickupCoords?.lng,
    dropCoords?.lat,  dropCoords?.lng,
    // Re-fetch every ~500m of driver movement during active ride
    driverLat != null ? Math.round(driverLat * 200) / 200 : null,
    driverLng != null ? Math.round(driverLng * 200) / 200 : null,
  ]);

  // Fit map to all markers — only when not in nav follow mode
  useEffect(() => {
    if (followDriver || !mapRef.current) return;
    const coords: { latitude: number; longitude: number }[] = [];
    if (pickupCoords)   coords.push({ latitude: pickupCoords.lat, longitude: pickupCoords.lng });
    if (dropCoords)     coords.push({ latitude: dropCoords.lat,   longitude: dropCoords.lng   });
    if (driverLat != null && driverLng != null) coords.push({ latitude: driverLat, longitude: driverLng });
    if (customerLat != null && customerLng != null) coords.push({ latitude: customerLat, longitude: customerLng });
    if (coords.length > 0) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 70, right: 60, bottom: 90, left: 60 },
        animated: true,
      });
    }
  }, [pickupCoords?.lat, pickupCoords?.lng, dropCoords?.lat, dropCoords?.lng, driverLat, driverLng, followDriver]);

  const recenter = () => {
    if (!mapRef.current) return;
    const lat = driverLat ?? pickupCoords?.lat ?? 26.8467;
    const lng = driverLng ?? pickupCoords?.lng ?? 80.9462;
    if (navMode) {
      mapRef.current.animateCamera(
        { center: { latitude: lat, longitude: lng }, heading: headingRef.current, pitch: 30, zoom: 17, altitude: 300 },
        { duration: 700 }
      );
    } else {
      mapRef.current.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.014, longitudeDelta: 0.014 }, 700);
    }
  };

  // Open Google Maps for turn-by-turn (called from the in-map button)
  const openGoogleMaps = () => {
    const destCoords = rideStatus === 'started' ? dropCoords : pickupCoords;
    if (!destCoords) return;
    const url = `google.navigation:q=${destCoords.lat},${destCoords.lng}&mode=driving`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/?daddr=${destCoords.lat},${destCoords.lng}`)
    );
  };

  const centerLat = driverLat || pickupCoords?.lat || 26.8467;
  const centerLng = driverLng || pickupCoords?.lng || 80.9462;

  // The next upcoming turn = the turn point nearest to the driver right now.
  // Highlighted in pink so the driver instantly sees which turn is coming.
  const nextTurnIdx = (() => {
    if (driverLat == null || driverLng == null || turnPoints.length === 0) return -1;
    let best = -1, bestD = Infinity;
    turnPoints.forEach((t, i) => {
      const d = Math.hypot(t.lat - driverLat, t.lng - driverLng);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  })();

  return (
    <View style={{ height, width: '100%', overflow: 'hidden' }}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        initialRegion={{ latitude: centerLat, longitude: centerLng, latitudeDelta: 0.036, longitudeDelta: 0.036 }}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={navMode}         // show compass in nav mode so driver knows orientation
        showsTraffic={showTraffic}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
        pitchEnabled={navMode}         // 3D tilt only in nav mode
        rotateEnabled={navMode}        // heading-up rotation only in nav mode
        customMapStyle={navMode ? NAV_MAP_STYLE : MAP_STYLE}
      >
        {/* Demand zones — idle state only */}
        {demandZones.map((z, i) => (
          <Polygon
            key={`zone-${i}`}
            coordinates={zonePolygon(z.lat, z.lng)}
            fillColor={HEAT_FILL[z.heat]}
            strokeColor={HEAT_STROKE[z.heat]}
            strokeWidth={1.5}
          />
        ))}
        {/* Named labels on high + medium zones only — low-demand zones stay unlabeled to avoid clutter */}
        {demandZones.filter(z => z.heat === 'high' || z.heat === 'medium').map((z, i) => (
          <Marker key={`zone-lbl-${i}`} coordinate={{ latitude: z.lat, longitude: z.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={{
              backgroundColor: z.heat === 'high' ? C.pink : '#F59E0B',
              borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4,
              borderWidth: 1.5, borderColor: '#fff', elevation: 4,
              flexDirection: 'row', alignItems: 'center', gap: 4,
              maxWidth: 140,
            }}>
              <Text style={{ fontSize: 11 }}>{z.heat === 'high' ? '🔥' : '📍'}</Text>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }} numberOfLines={1}>
                {z.area_name ? `${z.area_name} · ${z.ride_count}` : z.ride_count}
              </Text>
            </View>
          </Marker>
        ))}

        {/* Route — layered for Google Maps look: white border + blue fill */}
        {routeCoords.length > 1 && (
          <>
            {/* White halo underneath for contrast on all road colours */}
            <Polyline
              coordinates={routeCoords}
              strokeColor={NAV_WHITE}
              strokeWidth={11}
              lineCap="round"
              lineJoin="round"
            />
            {/* Google blue fill */}
            <Polyline
              coordinates={routeCoords}
              strokeColor={NAV_BLUE}
              strokeWidth={7}
              lineCap="round"
              lineJoin="round"
            />
          </>
        )}

        {/* Turn arrows — directional badge on the road at each turn. The NEXT
            upcoming turn is highlighted (bigger + pink) so it stands out. */}
        {routeCoords.length > 1 && turnPoints.slice(0, 14).map((t, i) => {
          const isNext = i === nextTurnIdx;
          return (
            <Marker key={`turn-${i}`} coordinate={{ latitude: t.lat, longitude: t.lng }} anchor={{ x: 0.5, y: 0.5 }} zIndex={isNext ? 999 : 1} tracksViewChanges={isNext}>
              <View style={isNext ? styles.turnBadgeNext : styles.turnBadge}>
                <Ionicons name={turnIconName(t.maneuver)} size={isNext ? 18 : 13} color={isNext ? '#fff' : NAV_BLUE} />
              </View>
            </Marker>
          );
        })}

        {/* Driver GPS accuracy circle */}
        {driverLat != null && driverLng != null && driverAccuracy != null && driverAccuracy > 5 && (
          <Circle
            center={{ latitude: driverLat, longitude: driverLng }}
            radius={driverAccuracy}
            fillColor="rgba(26,115,232,0.07)"
            strokeColor="rgba(26,115,232,0.25)"
            strokeWidth={1.5}
          />
        )}

        {/* Pickup marker */}
        {pickupCoords && (
          <Marker coordinate={{ latitude: pickupCoords.lat, longitude: pickupCoords.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <PickupMarker />
          </Marker>
        )}

        {/* Drop marker — only when trip started */}
        {dropCoords && rideStatus === 'started' && (
          <Marker coordinate={{ latitude: dropCoords.lat, longitude: dropCoords.lng }} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
            <DropMarker />
          </Marker>
        )}

        {/* Customer marker — at pickup when matched/arrived */}
        {customerLat != null && customerLng != null && (rideStatus === 'arrived' || rideStatus === 'matched') && (
          <Marker coordinate={{ latitude: customerLat, longitude: customerLng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <CustomerMarker />
          </Marker>
        )}

        {/* Animated driver marker */}
        {driverLat != null && driverLng != null && (
          <Marker.Animated coordinate={driverRegion as any} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <DriverMarker vehicleType={vehicleType} heading={heading} />
          </Marker.Animated>
        )}
      </MapView>

      {/* Hot-zone legend — only meaningful when zones are actually shown */}
      {demandZones.length > 0 && !rideStatus && <ZoneLegend />}

      {/* ETA chip — top-left. Hidden in nav mode (it overlaps the back pill and
          the VoiceNavBar already shows turn distance); kept for the small
          preview map. */}
      {etaText && !navMode ? <EtaChip eta={etaText} distance={distText} /> : null}

      {/* Chosen-route nudge — the customer picked the SHORTEST route and paid
          for it, so tell the driver to follow the drawn line (not their own /
          external-Maps route, which would be longer). */}
      {rideStatus === 'started' && chosenRoutePolyline && chosenRouteType === 'shortest' && (
        <View style={styles.chosenRouteBadge} pointerEvents="none">
          <Text style={{ fontSize: 12 }}>🛣️</Text>
          <Text style={styles.chosenRouteTxt}>Shortest route — follow this line</Text>
        </View>
      )}

      {/* Status badge */}
      <StatusBadge status={rideStatus} />

      {/* Re-centre */}
      <RecenterBtn onPress={recenter} />

      {/* Google Maps button — only in nav mode, bottom-left */}
      {navMode && (rideStatus === 'matched' || rideStatus === 'started') && (
        <TouchableOpacity style={styles.gmapsBtn} onPress={openGoogleMaps} activeOpacity={0.85}>
          <Text style={styles.gmapsIcon}>🗺️</Text>
          <Text style={styles.gmapsTxt}>Maps</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

// ── Map styles ────────────────────────────────────────────────────────────────

// Nav mode: keep road labels for navigation orientation, hide only POI/transit clutter
const NAV_MAP_STYLE = [
  { featureType: 'poi',                        stylers: [{ visibility: 'off' }] },
  { featureType: 'transit',                    stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  // Roads and labels remain fully visible so driver can orient by street name
];

// Default Sppero brand style — for home/live tabs (no active nav)
const MAP_STYLE = [
  { elementType: 'geometry',                             stylers: [{ color: '#f4f5f7' }] },
  { elementType: 'labels.text.stroke',                   stylers: [{ color: '#f4f5f7' }, { weight: 3 }] },
  { elementType: 'labels.text.fill',                     stylers: [{ color: '#374151' }] },

  { featureType: 'road',         elementType: 'geometry',       stylers: [{ color: '#ffffff' }] },
  { featureType: 'road',         elementType: 'geometry.stroke', stylers: [{ color: '#e5e7eb' }, { weight: 0.6 }] },
  { featureType: 'road.highway', elementType: 'geometry',       stylers: [{ color: '#fef3c7' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#fde68a' }, { weight: 0.8 }] },
  { featureType: 'road',         elementType: 'labels.icon',    stylers: [{ visibility: 'off' }] },

  { featureType: 'water',     elementType: 'geometry',         stylers: [{ color: '#dbeafe' }] },
  { featureType: 'water',     elementType: 'labels.text.fill', stylers: [{ color: '#93c5fd' }] },
  { featureType: 'landscape', elementType: 'geometry',         stylers: [{ color: '#eff0f4' }] },

  { featureType: 'poi',                                         stylers: [{ visibility: 'off' }] },
  { featureType: 'transit',                                     stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel',                  stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  driverOuter:  { alignItems: 'center', justifyContent: 'center', width: 54, height: 54 },
  bearingArrow: { position: 'absolute', width: 54, height: 54, alignItems: 'center' },
  bearingTip: {
    width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderBottomWidth: 10,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderBottomColor: NAV_BLUE,
  },
  driverInner: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: NAV_BLUE, alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: NAV_BLUE, shadowOpacity: 0.5, shadowRadius: 10,
    borderWidth: 3, borderColor: '#fff',
  },

  pickupRing: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    elevation: 5, shadowColor: C.green, shadowOpacity: 0.30, shadowRadius: 6,
    borderWidth: 2.5, borderColor: C.green,
  },
  pickupDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: C.green },

  dropOuter: { alignItems: 'center' },
  dropPin: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: C.pink, shadowOpacity: 0.45, shadowRadius: 8,
    borderWidth: 2, borderColor: '#fff',
  },
  dropHole: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  dropTail: {
    width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 9,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: C.pink, marginTop: -1,
  },

  customerRing: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    elevation: 4, borderWidth: 2.5, borderColor: NAV_BLUE,
    shadowColor: NAV_BLUE, shadowOpacity: 0.25, shadowRadius: 6,
  },

  chosenRouteBadge: {
    position: 'absolute', top: 54, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(37,99,235,0.95)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
    elevation: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8,
    borderWidth: 1.5, borderColor: '#fff',
  },
  chosenRouteTxt: { color: '#fff', fontSize: 11.5, fontWeight: '900' },

  turnBadge: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: NAV_BLUE,
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3,
  },
  turnBadgeNext: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
    elevation: 10, shadowColor: C.pink, shadowOpacity: 0.6, shadowRadius: 8,
  },

  legend: {
    position: 'absolute', top: 12, right: 12,
    flexDirection: 'row', gap: 10,
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 6,
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
  },
  legendTxt: { fontSize: 10, fontWeight: '700', color: '#374151' },

  etaChip: {
    position: 'absolute', top: 12, left: 12,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
    elevation: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', gap: 6,
  },
  etaDot:  { width: 7, height: 7, borderRadius: 3.5 },
  etaTime: { fontSize: 13, fontWeight: '900', color: '#202124' },
  etaSep:  { width: 1, height: 12, backgroundColor: '#E8EAED' },
  etaDist: { fontSize: 12, color: '#5F6368', fontWeight: '600' },

  statusBadge: {
    position: 'absolute', bottom: 46, alignSelf: 'center',
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7,
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8,
  },

  recenterBtn: {
    position: 'absolute', bottom: 10, right: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
  },

  gmapsBtn: {
    position: 'absolute', bottom: 10, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#fff', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 8,
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8,
    borderWidth: 1, borderColor: 'rgba(26,115,232,0.25)',
  },
  gmapsIcon: { fontSize: 14 },
  gmapsTxt:  { fontSize: 12, fontWeight: '800', color: NAV_BLUE },
});
