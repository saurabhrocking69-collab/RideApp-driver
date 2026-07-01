import { useRef, useEffect, useState, memo } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, Polygon, AnimatedRegion, PROVIDER_GOOGLE } from 'react-native-maps';

const MAPS_KEY = 'AIzaSyAK3HFrZsahMLNVUFgxGAQMw_6OATDD8q4';
const API      = 'https://rideapp-backend-production-5e1c.up.railway.app';

type DemandZone = { lat: number; lng: number; heat: 'high' | 'medium' | 'low'; ride_count: number; avg_fare: number };

const HEAT_FILL:   Record<string, string> = { high: 'rgba(255,45,120,0.28)', medium: 'rgba(245,158,11,0.22)', low: 'rgba(5,150,105,0.16)' };
const HEAT_STROKE: Record<string, string> = { high: 'rgba(255,45,120,0.65)', medium: 'rgba(245,158,11,0.65)', low: 'rgba(5,150,105,0.55)' };
const CELL = 0.009; // half of 0.018° grid cell

function zonePolygon(lat: number, lng: number) {
  return [
    { latitude: lat - CELL, longitude: lng - CELL },
    { latitude: lat - CELL, longitude: lng + CELL },
    { latitude: lat + CELL, longitude: lng + CELL },
    { latitude: lat + CELL, longitude: lng - CELL },
  ];
}

// ── Polyline decoder (Google encoded format) ──────────────────────────────────
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

function DriverMarker() {
  return (
    <View style={styles.driverMarker}>
      <View style={styles.driverMarkerInner}>
        <Text style={{ fontSize: 18 }}>🛺</Text>
      </View>
      <View style={styles.driverMarkerTail} />
    </View>
  );
}

function PickupMarker() {
  return (
    <View style={styles.pickupMarker}>
      <View style={styles.pickupDot} />
    </View>
  );
}

function DropMarker() {
  return (
    <View style={styles.dropMarker}>
      <Text style={{ fontSize: 20 }}>📍</Text>
    </View>
  );
}

function CustomerMarker() {
  return (
    <View style={styles.customerMarker}>
      <Text style={{ fontSize: 18 }}>🧑</Text>
    </View>
  );
}

interface DriverLiveMapProps {
  pickupCoords?: { lat: number; lng: number } | null;
  dropCoords?: { lat: number; lng: number } | null;
  driverLat?: number | null;
  driverLng?: number | null;
  customerLat?: number | null;
  customerLng?: number | null;
  height?: number;
}

