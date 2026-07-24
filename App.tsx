import { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator, View, Text, TouchableOpacity, StyleSheet, Image, Alert,
  ScrollView, Switch, TextInput, Animated, Linking, Vibration, KeyboardAvoidingView, Platform, BackHandler, Share, AppState, Modal, StatusBar, NativeModules, Dimensions
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import * as Notifications from 'expo-notifications';
import { DriverLiveMap } from './DriverLiveMap';
import { useVoiceNav } from './useVoiceNav';
import { VoiceNavBar } from './VoiceNavBar';
import { FuelLogScreen } from './FuelLogScreen';
import { ZoneAlertBanner, ZoneAlertSender, type ZoneAlert } from './ZoneAlertBanner';
import { Audio } from 'expo-av';
import { apiGet, apiPost } from './api';
// Keep the screen on during navigation. Guarded so the app never crashes if the
// native module isn't in the build yet (activates in dev builds immediately; in
// the production APK after the next native rebuild).
let KeepAwake: any = null;
try { KeepAwake = require('expo-keep-awake'); } catch (_e) {}
import { useDriverStore } from './store';
import { TR, Lang } from './translations';
import { io, Socket } from 'socket.io-client';

// Module-level lang — updated whenever the in-component state changes,
// so sub-components (BottomNav) can read it without prop-drilling.
let _appLang: Lang = 'hi';
import { C, T, R, SP, SHADOW, DS } from './theme';

// Safe dynamic require: react-native-razorpay calls new NativeEventEmitter() at module
// evaluation time which crashes in RN 0.81+ bridgeless mode if the TurboModule isn't
// registered yet. The try/catch prevents this from killing the app on startup.
let RazorpayCheckout: any = null;
try { const _m = require('react-native-razorpay'); RazorpayCheckout = _m?.default || _m || null; } catch (_e) {}

const API      = 'https://api.sppero.com';
const MAPS_KEY = 'AIzaSyAK3HFrZsahMLNVUFgxGAQMw_6OATDD8q4';

const MapWebView = ({ pickupCoords, dropCoords, driverLat, driverLng, customerLat, customerLng, height = 220 }: any) => {
  const centerLat = pickupCoords?.lat || driverLat || 26.8467;
  const centerLng = pickupCoords?.lng || driverLng || 80.9462;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>* { margin: 0; padding: 0; } html, body, #map { height: 100%; width: 100%; } #map { background: #e8eaed; }</style>
</head>
<body>
<div id="map"></div>
<script>
  function initMap() {
    const map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: ${centerLat}, lng: ${centerLng} }, zoom: 14,
      disableDefaultUI: true, zoomControl: true,
      styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }, { featureType: 'transit', stylers: [{ visibility: 'off' }] }]
    });
    const bounds = new google.maps.LatLngBounds();
    let hasPoint = false;
    ${pickupCoords?.lat ? `
    new google.maps.Marker({
      position: { lat: ${pickupCoords.lat}, lng: ${pickupCoords.lng} }, map,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#16A34A', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
      title: 'Pickup', animation: google.maps.Animation.DROP
    });
    bounds.extend({ lat: ${pickupCoords.lat}, lng: ${pickupCoords.lng} }); hasPoint = true;
    ` : ''}
    ${dropCoords?.lat ? `
    new google.maps.Marker({
      position: { lat: ${dropCoords.lat}, lng: ${dropCoords.lng} }, map,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#E91E63', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
      title: 'Drop', animation: google.maps.Animation.DROP
    });
    bounds.extend({ lat: ${dropCoords.lat}, lng: ${dropCoords.lng} }); hasPoint = true;
    ` : ''}
    ${driverLat && driverLng ? `
    new google.maps.Marker({
      position: { lat: ${driverLat}, lng: ${driverLng} }, map,
      label: { text: '🚗', fontSize: '22px' },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0, fillOpacity: 0, strokeOpacity: 0 },
      title: 'Driver'
    });
    bounds.extend({ lat: ${driverLat}, lng: ${driverLng} }); hasPoint = true;
    ` : ''}
    ${customerLat && customerLng ? `
    new google.maps.Marker({
      position: { lat: ${customerLat}, lng: ${customerLng} }, map,
      label: { text: '🧑', fontSize: '22px' },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0, fillOpacity: 0, strokeOpacity: 0 },
      title: 'Customer'
    });
    bounds.extend({ lat: ${customerLat}, lng: ${customerLng} }); hasPoint = true;
    ` : ''}
    ${pickupCoords?.lat && dropCoords?.lat ? `
    const ds = new google.maps.DirectionsService();
    const dr = new google.maps.DirectionsRenderer({ map, suppressMarkers: true, polylineOptions: { strokeColor: '#E91E63', strokeWeight: 4, strokeOpacity: 0.8 } });
    ds.route({ origin: { lat: ${pickupCoords.lat}, lng: ${pickupCoords.lng} }, destination: { lat: ${dropCoords.lat}, lng: ${dropCoords.lng} }, travelMode: 'DRIVING' }, (r, s) => { if (s === 'OK') dr.setDirections(r); });
    ` : ''}
    if (hasPoint) { map.fitBounds(bounds, 80); if (map.getZoom() > 16) map.setZoom(16); }
  }
</script>
<script async src="https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&callback=initMap"></script>
</body>
</html>`;

  return <WebView source={{ html }} style={{ height, width: '100%' }} scrollEnabled={false} javaScriptEnabled domStorageEnabled />;
};

// ─── Count-Up — earnings number badhta dikhe ───
const CountUp = ({ value, style, prefix = '₹' }: any) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const target = parseFloat(String(value).replace(/[^0-9.]/g, '')) || 0;
    if (target === 0) { setDisplay(0); return; }
    let cur = 0;
    const step = Math.max(1, Math.ceil(target / 25));
    const t = setInterval(() => {
      cur = Math.min(cur + step, target);
      setDisplay(cur);
      if (cur >= target) clearInterval(t);
    }, 35);
    return () => clearInterval(t);
  }, [value]);
  return <Text style={style}>{prefix}{display.toFixed(0)}</Text>;
};

// ─── Celebration — trip complete pe ───
const Celebration = () => {
  const particles = useRef([0,1,2,3,4,5,6,7,8,9].map(() => ({
    x: new Animated.Value(0),
    y: new Animated.Value(0),
    o: new Animated.Value(1),
    r: new Animated.Value(0),
  }))).current;
  useEffect(() => {
    particles.forEach((p, i) => {
      const angle = (i / 10) * Math.PI * 2;
      const dist = 60 + Math.random() * 50;
      Animated.parallel([
        Animated.timing(p.x, { toValue: Math.cos(angle) * dist, duration: 900, useNativeDriver: true }),
        Animated.timing(p.y, { toValue: Math.sin(angle) * dist - 30, duration: 900, useNativeDriver: true }),
        Animated.timing(p.o, { toValue: 0, duration: 900, useNativeDriver: true }),
        Animated.timing(p.r, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]).start();
    });
  }, []);
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', height: 80, marginBottom: -40 }}>
      {particles.map((p, i) => (
        <Animated.Text key={i} style={{
          position: 'absolute', fontSize: 20, opacity: p.o,
          transform: [{ translateX: p.x }, { translateY: p.y }, { rotate: p.r.interpolate({ inputRange: [0,1], outputRange: ['0deg', '360deg'] }) }]
        }}>
          {['🎉','💰','✨','🎊','⭐'][i % 5]}
        </Animated.Text>
      ))}
    </View>
  );
};

const SlideIn = ({ children, style }: any) => {
  const y       = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(y,       { toValue: 0, duration: 350, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={[style, { transform: [{ translateY: y }], opacity }]}>{children}</Animated.View>;
};

const CountdownBar = ({ seconds, onTimeout }: { seconds: number; onTimeout?: () => void }) => {
  const [left, setLeft] = useState(seconds);
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    setLeft(seconds);
    anim.setValue(1);
    Animated.timing(anim, { toValue: 0, duration: seconds * 1000, useNativeDriver: false }).start();
    const t = setInterval(() => {
      setLeft((l: number) => { if (l <= 1) { clearInterval(t); onTimeout?.(); return 0; } return l - 1; });
    }, 1000);
    return () => clearInterval(t);
  }, [seconds]);
  const barColor = left <= 5 ? C.pink : left <= 10 ? C.warn : C.online;
  return (
    <View style={{ marginTop: SP.sm, backgroundColor: C.glassMid, borderRadius: R.xs, padding: 12, borderWidth: 1, borderColor: C.glassBorder }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 12, color: C.textMuted, fontWeight: '600' }}>⏱️ Auto-reject in</Text>
        <View style={{ backgroundColor: left <= 5 ? C.pinkGlass : C.greenGlass, borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: left <= 5 ? C.pinkBorder : C.greenBorder }}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: barColor }}>{left}s</Text>
        </View>
      </View>
      <View style={{ height: 5, backgroundColor: C.glassHigh, borderRadius: R.full, overflow: 'hidden' }}>
        <Animated.View style={{ height: 5, borderRadius: R.full, backgroundColor: barColor, width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
      </View>
    </View>
  );
};

// ─── Bouncy Button ───
const Bouncy = ({ children, onPress, style, disabled }: any) => {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () => Animated.spring(scale, { toValue: 0.94, friction: 5, useNativeDriver: true }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    friction: 4, useNativeDriver: true }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} style={style} disabled={disabled} activeOpacity={0.85}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── PulseView — scale pulse loop ───
const PulseView = ({ children, style }: any) => {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1.18, duration: 650, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1,    duration: 650, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[style, { transform: [{ scale: anim }] }]}>{children}</Animated.View>;
};

// ─── FloatingDots — animated bouncing dots ───
const FloatingDots = ({ color = C.pink }: any) => {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    dots.forEach((d, i) => {
      Animated.loop(Animated.sequence([
        Animated.delay(i * 200),
        Animated.timing(d, { toValue: -9, duration: 280, useNativeDriver: true }),
        Animated.timing(d, { toValue: 0,  duration: 280, useNativeDriver: true }),
        Animated.delay(540),
      ])).start();
    });
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 12 }}>
      {dots.map((d, i) => (
        <Animated.View key={i} style={{ width: 11, height: 11, borderRadius: 5.5, backgroundColor: color, transform: [{ translateY: d }] }} />
      ))}
    </View>
  );
};

// ─── ScreenIn — screen slide-in transition ───
const ScreenIn = ({ children, style }: any) => {
  const x = useRef(new Animated.Value(45)).current;
  const o = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(x, { toValue: 0, friction: 9, tension: 65, useNativeDriver: true }),
      Animated.timing(o, { toValue: 1, duration: 230, useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={[style, { transform: [{ translateX: x }], opacity: o }]}>{children}</Animated.View>;
};

// ─── TripStatusBar — matched → arrived → started → done ───
const TripStatusBar = ({ status }: { status: string }) => {
  const idx = status === 'matched' ? 0 : status === 'arrived' ? 1 : status === 'started' ? 2 : 3;
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: idx, friction: 8, tension: 60, useNativeDriver: false }).start();
  }, [idx]);
  const steps = [{ icon: '🚗', label: 'Jao' }, { icon: '📍', label: 'Pahunche' }, { icon: '🛣️', label: 'Trip' }, { icon: '✅', label: 'Done' }];
  return (
    <View style={{ paddingHorizontal: 4, paddingBottom: 10, paddingTop: 2 }}>
      <View style={{ height: 3, backgroundColor: '#F8FAFC', borderRadius: 2, marginHorizontal: 10, marginBottom: 8, overflow: 'hidden' }}>
        <Animated.View style={{ height: 3, backgroundColor: C.green, borderRadius: 2, width: anim.interpolate({ inputRange: [0, 3], outputRange: ['0%', '100%'] }) }} />
      </View>
      <View style={{ flexDirection: 'row' }}>
        {steps.map((s, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: i <= idx ? C.green : '#E2E8F0', alignItems: 'center', justifyContent: 'center', transform: [{ scale: i === idx ? 1.2 : 1 }], elevation: i === idx ? 4 : 0, borderWidth: i > idx ? 1 : 0, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 12 }}>{i <= idx ? s.icon : '·'}</Text>
            </View>
            <Text style={{ fontSize: 9, marginTop: 3, color: i <= idx ? C.green : '#475569', fontWeight: i === idx ? 'bold' : 'normal' }}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

// ─── AnimatedBar — target progress fill animation ───
const AnimatedBar = ({ pct, color }: { pct: number; color: string }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: Math.min(pct, 100), duration: 900, useNativeDriver: false }).start();
  }, [pct]);
  return <Animated.View style={{ height: 8, borderRadius: 4, backgroundColor: color, width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }} />;
};

// ─── MapOverlay — LIVE badge + route bar over map ───
const MapOverlay = ({ hasRoute, pickup, drop, live = false }: any) => {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!live) return;
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.7, duration: 750, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,   duration: 750, useNativeDriver: true }),
    ])).start();
  }, [live]);
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
      {live && (
        <View style={{ position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(46,125,50,0.92)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, elevation: 4 }}>
          <Animated.View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#fff', marginRight: 5, transform: [{ scale: pulse }] }} />
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold', letterSpacing: 0.5 }}>LIVE</Text>
        </View>
      )}
      {hasRoute && (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(26,26,46,0.88)', paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.green, marginRight: 6 }} />
          <Text style={{ color: '#fff', fontSize: 11, flex: 1 }} numberOfLines={1}>{pickup}</Text>
          <Text style={{ color: '#555', fontSize: 12, marginHorizontal: 5 }}>→</Text>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.pink, marginRight: 6 }} />
          <Text style={{ color: '#fff', fontSize: 11, flex: 1 }} numberOfLines={1}>{drop}</Text>
        </View>
      )}
    </View>
  );
};

type Screen = 'splash' | 'login' | 'permissions' | 'home';
const SCREEN_H = Dimensions.get('window').height;

// ─── SkeletonBox + Skeleton Cards — shimmer loading placeholders ──────────────
const _SKEL_W = Dimensions.get('window').width;
const SkeletonBox = ({ width, height, radius = 8, style }: { width?: number; height: number; radius?: number; style?: any }) => {
  const shine = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(shine, { toValue: 1, duration: 1100, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, []);
  const w = width ?? _SKEL_W;
  const tx = shine.interpolate({ inputRange: [0, 1], outputRange: [-w, w] });
  return (
    <View style={[{ width, height, borderRadius: radius, backgroundColor: '#E8EEF2', overflow: 'hidden' }, style]}>
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, width: '100%', backgroundColor: 'rgba(255,255,255,0.62)', transform: [{ translateX: tx }] }} />
    </View>
  );
};
const SkeletonRideCard = () => (
  <View style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <View style={{ gap: 8 }}>
        <SkeletonBox width={140} height={13} radius={6} />
        <SkeletonBox width={110} height={11} radius={5} />
      </View>
      <View style={{ alignItems: 'flex-end', gap: 7 }}>
        <SkeletonBox width={54} height={16} radius={5} />
        <SkeletonBox width={44} height={11} radius={4} />
      </View>
    </View>
  </View>
);
const SkeletonHourlyCard = () => (
  <View style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <View style={{ gap: 8 }}>
        <SkeletonBox width={150} height={13} radius={6} />
        <SkeletonBox width={120} height={11} radius={5} />
      </View>
      <View style={{ alignItems: 'flex-end', gap: 7 }}>
        <SkeletonBox width={54} height={16} radius={5} />
        <SkeletonBox width={48} height={11} radius={4} />
      </View>
    </View>
  </View>
);
const SkeletonCommissionRow = () => (
  <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0', borderLeftWidth: 3, borderLeftColor: '#E2E8F0' }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <SkeletonBox width={64} height={20} radius={6} />
          <SkeletonBox width={48} height={20} radius={6} />
        </View>
        <SkeletonBox width={130} height={11} radius={5} />
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <SkeletonBox width={50} height={14} radius={5} />
        <SkeletonBox width={44} height={11} radius={4} />
      </View>
    </View>
  </View>
);
const SkeletonBonusCard = () => (
  <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
      <SkeletonBox width={40} height={40} radius={20} style={{ marginRight: 12 }} />
      <View style={{ flex: 1, gap: 8 }}>
        <SkeletonBox width={160} height={14} radius={6} />
        <SkeletonBox width={120} height={11} radius={5} />
      </View>
    </View>
    <SkeletonBox height={10} radius={5} />
    <View style={{ height: 8 }} />
    <SkeletonBox width={200} height={10} radius={5} />
  </View>
);

// ─── Background Location Task ────────────────────────────────────────────────
// MUST be defined at module level, before any component mounts.
// When app is minimized/screen locked, this task fires every ~5s and pings backend.
const DRIVER_LOCATION_TASK = 'sppero-driver-bg-location';
const _BG_API = 'https://api.sppero.com';

// Fetch with timeout + 1 retry — handles Jio's packet-drop and slow-DNS issues
async function _bgFetch(url: string, opts?: RequestInit, timeoutMs = 8000): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(tid);
      if (res.ok) return res;
    } catch (_e) {
      if (attempt === 0) await new Promise(r => setTimeout(r, 1500)); // brief pause before retry
    }
  }
  return null;
}

TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({ data, error }: any) => {
  if (error || !data?.locations?.length) return;
  const { latitude, longitude } = data.locations[0].coords;
  try {
    const phone = await AsyncStorage.getItem('driverPhone');
    if (!phone) return;

    // 1. Location ping — retry once on failure (critical for Jio mobile data)
    _bgFetch(`${_BG_API}/api/driver/update-location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, lat: latitude, lng: longitude }),
    }).catch(() => {});

    // 2. Poll for new ride — retry once; local notification bypasses FCM + battery restrictions
    const rRes = await _bgFetch(`${_BG_API}/api/driver/pending-ride?phone=${phone}`);
    if (!rRes) return; // both attempts failed — Jio down, skip this tick
    const rd = await rRes.json().catch(() => null);
    if (!rd?.ride) return;
    const lastId = await AsyncStorage.getItem('_bgLastRideId');
    if (lastId === String(rd.ride.id)) return; // already notified for this ride
    await AsyncStorage.setItem('_bgLastRideId', String(rd.ride.id));
    // Local notification — bypasses FCM entirely, guaranteed delivery from background task.
    // Category 'ride_request' shows Accept ✅ / Decline ✕ action buttons on lock screen.
    const rideEmoji = rd.ride.ride_type === 'bike' ? '🏍️' : rd.ride.ride_type === 'car' ? '🚕' : '🛺';
    const fareStr   = rd.ride.fare ? `₹${rd.ride.fare}` : '';
    const pickup    = (rd.ride.pickup || 'Pickup').slice(0, 45);
    const drop      = (rd.ride.drop_location || 'Drop').slice(0, 45);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${rideEmoji} New Ride Request! ${fareStr}`,
        body: `${pickup} → ${drop}`,
        sound: 'ride_alert',
        categoryIdentifier: 'ride_request',
        data: { type: 'new_ride', ride_id: String(rd.ride.id) },
        ...(Platform.OS === 'android' ? { channelId: 'ride_requests_v2' } : {}),
      },
      trigger: null,
    });
  } catch (_e) {}
});

async function startBgLocation(): Promise<boolean> {
  try {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== 'granted') return false;
    const { status: bg } = await Location.requestBackgroundPermissionsAsync();
    if (bg !== 'granted') return false;
    const already = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => false);
    if (already) return true;
    await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 8000,      // fire every 8 seconds
      distanceInterval: 0,     // no distance gate — time-only, works for stationary drivers
      foregroundService: {
        notificationTitle: '🟢 Sppero Buddy — Online',
        notificationBody: 'Location active — receiving ride requests',
        notificationColor: C.pink,
      },
      pausesUpdatesAutomatically: false,
    });
    return true;
  } catch (_e) { return false; }
}

async function stopBgLocation(): Promise<void> {
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => false);
    if (running) await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
  } catch (_e) {}
}

// ── Pre-queue card — floating offer shown to driver while on active/payment/nav screen ─
function PreQueueCard({ preQueued, phone, onAccept, onDecline, containerStyle }: {
  preQueued: { rideId: number; pickup: string; fare: string; rideType: string; etaMin: number };
  phone: string;
  onAccept: () => void;
  onDecline: () => void;
  containerStyle?: object;
}) {
  const slideAnim = useRef(new Animated.Value(120)).current;
  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 0, tension: 90, friction: 11, useNativeDriver: true }).start();
  }, []);

  const RIDE_ICONS: Record<string, string> = { bike: '🏍️', auto: '🛺', car: '🚕', eriksha: '🛵', luxury: '🚙', electric_auto: '🌿', green_bike: '⚡' };
  const icon = RIDE_ICONS[preQueued.rideType] || '🚗';

  return (
    <Animated.View style={[{
      position: 'absolute', bottom: 90, left: 12, right: 12, zIndex: 1000,
      transform: [{ translateY: slideAnim }],
      backgroundColor: '#0A0F1E',
      borderRadius: 18, borderWidth: 2, borderColor: '#7C3AED',
      shadowColor: '#7C3AED', shadowOpacity: 0.55, shadowRadius: 18, elevation: 20,
      overflow: 'hidden',
    }, containerStyle]}>
      {/* Header */}
      <View style={{ backgroundColor: '#7C3AED', paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontSize: 18 }}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>Next Ride Ready!</Text>
          <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11 }}>Complete current trip, then go here</Text>
        </View>
        <Text style={{ color: '#E9D5FF', fontWeight: '800', fontSize: 14 }}>{preQueued.fare}</Text>
      </View>

      {/* Pickup info */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name="location-sharp" size={18} color="#A78BFA" />
        <Text style={{ flex: 1, color: '#E2E8F0', fontSize: 13, fontWeight: '600' }} numberOfLines={2}>{preQueued.pickup}</Text>
        <View style={{ backgroundColor: '#1E0A3C', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: '#7C3AED' }}>
          <Text style={{ color: '#A78BFA', fontSize: 11, fontWeight: '800' }}>~{preQueued.etaMin} min</Text>
        </View>
      </View>

      {/* Buttons */}
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 16 }}>
        <TouchableOpacity onPress={onDecline} style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: '#1E293B', alignItems: 'center', borderWidth: 1, borderColor: '#334155' }}>
          <Text style={{ color: '#94A3B8', fontWeight: '700', fontSize: 13 }}>Not Now</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onAccept} style={{ flex: 2, paddingVertical: 11, borderRadius: 10, backgroundColor: '#7C3AED', alignItems: 'center', shadowColor: '#7C3AED', shadowOpacity: 0.5, shadowRadius: 8, elevation: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>Queue This Ride ✓</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

function App() {
  const [screen, setScreen]         = useState<Screen>('splash');
  const splashLogo  = useRef(new Animated.Value(0)).current;
  const splashScale = useRef(new Animated.Value(0.3)).current;
  const splashTag   = useRef(new Animated.Value(0)).current;
  const splashFade  = useRef(new Animated.Value(1)).current;
  const dstore = useDriverStore();
  // Store watcher — guaranteed UI update
  useEffect(() => {
    const unsub = useDriverStore.subscribe((state) => {
      setActiveRide(state.activeRide);
      setRideReq(state.pendingRide);
    });
    return unsub;
  }, []);
  const socketRef = useRef<Socket | null>(null);
  const onlineNotifIdRef = useRef<string | null>(null);
  const alarmSoundRef = useRef<Audio.Sound | null>(null);
  const preQueueSoundRef = useRef<Audio.Sound | null>(null);
  const [phone, setPhone]           = useState('');
  const [isOnline, setIsOnline]     = useState(false);
  const [rideReq, setRideReq]       = useState<any>(null);
  const [activeRide, setActiveRide] = useState<any>(null);

  // ── Language ──────────────────────────────────
  const [lang, setLang] = useState<Lang>('hi');
  const t = (key: string) => TR[lang]?.[key] ?? TR.hi[key] ?? key;
  const tp = (key: string, p: Record<string, string>) => {
    let s = t(key);
    for (const [k, v] of Object.entries(p)) s = s.replace(`{${k}}`, v);
    return s;
  };
  const changeLang = async (l: Lang) => {
    setLang(l); _appLang = l;
    try { await AsyncStorage.setItem('_lang', l); } catch (_e) {}
  };
  // Sync module-level var whenever lang state changes
  useEffect(() => { _appLang = lang; }, [lang]);
  // Pre-assignment queue — a ride offered to this driver while they're still on an active trip
  const [preQueued, setPreQueued]          = useState<{ rideId: number; pickup: string; fare: string; rideType: string; etaMin: number } | null>(null);
  const [preQueueAccepted, setPreQueueAccepted] = useState(false);
  const [pendingActivatedRide, setPendingActivatedRide] = useState<any>(null);
  const [earnings, setEarnings]     = useState(0);
  const [rides, setRides]           = useState(0);
  const [result, setResult]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [activeTab, setActiveTab]   = useState('home');
  const [otpInput, setOtpInput]     = useState('');
  const [eta, setEta]               = useState('');
  const [distToPickup, setDistToPickup] = useState('');
  const [tripRemainingEta, setTripRemainingEta] = useState('');
  const driverGpsRef                = useRef<any>(null);
  const [tripSummary, setTripSummary]   = useState<any>(null);
  const [paymentWaiting, setPaymentWaiting]     = useState(false);
  const [driverSubScreen, setDrSubScreen] = useState<'' | 'documents' | 'bank' | 'support' | 'settings' | 'orders' | 'ticket-new' | 'ticket-list' | 'subscription' | 'fare-rates'>('');
  const [custRatingStars, setCustRatingStars]   = useState(0);
  const [custRatingDone, setCustRatingDone]     = useState(false);
  const [bankAccount, setBankAccount]   = useState('');
  const [bankIfsc, setBankIfsc]         = useState('');
  const [bankHolder, setBankHolder]     = useState('');
  const [bankSaving, setBankSaving]     = useState(false);
  const [bankLoaded, setBankLoaded]     = useState(false);
  const [bankEditing, setBankEditing]   = useState(false);
  const [bankMsg, setBankMsg]           = useState('');
  const [showDriverCancelModal, setShowDriverCancelModal] = useState(false);
  const [cancelReason, setCancelReason]         = useState('');
  const [earlyFlagModal, setEarlyFlagModal] = useState<{ dist: string } | null>(null);
  const [distWarnModal, setDistWarnModal]   = useState<{ dist: string } | null>(null);
  const distWarnResolveRef = useRef<((v: boolean) => void) | null>(null);
  const [driverTickets, setDriverTickets]                         = useState<any[]>([]);
  const [driverTicketsLoading, setDriverTicketsLoading]           = useState(false);
  const [driverActiveTicket, setDriverActiveTicket]               = useState<any>(null);
  const [driverTicketDetail, setDriverTicketDetail]               = useState<any>(null);
  const [driverTicketDetailLoading, setDriverTicketDetailLoading] = useState(false);
  const [driverTicketCategory, setDriverTicketCategory]           = useState('');
  const [driverTicketDesc, setDriverTicketDesc]                   = useState('');
  const [driverTicketSubmitting, setDriverTicketSubmitting]       = useState(false);
  const [driverTicketSuccess, setDriverTicketSuccess]             = useState<any>(null);
  const [driverTicketReply, setDriverTicketReply]                 = useState('');
  const [driverTicketReplying, setDriverTicketReplying]           = useState(false);
  const [paymentRideId, setPaymentRideId] = useState('');
  const [paymentFare, setPaymentFare]     = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [driverGps, setDriverGps]   = useState<any>(null);
  const [navMuted, setNavMuted]     = useState(false);
  const [inNavMode, setInNavMode]   = useState(false);
  const [showFuelLog, setShowFuelLog] = useState(false);
  const [showNotifCenter, setShowNotifCenter] = useState(false);
  const [driverNotifs, setDriverNotifs] = useState<any[]>([]);
  const [notifUnread, setNotifUnread] = useState(0);
  const [chatMsgs, setChatMsgs]         = useState<any[]>([]);
  const [chatInput, setChatInput]       = useState('');
  const [showChat, setShowChat]         = useState(false);
  const [unreadChat, setUnreadChat]     = useState(0);
  const lastChatCount                   = useRef(0);
  const [chatToast, setChatToast]       = useState<string | null>(null);
  const chatToastTimer                  = useRef<any>(null);
  // Hourly chat
  const [showHourlyChat, setShowHourlyChat] = useState(false);
  const [hourlyChatMsgs, setHourlyChatMsgs] = useState<any[]>([]);
  const [hourlyChatInput, setHourlyChatInput] = useState('');

  // ── Wallet / Earnings State ──────────────────
  const [driverOffers, setDriverOffers] = useState<any[]>([]);
  const [offerDismissed, setOfferDismissed] = useState<Set<number>>(new Set());
  // ── Bonus System State ───────────────────────
  const [bonusDash, setBonusDash] = useState<any>(null);
  const [bonusHistory, setBonusHistory] = useState<any[]>([]);
  const [bonusHistoryLoaded, setBonusHistoryLoaded] = useState(false);
  const [bonusLoading, setBonusLoading] = useState(false);
  const [bonusClaiming, setBonusClaiming] = useState(false);
  const [bonusMsg, setBonusMsg] = useState('');
  const [bonusRedeemAmt, setBonusRedeemAmt] = useState('');
  const [bonusRedeemLoading, setBonusRedeemLoading] = useState(false);
  const [driverWallet, setDriverWallet] = useState<any>({ balance: 0, total_earned: 0, total_withdrawn: 0 });
  const [driverRideHistory, setDriverRideHistory] = useState<any[]>([]);
  const [driverHourlyHistory, setDriverHourlyHistory] = useState<any[]>([]);
  const [walletEarningsTab, setWalletEarningsTab] = useState<'summary'|'rides'|'hourly'|'commission'>('summary');
  const [earningsAnalytics, setEarningsAnalytics] = useState<any>(null);
  const [payoutInput, setPayoutInput] = useState('');
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [walletLoaded, setWalletLoaded] = useState(false);

  // Fare rates data
  const [drFares, setDrFares] = useState<any[]>([]);
  const [drFaresLoading, setDrFaresLoading] = useState(false);

  // Subscription data
  const [driverSub, setDriverSub] = useState<any>(null);   // { active, queued, total_savings, vehicle_category }
  const [subPlans, setSubPlans]   = useState<any[]>([]);
  const [subSelectedPlan, setSubSelectedPlan] = useState<any>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [subResult, setSubResult]   = useState('');

  // ── Subscription hint (one-time, home tab) ──────────────────────────────
  const [showSubHint, setShowSubHint]   = useState(false);
  const subHintTY      = useRef(new Animated.Value(140)).current;
  const subHintOpacity = useRef(new Animated.Value(0)).current;
  const subHintShimmer = useRef(new Animated.Value(0)).current;
  const subHintBobY    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!driverSub || driverSub.active) return;
    let timer: any;
    AsyncStorage.getItem('_subHintShown').then(v => {
      if (v) return;
      timer = setTimeout(() => {
        setShowSubHint(true);
        Animated.parallel([
          Animated.spring(subHintTY, { toValue: 0, useNativeDriver: true, tension: 50, friction: 8 }),
          Animated.timing(subHintOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]).start(() => {
          // Attention bob after slide-in
          Animated.sequence([
            Animated.timing(subHintBobY, { toValue: -10, duration: 280, useNativeDriver: true }),
            Animated.timing(subHintBobY, { toValue: 0,   duration: 280, useNativeDriver: true }),
            Animated.timing(subHintBobY, { toValue: -5,  duration: 200, useNativeDriver: true }),
            Animated.timing(subHintBobY, { toValue: 0,   duration: 200, useNativeDriver: true }),
          ]).start();
          // Shimmer sweep — repeats every ~3.4s
          Animated.loop(
            Animated.sequence([
              Animated.timing(subHintShimmer, { toValue: 1, duration: 1400, useNativeDriver: true }),
              Animated.delay(2000),
              Animated.timing(subHintShimmer, { toValue: 0, duration: 0, useNativeDriver: true }),
            ])
          ).start();
        });
      }, 3500);
    });
    return () => { if (timer) clearTimeout(timer); };
  }, [driverSub]);

  const dismissSubHint = async () => {
    subHintShimmer.stopAnimation();
    Animated.parallel([
      Animated.timing(subHintTY, { toValue: 160, duration: 320, useNativeDriver: true }),
      Animated.timing(subHintOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start(() => setShowSubHint(false));
    await AsyncStorage.setItem('_subHintShown', '1');
  };
  // ────────────────────────────────────────────────────────────────────────

  const vehicleCategoryFor = (vt: string) => {
    const v = (vt || '').toLowerCase();
    if (['bike','green_bike'].includes(v)) return 'bike';
    if (['auto','electric_auto','e_riksha','eriksha'].includes(v)) return 'auto';
    if (['car','luxury','ultra_luxury'].includes(v)) return 'car';
    return 'bike';
  };

  const loadDriverSub = async (ph: string, vehicleType?: string) => {
    try {
      const cat = vehicleType ? vehicleCategoryFor(vehicleType) : null;
      const [myRes, plansRes] = await Promise.all([
        fetch(`${API}/api/subscriptions/my?phone=${encodeURIComponent(ph)}`).then(r => r.json()),
        cat ? fetch(`${API}/api/subscriptions/plans?vehicle_category=${cat}`).then(r => r.json()) : Promise.resolve({ plans: [] }),
      ]);
      setDriverSub(myRes);
      setSubPlans(plansRes.plans || []);
    } catch (_e) {}
  };

  // Commission data
  const [commissionData, setCommissionData] = useState<{ pending_commission: number; total_commission: number; settled_commission: number; records: any[]; payments: any[] }>({ pending_commission: 0, total_commission: 0, settled_commission: 0, records: [], payments: [] });
  const [commPayLoading, setCommPayLoading] = useState(false);
  const [commResult, setCommResult] = useState('');

  // ── Demand Heatmap + Driver Level + Prediction ────────────
  const [demandZones, setDemandZones] = useState<any[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const zonesIntervalRef = useRef<any>(null);
  const [driverLevel, setDriverLevel] = useState<any>(null);
  const [demandPrediction, setDemandPrediction] = useState<any>(null);

  // Ride extension
  const [extRequest, setExtRequest]       = useState<any>(null); // pending extension from customer
  const [extRespSec, setExtRespSec]       = useState(60);
  const [extAccLoading, setExtAccLoading] = useState(false);
  const [hExtendLoading, setHExtendLoading] = useState(false);

  // ── Zone Alerts ───────────────────────────────────
  const [zoneAlert, setZoneAlert]           = useState<ZoneAlert | null>(null);
  const [showZoneAlertSender, setShowZoneAlertSender] = useState(false);
  const [zoneAlertSentCount, setZoneAlertSentCount]   = useState<number | null>(null);

  // ── Surge + Admin Notif + Referral ───────────────
  const [surgeMultiplier, setSurgeMultiplier] = useState(1.0);
  const [autoAcceptSurge, setAutoAcceptSurge] = useState(false);
  const [dailyGoal, setDailyGoal] = useState(1500);
  const [adminNotif, setAdminNotif] = useState<any>(null);
  const [adminNotifDismissed, setAdminNotifDismissed] = useState('');
  const [referralInfo, setReferralInfo] = useState<any>(null);
  const [referralLoaded, setReferralLoaded] = useState(false);

  // ── Driver UPI ───────────────────────────────
  const [driverUpiId, setDriverUpiId] = useState('');
  const [upiInput, setUpiInput] = useState('');
  const [upiSaving, setUpiSaving] = useState(false);

  // ── Hourly Booking State ──────────────────────
  const [hourlyRideReq, setHourlyRideReq]       = useState<any>(null);
  const [activeHourlyRide, setActiveHourlyRide] = useState<any>(null);
  const activeHourlyRideRef = useRef<any>(null);
  const triggerHourlyPollRef = useRef<(() => void) | null>(null);
  const [hourlyOtpInput, setHourlyOtpInput]     = useState('');
  const [hourlyArrived, setHourlyArrived]       = useState(false);
const [hourlyTimerSec, setHourlyTimerSec]     = useState(0);
  const hourlyTimerRef = useRef<any>(null);
  const [hEarlyEndLoading, setHEarlyEndLoading] = useState(false);
  const [liveKm, setLiveKm]                     = useState(0);
  const prevHourlyGpsRef = useRef<{lat:number,lng:number}|null>(null);

  // Block standard ride requests while driver is in an active hourly booking
  useEffect(() => {
    useDriverStore.getState().setHourlyBusy(!!activeHourlyRide);
  }, [activeHourlyRide]);

  // Registration
  const [regStep, setRegStep]       = useState(0);
  const [regData, setRegData]       = useState<any>({ phone:'', vehicle_type:'', vehicle_brand:'', vehicle_model:'', vehicle_no:'', dl_name:'', dl_number:'', dl_photo:'', vehicle_photo:'', rc_photo:'', aadhaar_number:'', aadhaar_photo:'', face_photo:'' });
  const [uploading, setUploading]   = useState('');
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const [loginPhone, setLoginPhone] = useState('');
  const [loginOtp, setLoginOtp]     = useState('');
  const [loginOtpSent, setLoginOtpSent] = useState(false);
  const [loginOtpDigits, setLoginOtpDigits] = useState(['','','','','','']);
  const [loginResendTimer, setLoginResendTimer] = useState(60);
  const [loginCanResend, setLoginCanResend] = useState(false);
  const loginOtpRefs = useRef<any[]>([]);
  const [driverInfo, setDriverInfo]       = useState<any>(null);
  const [favouriteCount, setFavouriteCount] = useState<number | null>(null);
  const [devOtp, setDevOtp]         = useState('');
  // Login banner animations
  const [loginCaptionIdx, setLoginCaptionIdx] = useState(0);
  const loginGlowAnim     = useRef(new Animated.Value(0.3)).current;
  const loginCaptionFade  = useRef(new Animated.Value(1)).current;
  const loginCaptionSlide = useRef(new Animated.Value(0)).current;
  const [lastRideId, setLastRideId]         = useState<string>('');

  // ── Cancel Popup (customer or driver cancels) ─
  const [cancelPopup, setCancelPopup] = useState<{ msg: string; sub: string } | null>(null);

  // ── Permission Onboarding State ───────────────
  const [permStatus, setPermStatus] = useState({ location: false, battery: false, overlay: false });
  const [permSheet, setPermSheet]   = useState<string | null>(null);
  const [permDone, setPermDone]     = useState(false);
  const [ordersData, setOrdersData]       = useState<any>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersPeriod, setOrdersPeriod]   = useState<'day'|'week'|'month'>('day');
  const [ordersDate, setOrdersDate]       = useState(() => new Date());
  const [ordersFilter, setOrdersFilter]   = useState<'all'|'completed'|'cancelled'>('all');

  useEffect(() => {
    if (driverSubScreen === 'orders' && phone) loadOrders(ordersPeriod, ordersDate);
    if (driverSubScreen === 'fare-rates') {
      setDrFaresLoading(true);
      fetch(`${API}/api/fare-settings`)
        .then(r => r.json())
        .then(d => { if (d.fares) setDrFares(d.fares); })
        .catch(() => {})
        .finally(() => setDrFaresLoading(false));
    }
  }, [driverSubScreen]);

  // ── Splash + Auto login ────────────────────────
  useEffect(() => {
    // Logo spring pop-in
    Animated.parallel([
      Animated.spring(splashScale, { toValue: 1, friction: 5, tension: 55, useNativeDriver: true }),
      Animated.timing(splashLogo,  { toValue: 1, duration: 480, useNativeDriver: true }),
    ]).start();
    // Tagline slides up after logo settles
    setTimeout(() => {
      Animated.timing(splashTag, { toValue: 1, duration: 380, useNativeDriver: true }).start();
    }, 620);
    // After 2.6s — check session then fade out
    const timer = setTimeout(async () => {
      // Clean up any stale background location task from previous session
      stopBgLocation().catch(() => {});
      // Restore preferred language before nav
      try {
        const sl = await AsyncStorage.getItem('_lang');
        if (sl === 'en' || sl === 'hi') { setLang(sl as Lang); _appLang = sl as Lang; }
      } catch (_e) {}

      let navTo: Screen = 'login';
      try {
        const savedPhone = await AsyncStorage.getItem('driverPhone');
        const savedInfo  = await AsyncStorage.getItem('driverInfo');
        if (savedPhone) {
          setPhone(savedPhone);
          try {
            const res  = await fetch(`${API}/api/driver/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: savedPhone }) });
            const data = await res.json();
            if (data.success) {
              setDriverInfo(data.driver);
              await AsyncStorage.setItem('driverInfo', JSON.stringify(data.driver));
              if (data.driver.status === 'approved') {
              const pd = await AsyncStorage.getItem('_permsDone').catch(() => null);
              navTo = pd ? 'home' : 'permissions'; loadUpiId(savedPhone); registerFCM(savedPhone); fetchDriverLevel(savedPhone); fetchDriverNotifs(savedPhone); loadDriverSub(savedPhone, data.driver.vehicle_type);
              // CRITICAL: if the driver was Online, restore that on cold start —
              // otherwise tapping a ride notification cold-starts the app, leaves
              // isOnline=false (default), stops polling, and the offer expires
              // unseen while the driver appears offline. Restore online + polling
              // + background location whenever the backend says they're online.
              if (data.driver.is_online) {
                setIsOnline(true);
                startPolling(savedPhone);
                startBgLocation().catch(() => {});
              }
              // Restore active ride into store so home screen shows it immediately.
              try {
                const ar = await fetch(`${API}/api/driver/active-ride?phone=${savedPhone}`).then(r => r.json());
                if (ar.ride) {
                  useDriverStore.setState({ activeRide: ar.ride });
                  setIsOnline(true);
                  startPolling(savedPhone);
                }
              } catch (_e) {}
            }
            } else { if (savedInfo) setDriverInfo(JSON.parse(savedInfo)); navTo = 'home'; }
          } catch (_e) { if (savedInfo) setDriverInfo(JSON.parse(savedInfo)); navTo = 'home'; }
        }
      } catch (_e) {}
      Animated.timing(splashFade, { toValue: 0, duration: 320, useNativeDriver: true }).start(() => setScreen(navTo));
    }, 2600);
    return () => clearTimeout(timer);
  }, []);
  // ── Initial GPS (for pickup distance before going online) ─
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getLastKnownPositionAsync() || await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (loc) setDriverGps({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }
      } catch (_e) {}
    })();
  }, []);

  // ── Permission onboarding check ───────────────
  const checkPermissions = async () => {
    try {
      const { status: fg } = await Location.getForegroundPermissionsAsync();
      const { status: bg } = await Location.getBackgroundPermissionsAsync();
      const locOk     = fg === 'granted' && bg === 'granted';
      const battOk    = !!(await AsyncStorage.getItem('_permBattAck').catch(() => null));
      const overlayOk = !!(await AsyncStorage.getItem('_permOverlayAck').catch(() => null));
      setPermStatus({ location: locOk, battery: battOk, overlay: overlayOk });
      if (locOk && battOk && overlayOk) {
        await AsyncStorage.setItem('_permsDone', '1').catch(() => {});
        setPermDone(true);
      }
    } catch (_e) {}
  };

  useEffect(() => {
    if (screen !== 'permissions') return;
    checkPermissions();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') checkPermissions(); });
    return () => sub.remove();
  }, [screen]);

  useEffect(() => {
    if (!permDone) return;
    const t = setTimeout(() => setScreen('home'), 1600);
    return () => clearTimeout(t);
  }, [permDone]);

  // ── Login banner glow + caption cycling ─────
  useEffect(() => {
    if (screen !== 'login') return;
    const glow = Animated.loop(Animated.sequence([
      Animated.timing(loginGlowAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
      Animated.timing(loginGlowAnim, { toValue: 0.25, duration: 2000, useNativeDriver: true }),
    ]));
    glow.start();
    const iv = setInterval(() => {
      Animated.parallel([
        Animated.timing(loginCaptionFade, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(loginCaptionSlide, { toValue: -14, duration: 250, useNativeDriver: true }),
      ]).start(() => {
        setLoginCaptionIdx(i => (i + 1) % 5);
        loginCaptionSlide.setValue(14);
        Animated.parallel([
          Animated.timing(loginCaptionFade, { toValue: 1, duration: 250, useNativeDriver: true }),
          Animated.timing(loginCaptionSlide, { toValue: 0, duration: 250, useNativeDriver: true }),
        ]).start();
      });
    }, 3000);
    return () => { glow.stop(); clearInterval(iv); };
  }, [screen]);

  // ── Notification Handler ──────────────────────
  useEffect(() => {
    // Register Accept / Decline action buttons for ride-request notifications
    Notifications.setNotificationCategoryAsync('ride_request', [
      {
        identifier: 'notif_accept',
        buttonTitle: '✅ Accept',
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'notif_decline',
        buttonTitle: '✕ Decline',
        options: { opensAppToForeground: false, isDestructive: true },
      },
    ]).catch(() => {});

    if (Platform.OS === 'android') {
      // v2 channel — Android locks channel settings after first creation; v2 forces
      // correct MAX+bypassDnd settings on every device regardless of previous installs.
      Notifications.setNotificationChannelAsync('ride_requests_v2', {
        name: 'Ride Requests',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'ride_alert',
        vibrationPattern: [0, 800, 200, 800, 200, 800],
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
        showBadge: true,
      });
      // Keep old channel so old FCM tokens don't silently drop (some cached backend calls)
      Notifications.setNotificationChannelAsync('ride_requests', {
        name: 'Ride Requests (Legacy)',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'ride_alert',
        vibrationPattern: [0, 800, 200, 800, 200, 800],
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
      });
      Notifications.setNotificationChannelAsync('driver_status', {
        name: 'Driver Online Status',
        importance: Notifications.AndroidImportance.LOW,
        sound: undefined,
        enableVibrate: false,
        showBadge: false,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
      Notifications.setNotificationChannelAsync('default', {
        name: 'General Notifications',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 400, 200, 400],
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    // Notification arrives while app is alive (foreground OR minimized with fg service)
    // Alarm ringtone is handled by the rideReq useEffect; just poll here.
    const sub1 = Notifications.addNotificationReceivedListener(n => {
      const data = n.request.content.data as any;
      if (data?.type === 'new_ride') {
        Vibration.vibrate([0, 600, 150, 600]); // short vibrate — audio alarm handles the rest
        useDriverStore.getState().triggerPoll?.();
      }
      if (data?.type === 'ride_cancelled') {
        setCancelPopup({ msg: 'Customer Cancelled the Ride', sub: 'Finding your next ride...' });
        useDriverStore.getState().triggerPoll?.();
      }
      if (data?.type === 'hourly_available') {
        Vibration.vibrate([0, 600, 150, 600, 150, 600]);
        triggerHourlyPollRef.current?.();
      }
      if (data?.type === 'hourly_extend') {
        Vibration.vibrate([0, 400, 200, 400]);
      }
      if (data?.type === 'broadcast') {
        // Add to notification center and show unread badge
        const newNotif = {
          title: n.request.content.title || 'Sppero',
          message: n.request.content.body || '',
          created_at: new Date().toISOString(),
          type: 'broadcast',
        };
        setDriverNotifs(prev => [newNotif, ...prev].slice(0, 30));
        setNotifUnread(c => c + 1);
      }
    });

    // Notification action buttons: Accept / Decline from lock screen
    const handleDriverNotifTap = (response: any) => {
      const data   = response?.notification?.request?.content?.data as any;
      const action = response?.actionIdentifier as string | undefined;

      // ── Accept button tapped directly on notification ──
      if (action === 'notif_accept' && data?.ride_id) {
        const rideId = data.ride_id;
        setScreen('home'); setActiveTab('live');
        // Poll first so pendingRide is populated, then accept
        useDriverStore.getState().triggerPoll?.();
        const driverPhone = (globalThis as any).__driverPhone;
        if (driverPhone) {
          apiPost('/api/rides/accept', { ride_id: rideId, driver_phone: driverPhone })
            .catch(() => {});
        }
        return;
      }

      // ── Decline button tapped directly on notification ──
      if (action === 'notif_decline' && data?.ride_id) {
        const driverPhone = (globalThis as any).__driverPhone;
        if (driverPhone) {
          apiPost('/api/rides/reject-offer', { ride_id: data.ride_id, driver_phone: driverPhone })
            .catch(() => {});
        }
        useDriverStore.setState({ pendingRide: null });
        return;
      }

      // ── Regular notification tap / dismiss ──
      if (data?.type === 'new_ride') {
        setScreen('home'); setActiveTab('live');
        useDriverStore.getState().triggerPoll?.();
      }
      if (data?.type === 'ride_cancelled') {
        setScreen('home'); setActiveTab('home');
        setCancelPopup({ msg: 'Customer Cancelled the Ride', sub: 'Finding your next ride...' });
        useDriverStore.getState().triggerPoll?.();
      }
      if (data?.type === 'compensation_credited' || data?.type === 'earning_credited') {
        setScreen('home'); setActiveTab('earnings');
      }
      if (data?.type === 'hourly_extend') {
        setScreen('home'); setActiveTab('live');
      }
      if (data?.type === 'support_reply' || data?.type === 'support_resolved') {
        const dp = (globalThis as any).__driverPhone;
        setDriverActiveTicket(null);
        setDriverTicketDetail(null);
        setDriverTickets([]);
        setDriverTicketsLoading(true);
        setDrSubScreen('ticket-list');
        if (dp) {
          fetch(`${API}/api/support/tickets?phone=${encodeURIComponent(dp)}&role=driver`)
            .then(r => r.json())
            .then(d => setDriverTickets(d.tickets || []))
            .catch(() => {})
            .finally(() => setDriverTicketsLoading(false));
        } else {
          setDriverTicketsLoading(false);
        }
      }
    };
    const sub2 = Notifications.addNotificationResponseReceivedListener(handleDriverNotifTap);
    Notifications.getLastNotificationResponseAsync().then(r => { if (r) handleDriverNotifTap(r); });

    // AppState: app comes back to foreground → staggered refresh to avoid burst
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        const storeState = useDriverStore.getState();
        // Reconnect socket immediately
        const sock = (globalThis as any).__driverSocket;
        if (sock && !sock.connected) sock.connect();
        // Restart or trigger poll
        if (!storeState._pollTimer && (globalThis as any).__driverPhone) {
          startPolling((globalThis as any).__driverPhone);
        } else {
          storeState.triggerPoll?.();
        }
        // Stagger heavy refreshes so they don't all fire at once
        const ph = storeState.activeRide?.driver_phone || (globalThis as any).__driverPhone;
        if (ph) {
          setTimeout(() => loadDriverWallet(ph), 500);
          setTimeout(() => loadCommissionHistory(ph), 1500);
          setTimeout(() => registerFCM(ph), 3000);
        }
      }
    });

    return () => {
      sub1.remove();
      sub2.remove();
      appStateSub.remove();
    };
  }, []);

  // On foreground return: refresh open ticket detail OR ticket list
  const driverActiveTicketRef = useRef<any>(null);
  useEffect(() => { driverActiveTicketRef.current = driverActiveTicket; }, [driverActiveTicket]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active') return;
      const t = driverActiveTicketRef.current;
      if (t) {
        fetch(`${API}/api/support/tickets/${t.id}?phone=${encodeURIComponent(phone)}`)
          .then(r => r.json())
          .then(d => setDriverTicketDetail(d))
          .catch(() => {});
      } else if (driverSubScreen === 'ticket-list') {
        fetch(`${API}/api/support/tickets?phone=${encodeURIComponent(phone)}&role=driver`)
          .then(r => r.json())
          .then(d => setDriverTickets(d.tickets || []))
          .catch(() => {});
      }
    });
    return () => sub.remove();
  }, [phone, driverSubScreen]);

  // ── FCM Token Register ────────────────────────
  const registerFCM = async (userPhone: string) => {
    try {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;

      // Native FCM token — bypasses Expo relay entirely, goes direct to Firebase Admin.
      // This fixes killed-app notifications on Android (Expo relay requires FCM V1 creds
      // configured in Expo dashboard; native path skips that dependency completely).
      let token: string | null = null;
      try {
        const dt = await Notifications.getDevicePushTokenAsync();
        token = dt.data as string;
      } catch (_e) {
        // Fallback: Expo relay token (works if FCM V1 creds are set in Expo dashboard)
        try {
          const et = await Notifications.getExpoPushTokenAsync({ projectId: '8c13e622-0206-4e3f-ad33-8851c0f9353c' });
          token = et.data;
        } catch (_e2) {}
      }
      if (!token) return;
      await apiPost('/api/auth/save-fcm-token', { phone: userPhone, token, role: 'driver' });
      await AsyncStorage.setItem('fcmToken', token).catch(() => {});
    } catch (_e) {}
  };

  // ── Battery Optimization Prompt ───────────────
  // Indian phones (MIUI, ColorOS, MIUI, Realme) aggressively kill background processes
  // including FCM delivery. Ask once to disable battery restriction for this app.
  const promptBatteryOptimization = async () => {
    if (Platform.OS !== 'android') return;
    const shown = await AsyncStorage.getItem('batteryOptPromptShown').catch(() => null);
    if (shown) return;
    await AsyncStorage.setItem('batteryOptPromptShown', '1').catch(() => {});
    Alert.alert(
      '⚡ Enable Notifications',
      'To reliably get new ride requests:\n\n1. Tap "Turn Off"\n2. Select "Allow"\n\nThis lets the app send notifications even in the background.',
      [
        { text: 'Later', style: 'cancel' },
        {
          text: '✅ Turn Off',
          onPress: async () => {
            try {
              await Linking.sendIntent('android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', [
                { key: 'android.intent.extra.PACKAGE_NAME', value: 'com.saurabhspero.rideappdriver' },
              ]);
            } catch (_e) {
              Linking.openSettings();
            }
          },
        },
      ]
    );
  };
  // ── Android Back Button ───────────────────────
  useEffect(() => {
    const backAction = () => {
      if (screen === 'splash' || screen === 'permissions') return true;
      // Full-screen navigation: back exits nav and returns to the Live tab.
      if (inNavMode) { setInNavMode(false); setActiveTab('live'); return true; }
      if (screen === 'login' && regStep === 0) return false; // App exit
      if (screen === 'login' && regStep > 0) {
        if (regStep === 99) { setRegStep(0); return true; }
        setRegStep(regStep - 1); return true;
      }
      if (showChat) { setShowChat(false); return true; }
      if (tripSummary) return true; // Trip summary pe back nahi
      if (paymentWaiting) return true; // Payment waiting pe back nahi
      if (driverSubScreen !== '') { setDrSubScreen(''); return true; }
      if (activeTab !== 'home') { setActiveTab('home'); return true; }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [screen, regStep, showChat, activeTab, tripSummary, paymentWaiting, driverSubScreen, inNavMode]);

  // Refresh driver notifications when center is opened
  useEffect(() => {
    if (showNotifCenter && phone) fetchDriverNotifs(phone);
  }, [showNotifCenter]);

  // Load earnings-tab data when tab becomes active (not in render body — avoids infinite loop on network failure)
  useEffect(() => {
    if (activeTab === 'earnings' && phone) {
      if (!walletLoaded) { loadDriverWallet(phone); loadCommissionHistory(phone); }
      if (!earningsAnalytics) {
        apiGet(`/api/driver/earnings-analytics/${phone}`).then((d: any) => { if (!d._error) setEarningsAnalytics(d); }).catch(() => {});
      }
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'bonus' && phone && !bonusDash && !bonusLoading) {
      loadBonusDash(phone); loadBonusHistory(phone);
    }
  }, [activeTab]);

  // ── Polling rides ──────────────────────────────
  const startPolling = (dp: string) => {
    useDriverStore.getState().startPolling(dp, () => {
      Vibration.vibrate([0, 800, 200, 800, 200, 800]); // ~3 seconds
      setActiveTab('live');
      Notifications.scheduleNotificationAsync({
        content: {
          title: '🚖 New Ride Request!',
          body: 'A passenger is waiting — check it now!',
          sound: 'default',
          data: { type: 'new_ride' },
          ...(Platform.OS === 'android' ? { channelId: 'ride_requests_v2' } : {}),
        },
        trigger: null,
      }).catch(() => {});
    });
  };
  const stopPolling = () => {
    useDriverStore.getState().clearAll();
    setRideReq(null); setActiveRide(null);
  };

  const loadUpiId = async (ph: string) => {
    try { const r = await fetch(`${API}/api/driver/upi?phone=${ph}`); const d = await r.json(); setDriverUpiId(d.upi_id || ''); setUpiInput(d.upi_id || ''); } catch (_e) {}
  };
  const loadDriverOffers = async () => {
    try { const r = await fetch(`${API}/api/offers/active?role=driver`); const d = await r.json(); setDriverOffers(d.offers || []); } catch (_e) {}
  };
  const saveUpiId = async () => {
    if (!upiInput.trim()) return;
    setUpiSaving(true);
    try {
      const res = await fetch(`${API}/api/driver/upi`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, upi_id: upiInput.trim() }) });
      const d = await res.json();
      if (d.success) { setDriverUpiId(d.upi_id); setResult('✅ UPI ID saved!'); }
      else setResult('❌ ' + (d.error || 'Error'));
    } catch (_e) { setResult('❌ Server error'); }
    setUpiSaving(false);
  };

  const loadBonusDash = async (ph: string) => {
    setBonusLoading(true);
    try { const r = await fetch(`${API}/api/bonus/dashboard?phone=${ph}`); const d = await r.json(); setBonusDash(d); } catch (_e) {}
    setBonusLoading(false);
  };
  const loadBonusHistory = async (ph: string) => {
    try { const r = await fetch(`${API}/api/bonus/history?phone=${ph}`); const d = await r.json(); setBonusHistory(d.history || []); setBonusHistoryLoaded(true); } catch (_e) {}
  };
  const loadOrders = async (period: 'day'|'week'|'month', date: Date) => {
    if (!phone) return;
    setOrdersLoading(true);
    try {
      let from: string, to: string;
      const y = date.getFullYear(), mo = date.getMonth(), d = date.getDate();
      const pad = (n: number) => String(n).padStart(2, '0');
      if (period === 'day') {
        from = to = `${y}-${pad(mo+1)}-${pad(d)}`;
      } else if (period === 'week') {
        const dow = date.getDay();
        const mon = new Date(date); mon.setDate(d - (dow === 0 ? 6 : dow - 1));
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        from = `${mon.getFullYear()}-${pad(mon.getMonth()+1)}-${pad(mon.getDate())}`;
        to   = `${sun.getFullYear()}-${pad(sun.getMonth()+1)}-${pad(sun.getDate())}`;
      } else {
        from = `${y}-${pad(mo+1)}-01`;
        const last = new Date(y, mo+1, 0).getDate();
        to = `${y}-${pad(mo+1)}-${pad(last)}`;
      }
      const r = await fetch(`${API}/api/driver/order-history?phone=${phone}&from=${from}&to=${to}`);
      const data = await r.json();
      setOrdersData(data);
    } catch {}
    setOrdersLoading(false);
  };
  const loadReferralInfo = async () => {
    if (!phone) return;
    try {
      const r = await fetch(`${API}/api/referral/my-code?phone=${phone}`);
      const d = await r.json();
      if (d.code) { setReferralInfo(d); setReferralLoaded(true); }
    } catch (_e) {}
  };
  const openZoneNavigation = (zone: { lat: number; lng: number }) => {
    const url = `google.navigation:q=${zone.lat},${zone.lng}&mode=driving`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/?daddr=${zone.lat},${zone.lng}`)
    );
  };

  const fetchDemandZones = async () => {
    setZonesLoading(true);
    try {
      // GPS optional — backend defaults to city center if not provided
      const lat = driverGps?.lat ?? driverGps?.latitude ?? '';
      const lng = driverGps?.lng ?? driverGps?.longitude ?? '';
      const qs = lat && lng ? `?lat=${lat}&lng=${lng}` : '';
      const d = await apiGet(`/api/driver/demand-zones${qs}`);
      if (!d._error && Array.isArray(d.zones)) setDemandZones(d.zones);
    } catch (_e) {}
    setZonesLoading(false);
  };

  const fetchDriverLevel = async (ph: string) => {
    try {
      const d = await apiGet(`/api/driver/level/${ph}`);
      if (!d._error && d.level && Array.isArray(d.benefits)) setDriverLevel(d);
    } catch (_e) {}
  };

  const fetchDriverNotifs = async (ph: string) => {
    try {
      const d = await apiGet(`/api/notifications?target=${ph}&role=driver`);
      if (d.notifications && Array.isArray(d.notifications)) {
        setDriverNotifs(d.notifications);
        setNotifUnread(d.notifications.length);
      }
    } catch (_e) {}
  };

  const fetchDemandPrediction = async () => {
    try {
      const d = await apiGet('/api/driver/demand-prediction');
      if (!d._error) setDemandPrediction(d);
    } catch (_e) {}
  };

  const claimDailyBonus = async (rule_id: number, tier_index: number) => {
    setBonusClaiming(true); setBonusMsg('');
    try {
      const res = await fetch(`${API}/api/bonus/claim-daily`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, rule_id, tier_index }) });
      const d = await res.json();
      setBonusMsg(d.success ? '✅ ' + d.message : '❌ ' + (d.error || 'Error'));
      if (d.success) { loadBonusDash(phone); loadDriverWallet(phone); }
    } catch (_e) { setBonusMsg('❌ Server error'); }
    setBonusClaiming(false);
  };
  const claimStreakBonus = async () => {
    setBonusClaiming(true); setBonusMsg('');
    try {
      const res = await fetch(`${API}/api/bonus/claim-streak`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
      const d = await res.json();
      setBonusMsg(d.success ? '✅ ' + d.message : '❌ ' + (d.error || 'Error'));
      if (d.success) { loadBonusDash(phone); loadDriverWallet(phone); }
    } catch (_e) { setBonusMsg('❌ Server error'); }
    setBonusClaiming(false);
  };
  const redeemBonus = async () => {
    const amt = parseFloat(bonusRedeemAmt);
    if (isNaN(amt) || amt < 50) { setBonusMsg('❌ Minimum ₹50 required to redeem'); return; }
    setBonusRedeemLoading(true); setBonusMsg('');
    try {
      const res = await fetch(`${API}/api/bonus/redeem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, amount: amt }) });
      const d = await res.json();
      setBonusMsg(d.success ? '✅ ' + d.message : '❌ ' + (d.error || 'Error'));
      if (d.success) { setBonusRedeemAmt(''); loadBonusDash(phone); loadDriverWallet(phone); }
    } catch (_e) { setBonusMsg('❌ Server error'); }
    setBonusRedeemLoading(false);
  };

  const loadCommissionHistory = async (ph: string) => {
    try {
      const r = await fetch(`${API}/api/driver/commission-history?phone=${ph}`);
      const d = await r.json();
      setCommissionData({
        pending_commission: d.pending_commission || 0,
        total_commission: d.total_commission || 0,
        settled_commission: d.settled_commission || 0,
        records: d.records || [],
        payments: d.payments || [],
      });
    } catch (_e) {}
  };

  const loadDriverWallet = async (ph: string) => {
    try {
      const r = await fetch(`${API}/api/wallet/driver/detail?phone=${ph}`);
      const d = await r.json();
      setDriverWallet(d.wallet || { balance: 0, total_earned: 0, total_withdrawn: 0 });
      setDriverRideHistory(d.rides || []);
      setDriverHourlyHistory(d.hourly || []);
      setWalletLoaded(true);
    } catch (_e) {}
  };
  const requestPayout = async () => {
    const amt = parseFloat(payoutInput);
    if (!amt || amt < 100) { setResult('❌ Minimum ₹100 required for payout'); return; }
    if (amt > driverWallet.balance) { setResult('❌ Insufficient wallet balance'); return; }
    setPayoutLoading(true);
    try {
      const res = await fetch(`${API}/api/driver/payout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, amount: amt }) });
      const d = await res.json();
      if (d.success) {
        setResult('✅ ' + (d.message || 'Payout request submitted — admin will process within 24-48 hours'));
        setPayoutInput('');
      } else setResult('❌ ' + (d.message || d.error || 'Error'));
    } catch (_e) { setResult('❌ Server error'); }
    setPayoutLoading(false);
  };

  // ── Location tracking (foreground: UI updates + backend ping) ──────────────
  // Background task handles backend pings when app is minimized.
  useEffect(() => {
    if (!isOnline) return;
    let sub: Location.LocationSubscription | null = null;
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!mounted || status !== 'granted') return;
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 20 },
          ({ coords }) => {
            if (!mounted) return;
            setDriverGps({ lat: coords.latitude, lng: coords.longitude });
            // Retry once on failure — handles Jio packet drops
            const body = JSON.stringify({ phone, lat: coords.latitude, lng: coords.longitude });
            fetch(`${API}/api/driver/update-location`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
              .catch(() => new Promise(r => setTimeout(r, 2000)).then(() =>
                fetch(`${API}/api/driver/update-location`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {})
              ));
          }
        );
      } catch (_e) {}
    })();
    return () => { mounted = false; sub?.remove(); };
  }, [isOnline, phone]);

  // ── Keep gpsRef in sync (for use inside intervals) ──
  useEffect(() => { driverGpsRef.current = driverGps; }, [driverGps]);

  // ── Voice navigation ──
  const navPhase = activeRide?.status === 'started' ? 'to_drop' : 'to_pickup';
  const navActive = !!activeRide && (activeRide.status === 'matched' || activeRide.status === 'started') && !navMuted;
  const navDestLat = navPhase === 'to_pickup' ? parseFloat(activeRide?.pickup_lat) || null : parseFloat(activeRide?.drop_lat) || null;
  const navDestLng = navPhase === 'to_pickup' ? parseFloat(activeRide?.pickup_lng) || null : parseFloat(activeRide?.drop_lng) || null;
  const { currentInstruction: navInstruction, currentManeuver: navManeuver, nextDistM: navDist } = useVoiceNav({
    driverLat: driverGps?.lat ?? null,
    driverLng: driverGps?.lng ?? null,
    destLat: navActive ? navDestLat : null,
    destLng: navActive ? navDestLng : null,
    active: navActive,
    phase: navPhase,
  });

  // ── Auto-exit in-app nav mode when ride ends ──
  useEffect(() => { if (!activeRide) setInNavMode(false); }, [activeRide]);

  // Keep screen awake while navigating (never let it sleep mid-route).
  useEffect(() => {
    if (!KeepAwake) return;
    try {
      if (inNavMode) (KeepAwake.activateKeepAwakeAsync || KeepAwake.activateKeepAwake)?.('sppero-nav');
      else (KeepAwake.deactivateKeepAwake)?.('sppero-nav');
    } catch (_e) {}
    return () => { try { KeepAwake.deactivateKeepAwake?.('sppero-nav'); } catch (_e) {} };
  }, [inNavMode]);

  // ── Live location posting to backend during active ride (every 4s) ──
  useEffect(() => {
    if (!activeRide?.id || !phone) return;
    const iv = setInterval(() => {
      const gps = driverGpsRef.current;
      if (!gps) return;
      apiPost(`/api/rides/${activeRide.id}/driver-location`, {
        lat: gps.lat ?? gps.latitude,
        lng: gps.lng ?? gps.longitude,
        phone,
      }).catch(() => {});
    }, 4000);
    return () => clearInterval(iv);
  }, [activeRide?.id, phone]);

  // ── Live distance to pickup (matched / arrived) ──
  useEffect(() => {
    if (!activeRide || !driverGps) { setDistToPickup(''); return; }
    if ((activeRide.status === 'matched' || activeRide.status === 'arrived') && activeRide.pickup_lat && activeRide.pickup_lng) {
      const km = haversineKm(driverGps.lat, driverGps.lng, parseFloat(activeRide.pickup_lat), parseFloat(activeRide.pickup_lng));
      setDistToPickup(km < 1 ? tp('dist_to_pickup_m', { n: String(Math.round(km * 1000)) }) : tp('dist_to_pickup_km', { n: km.toFixed(1) }));
    } else {
      setDistToPickup('');
    }
  }, [driverGps?.lat, driverGps?.lng, activeRide?.status]);

  // ── Live remaining time/distance during trip (started) ──
  useEffect(() => {
    if (activeRide?.status !== 'started') { setTripRemainingEta(''); return; }
    const fetchRemaining = async () => {
      const gps = driverGpsRef.current;
      if (!gps || !activeRide?.drop_lat || !activeRide?.drop_lng) return;
      try {
        const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${gps.lat},${gps.lng}&destinations=${activeRide.drop_lat},${activeRide.drop_lng}&key=${MAPS_KEY}`);
        const data = await res.json();
        const el = data.rows?.[0]?.elements?.[0];
        if (el?.status === 'OK') setTripRemainingEta(el.duration.text + ' · ' + el.distance.text + ' baaki');
      } catch (_e) {}
    };
    fetchRemaining();
    const iv = setInterval(fetchRemaining, 30000);
    return () => clearInterval(iv);
  }, [activeRide?.status, activeRide?.id]);

  // ── Alarm ringtone: loop while ride request is pending, stop otherwise ───────
  useEffect(() => {
    let active = true;
    if (rideReq) {
      Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false }).catch(() => {});
      const sound = new Audio.Sound();
      alarmSoundRef.current = sound;
      sound.loadAsync(require('./assets/sounds/ride_alert.wav')).then(() => {
        if (!active) { sound.unloadAsync().catch(() => {}); return; }
        sound.setIsLoopingAsync(true).catch(() => {});
        sound.playAsync().catch(() => {});
      }).catch(() => {});
    } else {
      const s = alarmSoundRef.current;
      if (s) {
        alarmSoundRef.current = null;
        s.stopAsync().catch(() => {}).finally(() => s.unloadAsync().catch(() => {}));
      }
    }
    return () => {
      active = false;
      const s = alarmSoundRef.current;
      if (s) {
        alarmSoundRef.current = null;
        s.stopAsync().catch(() => {}).finally(() => s.unloadAsync().catch(() => {}));
      }
    };
  }, [rideReq?.id]);

  // ── Pre-queue offer sound: play ride_alert once (no loop) when a queued ride is offered ──
  useEffect(() => {
    if (!preQueued) {
      const s = preQueueSoundRef.current;
      if (s) { preQueueSoundRef.current = null; s.stopAsync().catch(() => {}).finally(() => s.unloadAsync().catch(() => {})); }
      return;
    }
    let active = true;
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false }).catch(() => {});
    const sound = new Audio.Sound();
    preQueueSoundRef.current = sound;
    sound.loadAsync(require('./assets/sounds/ride_alert.wav')).then(() => {
      if (!active) { sound.unloadAsync().catch(() => {}); return; }
      sound.setIsLoopingAsync(false).catch(() => {});
      sound.playAsync().catch(() => {});
    }).catch(() => {});
    return () => {
      active = false;
      const s = preQueueSoundRef.current;
      if (s) { preQueueSoundRef.current = null; s.stopAsync().catch(() => {}).finally(() => s.unloadAsync().catch(() => {})); }
    };
  }, [preQueued?.rideId]);

  // ── Auto-switch to Live tab when a ride or request appears ──
  useEffect(() => {
    if (rideReq || activeRide || hourlyRideReq || activeHourlyRide) {
      setActiveTab('live');
    }
  }, [!!rideReq, !!activeRide, !!hourlyRideReq, !!activeHourlyRide]);

  // ── Auto-accept high-surge rides ──
  useEffect(() => {
    if (!autoAcceptSurge || !rideReq || activeRide || surgeMultiplier < 1.5) return;
    const t = setTimeout(() => { acceptRide(); }, 800); // small delay so UI can show briefly
    return () => clearTimeout(t);
  }, [rideReq?.id, autoAcceptSurge, surgeMultiplier]);

  // ── Chat polling ───────────────────────────────
  useEffect(() => {
    if (!showChat || !activeRide?.id) return;
    const load = async () => {
      try { const r = await fetch(`${API}/api/chat/${activeRide.id}`); const d = await r.json(); setChatMsgs(d.messages || []); lastChatCount.current = (d.messages || []).length; setUnreadChat(0); } catch (_e) {}
    };
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [showChat, activeRide?.id]);

  // ── Hourly chat polling ──────────────────────
  useEffect(() => {
    if (!showHourlyChat || !activeHourlyRide?.id) return;
    const load = async () => {
      try {
        const r = await fetch(`${API}/api/chat/h_${activeHourlyRide.id}`);
        const d = await r.json();
        if (Array.isArray(d.messages)) setHourlyChatMsgs(d.messages);
      } catch (_e) {}
    };
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [showHourlyChat, activeHourlyRide?.id]);

  const sendHourlyChat = async (text?: string) => {
    const msg = (text ?? hourlyChatInput).trim();
    if (!msg || !activeHourlyRide?.id) return;
    if (!text) setHourlyChatInput('');
    try {
      const res = await fetch(`${API}/api/chat/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ride_id: `h_${activeHourlyRide.id}`, sender: 'driver', message: msg }) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert('', err.error || 'Message not sent — try again.');
        if (!text) setHourlyChatInput(msg);
        return;
      }
      const r = await fetch(`${API}/api/chat/h_${activeHourlyRide.id}`);
      const d = await r.json();
      if (Array.isArray(d.messages)) setHourlyChatMsgs(d.messages);
    } catch (_e) {
      Alert.alert('', 'Network error — check connection and try again.');
      if (!text) setHourlyChatInput(msg);
    }
  };

  // ── Hourly ride polling ───────────────────────
  useEffect(() => {
    if (!isOnline || !phone) return;
    let stopped = false;
    let busy = false;
    const doPoll = async () => {
      if (stopped || busy) return;
      busy = true;
      try {
        const active = await fetch(`${API}/api/hourly/driver-active?phone=${phone}`).then(r => r.json());
        if (active.booking && !['completed','cancelled'].includes(active.booking.status)) {
          setActiveHourlyRide(active.booking);
          setHourlyRideReq(null);
          busy = false; return;
        }
        setActiveHourlyRide(null);
        if (!activeRide) {
          const pending = await fetch(`${API}/api/hourly/driver-pending?phone=${phone}`).then(r => r.json());
          if (pending.booking) setHourlyRideReq(pending.booking);
          else setHourlyRideReq(null);
        }
      } catch (_e) {}
      busy = false;
    };
    triggerHourlyPollRef.current = doPoll;
    const iv = setInterval(doPoll, 4000);
    return () => { stopped = true; triggerHourlyPollRef.current = null; clearInterval(iv); };
  }, [isOnline, phone, activeRide?.id]);

  // Extension request polling — active for 15 min after trip summary shown
  useEffect(() => {
    if (!tripSummary || !phone || tripSummary.isHourly) return;
    let stopped = false;
    const iv = setInterval(async () => {
      if (stopped) return;
      try {
        const d = await fetch(`${API}/api/rides/extension-pending?phone=${phone}`).then(r => r.json());
        if (d.extension) {
          setExtRequest(d.extension);
          setExtRespSec(d.extension.seconds_left ?? 60);
        } else if (!d.extension && extRequest?.status !== 'accepted') {
          setExtRequest(null);
        }
      } catch (_e) {}
    }, 2500);
    return () => { stopped = true; clearInterval(iv); };
  }, [tripSummary, phone]);

  // Extension response countdown — paused while accept is loading
  const extAccLoadingRef = useRef(false);
  useEffect(() => { extAccLoadingRef.current = extAccLoading; }, [extAccLoading]);
  useEffect(() => {
    if (!extRequest) return;
    setExtRespSec(extRequest.seconds_left ?? 60);
    const iv = setInterval(() => setExtRespSec(s => {
      if (extAccLoadingRef.current) return s; // don't count down while accepting
      if (s <= 1) { clearInterval(iv); setExtRequest(null); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(iv);
  }, [extRequest?.id]);

  const acceptExtension = async () => {
    if (!extRequest) return;
    const extId = extRequest.id;
    const extDrop = extRequest.new_drop;
    const extFare = extRequest.estimated_fare;
    setExtAccLoading(true);
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(`${API}/api/rides/extension-accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ extension_id: extId }), signal: ctrl.signal });
      const data = await res.json();
      if (data.success) {
        const rideRes = await fetch(`${API}/api/rides/status/${data.new_ride_id}`, { signal: ctrl.signal }).then(r => r.json()).catch(() => ({}));
        const newRide = rideRes.ride || { id: data.new_ride_id, drop_location: extDrop, fare: extFare, status: 'matched', payment_method: 'wallet' };
        setActiveRide({ ...newRide, id: data.new_ride_id });
        setExtRequest(null); setTripSummary(null);
      } else { Alert.alert('Extension Accept Failed', data.error || 'Accept failed — please try again'); }
    } catch (_e) { Alert.alert('Network Error', _e instanceof Error && _e.name === 'AbortError' ? 'Request timeout — please retry' : 'Could not connect to server'); }
    clearTimeout(timeout);
    setExtAccLoading(false);
  };

  const rejectExtension = async () => {
    if (!extRequest) return;
    try { await fetch(`${API}/api/rides/extension-reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ extension_id: extRequest.id }) }); } catch (_e) {}
    setExtRequest(null);
  };

  // Hourly trip timer
  useEffect(() => {
    if (activeHourlyRide?.status === 'active') {
      if (hourlyTimerRef.current) clearInterval(hourlyTimerRef.current);
      const startMs = activeHourlyRide.started_at ? new Date(activeHourlyRide.started_at).getTime() : Date.now();
      hourlyTimerRef.current = setInterval(() => setHourlyTimerSec(Math.floor((Date.now() - startMs) / 1000)), 1000);
      return () => { if (hourlyTimerRef.current) clearInterval(hourlyTimerRef.current); };
    }
  }, [activeHourlyRide?.status, activeHourlyRide?.started_at]);

  // Reset KM counter when new hourly ride starts
  useEffect(() => {
    setLiveKm(0);
    prevHourlyGpsRef.current = null;
  }, [activeHourlyRide?.id]);

  useEffect(() => {
    activeHourlyRideRef.current = activeHourlyRide;
    setHourlyArrived(false);
    if (activeHourlyRide?.id && socketRef.current?.connected) {
      socketRef.current.emit('joinHourly', { bookingId: activeHourlyRide.id });
    }
  }, [activeHourlyRide?.id]);

  // Accumulate GPS distance during active hourly ride
  useEffect(() => {
    if (activeHourlyRide?.status !== 'active' || !driverGps) return;
    if (prevHourlyGpsRef.current) {
      const dist = haversineKm(prevHourlyGpsRef.current.lat, prevHourlyGpsRef.current.lng, driverGps.lat, driverGps.lng);
      // Filter noise (< 20m) and GPS jumps (> 2km in 5s = impossible)
      if (dist > 0.02 && dist < 2.0) setLiveKm(k => k + dist);
    }
    prevHourlyGpsRef.current = driverGps;
  }, [driverGps]);

  // ── Unread badge + toast during standard ride ──
  useEffect(() => {
    if (!activeRide?.id || showChat) return;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/chat/${activeRide.id}`);
        const d = await r.json();
        const msgs = d.messages || [];
        if (msgs.length > lastChatCount.current) {
          setUnreadChat(msgs.length - lastChatCount.current);
          const latest = msgs[msgs.length - 1];
          if (latest?.sender === 'customer') {
            setChatToast(latest.message);
            if (chatToastTimer.current) clearTimeout(chatToastTimer.current);
            chatToastTimer.current = setTimeout(() => setChatToast(null), 3000);
          }
        }
      } catch (_e) {}
    }, 3000);
    return () => clearInterval(iv);
  }, [activeRide?.id, showChat]);

  // ── Unread toast during hourly ride (background) ──
  useEffect(() => {
    if (!activeHourlyRide?.id || showHourlyChat) return;
    let lastCount = 0;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/chat/h_${activeHourlyRide.id}`);
        const d = await r.json();
        const msgs = d.messages || [];
        if (msgs.length > lastCount) {
          const latest = msgs[msgs.length - 1];
          if (latest?.sender === 'customer') {
            setChatToast(latest.message);
            if (chatToastTimer.current) clearTimeout(chatToastTimer.current);
            chatToastTimer.current = setTimeout(() => setChatToast(null), 3000);
          }
          lastCount = msgs.length;
        }
      } catch (_e) {}
    }, 3000);
    return () => { clearInterval(iv); };
  }, [activeHourlyRide?.id, showHourlyChat]);


  // ── Surge + Admin Notifications polling ───────────────
  useEffect(() => {
    if (screen !== 'home' || !phone) return;
    const fetchSurge = async () => {
      try {
        const r = await fetch(`${API}/api/hourly/fares`);
        const d = await r.json();
        setSurgeMultiplier(parseFloat(d.surge) || 1.0);
      } catch (_e) {}
    };
    const fetchNotif = async () => {
      try {
        const r = await fetch(`${API}/api/notifications/latest?phone=${phone}`);
        const d = await r.json();
        if (d.notification) setAdminNotif(d.notification);
      } catch (_e) {}
    };
    fetchSurge();
    fetchNotif();
    const iv = setInterval(fetchNotif, 30000);
    return () => clearInterval(iv);
  }, [screen, phone]);

  // ── Load referral info + favourite count when profile tab opens ─────────
  useEffect(() => {
    if (activeTab === 'profile' && phone) {
      if (!referralLoaded) loadReferralInfo();
      fetch(`${API}/api/favourites/driver-count?phone=${phone}`)
        .then(r => r.json()).then(d => setFavouriteCount(d.count ?? 0)).catch(() => {});
    }
  }, [activeTab, phone]);

  // ── Navigate ───────────────────────────────────
  const navigateTo = (location: string, lat?: number, lng?: number) => {
    // Coordinates available hain toh use karo (accurate)
    if (lat && lng) {
      const url = `google.navigation:q=${lat},${lng}`;
      Linking.openURL(url).catch(() => 
        Linking.openURL(`https://maps.google.com/?daddr=${lat},${lng}`)
      );
    } else {
      // Fallback — address se
      const url = `google.navigation:q=${encodeURIComponent(location)}`;
      Linking.openURL(url).catch(() => 
        Linking.openURL(`https://maps.google.com/?daddr=${encodeURIComponent(location)}`)
      );
    }
  };

  // ── ETA ────────────────────────────────────────
  const fetchEta = async (origin: string, dest: string) => {
    try {
      const res  = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(dest)}&key=${MAPS_KEY}`);
      const data = await res.json();
      const el   = data.rows?.[0]?.elements?.[0];
      if (el?.status === 'OK') setEta(el.duration.text + ' · ' + el.distance.text);
    } catch (_e) {}
  };

  // ── Login ──────────────────────────────────────
  const doLogin = async () => {
    if (loginPhone.length !== 10) { setResult('❌ Enter a 10 digit number'); return; }
    setLoading(true);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const otpRes = await fetch(`${API}/api/auth/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: loginPhone }), signal: ctrl.signal });
      clearTimeout(timer);
      const otpData = await otpRes.json();
      if (otpData.error) { setResult('❌ ' + otpData.error); setLoading(false); return; }
      if (otpData.otp) setDevOtp(otpData.otp);
      setLoginOtpSent(true);
      setLoginResendTimer(60); setLoginCanResend(false);
      setResult('');
    } catch (_e: any) {
      const isTimeout = _e?.name === 'AbortError';
      const errMsg = isTimeout ? 'Connection timeout' : (_e?.message || 'Network error');
      setResult(`❌ ${errMsg}\nTry using Wi-Fi or a different network`);
    }
    setLoading(false);
  };

  const verifyLoginOtp = async (otpOverride?: string) => {
    const otpToUse = otpOverride || loginOtp;
    if (!otpToUse || otpToUse.length !== 6) { setResult('❌ Enter a 6 digit OTP'); return; }
    setLoading(true);
    try {
      // OTP verify karo
      const verRes = await fetch(`${API}/api/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: loginPhone, otp: otpToUse, name: '' }) });
      const verData = await verRes.json();
      if (!verData.token) { setResult('❌ ' + (verData.error || 'Incorrect OTP')); setLoading(false); return; }

      // Driver info lo
      const res = await fetch(`${API}/api/driver/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: loginPhone }) });
      const data = await res.json();
      if (!data.success) { setResult('❌ ' + data.message); setLoading(false); return; }
      if (data.driver.status === 'approved') {
        const pd2 = await AsyncStorage.getItem('_permsDone').catch(() => null);
        setPhone(data.driver.phone); setDriverInfo(data.driver); setResult('');
        await AsyncStorage.setItem('driverPhone', data.driver.phone);
        await AsyncStorage.setItem('driverInfo', JSON.stringify(data.driver));
        registerFCM(data.driver.phone);
        loadUpiId(data.driver.phone); loadDriverOffers(); fetchDriverLevel(data.driver.phone); fetchDriverNotifs(data.driver.phone); loadDriverSub(data.driver.phone, data.driver.vehicle_type);
        setScreen(pd2 ? 'home' : 'permissions');
      } else { setDriverInfo(data.driver); }
    } catch (_e) { setResult('❌ Server error'); }
    setLoading(false);
  };

  // Login OTP digit handler
  const handleLoginOtpChange = (text: string, index: number) => {
    const newDigits = [...loginOtpDigits];
    newDigits[index] = text.replace(/[^0-9]/g, '').slice(-1);
    setLoginOtpDigits(newDigits);
    setLoginOtp(newDigits.join(''));
    if (text && index < 5) loginOtpRefs.current[index + 1]?.focus();
    if (newDigits.filter(d => d !== '').length === 6) {
      setTimeout(() => verifyLoginOtp(newDigits.join('')), 300);
    }
  };

  const handleLoginOtpKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !loginOtpDigits[index] && index > 0) {
      loginOtpRefs.current[index - 1]?.focus();
    }
  };

  // Resend timer
  useEffect(() => {
    if (!loginOtpSent) return;
    const iv = setInterval(() => {
      setLoginResendTimer(t => {
        if (t <= 1) { clearInterval(iv); setLoginCanResend(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [loginOtpSent]);

  // ── Registration ───────────────────────────────
  const updateReg = (field: string, value: string) => setRegData((p: any) => ({ ...p, [field]: value }));

  useEffect(() => {
    if (uploading) {
      scanLineAnim.setValue(0);
      Animated.loop(
        Animated.timing(scanLineAnim, { toValue: 1, duration: 1800, useNativeDriver: true })
      ).start();
    } else {
      scanLineAnim.stopAnimation();
      scanLineAnim.setValue(0);
    }
  }, [uploading]);

  const doUpload = async (field: string, base64: string) => {
    setUploading(field);
    try {
      const up   = await fetch(`${API}/api/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: `data:image/jpeg;base64,${base64}` }) });
      const data = await up.json();
      if (data.success) setRegData((p: any) => ({ ...p, [field]: data.url }));
      else setResult('❌ Upload failed');
    } catch (_e) { setResult('❌ Upload error'); }
    setUploading('');
  };

  const fromCamera = async (field: string) => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) { setResult('❌ Please grant camera permission'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true, cameraType: field === 'face_photo' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back });
    if (!r.canceled && r.assets?.[0]?.base64) doUpload(field, r.assets[0].base64);
  };

  const fromGallery = async (field: string) => {
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) { setResult('❌ Please grant gallery permission'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, base64: true });
    if (!r.canceled && r.assets?.[0]?.base64) doUpload(field, r.assets[0].base64);
  };

  const submitRegistration = async () => {
    if (loading) return;
    setLoading(true); setResult('');
    try {
      const res  = await fetch(`${API}/api/driver/register-buddy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...regData, name: regData.dl_name }) });
      const data = await res.json();
      if (data.success) setRegStep(99);
      else setResult('❌ ' + (data.error || 'Registration failed'));
    } catch (_e) { setResult('❌ Server error'); }
    setLoading(false);
  };

  // ── Online toggle ──────────────────────────────
  const toggleOnline = async (val: boolean) => {
    setIsOnline(val);
    if (val) {
      // Try to start background location tracking.
      // If granted → foreground service notification is shown by the location task
      //              (shows "🟢 Sppero Buddy — Online | Location active" in status bar)
      // If denied  → fall back to a custom persistent notification for process priority
      const bgStarted = await startBgLocation();
      if (!bgStarted) {
        Notifications.scheduleNotificationAsync({
          identifier: 'driver_online_status',
          content: {
            title: '🟢 Sppero Buddy — Online',
            body: "You'll receive ride requests. You can lock your screen — notifications will still come through.",
            sticky: true,
            autoDismiss: false,
            data: { type: 'driver_status' },
            ...(Platform.OS === 'android' ? { channelId: 'driver_status' } : {}),
          },
          trigger: null,
        }).then(id => { onlineNotifIdRef.current = id; }).catch(() => {});

      }

      // Refresh FCM token every time driver goes online — prevents stale token failures
      registerFCM(phone).catch(() => {});

      // Start polling + socket IMMEDIATELY — don't wait for server roundtrip
      setResult('🟢 Online — rides will start coming!');
      (globalThis as any).__driverPhone = phone; // for AppState wallet refresh
      startPolling(phone);
      fetchDemandZones();
      fetchDemandPrediction();
      if (zonesIntervalRef.current) clearInterval(zonesIntervalRef.current);
      zonesIntervalRef.current = setInterval(fetchDemandZones, 120000); // every 2 min
      loadDriverOffers();
      if (!socketRef.current) {
        const s = io(API, {
          transports: ['polling', 'websocket'], // polling first — passes through Jio/BSNL carrier NAT; upgrades to WebSocket when stable
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 2000,
          reconnectionDelayMax: 10000,
          timeout: 10000,
        });
        s.on('connect', () => {
          s.emit('driverJoin', { phone });
          // Re-join active ride/hourly room on reconnect so we don't miss payment/chat events
          const ar = useDriverStore.getState().activeRide;
          if (ar?.id) s.emit('joinRide', { rideId: ar.id });
          const ahr = activeHourlyRideRef.current;
          if (ahr?.id) s.emit('joinHourly', { bookingId: ahr.id });
        });
        s.on('hourlyChatMessage', (msg: any) => {
          setHourlyChatMsgs((prev: any[]) => [...prev, msg]);
        });
        s.on('hourlyExtendRequest', (data: any) => {
          setActiveHourlyRide((p: any) => p ? { ...p, extend_requested_hours: data.extra_hours, extend_escrow: data.extra_fare } : p);
          Vibration.vibrate([0, 400, 200, 400]);
        });
        // Broadcast system: newRideRequest sent to ALL drivers in radius simultaneously
        s.on('newRideRequest', () => { useDriverStore.getState().triggerPoll?.(); });
        s.on('newRideAssigned', () => { useDriverStore.getState().triggerPoll?.(); }); // backward compat
        s.on('newHourlyRideRequest', () => {
          Vibration.vibrate([0, 600, 150, 600, 150, 600]);
          triggerHourlyPollRef.current?.();
        });

        // Another driver accepted first — clear the pending ride immediately
        s.on('rideTaken', () => {
          useDriverStore.setState({ pendingRide: null });
          setRideReq(null);
          setResult('❌ Another driver took the ride');
          setTimeout(() => setResult(''), 3000);
        });
        s.on('paymentConfirmed', async (data: any) => {
          if (data.status !== 'completed') return;
          try {
            const res = await fetch(`${API}/api/rides/payment-status/${data.ride_id}`);
            const d = await res.json();
            if (d.payment_status === 'completed') {
              const fare = d.net_fare != null ? parseFloat(d.net_fare) : Math.max(0, parseFloat(d.fare || 0) - parseFloat(d.discount || 0));
              setPaymentMethod(d.payment_method || '');
              setPaymentWaiting(false);
              setTripSummary({
                fare: '₹' + fare.toFixed(0),
                payment_method: d.payment_method,
                earned: '₹' + (fare * 0.85).toFixed(0),
                fee: '₹' + (fare * 0.15).toFixed(0),
              });
            }
          } catch (_e) {}
        });
        // Pre-assignment: a new customer ride is offered while this driver is still active
        s.on('preRideQueued', (data: any) => {
          setPreQueued({ rideId: data.rideId, pickup: data.pickup, fare: data.fare, rideType: data.rideType, etaMin: data.etaMin ?? 8 });
          setPreQueueAccepted(false);
          // Auto-dismiss 10s before server timeout (server gives 180s, we clear at 170s)
          setTimeout(() => {
            setPreQueued(prev => (prev?.rideId === data.rideId ? null : prev));
          }, 170 * 1000);
        });
        s.on('preRideCancelled', (data: any) => {
          setPreQueued(prev => {
            if (prev?.rideId === data.rideId) { setResult('🚫 Queued ride was cancelled by customer'); return null; }
            return prev;
          });
          setPreQueueAccepted(false);
        });
        s.on('preRideActivated', (data: any) => {
          // Driver's queued ride is now fully assigned — store it, show after trip summary dismissed
          setPendingActivatedRide({ id: data.rideId, pickup: data.pickup, drop_location: data.dropLocation, fare: data.fare, ride_type: data.rideType, status: 'matched' });
          setPreQueued(null);
        });
        s.on('chatMessage', (msg: any) => {
          setChatMsgs((prev: any[]) => [...prev, msg]);
          setUnreadChat((prev: number) => prev + 1);
        });
        s.on('zoneAlertReceived', (alert: ZoneAlert) => {
          setZoneAlert(alert);
        });
        s.on('zoneAlertSent', ({ count }: { count: number }) => {
          setZoneAlertSentCount(count);
          setTimeout(() => setZoneAlertSentCount(null), 3000);
        });
        s.on('fareSettingsUpdated', () => {
          // Refresh fare rates if user is currently viewing the fare-rates sub-screen
          setDrFares([]);
          fetch(`${API}/api/fare-settings`)
            .then(r => r.json())
            .then(d => { if (d.fares) setDrFares(d.fares); })
            .catch(() => {});
        });
        socketRef.current = s;
        (globalThis as any).__driverSocket = s;
      }
      // Tell server we're online — retry aggressively in background
      (async () => {
        for (let i = 0; i < 8; i++) {
          const r = await apiPost('/api/driver/toggle-online', { phone, is_online: true });
          if (!r._error) return;
          await new Promise(res => setTimeout(res, 2000));
        }
      })();
    } else {
      setResult('🔴 Offline');
      // Stop background location task (also removes foreground service notification)
      stopBgLocation().catch(() => {});
      // Dismiss fallback notification if it was showing (permission-denied path)
      if (onlineNotifIdRef.current) {
        Notifications.dismissNotificationAsync(onlineNotifIdRef.current).catch(() => {});
        onlineNotifIdRef.current = null;
      }
      if (zonesIntervalRef.current) { clearInterval(zonesIntervalRef.current); zonesIntervalRef.current = null; }
      setDemandZones([]);
      stopPolling();
      socketRef.current?.disconnect();
      socketRef.current = null;
      (globalThis as any).__driverSocket = null;
      // Offline update — fire and forget with retry
      (async () => {
        for (let i = 0; i < 5; i++) {
          const r = await apiPost('/api/driver/toggle-online', { phone, is_online: false });
          if (!r._error) return;
          await new Promise(res => setTimeout(res, 2000));
        }
      })();
    }
  };

  // ── Ride actions ───────────────────────────────
  const acceptRide = async () => {
    if (!rideReq) return;
    setLoading(true);
    const data = await apiPost('/api/rides/accept', { ride_id: rideReq.id, driver_phone: phone });
    if (data._error) {
      setResult('❌ ' + data.message);
    } else if (data.success) {
      setResult('✅ Ride accepted!');
      socketRef.current?.emit('joinRide', { rideId: rideReq.id });
      // Clear store + React state immediately so subscription can't restore stale rideReq
      useDriverStore.setState({ pendingRide: null });
      setRideReq(null);
      fetchEta(rideReq.pickup, rideReq.drop_location);
      // Trigger an immediate poll so activeRide populates in <1s instead of waiting 2s
      useDriverStore.getState().triggerPoll();
    } else {
      setResult('❌ ' + (data.message || 'The ride went to another driver'));
      useDriverStore.setState({ pendingRide: null });
      setRideReq(null);
    }
    setLoading(false);
  };
  const rejectRide = async () => {
    const req = rideReq;
    useDriverStore.setState({ pendingRide: null });
    setRideReq(null);
    useDriverStore.getState().clearAll();
    if (isOnline) startPolling(phone);
    setResult('❌ Ride rejected');
    if (req?.id) {
      // apiPost has 10s timeout — raw fetch can hang indefinitely and block queue advancement
      apiPost('/api/rides/reject-offer', { ride_id: req.id, driver_phone: phone }).catch(() => {});
    }
  };

  const markArrived = async () => {
    setLoading(true);
    const data = await apiPost('/api/rides/arrived', { ride_id: activeRide.id, driver_phone: phone });
    if (data._error) setResult('❌ ' + data.message);
    else setActiveRide({ ...activeRide, status: 'arrived' });
    setLoading(false);
  };

  const startTrip = async () => {
    if (otpInput.length !== 4) { setResult('❌ Enter a 4 digit OTP'); return; }
    setLoading(true);
    const data = await apiPost('/api/rides/start', { ride_id: activeRide.id, otp: otpInput, driver_phone: phone });
    if (data._error) setResult('❌ ' + data.message);
    else if (data.success) { setActiveRide({ ...activeRide, status: 'started' }); setOtpInput(''); setResult(''); }
    else setResult('❌ ' + (data.message || 'Incorrect OTP!'));
    setLoading(false);
  };

  const completeTrip = async () => {
    const rideId = activeRide?.id;
    const rideFare = String(activeRide?.fare || '0');
    const ridePMethod = activeRide?.payment_method || '';
    const dropLat = activeRide?.drop_lat ? parseFloat(activeRide.drop_lat) : null;
    const dropLng = activeRide?.drop_lng ? parseFloat(activeRide.drop_lng) : null;
    const curLat = driverGps?.lat;
    const curLng = driverGps?.lng;

    // GPS early-completion guard: warn if >800m from drop point
    if (dropLat && dropLng && curLat && curLng) {
      const R = 6371;
      const dLat = (dropLat - curLat) * Math.PI / 180;
      const dLon = (dropLng - curLng) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(curLat*Math.PI/180)*Math.cos(dropLat*Math.PI/180)*Math.sin(dLon/2)**2;
      const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

      if (distKm > 0.8) {
        const confirm = await new Promise<boolean>(resolve => {
          distWarnResolveRef.current = resolve;
          setDistWarnModal({ dist: distKm.toFixed(1) });
        });
        if (!confirm) return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/api/rides/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ride_id: rideId, driver_phone: phone, driver_lat: curLat, driver_lng: curLng }),
      });
      let data: any = {};
      try { data = await res.json(); } catch (_e) {}
      if (res.ok || data.success) {
        if (data.early_completion) {
          setEarlyFlagModal({ dist: data.dist_from_drop });
        }
        // Use net fare from API (actual recalculated fare minus coupon discount).
        // Fallback: subtract discount from estimate if API didn't return fare.
        const discountAmt = parseFloat(String(activeRide?.discount || '0')) || 0;
        const netFare = data.fare != null
          ? Math.round(data.fare)
          : Math.max(0, Math.round(parseFloat(rideFare)) - Math.round(discountAmt));
        // Advance rides: the customer already prepaid 1/3 online — collect only
        // the REMAINING at drop, never the full fare (that would double-charge).
        const advanceAmt = parseFloat(String(activeRide?.advance_amount || '0')) || 0;
        const collectFare = Math.max(0, netFare - advanceAmt);
        setPaymentRideId(rideId);
        setPaymentFare(String(collectFare));
        setPaymentMethod(ridePMethod);
        setPaymentWaiting(true);
        setEarnings(e => e + netFare);
        setRides(r => r + 1);
        setLastRideId(rideId);
        setActiveRide(null);
        setOtpInput(''); setShowChat(false); setUnreadChat(0); setChatMsgs([]);
      } else {
        setResult('❌ ' + (data.message || data.error || 'Could not complete — please retry'));
      }
    } catch (_e) {
      setResult('❌ Network error — check your internet and retry');
    }
    setLoading(false);
  };

  // Reset customer rating when tripSummary clears
  useEffect(() => { if (!tripSummary) { setCustRatingStars(0); setCustRatingDone(false); } }, [tripSummary]);

  // Load bank details when bank sub-screen opens
  useEffect(() => {
    if (driverSubScreen === 'bank' && phone) {
      setBankMsg(''); setBankEditing(false);
      if (!bankLoaded) {
        fetch(`${API}/api/driver/bank?phone=${phone}`)
          .then(r => r.json()).then(d => {
            setBankAccount(d.bank_account || ''); setBankIfsc(d.bank_ifsc || ''); setBankHolder(d.bank_holder || '');
            setBankLoaded(true);
          }).catch(() => {});
      }
    }
  }, [driverSubScreen, phone]);

  const rateCustomer = async () => {
    if (!custRatingStars || !paymentRideId) return;
    try {
      await fetch(`${API}/api/rides/rate-customer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ride_id: paymentRideId, driver_phone: phone, rating: custRatingStars }),
      });
    } catch (_e) {}
    setCustRatingDone(true);
  };

  const saveBank = async () => {
    if (!bankAccount.trim() || !bankIfsc.trim()) { setBankMsg('❌ Both account number and IFSC are required'); return; }
    setBankSaving(true); setBankMsg('');
    try {
      const res = await fetch(`${API}/api/driver/bank`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, bank_account: bankAccount, bank_ifsc: bankIfsc, bank_holder: bankHolder }),
      });
      const d = await res.json();
      if (d.success) { setBankMsg('✅ Bank details saved!'); setBankEditing(false); }
      else setBankMsg('❌ ' + (d.error || 'Error'));
    } catch (_e) { setBankMsg('❌ Network error'); }
    setBankSaving(false);
  };

  // Payment status polling (driver wait kare)
  useEffect(() => {
    if (!paymentWaiting || !paymentRideId) return;
    const iv = setInterval(async () => {
      try {
        const data = await apiGet(`/api/rides/payment-status/${paymentRideId}`, 0, 5000);
        if (data._error) return;
        if (data.payment_status === 'completed') {
          setPaymentMethod(data.payment_method);
          setPaymentWaiting(false);
          const fare = parseFloat(data.fare || 0);
          setTripSummary({
            fare: data.fare, payment_method: data.payment_method,
            earned: '₹' + (fare * 0.85).toFixed(0),
            fee: '₹' + (fare * 0.15).toFixed(0),
          });
          clearInterval(iv);
        } else if (data.payment_status === 'cash_pending') {
          setPaymentMethod('cash');
        }
      } catch (_e) {}
    }, 3000);
    return () => clearInterval(iv);
  }, [paymentWaiting, paymentRideId]);

  const confirmDirectPayment = async (method: 'cash' | 'upi_direct') => {
    setLoading(true);
    try {
      const res = await apiPost('/api/rides/cash-confirm', { ride_id: paymentRideId, phone, payment_method: method });
      if (res?._error || (!res?.success && res?.error)) {
        setResult('❌ ' + (res?.error || res?.message || 'Payment could not be confirmed — please retry'));
        setLoading(false);
        return;
      }
      setPaymentWaiting(false);
      const fare = parseFloat(paymentFare || '0');
      setTripSummary({
        fare: paymentFare,
        payment_method: method === 'upi_direct' ? 'upi' : 'cash',
        earned: '₹' + (fare * 0.85).toFixed(0),
        fee: '₹' + (fare * 0.15).toFixed(0),
      });
    } catch (_e) { setResult('❌ Error — please retry'); }
    setLoading(false);
  };

  const cancelTrip = async () => {
    setLoading(true);
    try {
      const cd = await apiPost('/api/rides/cancel-smart', { ride_id: activeRide.id, cancelled_by: 'driver', reason: cancelReason || 'Driver cancelled', phone });
      if (cd.success) {
        setResult(cd.message ? '⚠️ ' + cd.message : '❌ Trip cancelled');
        setActiveRide(null);
        useDriverStore.setState({ activeRide: null });
        setShowDriverCancelModal(false);
      } else {
        setResult('❌ Cancel failed — please retry');
      }
    } catch (_e) {
      setResult('❌ Network error — please retry');
      setActiveRide(null);
      useDriverStore.setState({ activeRide: null });
    }
    setLoading(false);
  };

  // ── Chat ───────────────────────────────────────
  const sendChat = async (text?: string) => {
    const msg = text ?? chatInput;
    if (!msg.trim() || !activeRide?.id) return;
    if (!text) setChatInput('');
    try { await fetch(`${API}/api/chat/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ride_id: activeRide.id, sender: 'driver', message: msg }) }); const r = await fetch(`${API}/api/chat/${activeRide.id}`); const d = await r.json(); setChatMsgs(d.messages || []); } catch (_e) {}
  };
  const callCustomer = async () => {
    const body: any = { caller_role: 'driver' };
    if (activeRide?.id) body.ride_id = activeRide.id;
    else if (activeHourlyRide?.id) body.booking_id = activeHourlyRide.id;
    else return;
    try {
      const r = await fetch(`${API}/api/call/initiate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await r.json();
      if (!data.success) { Alert.alert('Call', data.error || 'Could not place the call'); return; }
      if (data.method === 'direct' && data.call_number) Linking.openURL(`tel:${data.call_number}`);
      else if (data.method === 'exotel') Alert.alert('📞 Calling', 'Calling the customer...');
    } catch (_e) { Alert.alert('Error', 'Network error'); }
  };

  // ── Hourly ride functions ──────────────────────
  const acceptHourlyRide = async () => {
    if (!hourlyRideReq) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/hourly/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: hourlyRideReq.id, driver_phone: phone }) });
      const data = await res.json();
      if (data.success) { setActiveHourlyRide({ ...hourlyRideReq, driver_phone: phone, status: 'matched' }); setHourlyRideReq(null); }
      else { setResult('❌ ' + (data.message || 'Accept failed')); setHourlyRideReq(null); }
    } catch (_e) { setResult('❌ Network error'); }
    setLoading(false);
  };

  const startHourlyTrip = async () => {
    if (!activeHourlyRide) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/hourly/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: activeHourlyRide.id, otp: hourlyOtpInput, driver_phone: phone }) });
      const data = await res.json();
      if (data.success) { setActiveHourlyRide((p: any) => ({ ...p, status: 'active', started_at: new Date().toISOString() })); setHourlyOtpInput(''); setResult(''); }
      else setResult('❌ ' + (data.message || 'Incorrect OTP!'));
    } catch (_e) { setResult('❌ Network error'); }
    setLoading(false);
  };

  const completeHourlyTrip = async () => {
    if (!activeHourlyRide) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/hourly/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: activeHourlyRide.id, actual_km: Math.round(liveKm * 10) / 10 }) });
      const data = await res.json();
      if (data.success) {
        if (data.pending_confirm) {
          setActiveHourlyRide((p: any) => ({ ...p, pending_customer_confirm: true }));
          setResult('');
        } else {
          if (hourlyTimerRef.current) clearInterval(hourlyTimerRef.current);
          setTripSummary({ fare: data.total_fare, payment_method: 'wallet', earned: '₹' + parseFloat(data.driver_earning).toFixed(0), fee: '₹' + (data.total_fare - data.driver_earning).toFixed(0), isHourly: true, extraKmInfo: data.extra_km > 0 ? `+${data.extra_km} km extra — ₹${data.extra_km_charge}` : null });
          setActiveHourlyRide(null); setHourlyTimerSec(0); setLiveKm(0);
          setRides(r => r + 1); setEarnings(e => e + parseFloat(data.driver_earning));
        }
      } else if (data.too_early || data.time_locked) {
        setResult(`🔒 ${data.message}`);
      } else setResult('❌ ' + (data.message || 'Could not complete'));
    } catch (_e) { setResult('❌ Network error'); }
    setLoading(false);
  };

  const requestHourlyEarlyEnd = async () => {
    if (!activeHourlyRide) return;
    setHEarlyEndLoading(true);
    try {
      const res = await fetch(`${API}/api/hourly/early-end-request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: activeHourlyRide.id, requested_by: 'driver' }) });
      const data = await res.json();
      if (data.success) {
        setActiveHourlyRide((p: any) => ({ ...p, early_end_requested_by: 'driver' }));
      } else {
        setResult(data.message || 'Request could not be sent');
      }
    } catch (_e) {}
    setHEarlyEndLoading(false);
  };

  const confirmHourlyEarlyEnd = async () => {
    if (!activeHourlyRide) return;
    setHEarlyEndLoading(true);
    try {
      const res = await fetch(`${API}/api/hourly/early-end-confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: activeHourlyRide.id }) });
      const data = await res.json();
      if (data.success) {
        if (hourlyTimerRef.current) clearInterval(hourlyTimerRef.current);
        setTripSummary({ fare: activeHourlyRide.base_fare, payment_method: 'wallet', earned: '₹' + data.driver_earning, fee: '₹' + Math.round(data.driver_earning * 0.12 / 0.88), isHourly: true, earlyEnd: true });
        setActiveHourlyRide(null); setHourlyTimerSec(0);
        setRides(r => r + 1); setEarnings(e => e + parseFloat(data.driver_earning));
      }
    } catch (_e) {}
    setHEarlyEndLoading(false);
  };

  const rejectHourlyEarlyEnd = async () => {
    if (!activeHourlyRide) return;
    try {
      const res = await fetch(`${API}/api/hourly/early-end-reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: activeHourlyRide.id }) });
      const data = await res.json();
      setActiveHourlyRide((p: any) => ({ ...p, early_end_requested_by: null, early_end_reject_count: data.reject_count || (p.early_end_reject_count||0)+1, early_end_last_rejected_at: new Date().toISOString() }));
    } catch (_e) {}
  };

  const acceptExtend = async () => {
    if (!activeHourlyRide || hExtendLoading) return;
    setHExtendLoading(true);
    try {
      const res = await fetch(`${API}/api/hourly/accept-extend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: activeHourlyRide.id }) });
      const data = await res.json();
      if (data.success) {
        setActiveHourlyRide((p: any) => ({ ...p, package_hours: data.new_hours, km_included: data.new_km, base_fare: data.new_fare, extend_requested_hours: null }));
        Alert.alert('✅ Extension Accepted!', `Trip extended — new package: ${data.new_hours >= 24 ? (data.new_hours/24)+'d' : data.new_hours+'h'}, ${data.new_km} km`);
      } else {
        Alert.alert('❌ Accept Failed', data.message || data.error || 'Please try again');
      }
    } catch (_e) { Alert.alert('Network Error', 'Check your internet and try again'); }
    setHExtendLoading(false);
  };

  const rejectExtend = async () => {
    if (!activeHourlyRide || hExtendLoading) return;
    setHExtendLoading(true);
    try {
      const res = await fetch(`${API}/api/hourly/reject-extend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: activeHourlyRide.id }) });
      const data = await res.json();
      if (data.success) {
        setActiveHourlyRide((p: any) => ({ ...p, extend_requested_hours: null }));
      } else {
        Alert.alert('❌ Reject Failed', data.message || data.error || 'Please try again');
      }
    } catch (_e) { Alert.alert('Network Error', 'Check your internet and try again'); }
    setHExtendLoading(false);
  };

  // ── PhotoBox ───────────────────────────────────
  const PhotoBox = ({ field, label, icon, cameraOnly }: any) => {
    const isUploading = uploading === field;
    const hasUrl = !!regData[field];
    const SCAN_BOX_H = 130;
    const lineY = scanLineAnim.interpolate({ inputRange: [0, 1], outputRange: [0, SCAN_BOX_H - 2] });
    return (
      <View style={[rs.photoBox, hasUrl && rs.photoBoxDone]}>
        {hasUrl ? (
          <>
            <View style={{ width: '100%', height: SCAN_BOX_H, borderRadius: 10, overflow: 'hidden' }}>
              <Image source={{ uri: regData[field] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#059669', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="shield-checkmark" size={11} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>VERIFIED</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, width: '100%' }}>
              {!cameraOnly && (
                <TouchableOpacity style={[rs.uploadBtn, rs.reuploadBtn]} onPress={() => fromGallery(field)} activeOpacity={0.75}>
                  <Text style={[rs.uploadBtnTxt, { color: '#334155' }]}>🖼️ Change</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={rs.uploadBtn} onPress={() => fromCamera(field)} activeOpacity={0.75}>
                <Text style={rs.uploadBtnTxt}>{cameraOnly ? '🔄 Re-take Selfie' : '📷 Re-take'}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : isUploading ? (
          <View style={{ width: '100%', height: SCAN_BOX_H, borderRadius: 10, overflow: 'hidden', backgroundColor: '#0A1628', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <View style={[rs.scanCorner, { top: 10, left: 10 }]} />
            <View style={[rs.scanCorner, { top: 10, right: 10, borderLeftWidth: 0, borderRightWidth: 3 }]} />
            <View style={[rs.scanCorner, { bottom: 10, left: 10, borderTopWidth: 0, borderBottomWidth: 3 }]} />
            <View style={[rs.scanCorner, { bottom: 10, right: 10, borderTopWidth: 0, borderBottomWidth: 3, borderLeftWidth: 0, borderRightWidth: 3 }]} />
            <Animated.View style={{ position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: C.pink, opacity: 0.9, transform: [{ translateY: lineY }] }} />
            <ActivityIndicator color={C.pink} size="small" style={{ marginBottom: 8 }} />
            <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 }}>SCANNING DOCUMENT...</Text>
          </View>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ fontSize: 30 }}>{icon}</Text>
            <Text style={{ color: '#475569', fontWeight: '600', marginTop: 6, fontSize: 14 }}>{label}</Text>
            <Text style={{ color: '#94A3B8', fontSize: 11, marginTop: 3 }}>Clear photo · Good lighting · All details visible</Text>
          </View>
        )}
        {!hasUrl && !isUploading && (
          cameraOnly ? (
            <View style={{ marginTop: 10, width: '100%' }}>
              <TouchableOpacity style={rs.uploadBtn} onPress={() => fromCamera(field)}>
                <Text style={rs.uploadBtnTxt}>📷 Open Front Camera</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <TouchableOpacity style={rs.uploadBtn} onPress={() => fromCamera(field)}><Text style={rs.uploadBtnTxt}>📷 Camera</Text></TouchableOpacity>
              <TouchableOpacity style={rs.uploadBtn} onPress={() => fromGallery(field)}><Text style={rs.uploadBtnTxt}>🖼️ Gallery</Text></TouchableOpacity>
            </View>
          )
        )}
      </View>
    );
  };

  // ═══ SPLASH SCREEN ═══
  if (screen === 'splash') return (
    <Animated.View style={{ flex: 1, backgroundColor: '#080E18', alignItems: 'center', justifyContent: 'center', opacity: splashFade }}>
      {/* Green glow circle top-right */}
      <View style={{ position: 'absolute', top: -80, right: -80, width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(76,175,80,0.08)' }} />
      {/* Red accent circle bottom-left */}
      <View style={{ position: 'absolute', bottom: -100, left: -100, width: 320, height: 320, borderRadius: 160, backgroundColor: 'rgba(233,69,96,0.06)' }} />
      {/* Center glow ring */}
      <View style={{ position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(76,175,80,0.12)' }} />

      {/* Logo box — spring animated */}
      <Animated.View style={{
        width: 114, height: 114, borderRadius: 30, backgroundColor: '#0F1923',
        borderWidth: 2, borderColor: C.green,
        alignItems: 'center', justifyContent: 'center',
        elevation: 20,
        shadowColor: C.green, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 22,
        opacity: splashLogo,
        transform: [{ scale: splashScale }],
      }}>
        <Text style={{ fontSize: 52 }}>🚗</Text>
      </Animated.View>

      {/* Brand name */}
      <Animated.View style={{ alignItems: 'center', marginTop: 22, opacity: splashLogo }}>
        <Text style={{ color: '#ffffff', fontSize: 40, fontWeight: '900', letterSpacing: 0.5 }}>
          Sppero <Text style={{ color: C.green }}>Buddy</Text>
        </Text>
        <View style={{ width: 48, height: 2, backgroundColor: C.green, borderRadius: 1, marginTop: 8, opacity: 0.7 }} />
      </Animated.View>

      {/* Tagline — slides up */}
      <Animated.View style={{
        opacity: splashTag,
        transform: [{ translateY: splashTag.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
        alignItems: 'center', marginTop: 12,
      }}>
        <Text style={{ color: '#94A3B8', fontSize: 14, letterSpacing: 0.6 }}>India ka best earning partner</Text>
      </Animated.View>

      {/* Captain badge */}
      <Animated.View style={{
        opacity: splashTag,
        marginTop: 32,
        backgroundColor: 'rgba(76,175,80,0.1)',
        borderRadius: 20, borderWidth: 1, borderColor: 'rgba(76,175,80,0.3)',
        paddingHorizontal: 18, paddingVertical: 8,
        flexDirection: 'row', alignItems: 'center', gap: 8,
      }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.green }} />
        <Text style={{ color: C.green, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 }}>CAPTAIN PORTAL</Text>
      </Animated.View>

      {/* Animated dots at bottom */}
      <View style={{ position: 'absolute', bottom: 54, alignItems: 'center' }}>
        <FloatingDots color="#4CAF50" />
      </View>
    </Animated.View>
  );

  // ═══ PERMISSIONS SETUP SCREEN ═══
  if (screen === 'permissions') {
    const rows: { key: string; icon: string; name: string; desc: string; done: boolean }[] = [
      { key: 'location', icon: '📍', name: 'Background Location',   desc: 'Receive ride requests even when app is minimized', done: permStatus.location },
      { key: 'battery',  icon: '🔋', name: 'Battery — Unrestricted', desc: 'Ride alerts reach you even when screen is off',      done: permStatus.battery  },
      { key: 'overlay',  icon: '🔔', name: 'Display Over Apps',      desc: 'Ride popup appears on your locked screen',            done: permStatus.overlay  },
    ];
    const sheets: Record<string, { icon: string; title: string; lines: string[]; btn: string; onPress: () => void }> = {
      location: {
        icon: '📍', title: 'Allow Location — Always',
        lines: [
          'On the next page: tap "Location" → select "Allow all the time"',
          'Without this, ride requests won\'t reach you when the app is minimized',
        ],
        btn: 'Open Location Settings',
        onPress: async () => {
          const { status: fg } = await Location.requestForegroundPermissionsAsync().catch(() => ({ status: 'denied' as const }));
          if (fg === 'granted') await Location.requestBackgroundPermissionsAsync().catch(() => {});
          setPermSheet(null);
          setTimeout(checkPermissions, 600);
        },
      },
      battery: {
        icon: '🔋', title: 'Unrestricted Battery',
        lines: [
          'Tap "Battery" on the next page → choose "Unrestricted" or "Don\'t Optimize"',
          '🔴 Xiaomi / Redmi: also turn ON Auto-start',
          '🔵 Samsung: choose "Unrestricted"',
          '⚫ Nothing / CMF: choose "No Restriction"',
        ],
        btn: 'Open Battery Settings',
        onPress: async () => {
          try {
            await Linking.sendIntent('android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', [
              { key: 'android.intent.extra.PACKAGE_NAME', value: 'com.saurabhspero.rideappdriver' },
            ]);
          } catch (_e) { Linking.openSettings(); }
          await AsyncStorage.setItem('_permBattAck', '1').catch(() => {});
          setPermSheet(null);
          setPermStatus(p => ({ ...p, battery: true }));
        },
      },
      overlay: {
        icon: '🔔', title: 'Display Over Other Apps',
        lines: [
          'Find "Display over other apps" and turn it ON',
          'This lets ride cards pop up on your screen even when it\'s locked',
        ],
        btn: 'Open App Settings',
        onPress: async () => {
          Linking.openSettings();
          await AsyncStorage.setItem('_permOverlayAck', '1').catch(() => {});
          setPermSheet(null);
          setPermStatus(p => ({ ...p, overlay: true }));
        },
      },
    };
    const sh = permSheet ? sheets[permSheet] : null;

    return (
      <View style={{ flex: 1, backgroundColor: '#080E18' }}>
        <StatusBar barStyle="light-content" backgroundColor="#080E18" />

        {/* Ambient glow blobs */}
        <View style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(0,200,83,0.07)' }} pointerEvents="none" />
        <View style={{ position: 'absolute', bottom: -80, left: -80, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,45,120,0.05)' }} pointerEvents="none" />

        <View style={{ flex: 1, paddingTop: 72, paddingHorizontal: 24 }}>
          {/* Header */}
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <View style={{ width: 68, height: 68, borderRadius: 20, backgroundColor: '#0F1923', borderWidth: 2, borderColor: C.online, alignItems: 'center', justifyContent: 'center', marginBottom: 16, elevation: 14, shadowColor: C.online, shadowOpacity: 0.45, shadowRadius: 14 }}>
              <Text style={{ fontSize: 32 }}>🚗</Text>
            </View>
            <Text style={{ fontSize: 22, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.4, marginBottom: 6 }}>App Setup</Text>
            <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 20 }}>Grant these 3 permissions to start{'\n'}receiving ride requests</Text>
          </View>

          {permDone ? (
            /* ── All done — success state ── */
            <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', marginTop: -60 }}>
              <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(0,200,83,0.12)', borderWidth: 2, borderColor: C.online, alignItems: 'center', justifyContent: 'center', marginBottom: 20, elevation: 10, shadowColor: C.online, shadowOpacity: 0.35, shadowRadius: 10 }}>
                <Text style={{ fontSize: 42 }}>✅</Text>
              </View>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#FFFFFF', marginBottom: 8 }}>All Set!</Text>
              <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center' }}>You're ready to receive{'\n'}ride requests</Text>
            </View>
          ) : (
            <>
              {/* ── Permission rows ── */}
              <View style={{ backgroundColor: '#0F1923', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                {rows.map((row, idx) => (
                  <TouchableOpacity
                    key={row.key}
                    activeOpacity={row.done ? 1 : 0.65}
                    onPress={() => { if (!row.done) setPermSheet(row.key); }}
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 18, borderBottomWidth: idx < rows.length - 1 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.06)' }}
                  >
                    <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: row.done ? 'rgba(0,200,83,0.1)' : 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: row.done ? 'rgba(0,200,83,0.28)' : 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                      <Text style={{ fontSize: 21 }}>{row.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: row.done ? '#64748B' : '#E2E8F0', marginBottom: 2 }}>{row.name}</Text>
                      <Text style={{ fontSize: 12, color: '#475569', lineHeight: 16 }}>{row.desc}</Text>
                    </View>
                    {row.done ? (
                      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,200,83,0.15)', borderWidth: 1.5, borderColor: C.online, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 14, color: C.online, fontWeight: '900' }}>✓</Text>
                      </View>
                    ) : (
                      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="chevron-forward" size={14} color="#475569" />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Progress dots */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 20 }}>
                {rows.map(r => (
                  <View key={r.key} style={{ height: 6, borderRadius: 3, backgroundColor: r.done ? C.online : 'rgba(255,255,255,0.12)', width: r.done ? 22 : 6 }} />
                ))}
              </View>
              <Text style={{ textAlign: 'center', color: '#334155', fontSize: 11, marginTop: 14, lineHeight: 16 }}>
                Tap each row → follow the steps → come back here
              </Text>
            </>
          )}
        </View>

        {/* ── Bottom sheet modal ── */}
        <Modal visible={!!sh} transparent animationType="slide" onRequestClose={() => setPermSheet(null)}>
          <TouchableOpacity activeOpacity={1} onPress={() => setPermSheet(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
            {sh && (
              <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ backgroundColor: '#F8FAFC', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 28, paddingBottom: 44 }}>
                <View style={{ width: 40, height: 4, backgroundColor: '#CBD5E1', borderRadius: 2, alignSelf: 'center', marginBottom: 22 }} />
                <Text style={{ fontSize: 28 }}>{sh.icon}</Text>
                <Text style={{ fontSize: 19, fontWeight: '900', color: '#0F172A', marginTop: 10, marginBottom: 16, lineHeight: 26 }}>{sh.title}</Text>
                {sh.lines.map((line: string, i: number) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: 9, alignItems: 'flex-start' }}>
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#94A3B8', marginTop: 8, flexShrink: 0 }} />
                    <Text style={{ fontSize: 13, color: '#475569', lineHeight: 20, flex: 1 }}>{line}</Text>
                  </View>
                ))}
                <TouchableOpacity onPress={sh.onPress} style={{ backgroundColor: '#FF2D78', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 18, elevation: 6, shadowColor: '#FF2D78', shadowOpacity: 0.35, shadowRadius: 8 }}>
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>{sh.btn} →</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setPermSheet(null)} style={{ marginTop: 14, padding: 8, alignItems: 'center' }}>
                  <Text style={{ color: '#94A3B8', fontSize: 13 }}>Later</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </Modal>
      </View>
    );
  }

  // ═══ REGISTRATION STEP 1 — Phone + OTP ═══
  if (screen === 'login' && regStep === 1) return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={rs.regHeader}>
        <TouchableOpacity onPress={() => { setRegStep(0); setLoginOtpSent(false); setLoginOtpDigits(['','','','','','']); }} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={rs.regTitle}>Step 1 of 5</Text>
        <View style={{ width: 50 }} />
      </View>
      <View style={{ height: 4, backgroundColor: '#333' }}><View style={{ height: 4, backgroundColor: C.pink, width: '20%' }} /></View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 110 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {!loginOtpSent ? (
          <View>
            <View style={{ flexDirection:'row', alignItems:'center', marginTop:10, marginBottom:6 }}>
              <Ionicons name="phone-portrait" size={26} color="#4CAF50" style={{ marginRight:10 }} />
              <Text style={[rs.bigTitle, { marginTop:0 }]}>Phone Number</Text>
            </View>
            <Text style={rs.subTitle}>{t('reg_mobile_sub')}</Text>
            <View style={[s.driverItem, { marginTop: 20 }]}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>🇮🇳 +91</Text>
              <TextInput style={{ flex: 1, fontSize: 18 }} placeholder="10 digit number" keyboardType="numeric" maxLength={10} value={regData.phone} onChangeText={(v) => updateReg('phone', v)} />
            </View>
            {result ? <Text style={s.err}>{result}</Text> : null}
            <TouchableOpacity style={[s.btn, regData.phone.length !== 10 && { opacity: 0.5 }]}
              disabled={regData.phone.length !== 10 || loading}
              onPress={async () => {
                setLoading(true); setResult('');
                try {
                  const ctrl2 = new AbortController();
                  const t2 = setTimeout(() => ctrl2.abort(), 15000);
                  const res = await fetch(`${API}/api/auth/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: regData.phone }), signal: ctrl2.signal });
                  clearTimeout(t2);
                  const data = await res.json();
                  if (data.error) { setResult('❌ ' + data.error); }
                  else { if (data.otp) setDevOtp(data.otp); setLoginOtpSent(true); setLoginResendTimer(60); setLoginCanResend(false); }
                } catch (_e: any) {
                  const isTo = _e?.name === 'AbortError';
                  setResult(`❌ ${isTo ? 'Connection timeout' : (_e?.message || 'Network error')} — try using Wi-Fi`);
                }
                setLoading(false);
              }}>
              <Text style={s.btnTxt}>{loading ? t('reg_otp_sending') : t('reg_send_otp_btn')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={rs.bigTitle}>{t('reg_otp_title')}</Text>
            <Text style={rs.subTitle}>{tp('reg_otp_sub', { phone: regData.phone })}</Text>
            <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 10, padding: 12, marginTop: 16, marginBottom: 20, flexDirection: 'row', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>💡</Text>
              <Text style={{ fontSize: 12, color: '#F59E0B', flex: 1 }}>{t('reg_otp_tip')}</Text>
            </View>
            {/* 6 OTP Boxes */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
              {loginOtpDigits.map((digit, i) => (
                <TextInput key={i}
                  ref={(ref) => { loginOtpRefs.current[i] = ref; }}
                  style={{ width: 44, height: 54, borderRadius: 12, textAlign: 'center', fontSize: 22, fontWeight: 'bold', borderWidth: 2.5, borderColor: digit ? '#F5C518' : '#E2E8F0', backgroundColor: digit ? 'rgba(245,197,24,0.15)' : '#F8FAFC', color: '#0F172A' }}
                  keyboardType="number-pad" maxLength={1} value={digit}
                  onChangeText={(t) => handleLoginOtpChange(t, i)}
                  onKeyPress={({ nativeEvent }) => handleLoginOtpKeyPress(nativeEvent.key, i)}
                />
              ))}
            </View>
            {/* Test OTP banner */}
            {devOtp ? (
              <TouchableOpacity
                onPress={() => {
                  const digits = devOtp.split('');
                  setLoginOtpDigits(digits);
                  setLoginOtp(devOtp);
                }}
                style={{ backgroundColor: '#1e3a5f', borderRadius: 10, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 16, marginRight: 8 }}>🧪</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#7dd3fc', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>TEST OTP (tap to fill)</Text>
                  <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold', letterSpacing: 8, marginTop: 2 }}>{devOtp}</Text>
                </View>
                <Text style={{ color: '#7dd3fc', fontSize: 11 }}>Auto-fill →</Text>
              </TouchableOpacity>
            ) : null}
            {result ? <Text style={s.err}>{result}</Text> : null}
            <TouchableOpacity style={[s.btn, (loading || loginOtpDigits.join('').length < 6) && { opacity: 0.5 }]}
              disabled={loading || loginOtpDigits.join('').length < 6}
              onPress={async () => {
                const otpToUse = loginOtpDigits.join('');
                setLoading(true);
                try {
                  const res = await fetch(`${API}/api/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: regData.phone, otp: otpToUse, name: '' }) });
                  const data = await res.json();
                  if (data.token) { setResult(''); setLoginOtpSent(false); setLoginOtpDigits(['','','','','','']); setDevOtp(''); setRegStep(2); }
                  else setResult('❌ ' + (data.error || 'Incorrect OTP'));
                } catch (_e) { setResult('❌ Server error'); }
                setLoading(false);
              }}>
              <Text style={s.btnTxt}>{loading ? t('reg_verifying') : t('reg_verify_next')}</Text>
            </TouchableOpacity>
            {/* Resend */}
            <View style={{ alignItems: 'center', marginTop: 16 }}>
              {loginCanResend ? (
                <TouchableOpacity onPress={() => { setLoginOtpDigits(['','','','','','']); setResult(''); fetch(`${API}/api/auth/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: regData.phone }) }); setLoginResendTimer(60); setLoginCanResend(false); }}>
                  <Text style={{ color: C.pink, fontWeight: 'bold' }}>{t('login_resend')}</Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ color: '#999', fontSize: 13 }}>{tp('reg_resend_wait', { sec: String(loginResendTimer) })}</Text>
              )}
            </View>
            <TouchableOpacity onPress={() => { setLoginOtpSent(false); setLoginOtpDigits(['','','','','','']); }} style={{ alignItems: 'center', marginTop: 12 }}>
              <Text style={{ color: '#666', fontSize: 13 }}>{t('reg_change_number')}</Text>
            </TouchableOpacity>
            <View style={{ height: 60 }} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  // ═══ REGISTRATION STEP 2 — Vehicle Type ═══
  if (screen === 'login' && regStep === 2) return (
    <View style={s.screen}>
      <View style={rs.regHeader}><TouchableOpacity onPress={() => setRegStep(1)} style={{ padding: 4 }}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity><Text style={rs.regTitle}>Step 2 of 5</Text><View style={{ width: 50 }} /></View>
      <View style={{ height: 4, backgroundColor: '#333' }}><View style={{ height: 4, backgroundColor: C.pink, width: '40%' }} /></View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 110 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection:'row', alignItems:'center', marginTop:10, marginBottom:6 }}>
          <Ionicons name="car-sport" size={26} color="#4CAF50" style={{ marginRight:10 }} />
          <Text style={[rs.bigTitle, { marginTop:0 }]}>Vehicle Type</Text>
        </View><Text style={rs.subTitle}>{t('reg_vehicle_what')}</Text>
        {[
          { id:'bike',          mci:'motorbike',       ion:undefined,        label:'Bike',          sub:'',                                      color: null },
          { id:'auto',          mci:'rickshaw',         ion:undefined,        label:'Auto',          sub:'',                                      color: null },
          { id:'car',           mci:undefined,          ion:'car-sport',      label:'Car / Taxi',    sub:'',                                      color: null },
          { id:'eriksha',       mci:undefined,          ion:'flash',          label:'E-Riksha',      sub:'',                                      color: null },
          { id:'green_bike',    mci:undefined,          ion:'leaf',           label:'Green Bike',    sub:'Electric Bike / Scooty — Eco Friendly', color: '#2e7d32' },
          { id:'electric_auto', mci:undefined,          ion:'flash-outline',  label:'Electric Auto', sub:'Electric 3-Wheeler — Zero Emission',    color: '#1565c0' },
          { id:'luxury',        mci:undefined,          ion:'diamond',        label:'Ultra Luxury',  sub:'BMW · Mercedes · Audi · Land Rover · Lexus', color: '#c9a227' },
        ].map(v => (
          <TouchableOpacity key={v.id}
            style={[rs.vehBox, regData.vehicle_type === v.id && rs.vehBoxActive,
              v.color && { borderWidth: 2, borderColor: regData.vehicle_type === v.id ? C.pink : v.color }]}
            onPress={() => { updateReg('vehicle_type', v.id); updateReg('vehicle_brand', ''); updateReg('vehicle_model', ''); }}>
            <View style={{ marginRight: 16, width: 38, alignItems: 'center' }}>
              {v.mci
                ? <MaterialCommunityIcons name={v.mci as any} size={30} color={regData.vehicle_type === v.id ? '#fff' : (v.color || '#94A3B8')} />
                : <Ionicons name={v.ion as any} size={28} color={regData.vehicle_type === v.id ? '#fff' : (v.color || '#94A3B8')} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[{ fontSize: 18, fontWeight: '600', color: '#0F172A' }, regData.vehicle_type === v.id && { color: C.green }]}>{v.label}</Text>
              {v.sub ? <Text style={{ fontSize: 11, color: regData.vehicle_type === v.id ? '#ddd' : (v.color || '#64748B'), marginTop: 2 }}>{v.sub}</Text> : null}
            </View>
            {regData.vehicle_type === v.id && <Text style={{ color: '#fff', fontSize: 20 }}>✓</Text>}
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[s.btn, !regData.vehicle_type && { opacity: 0.5 }]} disabled={!regData.vehicle_type} onPress={() => { setResult(''); setRegStep(3); }}><Text style={s.btnTxt}>{t('reg_next_btn')}</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );

  // ═══ REGISTRATION STEP 3 — DL ═══
  if (screen === 'login' && regStep === 3) {
    const dlCleaned = regData.dl_number.replace(/\s/g, '').toUpperCase();
    const dlValid = dlCleaned.length === 0 || /^[A-Z]{2}[0-9]{13}$/.test(dlCleaned);
    const step3Ok = !!regData.dl_name.trim() && dlCleaned.length === 15 && dlValid && !!regData.dl_photo;
    return (
      <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={rs.regHeader}>
          <TouchableOpacity onPress={() => setRegStep(2)} style={{ padding: 4 }}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
          <Text style={rs.regTitle}>Step 3 of 5</Text>
          <View style={{ width: 50 }} />
        </View>
        <View style={{ height: 4, backgroundColor: '#333' }}><View style={{ height: 4, backgroundColor: C.pink, width: '60%' }} /></View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 110 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection:'row', alignItems:'center', marginTop:10, marginBottom:6 }}>
            <Ionicons name="document-text" size={26} color="#4CAF50" style={{ marginRight:10 }} />
            <Text style={[rs.bigTitle, { marginTop:0 }]}>Driving License</Text>
          </View>
          <Text style={rs.subTitle}>DL ki details — naam, number aur photo</Text>

          <View style={rs.adviceBox}>
            <Text style={rs.adviceTitle}>📸 DL Photo Tips:</Text>
            <Text style={rs.adviceText}>{t('reg_dl_tip1')}</Text>
            <Text style={rs.adviceText}>{t('reg_dl_tip2')}</Text>
            <Text style={[rs.adviceText, { marginTop: 6, fontWeight: '700', color: '#c62828' }]}>{t('reg_dl_expired_warn')}</Text>
          </View>

          <Text style={rs.fieldLabel}>{t('reg_dl_name_label')}</Text>
          <TextInput style={rs.input} placeholder={t('reg_dl_name_ph')} value={regData.dl_name} onChangeText={(v) => updateReg('dl_name', v)} />

          <Text style={rs.fieldLabel}>DL Number *</Text>
          <TextInput
            style={[rs.input, { letterSpacing: 1 }]}
            placeholder="UP14 2021 0012345"
            autoCapitalize="characters"
            maxLength={17}
            value={regData.dl_number}
            onChangeText={(v) => updateReg('dl_number', v.replace(/[^A-Z0-9\s]/gi, '').toUpperCase())}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, marginBottom: 4 }}>
            {dlCleaned.length === 0 ? (
              <Text style={{ fontSize: 11, color: '#64748B' }}>Format: XX00 YYYY XXXXXXX (2 letter + 13 digits)</Text>
            ) : dlValid && dlCleaned.length === 15 ? (
              <Text style={{ fontSize: 11, color: '#2e7d32', fontWeight: '700' }}>{t('reg_dl_format_ok')}</Text>
            ) : (
              <Text style={{ fontSize: 11, color: '#e65100' }}>{tp('reg_dl_chars_left', { n: String(15 - dlCleaned.length) })}</Text>
            )}
          </View>

          <Text style={rs.fieldLabel}>DL Photo (front side clear) *</Text>
          <PhotoBox field="dl_photo" label="DL Photo" icon="📄" />

          {result ? <Text style={s.err}>{result}</Text> : null}
          <TouchableOpacity
            style={[s.btn, !step3Ok && { opacity: 0.5 }]}
            disabled={!step3Ok}
            onPress={() => { setResult(''); setRegStep(4); }}>
            <Text style={s.btnTxt}>{t('reg_next_btn')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ═══ REGISTRATION STEP 4 — Vehicle ═══
  if (screen === 'login' && regStep === 4) {
    const needBrand  = ['bike','car','luxury','green_bike'].includes(regData.vehicle_type);
    const needModel  = !['eriksha'].includes(regData.vehicle_type);
    const needNum    = !['eriksha'].includes(regData.vehicle_type);
    const brandValid = !needBrand || !!regData.vehicle_brand;
    const modelValid = !needModel || !!regData.vehicle_model.trim();
    const vnCleaned  = regData.vehicle_no.replace(/\s/g, '').toUpperCase();
    const vnValid    = !needNum || /^[A-Z]{2}[0-9]{2}[A-Z]{1,3}[0-9]{4}$/.test(vnCleaned);
    const step4Ok    = !!regData.vehicle_photo && (!needNum || (!!regData.vehicle_no && vnValid)) && brandValid && modelValid;

    const LUXURY_BRANDS = ['BMW','Mercedes-Benz','Audi','Land Rover','Lexus'];
    const LUXURY_MODELS: any = {
      'BMW':          ['3 Series','5 Series','7 Series','X1','X3','X5','X7'],
      'Mercedes-Benz':['C Class','E Class','S Class','GLA','GLC','GLE','GLS'],
      'Audi':         ['A4','A6','A8','Q3','Q5','Q7','Q8'],
      'Land Rover':   ['Defender','Discovery','Evoque','Range Rover Sport','Range Rover'],
      'Lexus':        ['ES 300h','NX','RX 350','UX 300e','LX'],
    };
    const modelPlaceholder: any = {
      bike:          'eg. Activa 6G, Splendor Plus, Pulsar 150, Royal Enfield Classic',
      car:           'eg. Swift Dzire, Creta, Nexon, City, Fortuner',
      auto:          'eg. Bajaj RE, TVS King, Piaggio Ape',
      green_bike:    'eg. Ather 450X, Ola S1 Pro, TVS iQube, Bajaj Chetak, Hero Optima CX',
      electric_auto: 'eg. Bajaj RE Electric, Piaggio Ape E-City, Mahindra Treo, Champion Electric',
    };

    return (
      <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={rs.regHeader}>
          <TouchableOpacity onPress={() => setRegStep(3)} style={{ padding: 4 }}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
          <Text style={rs.regTitle}>Step 4 of 5</Text>
          <View style={{ width: 50 }} />
        </View>
        <View style={{ height: 4, backgroundColor: '#333' }}><View style={{ height: 4, backgroundColor: C.pink, width: '80%' }} /></View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 110 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection:'row', alignItems:'center', marginTop:10, marginBottom:6 }}>
            <Ionicons name="car" size={26} color="#4CAF50" style={{ marginRight:10 }} />
            <Text style={[rs.bigTitle, { marginTop:0 }]}>Vehicle Details</Text>
          </View>
          <Text style={rs.subTitle}>
            {regData.vehicle_type === 'eriksha'       ? t('reg_vehicle_sub_eriksha') :
             regData.vehicle_type === 'luxury'        ? t('reg_vehicle_sub_luxury') :
             regData.vehicle_type === 'green_bike'    ? t('reg_vehicle_sub_green') :
             regData.vehicle_type === 'electric_auto' ? t('reg_vehicle_sub_eauto') :
             t('reg_vehicle_sub_default')}
          </Text>

          {/* ── Brand ── */}
          {needBrand && (
            <>
              <Text style={rs.fieldLabel}>Vehicle Brand / Company *</Text>
              {regData.vehicle_type === 'luxury' ? (
                <View style={{ marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                    {LUXURY_BRANDS.map(b => (
                      <TouchableOpacity key={b}
                        onPress={() => { updateReg('vehicle_brand', b); updateReg('vehicle_model', ''); }}
                        style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: regData.vehicle_brand === b ? 'rgba(22,163,74,0.08)' : '#F8FAFC', borderWidth: 2, borderColor: regData.vehicle_brand === b ? C.green : '#E2E8F0' }}>
                        <Text style={{ fontWeight: '700', color: regData.vehicle_brand === b ? C.green : '#9CA3AF', fontSize: 13 }}>{b}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {regData.vehicle_brand
                    ? <Text style={{ color: '#2e7d32', fontSize: 12 }}>✅ {regData.vehicle_brand}</Text>
                    : <Text style={{ color: '#e65100', fontSize: 12 }}>{t('reg_select_brand')}</Text>}
                </View>
              ) : (
                <TextInput
                  style={[rs.input, { marginBottom: 6 }]}
                  placeholder={regData.vehicle_type === 'bike' ? 'eg. Honda, Bajaj, Royal Enfield, TVS' : regData.vehicle_type === 'green_bike' ? 'eg. Ather, Ola Electric, TVS, Bajaj, Hero' : 'eg. Maruti, Hyundai, Tata, Honda'}
                  value={regData.vehicle_brand}
                  onChangeText={(v) => updateReg('vehicle_brand', v)}
                />
              )}
            </>
          )}

          {/* ── Model ── */}
          {needModel && (
            <>
              <Text style={rs.fieldLabel}>Vehicle Model *</Text>
              {regData.vehicle_type === 'luxury' && regData.vehicle_brand ? (
                <View style={{ marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                    {(LUXURY_MODELS[regData.vehicle_brand] || []).map((m: string) => (
                      <TouchableOpacity key={m} onPress={() => updateReg('vehicle_model', m)}
                        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: regData.vehicle_model === m ? 'rgba(233,30,99,0.06)' : '#F8FAFC', borderWidth: 1, borderColor: regData.vehicle_model === m ? C.pink : '#E2E8F0' }}>
                        <Text style={{ fontWeight: '600', color: regData.vehicle_model === m ? C.pink : '#9CA3AF', fontSize: 13 }}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {regData.vehicle_model
                    ? <Text style={{ color: '#2e7d32', fontSize: 12 }}>{tp('reg_model_selected', { model: regData.vehicle_model })}</Text>
                    : <Text style={{ color: '#e65100', fontSize: 12 }}>{regData.vehicle_brand ? t('reg_select_model') : t('reg_select_brand_first')}</Text>}
                </View>
              ) : regData.vehicle_type === 'luxury' ? (
                <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
                  <Text style={{ color: '#F59E0B', fontSize: 13 }}>{t('reg_select_brand_then_model')}</Text>
                </View>
              ) : (
                <>
                  <TextInput
                    style={[rs.input, { marginBottom: 4 }]}
                    placeholder={modelPlaceholder[regData.vehicle_type] || t('reg_model_ph_default')}
                    value={regData.vehicle_model}
                    onChangeText={(v) => updateReg('vehicle_model', v)}
                  />
                  <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>{t('reg_model_helper')}</Text>
                </>
              )}
            </>
          )}

          {/* ── Vehicle Number ── */}
          <Text style={rs.fieldLabel}>Vehicle Number {needNum ? '*' : '(optional)'}</Text>
          <TextInput
            style={rs.input}
            placeholder="UP32 AB 1234"
            autoCapitalize="characters"
            value={regData.vehicle_no}
            onChangeText={(v) => updateReg('vehicle_no', v.replace(/[^A-Z0-9\s]/gi, '').toUpperCase())}
          />
          {regData.vehicle_no ? (
            <Text style={{ fontSize: 11, marginTop: 5, color: vnValid ? '#2e7d32' : '#e65100' }}>
              {vnValid ? tp('reg_vn_format_ok', { vn: vnCleaned }) : t('reg_vn_format_bad')}
            </Text>
          ) : null}

          {/* ── Photos ── */}
          <Text style={[rs.fieldLabel, { marginTop: 18 }]}>Vehicle Front Photo *</Text>
          <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>{t('reg_plate_visible')}</Text>
          <PhotoBox field="vehicle_photo" label="Vehicle Photo" icon="🚗" />

          <Text style={[rs.fieldLabel, { marginTop: 14 }]}>RC (Registration Certificate) Photo</Text>
          <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>{t('reg_optional_faster')}</Text>
          <PhotoBox field="rc_photo" label="RC Photo" icon="📋" />

          {result ? <Text style={s.err}>{result}</Text> : null}
          <TouchableOpacity style={[s.btn, !step4Ok && { opacity: 0.5 }]} disabled={!step4Ok} onPress={() => { setResult(''); setRegStep(5); }}>
            <Text style={s.btnTxt}>{t('reg_next_btn')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ═══ REGISTRATION STEP 5 — Aadhaar + Selfie ═══
  if (screen === 'login' && regStep === 5) {
    const aadhaarDigits = regData.aadhaar_number.replace(/\D/g, '');
    const aadhaarOk = aadhaarDigits.length === 12;
    const step5Ok = aadhaarOk && !!regData.aadhaar_photo && !!regData.face_photo;
    return (
      <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={rs.regHeader}>
          <TouchableOpacity onPress={() => setRegStep(4)} style={{ padding: 4 }}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
          <Text style={rs.regTitle}>Step 5 of 5</Text>
          <View style={{ width: 50 }} />
        </View>
        <View style={{ height: 4, backgroundColor: '#333' }}><View style={{ height: 4, backgroundColor: C.pink, width: '100%' }} /></View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 110 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection:'row', alignItems:'center', marginTop:10, marginBottom:6 }}>
            <Ionicons name="id-card" size={26} color="#94A3B8" style={{ marginRight:10 }} />
            <Text style={[rs.bigTitle, { marginTop:0 }]}>Aadhaar & Selfie</Text>
          </View>
          <Text style={rs.subTitle}>{t('reg_aadhaar_selfie_last_step')}</Text>

          <View style={[rs.adviceBox, { backgroundColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.25)', borderWidth: 1 }]}>
            <Text style={[rs.adviceTitle, { color: C.green }]}>{t('reg_privacy_note')}</Text>
            <Text style={[rs.adviceText, { color: '#6EE7B7' }]}>{t('reg_aadhaar_verify_only')}</Text>
            <Text style={[rs.adviceText, { color: '#6EE7B7' }]}>{t('reg_docs_secure')}</Text>
          </View>

          <Text style={rs.fieldLabel}>Aadhaar Number *</Text>
          <TextInput
            style={[rs.input, { letterSpacing: 4 }]}
            placeholder="1234 5678 9012"
            keyboardType="numeric"
            maxLength={14}
            value={aadhaarDigits.replace(/(\d{4})(\d{0,4})(\d{0,4})/, (_, a, b, c) => [a, b, c].filter(Boolean).join(' '))}
            onChangeText={(v) => updateReg('aadhaar_number', v.replace(/\D/g, '').slice(0, 12))}
          />
          {aadhaarDigits.length > 0 && (
            <Text style={{ fontSize: 11, marginTop: 5, color: aadhaarOk ? '#2e7d32' : '#e65100' }}>
              {aadhaarOk ? t('reg_aadhaar_valid') : tp('reg_aadhaar_digits_needed', { n: String(12 - aadhaarDigits.length) })}
            </Text>
          )}

          <Text style={[rs.fieldLabel, { marginTop: 18 }]}>Aadhaar Photo *</Text>
          <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>{t('reg_aadhaar_photo_hint')}</Text>
          <PhotoBox field="aadhaar_photo" label="Aadhaar Photo" icon="🪪" />

          <Text style={[rs.fieldLabel, { marginTop: 18 }]}>Live Selfie *</Text>
          <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 10, padding: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
            <Text style={{ fontSize: 16, marginRight: 8 }}>🔒</Text>
            <Text style={{ fontSize: 11, color: '#F59E0B', flex: 1 }}>{t('reg_selfie_note')}</Text>
          </View>
          <PhotoBox field="face_photo" label="Live Selfie" icon="🤳" cameraOnly />

          {result ? <Text style={s.err}>{result}</Text> : null}
          <TouchableOpacity
            style={[s.btn, !step5Ok && { opacity: 0.5 }, { marginTop: 20 }]}
            disabled={!step5Ok}
            onPress={() => { setResult(''); setRegStep(6); }}>
            <Text style={s.btnTxt}>Review & Submit →</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ═══ REGISTRATION STEP 6 — Review & Submit ═══
  if (screen === 'login' && regStep === 6) {
    const aadhaarDigs = regData.aadhaar_number.replace(/\D/g, '');
    const maskedAadhaar = aadhaarDigs.length >= 4 ? `XXXX XXXX ${aadhaarDigs.slice(-4)}` : '—';
    const { width: SW } = Dimensions.get('window');
    const THUMB_W = (SW - 40 - 12) / 2;
    const THUMB_H = Math.round(THUMB_W * 0.7);
    const renderDocThumb = (field: string, title: string, sub1: string, sub2: string, goStep: number) => (
      <View key={field} style={{ width: THUMB_W, borderRadius: 12, overflow: 'hidden', borderWidth: 1.5, borderColor: regData[field] ? 'rgba(16,185,129,0.35)' : '#E2E8F0', backgroundColor: regData[field] ? 'rgba(16,185,129,0.04)' : '#F8FAFC' }}>
        {regData[field] ? (
          <Image source={{ uri: regData[field] }} style={{ width: THUMB_W, height: THUMB_H }} resizeMode="cover" />
        ) : (
          <View style={{ width: THUMB_W, height: THUMB_H, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' }}>
            <Text style={{ fontSize: 22 }}>🚫</Text>
            <Text style={{ color: '#94A3B8', fontSize: 10, marginTop: 4 }}>Not uploaded</Text>
          </View>
        )}
        <View style={{ padding: 10 }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: C.pink, letterSpacing: 0.8, marginBottom: 3 }}>{title}</Text>
          {sub1 ? <Text style={{ fontSize: 12, color: '#0F172A', fontWeight: '600' }} numberOfLines={1}>{sub1}</Text> : null}
          {sub2 ? <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }} numberOfLines={1}>{sub2}</Text> : null}
          <TouchableOpacity onPress={() => { setResult(''); setRegStep(goStep); }} style={{ marginTop: 8, backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: 8, padding: 6, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(233,30,99,0.2)' }}>
            <Text style={{ color: C.pink, fontSize: 11, fontWeight: '700' }}>✏️ Edit</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
    return (
      <View style={s.screen}>
        <View style={rs.regHeader}>
          <TouchableOpacity onPress={() => setRegStep(5)} style={{ padding: 4 }}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
          <Text style={rs.regTitle}>Review & Submit</Text>
          <View style={{ width: 50 }} />
        </View>
        <View style={{ height: 4, backgroundColor: '#333' }}><View style={{ height: 4, backgroundColor: C.green, width: '100%' }} /></View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', marginTop: 10, marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' }}>
              <Ionicons name="shield-checkmark" size={15} color={C.green} style={{ marginRight: 6 }} />
              <Text style={{ color: C.green, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>FINAL REVIEW</Text>
            </View>
            <Text style={[rs.bigTitle, { textAlign: 'center', marginTop: 10 }]}>Review Your Documents</Text>
            <Text style={[rs.subTitle, { textAlign: 'center' }]}>Confirm all details are correct before submitting</Text>
          </View>

          <Text style={{ fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.5, marginBottom: 10 }}>IDENTITY & VEHICLE</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            {renderDocThumb('dl_photo', 'DRIVING LICENSE', regData.dl_name || '—', regData.dl_number || '—', 3)}
            {renderDocThumb('vehicle_photo', 'VEHICLE', (`${regData.vehicle_brand} ${regData.vehicle_model}`).trim() || regData.vehicle_type, regData.vehicle_no || '—', 4)}
          </View>

          <Text style={{ fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.5, marginBottom: 10 }}>IDENTITY PROOF & SELFIE</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: regData.rc_photo ? 16 : 20 }}>
            {renderDocThumb('aadhaar_photo', 'AADHAAR CARD', maskedAadhaar, 'Government ID', 5)}
            {renderDocThumb('face_photo', 'LIVE SELFIE', 'Face verification', 'Identity match', 5)}
          </View>

          {!!regData.rc_photo && (
            <>
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.5, marginBottom: 10 }}>REGISTRATION CERTIFICATE</Text>
              <View style={{ flexDirection: 'row', marginBottom: 20 }}>
                {renderDocThumb('rc_photo', 'RC PHOTO', 'Vehicle registration', 'Optional document', 4)}
              </View>
            </>
          )}

          <View style={{ backgroundColor: 'rgba(239,68,68,0.07)', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' }}>
            <Text style={{ color: '#DC2626', fontWeight: '800', fontSize: 13, marginBottom: 8 }}>⚠️ Before You Submit</Text>
            <Text style={{ color: '#7F1D1D', fontSize: 12, lineHeight: 20 }}>
              {'• All document photos must be clear and fully readable\n• Expired or blurry documents will be immediately rejected\n• Providing false information may result in a permanent ban'}
            </Text>
          </View>

          {result ? <Text style={s.err}>{result}</Text> : null}
          <TouchableOpacity
            style={[s.btn, { backgroundColor: C.green }, loading && { opacity: 0.55 }]}
            disabled={loading}
            onPress={submitRegistration}>
            <Text style={s.btnTxt}>{loading ? '⏳ Submitting Application...' : '🛡️ Submit Application'}</Text>
          </TouchableOpacity>
          <Text style={{ color: '#94A3B8', fontSize: 11, textAlign: 'center', marginTop: 12, lineHeight: 17 }}>Your documents are encrypted and securely stored</Text>
        </ScrollView>
      </View>
    );
  }

  // ═══ REGISTRATION DONE ═══
  if (screen === 'login' && regStep === 99) return (
    <View style={s.screen}>
      <View style={[s.hero, { backgroundColor: '#F0FDF4' }]}>
        <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(16,185,129,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(16,185,129,0.4)', marginBottom: 12 }}>
          <Ionicons name="shield-checkmark" size={44} color={C.green} />
        </View>
        <Text style={[s.heroTitle, { color: '#064E3B' }]}>Application Submitted</Text>
        <Text style={{ color: '#059669', fontSize: 13, marginTop: 4, fontWeight: '700', letterSpacing: 1 }}>SPPERO BUDDY CAPTAIN</Text>
      </View>
      <View style={{ padding: 24 }}>
        <View style={{ backgroundColor: 'rgba(16,185,129,0.07)', borderRadius: 14, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' }}>
          <Text style={{ color: '#065F46', fontSize: 14, lineHeight: 24, textAlign: 'center' }}>
            Your application has been received. Our team will verify your Driving License, Aadhaar, Vehicle photo, and Selfie.
          </Text>
        </View>
        <View style={{ backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 12, padding: 14, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="time" size={20} color="#F59E0B" style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#92400E', fontWeight: '700', fontSize: 13 }}>Verification in Progress</Text>
            <Text style={{ color: '#B45309', fontSize: 12, marginTop: 2 }}>You'll be notified once your account is approved</Text>
          </View>
        </View>
        <TouchableOpacity style={[s.btn, { backgroundColor: '#0F172A' }]} onPress={() => { setRegStep(0); setPhone(regData.phone); }}>
          <Text style={s.btnTxt}>← Back to Login</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ═══ VERIFICATION STATUS ═══
  if (screen === 'login' && driverInfo && driverInfo.status !== 'approved') {
    const statusConfig: any = {
      pending:   { icon: '⏳', title: 'Verification Pending',    bg: '#fff3e0', col: '#ef6c00', msg: 'Admin is verifying your documents. Status will update shortly.' },
      rejected:  { icon: '❌', title: 'Documents Rejected', bg: '#ffebee', col: '#c62828', msg: "There's an issue with your documents — read the admin message below and resubmit." },
      resubmit:  { icon: '📋', title: 'Resubmit Documents', bg: '#e3f2fd', col: '#1565c0', msg: 'Admin has requested some documents again — read the message below and upload them.' },
      suspended: { icon: '🚫', title: 'Account Suspended',        bg: '#ffebee', col: '#c62828', msg: 'Your account has been suspended. Please contact support.' },
    };
    const cfg = statusConfig[driverInfo.status] || statusConfig.pending;
    return (
      <View style={s.screen}>
        <View style={s.hero}>
          <Text style={{ fontSize: 70 }}>{cfg.icon}</Text>
          <Text style={s.heroTitle}>{cfg.title}</Text>
          <Text style={{ color: '#aaa', fontSize: 13, marginTop: 4 }}>Sppero Buddy Captain</Text>
        </View>
        <View style={{ padding: 24 }}>
          <View style={{ backgroundColor: cfg.bg, borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <Text style={{ fontSize: 15, lineHeight: 24, textAlign: 'center', color: cfg.col }}>{cfg.msg}</Text>
          </View>
          {driverInfo.admin_message ? (
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 18, marginBottom: 20, borderWidth: 2, borderColor: cfg.col }}>
              <Text style={{ fontSize: 13, color: '#94A3B8', marginBottom: 6, fontWeight: '600' }}>{t('reg_admin_message_label')}</Text>
              <Text style={{ fontSize: 15, color: '#0F172A', fontWeight: '500', lineHeight: 22 }}>{driverInfo.admin_message}</Text>
            </View>
          ) : null}
          {(driverInfo.status === 'rejected' || driverInfo.status === 'resubmit') && (
            <TouchableOpacity style={s.btn} onPress={() => { setRegData((p: any) => ({ ...p, phone: driverInfo.phone })); setDriverInfo(null); setRegStep(2); }}>
              <Text style={s.btnTxt}>{t('reg_resubmit_docs_btn')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.btn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#E2E8F0', marginTop: 10 }]} onPress={() => { setDriverInfo(null); setLoginPhone(''); setResult(''); }}>
            <Text style={[s.btnTxt, { color: '#64748B' }]}>{t('reg_back_to_login')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ═══ LOGIN ═══
  if (screen === 'login') {
    const LOGIN_CAPTIONS = [
      { emoji: '👑', line1: t('cap0_l1'), line2: t('cap0_l2'), sub: t('cap0_sub') },
      { emoji: '🗺️', line1: t('cap1_l1'), line2: t('cap1_l2'), sub: t('cap1_sub') },
      { emoji: '💰', line1: t('cap2_l1'), line2: t('cap2_l2'), sub: t('cap2_sub') },
      { emoji: '🛺', line1: t('cap3_l1'), line2: t('cap3_l2'), sub: t('cap3_sub') },
      { emoji: '⭐', line1: t('cap4_l1'), line2: t('cap4_l2'), sub: t('cap4_sub') },
    ];
    const cap = LOGIN_CAPTIONS[loginCaptionIdx];

    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#08080F' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <StatusBar barStyle="light-content" backgroundColor="#08080F" />

        {/* ══════════ IMMERSIVE ADS BANNER ══════════ */}
        {!loginOtpSent && (
          <View style={{ flex: 1, backgroundColor: '#08080F', overflow: 'hidden' }}>

            {/* Starfield */}
            {[8,22,35,48,61,74,15,29,42,55,68,81,5,19,33,47,60,73,86,11,25,38,52,65,78,3,17,31,45,59].map((v, i) => (
              <View key={i} style={{
                position: 'absolute',
                width: i % 4 === 0 ? 3 : i % 3 === 0 ? 2 : 1.5,
                height: i % 4 === 0 ? 3 : i % 3 === 0 ? 2 : 1.5,
                borderRadius: 2,
                backgroundColor: `rgba(255,255,255,${0.15 + (i % 6) * 0.06})`,
                top: `${v}%` as any,
                left: `${(v * 3 + i * 7) % 95}%` as any,
              }} />
            ))}

            {/* Pink glow top-left */}
            <Animated.View style={{
              position: 'absolute', width: 300, height: 300, borderRadius: 150,
              backgroundColor: 'rgba(233,30,99,0.13)', top: -80, left: -80,
              opacity: loginGlowAnim,
              transform: [{ scale: loginGlowAnim.interpolate({ inputRange: [0.25, 1], outputRange: [0.92, 1.08] }) }],
            }} />
            {/* Purple glow bottom-right */}
            <Animated.View style={{
              position: 'absolute', width: 220, height: 220, borderRadius: 110,
              backgroundColor: 'rgba(124,58,237,0.12)', bottom: 80, right: -60,
              opacity: loginGlowAnim.interpolate({ inputRange: [0.25, 1], outputRange: [1, 0.3] }),
            }} />
            {/* Gold accent dot */}
            <View style={{ position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(245,197,24,0.07)', top: '40%', right: 20 }} />

            {/* Road surface at bottom */}
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 }}>
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 72, backgroundColor: '#0D0D14', borderTopWidth: 1, borderTopColor: 'rgba(245,197,24,0.12)' }} />
              {/* Lane dashes */}
              {[0,1,2,3,4,5].map(i => (
                <View key={i} style={{ position: 'absolute', bottom: 32, left: `${12 + i * 15}%` as any, width: 22, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)' }} />
              ))}
              {/* Edge lines */}
              <View style={{ position: 'absolute', bottom: 0, left: '8%', width: 2, height: 72, backgroundColor: 'rgba(245,197,24,0.35)', transform: [{ skewX: '-8deg' }] }} />
              <View style={{ position: 'absolute', bottom: 0, right: '8%', width: 2, height: 72, backgroundColor: 'rgba(245,197,24,0.35)', transform: [{ skewX: '8deg' }] }} />
            </View>

            {/* Car + glow ring */}
            <View style={{ position: 'absolute', bottom: 68, left: 0, right: 0, alignItems: 'center' }}>
              <Animated.View style={{
                width: 130, height: 130, borderRadius: 65,
                backgroundColor: 'rgba(233,30,99,0.07)',
                alignItems: 'center', justifyContent: 'center',
                opacity: loginGlowAnim,
                transform: [{ scale: loginGlowAnim.interpolate({ inputRange: [0.25, 1], outputRange: [1, 1.12] }) }],
              }}>
                <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(233,30,99,0.14)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(233,30,99,0.5)', elevation: 12, shadowColor: C.pink, shadowOpacity: 0.6, shadowRadius: 16 }}>
                  <Ionicons name="car-sport" size={44} color={C.pink} />
                </View>
              </Animated.View>
              {/* Headlight beams */}
              <View style={{ position: 'absolute', bottom: 10, left: '52%', width: 60, height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, transform: [{ rotate: '-5deg' }] }} />
              <View style={{ position: 'absolute', bottom: 10, right: '52%', width: 60, height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, transform: [{ rotate: '5deg' }] }} />
              {/* Shadow under car */}
              <View style={{ width: 80, height: 6, borderRadius: 3, backgroundColor: 'rgba(233,30,99,0.25)', marginTop: -6 }} />
            </View>

            {/* Sppero brand top */}
            <View style={{ position: 'absolute', top: Platform.OS === 'android' ? 46 : 58, left: 0, right: 0, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center', elevation: 10, shadowColor: C.pink, shadowOpacity: 0.9, shadowRadius: 12 }}>
                  <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>S</Text>
                </View>
                <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '900', letterSpacing: 0.5 }}>Sppero</Text>
                <View style={{ backgroundColor: 'rgba(233,30,99,0.22)', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(233,30,99,0.55)' }}>
                  <Text style={{ color: C.pink, fontSize: 9, fontWeight: '900', letterSpacing: 1.6 }}>CAPTAIN</Text>
                </View>
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '700', letterSpacing: 2.5 }}>INDIA KA APNA RIDE PLATFORM</Text>
            </View>

            {/* Animated motivational caption */}
            <View style={{ position: 'absolute', top: '28%', left: 0, right: 0, paddingHorizontal: 28, alignItems: 'center' }}>
              <Animated.View style={{ alignItems: 'center', opacity: loginCaptionFade, transform: [{ translateY: loginCaptionSlide }] }}>
                <Text style={{ fontSize: 48, marginBottom: 12 }}>{cap.emoji}</Text>
                <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '900', textAlign: 'center', letterSpacing: -0.3, lineHeight: 34 }}>{cap.line1}</Text>
                <Text style={{ color: C.pink, fontSize: 28, fontWeight: '900', textAlign: 'center', letterSpacing: -0.3, lineHeight: 34, marginBottom: 10 }}>{cap.line2}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, textAlign: 'center', fontWeight: '500', lineHeight: 19, maxWidth: 260 }}>{cap.sub}</Text>
              </Animated.View>
            </View>

            {/* Caption progress dots */}
            <View style={{ position: 'absolute', bottom: 118, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
              {[0,1,2,3,4].map(i => (
                <View key={i} style={{ width: i === loginCaptionIdx ? 22 : 6, height: 6, borderRadius: 3, backgroundColor: i === loginCaptionIdx ? C.pink : 'rgba(255,255,255,0.2)' }} />
              ))}
            </View>

            {/* Stats strip */}
            <View style={{ position: 'absolute', bottom: 135, left: 16, right: 16, flexDirection: 'row', gap: 8 }}>
              {[
                { val: '₹800+', sub: 'per day avg' },
                { val: '10K+',  sub: 'Captains' },
                { val: '4.8 ★', sub: 'App rating' },
              ].map((st, i) => (
                <View key={i} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 13, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }}>
                  <Text style={{ color: '#F5C518', fontSize: 15, fontWeight: '900' }}>{st.val}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.38)', fontSize: 9, marginTop: 2, fontWeight: '700', letterSpacing: 0.5 }}>{st.sub}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ══════════ LOGIN CARD ══════════ */}
        <View style={{
          backgroundColor: '#FFFFFF',
          borderTopLeftRadius: loginOtpSent ? 0 : 28,
          borderTopRightRadius: loginOtpSent ? 0 : 28,
          paddingTop: loginOtpSent ? (Platform.OS === 'android' ? 52 : 66) : 18,
          paddingHorizontal: 22,
          paddingBottom: 30,
          elevation: 28,
          shadowColor: C.pink,
          shadowOpacity: 0.18,
          shadowRadius: 22,
          flex: loginOtpSent ? 1 : undefined,
        }}>

          {/* OTP screen mini header */}
          {loginOtpSent && (
            <View style={{ alignItems: 'center', marginBottom: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>S</Text>
                </View>
                <Text style={{ color: '#0F172A', fontSize: 20, fontWeight: '900', letterSpacing: 0.3 }}>Sppero Captain</Text>
              </View>
            </View>
          )}

          {/* Drag handle */}
          {!loginOtpSent && <View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginBottom: 14 }} />}

          {/* Language picker — only on main login screen */}
          {!loginOtpSent && (
            <View style={{ marginBottom: 18 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.2, textAlign: 'center', marginBottom: 8 }}>{t('lang_choose').toUpperCase()}</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => changeLang('hi')}
                  style={{ flex: 1, borderRadius: 14, borderWidth: 2, borderColor: lang === 'hi' ? C.pink : '#E2E8F0', backgroundColor: lang === 'hi' ? 'rgba(233,30,99,0.07)' : '#F8FAFC', paddingVertical: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, marginBottom: 2 }}>🇮🇳</Text>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: lang === 'hi' ? C.pink : '#94A3B8' }}>{t('lang_hi_label')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => changeLang('en')}
                  style={{ flex: 1, borderRadius: 14, borderWidth: 2, borderColor: lang === 'en' ? C.pink : '#E2E8F0', backgroundColor: lang === 'en' ? 'rgba(233,30,99,0.07)' : '#F8FAFC', paddingVertical: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, marginBottom: 2 }}>🇬🇧</Text>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: lang === 'en' ? C.pink : '#94A3B8' }}>{t('lang_en_label')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Text style={{ color: '#0F172A', fontSize: 21, fontWeight: '900', marginBottom: 4 }}>
            {loginOtpSent ? t('login_otp_title') : t('login_title')}
          </Text>
          <Text style={{ color: '#64748B', fontSize: 13, marginBottom: 22, lineHeight: 19 }}>
            {loginOtpSent
              ? tp('login_otp_sub', { phone: loginPhone })
              : t('login_subtitle')}
          </Text>

          {!loginOtpSent ? (
            <View>
              {/* Phone input */}
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1.5, borderColor: loginPhone.length > 0 ? C.pink : '#E2E8F0', paddingHorizontal: 14, marginBottom: 16 }}>
                <View style={{ backgroundColor: C.pink, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5, marginRight: 12 }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>🇮🇳 +91</Text>
                </View>
                <TextInput
                  style={{ flex: 1, fontSize: 18, fontWeight: '700', color: '#0F172A', paddingVertical: 14 }}
                  placeholder="10 digit mobile number"
                  placeholderTextColor="#CBD5E1"
                  keyboardType="numeric"
                  maxLength={10}
                  value={loginPhone}
                  onChangeText={setLoginPhone}
                />
                {loginPhone.length === 10 && (
                  <Ionicons name="checkmark-circle" size={22} color={C.green} />
                )}
              </View>

              {result ? <Text style={{ color: '#EF4444', fontSize: 12, marginBottom: 12, fontWeight: '600' }}>{result}</Text> : null}

              {/* Send OTP button */}
              <Bouncy
                style={{ backgroundColor: loginPhone.length !== 10 ? '#F1F5F9' : C.pink, borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginBottom: 20, elevation: loginPhone.length === 10 ? 10 : 0, shadowColor: C.pink, shadowOpacity: 0.45, shadowRadius: 14 }}
                disabled={loginPhone.length !== 10 || loading}
                onPress={doLogin}>
                <Text style={{ color: loginPhone.length !== 10 ? '#94A3B8' : '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.3 }}>
                  {loading ? t('login_sending') : t('login_send_otp')}
                </Text>
              </Bouncy>

              {/* Divider */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 12 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: '#F1F5F9' }} />
                <Text style={{ color: '#CBD5E1', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>NEW CAPTAIN?</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: '#F1F5F9' }} />
              </View>

              {/* Become Sppero Buddy Banner */}
              <Bouncy
                onPress={() => { setRegStep(1); setResult(''); }}
                style={{ borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: '#F5C518', elevation: 6, shadowColor: '#F5C518', shadowOpacity: 0.3, shadowRadius: 10 }}>
                <View style={{ backgroundColor: '#0D0B02', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#F5C518', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#F5C518', shadowOpacity: 0.5, shadowRadius: 6 }}>
                    <Text style={{ fontSize: 24 }}>⭐</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#F5C518', fontSize: 16, fontWeight: '900', letterSpacing: 0.2 }}>Become Sppero Buddy</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 3, lineHeight: 16 }}>Register as Captain · Free · Just 5 minutes</Text>
                  </View>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5C518', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#0D0B02', fontSize: 16, fontWeight: '900' }}>›</Text>
                  </View>
                </View>
              </Bouncy>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* OTP sent notice */}
              <View style={{ backgroundColor: 'rgba(233,30,99,0.06)', borderRadius: 14, padding: 14, marginBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(233,30,99,0.2)' }}>
                <Text style={{ fontSize: 20 }}>📱</Text>
                <Text style={{ fontSize: 12, color: C.pink, flex: 1, fontWeight: '600', lineHeight: 18 }}>{t('login_otp_tip')}</Text>
              </View>

              {/* 6 OTP Boxes */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                {loginOtpDigits.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={(ref) => { loginOtpRefs.current[i] = ref; }}
                    style={{ width: 44, height: 56, borderRadius: 14, textAlign: 'center', fontSize: 24, fontWeight: '900', borderWidth: 2.5, borderColor: digit ? C.pink : '#E2E8F0', backgroundColor: digit ? 'rgba(233,30,99,0.06)' : '#F8FAFC', color: '#0F172A', elevation: digit ? 4 : 0, shadowColor: C.pink, shadowOpacity: digit ? 0.25 : 0, shadowRadius: 6 }}
                    keyboardType="number-pad" maxLength={1} value={digit}
                    onChangeText={(t) => handleLoginOtpChange(t, i)}
                    onKeyPress={({ nativeEvent }) => handleLoginOtpKeyPress(nativeEvent.key, i)}
                  />
                ))}
              </View>

              {devOtp ? (
                <TouchableOpacity onPress={() => { const d = devOtp.split(''); setLoginOtpDigits(d); setLoginOtp(devOtp); }} style={{ backgroundColor: '#1e3a5f', borderRadius: 12, padding: 12, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 16 }}>🧪</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#7dd3fc', fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>TEST OTP (tap to fill)</Text>
                    <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 8, marginTop: 2 }}>{devOtp}</Text>
                  </View>
                  <Text style={{ color: '#7dd3fc', fontSize: 11 }}>Auto-fill →</Text>
                </TouchableOpacity>
              ) : null}

              {result ? <Text style={{ color: '#EF4444', fontSize: 12, marginBottom: 12, fontWeight: '600' }}>{result}</Text> : null}

              {/* Verify button */}
              <Bouncy
                style={{ backgroundColor: (loading || loginOtpDigits.join('').length < 6) ? '#F1F5F9' : C.pink, borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginBottom: 14, elevation: loginOtpDigits.join('').length === 6 ? 10 : 0, shadowColor: C.pink, shadowOpacity: 0.45, shadowRadius: 14 }}
                disabled={loading || loginOtpDigits.join('').length < 6}
                onPress={() => verifyLoginOtp()}>
                <Text style={{ color: (loading || loginOtpDigits.join('').length < 6) ? '#94A3B8' : '#fff', fontSize: 16, fontWeight: '900' }}>
                  {loading ? t('login_verifying') : t('login_verify')}
                </Text>
              </Bouncy>

              {/* Resend */}
              <View style={{ alignItems: 'center', marginBottom: 12 }}>
                {loginCanResend
                  ? <TouchableOpacity onPress={() => { setLoginOtpDigits(['','','','','','']); setLoginOtp(''); setResult(''); doLogin(); }}>
                      <Text style={{ color: C.pink, fontWeight: '800', fontSize: 13 }}>{t('login_resend')}</Text>
                    </TouchableOpacity>
                  : <Text style={{ color: '#94A3B8', fontSize: 12 }}>{tp('login_resend_wait', { sec: String(loginResendTimer) })}</Text>
                }
              </View>
              <TouchableOpacity onPress={() => { setLoginOtpSent(false); setLoginOtpDigits(['','','','','','']); setResult(''); }} style={{ alignItems: 'center', paddingVertical: 4 }}>
                <Text style={{ color: '#64748B', fontSize: 12 }}>{t('login_change_number')}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ═══ PAYMENT WAITING SCREEN ═══
  if (paymentWaiting) return (
    <ScreenIn style={{ flex: 1, backgroundColor: C.bgDark }}>

      {/* ── Pre-queue floating card — shown when a next ride is offered ── */}
      {preQueued && !preQueueAccepted && (
        <PreQueueCard
          preQueued={preQueued}
          phone={phone}
          onAccept={() => {
            fetch(`${API}/api/rides/pre-accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ride_id: preQueued.rideId, phone }) })
              .then(r => r.json())
              .then(d => { if (d.success) setPreQueueAccepted(true); else setResult('❌ ' + (d.error || 'Accept failed')); })
              .catch(() => setResult('❌ Network error'));
          }}
          onDecline={() => {
            fetch(`${API}/api/rides/pre-decline`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ride_id: preQueued.rideId, phone }) })
              .then(() => { setPreQueued(null); })
              .catch(() => setPreQueued(null));
          }}
        />
      )}
      {preQueued && preQueueAccepted && (
        <View style={{ position: 'absolute', bottom: 90, left: 16, right: 16, zIndex: 999, backgroundColor: '#022C22', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#4ADE80', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 18 }}>✅</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#4ADE80', fontWeight: '900', fontSize: 13 }}>Next Ride Queued!</Text>
            <Text style={{ color: '#86EFAC', fontSize: 11, marginTop: 2 }}>{preQueued.pickup} · {preQueued.fare}</Text>
          </View>
        </View>
      )}

      {/* ── Hero: fare + net earning ── */}
      <View style={{
        paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 20 : 56,
        paddingBottom: 30, paddingHorizontal: 24, alignItems: 'center', overflow: 'hidden',
      }}>
        <View style={{ position: 'absolute', width: 340, height: 340, borderRadius: 170, backgroundColor: 'rgba(0,200,83,0.06)', top: -80, right: -100 }} />
        <View style={{ position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,45,120,0.04)', bottom: -40, left: -50 }} />

        <View style={{ backgroundColor: 'rgba(0,200,83,0.15)', borderRadius: R.full, paddingHorizontal: 18, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(0,200,83,0.35)', marginBottom: 18 }}>
          <Text style={{ color: C.online, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>🏁  TRIP COMPLETE</Text>
        </View>

        <CountUp value={paymentFare} prefix="₹" style={{ ...T.earnings, color: '#FFFFFF', letterSpacing: -2.5, lineHeight: 56 }} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: 'rgba(0,200,83,0.12)', borderRadius: R.full, paddingHorizontal: 18, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(0,200,83,0.3)' }}>
          <Text style={{ fontSize: 13, color: C.online, fontWeight: '900' }}>Net Kamai: ₹{(parseFloat(paymentFare) * 0.85).toFixed(0)}</Text>
          <Text style={{ fontSize: 11, color: 'rgba(0,200,83,0.55)' }}>· 15% fee ke baad</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 44 }} showsVerticalScrollIndicator={false}>

        {/* ── Cash mode: amber confirm card ── */}
        {paymentMethod === 'cash' && (
          <SlideIn style={{ marginBottom: 14 }}>
            <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: R.md, padding: 20, borderWidth: 1.5, borderColor: 'rgba(245,158,11,0.38)' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                <Text style={{ fontSize: 28, marginRight: 12 }}>💵</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: '#F59E0B' }}>{t('cust_chose_cash')}</Text>
                  <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>{tp('cash_collect_hint', { fare: String(paymentFare) })}</Text>
                </View>
              </View>
              <Bouncy
                style={{ backgroundColor: C.online, borderRadius: R.sm, padding: 18, alignItems: 'center', opacity: loading ? 0.6 : 1, ...SHADOW.green }}
                onPress={() => confirmDirectPayment('cash')} disabled={loading}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17, letterSpacing: 0.2 }}>{tp('cash_received_label', { fare: String(paymentFare) })}</Text>
              </Bouncy>
            </View>
          </SlideIn>
        )}

        {/* ── Online mode: animated waiting ── */}
        {paymentMethod !== 'cash' && (
          <SlideIn style={{ marginBottom: 14 }}>
            <View style={{ backgroundColor: 'rgba(0,200,83,0.07)', borderRadius: R.md, padding: 20, borderWidth: 1, borderColor: 'rgba(0,200,83,0.18)', alignItems: 'center' }}>
              <FloatingDots color={C.online} />
              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 14, fontWeight: '600' }}>
                {t('customer_paying_label')}
              </Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 5 }}>{t('screen_updates_on_confirm')}</Text>
            </View>
          </SlideIn>
        )}

        {/* ── Quick confirm row ── */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 22 }}>
          <Bouncy
            style={{ flex: 1, backgroundColor: 'rgba(0,200,83,0.1)', borderRadius: R.sm, paddingVertical: 18, paddingHorizontal: 10, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(0,200,83,0.32)', opacity: loading ? 0.6 : 1 }}
            onPress={() => confirmDirectPayment('cash')} disabled={loading}>
            <Text style={{ fontSize: 28, marginBottom: 6 }}>💵</Text>
            <Text style={{ fontSize: 14, fontWeight: '900', color: C.online }}>{t('cash_received_short')}</Text>
            <Text style={{ fontSize: 12, color: 'rgba(0,200,83,0.55)', marginTop: 4, fontWeight: '700' }}>₹{paymentFare}</Text>
          </Bouncy>
          <Bouncy
            style={{ flex: 1, backgroundColor: 'rgba(255,45,120,0.07)', borderRadius: R.sm, paddingVertical: 18, paddingHorizontal: 10, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,45,120,0.28)', opacity: loading ? 0.6 : 1 }}
            onPress={() => confirmDirectPayment('upi_direct')} disabled={loading}>
            <Text style={{ fontSize: 28, marginBottom: 6 }}>📱</Text>
            <Text style={{ fontSize: 14, fontWeight: '900', color: C.pink }}>{t('upi_received_short')}</Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,45,120,0.55)', marginTop: 4, fontWeight: '700' }}>₹{paymentFare}</Text>
          </Bouncy>
        </View>

        {/* ── Divider ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 22 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' }} />
          <Text style={{ color: 'rgba(255,255,255,0.22)', marginHorizontal: 14, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 }}>{t('or_show_customer')}</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' }} />
        </View>

        {/* ── QR Code ── */}
        {driverUpiId ? (() => {
          const upiLink = `upi://pay?pa=${encodeURIComponent(driverUpiId)}&pn=${encodeURIComponent(driverInfo?.name || 'Driver')}&am=${paymentFare}&cu=INR&tn=Sppero%20Trip`;
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=${encodeURIComponent(upiLink)}`;
          return (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: R.md, padding: 22, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#fff', marginBottom: 3 }}>{t('show_customer_title')}</Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 18, letterSpacing: 0.3 }}>GPay · PhonePe · Paytm · Any UPI</Text>
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: R.md, padding: 10, elevation: 12, shadowColor: C.pink, shadowOpacity: 0.3, shadowRadius: 16 }}>
                <Image source={{ uri: qrUrl }} style={{ width: 220, height: 220, borderRadius: R.xs }} resizeMode="contain" />
              </View>
              <Text style={{ fontSize: 13, color: C.pink, marginTop: 16, fontWeight: '800', letterSpacing: 0.2 }}>{driverUpiId}</Text>
              <View style={{ backgroundColor: C.pink, borderRadius: R.full, paddingHorizontal: 28, paddingVertical: 10, marginTop: 12, ...SHADOW.pink }}>
                <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: -1 }}>₹{paymentFare}</Text>
              </View>
            </View>
          );
        })() : (
          <View style={{ backgroundColor: 'rgba(245,158,11,0.07)', borderRadius: R.sm, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(245,158,11,0.22)', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 18 }}>⚠️</Text>
            <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '600', flex: 1 }}>{t('upi_qr_hint')}</Text>
          </View>
        )}

        {/* ── Payment not received ── */}
        <TouchableOpacity
          onPress={() => Alert.alert(
            '⚠️ Payment Not Received?',
            `Customer didn't pay you ₹${paymentFare} cash?\n\nThis can only be reported within 10 minutes. The customer's account will be flagged and the Sppero team will investigate.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Yes, Report It', style: 'destructive', onPress: async () => {
                try {
                  const res = await fetch(`${API}/api/rides/payment-not-received`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ride_id: paymentRideId, driver_phone: phone }),
                  });
                  const d = await res.json();
                  if (d.success) {
                    Alert.alert('✅ Report Filed',
                      "The customer's account has been flagged. The Sppero team will review within 24 hours.\n\nThis will be recorded on the customer's account.",
                      [{ text: 'OK', onPress: () => setPaymentWaiting(false) }]
                    );
                  } else {
                    Alert.alert('❌ Error', d.error || 'Could not file the report');
                  }
                } catch {
                  Alert.alert('❌ Network Error', 'Please try again');
                }
              }},
            ]
          )}
          style={{ backgroundColor: 'rgba(239,68,68,0.07)', borderRadius: R.sm, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.22)' }}>
          <Text style={{ fontSize: 20 }}>🚨</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', fontSize: 13, color: '#EF4444' }}>{t('payment_not_done_label')}</Text>
            <Text style={{ fontSize: 11, color: 'rgba(239,68,68,0.55)', marginTop: 2 }}>{t('payment_not_received_sub')}</Text>
          </View>
          <Text style={{ color: 'rgba(239,68,68,0.4)', fontSize: 18 }}>›</Text>
        </TouchableOpacity>

      </ScrollView>
    </ScreenIn>
  );

  // ═══ CUSTOMER CANCELLED — POPUP ═══
  // Rendered as Modal so it overlays any active screen (live tab, nav, etc.)
  // cancelPopup state is set by FCM ride_cancelled handler

  // ═══ DRIVER CANCEL MODAL ═══
  if (showDriverCancelModal) return (
    <View style={s.screen}>
      <View style={{ flex: 1, backgroundColor: 'rgba(8,14,24,0.82)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingTop: 12, paddingHorizontal: 20, paddingBottom: 36 }}>
          {/* Drag pill */}
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 20 }} />
          {/* Icon + title */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,45,120,0.10)', borderWidth: 1.5, borderColor: 'rgba(255,45,120,0.25)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close-circle" size={28} color={C.pink} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 19, fontWeight: '900', color: '#0F172A', letterSpacing: -0.3 }}>{t('cancel_modal_title')}</Text>
              <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{t('cancel_modal_sub')}</Text>
            </View>
          </View>
          {/* Warning banner */}
          <View style={{ backgroundColor: 'rgba(245,158,11,0.09)', borderRadius: 12, padding: 13, marginBottom: 18, borderWidth: 1, borderColor: 'rgba(245,158,11,0.28)', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="warning" size={18} color="#F59E0B" />
            <Text style={{ fontSize: 13, color: '#92650A', fontWeight: '600', flex: 1, lineHeight: 18 }}>{t('cancel_suspend_warn')}</Text>
          </View>
          {/* Reason selector */}
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 10, letterSpacing: 0.3, textTransform: 'uppercase' }}>{t('cancel_choose_reason')}</Text>
          {[t('cancel_reason_1'), t('cancel_reason_2'), t('cancel_reason_3'), t('cancel_reason_4'), t('cancel_reason_5')].map((reason, i) => (
            <TouchableOpacity key={i}
              style={{
                borderRadius: 12, padding: 14, marginBottom: 8,
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: cancelReason === reason ? 'rgba(255,45,120,0.07)' : '#F8FAFC',
                borderWidth: 1.5,
                borderColor: cancelReason === reason ? C.pink : '#E2E8F0',
              }}
              onPress={() => setCancelReason(reason)}>
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: cancelReason === reason ? C.pink : '#CBD5E1', backgroundColor: cancelReason === reason ? C.pink : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {cancelReason === reason && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />}
              </View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: cancelReason === reason ? C.pink : '#334155', flex: 1 }}>{reason}</Text>
            </TouchableOpacity>
          ))}
          {/* Actions */}
          <TouchableOpacity
            style={{ backgroundColor: C.pink, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 10, opacity: cancelReason ? 1 : 0.45, elevation: cancelReason ? 6 : 0, shadowColor: C.pink, shadowOpacity: 0.35, shadowRadius: 10 }}
            disabled={!cancelReason || loading}
            onPress={cancelTrip}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 0.2 }}>{loading ? t('cancel_loading') : t('cancel_trip_btn')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ padding: 16, alignItems: 'center' }} onPress={() => { setShowDriverCancelModal(false); setCancelReason(''); }}>
            <Text style={{ color: '#64748B', fontWeight: '700', fontSize: 14 }}>{t('keep_trip_btn')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );


  // ═══ CUSTOMER CANCEL POPUP ═══
  if (cancelPopup) return (
    <View style={{ flex: 1, backgroundColor: 'rgba(8,14,24,0.88)', justifyContent: 'center', alignItems: 'center', padding: 28 }}>
      <View style={{ backgroundColor: '#FFFFFF', borderRadius: 26, padding: 32, alignItems: 'center', width: '100%', elevation: 20, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 2, borderColor: '#EF4444', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
          <Text style={{ fontSize: 34 }}>🚫</Text>
        </View>
        <Text style={{ fontSize: 20, fontWeight: '900', color: '#0F172A', marginBottom: 8, textAlign: 'center' }}>{cancelPopup.msg}</Text>
        <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 28, lineHeight: 20 }}>{cancelPopup.sub}</Text>
        <TouchableOpacity
          onPress={() => setCancelPopup(null)}
          style={{ backgroundColor: '#FF2D78', borderRadius: 14, paddingVertical: 15, paddingHorizontal: 52, elevation: 6, shadowColor: '#FF2D78', shadowOpacity: 0.35, shadowRadius: 8 }}
        >
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 0.3 }}>{t('okay_btn')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ═══ DISTANCE WARNING MODAL ═══
  if (distWarnModal) return (
    <View style={{ flex: 1, backgroundColor: 'rgba(8,14,24,0.90)', justifyContent: 'flex-end' }}>
      <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingTop: 12, paddingHorizontal: 24, paddingBottom: Platform.OS === 'android' ? 68 : 44 }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 24 }} />
        {/* Route visual */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24, paddingHorizontal: 8 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(66,133,244,0.12)', borderWidth: 2, borderColor: '#4285F4', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="car" size={22} color="#4285F4" />
          </View>
          <View style={{ flex: 1, marginHorizontal: 8, alignItems: 'center' }}>
            <View style={{ width: '100%', borderBottomWidth: 2, borderColor: '#E2E8F0', borderStyle: 'dashed' }} />
            <View style={{ position: 'absolute', backgroundColor: '#FFF7ED', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#EF4444' }}>{tp('dist_from_drop_label', { km: String(distWarnModal.dist) })}</Text>
            </View>
          </View>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(239,68,68,0.10)', borderWidth: 2, borderColor: '#EF4444', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="location" size={22} color="#EF4444" />
          </View>
        </View>
        <Text style={{ fontSize: 21, fontWeight: '900', color: '#0F172A', textAlign: 'center', marginBottom: 10, letterSpacing: -0.4 }}>{t('drop_far_title')}</Text>
        <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>
          {t('drop_far_body1')} <Text style={{ fontWeight: '900', color: '#EF4444' }}>{distWarnModal.dist} km</Text> {t('drop_far_body2')}{'\n'}
          {t('drop_far_body3')} <Text style={{ fontWeight: '700', color: '#0F172A' }}>platform policy violation</Text> {t('drop_far_body4')}
        </Text>
        {/* Primary — go to drop */}
        <TouchableOpacity
          style={{ backgroundColor: '#FF2D78', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 10, elevation: 6, shadowColor: '#FF2D78', shadowOpacity: 0.40, shadowRadius: 10 }}
          onPress={() => { distWarnResolveRef.current?.(false); setDistWarnModal(null); }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 0.2 }}>{t('go_to_drop_first_btn')}</Text>
        </TouchableOpacity>
        {/* Secondary — force complete (danger) */}
        <TouchableOpacity
          style={{ borderWidth: 1.5, borderColor: '#EF4444', borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: '#FFF5F5' }}
          onPress={() => { distWarnResolveRef.current?.(true); setDistWarnModal(null); }}>
          <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 14 }}>{t('complete_anyway_btn')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ═══ EARLY COMPLETION FLAGGED MODAL ═══
  if (earlyFlagModal) return (
    <View style={{ flex: 1, backgroundColor: 'rgba(8,14,24,0.92)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <View style={{ backgroundColor: '#FFFFFF', borderRadius: 28, padding: 30, width: '100%', alignItems: 'center', elevation: 24, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 24 }}>
        {/* Warning icon */}
        <View style={{ width: 76, height: 76, borderRadius: 24, backgroundColor: 'rgba(245,158,11,0.10)', borderWidth: 2, borderColor: 'rgba(245,158,11,0.35)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Ionicons name="warning" size={38} color="#F59E0B" />
        </View>
        <Text style={{ fontSize: 21, fontWeight: '900', color: '#0F172A', textAlign: 'center', marginBottom: 6, letterSpacing: -0.3 }}>{t('early_flag_title')}</Text>
        {/* Distance highlight */}
        <View style={{ backgroundColor: '#FFF7ED', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(245,158,11,0.28)', alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: '#92650A', textAlign: 'center', lineHeight: 20 }}>
            {t('early_flag_body1')}{' '}
            <Text style={{ fontWeight: '900', fontSize: 15, color: '#D97706' }}>{earlyFlagModal.dist} km</Text>
            {' '}{t('early_flag_body2')}
          </Text>
        </View>
        <Text style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 20, marginBottom: 28 }}>
          {t('early_flag_body3')}{'\n'}
          <Text style={{ fontWeight: '700', color: '#475569' }}>{t('policy_violation_record')}</Text>{t('early_flag_body4')}
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: C.pink, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 56, elevation: 6, shadowColor: C.pink, shadowOpacity: 0.38, shadowRadius: 10 }}
          onPress={() => setEarlyFlagModal(null)}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 0.3 }}>{t('understood_btn')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ═══ TRIP SUMMARY ═══
  if (tripSummary) return (
    <ScreenIn style={{ flex: 1, backgroundColor: C.bgDark }}>

      {/* ── Hero: celebration + earnings ── */}
      <View style={{
        paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 16 : 52,
        paddingBottom: 32, paddingHorizontal: 24, alignItems: 'center', overflow: 'hidden',
      }}>
        <Celebration />
        <View style={{ position: 'absolute', width: 360, height: 360, borderRadius: 180, backgroundColor: 'rgba(0,200,83,0.05)', top: -100, left: -100 }} />
        <View style={{ position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,45,120,0.04)', bottom: -60, right: -60 }} />

        <Text style={{ fontSize: 54, marginBottom: 8 }}>🎉</Text>
        <Text style={{ fontSize: 11, fontWeight: '900', letterSpacing: 2.8, color: C.online, marginBottom: 6 }}>TRIP COMPLETE</Text>
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>{t('earning_this_trip')}</Text>
        <CountUp value={tripSummary.earned} prefix="₹" style={{ ...T.earnings, color: C.online, letterSpacing: -2.5, lineHeight: 58 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        {/* ── Earnings breakdown card ── */}
        <SlideIn style={{ marginBottom: 14 }}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: R.md, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>

            {/* Payment method badge */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              backgroundColor: tripSummary.payment_method === 'cash' ? 'rgba(0,200,83,0.13)' : tripSummary.payment_method === 'wallet' ? 'rgba(255,45,120,0.1)' : 'rgba(168,85,247,0.13)',
              borderRadius: R.full, paddingHorizontal: 20, paddingVertical: 8, marginBottom: 18, alignSelf: 'center',
              borderWidth: 1, borderColor: tripSummary.payment_method === 'cash' ? 'rgba(0,200,83,0.32)' : tripSummary.payment_method === 'wallet' ? 'rgba(255,45,120,0.28)' : 'rgba(168,85,247,0.32)',
            }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: tripSummary.payment_method === 'cash' ? C.online : tripSummary.payment_method === 'wallet' ? C.pink : '#A855F7' }}>
                {tripSummary.payment_method === 'cash' ? '💵 Cash Payment' : tripSummary.payment_method === 'wallet' ? '💰 Wallet Payment' : '💳 Online Payment'}
              </Text>
            </View>

            {/* Hourly badge */}
            {tripSummary.isHourly && (
              <View style={{ backgroundColor: 'rgba(0,200,83,0.09)', borderRadius: R.xs, padding: 11, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(0,200,83,0.2)', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: C.online }}>⏱️ Hourly Trip</Text>
                {tripSummary.earlyEnd && <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>Early end — 70% minimum protection applied</Text>}
                {tripSummary.extraKmInfo && <Text style={{ fontSize: 12, color: '#F59E0B', marginTop: 4 }}>📍 {tripSummary.extraKmInfo}</Text>}
              </View>
            )}

            {/* Breakdown rows */}
            {[
              { label: 'Total Fare', val: '₹' + tripSummary.fare, accent: false },
              { label: `Platform Fee (${tripSummary.isHourly ? '12' : '15'}%)`, val: tripSummary.fee, accent: false },
              { label: 'Aapki Kamai', val: tripSummary.earned, accent: true },
            ].map((row, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: i < 2 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                <Text style={{ fontSize: 13, color: row.accent ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.38)' }}>{row.label}</Text>
                <Text style={{ fontSize: row.accent ? 24 : 14, fontWeight: row.accent ? '900' : '600', color: row.accent ? C.online : 'rgba(255,255,255,0.55)', letterSpacing: row.accent ? -0.5 : 0 }}>{row.val}</Text>
              </View>
            ))}
          </View>
        </SlideIn>

        {/* ── Extension Request ── */}
        {extRequest && (
          <View style={{ backgroundColor: 'rgba(245,158,11,0.09)', borderRadius: R.md, padding: 18, marginBottom: 14, borderWidth: 2, borderColor: 'rgba(245,158,11,0.38)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 28, marginRight: 12 }}>🔄</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#F59E0B', fontWeight: '900', fontSize: 15 }}>Ride Extension Request!</Text>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }}>{extRequest.customer_name} — same customer</Text>
              </View>
              <View style={{ backgroundColor: C.pink, borderRadius: R.full, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', ...SHADOW.pink }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17 }}>{extRespSec}</Text>
              </View>
            </View>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: R.xs, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: 1.4, marginBottom: 5 }}>NAYA DESTINATION</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{extRequest.new_drop}</Text>
              <Text style={{ color: C.online, fontWeight: '900', fontSize: 22, marginTop: 8, letterSpacing: -0.5 }}>₹{Math.round(extRequest.estimated_fare)}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Bouncy style={{ flex: 1, backgroundColor: C.online, borderRadius: R.xs, padding: 15, alignItems: 'center', ...SHADOW.green }} onPress={acceptExtension} disabled={extAccLoading}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>{extAccLoading ? '⏳' : '✅  Accept'}</Text>
              </Bouncy>
              <Bouncy style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: R.xs, padding: 15, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' }} onPress={rejectExtension}>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontWeight: '700', fontSize: 15 }}>✗  Reject</Text>
              </Bouncy>
            </View>
          </View>
        )}

        {/* ── Rate Customer ── */}
        {!custRatingDone ? (
          <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: R.md, padding: 20, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff', marginBottom: 3 }}>{t('rate_customer_label')}</Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.32)', marginBottom: 18 }}>{t('rate_customer_sub')}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 18 }}>
              {[1,2,3,4,5].map(star => (
                <TouchableOpacity key={star} onPress={() => setCustRatingStars(star)} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 42, opacity: star <= custRatingStars ? 1 : 0.18 }}>⭐</Text>
                </TouchableOpacity>
              ))}
            </View>
            {custRatingStars > 0 ? (
              <Bouncy onPress={rateCustomer} style={{ backgroundColor: C.online, borderRadius: R.xs, padding: 15, alignItems: 'center', ...SHADOW.green }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>{tp('submit_rating_btn', { stars: String(custRatingStars) })}</Text>
              </Bouncy>
            ) : (
              <TouchableOpacity onPress={() => setCustRatingDone(true)} style={{ alignItems: 'center', paddingVertical: 8 }}>
                <Text style={{ color: 'rgba(255,255,255,0.28)', fontSize: 12, fontWeight: '600' }}>{t('skip_btn')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={{ backgroundColor: 'rgba(0,200,83,0.09)', borderRadius: R.sm, padding: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(0,200,83,0.22)' }}>
            <Text style={{ fontSize: 20 }}>✅</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.online }}>{t('rating_submitted')}</Text>
          </View>
        )}

        {/* ── Next ride CTA ── */}
        <Bouncy style={{ backgroundColor: C.online, borderRadius: R.sm, padding: 18, alignItems: 'center', ...SHADOW.green }} onPress={() => {
          setTripSummary(null); setExtRequest(null);
          // If a queued ride was activated while we were on the summary screen, load it now
          if (pendingActivatedRide) {
            setActiveRide(pendingActivatedRide);
            useDriverStore.setState({ activeRide: pendingActivatedRide });
            socketRef.current?.emit('joinRide', { rideId: pendingActivatedRide.id });
            setPendingActivatedRide(null);
          }
        }}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.2 }}>
            {pendingActivatedRide ? t('go_queued_ride_btn') : t('ready_next_ride_btn')}
          </Text>
        </Bouncy>

      </ScrollView>
    </ScreenIn>
  );

  // ═══ CHAT (driver) ═══
  if (showChat) return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => setShowChat(false)} style={{ padding: 4 }}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
        <Text style={s.greeting}>💬 {activeRide?.passenger_name || 'Customer'}</Text>
        <TouchableOpacity onPress={callCustomer} style={{ width: 36, alignItems: 'flex-end' }}><Ionicons name="call" size={20} color="#fff" /></TouchableOpacity>
      </View>
      <ScrollView style={{ flex: 1, padding: 14 }} contentContainerStyle={{ paddingBottom: 10 }}>
        {chatMsgs.length === 0 ? (
          <Text style={{ textAlign: 'center', color: '#999', marginTop: 20, fontSize: 13 }}>{t('no_messages')}</Text>
        ) : chatMsgs.map((m, i) => (
          <View key={i} style={[cs.bubble, m.sender === 'driver' ? cs.mine : cs.theirs]}>
            <Text style={{ color: m.sender === 'driver' ? '#fff' : '#0F172A', fontSize: 14 }}>{m.message}</Text>
          </View>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF' }} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 7, gap: 8 }}>
        {[t('quick_reply_1'), t('quick_reply_2'), t('quick_reply_3'), t('quick_reply_4'), t('quick_reply_5')].map(q => (
          <TouchableOpacity key={q} onPress={() => sendChat(q)} style={{ backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, color: '#334155', fontWeight: '600' }}>{q}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={cs.inputRow}>
        <TextInput style={cs.input} placeholder={t('chat_msg_placeholder')} value={chatInput} onChangeText={setChatInput} onSubmitEditing={() => sendChat()} />
        <TouchableOpacity style={cs.send} onPress={() => sendChat()}><Text style={{ color: '#fff', fontWeight: 'bold' }}>➤</Text></TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );

  if (showHourlyChat) return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => setShowHourlyChat(false)} style={{ padding: 4 }}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
        <Text style={s.greeting}>💬 Customer (Hourly)</Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView style={{ flex: 1, padding: 14 }} contentContainerStyle={{ paddingBottom: 10 }} keyboardShouldPersistTaps="handled">
        {hourlyChatMsgs.length === 0 ? (
          <Text style={{ textAlign: 'center', color: '#999', marginTop: 20, fontSize: 13 }}>{t('no_messages_send_first')}</Text>
        ) : hourlyChatMsgs.map((m, i) => (
          <View key={i} style={[cs.bubble, m.sender === 'driver' ? cs.mine : cs.theirs]}>
            <Text style={{ color: m.sender === 'driver' ? '#fff' : '#0F172A', fontSize: 14 }}>{m.message}</Text>
          </View>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF' }} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 7, gap: 8 }}>
        {[t('quick_reply_1'), t('quick_reply_2'), t('quick_reply_3h'), t('quick_reply_4'), t('quick_reply_5')].map(q => (
          <TouchableOpacity key={q} onPress={() => sendHourlyChat(q)} style={{ backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, color: '#334155', fontWeight: '600' }}>{q}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={cs.inputRow}>
        <TextInput style={cs.input} placeholder={t('chat_placeholder')} value={hourlyChatInput} onChangeText={setHourlyChatInput} onSubmitEditing={() => sendHourlyChat()} />
        <TouchableOpacity style={cs.send} onPress={() => sendHourlyChat()}><Text style={{ color: '#fff', fontWeight: 'bold' }}>➤</Text></TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );

  // ── In-app navigation full-screen overlay ──────────────────────────────
  const NAV_PT = Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 44;
  const _navPickup = activeRide ? (() => { const la = parseFloat(activeRide.pickup_lat), lo = parseFloat(activeRide.pickup_lng); return isNaN(la)||isNaN(lo) ? null : {lat:la,lng:lo}; })() : null;
  const _navDrop   = activeRide ? (() => { const la = parseFloat(activeRide.drop_lat),   lo = parseFloat(activeRide.drop_lng);   return isNaN(la)||isNaN(lo) ? null : {lat:la,lng:lo}; })() : null;
  const NavOverlay = inNavMode ? (
    <View style={{ position:'absolute', top:0, left:0, right:0, bottom:0, zIndex:9999 }}>
      <DriverLiveMap
        pickupCoords={_navPickup}
        dropCoords={_navDrop}
        driverLat={driverGps?.lat}
        driverLng={driverGps?.lng}
        customerLat={_navPickup?.lat ?? null}
        customerLng={_navPickup?.lng ?? null}
        vehicleType={driverInfo?.vehicle_type || 'auto'}
        rideStatus={activeRide?.status || null}
        showTraffic={activeRide?.status === 'started'}
        followDriver={true}
        navMode={true}
        chosenRoutePolyline={activeRide?.route_polyline || null}
        chosenRouteType={activeRide?.route_type || null}
        height={SCREEN_H}
      />

      {/* Back pill — top-left */}
      <TouchableOpacity
        onPress={() => setInNavMode(false)}
        activeOpacity={0.82}
        style={{
          position:'absolute', top:NAV_PT, left:14, zIndex:10001,
          flexDirection:'row', alignItems:'center', gap:6,
          backgroundColor:'rgba(8,14,24,0.85)', borderRadius:22,
          paddingHorizontal:14, paddingVertical:9,
          borderWidth:1, borderColor:'rgba(255,255,255,0.14)',
          elevation:8,
        }}>
        <Ionicons name="arrow-back" size={16} color="#fff" />
        <Text style={{ color:'#fff', fontWeight:'700', fontSize:13 }}>Sppero</Text>
      </TouchableOpacity>

      {/* Voice nav bar — slides in just below the back pill */}
      {navActive && (
        <View style={{ position:'absolute', top:NAV_PT+52, left:0, right:0, zIndex:10000 }}>
          <VoiceNavBar
            instruction={navInstruction}
            maneuver={navManeuver}
            nextDistM={navDist}
            phase={navPhase}
            muted={navMuted}
            onMute={() => setNavMuted(p => !p)}
            visible={true}
          />
        </View>
      )}

      {/* Customer message toast — shown right on the nav screen, auto-hides in 3s */}
      {chatToast && (
        <View style={{ position:'absolute', top: navActive ? NAV_PT+120 : NAV_PT+52, left:14, right:14, zIndex:10002 }}>
          <View style={{ backgroundColor:'rgba(37,99,235,0.96)', borderRadius:14, paddingHorizontal:14, paddingVertical:10, flexDirection:'row', alignItems:'center', gap:9, borderWidth:1, borderColor:'rgba(255,255,255,0.18)', elevation:10 }}>
            <Text style={{ fontSize:15 }}>💬</Text>
            <View style={{ flex:1 }}>
              <Text style={{ color:'rgba(255,255,255,0.7)', fontSize:9, fontWeight:'800', letterSpacing:0.5 }}>CUSTOMER</Text>
              <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }} numberOfLines={2}>{chatToast}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Bottom action strip */}
      <View style={{
        position:'absolute', bottom:0, left:0, right:0,
        backgroundColor:'rgba(8,14,24,0.94)',
        paddingTop:14, paddingBottom:32, paddingHorizontal:16,
        borderTopWidth:1, borderTopColor:'rgba(255,255,255,0.09)',
        gap:10,
      }}>
        {/* Pre-queue compact banner — shows at top of strip so driver can accept without leaving nav */}
        {preQueued && !preQueueAccepted && (
          <View style={{ backgroundColor: '#3B0764', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: '#7C3AED' }}>
            <Text style={{ fontSize: 15 }}>🏍️</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>{t('next_ride_arrived')}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }} numberOfLines={1}>{preQueued.pickup} · {preQueued.fare}</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                fetch(`${API}/api/rides/pre-decline`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ride_id: preQueued.rideId, phone }) })
                  .then(() => setPreQueued(null)).catch(() => setPreQueued(null));
              }}
              style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontWeight: '700', fontSize: 13 }}>✗</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                fetch(`${API}/api/rides/pre-accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ride_id: preQueued.rideId, phone }) })
                  .then(r => r.json())
                  .then(d => { if (d.success) setPreQueueAccepted(true); else setResult('❌ ' + (d.error || 'Accept failed')); })
                  .catch(() => setResult('❌ Network error'));
              }}
              style={{ backgroundColor: '#7C3AED', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>Queue ✓</Text>
            </TouchableOpacity>
          </View>
        )}
        {preQueued && preQueueAccepted && (
          <View style={{ backgroundColor: '#022C22', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#4ADE80' }}>
            <Text style={{ fontSize: 15 }}>✅</Text>
            <Text style={{ color: '#4ADE80', fontWeight: '900', fontSize: 12, flex: 1 }}>{t('next_ride_queued_sub')}</Text>
          </View>
        )}
        {/* ETA / distance info row */}
        {(distToPickup || tripRemainingEta) ? (
          <View style={{ flexDirection:'row', justifyContent:'center', gap:10 }}>
            {activeRide?.status !== 'started' && distToPickup ? (
              <View style={{ backgroundColor:'rgba(26,115,232,0.14)', borderRadius:10, paddingHorizontal:16, paddingVertical:8, borderWidth:1, borderColor:'rgba(26,115,232,0.35)' }}>
                <Text style={{ color:'#4285F4', fontWeight:'800', fontSize:15 }}>📍 {distToPickup}</Text>
              </View>
            ) : tripRemainingEta ? (
              <View style={{ backgroundColor:'rgba(26,115,232,0.14)', borderRadius:10, paddingHorizontal:16, paddingVertical:8, borderWidth:1, borderColor:'rgba(26,115,232,0.35)' }}>
                <Text style={{ color:'#4285F4', fontWeight:'800', fontSize:15 }}>🛣️ {tripRemainingEta}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Quick-reply chips — driver taps to message the customer without leaving nav */}
        {(activeRide?.status === 'matched' || activeRide?.status === 'arrived') && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:8, paddingVertical:2 }}>
            {[t('quick_action_1'), t('quick_action_2'), t('quick_action_3'), t('quick_action_4'), t('quick_action_5')].map((m) => (
              <TouchableOpacity
                key={m}
                activeOpacity={0.8}
                onPress={() => { sendChat(m); setChatToast(null); Vibration.vibrate(15); setResult('✅ Sent'); setTimeout(() => setResult(''), 1500); }}
                style={{ backgroundColor:'rgba(255,255,255,0.10)', borderRadius:18, paddingHorizontal:13, paddingVertical:8, borderWidth:1, borderColor:'rgba(255,255,255,0.18)' }}>
                <Text style={{ color:'#fff', fontSize:12, fontWeight:'700' }}>{m}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Navigation app options */}
        {(activeRide?.status === 'matched' || activeRide?.status === 'started') && (() => {
          const destLat = activeRide.status === 'started' ? activeRide.drop_lat : activeRide.pickup_lat;
          const destLng = activeRide.status === 'started' ? activeRide.drop_lng : activeRide.pickup_lng;
          const openGoogle = () => {
            if (!destLat || !destLng) return;
            Linking.openURL(`google.navigation:q=${destLat},${destLng}&mode=driving`)
              .catch(() => Linking.openURL(`https://maps.google.com/?daddr=${destLat},${destLng}`));
          };
          const openWaze = () => {
            if (!destLat || !destLng) return;
            Linking.openURL(`waze://?ll=${destLat},${destLng}&navigate=yes`)
              .catch(() => Linking.openURL(`https://waze.com/ul?ll=${destLat},${destLng}&navigate=yes`));
          };
          return (
            <View style={{ flexDirection:'row', gap:8 }}>
              <TouchableOpacity activeOpacity={0.82} onPress={openGoogle}
                style={{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, backgroundColor:'rgba(26,115,232,0.12)', borderRadius:14, paddingVertical:12, borderWidth:1.5, borderColor:'rgba(26,115,232,0.35)' }}>
                <Text style={{ fontSize:17 }}>🗺️</Text>
                <Text style={{ color:'#4285F4', fontWeight:'800', fontSize:13 }}>Google Maps</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.82} onPress={openWaze}
                style={{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, backgroundColor:'rgba(0,200,83,0.08)', borderRadius:14, paddingVertical:12, borderWidth:1.5, borderColor:'rgba(0,200,83,0.28)' }}>
                <Text style={{ fontSize:17 }}>🚗</Text>
                <Text style={{ color:'#00C853', fontWeight:'800', fontSize:13 }}>Waze</Text>
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* Primary action button */}
        {activeRide?.status === 'matched' && (
          <Bouncy style={s.tripBtn} onPress={() => { setInNavMode(false); markArrived(); }} disabled={loading}>
            <Text style={s.tripBtnTxt}>{loading ? '...' : t('pickup_arrived_btn')}</Text>
          </Bouncy>
        )}
        {activeRide?.status === 'started' && (
          <Bouncy style={[s.tripBtn, { backgroundColor:C.green, shadowColor:C.green }]} onPress={() => { setInNavMode(false); completeTrip(); }} disabled={loading}>
            <Text style={s.tripBtnTxt}>{loading ? '...' : t('trip_complete')}</Text>
          </Bouncy>
        )}
        {activeRide?.status === 'arrived' && (
          <View style={{ alignItems:'center' }}>
            <Text style={{ color:'rgba(255,255,255,0.7)', fontSize:13, fontWeight:'600' }}>{t('otp_go_to_app')}</Text>
            <TouchableOpacity onPress={() => setInNavMode(false)} style={{ marginTop:10, borderWidth:1.5, borderColor:C.pink, borderRadius:12, paddingHorizontal:20, paddingVertical:10 }}>
              <Text style={{ color:C.pink, fontWeight:'700' }}>{t('back_to_app_btn')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  ) : null;

  // ═══ HOME TAB — Uber style ═══
  if (activeTab === 'home') return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Full map background */}
      <View style={s.mapFit}>
        <DriverLiveMap
          pickupCoords={(() => {
            if (!activeRide) return null;
            const lat = parseFloat(activeRide.pickup_lat), lng = parseFloat(activeRide.pickup_lng);
            return isNaN(lat) || isNaN(lng) ? null : { lat, lng };
          })()}
          dropCoords={(() => {
            if (!activeRide) return null;
            const lat = parseFloat(activeRide.drop_lat), lng = parseFloat(activeRide.drop_lng);
            return isNaN(lat) || isNaN(lng) ? null : { lat, lng };
          })()}
          driverLat={driverGps?.lat}
          driverLng={driverGps?.lng}
          customerLat={activeRide ? parseFloat(activeRide.pickup_lat) || null : null}
          customerLng={activeRide ? parseFloat(activeRide.pickup_lng) || null : null}
          vehicleType={driverInfo?.vehicle_type || 'auto'}
          rideStatus={activeRide?.status || null}
          showTraffic={!!activeRide && activeRide.status === 'started'}
          followDriver={true}
          chosenRoutePolyline={activeRide?.route_polyline || null}
          chosenRouteType={activeRide?.route_type || null}
          height={260}
        />
        <MapOverlay hasRoute={!!activeRide} pickup={activeRide?.pickup} drop={activeRide?.drop_location} live={activeRide?.status === 'started'} />
      </View>
      {/* Voice Navigation Bar */}
      {navActive && (
        <View style={{ position: 'absolute', top: 266, left: 0, right: 0, zIndex: 100 }}>
          <VoiceNavBar
            instruction={navInstruction}
            maneuver={navManeuver}
            nextDistM={navDist}
            phase={navPhase}
            muted={navMuted}
            onMute={() => setNavMuted(p => !p)}
            visible={navActive}
          />
        </View>
      )}
      {/* Zone Alert received banner */}
      <ZoneAlertBanner
        alert={zoneAlert}
        onDismiss={() => setZoneAlert(null)}
      />
      {/* Zone Alert sender panel */}
      <ZoneAlertSender
        visible={showZoneAlertSender}
        sentCount={zoneAlertSentCount}
        onClose={() => setShowZoneAlertSender(false)}
        onSend={(alertType, message) => {
          if (socketRef.current?.connected && driverGps) {
            socketRef.current.emit('driverZoneAlert', {
              phone,
              lat: driverGps.lat,
              lng: driverGps.lng,
              alertType,
              message,
            });
          }
        }}
      />
      {/* Zone Alert FAB — visible only when online and no active ride */}
      {isOnline && !activeRide && !showZoneAlertSender && (
        <TouchableOpacity
          onPress={() => setShowZoneAlertSender(true)}
          activeOpacity={0.82}
          style={{
            position: 'absolute', bottom: 100, right: 16, zIndex: 200,
            width: 52, height: 52, borderRadius: 16,
            backgroundColor: '#0F172A',
            alignItems: 'center', justifyContent: 'center',
            elevation: 10, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12,
            borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)',
          }}>
          <Text style={{ fontSize: 22 }}>📢</Text>
        </TouchableOpacity>
      )}
      {/* Pre-queue offer — home tab non-nav mode only; NavOverlay handles nav mode internally */}
      {!inNavMode && preQueued && !preQueueAccepted && (
        <PreQueueCard
          preQueued={preQueued}
          phone={phone}
          onAccept={() => {
            fetch(`${API}/api/rides/pre-accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ride_id: preQueued.rideId, phone }) })
              .then(r => r.json())
              .then(d => { if (d.success) setPreQueueAccepted(true); else setResult('❌ ' + (d.error || 'Accept failed')); })
              .catch(() => setResult('❌ Network error'));
          }}
          onDecline={() => {
            fetch(`${API}/api/rides/pre-decline`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ride_id: preQueued.rideId, phone }) })
              .then(() => { setPreQueued(null); })
              .catch(() => setPreQueued(null));
          }}
        />
      )}
      {!inNavMode && preQueued && preQueueAccepted && (
        <View style={{ position: 'absolute', bottom: 90, left: 16, right: 16, zIndex: 999, backgroundColor: '#022C22', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#4ADE80', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 18 }}>✅</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#4ADE80', fontWeight: '900', fontSize: 13 }}>Next Ride Queued!</Text>
            <Text style={{ color: '#86EFAC', fontSize: 11, marginTop: 2 }}>{preQueued.pickup} · {preQueued.fare}</Text>
          </View>
        </View>
      )}
      {/* ── One-time subscription hint ── */}
      {showSubHint && !activeRide && !rideReq && !hourlyRideReq && (
        <Animated.View style={{
          position: 'absolute', bottom: Platform.OS === 'android' ? 88 : 72, left: 12, right: 12, zIndex: 400,
          transform: [{ translateY: subHintTY }, { translateY: subHintBobY }],
          opacity: subHintOpacity,
        }}>
          <View style={{
            backgroundColor: '#010F09', borderRadius: 22, borderWidth: 1.5, borderColor: '#22C55E',
            overflow: 'hidden', elevation: 24,
            shadowColor: '#22C55E', shadowOpacity: 0.45, shadowRadius: 22, shadowOffset: { width: 0, height: 4 },
          }}>
            {/* Shimmer sweep */}
            <Animated.View pointerEvents="none" style={{
              position: 'absolute', top: 0, bottom: 0, width: 80,
              backgroundColor: 'rgba(255,255,255,0.055)',
              transform: [{ translateX: subHintShimmer.interpolate({ inputRange: [0, 1], outputRange: [-80, 420] }) }],
              zIndex: 50,
            }} />

            <View style={{ padding: 16 }}>
              {/* Header row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <View style={{ backgroundColor: 'rgba(34,197,94,0.18)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(34,197,94,0.35)', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={{ fontSize: 11 }}>✨</Text>
                  <Text style={{ color: '#22C55E', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }}>SPECIAL OFFER</Text>
                </View>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={dismissSubHint} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
                  <Text style={{ color: '#4ADE80', fontSize: 20, fontWeight: '300', lineHeight: 22 }}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Headline */}
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: -0.3, marginBottom: 4 }}>
                {t('full_fare_tagline')}
              </Text>
              <Text style={{ color: '#6EE7B7', fontSize: 12, lineHeight: 18, marginBottom: 14 }}>
                {t('sub_promo_body')}
              </Text>

              {/* Divider */}
              <View style={{ height: 1, backgroundColor: 'rgba(34,197,94,0.15)', marginBottom: 14 }} />

              {/* Category tiles */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {([
                  { emoji: '🏍️', label: 'Bike Pack', detail: 'Bike + E-Bike' },
                  { emoji: '🛺', label: 'Auto Pack', detail: 'Auto + E-Auto' },
                  { emoji: '🚗', label: 'Car Pack',  detail: 'All Cars'      },
                ] as const).map((item, i) => (
                  <View key={i} style={{ flex: 1, backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(34,197,94,0.18)' }}>
                    <Text style={{ fontSize: 20, marginBottom: 3 }}>{item.emoji}</Text>
                    <Text style={{ color: '#A7F3D0', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>{item.label}</Text>
                    <View style={{ backgroundColor: '#022c22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4, borderWidth: 1, borderColor: '#22C55E' }}>
                      <Text style={{ color: '#22C55E', fontSize: 9, fontWeight: '900' }}>₹0 Commission</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Key savings facts */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                {[
                  { n: '0%', lbl: 'Commission' },
                  { n: '60', lbl: t('days_valid_label') },
                  { n: '15+', lbl: 'Ride packs' },
                ].map((f, i) => (
                  <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ color: '#22C55E', fontSize: 22, fontWeight: '900', lineHeight: 26 }}>{f.n}</Text>
                    <Text style={{ color: '#64748B', fontSize: 10, fontWeight: '700' }}>{f.lbl}</Text>
                  </View>
                ))}
              </View>

              {/* CTA */}
              <TouchableOpacity
                onPress={() => {
                  dismissSubHint();
                  setSubResult(''); setSubSelectedPlan(null);
                  loadDriverSub(phone, driverInfo?.vehicle_type);
                  setDrSubScreen('subscription');
                }}
                activeOpacity={0.82}
                style={{ backgroundColor: '#22C55E', borderRadius: 14, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              >
                <Text style={{ color: '#022c22', fontSize: 15, fontWeight: '900' }}>{t('subscribe_btn')}</Text>
                <Text style={{ color: '#022c22', fontSize: 16, fontWeight: '700' }}>→</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}

      {/* Top bar */}
      <View style={s.topBar}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            {isOnline && (
              <PulseView>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.online, shadowColor: C.online, shadowOpacity: 0.8, shadowRadius: 4 }} />
              </PulseView>
            )}
            <Text style={s.greeting}>{isOnline ? 'Online' : 'Offline'}</Text>
            <View style={{ backgroundColor: isOnline ? 'rgba(0,200,83,0.18)' : 'rgba(148,163,184,0.18)', borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: isOnline ? 'rgba(0,200,83,0.40)' : 'rgba(148,163,184,0.30)' }}>
              <Text style={{ color: isOnline ? C.online : C.textDim, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 }}>{isOnline ? 'LIVE' : 'OFF'}</Text>
            </View>
          </View>
          <Text style={s.subTxt}>{driverInfo?.name || phone} · {driverInfo?.vehicle_no || ''}</Text>
          {driverLevel && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
              <Text style={{ fontSize: 12 }}>{driverLevel.levelEmoji}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.80)', fontSize: 10, fontWeight: '700' }}>{driverLevel.levelName}</Text>
              {driverLevel.nextLevel && (
                <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9 }}>· {driverLevel.progress}% to {driverLevel.nextLevelName}</Text>
              )}
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={() => { setNotifUnread(0); fetchDriverNotifs(phone); setShowNotifCenter(true); }}
          style={{ padding: 8, marginRight: 10, position: 'relative' }}
          activeOpacity={0.7}
        >
          <Ionicons name={notifUnread > 0 ? 'notifications' : 'notifications-outline'} size={22} color="#fff" />
          {notifUnread > 0 && (
            <View style={{ position: 'absolute', top: 5, right: 5, width: 9, height: 9, borderRadius: 5, backgroundColor: C.pink, borderWidth: 1.5, borderColor: '#1E1B4B' }} />
          )}
        </TouchableOpacity>
        <Switch value={isOnline} onValueChange={toggleOnline} trackColor={{ true: C.online, false: C.glassBorder }} thumbColor="#fff" />
      </View>

      {/* ── Driver Notification Center Modal ─────────────────────────────── */}
      <Modal visible={showNotifCenter} animationType="slide" transparent={false} onRequestClose={() => setShowNotifCenter(false)}>
        <View style={{ flex: 1, backgroundColor: '#0F172A' }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14,
            paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 14 : 56,
            backgroundColor: '#1E1B4B', borderBottomWidth: 1, borderBottomColor: '#312E81' }}>
            <TouchableOpacity onPress={() => setShowNotifCenter(false)} style={{ marginRight: 12 }}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Ionicons name="notifications" size={20} color={C.pink} style={{ marginRight: 8 }} />
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', flex: 1 }}>Notifications</Text>
          </View>
          {/* List */}
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {driverNotifs.length === 0 ? (
              <View style={{ alignItems: 'center', marginTop: 60 }}>
                <Ionicons name="notifications-off-outline" size={48} color="#334155" />
                <Text style={{ color: '#475569', fontSize: 14, marginTop: 12, fontWeight: '600' }}>{t('no_notifications_yet')}</Text>
              </View>
            ) : (
              driverNotifs.map((n: any, i: number) => (
                <View key={i} style={{ backgroundColor: '#1E293B', borderRadius: 14, padding: 14, marginBottom: 10,
                  borderWidth: 1, borderColor: n.type === 'broadcast' ? '#4F46E5' : '#334155' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Ionicons name={n.type === 'broadcast' ? 'megaphone' : 'notifications'} size={16}
                      color={n.type === 'broadcast' ? '#818CF8' : C.pink} />
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14, flex: 1 }}>{n.title}</Text>
                  </View>
                  <Text style={{ color: '#94A3B8', fontSize: 13, lineHeight: 19 }}>{n.message || n.body}</Text>
                  <Text style={{ color: '#475569', fontSize: 11, marginTop: 6 }}>
                    {new Date(n.created_at).toLocaleString('hi-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
      {/* Content */}
      <View style={{ flex: 1, backgroundColor: '#F1F5F9', borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -24, paddingTop: 16, paddingHorizontal: 16 }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ paddingBottom: 130 }}>
          <View style={s.statsRow}>
            {/* Earnings tile — green accent, hero number */}
            <View style={[s.statCard, { borderColor: C.greenBorder, backgroundColor: C.greenGlass }]}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.online + '22', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.greenBorder }}>
                <Text style={{ fontSize: 17 }}>💰</Text>
              </View>
              <CountUp value={earnings} style={[s.statValue, { color: C.online, fontSize: 20 }]} />
              <Text style={s.statLabel}>Aaj ki kamai</Text>
            </View>
            {/* Rides tile */}
            <View style={s.statCard}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.plumGlass, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.plumBorder }}>
                <Text style={{ fontSize: 17 }}>🚗</Text>
              </View>
              <Text style={[s.statValue, { fontSize: 20 }]}>{rides}</Text>
              <Text style={s.statLabel}>Rides</Text>
            </View>
            {/* Rating tile */}
            <View style={s.statCard}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(245,158,11,0.10)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(245,158,11,0.28)' }}>
                <Text style={{ fontSize: 17 }}>⭐</Text>
              </View>
              <Text style={[s.statValue, { fontSize: 20, color: '#92400E' }]}>{driverInfo?.rating || '4.8'}</Text>
              <Text style={s.statLabel}>Rating</Text>
            </View>
          </View>

          {/* ── Earnings Optimizer ── */}
          {(() => {
            const goalPct = Math.min((earnings / dailyGoal) * 100, 100);
            const left    = Math.max(dailyGoal - earnings, 0);
            const done    = earnings >= dailyGoal;
            const lvlLeft = driverLevel?.nextLevel
              ? driverLevel.nextTarget - driverLevel.completed_rides
              : null;
            return (
              <View style={{
                backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 12,
                elevation: 5, borderWidth: 1.5,
                borderColor: done ? '#BBF7D0' : '#E2E8F0',
                shadowColor: done ? C.green : C.pink, shadowOpacity: 0.12, shadowRadius: 12,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 22 }}>{done ? '🏆' : '🎯'}</Text>
                    <View>
                      <Text style={{ fontSize: 15, fontWeight: '900', color: '#0F172A' }}>
                        {done ? 'Goal Poora!' : 'Daily Goal'}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748B' }}>
                        ₹{earnings} / ₹{dailyGoal}
                      </Text>
                    </View>
                  </View>
                  {!done && (
                    <Text style={{ fontSize: 13, fontWeight: '800', color: C.pink }}>
                      ₹{left} bacha
                    </Text>
                  )}
                </View>
                {/* Progress bar */}
                <View style={{ backgroundColor: '#F1F5F9', borderRadius: 8, height: 10, overflow: 'hidden', marginBottom: 10 }}>
                  <View style={{
                    height: '100%', borderRadius: 8,
                    width: `${goalPct}%`,
                    backgroundColor: done ? C.green : goalPct > 70 ? '#F59E0B' : C.pink,
                  }} />
                </View>
                {/* Level progress */}
                {driverLevel?.nextLevel && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(124,58,237,0.07)', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: 'rgba(124,58,237,0.2)' }}>
                    <Text style={{ fontSize: 12, color: '#7C3AED', fontWeight: '700' }}>
                      {driverLevel.levelEmoji} {lvlLeft} aur rides → {driverLevel.nextLevelEmoji} {driverLevel.nextLevelName}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#7C3AED' }}>{driverLevel.progress}%</Text>
                  </View>
                )}
                {/* Auto-accept toggle */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>⚡ Auto-Accept High Surge</Text>
                    <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{t('surge_auto_accept')}</Text>
                  </View>
                  <Switch
                    value={autoAcceptSurge}
                    onValueChange={setAutoAcceptSurge}
                    trackColor={{ true: '#F59E0B', false: '#e0e0e0' }}
                    thumbColor={autoAcceptSurge ? '#fff' : '#fff'}
                  />
                </View>
              </View>
            );
          })()}

          {/* Hot Zones — always visible when online */}
          {isOnline && !activeRide && !rideReq && !activeHourlyRide && !hourlyRideReq && (
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 14, elevation: 4, borderWidth: 1.5, borderColor: '#E2E8F0', shadowColor: C.pink, shadowOpacity: 0.08, shadowRadius: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(233,30,99,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 18 }}>🔥</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: '#0F172A' }}>Hot Zones</Text>
                    <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>{t('where_demand_is')}</Text>
                  </View>
                </View>
                <View style={{ backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(233,30,99,0.2)' }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: C.pink }}>{zonesLoading ? '...' : 'LIVE'}</Text>
                </View>
              </View>
              {demandZones.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 18 }}>
                  <Text style={{ fontSize: 28, marginBottom: 8 }}>🗺️</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{t('no_hotzone_yet')}</Text>
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 4, textAlign: 'center' }}>{t('no_hotzone_sub')}</Text>
                </View>
              ) : demandZones.slice(0, 5).map((zone, i) => {
                const heatConfig = zone.heat === 'high'
                  ? { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', dot: '#EF4444', label: 'High', labelBg: '#EF4444' }
                  : zone.heat === 'medium'
                  ? { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.35)', dot: '#F59E0B', label: 'Medium', labelBg: '#F59E0B' }
                  : { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.3)', dot: C.green, label: 'Low', labelBg: C.green };
                const vehicleEmoji = zone.top_vehicle === 'bike' ? '🏍️' : zone.top_vehicle === 'auto' ? '🛺' : zone.top_vehicle === 'car' ? '🚕' : zone.top_vehicle === 'eriksha' ? '🛵' : '🚗';
                const nearLabel = zone.dist_km < 0.5 ? 'Aapke paas' : `${zone.dist_km} km door`;
                return (
                  <TouchableOpacity
                    key={i}
                    activeOpacity={0.8}
                    onPress={() => openZoneNavigation(zone)}
                    style={{ backgroundColor: heatConfig.bg, borderRadius: 12, padding: 12, marginBottom: i < 4 ? 8 : 0, borderWidth: 1, borderColor: heatConfig.border, flexDirection: 'row', alignItems: 'center' }}
                  >
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: heatConfig.dot, marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '900', color: '#0F172A' }} numberOfLines={1}>
                        {vehicleEmoji} {zone.area_name || nearLabel}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                        {zone.area_name ? `${nearLabel} · ` : ''}
                        {zone.ride_count} ride{zone.ride_count > 1 ? 's' : ''}
                        {zone.avg_fare > 0 ? ` · avg ₹${zone.avg_fare}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <View style={{ backgroundColor: heatConfig.labelBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>{heatConfig.label}</Text>
                      </View>
                      <Text style={{ fontSize: 9, color: '#94A3B8', fontWeight: '700' }}>🧭 Navigate</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity onPress={fetchDemandZones} style={{ marginTop: 10, alignItems: 'center', paddingVertical: 6 }}>
                <Text style={{ fontSize: 11, color: '#94A3B8', fontWeight: '600' }}>🔄 Refresh zones</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Demand Prediction Card ── */}
          {isOnline && !activeRide && !rideReq && !activeHourlyRide && demandPrediction && (
            <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 12, elevation: 4, shadowColor: '#6366F1', shadowOpacity: 0.12, shadowRadius: 12, borderWidth: 1, borderColor: 'rgba(99,102,241,0.15)' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 18, marginRight: 8 }}>📊</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#1E1B4B' }}>Demand Forecast</Text>
                  <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>{t('demand_prediction_today')}</Text>
                </View>
                {demandPrediction.mins_to_next_peak != null && (
                  <View style={{ backgroundColor: '#EEF2FF', borderRadius: 10, padding: 8, alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, color: '#6366F1', fontWeight: '800' }}>NEXT PEAK</Text>
                    <Text style={{ fontSize: 13, fontWeight: '900', color: '#4338CA' }}>{demandPrediction.next_peak_label}</Text>
                    <Text style={{ fontSize: 9, color: '#6366F1' }}>
                      {demandPrediction.mins_to_next_peak < 60
                        ? tp('in_n_min', { n: String(demandPrediction.mins_to_next_peak) })
                        : tp('in_n_hr', { n: String(Math.round(demandPrediction.mins_to_next_peak / 60)) })}
                    </Text>
                  </View>
                )}
              </View>

              {/* Hourly bar chart — 6am to 11pm */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 50, gap: 2 }}>
                {(demandPrediction.hourly || []).filter((_: any, i: number) => i >= 6 && i <= 22).map((h: any, idx: number) => {
                  const hour = h.hour;
                  const isPeak = (demandPrediction.peak_hours || []).includes(hour);
                  const isCurrent = hour === demandPrediction.current_hour;
                  const barH = Math.max(4, Math.round((h.intensity / 100) * 46));
                  return (
                    <View key={hour} style={{ flex: 1, alignItems: 'center' }}>
                      <View style={{
                        width: '80%', height: barH, borderRadius: 3,
                        backgroundColor: isCurrent ? '#F59E0B' : isPeak ? '#6366F1' : 'rgba(99,102,241,0.2)',
                      }} />
                      {(idx % 4 === 0) && (
                        <Text style={{ fontSize: 7, color: '#9CA3AF', marginTop: 2 }}>
                          {hour === 0 ? '12A' : hour < 12 ? `${hour}A` : hour === 12 ? '12P' : `${hour - 12}P`}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#6366F1' }} />
                  <Text style={{ fontSize: 9, color: '#6B7280' }}>Peak hours</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#F59E0B' }} />
                  <Text style={{ fontSize: 9, color: '#6B7280' }}>Abhi</Text>
                </View>
              </View>
            </View>
          )}

          {/* Sppero Buddy Recruit Banner */}
          {!activeRide && !rideReq && !activeHourlyRide && (
            <TouchableOpacity activeOpacity={0.92}
              onPress={() => { const msg = tp('referral_share_msg', { phone: driverInfo?.phone || '' }); Share.share({ message: msg }); }}
              style={{ borderRadius: 20, marginBottom: 12, overflow: 'hidden', elevation: 8, shadowColor: C.pink, shadowOpacity: 0.3, shadowRadius: 14 }}>
              <View style={{ backgroundColor: C.pink, padding: 16, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 8 }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }}>🚗 DRIVER REFERRAL</Text>
                  </View>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', opacity: 0.9 }}>{t('referral_banner_title')}</Text>
                  <Text style={{ color: '#FFD700', fontSize: 24, fontWeight: '900', lineHeight: 30, marginTop: 2 }}>{t('referral_banner_amt')}</Text>
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start', marginTop: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>⏳ OFFER COMING SOON</Text>
                  </View>
                  <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 4, lineHeight: 16 }}>{t('referral_banner_sub')}</Text>
                </View>
                <View style={{ alignItems: 'center', marginLeft: 12 }}>
                  <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#FFD700', marginBottom: 8 }}>
                    <Text style={{ fontSize: 28 }}>🚗</Text>
                  </View>
                  <View style={{ backgroundColor: '#FFD700', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ color: '#111', fontSize: 11, fontWeight: '900' }}>Invite →</Text>
                  </View>
                </View>
              </View>
              <View style={{ backgroundColor: 'rgba(0,0,0,0.2)', paddingVertical: 7, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFD700' }} />
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700' }}>{t('referral_banner_footer')}</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Pending Commission Info Banner */}
          {commissionData.pending_commission > 0 && !activeRide && (
            <TouchableOpacity onPress={() => { setActiveTab('earnings'); setWalletEarningsTab('commission'); }}
              style={{ backgroundColor: 'rgba(230,81,0,0.12)', borderRadius: 12, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(230,81,0,0.35)' }}>
              <Text style={{ fontSize: 20 }}>💰</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', fontSize: 13, color: '#FB923C' }}>Commission Due: ₹{commissionData.pending_commission.toFixed(0)}</Text>
                <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{t('cash_fee_pending_hint')}</Text>
              </View>
              <Text style={{ color: '#FB923C', fontWeight: '700', fontSize: 12 }}>Pay →</Text>
            </TouchableOpacity>
          )}

          {/* Surge Active Banner */}
          {surgeMultiplier > 1.0 && !activeRide && (
            <View style={{ backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 12, padding: 10, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)' }}>
              <Text style={{ fontSize: 20 }}>⚡</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', fontSize: 13, color: '#F59E0B' }}>{tp('surge_active_title', { mult: String(surgeMultiplier) })}</Text>
                <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{tp('surge_active_hint', { mult: String(surgeMultiplier) })}</Text>
              </View>
            </View>
          )}

          {/* Admin Notification Banner */}
          {adminNotif && adminNotif.created_at !== adminNotifDismissed && (
            <View style={{ borderRadius: 14, marginBottom: 10, backgroundColor: 'rgba(233,30,99,0.08)', borderWidth: 1.5, borderColor: 'rgba(233,30,99,0.3)', padding: 12, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 22, marginRight: 10 }}>📩</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', fontSize: 12, color: C.pink, marginBottom: 2 }}>Sppero Admin</Text>
                <Text style={{ fontSize: 12, color: '#64748B' }}>{adminNotif.body || adminNotif.title}</Text>
              </View>
              <TouchableOpacity onPress={() => setAdminNotifDismissed(adminNotif.created_at)} style={{ padding: 6 }}>
                <Text style={{ fontSize: 16, color: '#aaa' }}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Driver-targeted marketing banners */}
          {driverOffers.filter(o => !offerDismissed.has(o.id)).map((offer: any) => (
            <View key={offer.id} style={{ borderRadius: 14, marginBottom: 10, backgroundColor: offer.type === 'incentive' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', borderWidth: 1.5, borderColor: offer.type === 'incentive' ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.4)', overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
                <Text style={{ fontSize: 22, marginRight: 10 }}>{offer.type === 'incentive' ? '💰' : '📢'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', fontSize: 13, color: '#0F172A' }}>{offer.title}</Text>
                  {offer.body ? <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{offer.body}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => setOfferDismissed(s => new Set([...s, offer.id]))} style={{ padding: 6 }}>
                  <Text style={{ fontSize: 16, color: '#aaa' }}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}


          {false && activeRide && (
            <View style={s.tripCard}>
              <TripStatusBar status={activeRide.status} />
              <View style={s.tripBadge}>
                <Text style={s.tripBadgeTxt}>
                  {activeRide.status === 'matched' && '🚗 Pickup ki taraf jao'}
                  {activeRide.status === 'arrived' && '📍 Pickup pe pahunche'}
                  {activeRide.status === 'started' && '🛣️ Trip chal rahi hai'}
                </Text>
              </View>
              <View style={s.tripCustomer}>
                <View style={s.tripAvatar}><Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>{activeRide.passenger_name?.[0] || 'P'}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.tripCustName}>{activeRide.passenger_name || 'Passenger'}</Text>
                  <Text style={s.tripCustPhone}>📞 {activeRide.passenger_phone_masked || '**********'}</Text>
                </View>
                <Text style={s.tripFare}>₹{Math.max(0, Math.round(parseFloat(String(activeRide.fare||'0')) - parseFloat(String(activeRide.discount||'0'))))}</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <TouchableOpacity style={s.chatCallBtn} onPress={() => { setUnreadChat(0); setShowChat(true); }}>
                  <View>
                    <Ionicons name="chatbubble" size={18} color="#22C55E" />
                    {unreadChat > 0 && <View style={s.chatBadge}><Text style={{ color: '#fff', fontSize: 9, fontWeight: 'bold' }}>{unreadChat}</Text></View>}
                  </View>
                  <Text style={{ fontSize: 12, color: '#0F172A', fontWeight: '600', marginLeft: 6 }}>Chat</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.chatCallBtn} onPress={callCustomer}><Ionicons name="call" size={16} color="#22C55E" /><Text style={{ fontSize: 12, color: '#0F172A', fontWeight: '600', marginLeft: 6 }}>Call</Text></TouchableOpacity>
              </View>
              {chatToast && (
                <TouchableOpacity style={{ backgroundColor: '#1a1a2e', borderRadius: 12, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(233,30,99,0.5)', elevation: 6 }} onPress={() => { setChatToast(null); setUnreadChat(0); setShowChat(true); }}>
                  <Ionicons name="chatbubble" size={16} color={C.pink} />
                  <Text style={{ color: '#fff', fontSize: 13, flex: 1, fontWeight: '600' }} numberOfLines={1}>{chatToast}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>Tap to reply</Text>
                </TouchableOpacity>
              )}
              {!chatToast && unreadChat > 0 && (
                <TouchableOpacity style={{ backgroundColor: C.pink, borderRadius: 10, padding: 10, marginBottom: 10, alignItems: 'center' }} onPress={() => { setUnreadChat(0); setShowChat(true); }}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>💬 Customer ke {unreadChat} message — tap to read</Text>
                </TouchableOpacity>
              )}

              <View style={s.tripRoute}>
                <Text style={s.tripFrom}>📍 {activeRide.pickup}</Text>
                <Text style={s.tripArrow}>↓</Text>
                <Text style={s.tripTo}>🎯 {activeRide.drop_location}</Text>
              </View>

              {eta ? <View style={{ backgroundColor: 'rgba(34,197,94,0.12)', borderRadius: 10, padding: 10, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)' }}><Text style={{ color: '#22C55E', fontWeight: '700', fontSize: 13 }}>🕐 {eta}</Text></View> : null}
              {distToPickup && (activeRide.status === 'matched' || activeRide.status === 'arrived') && (
                <View style={{ backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: 10, padding: 10, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(233,30,99,0.25)', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                  <Text style={{ color: C.pink, fontWeight: '700', fontSize: 14 }}>📍 {distToPickup}</Text>
                </View>
              )}
              {tripRemainingEta && activeRide.status === 'started' && (
                <View style={{ backgroundColor: 'rgba(255,99,24,0.12)', borderRadius: 10, padding: 10, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,99,24,0.3)', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                  <Text style={{ color: '#F5C518', fontWeight: '700', fontSize: 14 }}>🛣️ {tripRemainingEta}</Text>
                </View>
              )}

              {(activeRide.status === 'matched' || activeRide.status === 'arrived') && (
                <TouchableOpacity style={[s.navBtn, { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6 }]} onPress={() => setInNavMode(true)}>
                  <Ionicons name="navigate" size={15} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Pickup Navigate Karo</Text>
                </TouchableOpacity>
              )}
              {activeRide.status === 'started' && (
                <TouchableOpacity style={[s.navBtn, { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6 }]} onPress={() => setInNavMode(true)}>
                  <Ionicons name="navigate" size={15} color="#8ae961" />
                  <Text style={{ color: '#8ae961', fontWeight: '600' }}>Drop Navigate Karo</Text>
                </TouchableOpacity>
              )}

              {activeRide.status === 'matched' && (
                <Bouncy style={s.tripBtn} onPress={markArrived} disabled={loading}><Text style={s.tripBtnTxt}>{loading ? '...' : t('pickup_arrived_btn')}</Text></Bouncy>
              )}

              {activeRide.status === 'arrived' && (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                  <Text style={{ fontSize: 13, color: '#64748B', marginBottom: 10, textAlign: 'center', fontWeight: '600' }}>{t('ask_passenger_otp')}</Text>
                  <TextInput
                    style={{ borderWidth: 2.5, borderColor: otpInput.length === 4 ? C.green : '#E2E8F0', borderRadius: 14, padding: 16, fontSize: 32, textAlign: 'center', letterSpacing: 12, marginBottom: 14, fontWeight: '900', backgroundColor: '#F8FAFC', color: '#0F172A' }}
                    keyboardType="number-pad"
                    maxLength={4}
                    value={otpInput}
                    onChangeText={setOtpInput}
                    placeholder="○ ○ ○ ○"
                    placeholderTextColor="#D4A520"
                    autoFocus
                  />
                  <Bouncy style={s.tripBtn} onPress={startTrip} disabled={loading || otpInput.length < 4}><Text style={s.tripBtnTxt}>{loading ? '...' : t('trip_verify_start')}</Text></Bouncy>
                </KeyboardAvoidingView>
              )}

              {activeRide.status === 'started' && (
                <View>
                  <Bouncy style={[s.tripBtn, { backgroundColor: C.green, shadowColor: C.green }]} onPress={completeTrip} disabled={loading}>
                    <Text style={s.tripBtnTxt}>{loading ? '...' : t('trip_complete')}</Text>
                  </Bouncy>
                </View>
              )}
              <Bouncy style={s.cancelBtn} onPress={() => setShowDriverCancelModal(true)} disabled={loading}>
                <Text style={s.cancelTxt}>✕ Cancel Trip</Text>
              </Bouncy>
            </View>
          )}

          {/* ─── FULL-SCREEN RIDE REQUEST MODAL (moved to Live tab) ─── */}
          <Modal visible={false} animationType="slide" transparent={false} statusBarTranslucent>
            <View style={{ flex: 1, backgroundColor: '#F5C518' }}>
              {/* Orange header */}
              <View style={{ paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight||28)+16 : 56, paddingHorizontal: 20, paddingBottom: 28, alignItems: 'center' }}>
                {rideReq?.is_favourite_request && (
                  <View style={{ backgroundColor: '#FBBF24', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 6, marginBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: '#1A1A2E', fontSize: 12, fontWeight: '900', letterSpacing: 1 }}>⭐ AAPKA REGULAR CUSTOMER</Text>
                  </View>
                )}
                <Text style={{ color: 'rgba(26,18,0,0.8)', fontSize: 11, fontWeight: '900', letterSpacing: 2.5, marginBottom: 8 }}>
                  {rideReq?.is_favourite_request ? '⭐ SEEDHI RIDE REQUEST' : '🔔 NAYI RIDE AAYI!'}
                </Text>
                <Text style={{ fontSize: 72, marginBottom: 4 }}>
                  {rideReq?.ride_type === 'car' ? '🚕' : rideReq?.ride_type === 'bike' ? '🏍️' : rideReq?.ride_type === 'eriksha' ? '🛵' : rideReq?.ride_type === 'green_bike' ? '⚡' : rideReq?.ride_type === 'electric_auto' ? '🌿' : '🛺'}
                </Text>
                <Text style={{ color: '#1A1200', fontSize: 26, fontWeight: '900', letterSpacing: 0.5 }}>
                  {rideReq?.passenger_name || 'Passenger'}
                </Text>
                {surgeMultiplier > 1.0 && (
                  <View style={{ backgroundColor: '#FBBF24', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 5, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ color: '#1A1A2E', fontWeight: '900', fontSize: 14 }}>⚡ {surgeMultiplier}x SURGE</Text>
                  </View>
                )}
              </View>

              {/* White bottom sheet */}
              <View style={{ flex: 1, backgroundColor: '#F0F4FF', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 18, paddingTop: 22, paddingBottom: 16 }}>

                {/* Scheduled ride banner — shown only for scheduled rides */}
                {rideReq?.isScheduled && (
                  <View style={{
                    backgroundColor: '#FFFBEB', borderRadius: 14, padding: 12,
                    marginBottom: 12, borderWidth: 1.5, borderColor: '#F59E0B',
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                  }}>
                    <Text style={{ fontSize: 22 }}>📅</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: '#92400E' }}>SCHEDULED RIDE</Text>
                      {rideReq.scheduledAt && (
                        <Text style={{ fontSize: 12, color: '#D97706', fontWeight: '700', marginTop: 2 }}>
                          Pickup: {new Date(rideReq.scheduledAt).toLocaleString('en-IN', {
                            weekday: 'short', day: 'numeric', month: 'short',
                            hour: '2-digit', minute: '2-digit', hour12: true,
                            timeZone: 'Asia/Kolkata',
                          })}
                        </Text>
                      )}
                      <Text style={{ fontSize: 10, color: '#B45309', marginTop: 2 }}>
                        Accept now — customer is counting on you!
                      </Text>
                    </View>
                  </View>
                )}

                {/* Big fare card */}
                <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 14, alignItems: 'center', elevation: 4, shadowColor: '#22C55E', shadowOpacity: 0.18, shadowRadius: 10 }}>
                  <Text style={{ color: '#94A3B8', fontSize: 11, marginBottom: 4, fontWeight: '700', letterSpacing: 1.5 }}>AAPKI KAMAI</Text>
                  <Text style={{ color: '#22C55E', fontSize: 54, fontWeight: '900', lineHeight: 60 }}>₹{driverSub?.active ? Math.round(rideReq?.fare || 0) : Math.round((rideReq?.fare || 0) * 0.88)}</Text>
                  {driverSub?.active
                    ? <Text style={{ color: '#22C55E', fontSize: 12, fontWeight: '700' }}>✅ Subscribed · ₹0 Commission</Text>
                    : <Text style={{ color: '#64748B', fontSize: 12 }}>Total: ₹{rideReq?.fare} · 12% commission</Text>}
                </View>

                {/* Distance badges */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                  {driverGps && rideReq?.pickup_lat && (
                    <View style={{ flex: 1, backgroundColor: '#EFF6FF', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#BFDBFE' }}>
                      <Text style={{ color: '#2563EB', fontSize: 11, fontWeight: '800' }}>{t('aap_se_pickup')}</Text>
                      <Text style={{ color: '#1D4ED8', fontSize: 24, fontWeight: '900', marginTop: 3 }}>
                        {haversineKm(driverGps.lat, driverGps.lng, rideReq.pickup_lat, rideReq.pickup_lng).toFixed(1)} km
                      </Text>
                    </View>
                  )}
                  {rideReq?.distance && (
                    <View style={{ flex: 1, backgroundColor: '#F0FDF4', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#BBF7D0' }}>
                      <Text style={{ color: C.green, fontSize: 11, fontWeight: '800' }}>🛣️ Trip Distance</Text>
                      <Text style={{ color: '#15803D', fontSize: 24, fontWeight: '900', marginTop: 3 }}>{rideReq.distance} km</Text>
                    </View>
                  )}
                </View>

                {/* Route card */}
                <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB', elevation: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <View style={{ alignItems: 'center', marginRight: 12, paddingTop: 3 }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#22C55E', borderWidth: 2, borderColor: '#86EFAC' }} />
                      <View style={{ width: 2, height: 30, backgroundColor: '#D1D5DB', marginVertical: 2 }} />
                      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: '#F5C518' }} />
                    </View>
                    <View style={{ flex: 1, gap: 14 }}>
                      <View>
                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '700', letterSpacing: 0.8 }}>PICKUP</Text>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 2 }} numberOfLines={2}>{rideReq?.pickup}</Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '700', letterSpacing: 0.8 }}>DROP</Text>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 2 }} numberOfLines={2}>{rideReq?.drop_location}</Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Countdown */}
                {rideReq && <CountdownBar seconds={rideReq.seconds_to_accept || 30} onTimeout={rejectRide} />}

                {/* Accept / Reject buttons */}
                <View style={{ flexDirection: 'row', gap: 14, marginTop: 14 }}>
                  <TouchableOpacity style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB', elevation: 2 }} onPress={rejectRide}>
                    <Text style={{ fontSize: 22 }}>✕</Text>
                    <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 13, marginTop: 2 }}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flex: 2, backgroundColor: '#22C55E', borderRadius: 16, padding: 18, alignItems: 'center', elevation: 6, shadowColor: '#22C55E', shadowOpacity: 0.45, shadowRadius: 12 }} onPress={acceptRide} disabled={loading}>
                    <Text style={{ fontSize: 22 }}>✓</Text>
                    <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15, marginTop: 2 }}>
                      {loading ? t('live_accept_loading') : t('live_accept')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* ─── HOURLY RIDE REQUEST (moved to Live tab) ─── */}
          {false && hourlyRideReq && !activeRide && !activeHourlyRide && (
            <SlideIn>
              <View style={[s.rideCard, { borderLeftWidth: 4, borderLeftColor: C.pink }]}>
                <View style={s.rideHeader}>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <View style={{ backgroundColor: C.pink, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>⏱️ HOURLY</Text></View>
                      <Text style={s.rideTitle}>{hourlyRideReq.package_hours >= 24 ? `${hourlyRideReq.package_hours/24} Day${hourlyRideReq.package_hours > 24?'s':''}` : hourlyRideReq.package_hours === 8 ? 'Full Day (8h)' : `${hourlyRideReq.package_hours} Hours`}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: '#64748B' }}>{hourlyRideReq.km_included} km included · {hourlyRideReq.is_roundtrip ? '🔄 Round trip' : '➡️ One way'}</Text>
                  </View>
                  <Text style={s.rideFare}>₹{hourlyRideReq.base_fare}</Text>
                </View>
                <View style={s.rideDetails}>
                  <Text style={s.rideFrom}>📍 {hourlyRideReq.pickup}</Text>
                  {hourlyRideReq.drop_location && <><Text style={s.rideDivider}>↓</Text><Text style={s.rideTo}>🎯 {hourlyRideReq.drop_location}</Text></>}
                  {!hourlyRideReq.drop_location && <Text style={[s.rideTo, { color: '#999' }]}>📍 Drop: Flexible</Text>}
                </View>
                {hourlyRideReq.scheduled_at && (
                  <View style={{ backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: 8, padding: 8, marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(233,30,99,0.3)' }}>
                    <Text style={{ fontSize: 14 }}>📅</Text>
                    <Text style={{ color: C.pink, fontSize: 12, fontWeight: '700' }}>SCHEDULED: {new Date(hourlyRideReq.scheduled_at).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</Text>
                  </View>
                )}
                <View style={{ backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 8, padding: 8, marginTop: 6, marginBottom: 4, borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' }}>
                  <Text style={{ color: C.green, fontSize: 11, fontWeight: '600' }}>{tp('your_earning_colon', { amt: String(driverSub?.active ? Math.round(parseFloat(hourlyRideReq.base_fare || 0)) : Math.round(parseFloat(hourlyRideReq.base_fare || 0) * 0.88)), suffix: driverSub?.active ? t('subscribed_zero_comm') : t('commission_12_wallet') })}</Text>
                </View>
                {!hourlyRideReq.scheduled_at && <CountdownBar seconds={25} onTimeout={() => setHourlyRideReq(null)} />}
                <View style={[s.rideActions, { marginTop: 12 }]}>
                  <Bouncy style={s.rejectBtn} onPress={() => setHourlyRideReq(null)}><Text style={s.rejectTxt}>✕ Skip</Text></Bouncy>
                  <Bouncy style={s.acceptBtn} onPress={acceptHourlyRide} disabled={loading}><Text style={s.acceptTxt}>{loading ? '...' : '✓ Accept'}</Text></Bouncy>
                </View>
              </View>
            </SlideIn>
          )}

          {/* ─── ACTIVE HOURLY RIDE (moved to Live tab) ─── */}
          {false && activeHourlyRide && (
            <View style={[s.tripCard, { borderLeftWidth: 4, borderLeftColor: C.pink }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ backgroundColor: C.pink, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>⏱️ HOURLY TRIP</Text></View>
                {activeHourlyRide.status === 'active' && (
                  <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#0F172A', fontVariant: ['tabular-nums'] }}>
                    {String(Math.floor(hourlyTimerSec/3600)).padStart(2,'0')}:{String(Math.floor((hourlyTimerSec%3600)/60)).padStart(2,'0')}:{String(hourlyTimerSec%60).padStart(2,'0')}
                  </Text>
                )}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ color: '#94A3B8', fontSize: 13 }}>{activeHourlyRide.package_hours === 8 ? 'Full Day' : `${activeHourlyRide.package_hours}h`} · {activeHourlyRide.km_included} km · ₹{activeHourlyRide.base_fare}</Text>
                <Text style={{ color: activeHourlyRide.status === 'active' ? C.green : C.pink, fontSize: 12, fontWeight: '600' }}>
                  {activeHourlyRide.status === 'matched' ? t('go_to_pickup_label') : activeHourlyRide.status === 'arrived' ? t('pickup_reached_label') : t('trip_ongoing_label')}
                </Text>
              </View>

              <View style={s.tripRoute}>
                <Text style={s.tripFrom}>📍 {activeHourlyRide.pickup}</Text>
                {activeHourlyRide.drop_location && <><Text style={s.tripArrow}>↓</Text><Text style={s.tripTo}>🎯 {activeHourlyRide.drop_location}</Text></>}
              </View>

              {/* Chat + Call buttons */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#E2E8F0' }}
                  onPress={() => { setShowHourlyChat(true); setHourlyChatMsgs([]); }}
                >
                  <Ionicons name="chatbubble" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Chat</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(233,30,99,0.3)' }}
                  onPress={callCustomer}
                >
                  <Ionicons name="call" size={18} color={C.pink} />
                  <Text style={{ color: C.pink, fontWeight: '700', fontSize: 14 }}>Call</Text>
                </TouchableOpacity>
              </View>

              {activeHourlyRide.status === 'matched' && (
                <View style={{ marginTop: 10 }}>
                  <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 8, textAlign: 'center' }}>{t('ask_customer_otp')}</Text>
                  <TextInput style={{ borderWidth: 2, borderColor: C.green, borderRadius: 12, padding: 14, fontSize: 28, textAlign: 'center', letterSpacing: 10, marginBottom: 10, fontWeight: 'bold', backgroundColor: '#FFFFFF', color: '#0F172A' }} placeholder="0000" placeholderTextColor="#475569" keyboardType="number-pad" maxLength={4} value={hourlyOtpInput} onChangeText={setHourlyOtpInput} />
                  <Bouncy style={s.tripBtn} onPress={startHourlyTrip} disabled={loading}><Text style={s.tripBtnTxt}>{loading ? '...' : t('trip_verify_start')}</Text></Bouncy>
                  <TouchableOpacity style={[s.navBtn, { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6 }]} onPress={() => setInNavMode(true)}>
                    <Ionicons name="navigate" size={15} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Pickup Navigate Karo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ marginTop: 10, borderWidth: 1.5, borderColor: C.pink, borderRadius: 12, padding: 12, alignItems: 'center' }}
                    onPress={() => {
                      Alert.alert('Cancel Ride?', "Can't reach the pickup point? The customer will get a new driver.", [
                        { text: 'No', style: 'cancel' },
                        { text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
                          try {
                            const r = await fetch(`${API}/api/hourly/driver-cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: activeHourlyRide.id, driver_phone: phone }) });
                            const d = await r.json();
                            if (d.success) { setActiveHourlyRide(null); setResult('Ride cancelled.'); }
                            else Alert.alert('Error', d.error || 'Cancel failed');
                          } catch (_e) { Alert.alert('Error', 'Network error'); }
                        }},
                      ]);
                    }}>
                    <Text style={{ color: C.pink, fontWeight: '700', fontSize: 13 }}>{t('pickup_cant_reach_cancel')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {activeHourlyRide.status === 'active' && (
                <View style={{ marginTop: 10 }}>
                  {/* KM + Time progress bars */}
                  <View style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                      <Text style={{ fontSize: 12, color: '#666' }}>📍 {liveKm.toFixed(1)} / {activeHourlyRide.km_included} km</Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: liveKm / (activeHourlyRide.km_included||1) > 0.9 ? C.pink : liveKm / (activeHourlyRide.km_included||1) > 0.8 ? '#ff9800' : '#2e7d32' }}>
                        {tp('km_remaining_label', { n: Math.max(0, (activeHourlyRide.km_included||0) - liveKm).toFixed(1) })}
                      </Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: liveKm / (activeHourlyRide.km_included||1) > 0.9 ? C.pink : liveKm / (activeHourlyRide.km_included||1) > 0.8 ? '#ff9800' : C.green, width: `${Math.min(100, (liveKm / (activeHourlyRide.km_included||1)) * 100)}%` as any }} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                      <Text style={{ fontSize: 12, color: '#666' }}>⏱️ {String(Math.floor(hourlyTimerSec/3600)).padStart(2,'0')}:{String(Math.floor((hourlyTimerSec%3600)/60)).padStart(2,'0')} elapsed</Text>
                      <Text style={{ fontSize: 12, color: '#94A3B8' }}>
                        {(() => { const rem = Math.max(0, parseFloat(activeHourlyRide.package_hours||0)*3600 - hourlyTimerSec); return rem > 0 ? tp('time_remaining_label', { t: `${String(Math.floor(rem/3600)).padStart(2,'0')}:${String(Math.floor((rem%3600)/60)).padStart(2,'0')}` }) : t('time_up_label'); })()}
                      </Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: '#334155', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: C.green, width: `${Math.min(100, (hourlyTimerSec / ((parseFloat(activeHourlyRide.package_hours||1))*3600)) * 100)}%` as any }} />
                    </View>
                    {liveKm / (activeHourlyRide.km_included||1) > 0.8 && (
                      <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
                        <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: '700' }}>{tp('km_remaining_extra_warn', { n: Math.max(0, (activeHourlyRide.km_included||0) - liveKm).toFixed(1) })}</Text>
                      </View>
                    )}
                  </View>

                  <View style={{ backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 8, padding: 8, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' }}>
                    <Text style={{ color: C.green, fontSize: 12 }}>{tp('guaranteed_min_full', { min: String(Math.round(parseFloat(activeHourlyRide.base_fare || 0) * 0.70 * 0.88).toFixed(0)), full: String(Math.round(parseFloat(activeHourlyRide.base_fare || 0) * 0.88).toFixed(0)) })}</Text>
                  </View>

                  {/* Return trip navigation — driver navigates back to original pickup */}
                  {activeHourlyRide.is_roundtrip && (
                    <TouchableOpacity
                      style={{ backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: 12, padding: 13, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(233,30,99,0.3)' }}
                      onPress={() => {
                        const lat = activeHourlyRide.pickup_lat;
                        const lng = activeHourlyRide.pickup_lng;
                        const addr = encodeURIComponent(activeHourlyRide.pickup || '');
                        if (lat && lng) {
                          Linking.openURL(`google.navigation:q=${lat},${lng}`).catch(() => Linking.openURL(`https://maps.google.com/?daddr=${lat},${lng}`));
                        } else {
                          Linking.openURL(`google.navigation:q=${addr}`).catch(() => Linking.openURL(`https://maps.google.com/?daddr=${addr}`));
                        }
                      }}>
                      <Text style={{ fontSize: 22 }}>🔄</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', color: C.pink, fontSize: 14 }}>{t('return_navigate_pickup')}</Text>
                        <Text style={{ color: '#64748B', fontSize: 11, marginTop: 2 }} numberOfLines={1}>📍 {activeHourlyRide.pickup}</Text>
                      </View>
                      <Text style={{ color: C.pink, fontSize: 18 }}>›</Text>
                    </TouchableOpacity>
                  )}

                  {/* Extension request from customer */}
                  {!!activeHourlyRide.extend_requested_hours && (
                    <View style={{ backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(233,30,99,0.3)' }}>
                      {(() => {
                        const dec = parseFloat(activeHourlyRide.extend_requested_hours);
                        const hrs = Math.floor(dec);
                        const mins = Math.round((dec - hrs) * 60);
                        const label = hrs > 0 && mins > 0 ? `${hrs}h ${mins}m` : hrs > 0 ? `${hrs}h` : `${mins} min`;
                        return <Text style={{ fontWeight: 'bold', color: C.pink, marginBottom: 4 }}>{tp('customer_extend_request', { label })}</Text>;
                      })()}
                      <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 10 }}>{t('extend_agree_hint')}</Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Bouncy style={{ flex: 1, backgroundColor: hExtendLoading ? '#334155' : C.green, borderRadius: 10, padding: 12, alignItems: 'center' }} onPress={acceptExtend} disabled={hExtendLoading}>
                          <Text style={{ color: '#fff', fontWeight: 'bold' }}>{hExtendLoading ? '⏳ ...' : '✅ Accept'}</Text>
                        </Bouncy>
                        <Bouncy style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }} onPress={rejectExtend} disabled={hExtendLoading}>
                          <Text style={{ color: '#94A3B8', fontWeight: 'bold' }}>✗ Reject</Text>
                        </Bouncy>
                      </View>
                    </View>
                  )}

                  {/* Complete / Time-Lock / Early End — unified block */}
                  {(() => {
                    const totalSec = parseFloat(activeHourlyRide.package_hours || 0) * 3600;
                    const remSec = Math.max(0, totalSec - hourlyTimerSec);
                    const remTotalMin = Math.ceil(remSec / 60);
                    const remH = Math.floor(remTotalMin / 60);
                    const remM = remTotalMin % 60;
                    const remStr = remH > 0 ? `${remH}h ${remM > 0 ? remM + 'm' : ''}` : `${remTotalMin}m`;

                    // Early end section — reusable inside each state
                    const EarlyEndSection = () => (
                      activeHourlyRide.early_end_requested_by === 'customer' ? (
                        <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 12, padding: 14, marginTop: 10, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
                          <Text style={{ fontWeight: 'bold', color: '#F59E0B', marginBottom: 6 }}>{t('customer_early_end_request')}</Text>
                          <Text style={{ color: '#94A3B8', fontSize: 12, marginBottom: 10 }}>{t('early_end_agree_hint')}</Text>
                          <View style={{ flexDirection: 'row', gap: 10 }}>
                            <Bouncy style={{ flex: 1, backgroundColor: C.green, borderRadius: 10, padding: 12, alignItems: 'center' }} onPress={confirmHourlyEarlyEnd} disabled={hEarlyEndLoading}><Text style={{ color: '#fff', fontWeight: 'bold' }}>✅ Agree</Text></Bouncy>
                            <Bouncy style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }} onPress={rejectHourlyEarlyEnd}><Text style={{ color: '#94A3B8', fontWeight: 'bold' }}>✗ Reject</Text></Bouncy>
                          </View>
                        </View>
                      ) : activeHourlyRide.early_end_requested_by === 'driver' ? (
                        <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 10, padding: 10, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
                          <Text style={{ color: '#F59E0B', fontSize: 12 }}>{t('waiting_customer_confirm')}</Text>
                        </View>
                      ) : (activeHourlyRide.early_end_reject_count || 0) >= 2 ? (
                        <View style={{ backgroundColor: 'rgba(233,69,96,0.1)', borderRadius: 10, padding: 10, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: 'rgba(233,69,96,0.3)' }}>
                          <Text style={{ color: C.pink, fontSize: 12, fontWeight: '700' }}>{t('reject_limit_support')}</Text>
                        </View>
                      ) : activeHourlyRide.early_end_last_rejected_at && (Date.now() - new Date(activeHourlyRide.early_end_last_rejected_at).getTime()) < 15 * 60 * 1000 ? (
                        <View style={{ backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
                          <Text style={{ color: '#64748B', fontSize: 12 }}>{tp('retry_request_after_min', { n: String(Math.ceil((15 * 60 * 1000 - (Date.now() - new Date(activeHourlyRide.early_end_last_rejected_at).getTime())) / 60000)) })}</Text>
                        </View>
                      ) : (
                        <Bouncy style={[s.cancelBtn, { borderColor: '#ff9800', borderWidth: 1, marginTop: 8 }]} onPress={requestHourlyEarlyEnd} disabled={hEarlyEndLoading}>
                          <Text style={[s.cancelTxt, { color: '#ff9800' }]}>{t('early_end_request_btn')}</Text>
                        </Bouncy>
                      )
                    );

                    // State 1: Legacy pending customer confirm
                    if (activeHourlyRide.pending_customer_confirm) return (
                      <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 12, padding: 14, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
                        <Text style={{ fontWeight: 'bold', color: '#F59E0B', marginBottom: 4 }}>{t('waiting_customer_confirmation')}</Text>
                        <Text style={{ fontSize: 12, color: '#94A3B8' }}>{t('auto_confirm_10min')}</Text>
                      </View>
                    );

                    // State 2: 20-min startup lock
                    if (hourlyTimerSec < 20 * 60) return (
                      <View style={{ backgroundColor: '#F8FAFC', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
                        <Text style={{ color: '#94A3B8', fontWeight: '700', fontSize: 14 }}>{tp('startup_lock_label', { n: String(Math.ceil(20 - hourlyTimerSec / 60)) })}</Text>
                        <Text style={{ color: '#475569', fontSize: 11, marginTop: 3 }}>{t('startup_lock_sub')}</Text>
                      </View>
                    );

                    // State 3: Package time still remaining — locked, show early end option
                    if (remSec > 0) return (
                      <View style={{ marginBottom: 10 }}>
                        <View style={{ backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(233,30,99,0.3)' }}>
                          <Text style={{ color: C.pink, fontWeight: '800', fontSize: 18, marginBottom: 4 }}>{tp('time_remaining_title', { t: remStr })}</Text>
                          <Text style={{ color: '#64748B', fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
                            {t('complete_btn_after_package')}
                          </Text>
                        </View>
                        <EarlyEndSection />
                      </View>
                    );

                    // State 4: Time complete — show complete button
                    return (
                      <Bouncy style={[s.tripBtn, { backgroundColor: C.green, marginBottom: 10 }]} onPress={completeHourlyTrip} disabled={loading}>
                        <Text style={s.tripBtnTxt}>{loading ? '...' : t('trip_complete')}</Text>
                      </Bouncy>
                    );
                  })()}
                </View>
              )}
            </View>
          )}

          {isOnline && !rideReq && !activeRide && !activeHourlyRide && !hourlyRideReq && (
            <View style={s.statusCard}><Text style={s.statusText}>{t('online_status_msg')}</Text></View>
          )}
          {!isOnline && (
            <View style={s.statusCard}><Text style={s.statusText}>{t('offline_status_msg')}</Text></View>
          )}
          {(rideReq || activeRide || hourlyRideReq || activeHourlyRide) && (
            <TouchableOpacity onPress={() => setActiveTab('live')} style={{ backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: 14, padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.4)', elevation: 3 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.green }} />
              <Text style={{ color: C.green, fontWeight: '800', fontSize: 14, flex: 1 }}>
                {rideReq ? t('home_live_new_ride') : activeRide ? (activeRide.status === 'matched' ? t('home_live_pickup') : activeRide.status === 'arrived' ? t('home_live_otp') : t('home_live_ongoing')) : t('home_live_hourly')}
              </Text>
              <Text style={{ color: C.green, fontSize: 18, fontWeight: '900' }}>›</Text>
            </TouchableOpacity>
          )}

          {/* Rules & Info */}
          <View style={{ marginTop: 10 }}>
              <View style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '800', marginBottom: 10 }}>{t('rules_std_title')}</Text>
                {[
                  [t('rule_commission_std_l'), t('rule_commission_std_d')],
                  [t('rule_accept_std_l'), t('rule_accept_std_d')],
                  [t('guide_arrive_title'), t('guide_arrive_desc')],
                  [t('guide_otp_title'), t('guide_otp_desc')],
                  [t('rule_complete_std_l'), t('rule_complete_std_d')],
                  [t('rule_cancel_std_l'), t('rule_cancel_std_d')],
                  [t('guide_rating_title'), t('guide_rating_desc')],
                  [t('rule_payment_std_l'), t('rule_payment_std_d')],
                ].map(([icon, text], i) => (
                  <View key={i} style={{ flexDirection: 'row', marginBottom: 7 }}>
                    <Text style={{ color: C.pink, fontSize: 12, fontWeight: '700', width: 100 }}>{icon}</Text>
                    <Text style={{ color: '#555', fontSize: 11, flex: 1, lineHeight: 16 }}>{text}</Text>
                  </View>
                ))}
              </View>
              <View style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ color: C.pink, fontSize: 14, fontWeight: '800', marginBottom: 10 }}>{t('rules_hourly_title')}</Text>
                {[
                  [t('rule_commission_h_l'), t('rule_commission_h_d')],
                  [t('rule_packages_h_l'), t('rule_packages_h_d')],
                  [t('hguide_otp_title'), t('hguide_otp_desc')],
                  [t('hguide_lock_title'), t('hguide_lock_desc')],
                  [t('hguide_end_title'), t('hguide_end_desc')],
                  [t('rule_extension_h_l'), t('rule_extension_h_d')],
                  [t('hguide_sched_title'), t('hguide_sched_desc')],
                  [t('rule_extrakm_h_l'), t('rule_extrakm_h_d')],
                  [t('rule_escrow_h_l'), t('rule_escrow_h_d')],
                  [t('rule_misuse_h_l'), t('rule_misuse_h_d')],
                ].map(([icon, text], i) => (
                  <View key={i} style={{ flexDirection: 'row', marginBottom: 8 }}>
                    <Text style={{ color: C.pink, fontSize: 11, fontWeight: '700', width: 105 }}>{icon}</Text>
                    <Text style={{ color: '#64748B', fontSize: 11, flex: 1, lineHeight: 16 }}>{text}</Text>
                  </View>
                ))}
              </View>
            </View>
        </ScrollView>
      </View>
      <View style={s.navFloat}><BottomNav activeTab={activeTab} setActiveTab={setActiveTab} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} /></View>
      {NavOverlay}
    </KeyboardAvoidingView>
  );

  // ═══ LIVE TAB — Full-screen active ride control ═══
  if (activeTab === 'live') {
    const PT = Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 44;
    const isIdle = !rideReq && !activeRide && !hourlyRideReq && !activeHourlyRide;
    return (
      <View style={{ flex: 1, backgroundColor: '#F1F5F9' }}>
        <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
        {/* Header */}
        <View style={{ backgroundColor: C.bgDark, paddingTop: PT, paddingHorizontal: SP.md, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 22, letterSpacing: 0.3 }}>⚡ Live</Text>
              <Text style={{ color: 'rgba(255,255,255,0.50)', fontSize: 12, marginTop: 1 }}>Active Ride Control</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {isOnline ? <PulseView><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.online }} /></PulseView> : null}
                <Text style={{ color: isOnline ? C.online : C.red, fontWeight: '700', fontSize: 13 }}>{isOnline ? 'Online' : 'Offline'}</Text>
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, marginTop: 2 }}>{driverInfo?.name || phone}</Text>
            </View>
          </View>
        </View>

        {/* ── IDLE STATE ── */}
        {isIdle && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 80 }}>
            {isOnline ? (
              <>
                <PulseView>
                  <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(16,185,129,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: 'rgba(16,185,129,0.4)' }}>
                    <Text style={{ fontSize: 44 }}>🚗</Text>
                  </View>
                </PulseView>
                <Text style={{ fontSize: 22, fontWeight: '900', color: '#0F172A', marginTop: 24, textAlign: 'center' }}>{t('live_waiting_title')}</Text>
                <Text style={{ fontSize: 14, color: '#64748B', marginTop: 8, textAlign: 'center', lineHeight: 20 }}>{t('live_waiting_sub')}</Text>
              </>
            ) : (
              <>
                <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(239,68,68,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: 'rgba(239,68,68,0.25)' }}>
                  <Text style={{ fontSize: 44 }}>💤</Text>
                </View>
                <Text style={{ fontSize: 22, fontWeight: '900', color: '#0F172A', marginTop: 24, textAlign: 'center' }}>{t('live_offline_title')}</Text>
                <Text style={{ fontSize: 14, color: '#64748B', marginTop: 8, textAlign: 'center', lineHeight: 20 }}>{t('live_offline_sub')}</Text>
                <TouchableOpacity onPress={() => setActiveTab('home')} style={{ backgroundColor: C.pink, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14, marginTop: 24, elevation: 4 }}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>{t('live_go_home')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* ── INCOMING STANDARD RIDE REQUEST ── */}
        {rideReq && !activeRide && !activeHourlyRide && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
            {/* Dark plum header — premium, urgent */}
            <View style={{ backgroundColor: C.bgDark, paddingTop: 20, paddingHorizontal: SP.md, paddingBottom: SP.lg, alignItems: 'center', overflow: 'hidden' }}>
              {/* Subtle blob */}
              <View style={{ position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,45,120,0.08)', top: -60, right: -40 }} />
              <View style={{ position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(0,200,83,0.06)', bottom: -40, left: -30 }} />

              {/* Scheduled ride banner */}
              {rideReq?.isScheduled && (
                <View style={{ backgroundColor: 'rgba(245,158,11,0.18)', borderRadius: R.full, paddingHorizontal: 16, paddingVertical: 5, marginBottom: 10, borderWidth: 1.5, borderColor: 'rgba(245,158,11,0.55)', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 13 }}>📅</Text>
                  <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>
                    SCHEDULED · {rideReq.scheduledAt ? new Date(rideReq.scheduledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : ''}
                  </Text>
                </View>
              )}

              {/* Intercity banner — big-earning long trip */}
              {(rideReq?.is_intercity || rideReq?.isIntercity) && (
                <View style={{ backgroundColor: 'rgba(37,99,235,0.20)', borderRadius: R.full, paddingHorizontal: 16, paddingVertical: 5, marginBottom: 10, borderWidth: 1.5, borderColor: 'rgba(96,165,250,0.60)', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 13 }}>🛣️</Text>
                  <Text style={{ color: '#60A5FA', fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>
                    INTERCITY · {(rideReq?.is_roundtrip || rideReq?.isRoundtrip) ? 'ROUND TRIP' : 'ONE WAY'}
                  </Text>
                </View>
              )}

              {/* Favourite / new ride label */}
              {!rideReq?.isScheduled && (rideReq?.is_favourite_request ? (
                <View style={{ backgroundColor: 'rgba(245,158,11,0.18)', borderRadius: R.full, paddingHorizontal: 16, paddingVertical: 5, marginBottom: 10, borderWidth: 1.5, borderColor: 'rgba(245,158,11,0.45)', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 13 }}>⭐</Text>
                  <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>REGULAR CUSTOMER</Text>
                </View>
              ) : (
                <View style={{ backgroundColor: C.pinkGlass, borderRadius: R.full, paddingHorizontal: 16, paddingVertical: 5, marginBottom: 10, borderWidth: 1.5, borderColor: C.pinkBorder }}>
                  <Text style={{ color: C.pink, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 }}>NAYI RIDE AAYI!</Text>
                </View>
              ))}

              {/* Vehicle emoji */}
              <Text style={{ fontSize: 60, marginBottom: SP.sm }}>
                {rideReq?.ride_type === 'car' ? '🚕' : rideReq?.ride_type === 'bike' ? '🏍️' : rideReq?.ride_type === 'eriksha' ? '🛵' : rideReq?.ride_type === 'green_bike' ? '⚡' : rideReq?.ride_type === 'electric_auto' ? '🌿' : '🛺'}
              </Text>

              {/* Passenger name */}
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 0.3 }}>{rideReq?.passenger_name || 'Passenger'}</Text>

              {/* Surge badge */}
              {surgeMultiplier > 1.0 && (
                <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: R.full, paddingHorizontal: 14, paddingVertical: 5, marginTop: 10, borderWidth: 1.5, borderColor: 'rgba(245,158,11,0.45)', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={{ fontSize: 14 }}>⚡</Text>
                  <Text style={{ color: '#F59E0B', fontWeight: '900', fontSize: 13 }}>{surgeMultiplier}x SURGE</Text>
                </View>
              )}

              {/* Big earn number — the hero moment */}
              <View style={{ backgroundColor: 'rgba(0,200,83,0.12)', borderRadius: R.lg, paddingHorizontal: SP.xl, paddingVertical: SP.md, marginTop: SP.md, borderWidth: 1.5, borderColor: 'rgba(0,200,83,0.30)', alignItems: 'center' }}>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '800', letterSpacing: 1.8, marginBottom: 2 }}>AAPKI KAMAI</Text>
                <Text style={{ color: C.online, fontSize: 54, fontWeight: '900', lineHeight: 60, letterSpacing: -1.5 }}>₹{driverSub?.active ? Math.round(rideReq?.fare || 0) : Math.round((rideReq?.fare || 0) * (rideReq?.is_intercity ? 0.90 : 0.88))}</Text>
                {driverSub?.active
                  ? <Text style={{ color: '#86EFAC', fontSize: 11, marginTop: 2, fontWeight: '700' }}>✅ Subscribed · ₹0 Commission</Text>
                  : <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 }}>Total: ₹{rideReq?.fare} · {rideReq?.is_intercity ? '10%' : '12%'} commission</Text>}
              </View>

              {/* Advance-paid info — customer prepaid 1/3, driver collects the rest */}
              {parseFloat(rideReq?.advance_amount || 0) > 0 && (
                <View style={{ backgroundColor: 'rgba(37,99,235,0.15)', borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 10, marginTop: 10, borderWidth: 1.5, borderColor: 'rgba(96,165,250,0.5)', width: '100%' }}>
                  <Text style={{ color: '#93C5FD', fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center' }}>💳 ADVANCE PREPAID ONLINE</Text>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900', textAlign: 'center', marginTop: 3 }}>
                    ₹{Math.round(parseFloat(rideReq.advance_amount))} paid · Collect ₹{Math.max(0, Math.round((rideReq?.fare || 0) - parseFloat(rideReq.advance_amount)))} at drop
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, textAlign: 'center', marginTop: 2 }}>Commission already covered — nothing due from you</Text>
                </View>
              )}
            </View>

            <View style={{ padding: SP.md }}>
              {/* Distance badges */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                {driverGps && rideReq?.pickup_lat && (
                  <View style={{ flex: 1, backgroundColor: C.plumGlass, borderRadius: R.md, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: C.plumBorder }}>
                    <Text style={{ color: C.plum, fontSize: 11, fontWeight: '800' }}>{t('aap_se_pickup')}</Text>
                    <Text style={{ color: C.plum, fontSize: 22, fontWeight: '900', marginTop: 3 }}>
                      {haversineKm(driverGps.lat, driverGps.lng, rideReq.pickup_lat, rideReq.pickup_lng).toFixed(1)} km
                    </Text>
                  </View>
                )}
                {rideReq?.distance && (
                  <View style={{ flex: 1, backgroundColor: C.greenGlass, borderRadius: R.md, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: C.greenBorder }}>
                    <Text style={{ color: C.online, fontSize: 11, fontWeight: '800' }}>🛣️ Trip Distance</Text>
                    <Text style={{ color: C.online, fontSize: 22, fontWeight: '900', marginTop: 3 }}>{rideReq.distance} km</Text>
                  </View>
                )}
              </View>

              {/* Route card */}
              <View style={{ backgroundColor: C.bgCard, borderRadius: R.md, padding: SP.md, marginBottom: 14, borderWidth: 1, borderColor: C.glassBorder, ...SHADOW.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{ alignItems: 'center', marginRight: 12, paddingTop: 3 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: C.online, borderWidth: 2, borderColor: C.greenBorder }} />
                    <View style={{ width: 2, height: 30, backgroundColor: C.glassBorder, marginVertical: 2 }} />
                    <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: C.pink }} />
                  </View>
                  <View style={{ flex: 1, gap: 14 }}>
                    <View>
                      <Text style={{ ...T.label, color: C.textDim }}>PICKUP</Text>
                      <Text style={{ ...T.bodyBold, color: C.text, marginTop: 3 }} numberOfLines={2}>{rideReq?.pickup}</Text>
                    </View>
                    <View>
                      <Text style={{ ...T.label, color: C.textDim }}>DROP</Text>
                      <Text style={{ ...T.bodyBold, color: C.text, marginTop: 3 }} numberOfLines={2}>{rideReq?.drop_location}</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Countdown */}
              {rideReq && <CountdownBar seconds={rideReq.seconds_to_accept || 30} onTimeout={rejectRide} />}

              {/* Accept / Reject */}
              <View style={{ flexDirection: 'row', gap: 14, marginTop: SP.md }}>
                <Bouncy style={{ flex: 1, backgroundColor: C.bgCard, borderRadius: R.md, padding: 20, alignItems: 'center', borderWidth: 1.5, borderColor: C.pinkBorder }} onPress={rejectRide}>
                  <Text style={{ fontSize: 24 }}>✕</Text>
                  <Text style={{ color: C.red, fontWeight: '800', fontSize: 14, marginTop: 4 }}>Reject</Text>
                </Bouncy>
                <Bouncy style={{ flex: 2, backgroundColor: C.online, borderRadius: R.md, padding: 20, alignItems: 'center', elevation: 8, shadowColor: C.online, shadowOpacity: 0.5, shadowRadius: 14 }} onPress={acceptRide} disabled={loading}>
                  <Text style={{ fontSize: 24 }}>✓</Text>
                  <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16, marginTop: 4 }}>
                    {loading ? t('live_accept_loading') : t('live_accept')}
                  </Text>
                </Bouncy>
              </View>
            </View>
          </ScrollView>
        )}

        {/* ── INCOMING HOURLY RIDE REQUEST ── */}
        {hourlyRideReq && !activeRide && !activeHourlyRide && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={{ backgroundColor: '#0F172A', borderRadius: 16, padding: 16, marginBottom: 14, overflow: 'hidden' }}>
              <View style={{ position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,45,120,0.08)', top: -40, right: -40 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <View style={{ backgroundColor: C.pink, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>⏱️ HOURLY BOOKING</Text></View>
                {hourlyRideReq.scheduled_at && (
                  <View style={{ backgroundColor: 'rgba(245,158,11,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)' }}>
                    <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '800' }}>📅 SCHEDULED</Text>
                  </View>
                )}
              </View>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 24, marginBottom: 4 }}>
                {hourlyRideReq.package_hours >= 24 ? `${hourlyRideReq.package_hours / 24} Day${hourlyRideReq.package_hours > 24 ? 's' : ''}` : hourlyRideReq.package_hours === 8 ? 'Full Day (8h)' : `${hourlyRideReq.package_hours} Hours`}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <View style={{ backgroundColor: 'rgba(0,200,83,0.12)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(0,200,83,0.3)', alignItems: 'center', flex: 1 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>{t('your_earning_label')}</Text>
                  <Text style={{ color: C.online, fontSize: 28, fontWeight: '900', lineHeight: 34 }}>₹{driverSub?.active ? Math.round(parseFloat(hourlyRideReq.base_fare || 0)) : Math.round(parseFloat(hourlyRideReq.base_fare || 0) * 0.88)}</Text>
                  {driverSub?.active
                    ? <Text style={{ color: '#86EFAC', fontSize: 9, fontWeight: '700' }}>✅ ₹0 Commission</Text>
                    : <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>{t('commission_deducted_label')}</Text>}
                </View>
                <View style={{ backgroundColor: 'rgba(37,99,235,0.12)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(37,99,235,0.3)', alignItems: 'center', flex: 1 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>INCLUDED KM</Text>
                  <Text style={{ color: '#93C5FD', fontSize: 28, fontWeight: '900', lineHeight: 34 }}>{hourlyRideReq.km_included}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>km guaranteed</Text>
                </View>
              </View>
            </View>

            {/* Guaranteed payment badge */}
            <View style={{ backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.28)' }}>
              <Text style={{ fontSize: 20 }}>✅</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#059669', fontWeight: '800', fontSize: 13 }}>{tp('already_paid_wallet', { fare: String(hourlyRideReq.base_fare) })}</Text>
                <Text style={{ color: '#64748B', fontSize: 11, marginTop: 2 }}>{t('wallet_prepaid_hint')}</Text>
              </View>
            </View>

            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 14, elevation: 3, borderWidth: 1, borderColor: '#E2E8F0' }}>
              {/* Pickup distance */}
              {driverGps && hourlyRideReq.pickup_lat && hourlyRideReq.pickup_lng && (() => {
                const distKm = haversineKm(driverGps.lat, driverGps.lng, parseFloat(hourlyRideReq.pickup_lat), parseFloat(hourlyRideReq.pickup_lng));
                const distStr = distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`;
                return (
                  <View style={{ backgroundColor: 'rgba(233,30,99,0.06)', borderRadius: 10, padding: 10, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(233,30,99,0.2)' }}>
                    <Text style={{ fontSize: 16 }}>🗺️</Text>
                    <Text style={{ color: C.pink, fontWeight: '700', fontSize: 13 }}>{tp('dist_to_pickup_go', { dist: distStr })}</Text>
                  </View>
                );
              })()}

              <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 }}>PICKUP</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 10 }}>{hourlyRideReq.pickup}</Text>
              {hourlyRideReq.drop_location && (
                <><Text style={{ fontSize: 10, color: '#64748B', fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 }}>FIRST STOP</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{hourlyRideReq.drop_location}</Text></>
              )}
              {!hourlyRideReq.drop_location && <Text style={{ color: '#94A3B8', fontSize: 13 }}>{t('drop_flexible')}</Text>}
            </View>
            {hourlyRideReq.scheduled_at && (
              <View style={{ backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: 10, padding: 10, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(233,30,99,0.3)' }}>
                <Text style={{ fontSize: 16 }}>📅</Text>
                <Text style={{ color: C.pink, fontSize: 13, fontWeight: '700' }}>SCHEDULED: {new Date(hourlyRideReq.scheduled_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            )}
            {!hourlyRideReq.scheduled_at && <CountdownBar seconds={25} onTimeout={() => setHourlyRideReq(null)} />}
            <View style={{ flexDirection: 'row', gap: 14, marginTop: 14 }}>
              <TouchableOpacity style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB', elevation: 2 }} onPress={() => setHourlyRideReq(null)}>
                <Text style={{ fontSize: 26 }}>✕</Text>
                <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 14, marginTop: 4 }}>{t('skip_plain')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 2, backgroundColor: '#22C55E', borderRadius: 16, padding: 20, alignItems: 'center', elevation: 6, shadowColor: '#22C55E', shadowOpacity: 0.45, shadowRadius: 12 }} onPress={acceptHourlyRide} disabled={loading}>
                <Text style={{ fontSize: 26 }}>✓</Text>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16, marginTop: 4 }}>{loading ? t('live_accept_loading') : t('live_accept')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* ── ACTIVE STANDARD RIDE ── */}
        {activeRide && (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 160 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <TripStatusBar status={activeRide.status} />

              {/* Status banner */}
              <View style={{ backgroundColor: activeRide.status === 'matched' ? C.green : activeRide.status === 'arrived' ? '#2563EB' : C.green, borderRadius: 14, padding: 14, marginBottom: 14, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>
                  {activeRide.status === 'matched' && t('go_to_pickup_label')}
                  {activeRide.status === 'arrived' && t('pickup_reached_otp_label')}
                  {activeRide.status === 'started' && t('trip_ongoing_label')}
                </Text>
              </View>

              {/* Customer card */}
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 14, elevation: 3, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(233,30,99,0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 2, borderColor: 'rgba(233,30,99,0.2)' }}>
                    <Text style={{ color: C.pink, fontSize: 22, fontWeight: 'bold' }}>{activeRide.passenger_name?.[0] || 'P'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 17, fontWeight: '900', color: '#0F172A' }}>{activeRide.passenger_name || 'Passenger'}</Text>
                    <Text style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>📞 {activeRide.passenger_phone_masked || '**********'}</Text>
                  </View>
                  <Text style={{ fontSize: 24, fontWeight: '900', color: C.green }}>₹{Math.max(0, Math.round(parseFloat(String(activeRide.fare||'0')) - parseFloat(String(activeRide.discount||'0'))))}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={{ flex: 1, backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#BBF7D0' }} onPress={() => { setUnreadChat(0); setShowChat(true); }}>
                    <View style={{ position: 'relative' }}>
                      <Ionicons name="chatbubble" size={20} color={C.green} />
                      {unreadChat > 0 && <View style={s.chatBadge}><Text style={{ color: '#fff', fontSize: 9, fontWeight: 'bold' }}>{unreadChat}</Text></View>}
                    </View>
                    <Text style={{ color: '#15803D', fontWeight: '700', fontSize: 14 }}>Chat{unreadChat > 0 ? ` (${unreadChat})` : ''}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#BFDBFE' }} onPress={callCustomer}>
                    <Ionicons name="call" size={20} color="#2563EB" />
                    <Text style={{ color: '#1D4ED8', fontWeight: '700', fontSize: 14 }}>Call</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Route */}
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', elevation: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{ alignItems: 'center', marginRight: 12, paddingTop: 3 }}>
                    <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: '#22C55E', borderWidth: 2, borderColor: '#86EFAC' }} />
                    <View style={{ width: 2, height: 28, backgroundColor: '#D1D5DB', marginVertical: 3 }} />
                    <View style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: '#F5C518' }} />
                  </View>
                  <View style={{ flex: 1, gap: 14 }}>
                    <View>
                      <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '700', letterSpacing: 0.8 }}>PICKUP</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.green, marginTop: 2 }} numberOfLines={2}>{activeRide.pickup}</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '700', letterSpacing: 0.8 }}>DROP</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.pink, marginTop: 2 }} numberOfLines={2}>{activeRide.drop_location}</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* ETA / Distance banners */}
              {eta ? (
                <View style={{ backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 10, padding: 10, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)' }}>
                  <Text style={{ color: C.green, fontWeight: '700', fontSize: 14 }}>🕐 {eta}</Text>
                </View>
              ) : null}
              {distToPickup && (activeRide.status === 'matched' || activeRide.status === 'arrived') && (
                <View style={{ backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: 10, padding: 10, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(233,30,99,0.25)' }}>
                  <Text style={{ color: C.pink, fontWeight: '700', fontSize: 15 }}>📍 {distToPickup}</Text>
                </View>
              )}
              {tripRemainingEta && activeRide.status === 'started' && (
                <View style={{ backgroundColor: 'rgba(255,99,24,0.1)', borderRadius: 10, padding: 10, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,99,24,0.3)' }}>
                  <Text style={{ color: '#F5C518', fontWeight: '700', fontSize: 14 }}>🛣️ {tripRemainingEta}</Text>
                </View>
              )}

              {/* ── Navigate section (secondary action) ── */}
              {(activeRide.status === 'matched' || activeRide.status === 'arrived') && (
                <TouchableOpacity
                  style={[s.navBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 0 }]}
                  onPress={() => setInNavMode(true)}
                >
                  <Ionicons name="navigate" size={20} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Pickup Navigate Karo</Text>
                </TouchableOpacity>
              )}
              {activeRide.status === 'started' && (
                <TouchableOpacity
                  style={[s.navBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 0, backgroundColor: 'rgba(14,165,233,0.9)' }]}
                  onPress={() => setInNavMode(true)}
                >
                  <Ionicons name="navigate" size={20} color="#8ae961" />
                  <Text style={{ color: '#8ae961', fontWeight: '700', fontSize: 16 }}>Drop Navigate Karo</Text>
                </TouchableOpacity>
              )}

              {/* ── Spacer + divider between navigate and CTA ── */}
              <View style={{ height: 1, backgroundColor: '#E2E8F0', marginVertical: 20, marginHorizontal: 4 }} />

              {/* ── Primary CTA: Arrived at pickup ── */}
              {activeRide.status === 'matched' && (
                <View>
                  <Bouncy style={[s.tripBtn, { paddingVertical: 20, marginBottom: 12 }]} onPress={markArrived} disabled={loading}>
                    <Text style={[s.tripBtnTxt, { fontSize: 18 }]}>{loading ? '...' : t('pickup_arrived_btn')}</Text>
                  </Bouncy>
                  <TouchableOpacity onPress={() => setShowDriverCancelModal(true)} style={{ alignItems: 'center', paddingVertical: 8, marginBottom: 16 }} disabled={loading}>
                    <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '600' }}>✕ Trip Cancel Karo</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ── OTP entry — cancel ABOVE so keyboard never hides it ── */}
              {activeRide.status === 'arrived' && (
                <View>
                  {/* Driver waiting hints */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 2 }}>
                    {[
                      { emoji: '🙏', text: t('patience_customer_coming') },
                      { emoji: '⏱️', text: t('tip_time_value') },
                      { emoji: '💡', text: t('tip_call_msg') },
                      { emoji: '🚗', text: t('tip_destination_help') },
                    ].map((tip, i) => (
                      <View key={i} style={{ backgroundColor: 'rgba(37,99,235,0.06)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(37,99,235,0.16)', width: 158 }}>
                        <Text style={{ fontSize: 22, marginBottom: 7 }}>{tip.emoji}</Text>
                        <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600', lineHeight: 18 }}>{tip.text}</Text>
                      </View>
                    ))}
                  </ScrollView>
                  <Bouncy
                    style={[s.cancelBtn, { borderWidth: 1.5, borderColor: C.pink, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 20 }]}
                    onPress={() => setShowDriverCancelModal(true)}
                    disabled={loading}
                  >
                    <Text style={[s.cancelTxt, { fontSize: 14, fontWeight: '700' }]}>✕ Cancel Trip</Text>
                  </Bouncy>
                  <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, padding: 22, elevation: 4, borderWidth: 2, borderColor: '#E2E8F0' }}>
                    <Text style={{ fontSize: 15, color: '#0F172A', marginBottom: 18, textAlign: 'center', fontWeight: '700' }}>{t('ask_passenger_otp')}</Text>
                    <TextInput
                      style={{ borderWidth: 2.5, borderColor: otpInput.length === 4 ? C.green : '#E2E8F0', borderRadius: 16, paddingVertical: 20, paddingHorizontal: 18, fontSize: 36, textAlign: 'center', letterSpacing: 14, marginBottom: 20, fontWeight: '900', backgroundColor: '#F8FAFC', color: '#0F172A' }}
                      keyboardType="number-pad"
                      maxLength={4}
                      value={otpInput}
                      onChangeText={setOtpInput}
                      placeholder="○ ○ ○ ○"
                      placeholderTextColor="#D4A520"
                      autoFocus={false}
                    />
                    <Bouncy style={[s.tripBtn, { paddingVertical: 20, opacity: otpInput.length < 4 ? 0.5 : 1 }]} onPress={startTrip} disabled={loading || otpInput.length < 4}>
                      <Text style={[s.tripBtnTxt, { fontSize: 18 }]}>{loading ? '...' : t('trip_verify_start')}</Text>
                    </Bouncy>
                  </View>
                </View>
              )}

              {/* ── Complete trip + cancel (well spaced) ── */}
              {activeRide.status === 'started' && (
                <View>
                  <Bouncy style={[s.tripBtn, { backgroundColor: C.green, shadowColor: C.green, paddingVertical: 20, marginBottom: 0 }]} onPress={completeTrip} disabled={loading}>
                    <Text style={[s.tripBtnTxt, { fontSize: 18 }]}>{loading ? '...' : t('trip_complete')}</Text>
                  </Bouncy>
                  {/* Extra large gap so cancel is NOT accidentally hit after tapping Complete */}
                  <View style={{ height: 24 }} />
                  <Bouncy style={[s.cancelBtn, { borderWidth: 1.5, borderColor: C.pink, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 16 }]} onPress={() => setShowDriverCancelModal(true)} disabled={loading}>
                    <Text style={[s.cancelTxt, { fontSize: 14, fontWeight: '700' }]}>✕ Cancel Trip</Text>
                  </Bouncy>
                </View>
              )}

              {/* Chat message alert */}
              {unreadChat > 0 && (
                <TouchableOpacity style={{ backgroundColor: C.pink, borderRadius: 12, padding: 12, marginTop: 10, alignItems: 'center' }} onPress={() => { setUnreadChat(0); setShowChat(true); }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>💬 Customer ne {unreadChat} message bheja</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {/* ── ACTIVE HOURLY RIDE ── */}
        {activeHourlyRide && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
            <View style={{ backgroundColor: C.pink, borderRadius: 16, padding: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>⏱️ HOURLY</Text></View>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>
                  {activeHourlyRide.status === 'matched' ? t('go_to_pickup_label') : activeHourlyRide.status === 'arrived' ? t('pickup_reached_otp_caps') : t('trip_ongoing_label')}
                </Text>
              </View>
              {activeHourlyRide.status === 'active' && (
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#fff', fontVariant: ['tabular-nums'] }}>
                  {String(Math.floor(hourlyTimerSec / 3600)).padStart(2, '0')}:{String(Math.floor((hourlyTimerSec % 3600) / 60)).padStart(2, '0')}:{String(hourlyTimerSec % 60).padStart(2, '0')}
                </Text>
              )}
            </View>

            {/* Customer + Chat/Call */}
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 14, elevation: 3, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: '#64748B' }}>
                    {activeHourlyRide.package_hours === 8 ? 'Full Day' : `${activeHourlyRide.package_hours}h`} · {activeHourlyRide.km_included} km · ₹{activeHourlyRide.base_fare}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={{ flex: 1, backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#BBF7D0' }} onPress={() => { setChatToast(null); setShowHourlyChat(true); setHourlyChatMsgs([]); }}>
                  <Ionicons name="chatbubble" size={20} color={C.green} />
                  <Text style={{ color: '#15803D', fontWeight: '700', fontSize: 14 }}>Chat</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#BFDBFE' }} onPress={callCustomer}>
                  <Ionicons name="call" size={20} color="#2563EB" />
                  <Text style={{ color: '#1D4ED8', fontWeight: '700', fontSize: 14 }}>Call</Text>
                </TouchableOpacity>
              </View>
              {chatToast && (
                <TouchableOpacity style={{ backgroundColor: '#1a1a2e', borderRadius: 12, padding: 12, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(233,30,99,0.5)', elevation: 6 }} onPress={() => { setChatToast(null); setShowHourlyChat(true); setHourlyChatMsgs([]); }}>
                  <Ionicons name="chatbubble" size={16} color={C.pink} />
                  <Text style={{ color: '#fff', fontSize: 13, flex: 1, fontWeight: '600' }} numberOfLines={1}>{chatToast}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>Tap to reply</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Route */}
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 13, color: C.green, fontWeight: '700', marginBottom: 6 }}>📍 {activeHourlyRide.pickup}</Text>
              {activeHourlyRide.drop_location && <Text style={{ fontSize: 13, color: C.pink, fontWeight: '700', marginTop: 4 }}>🎯 {activeHourlyRide.drop_location}</Text>}
            </View>

            {/* OTP section (matched or arrived) */}
            {(activeHourlyRide.status === 'matched' || activeHourlyRide.status === 'arrived') && (
              <View>
                {!hourlyArrived && activeHourlyRide.status !== 'arrived' ? (
                  <Bouncy
                    style={{ backgroundColor: C.green, borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginBottom: 12, elevation: 4, shadowColor: C.green, shadowOpacity: 0.35, shadowRadius: 10 }}
                    onPress={async () => {
                      try {
                        await fetch(`${API}/api/hourly/arrived`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: activeHourlyRide.id, driver_phone: phone }) });
                        setHourlyArrived(true);
                        setActiveHourlyRide((prev: any) => prev ? { ...prev, status: 'arrived' } : prev);
                      } catch (_e) { Alert.alert('Error', 'Network error'); }
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>{t('pickup_arrived_title')}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 3 }}>{t('customer_will_be_notified')}</Text>
                  </Bouncy>
                ) : (
                  <View style={{ backgroundColor: '#F0FDF4', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 12, borderWidth: 1.5, borderColor: '#86EFAC' }}>
                    <Text style={{ color: '#15803D', fontWeight: '800', fontSize: 14 }}>{t('customer_notified_start_trip')}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[s.navBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 0 }]}
                  onPress={() => setInNavMode(true)}
                >
                  <Ionicons name="navigate" size={20} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{t('pickup_navigate_btn')}</Text>
                </TouchableOpacity>
                <View style={{ height: 1, backgroundColor: '#E2E8F0', marginVertical: 20, marginHorizontal: 4 }} />
                <TouchableOpacity
                  onPress={() => Alert.alert('Cancel Ride?', "Can't reach the pickup point?", [
                    { text: 'No', style: 'cancel' },
                    { text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
                      try { const r = await fetch(`${API}/api/hourly/driver-cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: activeHourlyRide.id, driver_phone: phone }) }); const d = await r.json(); if (d.success) { setActiveHourlyRide(null); setResult('Ride cancelled.'); } else Alert.alert('Error', d.error || 'Cancel failed'); } catch (_e) { Alert.alert('Error', 'Network error'); }
                    }},
                  ])}
                  style={{ borderWidth: 1.5, borderColor: C.pink, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center', marginBottom: 20 }}
                >
                  <Text style={{ color: C.pink, fontWeight: '700', fontSize: 14 }}>{t('pickup_cant_reach_cancel')}</Text>
                </TouchableOpacity>
                <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, padding: 22, elevation: 4, borderWidth: 2, borderColor: C.green }}>
                  <Text style={{ fontSize: 14, color: '#0F172A', marginBottom: 16, textAlign: 'center', fontWeight: '700' }}>{t('ask_customer_otp_short')}</Text>
                  <TextInput
                    style={{ borderWidth: 2.5, borderColor: C.green, borderRadius: 14, paddingVertical: 18, paddingHorizontal: 16, fontSize: 34, textAlign: 'center', letterSpacing: 12, marginBottom: 18, fontWeight: 'bold', backgroundColor: '#F8FAFC', color: '#0F172A' }}
                    placeholder="0000" placeholderTextColor="#94A3B8" keyboardType="number-pad" maxLength={4} value={hourlyOtpInput} onChangeText={setHourlyOtpInput}
                  />
                  <Bouncy style={[s.tripBtn, { paddingVertical: 18 }]} onPress={startHourlyTrip} disabled={loading}>
                    <Text style={[s.tripBtnTxt, { fontSize: 17 }]}>{loading ? '...' : t('trip_verify_start')}</Text>
                  </Bouncy>
                </View>
              </View>
            )}

            {/* Active hourly trip controls */}
            {activeHourlyRide.status === 'active' && (
              <View>
                <View style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: 12, color: '#666' }}>📍 {liveKm.toFixed(1)} / {activeHourlyRide.km_included} km</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: liveKm / (activeHourlyRide.km_included || 1) > 0.9 ? C.pink : liveKm / (activeHourlyRide.km_included || 1) > 0.8 ? '#ff9800' : '#2e7d32' }}>
                      {Math.max(0, (activeHourlyRide.km_included || 0) - liveKm).toFixed(1)} km bache
                    </Text>
                  </View>
                  <View style={{ height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: liveKm / (activeHourlyRide.km_included || 1) > 0.9 ? C.pink : liveKm / (activeHourlyRide.km_included || 1) > 0.8 ? '#ff9800' : C.green, width: `${Math.min(100, (liveKm / (activeHourlyRide.km_included || 1)) * 100)}%` as any }} />
                  </View>
                  {(() => {
                    const totalSec = parseFloat(activeHourlyRide.package_hours || 0) * 3600;
                    const remSec = Math.max(0, totalSec - hourlyTimerSec);
                    const remTotalMin = Math.ceil(remSec / 60);
                    const remH = Math.floor(remTotalMin / 60);
                    const remM = remTotalMin % 60;
                    const remStr = remH > 0 ? `${remH}h ${remM > 0 ? remM + 'm' : ''}` : `${remTotalMin}m`;
                    if (activeHourlyRide.pending_customer_confirm) return (
                      <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 12, padding: 12, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
                        <Text style={{ fontWeight: 'bold', color: '#F59E0B' }}>⏳ Customer Confirmation Ka Intezaar...</Text>
                      </View>
                    );
                    if (hourlyTimerSec < 20 * 60) return (
                      <View style={{ backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
                        <Text style={{ color: '#94A3B8', fontWeight: '700' }}>🔒 Startup Lock: {Math.ceil(20 - hourlyTimerSec / 60)} min aur</Text>
                      </View>
                    );
                    if (remSec > 0) return (
                      <View style={{ backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(233,30,99,0.3)' }}>
                        <Text style={{ color: C.pink, fontWeight: '800', fontSize: 16 }}>⏰ {remStr} Baaki</Text>
                      </View>
                    );
                    return (
                      <Bouncy style={[s.tripBtn, { backgroundColor: C.green, paddingVertical: 20, marginBottom: 0 }]} onPress={completeHourlyTrip} disabled={loading}>
                        <Text style={[s.tripBtnTxt, { fontSize: 18 }]}>{loading ? '...' : t('trip_complete')}</Text>
                      </Bouncy>
                    );
                  })()}
                </View>
                {!!activeHourlyRide.extend_requested_hours && (() => {
                  const dec = parseFloat(activeHourlyRide.extend_requested_hours);
                  const hrs = Math.floor(dec);
                  const mins = Math.round((dec - hrs) * 60);
                  const extLabel = hrs > 0 && mins > 0 ? `${hrs}h ${mins}m` : hrs > 0 ? `${hrs}h` : `${mins} min`;
                  const escrow = parseFloat(activeHourlyRide.extend_escrow || 0);
                  return (
                    <View style={{ backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(233,30,99,0.3)' }}>
                      <Text style={{ fontWeight: 'bold', color: C.pink, marginBottom: 2 }}>📅 Customer +{extLabel} Extend Chahta Hai</Text>
                      {escrow > 0 && <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 10 }}>{tp('escrow_hold_hint', { amt: escrow.toFixed(0) })}</Text>}
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: escrow > 0 ? 0 : 10 }}>
                        <Bouncy style={{ flex: 1, backgroundColor: hExtendLoading ? '#334155' : C.green, borderRadius: 10, padding: 12, alignItems: 'center' }} onPress={acceptExtend} disabled={hExtendLoading}>
                          <Text style={{ color: '#fff', fontWeight: 'bold' }}>{hExtendLoading ? '⏳ ...' : '✅ Accept'}</Text>
                        </Bouncy>
                        <Bouncy style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }} onPress={rejectExtend} disabled={hExtendLoading}>
                          <Text style={{ color: '#94A3B8', fontWeight: 'bold' }}>✗ Reject</Text>
                        </Bouncy>
                      </View>
                    </View>
                  );
                })()}
              </View>
            )}
          </ScrollView>
        )}

        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
        {/* Pre-queue offer — live tab non-nav mode; NavOverlay handles nav mode */}
        {!inNavMode && preQueued && !preQueueAccepted && (
          <PreQueueCard
            preQueued={preQueued}
            phone={phone}
            onAccept={() => {
              fetch(`${API}/api/rides/pre-accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ride_id: preQueued.rideId, phone }) })
                .then(r => r.json())
                .then(d => { if (d.success) setPreQueueAccepted(true); else setResult('❌ ' + (d.error || 'Accept failed')); })
                .catch(() => setResult('❌ Network error'));
            }}
            onDecline={() => {
              fetch(`${API}/api/rides/pre-decline`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ride_id: preQueued.rideId, phone }) })
                .then(() => { setPreQueued(null); })
                .catch(() => setPreQueued(null));
            }}
          />
        )}
        {!inNavMode && preQueued && preQueueAccepted && (
          <View style={{ position: 'absolute', bottom: 90, left: 16, right: 16, zIndex: 999, backgroundColor: '#022C22', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#4ADE80', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 18 }}>✅</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#4ADE80', fontWeight: '900', fontSize: 13 }}>Next Ride Queued!</Text>
              <Text style={{ color: '#86EFAC', fontSize: 11, marginTop: 2 }}>{preQueued.pickup} · {preQueued.fare}</Text>
            </View>
          </View>
        )}
        {NavOverlay}
      </View>
    );
  }

  // ═══ DRIVER SUB-SCREENS (profile menu) ═══
  if (driverSubScreen !== '') {
    const back = () => setDrSubScreen('');
    const SubHeader = ({ title }: { title: string }) => (
      <View style={s.topBar}>
        <TouchableOpacity onPress={back} style={{ padding: 4 }}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
        <Text style={s.greeting}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>
    );

    const DRIVER_CATS = [
      { key: 'abusive_customer', icon: '😡', label: 'Abusive\nCustomer',      priority: 'urgent' },
      { key: 'customer_no_show', icon: '🚷', label: 'Customer\nNo-Show',      priority: 'high'   },
      { key: 'payment_refused',  icon: '💸', label: 'Payment\nRefused',       priority: 'high'   },
      { key: 'false_accusation', icon: '⚠️',  label: 'False\nAccusation',     priority: 'high'   },
      { key: 'vehicle_damage',   icon: '🔧', label: 'Vehicle\nDamage',        priority: 'high'   },
      { key: 'wrong_location',   icon: '📍', label: 'Wrong\nLocation',        priority: 'normal' },
      { key: 'earnings_issue',   icon: '💰', label: 'Earnings /\nCommission', priority: 'normal' },
      { key: 'app_gps_issue',    icon: '📱', label: 'App / GPS\nIssue',       priority: 'normal' },
      { key: 'driver_other',     icon: '📝', label: 'Other',                  priority: 'low'    },
    ];
    const DPX: Record<string, string> = { urgent: '#EF4444', high: '#F59E0B', normal: '#3B82F6', low: '#94A3B8' };
    const DSX: Record<string, string> = { open: '#F59E0B', in_progress: '#3B82F6', resolved: '#059669' };
    const DSL: Record<string, string> = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' };
    const DSLA: Record<string, number> = { urgent: 4, high: 24, normal: 48, low: 72 };
    const dfmt = (iso: string) => { try { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };
    const dago = (iso: string) => { const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000); if (m < 1) return 'just now'; if (m < 60) return `${m}m`; const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`; };
    const dCat   = DRIVER_CATS.find(c => c.key === driverTicketCategory);
    const canSub = !!driverTicketCategory && driverTicketDesc.trim().length >= 10 && !driverTicketSubmitting;
    const doSubmitTicket = async () => {
      if (!canSub) return;
      setDriverTicketSubmitting(true);
      try {
        const rideLinkedCats = ['payment_refused','abusive_customer','customer_no_show','vehicle_damage','false_accusation','wrong_location'];
        const linkedRideId = rideLinkedCats.includes(driverTicketCategory) && paymentRideId ? paymentRideId : undefined;
        const r = await fetch(`${API}/api/support/tickets`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, role: 'driver', category: driverTicketCategory, description: driverTicketDesc.trim(), ...(linkedRideId ? { ride_id: linkedRideId } : {}) }),
        });
        const d = await r.json();
        if (d.error) { Alert.alert('Error', d.error); return; }
        setDriverTicketSuccess(d);
      } catch { Alert.alert('Error', 'Could not submit.'); }
      finally { setDriverTicketSubmitting(false); }
    };

    if (driverSubScreen === 'documents') return (
      <View style={s.screen}>
        <SubHeader title="📋 Documents" />
        <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Verification status */}
          <View style={{ backgroundColor: driverInfo?.status === 'approved' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', borderRadius: 16, padding: 18, marginBottom: 16, alignItems: 'center', elevation: 2, borderWidth: 1, borderColor: driverInfo?.status === 'approved' ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)' }}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>{driverInfo?.status === 'approved' ? '✅' : '⏳'}</Text>
            <Text style={{ fontSize: 16, fontWeight: '900', color: driverInfo?.status === 'approved' ? C.green : '#F59E0B' }}>
              {driverInfo?.status === 'approved' ? 'Verified Driver' : 'Verification Pending'}
            </Text>
            <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 4, textAlign: 'center' }}>
              {driverInfo?.status === 'approved'
                ? t('reg_all_docs_verified')
                : t('docs_in_review')}
            </Text>
          </View>

          {/* Driver face photo */}
          {driverInfo?.face_photo && (
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 10 }}>📸 Profile Photo</Text>
              <Image source={{ uri: driverInfo.face_photo }} style={{ width: '100%', height: 180, borderRadius: 12 }} resizeMode="cover" />
            </View>
          )}

          {/* Document IDs */}
          <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 12 }}>📄 Document Details</Text>
            {[
              ['DL Number', driverInfo?.dl_number || '—'],
              ['Aadhaar', driverInfo?.aadhaar_masked || '—'],
            ].map(([k, v], i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: i < 1 ? 1 : 0, borderBottomColor: '#334155' }}>
                <Text style={{ fontSize: 13, color: '#94A3B8' }}>{k}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{v}</Text>
              </View>
            ))}
          </View>

          {/* Vehicle details */}
          <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 12 }}>🚗 Vehicle Info</Text>
            {[
              ['Type', (driverInfo?.vehicle_type || '—').replace('_', ' ').toUpperCase()],
              ['Vehicle No', driverInfo?.vehicle_no || '—'],
              ['Brand', driverInfo?.vehicle_brand || '—'],
              ['Model', driverInfo?.vehicle_model || '—'],
            ].map(([k, v], i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: i < 3 ? 1 : 0, borderBottomColor: '#334155' }}>
                <Text style={{ fontSize: 13, color: '#94A3B8' }}>{k}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{v}</Text>
              </View>
            ))}
          </View>

          <View style={{ backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(233,30,99,0.25)' }}>
            <Text style={{ fontSize: 13, color: C.pink, fontWeight: '600', marginBottom: 4 }}>{t('update_docs_title')}</Text>
            <Text style={{ fontSize: 12, color: '#94A3B8' }}>{t('contact_support_reregister')}</Text>
            <TouchableOpacity onPress={() => { back(); setDrSubScreen('support'); }}
              style={{ backgroundColor: C.pink, borderRadius: 10, padding: 10, alignItems: 'center', marginTop: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Contact Support</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        <BottomNav activeTab={activeTab} setActiveTab={(tab: string) => { back(); setActiveTab(tab); }} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
      </View>
    );

    if (driverSubScreen === 'bank') {
      const hasSaved = bankLoaded && !!bankAccount;
      const showForm = !hasSaved || bankEditing;
      return (
      <View style={s.screen}>
        <SubHeader title="🏦 Bank Details" />
        <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
            <Text style={{ fontSize: 13, color: '#F59E0B', fontWeight: '700' }}>ℹ️ Payout Information</Text>
            <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
              {t('bank_payout_info')}
            </Text>
          </View>

          {!showForm ? (
            /* ── Confirmed view ── */
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 18, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 22, marginRight: 10 }}>✅</Text>
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#0F172A' }}>Bank Account Confirmed</Text>
              </View>
              {[
                ['Account Holder', bankHolder || '—'],
                ['Account Number', bankAccount ? '••••' + bankAccount.slice(-4) : '—'],
                ['IFSC Code', bankIfsc || '—'],
              ].map(([label, val], i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: i < 2 ? 1 : 0, borderBottomColor: '#334155' }}>
                  <Text style={{ fontSize: 13, color: '#94A3B8' }}>{label}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{val}</Text>
                </View>
              ))}
              <TouchableOpacity onPress={() => { setBankMsg(''); setBankEditing(true); }}
                style={{ backgroundColor: C.green, borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 18 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>✏️ Edit Bank Details</Text>
              </TouchableOpacity>
              {bankMsg ? <Text style={{ textAlign: 'center', marginTop: 10, fontSize: 13, color: C.green }}>{bankMsg}</Text> : null}
            </View>
          ) : (
            /* ── Editable form ── */
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 18, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 16 }}>Bank Account Details</Text>

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#94A3B8', marginBottom: 6 }}>Account Holder Name</Text>
              <TextInput
                style={{ borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#0F172A', marginBottom: 14, backgroundColor: '#FFFFFF' }}
                placeholder={t('full_name_ph')}
                placeholderTextColor="#475569"
                value={bankHolder}
                onChangeText={setBankHolder}
              />

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#94A3B8', marginBottom: 6 }}>Account Number</Text>
              <TextInput
                style={{ borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#0F172A', marginBottom: 14, backgroundColor: '#FFFFFF' }}
                placeholder="1234567890"
                placeholderTextColor="#475569"
                keyboardType="numeric"
                value={bankAccount}
                onChangeText={setBankAccount}
              />

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#94A3B8', marginBottom: 6 }}>IFSC Code</Text>
              <TextInput
                style={{ borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#0F172A', marginBottom: 20, backgroundColor: '#FFFFFF' }}
                placeholder="SBIN0001234"
                placeholderTextColor="#475569"
                autoCapitalize="characters"
                value={bankIfsc}
                onChangeText={v => setBankIfsc(v.toUpperCase())}
              />

              <TouchableOpacity onPress={saveBank} disabled={bankSaving}
                style={{ backgroundColor: bankSaving ? '#334155' : C.green, borderRadius: 12, padding: 14, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{bankSaving ? 'Saving...' : '💾 Save Bank Details'}</Text>
              </TouchableOpacity>
              {hasSaved && (
                <TouchableOpacity onPress={() => { setBankMsg(''); setBankEditing(false); }}
                  style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 10 }}>
                  <Text style={{ color: '#94A3B8', fontWeight: '700', fontSize: 14 }}>Cancel</Text>
                </TouchableOpacity>
              )}
              {bankMsg ? <Text style={{ textAlign: 'center', marginTop: 10, fontSize: 13, color: bankMsg.startsWith('✅') ? C.green : C.pink }}>{bankMsg}</Text> : null}
            </View>
          )}
        </ScrollView>
        <BottomNav activeTab={activeTab} setActiveTab={(tab: string) => { back(); setActiveTab(tab); }} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
      </View>
      );
    }

    if (driverSubScreen === 'support') return (
      <View style={s.screen}>
        <SubHeader title="📞 Support" />
        <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={{ backgroundColor: '#F8FAFC', borderRadius: 20, padding: 20, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>🎧</Text>
            <Text style={{ color: '#0F172A', fontSize: 17, fontWeight: '900' }}>Sppero Driver Support</Text>
            <Text style={{ color: '#64748B', fontSize: 12, marginTop: 4, textAlign: 'center' }}>{t('support_contact_247')}</Text>
          </View>
          {[
            { icon: '🎫', label: t('ticket_new_label'), sub: t('ticket_new_sub'), color: C.pink, action: () => { setDriverTicketCategory(''); setDriverTicketDesc(''); setDriverTicketSuccess(null); setDrSubScreen('ticket-new'); } },
            { icon: '📋', label: t('ticket_list_label'), sub: t('ticket_list_sub'), color: '#3B82F6', action: () => { setDriverActiveTicket(null); setDriverTicketDetail(null); setDriverTickets([]); setDriverTicketsLoading(true); setDrSubScreen('ticket-list'); fetch(`${API}/api/support/tickets?phone=${encodeURIComponent(phone)}&role=driver`).then(r => r.json()).then(d => setDriverTickets(d.tickets || [])).catch(() => {}).finally(() => setDriverTicketsLoading(false)); } },
            { icon: '💬', label: 'WhatsApp', sub: t('whatsapp_fast_sub'), color: '#25D366', action: () => Linking.openURL('https://wa.me/919999999999?text=Hi%20Sppero%20Driver%20Support') },
            { icon: '📞', label: 'Helpline Call', sub: '24x7 available', color: '#3B82F6', action: () => Linking.openURL('tel:9999999999') },
            { icon: '📧', label: 'Email Support', sub: 'Response in 24 hrs', color: C.pink, action: () => Linking.openURL('mailto:driver.support@sppero.com') },
          ].map((item, i) => (
            <TouchableOpacity key={i} onPress={item.action}
              style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 18, marginBottom: 12, flexDirection: 'row', alignItems: 'center', elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: item.color + '22', alignItems: 'center', justifyContent: 'center', marginRight: 16, borderWidth: 1.5, borderColor: item.color + '55' }}>
                <Text style={{ fontSize: 24 }}>{item.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#0F172A' }}>{item.label}</Text>
                <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{item.sub}</Text>
              </View>
              <Text style={{ fontSize: 20, color: '#475569' }}>›</Text>
            </TouchableOpacity>
          ))}
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 8, marginBottom: 10 }}>Common Issues</Text>
          {[
            [t('faq_payment_q'), t('faq_payment_a')],
            [t('faq_suspend_q'), t('faq_suspend_a')],
            [t('faq_rating_q'), t('faq_rating_a')],
            [t('faq_commission_q'), t('faq_commission_a')],
          ].map(([q, a], i) => (
            <View key={i} style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 16, marginBottom: 10, elevation: 1, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#CBD5E1', marginBottom: 6 }}>❓ {q}</Text>
              <Text style={{ fontSize: 12, color: '#94A3B8', lineHeight: 18 }}>{a}</Text>
            </View>
          ))}
        </ScrollView>
        <BottomNav activeTab={activeTab} setActiveTab={(tab: string) => { back(); setActiveTab(tab); }} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
      </View>
    );

    if (driverSubScreen === 'ticket-new') {
      if (driverTicketSuccess) return (
        <View style={s.screen}>
          <View style={s.topBar}>
            <TouchableOpacity onPress={() => setDrSubScreen('support')} style={{ padding: 4 }}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
            <Text style={s.greeting}>Ticket Filed</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 24, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 52, marginBottom: 16 }}>✅</Text>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 8 }}>{t('ticket_submitted')}</Text>
              <View style={{ backgroundColor: '#FFF1F5', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, marginBottom: 16, borderWidth: 1, borderColor: '#FFB3C8' }}>
                <Text style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: '900', color: C.pink, letterSpacing: 1 }}>{driverTicketSuccess.ticket_no}</Text>
              </View>
              <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
                {tp('ticket_reply_sla', { h: String(driverTicketSuccess.sla_hours) })}
              </Text>
              <TouchableOpacity
                onPress={() => { setDriverActiveTicket(null); setDriverTicketDetail(null); setDriverTickets([]); setDriverTicketsLoading(true); setDrSubScreen('ticket-list'); fetch(`${API}/api/support/tickets?phone=${encodeURIComponent(phone)}&role=driver`).then(r => r.json()).then(d => setDriverTickets(d.tickets || [])).catch(() => {}).finally(() => setDriverTicketsLoading(false)); }}
                style={{ backgroundColor: C.pink, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>{t('view_my_tickets_btn')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setDrSubScreen('support')} style={{ paddingVertical: 10 }}>
                <Text style={{ color: '#64748B', fontWeight: '700', fontSize: 13 }}>{t('back_to_support_btn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <BottomNav activeTab={activeTab} setActiveTab={(tab: string) => { back(); setActiveTab(tab); }} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
        </View>
      );
      return (
        <View style={s.screen}>
          <View style={s.topBar}>
            <TouchableOpacity onPress={() => setDrSubScreen('support')} style={{ padding: 4 }}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
            <Text style={s.greeting}>🎫 {t('ticket_new_label')}</Text>
            <View style={{ width: 40 }} />
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748B', letterSpacing: 1.2, marginBottom: 12 }}>{t('select_issue_type')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                {DRIVER_CATS.map(cat => {
                  const isSel = driverTicketCategory === cat.key;
                  return (
                    <TouchableOpacity key={cat.key} onPress={() => setDriverTicketCategory(cat.key)}
                      style={{ width: '30%', minWidth: 100, flexGrow: 1, backgroundColor: isSel ? '#FFF1F5' : '#F8FAFC', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', borderWidth: 1.5, borderColor: isSel ? C.pink : '#E2E8F0' }}>
                      <Text style={{ fontSize: 24, marginBottom: 6 }}>{cat.icon}</Text>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: isSel ? C.pink : '#0F172A', textAlign: 'center', lineHeight: 15 }}>{cat.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {dCat && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, backgroundColor: DPX[dCat.priority] + '15', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: DPX[dCat.priority] + '44' }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: DPX[dCat.priority], marginRight: 8 }} />
                  <Text style={{ fontSize: 12, color: DPX[dCat.priority], fontWeight: '800' }}>{dCat.priority.toUpperCase()} PRIORITY</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginLeft: 8 }}>{tp('reply_within_h', { h: String(DSLA[dCat.priority]) })}</Text>
                </View>
              )}
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748B', letterSpacing: 1.2, marginBottom: 10 }}>{t('describe_issue_label')}</Text>
              <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1.5, borderColor: '#E2E8F0', marginBottom: 8 }}>
                <TextInput
                  value={driverTicketDesc}
                  onChangeText={setDriverTicketDesc}
                  placeholder={t('ticket_desc_placeholder')}
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                  style={{ padding: 14, fontSize: 14, color: '#0F172A', minHeight: 120 }}
                />
              </View>
              <Text style={{ fontSize: 11, color: driverTicketDesc.length < 10 ? '#94A3B8' : '#059669', fontWeight: '700', textAlign: 'right', marginBottom: 20 }}>
                {driverTicketDesc.length} chars {driverTicketDesc.length < 10 ? tp('more_needed_suffix', { n: String(10 - driverTicketDesc.length) }) : '✓'}
              </Text>
              <TouchableOpacity onPress={doSubmitTicket} disabled={!canSub}
                style={{ backgroundColor: canSub ? C.pink : '#E2E8F0', borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}>
                {driverTicketSubmitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: canSub ? '#fff' : '#94A3B8', fontWeight: '900', fontSize: 16 }}>{t('submit_ticket_btn')}</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
          <BottomNav activeTab={activeTab} setActiveTab={(tab: string) => { back(); setActiveTab(tab); }} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
        </View>
      );
    }

    if (driverSubScreen === 'ticket-list') {
      const sendDReply = async () => {
        if (!driverTicketReply.trim() || !driverActiveTicket || driverTicketReplying) return;
        setDriverTicketReplying(true);
        try {
          await fetch(`${API}/api/support/tickets/${driverActiveTicket.id}/reply`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, message: driverTicketReply.trim() }),
          });
          setDriverTicketReply('');
          const r = await fetch(`${API}/api/support/tickets/${driverActiveTicket.id}?phone=${encodeURIComponent(phone)}`);
          const d = await r.json();
          setDriverTicketDetail(d);
        } catch { Alert.alert('Error', 'Could not send reply.'); }
        finally { setDriverTicketReplying(false); }
      };

      if (driverActiveTicket) {
        const ticket   = driverTicketDetail?.ticket   ?? driverActiveTicket;
        const messages = driverTicketDetail?.messages ?? [];
        return (
          <View style={s.screen}>
            <View style={s.topBar}>
              <TouchableOpacity onPress={() => { setDriverActiveTicket(null); setDriverTicketDetail(null); }} style={{ padding: 4 }}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
              <Text style={s.greeting} numberOfLines={1}>{driverActiveTicket.ticket_no || 'Ticket'}</Text>
              <TouchableOpacity onPress={() => { setDriverTicketDetailLoading(true); fetch(`${API}/api/support/tickets/${driverActiveTicket.id}?phone=${encodeURIComponent(phone)}`).then(r => r.json()).then(d => setDriverTicketDetail(d)).catch(() => {}).finally(() => setDriverTicketDetailLoading(false)); }} style={{ padding: 4 }}><Ionicons name="refresh" size={20} color="#fff" /></TouchableOpacity>
            </View>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 8 }}>
                <View style={{ backgroundColor: '#F8FAFC', borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
                    <Text style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: '800', color: C.pink }}>{ticket.ticket_no}</Text>
                    <View style={{ backgroundColor: DSX[ticket.status] + '20', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 10, fontWeight: '900', color: DSX[ticket.status] }}>{DSL[ticket.status] || ticket.status}</Text>
                    </View>
                    <View style={{ backgroundColor: DPX[ticket.priority] + '20', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 10, fontWeight: '900', color: DPX[ticket.priority] }}>{(ticket.priority || '').toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: '#0F172A', marginBottom: 4 }}>{ticket.title}</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', lineHeight: 18 }}>{ticket.description}</Text>
                  <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>{dfmt(ticket.created_at)}</Text>
                  {ticket.status === 'resolved' && ticket.resolution_note && (
                    <View style={{ marginTop: 12, backgroundColor: 'rgba(5,150,105,0.08)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(5,150,105,0.25)' }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#059669', marginBottom: 4 }}>RESOLVED</Text>
                      <Text style={{ fontSize: 12, color: '#0F172A', lineHeight: 18 }}>{ticket.resolution_note}</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748B', letterSpacing: 1.2, marginBottom: 12 }}>MESSAGES</Text>
                {driverTicketDetailLoading && <ActivityIndicator color={C.pink} style={{ paddingVertical: 20 }} />}
                {messages.map((msg: any, i: number) => {
                  const isUser = msg.sender === 'user';
                  const isSys  = msg.sender === 'system';
                  if (isSys) return (
                    <View key={i} style={{ alignItems: 'center', marginBottom: 12 }}>
                      <Text style={{ fontSize: 11, color: '#94A3B8', backgroundColor: '#F1F5F9', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 }}>{msg.message}</Text>
                    </View>
                  );
                  return (
                    <View key={i} style={{ marginBottom: 12, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                      <View style={{ maxWidth: '80%', backgroundColor: isUser ? '#FFF1F5' : '#F8FAFC', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: isUser ? '#FFB3C8' : '#E2E8F0' }}>
                        {!isUser && <Text style={{ fontSize: 10, fontWeight: '800', color: C.pink, marginBottom: 4 }}>Support Team</Text>}
                        <Text style={{ fontSize: 13, color: '#0F172A', lineHeight: 19 }}>{msg.message}</Text>
                        <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 4, textAlign: isUser ? 'right' : 'left' }}>{dago(msg.created_at)}</Text>
                      </View>
                    </View>
                  );
                })}
                {messages.length === 0 && !driverTicketDetailLoading && (
                  <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', paddingVertical: 10 }}>{t('no_messages_yet')}</Text>
                )}
              </ScrollView>
              {ticket.status !== 'resolved'
                ? (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                    <TextInput
                      value={driverTicketReply}
                      onChangeText={setDriverTicketReply}
                      placeholder={t('chat_msg_placeholder')}
                      placeholderTextColor="#94A3B8"
                      multiline
                      style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#0F172A', maxHeight: 100, borderWidth: 1, borderColor: '#E2E8F0' }}
                    />
                    <TouchableOpacity onPress={sendDReply} disabled={!driverTicketReply.trim() || driverTicketReplying}
                      style={{ backgroundColor: driverTicketReply.trim() ? C.pink : '#E2E8F0', borderRadius: 14, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                      {driverTicketReplying ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ padding: 12, backgroundColor: 'rgba(5,150,105,0.06)', borderTopWidth: 1, borderTopColor: 'rgba(5,150,105,0.2)', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: '#059669', fontWeight: '700' }}>{t('ticket_resolved_msg')}</Text>
                  </View>
                )
              }
            </KeyboardAvoidingView>
            <BottomNav activeTab={activeTab} setActiveTab={(tab: string) => { back(); setActiveTab(tab); }} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
          </View>
        );
      }

      return (
        <View style={s.screen}>
          <View style={s.topBar}>
            <TouchableOpacity onPress={() => setDrSubScreen('support')} style={{ padding: 4 }}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
            <Text style={s.greeting}>📋 {t('ticket_list_label')}</Text>
            <TouchableOpacity
              onPress={() => { setDriverTickets([]); setDriverTicketsLoading(true); fetch(`${API}/api/support/tickets?phone=${encodeURIComponent(phone)}&role=driver`).then(r => r.json()).then(d => setDriverTickets(d.tickets || [])).catch(() => {}).finally(() => setDriverTicketsLoading(false)); }}
              style={{ padding: 4 }}>
              <Ionicons name="refresh" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          {driverTicketsLoading
            ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color={C.pink} />
                <Text style={{ color: '#64748B', marginTop: 12, fontSize: 13 }}>{t('loading_label')}</Text>
              </View>
            )
            : driverTickets.length === 0
              ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                  <Text style={{ fontSize: 52, marginBottom: 16 }}>🎫</Text>
                  <Text style={{ fontSize: 17, fontWeight: '900', color: '#0F172A', marginBottom: 8 }}>{t('no_tickets')}</Text>
                  <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
                    {t('no_ticket_help')}
                  </Text>
                  <TouchableOpacity
                    onPress={() => { setDriverTicketCategory(''); setDriverTicketDesc(''); setDriverTicketSuccess(null); setDrSubScreen('ticket-new'); }}
                    style={{ backgroundColor: C.pink, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 }}>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>{t('ticket_new_label')}</Text>
                  </TouchableOpacity>
                </View>
              )
              : (
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                  {driverTickets.map((t: any) => {
                    const unread = parseInt(t.unread_replies) || 0;
                    return (
                      <TouchableOpacity key={t.id}
                        onPress={async () => {
                          setDriverActiveTicket(t);
                          setDriverTicketDetailLoading(true);
                          setDriverTicketDetail(null);
                          try {
                            const r = await fetch(`${API}/api/support/tickets/${t.id}?phone=${encodeURIComponent(phone)}`);
                            const d = await r.json();
                            setDriverTicketDetail(d);
                          } catch {}
                          finally { setDriverTicketDetailLoading(false); }
                        }}
                        style={{ backgroundColor: '#F8FAFC', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: unread > 0 ? C.pink : '#E2E8F0', elevation: unread > 0 ? 3 : 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
                            <Text style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: '800', color: C.pink }}>{t.ticket_no || `#${t.id}`}</Text>
                            <View style={{ backgroundColor: DSX[t.status] + '20', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 }}>
                              <Text style={{ fontSize: 10, fontWeight: '900', color: DSX[t.status] }}>{DSL[t.status] || t.status}</Text>
                            </View>
                            <View style={{ backgroundColor: DPX[t.priority] + '20', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 }}>
                              <Text style={{ fontSize: 10, fontWeight: '900', color: DPX[t.priority] }}>{(t.priority || '').toUpperCase()}</Text>
                            </View>
                          </View>
                          {unread > 0 && (
                            <View style={{ backgroundColor: C.pink, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>{unread} new</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 4 }}>{t.title}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 11, color: '#64748B' }}>{dfmt(t.created_at)}</Text>
                          {t.status === 'resolved'
                            ? <Text style={{ fontSize: 11, color: '#059669', fontWeight: '700' }}>Resolved ✓</Text>
                            : <Text style={{ fontSize: 20, color: '#475569' }}>›</Text>
                          }
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )
          }
          <BottomNav activeTab={activeTab} setActiveTab={(tab: string) => { back(); setActiveTab(tab); }} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
        </View>
      );
    }

    // ─── Driver: Subscription ───
    if (driverSubScreen === 'subscription') {
      const activeSub = driverSub?.active;
      const queuedSub = driverSub?.queued;
      const catLabel: any = { bike: '🏍️ Bike', auto: '🛺 Auto', car: '🚗 Car' };
      const pct = activeSub ? Math.round((activeSub.rides_used / activeSub.rides_total) * 100) : 0;

      const doSubscribe = async () => {
        if (!subSelectedPlan) return;
        setSubLoading(true); setSubResult('');
        try {
          const RazorpayCheckout = require('react-native-razorpay').default;
          const orderRes = await fetch(`${API}/api/subscriptions/create-order`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, plan_id: subSelectedPlan.id }),
          }).then(r => r.json());
          if (!orderRes.success) { setSubResult('❌ ' + (orderRes.error || 'Order failed')); setSubLoading(false); return; }

          const rzpOptions = {
            description: subSelectedPlan.name,
            currency: 'INR',
            key: orderRes.key_id,
            amount: orderRes.amount,
            name: 'Sppero Subscription',
            order_id: orderRes.order_id,
            prefill: { contact: phone, name: driverInfo?.name || 'Driver' },
            theme: { color: '#22C55E' },
          };

          const paymentData: any = await new Promise((resolve, reject) => {
            RazorpayCheckout.open(rzpOptions).then(resolve).catch(reject);
          });

          const verRes = await fetch(`${API}/api/subscriptions/verify`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone,
              razorpay_order_id: paymentData.razorpay_order_id,
              razorpay_payment_id: paymentData.razorpay_payment_id,
              razorpay_signature: paymentData.razorpay_signature,
            }),
          }).then(r => r.json());

          if (verRes.success) {
            setSubResult(verRes.status === 'queued'
              ? '✅ Plan queued! It will start once your current plan ends.'
              : '🎉 Subscription active! You now get 0% commission.');
            setSubSelectedPlan(null);
            loadDriverSub(phone, driverInfo?.vehicle_type);
          } else { setSubResult('❌ ' + (verRes.error || 'Verification failed')); }
        } catch (e: any) {
          if (e?.code === 'PAYMENT_CANCELLED' || e?.error?.reason === 'payment_cancelled') {
            setSubResult('');  // user cancelled — no error needed
          } else {
            const rzp = e?.error || e;
            const desc = typeof rzp?.description === 'string' && rzp.description !== 'undefined' ? rzp.description : null;
            const reason = rzp?.reason || rzp?.code;
            let msg = 'Payment could not be completed. Please try again.';
            if (desc) msg = desc;
            else if (reason === 'payment_error') msg = 'Payment failed from your bank or card. Try a different card or UPI.';
            else if (reason === 'BAD_REQUEST_ERROR') msg = 'Something went wrong with the payment request. Please contact support.';
            setSubResult('❌ ' + msg);
          }
        }
        setSubLoading(false);
      };

      return (
        <View style={s.screen}>
          <SubHeader title="🎯 Subscription" />
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

            {/* Active plan card */}
            {activeSub ? (
              <View style={{ backgroundColor: '#022c22', borderRadius: 18, padding: 18, marginBottom: 16, borderWidth: 1.5, borderColor: '#22C55E' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ color: '#22C55E', fontSize: 13, fontWeight: '800' }}>{catLabel[activeSub.vehicle_category] || activeSub.vehicle_category} · {activeSub.plan_name}</Text>
                  <View style={{ backgroundColor: '#22C55E', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 }}>
                    <Text style={{ color: '#022c22', fontSize: 11, fontWeight: '800' }}>ACTIVE</Text>
                  </View>
                </View>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, height: 8, marginBottom: 6 }}>
                  <View style={{ backgroundColor: '#22C55E', borderRadius: 8, height: 8, width: pct + '%' as any }} />
                </View>
                <Text style={{ color: '#86EFAC', fontSize: 12, marginBottom: 2 }}>
                  {activeSub.rides_used} used · {activeSub.rides_remaining} remaining out of {activeSub.rides_total}
                </Text>
                <Text style={{ color: '#6EE7B7', fontSize: 11, marginBottom: 10 }}>
                  Expires: {new Date(activeSub.expires_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(34,197,94,0.3)', paddingTop: 10 }}>
                  <Text style={{ color: '#A7F3D0', fontSize: 12 }}>💰 Commission Saved</Text>
                  <Text style={{ color: '#22C55E', fontSize: 18, fontWeight: '900' }}>₹{parseFloat(driverSub?.total_savings || 0).toFixed(0)}</Text>
                </View>
              </View>
            ) : (
              <View style={{ backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)', alignItems: 'center' }}>
                <Text style={{ color: '#22C55E', fontSize: 14, fontWeight: '700' }}>{t('no_active_plan')}</Text>
                <Text style={{ color: '#64748B', fontSize: 12, marginTop: 4 }}>{t('choose_plan_hint')}</Text>
              </View>
            )}

            {/* Queued plan */}
            {queuedSub && (
              <View style={{ backgroundColor: '#fefce8', borderRadius: 14, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#fde68a', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 20 }}>⏳</Text>
                <View>
                  <Text style={{ color: '#78350F', fontSize: 12, fontWeight: '700' }}>Next Plan Queued</Text>
                  <Text style={{ color: '#92400E', fontSize: 11 }}>{queuedSub.plan_name} · {queuedSub.rides_total} rides</Text>
                </View>
              </View>
            )}

            {/* Plan selection */}
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 12 }}>
              {activeSub ? t('next_plan_choose') : t('plan_choose')}
            </Text>

            {subPlans.length === 0 ? (
              <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>{t('plans_loading')}</Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                {subPlans.map((p: any) => {
                  const selected = subSelectedPlan?.id === p.id;
                  const isDaily = (p.validity_days === 1 || p.validity_days === '1');
                  if (isDaily) {
                    return (
                      <Bouncy key={p.id} onPress={() => setSubSelectedPlan(selected ? null : p)} style={{ width: '100%' }}>
                        <View style={{ borderRadius: 16, padding: 16, borderWidth: 2, borderColor: selected ? '#F59E0B' : '#FCD34D', backgroundColor: selected ? '#78350F' : '#1C0A00', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <View style={{ backgroundColor: '#F59E0B', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                                <Text style={{ color: '#000', fontSize: 10, fontWeight: '900' }}>⚡ DAILY TRIAL</Text>
                              </View>
                            </View>
                            <Text style={{ color: '#FCD34D', fontSize: 13, fontWeight: '800' }}>{tp('daily_rides_today_only', { n: String(p.ride_count) })}</Text>
                            <Text style={{ color: '#94A3B8', fontSize: 11, marginTop: 2 }}>{t('use_within_1_day')}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '900', lineHeight: 32 }}>₹{parseFloat(p.price).toFixed(0)}</Text>
                            {p.original_price && <Text style={{ color: '#94A3B8', fontSize: 12, textDecorationLine: 'line-through' }}>₹{parseFloat(p.original_price).toFixed(0)}</Text>}
                            {selected && <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '800', marginTop: 4 }}>✓ Selected</Text>}
                          </View>
                        </View>
                      </Bouncy>
                    );
                  }
                  return (
                    <Bouncy key={p.id} onPress={() => setSubSelectedPlan(selected ? null : p)} style={{ flex: 1, minWidth: 130 }}>
                      <View style={{ borderRadius: 14, padding: 14, borderWidth: 2, borderColor: selected ? '#22C55E' : '#E2E8F0', backgroundColor: selected ? '#F0FDF4' : '#fff', alignItems: 'center' }}>
                        <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>{p.ride_count} RIDES</Text>
                        <Text style={{ color: '#0F172A', fontSize: 24, fontWeight: '900' }}>₹{parseFloat(p.price).toFixed(0)}</Text>
                        {p.original_price && <Text style={{ color: '#94A3B8', fontSize: 11, textDecorationLine: 'line-through' }}>₹{parseFloat(p.original_price).toFixed(0)}</Text>}
                        <Text style={{ color: '#64748B', fontSize: 10, marginTop: 4 }}>{tp('days_valid_dynamic', { n: String(p.validity_days || 60) })}</Text>
                        {selected && <Text style={{ color: '#22C55E', fontSize: 11, fontWeight: '700', marginTop: 4 }}>✓ Selected</Text>}
                      </View>
                    </Bouncy>
                  );
                })}
              </View>
            )}

            {/* Subscribe button */}
            {subSelectedPlan && (
              <Bouncy onPress={doSubscribe} disabled={subLoading}
                style={{
                  backgroundColor: subLoading
                    ? ((subSelectedPlan.validity_days == 1) ? '#D97706' : '#86EFAC')
                    : ((subSelectedPlan.validity_days == 1) ? '#F59E0B' : '#22C55E'),
                  borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 12,
                }}>
                <Text style={{ color: (subSelectedPlan.validity_days == 1) ? '#000' : '#fff', fontSize: 16, fontWeight: '900' }}>
                  {subLoading ? '⏳ Processing...' : (subSelectedPlan.validity_days == 1
                    ? `⚡ Try Today → Pay ₹${parseFloat(subSelectedPlan.price).toFixed(0)}`
                    : `Subscribe → Pay ₹${parseFloat(subSelectedPlan.price).toFixed(0)}`)}
                </Text>
                {(subSelectedPlan.validity_days == 1) && !subLoading &&
                  <Text style={{ color: '#78350F', fontSize: 11, marginTop: 2 }}>{t('today_only_expires')}</Text>}
              </Bouncy>
            )}

            {subResult ? <Text style={{ textAlign: 'center', fontSize: 13, color: subResult.startsWith('❌') ? '#EF4444' : '#22C55E', marginBottom: 12, fontWeight: '600' }}>{subResult}</Text> : null}

            {/* Terms */}
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 }}>Terms & Conditions</Text>
              {[
                '✅ ' + tp('terms_use_within', { period: subSelectedPlan && (subSelectedPlan.validity_days === 1 || subSelectedPlan.validity_days === '1') ? t('period_1_day') : t('period_60_days') }),
                '✅ ' + t('terms_zero_commission'),
                '✅ ' + t('terms_bonus_incentives'),
                '❌ ' + t('terms_no_refund'),
                '💡 ' + t('terms_gst_included'),
                '📌 ' + t('terms_queue_plan'),
              ].map((term, i) => <Text key={i} style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>{term}</Text>)}
            </View>
          </ScrollView>
        </View>
      );
    }

    // ─── Driver: All Orders ───
    if (driverSubScreen === 'orders') {
      const PT = Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 44;
      const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const fmtPeriodLabel = (period: 'day'|'week'|'month', date: Date): string => {
        if (period === 'day') return `${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
        if (period === 'week') {
          const dow = date.getDay();
          const mon = new Date(date); mon.setDate(date.getDate() - (dow === 0 ? 6 : dow - 1));
          const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
          return `${DAYS[mon.getDay()]} ${mon.getDate()} ${MONTHS[mon.getMonth()]} – ${DAYS[sun.getDay()]} ${sun.getDate()} ${MONTHS[sun.getMonth()]}`;
        }
        return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
      };
      const navDate = (dir: 1|-1) => {
        const d = new Date(ordersDate);
        if (ordersPeriod === 'day') d.setDate(d.getDate() + dir);
        else if (ordersPeriod === 'week') d.setDate(d.getDate() + dir * 7);
        else d.setMonth(d.getMonth() + dir);
        setOrdersDate(d);
        loadOrders(ordersPeriod, d);
      };
      const switchPeriod = (p: 'day'|'week'|'month') => {
        setOrdersPeriod(p);
        loadOrders(p, ordersDate);
      };
      const vehIcon: Record<string,string> = { auto:'🛺', bike:'🏍️', car:'🚗', eriksha:'🛺', luxury:'🚙', green_bike:'🏍️', electric_auto:'⚡' };
      const visibleRides = (ordersData?.rides || []).filter((r: any) =>
        ordersFilter === 'all' || r.status === ordersFilter
      );
      const isToday = (d: Date) => {
        const t = new Date(); return d.getFullYear()===t.getFullYear()&&d.getMonth()===t.getMonth()&&d.getDate()===t.getDate();
      };
      return (
        <View style={[s.screen, { backgroundColor: '#F1F5F9' }]}>
          {/* Header */}
          <View style={{ backgroundColor: '#fff', paddingTop: PT + 10, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', elevation: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <TouchableOpacity onPress={back} style={{ padding: 4, marginRight: 10 }}>
                <Ionicons name="arrow-back" size={22} color="#0F172A" />
              </TouchableOpacity>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#0F172A', flex: 1 }}>All Orders</Text>
            </View>

            {/* Period tabs */}
            <View style={{ flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 3, marginBottom: 12 }}>
              {(['day','week','month'] as const).map(p => (
                <TouchableOpacity key={p} onPress={() => switchPeriod(p)}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                    backgroundColor: ordersPeriod === p ? '#0F172A' : 'transparent' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: ordersPeriod === p ? '#fff' : '#64748B', textTransform: 'capitalize' }}>{p.charAt(0).toUpperCase()+p.slice(1)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Date navigation */}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={() => navDate(-1)} style={{ padding: 8, borderRadius: 8, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Ionicons name="chevron-back" size={18} color="#475569" />
              </TouchableOpacity>
              <Text style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                {fmtPeriodLabel(ordersPeriod, ordersDate)}
                {ordersPeriod === 'day' && isToday(ordersDate) ? '  (Today)' : ''}
              </Text>
              <TouchableOpacity onPress={() => navDate(1)} style={{ padding: 8, borderRadius: 8, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Ionicons name="chevron-forward" size={18} color="#475569" />
              </TouchableOpacity>
            </View>
          </View>

          {ordersLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="large" color={C.green} />
              <Text style={{ color: '#64748B', marginTop: 12, fontSize: 13 }}>Loading orders...</Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              {/* Summary row */}
              {ordersData && (
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                  <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', elevation: 1 }}>
                    <Text style={{ color: C.green, fontSize: 22, fontWeight: '900' }}>{ordersData.summary?.completed ?? 0}</Text>
                    <Text style={{ color: '#64748B', fontSize: 11, marginTop: 3 }}>Completed</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', elevation: 1 }}>
                    <Text style={{ color: C.pink, fontSize: 22, fontWeight: '900' }}>{ordersData.summary?.cancelled ?? 0}</Text>
                    <Text style={{ color: '#64748B', fontSize: 11, marginTop: 3 }}>Cancelled</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', elevation: 1 }}>
                    <Text style={{ color: '#0F172A', fontSize: 22, fontWeight: '900' }}>₹{ordersData.summary?.earnings ?? 0}</Text>
                    <Text style={{ color: '#64748B', fontSize: 11, marginTop: 3 }}>Earned</Text>
                  </View>
                </View>
              )}

              {/* Status filter tabs */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
                {(['all','completed','cancelled'] as const).map(f => (
                  <TouchableOpacity key={f} onPress={() => setOrdersFilter(f)}
                    style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5,
                      backgroundColor: ordersFilter === f ? (f==='completed'?C.green:f==='cancelled'?C.pink:'#0F172A') : '#fff',
                      borderColor: ordersFilter === f ? (f==='completed'?C.green:f==='cancelled'?C.pink:'#0F172A') : '#E2E8F0' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700',
                      color: ordersFilter === f ? '#fff' : '#475569' }}>
                      {f === 'all' ? 'All' : f === 'completed' ? '✓ Completed' : '✗ Cancelled'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Ride cards */}
              {visibleRides.length === 0 ? (
                <View style={{ alignItems: 'center', paddingTop: 60 }}>
                  <Text style={{ fontSize: 48 }}>📭</Text>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A', marginTop: 16 }}>No orders found</Text>
                  <Text style={{ fontSize: 13, color: '#94A3B8', marginTop: 6, textAlign: 'center' }}>
                    {ordersFilter === 'all' ? 'No rides for this period' : `No ${ordersFilter} rides`}
                  </Text>
                </View>
              ) : visibleRides.map((r: any, i: number) => {
                const time = new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                const cancelLabel = r.cancelled_by === 'customer' ? 'Customer Cancelled' : r.cancelled_by === 'driver' ? 'You Cancelled' : 'Cancelled';
                const isCompleted = r.status === 'completed';
                const dotColor = isCompleted ? C.green : C.pink;
                const shortPickup = (r.pickup || '').split(',')[0] || r.pickup || '—';
                return (
                  <View key={r.id || i} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0', borderLeftWidth: 4, borderLeftColor: isCompleted ? C.green : C.pink }}>
                    {/* Top row: vehicle + time + fare */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: isCompleted ? 'rgba(5,150,105,0.1)' : 'rgba(255,45,120,0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                        <Text style={{ fontSize: 18 }}>{vehIcon[r.ride_type] || '🚗'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>
                          {(r.ride_type || 'Ride').replace('_', ' ').toUpperCase()}
                          <Text style={{ fontSize: 11, fontWeight: '400', color: '#94A3B8' }}>  ·  {time}</Text>
                        </Text>
                        <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>{r.passenger_name || 'Customer'} · {r.payment_method || 'cash'}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 16, fontWeight: '900', color: isCompleted ? C.green : '#94A3B8' }}>
                          ₹{parseFloat(r.fare || 0).toFixed(0)}
                        </Text>
                        <View style={{ backgroundColor: isCompleted ? 'rgba(5,150,105,0.1)' : 'rgba(255,45,120,0.1)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 3 }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: dotColor, letterSpacing: 0.5 }}>
                            {isCompleted ? 'COMPLETED' : 'CANCELLED'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Timeline */}
                    <View style={{ paddingLeft: 6 }}>
                      {/* Accepted */}
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#3B82F6', marginTop: 3, marginRight: 10 }} />
                        <Text style={{ fontSize: 12, color: '#475569', flex: 1 }} numberOfLines={1}>
                          Accepted · {shortPickup}
                        </Text>
                      </View>
                      {/* Vertical connector */}
                      <View style={{ width: 1.5, height: 12, backgroundColor: '#E2E8F0', marginLeft: 4.25, marginBottom: 4 }} />
                      {/* End state */}
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor, marginTop: 3, marginRight: 10 }} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: dotColor, flex: 1 }}>
                          {isCompleted ? 'Completed · ' + ((r.drop_location||'').split(',')[0] || r.drop_location || '—') : cancelLabel}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
          <BottomNav activeTab={activeTab} setActiveTab={(tab: string) => { back(); setActiveTab(tab); }} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
        </View>
      );
    }


    if (driverSubScreen === 'settings') {
      return (
        <View style={s.screen}>
          <SubHeader title="⚙️ Settings" />
          <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ paddingBottom: 40 }}>

            {/* ── Language ── */}
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, elevation: 2, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 14 }}>{t('settings_lang')}</Text>
              <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>{t('settings_lang_sub')}</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => changeLang('hi')}
                  style={{ flex: 1, borderRadius: 14, borderWidth: 2, borderColor: lang === 'hi' ? C.pink : '#E2E8F0', backgroundColor: lang === 'hi' ? 'rgba(233,30,99,0.07)' : '#fff', paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, marginBottom: 4 }}>🇮🇳</Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: lang === 'hi' ? C.pink : '#64748B' }}>{t('lang_hi_label')}</Text>
                  {lang === 'hi' && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.pink, marginTop: 6 }} />}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => changeLang('en')}
                  style={{ flex: 1, borderRadius: 14, borderWidth: 2, borderColor: lang === 'en' ? C.pink : '#E2E8F0', backgroundColor: lang === 'en' ? 'rgba(233,30,99,0.07)' : '#fff', paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, marginBottom: 4 }}>🇬🇧</Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: lang === 'en' ? C.pink : '#64748B' }}>{t('lang_en_label')}</Text>
                  {lang === 'en' && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.pink, marginTop: 6 }} />}
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, elevation: 2, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 16 }}>{t('settings_notif_section')}</Text>
              {[
                { label: t('settings_ride_notif'), sub: t('settings_ride_nsub'), key: 'notif_rides' },
                { label: t('settings_wallet_notif'), sub: t('settings_wallet_nsub'), key: 'notif_wallet' },
                { label: t('settings_promo_notif'), sub: t('settings_promo_nsub'), key: 'notif_promo' },
              ].map((item, i) => (
                <View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: i < 2 ? 1 : 0, borderBottomColor: '#334155' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#CBD5E1' }}>{item.label}</Text>
                    <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{item.sub}</Text>
                  </View>
                  <Switch value={true} onValueChange={() => Alert.alert('Notifications', 'Manage notification settings from OS:\nSettings → Apps → Sppero Buddy → Notifications')} trackColor={{ false: '#334155', true: C.green }} thumbColor="#fff" />
                </View>
              ))}
            </View>

            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, elevation: 2, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 16 }}>{t('settings_app_section')}</Text>
              {[
                ['App Version', '1.0.0'],
                ['Driver ID', phone ? `DRV-${phone.slice(-4)}` : '—'],
                ['Platform', 'Android'],
              ].map(([k, v], i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: i < 2 ? 1 : 0, borderBottomColor: '#334155' }}>
                  <Text style={{ fontSize: 13, color: '#94A3B8' }}>{k}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{v}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              onPress={() => Alert.alert('Cache', 'App cache cleared!')}
              style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 1, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 18, marginRight: 12 }}>🗑️</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#CBD5E1' }}>{t('settings_cache')}</Text>
                <Text style={{ fontSize: 11, color: '#64748B' }}>{t('settings_cache_sub')}</Text>
              </View>
              <Text style={{ fontSize: 18, color: '#475569' }}>›</Text>
            </TouchableOpacity>
          </ScrollView>
          <BottomNav activeTab={activeTab} setActiveTab={(tab: string) => { back(); setActiveTab(tab); }} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
        </View>
      );
    }

    if (driverSubScreen === 'fare-rates') {
      const VEHICLE_META: Record<string, { icon: string; label: string }> = {
        bike:          { icon: '🏍️', label: 'Bike' },
        auto:          { icon: '🛺',  label: 'Auto' },
        car:           { icon: '🚕',  label: 'Car' },
        eriksha:       { icon: '🛵',  label: 'E-Riksha' },
        green_bike:    { icon: '⚡',  label: 'Green Bike' },
        electric_auto: { icon: '🌿',  label: 'Electric Auto' },
        luxury:        { icon: '🚙',  label: 'Ultra Luxury' },
      };
      const VEHICLE_ORDER = ['bike', 'auto', 'car', 'eriksha', 'green_bike', 'electric_auto', 'luxury'];
      const faresMap: Record<string, any> = {};
      for (const row of drFares) faresMap[row.vehicle_type] = row;

      return (
        <View style={s.screen}>
          <SubHeader title="💰 Fare Rates" />
          {drFaresLoading && drFares.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={C.pink} size="large" />
            </View>
          ) : (
            <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={{ backgroundColor: 'rgba(16,185,129,0.10)', borderRadius: 10, padding: 10, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' }}>
                <Text style={{ fontSize: 14 }}>✅</Text>
                <Text style={{ flex: 1, fontSize: 11, color: C.green }}>Live rates — updates automatically when admin makes changes</Text>
              </View>

              {VEHICLE_ORDER.map(vt => {
                const f = faresMap[vt];
                const meta = VEHICLE_META[vt];
                if (!f || !meta) return null;
                const r1 = parseFloat(f.per_km_rate || 0).toFixed(1);
                const r2 = f.per_km_rate_t2 != null ? parseFloat(f.per_km_rate_t2).toFixed(1) : r1;
                const r3 = f.per_km_rate_t3 != null ? parseFloat(f.per_km_rate_t3).toFixed(1) : r2;
                const tiered = r2 !== r1 || r3 !== r2;
                const cr  = parseFloat(f.commission_rate || 15);
                const hcr = f.hourly_commission_rate != null ? parseFloat(f.hourly_commission_rate) : null;
                return (
                  <View key={vt} style={{ backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 14, overflow: 'hidden', elevation: 2 }}>
                    {/* Header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingBottom: 12, backgroundColor: '#0F172A' }}>
                      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)' }}>
                        <Text style={{ fontSize: 24 }}>{meta.icon}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>{meta.label}</Text>
                        <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>Min fare: ₹{parseFloat(f.min_fare || 0).toFixed(0)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 20, fontWeight: '900', color: C.green }}>₹{parseFloat(f.base_fare).toFixed(0)}</Text>
                        <Text style={{ fontSize: 10, color: '#94A3B8' }}>base fare</Text>
                      </View>
                    </View>

                    {/* Body */}
                    <View style={{ padding: 14, paddingTop: 12 }}>
                      {/* Per KM */}
                      <View style={{ backgroundColor: '#EFF6FF', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#BFDBFE' }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 1, marginBottom: 8 }}>PER KM RATE</Text>
                        {tiered ? (
                          <>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ fontSize: 12, color: '#64748B' }}>0 – 8 km</Text>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>₹{r1}/km</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ fontSize: 12, color: '#64748B' }}>8 – 20 km</Text>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>₹{r2}/km</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={{ fontSize: 12, color: '#64748B' }}>20 km +</Text>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>₹{r3}/km</Text>
                            </View>
                          </>
                        ) : (
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 12, color: '#64748B' }}>All distances</Text>
                            <Text style={{ fontSize: 14, fontWeight: '900', color: '#0F172A' }}>₹{r1}/km</Text>
                          </View>
                        )}
                      </View>

                      {/* Quick stats row */}
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                        <View style={{ flex: 1, backgroundColor: '#F0FDF4', borderRadius: 8, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: '#BBF7D0' }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: C.green }}>₹{parseFloat(f.time_rate || 0).toFixed(1)}</Text>
                          <Text style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>per min</Text>
                        </View>
                        <View style={{ flex: 1, backgroundColor: '#FFF7ED', borderRadius: 8, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: '#FED7AA' }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: '#EA580C' }}>₹{parseFloat(f.platform_fee || 2).toFixed(0)}</Text>
                          <Text style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>booking fee</Text>
                        </View>
                        {f.night_multiplier > 1 && (
                          <View style={{ flex: 1, backgroundColor: '#EDE9FE', borderRadius: 8, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: '#DDD6FE' }}>
                            <Text style={{ fontSize: 14, fontWeight: '800', color: '#7C3AED' }}>{parseFloat(f.night_multiplier).toFixed(1)}×</Text>
                            <Text style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>🌙 night</Text>
                          </View>
                        )}
                      </View>

                      {/* Commission */}
                      <View style={{ backgroundColor: 'rgba(255,45,120,0.06)', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: 'rgba(255,45,120,0.18)' }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 1, marginBottom: 8 }}>PLATFORM COMMISSION (deducted from your earnings)</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: hcr != null ? 6 : 0 }}>
                          <Text style={{ fontSize: 12, color: '#64748B' }}>Standard rides</Text>
                          <Text style={{ fontSize: 14, fontWeight: '900', color: C.pink }}>{cr}%</Text>
                        </View>
                        {hcr != null && (
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 12, color: '#64748B' }}>Hourly bookings</Text>
                            <Text style={{ fontSize: 14, fontWeight: '900', color: C.pink }}>{hcr}%</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
          <BottomNav activeTab={activeTab} setActiveTab={(tab: string) => { back(); setActiveTab(tab); }} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
        </View>
      );
    }

    return null;
  }

  // ═══ EARNINGS TAB ═══
  if (activeTab === 'earnings') {
    const fmtDate = (d: string) => { try { return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return d; } };
    return (
    <View style={s.screen}>
      {/* Dark header */}
      <View style={{ backgroundColor: '#FFFFFF', paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 14 : 52, paddingBottom: 20, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ color: '#0F172A', fontSize: 20, fontWeight: '800', flex: 1 }}>💰 Wallet & Earnings</Text>
          <TouchableOpacity onPress={() => loadDriverWallet(phone)} style={{ padding: 8, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
            <Text style={{ fontSize: 16 }}>⟳</Text>
          </TouchableOpacity>
        </View>
        {/* 3-stat grid */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
            <Text style={{ color: C.green, fontSize: 22, fontWeight: '900' }}>₹{parseFloat(driverWallet.balance || 0).toFixed(0)}</Text>
            <Text style={{ color: '#64748B', fontSize: 10, marginTop: 3, textAlign: 'center' }}>Wallet Balance</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
            <Text style={{ color: '#FFD700', fontSize: 22, fontWeight: '900' }}>₹{parseFloat(driverWallet.total_earned || 0).toFixed(0)}</Text>
            <Text style={{ color: '#64748B', fontSize: 10, marginTop: 3, textAlign: 'center' }}>Life Earned</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
            <CountUp value={earnings} style={{ color: C.pink, fontSize: 22, fontWeight: '900' }} />
            <Text style={{ color: '#64748B', fontSize: 10, marginTop: 3, textAlign: 'center' }}>Aaj Ki Kamai</Text>
          </View>
        </View>
      </View>

      {(rideReq || hourlyRideReq) && (
        <TouchableOpacity style={s.notifBanner} onPress={() => setActiveTab('live')}>
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>{hourlyRideReq ? '⏱️ Hourly Ride!' : '🔔 Nayi Ride!'} ₹{(rideReq || hourlyRideReq)?.fare || hourlyRideReq?.base_fare}</Text>
          <Text style={{ color: '#fff', fontSize: 13 }}>Dekho →</Text>
        </TouchableOpacity>
      )}

      {/* Fuel Log button */}
      <TouchableOpacity onPress={() => setShowFuelLog(true)} style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: 'rgba(239,68,68,0.08)', marginHorizontal: 14, marginBottom: 6,
        borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
      }}>
        <Text style={{ fontSize: 18 }}>⛽</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>Fuel Log</Text>
          <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>Net kamai = Gross − Fuel</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
      </TouchableOpacity>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', margin: 14, marginTop: 6, gap: 6 }}>
        {(['summary', 'rides', 'hourly', 'commission'] as const).map(t => (
          <TouchableOpacity key={t} onPress={() => setWalletEarningsTab(t)}
            style={{ flex: 1, borderRadius: 20, paddingVertical: 8, alignItems: 'center', backgroundColor: walletEarningsTab === t ? C.green : '#F8FAFC', position: 'relative', borderWidth: 1, borderColor: walletEarningsTab === t ? C.green : '#E2E8F0' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: walletEarningsTab === t ? '#fff' : '#64748B' }}>
              {t === 'summary' ? 'Summary' : t === 'rides' ? 'Rides' : t === 'hourly' ? 'Hourly' : 'Commission'}
            </Text>
            {t === 'commission' && commissionData.pending_commission > 0 && (
              <View style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: 4, backgroundColor: '#e65100' }} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 14 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>

        {walletEarningsTab === 'summary' && (<>
          {!walletLoaded ? (
            <View style={[s.earningsCard, { gap: 14 }]}>
              {[1,2,3,4,5].map(i => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
                  <SkeletonBox width={140} height={13} radius={6} />
                  <SkeletonBox width={60} height={13} radius={6} />
                </View>
              ))}
            </View>
          ) : (() => {
            const todayStr = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
            const todayRides = driverRideHistory.filter((r: any) => {
              try { return new Date(r.created_at).toISOString().slice(0, 10) === todayStr; } catch { return false; }
            });
            const todayHourly = driverHourlyHistory.filter((h: any) => {
              try { return new Date(h.created_at).toISOString().slice(0, 10) === todayStr; } catch { return false; }
            });
            const todayCount = todayRides.length + todayHourly.length;
            const todayNet = todayRides.reduce((s: number, r: any) => s + (parseFloat(r.fare || 0) - parseFloat(r.commission_amount || 0)), 0)
              + todayHourly.reduce((s: number, h: any) => s + parseFloat(h.driver_earning || h.base_fare || 0), 0);
            const avgNet = todayCount ? (todayNet / todayCount) : 0;
            return (
              <View style={s.earningsCard}>
                <Row k="Total Rides (All Time)" v={(driverRideHistory.length + driverHourlyHistory.length).toString()} />
                <Row k="Aaj Ke Rides" v={todayCount.toString()} />
                <Row k="Avg Per Ride (Aaj)" v={'₹' + avgNet.toFixed(0)} />
                <Row k="Aaj Ki Net Kamai" v={'₹' + todayNet.toFixed(0)} bold last />
              </View>
            );
          })()}
          {/* ── 7-Day Earnings Chart ── */}
          {earningsAnalytics?.days7 && (() => {
            const days = earningsAnalytics.days7 || [];
            const maxEarned = Math.max(...days.map((d: any) => d.earned), 1);
            const thisW = earningsAnalytics.this_week ?? { earned: 0, rides: 0 };
            const lastW = earningsAnalytics.last_week ?? { earned: 0, rides: 0 };
            const weekChange = lastW.earned > 0 ? Math.round(((thisW.earned - lastW.earned) / lastW.earned) * 100) : null;
            const topHours = (earningsAnalytics.top_hours || []).map((h: number) => {
              const ampm = h < 12 ? 'AM' : 'PM';
              return `${h % 12 || 12}${ampm}`;
            });
            return (
              <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 14, elevation: 3, shadowColor: C.green, shadowOpacity: 0.1, shadowRadius: 10, borderWidth: 1, borderColor: 'rgba(16,185,129,0.15)' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                  <Text style={{ fontSize: 16, marginRight: 8 }}>📈</Text>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#0F172A', flex: 1 }}>7-Day Earnings</Text>
                  {weekChange !== null && (
                    <View style={{ backgroundColor: weekChange >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: weekChange >= 0 ? C.green : '#EF4444' }}>
                        {weekChange >= 0 ? '↑' : '↓'} {Math.abs(weekChange)}% vs last week
                      </Text>
                    </View>
                  )}
                </View>

                {/* Bar chart */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 4, marginBottom: 6 }}>
                  {days.map((d: any, i: number) => {
                    const barH = Math.max(4, Math.round((d.earned / maxEarned) * 76));
                    const isToday = i === days.length - 1;
                    return (
                      <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                        {d.earned > 0 && (
                          <Text style={{ fontSize: 8, color: '#64748B', fontWeight: '700' }}>₹{d.earned >= 1000 ? (d.earned / 1000).toFixed(1) + 'k' : d.earned}</Text>
                        )}
                        <View style={{
                          width: '100%', height: barH, borderRadius: 5,
                          backgroundColor: isToday ? C.green : d.earned === 0 ? '#F1F5F9' : 'rgba(16,185,129,0.4)',
                        }} />
                        <Text style={{ fontSize: 8, color: isToday ? C.green : '#94A3B8', fontWeight: isToday ? '800' : '500' }}>{d.label}</Text>
                      </View>
                    );
                  })}
                </View>

                {/* This week vs last week */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, color: '#94A3B8', fontWeight: '700' }}>IS HAFTE</Text>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: C.green, marginTop: 4 }}>₹{thisW.earned}</Text>
                    <Text style={{ fontSize: 10, color: '#64748B' }}>{thisW.rides} rides</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, color: '#94A3B8', fontWeight: '700' }}>PICHLA HAFTE</Text>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: '#64748B', marginTop: 4 }}>₹{lastW.earned}</Text>
                    <Text style={{ fontSize: 10, color: '#64748B' }}>{lastW.rides} rides</Text>
                  </View>
                </View>

                {/* Best earning hours */}
                {topHours.length > 0 && (
                  <View style={{ backgroundColor: 'rgba(16,185,129,0.06)', borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 14 }}>⏰</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#0F172A' }}>Best Earning Hours</Text>
                      <Text style={{ fontSize: 11, color: C.green, marginTop: 2 }}>{topHours.join(' · ')}</Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })()}

          <View style={{ backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' }}>
            <Text style={{ fontSize: 13, color: C.green, fontWeight: '700', marginBottom: 4 }}>💡 Commission Structure</Text>
            <Text style={{ fontSize: 12, color: '#6EE7B7', lineHeight: 18 }}>Standard rides: 15% platform fee{'\n'}Hourly rides: 12% platform fee{'\n'}Early end: dono ki agreement zaroori — proportional payment</Text>
          </View>
          {/* Pending Commission Card — redesigned */}
          {commissionData.pending_commission > 0 && (
            <View style={{ borderRadius: 22, marginBottom: 16, overflow: 'hidden', elevation: 8, shadowColor: C.pink, shadowOpacity: 0.22, shadowRadius: 14 }}>
              {/* Gradient header */}
              <View style={{ backgroundColor: C.pink, padding: 18, paddingBottom: 22 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>SPPERO · COMMISSION DUE</Text>
                  </View>
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', marginBottom: 4 }}>{t('cash_platform_fee')}</Text>
                <Text style={{ color: '#fff', fontSize: 44, fontWeight: '900', letterSpacing: -1 }}>
                  ₹{commissionData.pending_commission.toFixed(0)}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 4 }}>
                  {commissionData.pending_commission >= 300 ? t('commission_block_warn') : t('commission_clear_hint')}
                </Text>
              </View>

              {/* White body */}
              <View style={{ backgroundColor: '#fff', padding: 16 }}>
                {/* Info row */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                  {[
                    { icon: '⚡', text: t('auto_deduct_hint') },
                    { icon: '📱', text: 'UPI · GPay\nPhonePe · Paytm' },
                    { icon: '✅', text: t('pay_unblock_btn') },
                  ].map((item, i) => (
                    <View key={i} style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 12, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#E2E8F0' }}>
                      <Text style={{ fontSize: 20 }}>{item.icon}</Text>
                      <Text style={{ color: '#475569', fontSize: 9, fontWeight: '700', textAlign: 'center', lineHeight: 13 }}>{item.text}</Text>
                    </View>
                  ))}
                </View>

                {/* Pay button */}
                <TouchableOpacity
                  disabled={commPayLoading}
                  onPress={async () => {
                    setCommPayLoading(true); setCommResult('');
                    try {
                      const r = await fetch(`${API}/api/driver/commission-pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
                      const d = await r.json();
                      if (!d.success) { setCommResult('❌ ' + (d.message || d.error || 'Error')); setCommPayLoading(false); return; }
                      if (!RazorpayCheckout) { Alert.alert('Error', 'Payment module failed to load. Please restart the app.'); setCommPayLoading(false); return; }
                      RazorpayCheckout.open({
                        key: d.key_id, amount: d.amount, currency: d.currency || 'INR', order_id: d.order_id,
                        name: 'Sppero', description: 'Platform Commission Payment', prefill: { contact: phone }, theme: { color: C.pink },
                      }).then(async (payment: any) => {
                        const vr = await fetch(`${API}/api/driver/commission-pay-verify`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ phone, razorpay_order_id: payment.razorpay_order_id, razorpay_payment_id: payment.razorpay_payment_id, razorpay_signature: payment.razorpay_signature }),
                        });
                        const vd = await vr.json();
                        if (vd.success) { setCommResult('✅ Commission cleared! New rides are now available.'); loadCommissionHistory(phone); }
                        else setCommResult('❌ Payment verification failed — please contact support');
                        setCommPayLoading(false);
                      }).catch((e: any) => {
                        const desc = String(e?.description || e?.error?.description || '').toLowerCase();
                        const cancelled = e?.code === 0 || e?.code === 'PAYMENT_CANCELLED' || desc.includes('cancel');
                        setCommResult(cancelled ? '🚫 Payment cancelled — you can try again' : '❌ Payment failed — please try again');
                        setCommPayLoading(false);
                      });
                    } catch (_e) { Alert.alert('Error', 'Could not connect to server'); setCommPayLoading(false); }
                  }}
                  style={{
                    backgroundColor: commPayLoading ? '#94A3B8' : C.pink,
                    borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10,
                    elevation: commPayLoading ? 0 : 6, shadowColor: C.pink, shadowOpacity: 0.4, shadowRadius: 10,
                  }}
                >
                  <Text style={{ fontSize: 20 }}>{commPayLoading ? '⏳' : '📱'}</Text>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>
                    {commPayLoading ? t('opening_payment') : tp('pay_via_upi_card', { amount: commissionData.pending_commission.toFixed(0) })}
                  </Text>
                </TouchableOpacity>

                {commResult ? (
                  <View style={{
                    marginTop: 10, borderRadius: 12, padding: 12, borderWidth: 1,
                    backgroundColor: commResult.includes('✅') ? '#F0FDF4' : commResult.includes('🚫') ? '#FFFBEB' : '#FFF5F5',
                    borderColor:     commResult.includes('✅') ? '#BBF7D0' : commResult.includes('🚫') ? '#FDE68A' : '#FCA5A5',
                  }}>
                    <Text style={{ color: commResult.includes('✅') ? '#15803D' : commResult.includes('🚫') ? '#92400E' : '#DC2626', fontSize: 13, fontWeight: '700', textAlign: 'center' }}>{commResult}</Text>
                    {commResult.includes('🚫') && (
                      <Text style={{ color: '#92400E', fontSize: 11, textAlign: 'center', marginTop: 4, opacity: 0.8 }}>{t('retry_below_upi')}</Text>
                    )}
                  </View>
                ) : null}
              </View>
            </View>
          )}

          {/* Payout */}
          <View style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 16, elevation: 2, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 12 }}>💸 Payout Request</Text>
            <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 10 }}>Available: ₹{parseFloat(driverWallet.balance || 0).toFixed(0)} · Min ₹100</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput
                style={{ flex: 1, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: '#0F172A', backgroundColor: '#FFFFFF' }}
                placeholder="Enter amount (₹)"
                keyboardType="numeric"
                value={payoutInput}
                onChangeText={setPayoutInput}
                placeholderTextColor="#475569"
              />
              <TouchableOpacity onPress={requestPayout}
                style={{ backgroundColor: payoutLoading ? '#334155' : C.green, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Request</Text>
              </TouchableOpacity>
            </View>
            {result ? <Text style={{ color: result.includes('✅') ? C.green : C.pink, marginTop: 8, fontWeight: '600' }}>{result}</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
            {[100, 200, 500, 1000].map(a => (
              <TouchableOpacity key={a} onPress={() => setPayoutInput(a.toString())}
                style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ color: '#CBD5E1', fontWeight: '700', fontSize: 13 }}>₹{a}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── How Hourly Works ── */}
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginTop: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800', marginBottom: 10 }}>ℹ️ Hourly / Daily Booking — Rules</Text>
            {[
              ['⏱️ Package', '2h/4h/6h/Full Day / 1 Day / 2 Day / 3 Day available'],
              ['💰 Commission', '12% hourly (vs 15% standard rides)'],
              ['🛡️ Min Guarantee', 'Early end? Minimum 70% guaranteed'],
              ['📍 KM Included', t('package_km_fixed_desc')],
              ['🔐 OTP Start', t('otp_start_hourly_desc')],
              ['✅ Complete', t('complete_km_desc')],
              ['💳 Payment', t('hourly_payment_desc')],
            ].map(([icon, text], i) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: 8 }}>
                <Text style={{ color: C.pink, fontSize: 12, fontWeight: '700', width: 90 }}>{icon}</Text>
                <Text style={{ color: '#ccc', fontSize: 11, flex: 1, lineHeight: 16 }}>{text}</Text>
              </View>
            ))}
          </View>
        </>)}

        {walletEarningsTab === 'rides' && (<>
          {!walletLoaded ? (
            [1,2,3,4].map(i => <SkeletonRideCard key={i} />)
          ) : driverRideHistory.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Text style={{ fontSize: 36 }}>🛺</Text>
              <Text style={{ color: '#475569', marginTop: 10 }}>{t('no_completed_rides')}</Text>
            </View>
          ) : driverRideHistory.map((r: any, i: number) => (
            <View key={r.id || i} style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, marginBottom: 8, elevation: 1, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{r.passenger_name || 'Passenger'}</Text>
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{fmtDate(r.created_at)} · {r.payment_method}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: C.green, fontSize: 16, fontWeight: '800' }}>₹{parseFloat(r.fare || 0).toFixed(0)}</Text>
                  <Text style={{ color: '#475569', fontSize: 10 }}>Net: ₹{(parseFloat(r.fare || 0) - parseFloat(r.commission_amount || 0)).toFixed(0)}</Text>
                </View>
              </View>
            </View>
          ))}
        </>)}

        {walletEarningsTab === 'hourly' && (<>
          {!walletLoaded ? (
            [1,2,3].map(i => <SkeletonHourlyCard key={i} />)
          ) : driverHourlyHistory.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Text style={{ fontSize: 36 }}>⏱️</Text>
              <Text style={{ color: '#475569', marginTop: 10 }}>{t('no_hourly_rides')}</Text>
            </View>
          ) : driverHourlyHistory.map((h: any, i: number) => (
            <View key={h.id || i} style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, marginBottom: 8, elevation: 1, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{h.vehicle_type} · {h.package_hours}h Package</Text>
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{h.customer_phone} · {fmtDate(h.created_at)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: C.green, fontSize: 16, fontWeight: '800' }}>₹{parseFloat(h.driver_earning || h.base_fare || 0).toFixed(0)}</Text>
                  <Text style={{ color: '#475569', fontSize: 10 }}>Base: ₹{parseFloat(h.base_fare || 0).toFixed(0)}</Text>
                </View>
              </View>
            </View>
          ))}
        </>)}

        {walletEarningsTab === 'commission' && (<>
          {/* Commission Overview */}
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
            <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '800', marginBottom: 12 }}>Commission Overview</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ color: C.pink, fontSize: 18, fontWeight: '900' }}>₹{commissionData.pending_commission.toFixed(0)}</Text>
                <Text style={{ color: '#64748B', fontSize: 10, marginTop: 3, textAlign: 'center' }}>Pending</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ color: C.green, fontSize: 18, fontWeight: '900' }}>₹{commissionData.settled_commission.toFixed(0)}</Text>
                <Text style={{ color: '#64748B', fontSize: 10, marginTop: 3, textAlign: 'center' }}>Paid / Settled</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ color: '#FFD700', fontSize: 18, fontWeight: '900' }}>₹{commissionData.total_commission.toFixed(0)}</Text>
                <Text style={{ color: '#64748B', fontSize: 10, marginTop: 3, textAlign: 'center' }}>Total</Text>
              </View>
            </View>
          </View>

          {/* Pay button if pending */}
          {commissionData.pending_commission > 0 && (
            <TouchableOpacity
              disabled={commPayLoading}
              onPress={async () => {
                setCommPayLoading(true); setCommResult('');
                try {
                  const r = await fetch(`${API}/api/driver/commission-pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
                  const d = await r.json();
                  if (!d.success) { setCommResult('❌ ' + (d.message || d.error || 'Error')); setCommPayLoading(false); return; }
                  if (!RazorpayCheckout) { Alert.alert('Error', 'Payment module failed to load. Please restart the app.'); setCommPayLoading(false); return; }
                  RazorpayCheckout.open({
                    key: d.key_id, amount: d.amount, currency: d.currency || 'INR', order_id: d.order_id,
                    name: 'Sppero', description: 'Platform Commission Payment', prefill: { contact: phone }, theme: { color: '#e65100' },
                  }).then(async (payment: any) => {
                    const vr = await fetch(`${API}/api/driver/commission-pay-verify`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ phone, razorpay_order_id: payment.razorpay_order_id, razorpay_payment_id: payment.razorpay_payment_id, razorpay_signature: payment.razorpay_signature }),
                    });
                    const vd = await vr.json();
                    if (vd.success) { setCommResult('✅ Commission paid! Rides are now available.'); loadCommissionHistory(phone); }
                    else setCommResult('❌ Payment verification failed — please contact support');
                    setCommPayLoading(false);
                  }).catch((e: any) => {
                    const desc = String(e?.description || e?.error?.description || '').toLowerCase();
                    const cancelled = e?.code === 0 || e?.code === 'PAYMENT_CANCELLED' || desc.includes('cancel');
                    setCommResult(cancelled ? '🚫 Payment cancelled — you can try again' : '❌ Payment failed — please try again');
                    setCommPayLoading(false);
                  });
                } catch (_e) { Alert.alert('Error', 'Could not connect to server'); setCommPayLoading(false); }
              }}
              style={{ backgroundColor: commPayLoading ? '#334155' : C.pink, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{commPayLoading ? 'Opening...' : `💳 Pay ₹${commissionData.pending_commission.toFixed(0)} Now`}</Text>
            </TouchableOpacity>
          )}
          {commResult ? (
            <View style={{ marginBottom: 10, borderRadius: 10, padding: 10, backgroundColor: commResult.includes('✅') ? '#F0FDF4' : commResult.includes('🚫') ? '#FFFBEB' : '#FFF5F5', borderWidth: 1, borderColor: commResult.includes('✅') ? '#BBF7D0' : commResult.includes('🚫') ? '#FDE68A' : '#FCA5A5' }}>
              <Text style={{ color: commResult.includes('✅') ? '#15803D' : commResult.includes('🚫') ? '#92400E' : '#DC2626', fontSize: 13, fontWeight: '700', textAlign: 'center' }}>{commResult}</Text>
              {commResult.includes('🚫') && <Text style={{ color: '#92400E', fontSize: 11, textAlign: 'center', marginTop: 3, opacity: 0.8 }}>{t('retry_pay_below')}</Text>}
            </View>
          ) : null}

          {/* Per-ride commission history */}
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 8, marginBottom: 8 }}>Per-Ride Commission</Text>
          {!walletLoaded ? (
            [1,2,3].map(i => <SkeletonCommissionRow key={i} />)
          ) : commissionData.records.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 30 }}>
              <Text style={{ fontSize: 32 }}>📋</Text>
              <Text style={{ color: '#475569', marginTop: 8 }}>{t('no_commission_records')}</Text>
            </View>
          ) : commissionData.records.map((rec: any, i: number) => {
            const statusColor = rec.status === 'collected' || rec.status === 'settled' || rec.status === 'auto_settled' ? C.green : '#F59E0B';
            const statusLabel = rec.status === 'collected' ? 'Collected' : rec.status === 'settled' ? 'Paid' : rec.status === 'auto_settled' ? 'Auto-Settled' : rec.status === 'cash_owed' ? 'Pending' : rec.status;
            return (
              <View key={rec.id || i} style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0', borderLeftWidth: 3, borderLeftColor: statusColor }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <View style={{ backgroundColor: statusColor + '22', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: statusColor }}>{statusLabel}</Text>
                      </View>
                      <Text style={{ fontSize: 11, color: '#64748B' }}>
                        {rec.payment_method === 'cash' ? '💵 Cash' : rec.payment_method === 'wallet' ? '👛 Wallet' : '💳 Online'}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, color: '#94A3B8' }}>Ride #{rec.ride_id?.slice(-6)} · {fmtDate(rec.created_at)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }}>₹{parseFloat(rec.commission).toFixed(0)}</Text>
                    <Text style={{ fontSize: 10, color: '#64748B' }}>Fare ₹{parseFloat(rec.fare).toFixed(0)}</Text>
                  </View>
                </View>
              </View>
            );
          })}

          {/* Manual payment history */}
          {commissionData.payments.length > 0 && (<>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 12, marginBottom: 8 }}>Manual Payments (Razorpay)</Text>
            {commissionData.payments.map((p: any, i: number) => (
              <View key={p.id || i} style={{ backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: C.green }}>₹{parseFloat(p.amount).toFixed(0)} Paid</Text>
                    <Text style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>{fmtDate(p.created_at)}</Text>
                  </View>
                  <View style={{ backgroundColor: p.status === 'paid' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'center' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: p.status === 'paid' ? C.green : '#F59E0B' }}>{p.status === 'paid' ? '✅ Paid' : '⏳ Pending'}</Text>
                  </View>
                </View>
              </View>
            ))}
          </>)}
        </>)}

      </ScrollView>
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
      {showFuelLog && (
        <FuelLogScreen
          onClose={() => setShowFuelLog(false)}
          todayEarnings={earnings}
          weeklyEarnings={earningsAnalytics?.this_week?.earned ?? 0}
        />
      )}
    </View>
  );
  }

  // ═══ BONUS TAB ═══
  if (activeTab === 'bonus') {

    const dash = bonusDash;
    const balance = parseFloat(dash?.wallet?.balance || 0);
    const totalEarned = parseFloat(dash?.wallet?.total_earned || 0);
    const totalRedeemed = parseFloat(dash?.wallet?.total_redeemed || 0);
    const ridesCount: number = dash?.rides_today || 0;
    const isPeak: boolean = dash?.is_peak_hour || false;

    // Daily rides rule for this driver's vehicle group
    const dailyRule = dash?.rules?.find((r: any) => r.bonus_type === 'daily_rides');
    const peakRule  = dash?.rules?.find((r: any) => r.bonus_type === 'peak_hour');
    const streakRule = dash?.rules?.find((r: any) => r.bonus_type === 'weekly_streak');

    // Week calendar: Mon to Sun
    const weekDayLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const now = new Date();
    const dow = now.getDay() === 0 ? 7 : now.getDay();
    const weekDays = weekDayLabels.map((_, i) => {
      const d = new Date(now); d.setDate(now.getDate() - dow + 1 + i);
      return d.toISOString().slice(0,10);
    });
    const ridesByDay: Record<string,number> = {};
    (dash?.week_rides_by_day || []).forEach((r: any) => { ridesByDay[r.ride_date?.slice(0,10)] = parseInt(r.cnt); });
    const ridesPerDayTarget = streakRule?.config?.rides_per_day || 4;
    const qualifyingDays = weekDays.filter(d => (ridesByDay[d] || 0) >= ridesPerDayTarget && new Date(d) <= now).length;
    const streakTarget = streakRule?.config?.target_days || 5;
    const streakAchieved = qualifyingDays >= streakTarget;
    const streakClaimed = dash?.week_bonus_claimed;

    return (
    <View style={s.screen}>
      <View style={{ backgroundColor: C.pink, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 14 : 52, paddingBottom: 20, paddingHorizontal: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900', flex: 1 }}>🎁 Bonus Wallet</Text>
          <TouchableOpacity onPress={() => { loadBonusDash(phone); setBonusMsg(''); }} style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10 }}>
            <Text style={{ fontSize: 16 }}>⟳</Text>
          </TouchableOpacity>
        </View>
        {/* Balance Hero */}
        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 4 }}>Bonus Balance</Text>
          <Text style={{ color: '#FFD700', fontSize: 40, fontWeight: '900' }}>₹{balance.toFixed(0)}</Text>
          <View style={{ flexDirection: 'row', gap: 24, marginTop: 10 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: C.green, fontSize: 16, fontWeight: '800' }}>₹{totalEarned.toFixed(0)}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 2 }}>Total Earned</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: C.pink, fontSize: 16, fontWeight: '800' }}>₹{totalRedeemed.toFixed(0)}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 2 }}>Redeemed</Text>
            </View>
          </View>
        </View>
        {/* Redeem section */}
        {balance >= 50 && (
          <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, marginTop: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13, marginBottom: 10 }}>💸 Redeem → Main Wallet</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput
                style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: '#fff', fontWeight: '700' }}
                placeholder={`Min ₹50`} placeholderTextColor="rgba(255,255,255,0.4)"
                keyboardType="numeric" value={bonusRedeemAmt}
                onChangeText={setBonusRedeemAmt}
              />
              <TouchableOpacity onPress={redeemBonus} disabled={bonusRedeemLoading}
                style={{ backgroundColor: bonusRedeemLoading ? '#555' : '#FFD700', borderRadius: 10, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#0F172A', fontWeight: '900', fontSize: 14 }}>{bonusRedeemLoading ? '...' : 'Redeem'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {balance < 50 && balance > 0 && (
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'center', marginTop: 8 }}>{tp('redeem_min_needed', { n: (50 - balance).toFixed(0) })}</Text>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {bonusMsg ? (
          <View style={{ backgroundColor: bonusMsg.startsWith('✅') ? 'rgba(76,175,80,0.15)' : 'rgba(233,69,96,0.12)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <Text style={{ color: bonusMsg.startsWith('✅') ? '#2e7d32' : '#c62828', fontWeight: '700', fontSize: 13 }}>{bonusMsg}</Text>
          </View>
        ) : null}

        {bonusLoading && !dash ? (
          <View style={{ paddingVertical: 8 }}>
            <SkeletonBonusCard />
            <SkeletonBonusCard />
            <SkeletonBonusCard />
          </View>
        ) : (
          <>
          {/* ── Peak Hour Banner ── */}
          {peakRule && (
            <View style={{ backgroundColor: isPeak ? 'rgba(255,143,0,0.1)' : '#F8FAFC', borderRadius: 16, padding: 14, marginBottom: 12, elevation: 2, borderWidth: isPeak ? 2 : 1, borderColor: isPeak ? '#FF8F00' : '#E2E8F0' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 28, marginRight: 12 }}>{isPeak ? '⚡' : '🕐'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#0F172A' }}>{peakRule.label}</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>+₹{peakRule.config.per_ride}/ride · {t('peak_hours_range')}</Text>
                </View>
                {isPeak && (
                  <View style={{ backgroundColor: '#FF8F00', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 11 }}>LIVE NOW</Text>
                  </View>
                )}
              </View>
              {isPeak && (
                <View style={{ backgroundColor: '#FF8F0015', borderRadius: 10, padding: 10, marginTop: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: '#E65100' }}>{t('peak_earned_today')}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: '#E65100' }}>₹{(dash?.peak_today || 0).toFixed(0)}</Text>
                </View>
              )}
            </View>
          )}

          {/* ── Daily Ride Challenge ── */}
          {dailyRule && (
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                <Text style={{ fontSize: 22, marginRight: 10 }}>🎯</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#0F172A' }}>{dailyRule.label}</Text>
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{tp('todays_rides_reset', { n: String(ridesCount) })}</Text>
                </View>
              </View>
              {(dailyRule.config.tiers || []).map((tier: any, idx: number) => {
                const refKey = `daily_${new Date().toISOString().slice(0,10)}_r${dailyRule.id}_t${idx}`;
                const isClaimed = (dash?.today_claimed || []).some((c: any) => c.ref_key === refKey);
                const isUnlocked = ridesCount >= tier.rides;
                const pct = Math.min(100, (ridesCount / tier.rides) * 100);
                return (
                  <View key={idx} style={{ marginBottom: idx < dailyRule.config.tiers.length - 1 ? 14 : 0 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 16 }}>{isClaimed ? '✅' : isUnlocked ? '🔓' : '🔒'}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: isClaimed ? C.green : '#0F172A' }}>{tier.rides} rides today</Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: C.pink }}>₹{tier.amount}</Text>
                    </View>
                    <View style={{ height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
                      <View style={{ height: 8, backgroundColor: isClaimed ? C.green : isUnlocked ? '#FF8F00' : C.pink, borderRadius: 4, width: `${pct}%` }} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, color: '#999' }}>{ridesCount}/{tier.rides} rides</Text>
                      {isUnlocked && !isClaimed ? (
                        <TouchableOpacity onPress={() => claimDailyBonus(dailyRule.id, idx)} disabled={bonusClaiming}
                          style={{ backgroundColor: bonusClaiming ? '#ccc' : C.green, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 }}>
                          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>Claim ₹{tier.amount} 🎉</Text>
                        </TouchableOpacity>
                      ) : isClaimed ? (
                        <Text style={{ fontSize: 12, color: C.green, fontWeight: '700' }}>✅ Claimed!</Text>
                      ) : (
                        <Text style={{ fontSize: 11, color: '#aaa' }}>{tp('more_rides_needed', { n: String(tier.rides - ridesCount) })}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ── Weekly Warrior ── */}
          {streakRule && (
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                <Text style={{ fontSize: 22, marginRight: 10 }}>🏆</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#0F172A' }}>Weekly Warrior</Text>
                  <Text style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{streakRule.config.target_days} days × {ridesPerDayTarget}+ rides/day → ₹{streakRule.config.amount}</Text>
                </View>
                <View style={{ backgroundColor: streakAchieved && !streakClaimed ? 'rgba(255,143,0,0.15)' : '#F1F5F9', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: streakAchieved && !streakClaimed ? '#FF8F00' : '#6B7280' }}>{qualifyingDays}/{streakTarget}</Text>
                </View>
              </View>
              {/* 7-day calendar */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
                {weekDays.map((date, i) => {
                  const cnt = ridesByDay[date] || 0;
                  const qualified = cnt >= ridesPerDayTarget;
                  const isPast = new Date(date) <= now;
                  const isToday = date === now.toISOString().slice(0,10);
                  return (
                    <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: qualified ? C.green : isToday ? 'rgba(255,143,0,0.2)' : isPast ? 'rgba(233,30,99,0.12)' : '#F1F5F9',
                        borderWidth: isToday ? 2 : 0, borderColor: '#FF8F00' }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: qualified ? '#fff' : isPast ? C.pink : '#bbb' }}>
                          {qualified ? '✓' : cnt > 0 ? String(cnt) : weekDayLabels[i][0]}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 9, color: isToday ? '#FF8F00' : '#aaa', marginTop: 3, fontWeight: isToday ? '800' : '400' }}>{weekDayLabels[i]}</Text>
                    </View>
                  );
                })}
              </View>
              {streakAchieved && !streakClaimed ? (
                <TouchableOpacity onPress={claimStreakBonus} disabled={bonusClaiming}
                  style={{ backgroundColor: bonusClaiming ? '#ccc' : C.pink, borderRadius: 12, padding: 14, alignItems: 'center' }}>
                  <Text style={{ color: '#FFD700', fontWeight: '900', fontSize: 15 }}>🏆 Claim Weekly Warrior ₹{streakRule.config.amount}</Text>
                </TouchableOpacity>
              ) : streakClaimed ? (
                <View style={{ backgroundColor: 'rgba(76,175,80,0.15)', borderRadius: 12, padding: 12, alignItems: 'center' }}>
                  <Text style={{ color: C.green, fontWeight: '800', fontSize: 13 }}>✅ {t('weekly_bonus_claimed')}</Text>
                </View>
              ) : (
                <View style={{ backgroundColor: '#F1F5F9', borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: '#94A3B8', fontSize: 12, textAlign: 'center' }}>{tp('more_qualifying_days', { n: String(streakTarget - qualifyingDays), m: String(ridesPerDayTarget) })}</Text>
                </View>
              )}
            </View>
          )}

          {/* ── How Bonus Works ── */}
          <View style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 16, marginBottom: 14 }}>
            <Text style={{ color: '#0F172A', fontWeight: '800', fontSize: 13, marginBottom: 10 }}>{t('how_bonus_works')}</Text>
            {[
              ['🎯', 'Daily Rides', t('bonus_daily_desc')],
              ['⚡', 'Peak Hour', t('bonus_peak_desc')],
              ['🏆', 'Weekly Warrior', t('bonus_weekly_desc')],
              ['💸', 'Redeem', t('bonus_redeem_desc')],
            ].map(([icon, title, desc], i) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: i < 3 ? 10 : 0 }}>
                <Text style={{ fontSize: 16, marginRight: 10, width: 22 }}>{icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#FFD700', fontWeight: '700', fontSize: 12 }}>{title}</Text>
                  <Text style={{ color: '#64748B', fontSize: 11, marginTop: 2, lineHeight: 16 }}>{desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* ── Recent History ── */}
          <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, marginBottom: 8, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#0F172A', flex: 1 }}>📋 Bonus History</Text>
              {!bonusHistoryLoaded && (
                <TouchableOpacity onPress={() => loadBonusHistory(phone)}>
                  <Text style={{ fontSize: 12, color: '#2196F3', fontWeight: '700' }}>Load History</Text>
                </TouchableOpacity>
              )}
            </View>
            {bonusHistory.length === 0 ? (
              <Text style={{ color: '#aaa', fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>{t('no_bonus_history')}</Text>
            ) : (
              bonusHistory.slice(0, 15).map((item: any, i: number) => {
                const isEarn = item.amount > 0;
                const typeLabel: Record<string,string> = { daily_rides: '🎯 Daily Rides', peak_hour: '⚡ Peak Hour', weekly_streak: '🏆 Weekly Warrior', redeem: '💸 Redeemed' };
                return (
                  <View key={item.id || i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: i < bonusHistory.length - 1 ? 1 : 0, borderBottomColor: '#E2E8F0' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{typeLabel[item.bonus_type] || item.bonus_type}</Text>
                      <Text style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{item.description}</Text>
                      <Text style={{ fontSize: 10, color: '#bbb', marginTop: 1 }}>{new Date(item.created_at).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</Text>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: isEarn ? C.green : C.pink }}>
                      {isEarn ? '+' : ''}₹{Math.abs(item.amount).toFixed(0)}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
          </>
        )}
      </ScrollView>
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
    </View>
    );
  }

  // ═══ PROFILE TAB ═══
  return (
    <View style={s.screen}>
      <View style={[s.topBar, { paddingBottom: 16 }]}><Text style={s.greeting}>👤 Profile</Text></View>
      {rideReq && !activeHourlyRide && <TouchableOpacity style={s.notifBanner} onPress={() => setActiveTab('live')}><Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>🔔 Nayi Ride! ₹{rideReq.fare}</Text><Text style={{ color: '#fff', fontSize: 13 }}>Dekho →</Text></TouchableOpacity>}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View style={s.profileHero}>
          <View style={s.profileAvatar}><Text style={{ color: '#fff', fontSize: 36, fontWeight: 'bold' }}>{(driverInfo?.name || 'D')[0].toUpperCase()}</Text></View>
          <Text style={s.profileName}>{driverInfo?.name || phone}</Text>
          <Text style={s.profilePhone}>+91 {phone}</Text>
          <Text style={s.profileVehicle}>{driverInfo?.vehicle_type || ''} · {driverInfo?.vehicle_no || ''}</Text>
          <View style={s.badge}><Text style={{ color: '#F59E0B', fontWeight: 'bold' }}>⭐ {driverInfo?.rating || '4.8'}</Text></View>
        </View>

        {/* ── Driver Level Card ── */}
        {driverLevel && (() => {
          const lvlColors: Record<string, { bg: string; border: string; text: string }> = {
            platinum: { bg: 'linear', border: '#9C27B0', text: '#7B1FA2' },
            gold:     { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.4)', text: '#B45309' },
            silver:   { bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.35)', text: '#475569' },
            bronze:   { bg: 'rgba(205,127,50,0.08)', border: 'rgba(205,127,50,0.35)', text: '#92400E' },
          };
          const cfg = lvlColors[driverLevel.level] || lvlColors.bronze;
          const isPlatinum = driverLevel.level === 'platinum';
          return (
            <View style={{ borderRadius: 20, padding: 18, marginBottom: 14, elevation: 6,
              backgroundColor: isPlatinum ? '#2D1B69' : cfg.bg.startsWith('rgba') ? cfg.bg : '#F5F3FF',
              borderWidth: 2, borderColor: isPlatinum ? '#9C27B0' : cfg.border,
              shadowColor: driverLevel.levelColor || '#9C27B0', shadowOpacity: 0.18, shadowRadius: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 40 }}>{driverLevel.levelEmoji}</Text>
                  <View>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: isPlatinum ? 'rgba(255,255,255,0.6)' : '#94A3B8', letterSpacing: 1, textTransform: 'uppercase' }}>Aapka Level</Text>
                    <Text style={{ fontSize: 24, fontWeight: '900', color: isPlatinum ? '#FFD700' : cfg.text, marginTop: 2 }}>{driverLevel.levelName}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, color: isPlatinum ? 'rgba(255,255,255,0.5)' : '#94A3B8' }}>Rides</Text>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: isPlatinum ? '#fff' : cfg.text }}>{driverLevel.completed_rides}</Text>
                </View>
              </View>

              {/* Progress to next level */}
              {driverLevel.nextLevel && (
                <View style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 11, color: isPlatinum ? 'rgba(255,255,255,0.6)' : '#64748B', fontWeight: '600' }}>
                      {driverLevel.levelName} → {driverLevel.nextLevelName}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: isPlatinum ? '#FFD700' : cfg.text }}>
                      {driverLevel.progress}%
                    </Text>
                  </View>
                  <View style={{ height: 8, backgroundColor: isPlatinum ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                    <View style={{ height: '100%', width: `${driverLevel.progress}%`, borderRadius: 4, backgroundColor: isPlatinum ? '#FFD700' : driverLevel.levelColor || '#9C27B0' }} />
                  </View>
                  <Text style={{ fontSize: 11, color: isPlatinum ? 'rgba(255,255,255,0.5)' : '#94A3B8', marginTop: 5 }}>
                    {tp('rides_to_unlock', { n: String(driverLevel.nextTarget - driverLevel.completed_rides), emoji: driverLevel.nextLevelEmoji, name: driverLevel.nextLevelName })}
                  </Text>
                </View>
              )}

              {/* Stats row */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {[
                  { label: 'Rating', value: `⭐ ${driverLevel.avg_rating}` },
                  { label: 'Cancel Rate', value: `${driverLevel.cancel_rate}%` },
                  { label: t('this_month_label'), value: `${driverLevel.rides_this_month} rides` },
                ].map((item, i) => (
                  <View key={i} style={{ flex: 1, backgroundColor: isPlatinum ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)', borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: isPlatinum ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: isPlatinum ? '#fff' : '#0F172A' }}>{item.value}</Text>
                    <Text style={{ fontSize: 9, color: isPlatinum ? 'rgba(255,255,255,0.5)' : '#94A3B8', marginTop: 3, textAlign: 'center' }}>{item.label}</Text>
                  </View>
                ))}
              </View>

              {/* Benefits */}
              <View style={{ backgroundColor: isPlatinum ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: isPlatinum ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: isPlatinum ? 'rgba(255,255,255,0.7)' : '#64748B', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>Aapke Benefits</Text>
                {(driverLevel.benefits || []).map((b: string, i: number) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: i < (driverLevel.benefits || []).length - 1 ? 6 : 0 }}>
                    <Text style={{ fontSize: 14, color: isPlatinum ? '#FFD700' : driverLevel.levelColor }}>✓</Text>
                    <Text style={{ fontSize: 12, color: isPlatinum ? 'rgba(255,255,255,0.85)' : cfg.text, fontWeight: '500' }}>{b}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })()}

        {/* ── Favourite Buddy Count Card ── */}
        {(() => {
          const n = favouriteCount ?? 0;
          const loading = favouriteCount === null;
          const msg =
            n === 0 ? t('no_favourites_yet') :
            n === 1 ? t('fav_msg_one') :
            n <= 5  ? tp('fav_msg_loyal', { n: String(n) }) :
            n <= 20 ? tp('fav_msg_diwane', { n: String(n) }) :
                      tp('fav_msg_legend', { n: String(n) });
          const cardBg   = n >= 20 ? 'rgba(233,30,99,0.08)' : n >= 6 ? 'rgba(245,158,11,0.1)' : n >= 1 ? 'rgba(16,185,129,0.1)' : '#F8FAFC';
          const numColor = n >= 20 ? C.pink : n >= 6 ? '#F59E0B' : n >= 1 ? C.green : '#94A3B8';
          const txtColor = '#0F172A';
          const subColor = '#64748B';
          return (
            <View style={{ backgroundColor: cardBg, borderRadius: 16, padding: 18, marginBottom: 12, elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 20, marginRight: 8 }}>⭐</Text>
                <Text style={{ fontWeight: '900', fontSize: 15, color: txtColor, letterSpacing: 0.3 }}>Favourite Sppero Buddy</Text>
              </View>
              {loading ? (
                <Text style={{ color: subColor, fontSize: 13 }}>Loading...</Text>
              ) : (
                <>
                  <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                    <Text style={{ fontSize: 64, fontWeight: '900', color: numColor, lineHeight: 70 }}>{n}</Text>
                    <Text style={{ fontSize: 13, color: subColor, marginTop: 4, textAlign: 'center' }}>{msg}</Text>
                  </View>
                  {n > 0 && (
                    <View style={{ marginTop: 10, backgroundColor: n >= 20 ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, marginRight: 8 }}>💡</Text>
                      <Text style={{ fontSize: 12, color: subColor, flex: 1 }}>
                        {t('fav_notify_hint')}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
          );
        })()}

        {/* UPI ID Section */}
        <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 4 }}>{t('my_upi_id_title')}</Text>
          <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 12 }}>{t('upi_qr_pay_hint')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={{ flex: 1, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#0F172A', backgroundColor: '#FFFFFF' }}
              placeholder="yourname@upi / 9999@paytm"
              value={upiInput}
              onChangeText={setUpiInput}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor="#475569"
            />
            <TouchableOpacity onPress={saveUpiId}
              style={{ backgroundColor: upiSaving ? '#334155' : C.green, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Save</Text>
            </TouchableOpacity>
          </View>
          {driverUpiId ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6, backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' }}>
              <Text style={{ fontSize: 14 }}>✅</Text>
              <Text style={{ fontSize: 12, color: C.green, fontWeight: '600', flex: 1 }}>{driverUpiId}</Text>
            </View>
          ) : null}
          {result && result.includes('UPI') ? <Text style={{ color: result.includes('✅') ? C.green : C.pink, marginTop: 6, fontSize: 12 }}>{result}</Text> : null}
        </View>

        {/* Referral Section */}
        <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 4 }}>🎁 Refer & Earn</Text>
          <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 12 }}>{t('refer_friends_hint')}</Text>
          {referralInfo ? (
            <View>
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ color: '#64748B', fontSize: 11, marginBottom: 4, letterSpacing: 1 }}>{t('your_referral_code')}</Text>
                <Text style={{ color: '#FFD700', fontSize: 28, fontWeight: '900', letterSpacing: 6 }}>{referralInfo.code}</Text>
              </View>
              <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#0F172A' }}>{referralInfo.total_referrals}</Text>
                  <Text style={{ fontSize: 10, color: '#64748B' }}>Referrals</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: C.green }}>₹{referralInfo.total_earned}</Text>
                  <Text style={{ fontSize: 10, color: '#64748B' }}>Earned</Text>
                </View>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: C.pink, borderRadius: 10, padding: 12, alignItems: 'center', elevation: 4, shadowColor: C.pink, shadowOpacity: 0.35, shadowRadius: 8 }}
                onPress={() => Share.share({ message: tp('referral_share_msg2', { code: referralInfo.code }), title: 'Sppero Buddy Referral' })}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{t('share_code_btn')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={{ backgroundColor: '#334155', borderRadius: 10, padding: 12, alignItems: 'center' }}
              onPress={loadReferralInfo}>
              <Text style={{ color: '#94A3B8', fontSize: 13 }}>🔑 Code Generate Karo</Text>
            </TouchableOpacity>
          )}
        </View>

        {([
          ['🎯', 'Subscription', 'Zero commission ride packs', 'subscription'],
          ['📦', 'All Orders', 'Rides history, completed & cancelled', 'orders'],
          ['💰', 'Fare Rates', 'Base fare, commission & per km rates', 'fare-rates'],
          ['📋', 'Documents', 'License, RC verification', 'documents'],
          ['🏦', 'Bank Details', 'Payout account', 'bank'],
          ['📞', 'Support', '24x7 help', 'support'],
          ['⚙️', 'Settings', 'Preferences', 'settings'],
        ] as [string,string,string,string][]).map(([icon,title,sub,key]) => (
          <Bouncy key={key} style={s.menuItem} onPress={() => {
            if (key === 'orders') { setOrdersData(null); setOrdersLoading(false); setOrdersPeriod('day'); setOrdersDate(new Date()); setOrdersFilter('all'); }
            if (key === 'subscription') { setSubResult(''); setSubSelectedPlan(null); loadDriverSub(phone, driverInfo?.vehicle_type); }
            setDrSubScreen(key as any); setBankMsg('');
          }}>
            <Text style={{ fontSize: 22, marginRight: 14 }}>{icon}</Text>
            <View style={{ flex: 1 }}><Text style={{ fontSize: 15, color: '#0F172A', fontWeight: '500' }}>{title}</Text><Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{sub}</Text></View>
            <Text style={{ fontSize: 20, color: '#475569' }}>›</Text>
          </Bouncy>
        ))}
        <Bouncy style={s.logoutBtn} onPress={async () => { stopBgLocation().catch(() => {}); await AsyncStorage.removeItem('driverPhone'); await AsyncStorage.removeItem('driverInfo'); setLoginPhone(''); setLoginOtpSent(false); setRegStep(0); setScreen('login'); setIsOnline(false); stopPolling(); setDriverInfo(null); setPhone(''); }}>
          <Text style={{ color: C.pink, fontWeight: 'bold', fontSize: 15 }}>🚪 Logout</Text>
        </Bouncy>
      </ScrollView>
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
    </View>
  );
}

function Row({ k, v, bold, last }: any) {
  return (
    <View style={[s.earningsRow, last && { borderBottomWidth: 0 }]}>
      <Text style={[s.earningsKey, bold && { fontWeight: 'bold' }]}>{k}</Text>
      <Text style={[s.earningsVal, bold && { color: C.green, fontWeight: 'bold' }]}>{v}</Text>
    </View>
  );
}

const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

function BottomNav({ activeTab, setActiveTab, rideReq, hourlyRideReq, activeRide, activeHourlyRide }: any) {
  const bnTR = TR[_appLang] ?? TR.hi;
  const tabs = [
    { t: 'home',     ion: 'home',       lbl: 'Home'   },
    { t: 'live',     ion: 'radio',      lbl: 'Live'   },
    { t: 'earnings', ion: 'wallet',      lbl: bnTR.nav_earnings ?? 'Kamai'  },
    { t: 'bonus',    ion: 'gift',        lbl: bnTR.nav_bonus    ?? 'Bonus'  },
    { t: 'profile',  ion: 'person',      lbl: 'Profile'},
  ];
  const hasLiveBadge = rideReq || hourlyRideReq || activeRide || activeHourlyRide;
  return (
    <View style={s.nav}>
      {tabs.map(({ t, ion, lbl }) => {
        const active = activeTab === t;
        const isLive = t === 'live';
        const activeColor = isLive ? C.green : C.pink;
        const col = active ? activeColor : '#475569';
        return (
          <TouchableOpacity key={t} style={s.navItem} onPress={() => setActiveTab(t)} activeOpacity={0.65}>
            <View style={{ position: 'relative', alignItems: 'center' }}>
              <Ionicons name={active ? ion as any : `${ion}-outline` as any} size={isLive ? 22 : 24} color={col} />
              {isLive && hasLiveBadge && (
                <View style={[s.navDot, { backgroundColor: activeRide || activeHourlyRide ? C.green : C.pink }]} />
              )}
            </View>
            <Text style={[s.navLbl, active && { color: activeColor, fontWeight: 'bold' }]}>{lbl}</Text>
            {active && <View style={[s.navLine, { backgroundColor: activeColor }]} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  screen:          { flex:1, backgroundColor:'#FFFFFF' },
  mapFit:          { height: 220, width: '100%', backgroundColor: C.bg },
  navFloat:        { position:'absolute', bottom:0, left:0, right:0 },
  chatBadge:       { position:'absolute', top:-6, right:-10, backgroundColor:C.pink, borderRadius:9, minWidth:18, height:18, alignItems:'center', justifyContent:'center', paddingHorizontal:4 },
  hero:            { backgroundColor:C.pink, alignItems:'center', padding:50, paddingTop: Platform.OS==='android' ? (StatusBar.currentHeight||28)+24 : 50, paddingBottom:40 },
  heroIcon:        { fontSize:60 },
  heroTitle:       { color:'#fff', fontSize:28, fontWeight:'bold', marginTop:10 },
  heroSub:         { color:'rgba(255,255,255,0.8)', fontSize:14, marginTop:6 },
  sectionTitle:    { fontSize:16, fontWeight:'bold', color:C.text, marginBottom:12 },
  driverItem:      { flexDirection:'row', alignItems:'center', backgroundColor:C.bgCard, borderRadius:R.sm, padding:SP.md, marginBottom:10, elevation:2, borderWidth:1, borderColor:C.glassBorder },
  btn:             { backgroundColor:C.pink, borderRadius:R.sm, padding:SP.md, alignItems:'center', marginTop:SP.md, marginBottom:10, elevation:4, shadowColor:C.pink, shadowOpacity:0.35, shadowRadius:10 },
  btnTxt:          { color:'#fff', fontSize:16, fontWeight:'bold' },
  err:             { textAlign:'center', color:C.red, marginVertical:10 },
  topBar:          { backgroundColor:C.plum, flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:SP.md, paddingBottom:10, paddingTop: Platform.OS==='android' ? (StatusBar.currentHeight||28)+8 : 44, borderBottomWidth:0 },
  greeting:        { color:'#fff', fontSize:18, fontWeight:'bold' },
  subTxt:          { color:'rgba(255,255,255,0.65)', fontSize:12, marginTop:2 },
  notifBanner:     { backgroundColor:C.pink, padding:12, flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  statsRow:        { flexDirection:'row', gap:10, marginBottom:16 },
  statCard:        { flex:1, backgroundColor:C.bgCard, borderRadius:R.md, padding:SP.md, alignItems:'center', ...SHADOW.sm, borderWidth:1, borderColor:C.glassBorder },
  statIcon:        { fontSize:22 },
  statValue:       { fontSize:22, fontWeight:'bold', color:C.text, marginTop:4 },
  statLabel:       { ...T.label, color:C.textDim, marginTop:3 },
  targetCard:      { backgroundColor:C.bgCard, borderRadius:R.sm, padding:SP.md, marginBottom:14, elevation:2, borderWidth:1, borderColor:C.glassBorder },
  statusCard:      { backgroundColor:C.bgCard, borderRadius:R.sm, padding:SP.md, marginBottom:16, elevation:2, borderWidth:1, borderColor:C.glassBorder },
  statusText:      { fontSize:14, color:C.textMuted, textAlign:'center' },
  tripCard:        { backgroundColor:C.bgCard, borderRadius:R.md, padding:SP.md, marginBottom:16, borderWidth:2, borderColor:C.pinkBorder, ...SHADOW.lg, shadowColor:C.pink },
  tripBadge:       { backgroundColor:C.online, borderRadius:R.xs, padding:9, marginBottom:12 },
  tripBadgeTxt:    { color:'#fff', textAlign:'center', fontWeight:'bold', fontSize:14 },
  tripCustomer:    { flexDirection:'row', alignItems:'center', marginBottom:12 },
  tripAvatar:      { width:46, height:46, borderRadius:23, backgroundColor:C.pinkGlass, alignItems:'center', justifyContent:'center', marginRight:12 },
  tripCustName:    { fontSize:16, fontWeight:'bold', color:C.text },
  tripCustPhone:   { fontSize:13, color:C.textMuted, marginTop:2 },
  tripFare:        { fontSize:22, fontWeight:'bold', color:C.online },
  chatCallBtn:     { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', backgroundColor:C.glassMid, borderRadius:R.xs, padding:11, borderWidth:1, borderColor:C.glassBorder },
  tripRoute:       { backgroundColor:C.glassMid, borderRadius:R.xs, padding:12, marginBottom:12, borderWidth:1, borderColor:C.glassBorder },
  tripFrom:        { fontSize:14, color:C.online, fontWeight:'600' },
  tripArrow:       { fontSize:16, textAlign:'center', color:C.textDim, marginVertical:4 },
  tripTo:          { fontSize:14, color:C.pink, fontWeight:'600' },
  tripBtn:         { backgroundColor:C.online, borderRadius:R.sm, padding:SP.md, alignItems:'center', marginBottom:8, ...SHADOW.green },
  tripBtnTxt:      { color:'#fff', fontWeight:'bold', fontSize:15 },
  navBtn:          { backgroundColor:'#0EA5E9', borderRadius:R.xs, padding:12, alignItems:'center', marginBottom:10 },
  cancelBtn:       { padding:12, alignItems:'center' },
  cancelTxt:       { color:C.pink, fontWeight:'600' },
  rideCard:        { backgroundColor:C.bgCard, borderRadius:R.lg, padding:18, marginBottom:16, borderWidth:1.5, borderColor:C.glassBorder, ...SHADOW.md, shadowColor:C.plum },
  rideHeader:      { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10 },
  rideTitle:       { fontSize:16, fontWeight:'bold', color:C.text },
  rideFare:        { fontSize:24, fontWeight:'bold', color:C.online },
  rideDetails:     { backgroundColor:C.glassMid, borderRadius:R.xs, padding:12, marginBottom:4, borderWidth:1, borderColor:C.glassBorder },
  rideFrom:        { fontSize:14, color:C.online, fontWeight:'600' },
  rideDivider:     { fontSize:16, textAlign:'center', color:C.textDim, marginVertical:4 },
  rideTo:          { fontSize:14, color:C.pink, fontWeight:'600' },
  rideActions:     { flexDirection:'row', gap:10 },
  rejectBtn:       { flex:1, padding:14, borderRadius:R.xs, borderWidth:1.5, borderColor:C.pinkBorder, alignItems:'center', backgroundColor:C.pinkGlass },
  rejectTxt:       { color:C.pink, fontWeight:'bold' },
  acceptBtn:       { flex:2, padding:14, borderRadius:R.xs, backgroundColor:C.online, alignItems:'center', elevation:4, shadowColor:C.online, shadowOpacity:0.4, shadowRadius:8 },
  acceptTxt:       { color:'#fff', fontWeight:'900', fontSize:16 },
  result:          { textAlign:'center', color:C.online, fontSize:14, marginTop:10, fontWeight:'600' },
  nav:             { flexDirection:'row', backgroundColor:C.bgCard, borderTopWidth:1, borderTopColor:C.glassBorder, paddingBottom: Platform.OS==='android' ? 44 : 16, paddingTop:10, elevation:12, shadowColor:C.plum, shadowOpacity:0.08, shadowRadius:12 },
  navItem:         { flex:1, alignItems:'center', justifyContent:'center', paddingTop:2 },
  navIcon:         { fontSize:22, color:C.textDim },
  navIconActive:   { color:C.pink },
  navLbl:          { fontSize:10, color:C.textDim, marginTop:3, letterSpacing:0.3 },
  navActive:       { color:C.pink, fontWeight:'bold' },
  navDot:          { position:'absolute', top:-3, right:-10, width:9, height:9, borderRadius:4.5, backgroundColor:C.pink, borderWidth:1.5, borderColor:C.bgCard },
  navLine:         { width:24, height:3, borderRadius:2, backgroundColor:C.pink, marginTop:5 },
  earningsCard:    { backgroundColor:C.bgCard, borderRadius:R.sm, padding:SP.md, marginBottom:16, elevation:2, borderWidth:1, borderColor:C.glassBorder },
  earningsRow:     { flexDirection:'row', justifyContent:'space-between', paddingVertical:10, borderBottomWidth:1, borderBottomColor:C.glassBorder },
  earningsKey:     { fontSize:14, color:C.textMuted },
  earningsVal:     { fontSize:14, color:C.text, fontWeight:'500' },
  profileHero:     { backgroundColor:C.plum, borderRadius:R.lg, padding:28, alignItems:'center', marginBottom:16, elevation:6, shadowColor:C.plum, shadowOpacity:0.3, shadowRadius:14 },
  profileAvatar:   { width:84, height:84, borderRadius:42, backgroundColor:'rgba(255,255,255,0.15)', alignItems:'center', justifyContent:'center', marginBottom:12, borderWidth:3, borderColor:'rgba(255,255,255,0.45)' },
  profileName:     { color:'#fff', fontSize:22, fontWeight:'bold' },
  profilePhone:    { color:'rgba(255,255,255,0.75)', fontSize:14, marginTop:4 },
  profileVehicle:  { color:'rgba(255,255,255,0.60)', fontSize:13, marginTop:4 },
  badge:           { backgroundColor:C.greenGlass, borderRadius:R.xs, paddingVertical:5, paddingHorizontal:14, marginTop:10, borderWidth:1, borderColor:C.greenBorder },
  menuItem:        { flexDirection:'row', alignItems:'center', backgroundColor:C.bgCard, borderRadius:R.sm, padding:14, marginBottom:8, elevation:2, borderWidth:1, borderColor:C.glassBorder },
  logoutBtn:       { borderWidth:1.5, borderColor:C.pinkBorder, borderRadius:R.sm, padding:14, alignItems:'center', marginTop:8, marginBottom:30, backgroundColor:C.pinkGlass },
});

const rs = StyleSheet.create({
  regHeader:   { backgroundColor:C.pink, flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:16, paddingTop: Platform.OS==='android' ? (StatusBar.currentHeight||28)+12 : 48 },
  regTitle:    { color:'#fff', fontSize:16, fontWeight:'bold' },
  bigTitle:    { fontSize:26, fontWeight:'bold', color:'#0F172A', marginTop:10 },
  subTitle:    { fontSize:14, color:'#64748B', marginTop:6, marginBottom:10 },
  fieldLabel:  { fontSize:14, fontWeight:'600', color:'#64748B', marginTop:16, marginBottom:8 },
  input:       { borderWidth:1, borderColor:'#E2E8F0', borderRadius:10, padding:14, fontSize:16, backgroundColor:'#F8FAFC', color:'#0F172A' },
  photoBox:    { borderWidth:2, borderColor:'#E2E8F0', borderStyle:'dashed', borderRadius:14, padding:16, alignItems:'center', backgroundColor:'#F8FAFC' },
  vehBox:      { flexDirection:'row', alignItems:'center', backgroundColor:'#F8FAFC', borderRadius:14, padding:18, marginBottom:12, elevation:2, borderWidth:1, borderColor:'#E2E8F0' },
  vehBoxActive:{ backgroundColor:'rgba(233,30,99,0.06)', borderColor:C.pink, borderWidth:2 },
  uploadBtn:   { flex:1, backgroundColor:C.pink, borderRadius:8, padding:10, alignItems:'center' },
  uploadBtnTxt:{ color:'#fff', fontWeight:'600', fontSize:13 },
  adviceBox:   { backgroundColor:'rgba(233,30,99,0.06)', borderRadius:12, padding:14, marginTop:14, marginBottom:6, borderWidth:1, borderColor:'rgba(233,30,99,0.2)' },
  adviceTitle: { fontSize:14, fontWeight:'bold', color:C.pink, marginBottom:6 },
  adviceText:  { fontSize:13, color:'#64748B', marginTop:2 },
  photoBoxDone:  { borderStyle:'solid', borderColor:'rgba(16,185,129,0.4)', backgroundColor:'rgba(16,185,129,0.04)' },
  scanCorner:    { position:'absolute', width:22, height:22, borderColor:C.pink, borderTopWidth:3, borderLeftWidth:3, borderBottomWidth:0, borderRightWidth:0 },
  reuploadBtn:   { flex:1, backgroundColor:'#F1F5F9', borderWidth:1, borderColor:'#E2E8F0' },
});

export default App;

const cs = StyleSheet.create({
  bubble:    { maxWidth:'75%', borderRadius:14, padding:12, marginBottom:8 },
  mine:      { backgroundColor:C.pink, alignSelf:'flex-end', borderBottomRightRadius:4 },
  theirs:    { backgroundColor:'#F1F5F9', alignSelf:'flex-start', borderBottomLeftRadius:4, elevation:1, borderWidth:1, borderColor:'#E2E8F0' },
  inputRow:  { flexDirection:'row', alignItems:'center', padding:10, paddingBottom:28, backgroundColor:'#FFFFFF', borderTopWidth:1, borderTopColor:'#E2E8F0' },
  input:     { flex:1, backgroundColor:'#F8FAFC', borderRadius:24, paddingHorizontal:16, paddingVertical:10, fontSize:14, marginRight:8, color:'#0F172A', borderWidth:1, borderColor:'#E2E8F0' },
  send:      { width:44, height:44, borderRadius:22, backgroundColor:C.pink, alignItems:'center', justifyContent:'center' },
});