export const DriverLiveMap = memo(function DriverLiveMap({
  pickupCoords,
  dropCoords,
  driverLat,
  driverLng,
  customerLat,
  customerLng,
  height = 220,
}: DriverLiveMapProps) {
  const mapRef = useRef<MapView>(null);

  const driverRegion = useRef(
    new AnimatedRegion({
      latitude: driverLat || pickupCoords?.lat || 26.8467,
      longitude: driverLng || pickupCoords?.lng || 80.9462,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    })
  ).current;

  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [demandZones, setDemandZones] = useState<DemandZone[]>([]);

  // Fetch demand zones every 90 seconds when driver has no active ride
  useEffect(() => {
    if (pickupCoords || driverLat == null || driverLng == null) { setDemandZones([]); return; }
    let cancelled = false;
    const fetchZones = () => {
      fetch(`${API}/api/driver/demand-zones?lat=${driverLat}&lng=${driverLng}`)
        .then(r => r.json())
        .then(d => { if (!cancelled && Array.isArray(d.zones)) setDemandZones(d.zones); })
        .catch(() => {});
    };
    fetchZones();
    const interval = setInterval(fetchZones, 90000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [!!pickupCoords, Math.round((driverLat || 0) * 100), Math.round((driverLng || 0) * 100)]);

  // Smoothly animate driver marker when GPS updates
  useEffect(() => {
    if (driverLat == null || driverLng == null) return;
    driverRegion.timing({
      latitude: driverLat,
      longitude: driverLng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
      duration: 1500,
      useNativeDriver: false,
    } as any).start();
  }, [driverLat, driverLng]);

  // Fetch route polyline when pickup + drop are available
  useEffect(() => {
    if (!pickupCoords || !dropCoords) { setRouteCoords([]); return; }
    let cancelled = false;
    const origin = `${pickupCoords.lat},${pickupCoords.lng}`;
    const dest   = `${dropCoords.lat},${dropCoords.lng}`;
    fetch(`https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${dest}&mode=driving&key=${MAPS_KEY}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const points = data.routes?.[0]?.overview_polyline?.points;
        if (points) setRouteCoords(decodePolyline(points));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pickupCoords?.lat, pickupCoords?.lng, dropCoords?.lat, dropCoords?.lng]);

  // Fit map to show all relevant points
  useEffect(() => {
    if (!mapRef.current) return;
    const coords: { latitude: number; longitude: number }[] = [];
    if (pickupCoords)                     coords.push({ latitude: pickupCoords.lat, longitude: pickupCoords.lng });
    if (dropCoords)                       coords.push({ latitude: dropCoords.lat,   longitude: dropCoords.lng   });
    if (driverLat != null && driverLng != null) coords.push({ latitude: driverLat, longitude: driverLng });
    if (customerLat != null && customerLng != null) coords.push({ latitude: customerLat, longitude: customerLng });
    if (coords.length > 0) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 60, bottom: 80, left: 60 },
        animated: true,
      });
    }
  }, [pickupCoords?.lat, pickupCoords?.lng, dropCoords?.lat, dropCoords?.lng, driverLat, driverLng]);

  const centerLat = driverLat || pickupCoords?.lat || 26.8467;
  const centerLng = driverLng || pickupCoords?.lng || 80.9462;

  return (
    <View style={{ height, width: '100%', overflow: 'hidden' }}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        initialRegion={{ latitude: centerLat, longitude: centerLng, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
        customMapStyle={MAP_STYLE}
      >
        {/* Demand heatmap — shown when driver has no active ride */}
        {demandZones.map((z, i) => (
          <Polygon
            key={`zone-${i}`}
            coordinates={zonePolygon(z.lat, z.lng)}
            fillColor={HEAT_FILL[z.heat]}
            strokeColor={HEAT_STROKE[z.heat]}
            strokeWidth={1.5}
          />
        ))}
        {/* Zone center markers — show ride count badge */}
        {demandZones.filter(z => z.heat === 'high').map((z, i) => (
          <Marker key={`zone-lbl-${i}`} coordinate={{ latitude: z.lat, longitude: z.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={{ backgroundColor: '#FF2D78', borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1.5, borderColor: '#fff', elevation: 4 }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>🔥 {z.ride_count}</Text>
            </View>
          </Marker>
        ))}

        {/* Route polyline: pickup → drop */}
        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#E91E63"
            strokeWidth={4}
            lineCap="round"
          />
        )}

        {/* Pickup marker */}
        {pickupCoords && (
          <Marker
            coordinate={{ latitude: pickupCoords.lat, longitude: pickupCoords.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <PickupMarker />
          </Marker>
        )}

        {/* Drop marker */}
        {dropCoords && (
          <Marker
            coordinate={{ latitude: dropCoords.lat, longitude: dropCoords.lng }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
          >
            <DropMarker />
          </Marker>
        )}

        {/* Customer marker */}
        {customerLat != null && customerLng != null && (
          <Marker
            coordinate={{ latitude: customerLat, longitude: customerLng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <CustomerMarker />
          </Marker>
        )}

        {/* Animated driver position marker */}
        {driverLat != null && driverLng != null && (
          <Marker.Animated
            ref={(_ref: any) => {}}
            coordinate={driverRegion as any}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <DriverMarker />
          </Marker.Animated>
        )}
      </MapView>
    </View>
  );
});

const MAP_STYLE = [
  { featureType: 'poi',           stylers: [{ visibility: 'off' }] },
  { featureType: 'transit',       stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
];

const PINK = '#E91E63';
const styles = StyleSheet.create({
  driverMarker: { alignItems: 'center' },
  driverMarkerInner: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: PINK, alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: PINK, shadowOpacity: 0.5, shadowRadius: 8,
    borderWidth: 2.5, borderColor: '#fff',
  },
  driverMarkerTail: {
    width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: PINK, marginTop: -1,
  },
  pickupMarker: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    elevation: 4, borderWidth: 2, borderColor: '#16A34A',
  },
  pickupDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#16A34A' },
  dropMarker: { alignItems: 'center', justifyContent: 'center' },
  customerMarker: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    elevation: 4, borderWidth: 2, borderColor: '#1E40AF',
  },
});
