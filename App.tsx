import { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator, View, Text, TouchableOpacity, StyleSheet, Image, Alert,
  ScrollView, Switch, TextInput, Animated, Linking, Vibration, KeyboardAvoidingView, Platform, BackHandler, Share, AppState, Modal, StatusBar
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import * as Notifications from 'expo-notifications';
import { apiGet, apiPost } from './api';
import { useDriverStore } from './store';
import { io, Socket } from 'socket.io-client';

// Safe dynamic require: react-native-razorpay calls new NativeEventEmitter() at module
// evaluation time which crashes in RN 0.81+ bridgeless mode if the TurboModule isn't
// registered yet. The try/catch prevents this from killing the app on startup.
let RazorpayCheckout: any = null;
try { const _m = require('react-native-razorpay'); RazorpayCheckout = _m?.default || _m; } catch (_e) {}

const API      = 'https://rideapp-backend-production-5e1c.up.railway.app';
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
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 12, color: '#666' }}>⏱️ Auto-reject in</Text>
        <Text style={{ fontSize: 12, fontWeight: 'bold', color: left <= 5 ? '#E91E63' : '#333' }}>{left}s</Text>
      </View>
      <View style={{ height: 4, backgroundColor: '#f0f0f0', borderRadius: 2, overflow: 'hidden' }}>
        <Animated.View style={{ height: 4, borderRadius: 2, backgroundColor: left <= 5 ? '#E91E63' : '#16A34A', width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
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
    Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1.18, duration: 650, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1,    duration: 650, useNativeDriver: true }),
    ])).start();
  }, []);
  return <Animated.View style={[style, { transform: [{ scale: anim }] }]}>{children}</Animated.View>;
};

// ─── FloatingDots — animated bouncing dots ───
const FloatingDots = ({ color = '#E91E63' }: any) => {
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
        <Animated.View style={{ height: 3, backgroundColor: '#10B981', borderRadius: 2, width: anim.interpolate({ inputRange: [0, 3], outputRange: ['0%', '100%'] }) }} />
      </View>
      <View style={{ flexDirection: 'row' }}>
        {steps.map((s, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: i <= idx ? '#16A34A' : '#E2E8F0', alignItems: 'center', justifyContent: 'center', transform: [{ scale: i === idx ? 1.2 : 1 }], elevation: i === idx ? 4 : 0, borderWidth: i > idx ? 1 : 0, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 12 }}>{i <= idx ? s.icon : '·'}</Text>
            </View>
            <Text style={{ fontSize: 9, marginTop: 3, color: i <= idx ? '#10B981' : '#475569', fontWeight: i === idx ? 'bold' : 'normal' }}>{s.label}</Text>
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
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A', marginRight: 6 }} />
          <Text style={{ color: '#fff', fontSize: 11, flex: 1 }} numberOfLines={1}>{pickup}</Text>
          <Text style={{ color: '#555', fontSize: 12, marginHorizontal: 5 }}>→</Text>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#E91E63', marginRight: 6 }} />
          <Text style={{ color: '#fff', fontSize: 11, flex: 1 }} numberOfLines={1}>{drop}</Text>
        </View>
      )}
    </View>
  );
};

type Screen = 'splash' | 'login' | 'home';

// ─── Background Location Task ────────────────────────────────────────────────
// MUST be defined at module level, before any component mounts.
// When app is minimized/screen locked, this task fires every ~5s and pings backend.
const DRIVER_LOCATION_TASK = 'sppero-driver-bg-location';
const _BG_API = 'https://rideapp-backend-production-5e1c.up.railway.app';

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
    // ride_requests_v2: MAX importance, bypassDnd, 3s vibration.
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🚖 Nayi Ride Request!',
        body: `₹${rd.ride.fare || '?'} · ${(rd.ride.pickup || 'Pickup location').slice(0, 60)}`,
        sound: 'default',
        data: { type: 'new_ride' },
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
        notificationBody: 'Location active — ride requests aa rahi hain',
        notificationColor: '#E91E63',
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
  const [phone, setPhone]           = useState('');
  const [isOnline, setIsOnline]     = useState(false);
  const [rideReq, setRideReq]       = useState<any>(null);
  const [activeRide, setActiveRide] = useState<any>(null);
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
  const [driverSubScreen, setDrSubScreen] = useState<'' | 'documents' | 'bank' | 'support' | 'settings' | 'complaints' | 'complaint-new' | 'complaint-detail'>('');
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
  const [paymentRideId, setPaymentRideId] = useState('');
  const [paymentFare, setPaymentFare]     = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [driverGps, setDriverGps]   = useState<any>(null);
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
  const [payoutInput, setPayoutInput] = useState('');
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [walletLoaded, setWalletLoaded] = useState(false);

  // Commission data
  const [commissionData, setCommissionData] = useState<{ pending_commission: number; total_commission: number; settled_commission: number; records: any[]; payments: any[] }>({ pending_commission: 0, total_commission: 0, settled_commission: 0, records: [], payments: [] });
  const [commPayLoading, setCommPayLoading] = useState(false);
  const [commResult, setCommResult] = useState('');

  // ── Demand Heatmap + Driver Level ────────────
  const [demandZones, setDemandZones] = useState<any[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const zonesIntervalRef = useRef<any>(null);
  const [driverLevel, setDriverLevel] = useState<any>(null);

  // Ride extension
  const [extRequest, setExtRequest]       = useState<any>(null); // pending extension from customer
  const [extRespSec, setExtRespSec]       = useState(60);
  const [extAccLoading, setExtAccLoading] = useState(false);
  const [hExtendLoading, setHExtendLoading] = useState(false);

  // ── Surge + Admin Notif + Referral ───────────────
  const [surgeMultiplier, setSurgeMultiplier] = useState(1.0);
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
  const [hourlyOtpInput, setHourlyOtpInput]     = useState('');
  const [hourlyArrived, setHourlyArrived]       = useState(false);
const [hourlyTimerSec, setHourlyTimerSec]     = useState(0);
  const hourlyTimerRef = useRef<any>(null);
  const [hEarlyEndLoading, setHEarlyEndLoading] = useState(false);
  const [liveKm, setLiveKm]                     = useState(0);
  const prevHourlyGpsRef = useRef<{lat:number,lng:number}|null>(null);

  // Registration
  const [regStep, setRegStep]       = useState(0);
  const [regData, setRegData]       = useState<any>({ phone:'', vehicle_type:'', vehicle_brand:'', vehicle_model:'', vehicle_no:'', dl_name:'', dl_number:'', dl_photo:'', vehicle_photo:'', rc_photo:'', aadhaar_number:'', aadhaar_photo:'', face_photo:'' });
  const [uploading, setUploading]   = useState('');
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
  // Complaint system state
  const [drvComplaints, setDrvComplaints]   = useState<any[]>([]);
  const [drvCmpType, setDrvCmpType]         = useState('');
  const [drvCmpTitle, setDrvCmpTitle]       = useState('');
  const [drvCmpDesc, setDrvCmpDesc]         = useState('');
  const [drvCmpMsg, setDrvCmpMsg]           = useState('');
  const [drvCmpLoading, setDrvCmpLoading]   = useState(false);
  const [drvCmpDetail, setDrvCmpDetail]     = useState<any>(null);
  const [drvCmpStep, setDrvCmpStep]         = useState(1);
  const [drvCmpRideId, setDrvCmpRideId]     = useState('');
  const [lastRideId, setLastRideId]         = useState<string>('');

  useEffect(() => {
    if (driverSubScreen !== 'complaints' || !phone) return;
    setDrvCmpLoading(true);
    fetch(`${API}/api/complaints?phone=${encodeURIComponent(phone)}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.complaints)) setDrvComplaints(d.complaints); })
      .catch(() => {})
      .finally(() => setDrvCmpLoading(false));
  }, [driverSubScreen, phone]);

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
              navTo = 'home'; loadUpiId(savedPhone); registerFCM(savedPhone); promptBatteryOptimization(); fetchDriverLevel(savedPhone);
              // Restore active ride into store so home screen shows it immediately
              try {
                const ar = await fetch(`${API}/api/driver/active-ride?phone=${savedPhone}`).then(r => r.json());
                if (ar.ride) useDriverStore.setState({ activeRide: ar.ride });
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
    if (Platform.OS === 'android') {
      // v2 channel — Android locks channel settings after first creation; v2 forces
      // correct MAX+bypassDnd settings on every device regardless of previous installs.
      Notifications.setNotificationChannelAsync('ride_requests_v2', {
        name: 'Ride Requests',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 800, 200, 800, 200, 800],   // ~3 seconds
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
        showBadge: true,
      });
      // Keep old channel so old FCM tokens don't silently drop (some cached backend calls)
      Notifications.setNotificationChannelAsync('ride_requests', {
        name: 'Ride Requests (Legacy)',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
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
    // → start looping alarm immediately, then fetch ride details
    const sub1 = Notifications.addNotificationReceivedListener(n => {
      const data = n.request.content.data as any;
      if (data?.type === 'new_ride') {
        Vibration.vibrate([0, 800, 200, 800, 200, 800]); // ~3 seconds
        useDriverStore.getState().triggerPoll?.();
      }
    });

    // Tap: notification tapped (background/killed) → open home + poll
    const handleDriverNotifTap = (response: any) => {
      const data = response?.notification?.request?.content?.data as any;
      if (data?.type === 'new_ride') {
        setScreen('home'); setActiveTab('live');
        useDriverStore.getState().triggerPoll?.();
      }
      if (data?.type === 'compensation_credited' || data?.type === 'earning_credited') {
        setScreen('home'); setActiveTab('earnings');
      }
    };
    const sub2 = Notifications.addNotificationResponseReceivedListener(handleDriverNotifTap);
    Notifications.getLastNotificationResponseAsync().then(r => { if (r) handleDriverNotifTap(r); });

    // AppState: app comes back to foreground → immediate poll + socket reconnect
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        useDriverStore.getState().triggerPoll?.();
        const sock = (globalThis as any).__driverSocket;
        if (sock && !sock.connected) sock.connect();
        // Refresh wallet + commission so stale cache doesn't show
        const ph = useDriverStore.getState().activeRide?.driver_phone
          || (globalThis as any).__driverPhone;
        if (ph) { loadDriverWallet(ph); loadCommissionHistory(ph); registerFCM(ph); }
      }
    });

    return () => {
      sub1.remove();
      sub2.remove();
      appStateSub.remove();
    };
  }, []);


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
      '⚡ Notifications Enable Karo',
      'Nai ride requests theek se paane ke liye:\n\n1. "Band Karo" tap karo\n2. "Allow" select karo\n\nIsse app background mein bhi notifications milenge.',
      [
        { text: 'Baad Mein', style: 'cancel' },
        {
          text: '✅ Band Karo',
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
      if (screen === 'splash') return true; // Block back on splash
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
  }, [screen, regStep, showChat, activeTab, tripSummary, paymentWaiting, driverSubScreen]);

  // ── Polling rides ──────────────────────────────
  const startPolling = (dp: string) => {
    useDriverStore.getState().startPolling(dp, () => {
      Vibration.vibrate([0, 800, 200, 800, 200, 800]); // ~3 seconds
      setActiveTab('live');
      Notifications.scheduleNotificationAsync({
        content: {
          title: '🚖 Nayi Ride Request!',
          body: 'Passenger aapka intezaar kar raha hai — jaldi dekho!',
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
      if (d.success) { setDriverUpiId(d.upi_id); setResult('✅ UPI ID save ho gaya!'); }
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
  const loadReferralInfo = async () => {
    if (!phone) return;
    try {
      const r = await fetch(`${API}/api/referral/my-code?phone=${phone}`);
      const d = await r.json();
      if (d.code) { setReferralInfo(d); setReferralLoaded(true); }
    } catch (_e) {}
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
    if (isNaN(amt) || amt < 50) { setBonusMsg('❌ Minimum ₹50 redeem karo'); return; }
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
      setDriverHourlyHistory(d.hourly_rides || []);
      setWalletLoaded(true);
    } catch (_e) {}
  };
  const requestPayout = async () => {
    const amt = parseFloat(payoutInput);
    if (!amt || amt < 100) { setResult('❌ Min ₹100 chahiye payout ke liye'); return; }
    if (amt > driverWallet.balance) { setResult('❌ Wallet mein itna balance nahi hai'); return; }
    setPayoutLoading(true);
    try {
      const res = await fetch(`${API}/api/driver/payout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, amount: amt }) });
      const d = await res.json();
      if (d.success) {
        setResult('✅ ' + (d.message || 'Payout request submit ho gaya — admin 24-48 ghante mein process karega'));
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

  // ── Live distance to pickup (matched / arrived) ──
  useEffect(() => {
    if (!activeRide || !driverGps) { setDistToPickup(''); return; }
    if ((activeRide.status === 'matched' || activeRide.status === 'arrived') && activeRide.pickup_lat && activeRide.pickup_lng) {
      const km = haversineKm(driverGps.lat, driverGps.lng, parseFloat(activeRide.pickup_lat), parseFloat(activeRide.pickup_lng));
      setDistToPickup(km < 1 ? `${Math.round(km * 1000)} m se pickup` : `${km.toFixed(1)} km se pickup`);
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

  // ── Auto-switch to Live tab when a ride or request appears ──
  useEffect(() => {
    if (rideReq || activeRide || hourlyRideReq || activeHourlyRide) {
      setActiveTab('live');
    }
  }, [!!rideReq, !!activeRide, !!hourlyRideReq, !!activeHourlyRide]);

  // ── Chat polling ───────────────────────────────
  useEffect(() => {
    if (!showChat || !activeRide?.id) return;
    const load = async () => {
      try { const r = await fetch(`${API}/api/chat/${activeRide.id}`); const d = await r.json(); setChatMsgs(d.messages || []); lastChatCount.current = (d.messages || []).length; setUnreadChat(0); } catch (_e) {}
    };
    load();
    const iv = setInterval(load, 2500);
    return () => clearInterval(iv);
  }, [showChat, activeRide?.id]);

  // ── Hourly chat polling ──────────────────────
  useEffect(() => {
    if (!showHourlyChat || !activeHourlyRide?.id) return;
    const load = async () => {
      try {
        const r = await fetch(`${API}/api/hourly/chat/${activeHourlyRide.id}`);
        const d = await r.json();
        setHourlyChatMsgs(d.messages || []);
      } catch (_e) {}
    };
    load();
    const iv = setInterval(load, 2500);
    return () => clearInterval(iv);
  }, [showHourlyChat, activeHourlyRide?.id]);

  const sendHourlyChat = async (text?: string) => {
    const msg = text ?? hourlyChatInput;
    if (!msg.trim() || !activeHourlyRide?.id) return;
    if (!text) setHourlyChatInput('');
    try {
      await fetch(`${API}/api/hourly/chat/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: activeHourlyRide.id, sender: 'driver', message: msg }) });
      const r = await fetch(`${API}/api/hourly/chat/${activeHourlyRide.id}`);
      const d = await r.json();
      setHourlyChatMsgs(d.messages || []);
    } catch (_e) {}
  };

  // ── Hourly ride polling ───────────────────────
  useEffect(() => {
    if (!isOnline || !phone) return;
    let stopped = false;
    let busy = false;
    const iv = setInterval(async () => {
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
    }, 4000);
    return () => { stopped = true; clearInterval(iv); };
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

  // Extension response countdown
  useEffect(() => {
    if (!extRequest) return;
    setExtRespSec(extRequest.seconds_left ?? 60);
    const iv = setInterval(() => setExtRespSec(s => { if (s <= 1) { clearInterval(iv); setExtRequest(null); return 0; } return s - 1; }), 1000);
    return () => clearInterval(iv);
  }, [extRequest?.id]);

  const acceptExtension = async () => {
    if (!extRequest) return;
    setExtAccLoading(true);
    try {
      const res = await fetch(`${API}/api/rides/extension-accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ extension_id: extRequest.id }) });
      const data = await res.json();
      if (data.success) {
        // Fetch new ride and go active
        const rideRes = await fetch(`${API}/api/rides/status/${data.new_ride_id}`).then(r => r.json());
        const newRide = rideRes.ride || { id: data.new_ride_id, drop_location: extRequest.new_drop, fare: extRequest.estimated_fare, status: 'matched', payment_method: 'wallet' };
        setActiveRide({ ...newRide, id: data.new_ride_id });
        setExtRequest(null); setTripSummary(null);
      } else { setResult('❌ ' + (data.error || 'Accept nahi hua')); }
    } catch (_e) { setResult('❌ Network error'); }
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
            chatToastTimer.current = setTimeout(() => setChatToast(null), 4500);
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
        const r = await fetch(`${API}/api/hourly/chat/${activeHourlyRide.id}`);
        const d = await r.json();
        const msgs = d.messages || [];
        if (msgs.length > lastCount) {
          const latest = msgs[msgs.length - 1];
          if (latest?.sender === 'customer') {
            setChatToast(latest.message);
            if (chatToastTimer.current) clearTimeout(chatToastTimer.current);
            chatToastTimer.current = setTimeout(() => setChatToast(null), 4500);
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
    if (loginPhone.length !== 10) { setResult('❌ 10 digit number daalo'); return; }
    setLoading(true);
    try {
      // Pehle OTP bhejo
      const otpRes = await fetch(`${API}/api/auth/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: loginPhone }) });
      const otpData = await otpRes.json();
      if (otpData.error) { setResult('❌ ' + otpData.error); setLoading(false); return; }
      if (otpData.otp) setDevOtp(otpData.otp);
      setLoginOtpSent(true);
      setLoginResendTimer(60); setLoginCanResend(false);
      setResult('');
    } catch (_e) { setResult('❌ Server error'); }
    setLoading(false);
  };

  const verifyLoginOtp = async (otpOverride?: string) => {
    const otpToUse = otpOverride || loginOtp;
    if (!otpToUse || otpToUse.length !== 6) { setResult('❌ 6 digit OTP daalo'); return; }
    setLoading(true);
    try {
      // OTP verify karo
      const verRes = await fetch(`${API}/api/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: loginPhone, otp: otpToUse, name: '' }) });
      const verData = await verRes.json();
      if (!verData.token) { setResult('❌ ' + (verData.error || 'Galat OTP')); setLoading(false); return; }

      // Driver info lo
      const res = await fetch(`${API}/api/driver/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: loginPhone }) });
      const data = await res.json();
      if (!data.success) { setResult('❌ ' + data.message); setLoading(false); return; }
      if (data.driver.status === 'approved') {
        setPhone(data.driver.phone); setDriverInfo(data.driver); setScreen('home'); setResult('');
        await AsyncStorage.setItem('driverPhone', data.driver.phone);
        await AsyncStorage.setItem('driverInfo', JSON.stringify(data.driver));
        registerFCM(data.driver.phone);
        promptBatteryOptimization();
        loadUpiId(data.driver.phone); loadDriverOffers(); fetchDriverLevel(data.driver.phone);
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

  const doUpload = async (field: string, base64: string) => {
    setUploading(field);
    try {
      const up   = await fetch(`${API}/api/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: `data:image/jpeg;base64,${base64}` }) });
      const data = await up.json();
      if (data.success) setRegData((p: any) => ({ ...p, [field]: data.url }));
      else setResult('❌ Upload fail');
    } catch (_e) { setResult('❌ Upload error'); }
    setUploading('');
  };

  const fromCamera = async (field: string) => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) { setResult('❌ Camera permission do'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true, cameraType: field === 'face_photo' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back });
    if (!r.canceled && r.assets?.[0]?.base64) doUpload(field, r.assets[0].base64);
  };

  const fromGallery = async (field: string) => {
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) { setResult('❌ Gallery permission do'); return; }
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
      else setResult('❌ ' + (data.error || 'Registration fail'));
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
            body: 'Ride requests receive ho rahi hain. Screen lock karo — notification aayegi.',
            sticky: true,
            autoDismiss: false,
            data: { type: 'driver_status' },
            ...(Platform.OS === 'android' ? { channelId: 'driver_status' } : {}),
          },
          trigger: null,
        }).then(id => { onlineNotifIdRef.current = id; }).catch(() => {});

        // Guide user to grant background location — only on Android, once per install
        if (Platform.OS === 'android') {
          AsyncStorage.getItem('bgLocPromptShown').then(shown => {
            if (shown) return;
            AsyncStorage.setItem('bgLocPromptShown', '1').catch(() => {});
            Alert.alert(
              '📍 Background Location Allow Karo',
              'App minimize karne ke baad bhi aapki location update hoti rahe, iske liye:\n\n' +
              '1. "Settings Kholein" tap karo\n' +
              '2. Location → "Allow all the time" select karo\n\n' +
              'Isse customer aapko map pe live track kar sakenge.',
              [
                { text: 'Settings Kholein', onPress: () => Linking.openSettings() },
                { text: 'Baad Mein', style: 'cancel' },
              ]
            );
          }).catch(() => {});
        }
      }

      // Refresh FCM token every time driver goes online — prevents stale token failures
      registerFCM(phone).catch(() => {});

      // Battery optimization prompt — once per install on Android.
      // Required on ALL phones (Xiaomi/Samsung/Nothing) so background ride alerts work.
      // Linking.openSettings() opens the app's info page → battery section is there.
      if (Platform.OS === 'android') {
        AsyncStorage.getItem('_battOpShown').then(shown => {
          if (shown) return;
          AsyncStorage.setItem('_battOpShown', '1').catch(() => {});
          Alert.alert(
            '🔔 Ride Alert Setup — 1 Min',
            'App minimize karne ke baad bhi ride alert aaye, iske liye battery restriction hatao:\n\n' +
            '📱 Sabhi phones:\n  Settings → Battery → Battery Optimization → Sppero Buddy → "Don\'t Optimize"\n\n' +
            '🔴 Xiaomi/Redmi: Auto-start bhi ON karo\n' +
            '🔵 Samsung: "Unrestricted" choose karo\n' +
            '⚫ Nothing/CMF: App Battery Management → "No Restriction"\n\n' +
            'Yeh sirf ek baar karna hai.',
            [
              { text: 'Baad Mein', style: 'cancel' },
              { text: '⚙️ Settings Kholo', onPress: () => Linking.openSettings() },
            ]
          );
        }).catch(() => {});
      }

      // Start polling + socket IMMEDIATELY — don't wait for server roundtrip
      setResult('🟢 Online hain — rides aayengi!');
      (globalThis as any).__driverPhone = phone; // for AppState wallet refresh
      startPolling(phone);
      fetchDemandZones();
      if (zonesIntervalRef.current) clearInterval(zonesIntervalRef.current);
      zonesIntervalRef.current = setInterval(fetchDemandZones, 120000); // every 2 min
      loadDriverOffers();
      if (!socketRef.current?.connected) {
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
        s.on('newRideAssigned', () => { useDriverStore.getState().triggerPoll?.(); });
        s.on('paymentConfirmed', async (data: any) => {
          if (data.status !== 'completed') return;
          try {
            const res = await fetch(`${API}/api/rides/payment-status/${data.ride_id}`);
            const d = await res.json();
            if (d.payment_status === 'completed') {
              const fare = parseFloat(d.fare || 0);
              setPaymentMethod(d.payment_method || '');
              setPaymentWaiting(false);
              setTripSummary({
                fare: String(d.fare),
                payment_method: d.payment_method,
                earned: '₹' + (fare * 0.85).toFixed(0),
                fee: '₹' + (fare * 0.15).toFixed(0),
              });
            }
          } catch (_e) {}
        });
        s.on('chatMessage', (msg: any) => {
          setChatMsgs((prev: any[]) => [...prev, msg]);
          setUnreadChat((prev: number) => prev + 1);
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
      setResult('🔴 Offline hain');
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
      setResult('✅ Ride accept ki!');
      socketRef.current?.emit('joinRide', { rideId: rideReq.id });
      // Clear store + React state immediately so subscription can't restore stale rideReq
      useDriverStore.setState({ pendingRide: null });
      setRideReq(null);
      fetchEta(rideReq.pickup, rideReq.drop_location);
      // Trigger an immediate poll so activeRide populates in <1s instead of waiting 2s
      useDriverStore.getState().triggerPoll();
    } else {
      setResult('❌ ' + (data.message || 'Ride kisi aur ko mil gayi'));
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
    setResult('❌ Ride reject ki');
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
    if (otpInput.length !== 4) { setResult('❌ 4 digit OTP daalo'); return; }
    setLoading(true);
    const data = await apiPost('/api/rides/start', { ride_id: activeRide.id, otp: otpInput, driver_phone: phone });
    if (data._error) setResult('❌ ' + data.message);
    else if (data.success) { setActiveRide({ ...activeRide, status: 'started' }); setOtpInput(''); setResult(''); }
    else setResult('❌ ' + (data.message || 'Galat OTP!'));
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
        const confirm = await new Promise<boolean>(resolve =>
          Alert.alert(
            '⚠️ Aap drop location se door hain',
            `Aap abhi drop se ${distKm.toFixed(1)}km door hain.\n\nAbhi complete karne se platform policy violation hoga aur customer ko alert jaayega. Kya waqai complete karna chahte ho?`,
            [
              { text: 'Cancel — Drop Karo Pehle', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Haan, Complete Karo', style: 'destructive', onPress: () => resolve(true) },
            ]
          )
        );
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
          Alert.alert(
            '⚠️ Early Completion Flagged',
            `Trip complete hua — lekin system ne detect kiya ki aap drop se ${data.dist_from_drop}km door the.\n\nCustomer ko alert bheja gaya hai aur yeh policy violation record hua.`,
            [{ text: 'Samajh Gaya' }]
          );
        }
        setPaymentRideId(rideId);
        setPaymentFare(rideFare);
        setPaymentMethod(ridePMethod);
        setPaymentWaiting(true);
        setEarnings(e => e + parseFloat(rideFare));
        setRides(r => r + 1);
        setLastRideId(rideId);
        setActiveRide(null);
        setOtpInput(''); setShowChat(false); setUnreadChat(0); setChatMsgs([]);
      } else {
        setResult('❌ ' + (data.message || data.error || 'Complete nahi hua, retry karo'));
      }
    } catch (_e) {
      setResult('❌ Network error — check internet aur retry karo');
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
    if (!bankAccount.trim() || !bankIfsc.trim()) { setBankMsg('❌ Account number aur IFSC dono chahiye'); return; }
    setBankSaving(true); setBankMsg('');
    try {
      const res = await fetch(`${API}/api/driver/bank`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, bank_account: bankAccount, bank_ifsc: bankIfsc, bank_holder: bankHolder }),
      });
      const d = await res.json();
      if (d.success) { setBankMsg('✅ Bank details save ho gayi!'); setBankEditing(false); }
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
      await apiPost('/api/rides/cash-confirm', { ride_id: paymentRideId, phone, payment_method: method });
      setPaymentWaiting(false);
      const fare = parseFloat(paymentFare || '0');
      setTripSummary({
        fare: paymentFare,
        payment_method: method === 'upi_direct' ? 'upi' : 'cash',
        earned: '₹' + (fare * 0.85).toFixed(0),
        fee: '₹' + (fare * 0.15).toFixed(0),
      });
    } catch (_e) { setResult('❌ Error'); }
    setLoading(false);
  };

  const cancelTrip = async () => {
    setLoading(true);
    try {
      const cd = await apiPost('/api/rides/cancel-smart', { ride_id: activeRide.id, cancelled_by: 'driver', reason: cancelReason || 'Driver cancelled', phone });
      if (cd.success) {
        setResult(cd.message ? '⚠️ ' + cd.message : '❌ Trip cancel ki');
        setActiveRide(null);
        useDriverStore.setState({ activeRide: null });
        setShowDriverCancelModal(false);
      } else {
        setResult('❌ Cancel nahi hua — retry karo');
      }
    } catch (_e) {
      setResult('❌ Network error — retry karo');
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
      if (!data.success) { Alert.alert('Call', data.error || 'Call nahi ho saki'); return; }
      if (data.method === 'direct' && data.call_number) Linking.openURL(`tel:${data.call_number}`);
      else if (data.method === 'exotel') Alert.alert('📞 Calling', 'Customer ko call aa rahi hai...');
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
      else { setResult('❌ ' + (data.message || 'Accept nahi hua')); setHourlyRideReq(null); }
    } catch (_e) { setResult('❌ Network error'); }
    setLoading(false);
  };

  const startHourlyTrip = async () => {
    if (!activeHourlyRide) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/hourly/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: activeHourlyRide.id, otp: hourlyOtpInput }) });
      const data = await res.json();
      if (data.success) { setActiveHourlyRide((p: any) => ({ ...p, status: 'active', started_at: new Date().toISOString() })); setHourlyOtpInput(''); setResult(''); }
      else setResult('❌ ' + (data.message || 'Galat OTP!'));
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
      } else setResult('❌ ' + (data.message || 'Complete nahi hua'));
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
        setResult(data.message || 'Request nahi ho saki');
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
        setResult('✅ Extension accept ho gaya!');
        setTimeout(() => setResult(''), 3000);
      } else {
        setResult('❌ ' + (data.message || data.error || 'Accept nahi hua'));
      }
    } catch (_e) { setResult('❌ Network error — dobara try karo'); }
    setHExtendLoading(false);
  };

  const rejectExtend = async () => {
    if (!activeHourlyRide || hExtendLoading) return;
    setHExtendLoading(true);
    try {
      await fetch(`${API}/api/hourly/reject-extend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: activeHourlyRide.id }) });
      setActiveHourlyRide((p: any) => ({ ...p, extend_requested_hours: null }));
    } catch (_e) { setResult('❌ Network error'); }
    setHExtendLoading(false);
  };

  // ── PhotoBox ───────────────────────────────────
  const PhotoBox = ({ field, label, icon, cameraOnly }: any) => (
    <View style={rs.photoBox}>
      {regData[field] ? (
        <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 32 }}>✅</Text><Text style={{ color: '#16A34A', fontWeight: '600', marginTop: 4 }}>Uploaded</Text></View>
      ) : uploading === field ? (
        <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 32 }}>⏳</Text><Text style={{ color: '#666', marginTop: 4 }}>Uploading...</Text></View>
      ) : (
        <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 28 }}>{icon}</Text><Text style={{ color: '#666', fontWeight: '600', marginTop: 4, marginBottom: 10 }}>{label}</Text></View>
      )}
      {cameraOnly ? (
        <View style={{ marginTop: 8, width: '100%' }}>
          <TouchableOpacity style={rs.uploadBtn} onPress={() => fromCamera(field)}><Text style={rs.uploadBtnTxt}>📷 Selfie Lo</Text></TouchableOpacity>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <TouchableOpacity style={rs.uploadBtn} onPress={() => fromCamera(field)}><Text style={rs.uploadBtnTxt}>📷 Camera</Text></TouchableOpacity>
          <TouchableOpacity style={rs.uploadBtn} onPress={() => fromGallery(field)}><Text style={rs.uploadBtnTxt}>🖼️ Gallery</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );

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
        borderWidth: 2, borderColor: '#16A34A',
        alignItems: 'center', justifyContent: 'center',
        elevation: 20,
        shadowColor: '#16A34A', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 22,
        opacity: splashLogo,
        transform: [{ scale: splashScale }],
      }}>
        <Text style={{ fontSize: 52 }}>🚗</Text>
      </Animated.View>

      {/* Brand name */}
      <Animated.View style={{ alignItems: 'center', marginTop: 22, opacity: splashLogo }}>
        <Text style={{ color: '#ffffff', fontSize: 40, fontWeight: '900', letterSpacing: 0.5 }}>
          Sppero <Text style={{ color: '#16A34A' }}>Buddy</Text>
        </Text>
        <View style={{ width: 48, height: 2, backgroundColor: '#16A34A', borderRadius: 1, marginTop: 8, opacity: 0.7 }} />
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
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A' }} />
        <Text style={{ color: '#16A34A', fontSize: 12, fontWeight: '700', letterSpacing: 1.2 }}>CAPTAIN PORTAL</Text>
      </Animated.View>

      {/* Animated dots at bottom */}
      <View style={{ position: 'absolute', bottom: 54, alignItems: 'center' }}>
        <FloatingDots color="#4CAF50" />
      </View>
    </Animated.View>
  );

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
      <View style={{ height: 4, backgroundColor: '#333' }}><View style={{ height: 4, backgroundColor: '#E91E63', width: '20%' }} /></View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 110 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {!loginOtpSent ? (
          <View>
            <View style={{ flexDirection:'row', alignItems:'center', marginTop:10, marginBottom:6 }}>
              <Ionicons name="phone-portrait" size={26} color="#4CAF50" style={{ marginRight:10 }} />
              <Text style={[rs.bigTitle, { marginTop:0 }]}>Phone Number</Text>
            </View>
            <Text style={rs.subTitle}>Aapka mobile number daalo — OTP se verify hoga</Text>
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
                  const res = await fetch(`${API}/api/auth/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: regData.phone }) });
                  const data = await res.json();
                  if (data.error) { setResult('❌ ' + data.error); }
                  else { if (data.otp) setDevOtp(data.otp); setLoginOtpSent(true); setLoginResendTimer(60); setLoginCanResend(false); }
                } catch (_e) { setResult('❌ Server error'); }
                setLoading(false);
              }}>
              <Text style={s.btnTxt}>{loading ? '⏳ OTP bhej raha hai...' : 'OTP Bhejo 📱'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={rs.bigTitle}>🔐 OTP Verify Karo</Text>
            <Text style={rs.subTitle}>+91 {regData.phone} pe OTP bheja gaya</Text>
            <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 10, padding: 12, marginTop: 16, marginBottom: 20, flexDirection: 'row', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>💡</Text>
              <Text style={{ fontSize: 12, color: '#F59E0B', flex: 1 }}>SMS aane par OTP copy karo — boxes mein auto fill ho jaayega!</Text>
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
                  else setResult('❌ ' + (data.error || 'Galat OTP'));
                } catch (_e) { setResult('❌ Server error'); }
                setLoading(false);
              }}>
              <Text style={s.btnTxt}>{loading ? '⏳ Verify ho raha hai...' : '✅ Verify & Aage Badho'}</Text>
            </TouchableOpacity>
            {/* Resend */}
            <View style={{ alignItems: 'center', marginTop: 16 }}>
              {loginCanResend ? (
                <TouchableOpacity onPress={() => { setLoginOtpDigits(['','','','','','']); setResult(''); fetch(`${API}/api/auth/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: regData.phone }) }); setLoginResendTimer(60); setLoginCanResend(false); }}>
                  <Text style={{ color: '#E91E63', fontWeight: 'bold' }}>🔄 OTP Dobara Bhejo</Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ color: '#999', fontSize: 13 }}>Dobara bhejne ke liye <Text style={{ color: '#E91E63', fontWeight: 'bold' }}>{loginResendTimer}s</Text> wait karo</Text>
              )}
            </View>
            <TouchableOpacity onPress={() => { setLoginOtpSent(false); setLoginOtpDigits(['','','','','','']); }} style={{ alignItems: 'center', marginTop: 12 }}>
              <Text style={{ color: '#666', fontSize: 13 }}>← Number change karo</Text>
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
      <View style={{ height: 4, backgroundColor: '#333' }}><View style={{ height: 4, backgroundColor: '#E91E63', width: '40%' }} /></View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 110 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection:'row', alignItems:'center', marginTop:10, marginBottom:6 }}>
          <Ionicons name="car-sport" size={26} color="#4CAF50" style={{ marginRight:10 }} />
          <Text style={[rs.bigTitle, { marginTop:0 }]}>Vehicle Type</Text>
        </View><Text style={rs.subTitle}>Aap kya chalate hain?</Text>
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
              v.color && { borderWidth: 2, borderColor: regData.vehicle_type === v.id ? '#E91E63' : v.color }]}
            onPress={() => { updateReg('vehicle_type', v.id); updateReg('vehicle_brand', ''); updateReg('vehicle_model', ''); }}>
            <View style={{ marginRight: 16, width: 38, alignItems: 'center' }}>
              {v.mci
                ? <MaterialCommunityIcons name={v.mci as any} size={30} color={regData.vehicle_type === v.id ? '#fff' : (v.color || '#94A3B8')} />
                : <Ionicons name={v.ion as any} size={28} color={regData.vehicle_type === v.id ? '#fff' : (v.color || '#94A3B8')} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[{ fontSize: 18, fontWeight: '600', color: '#0F172A' }, regData.vehicle_type === v.id && { color: '#16A34A' }]}>{v.label}</Text>
              {v.sub ? <Text style={{ fontSize: 11, color: regData.vehicle_type === v.id ? '#ddd' : (v.color || '#64748B'), marginTop: 2 }}>{v.sub}</Text> : null}
            </View>
            {regData.vehicle_type === v.id && <Text style={{ color: '#fff', fontSize: 20 }}>✓</Text>}
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[s.btn, !regData.vehicle_type && { opacity: 0.5 }]} disabled={!regData.vehicle_type} onPress={() => { setResult(''); setRegStep(3); }}><Text style={s.btnTxt}>Aage badho →</Text></TouchableOpacity>
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
        <View style={{ height: 4, backgroundColor: '#333' }}><View style={{ height: 4, backgroundColor: '#E91E63', width: '60%' }} /></View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 110 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection:'row', alignItems:'center', marginTop:10, marginBottom:6 }}>
            <Ionicons name="document-text" size={26} color="#4CAF50" style={{ marginRight:10 }} />
            <Text style={[rs.bigTitle, { marginTop:0 }]}>Driving License</Text>
          </View>
          <Text style={rs.subTitle}>DL ki details — naam, number aur photo</Text>

          <View style={rs.adviceBox}>
            <Text style={rs.adviceTitle}>📸 DL Photo Tips:</Text>
            <Text style={rs.adviceText}>• DL ka front side — clear aur bright photo lo</Text>
            <Text style={rs.adviceText}>• Sab kuch readable ho — naam, number, expiry</Text>
            <Text style={[rs.adviceText, { marginTop: 6, fontWeight: '700', color: '#c62828' }]}>⚠️ Expired DL mat submit karo — reject ho jayega</Text>
          </View>

          <Text style={rs.fieldLabel}>DL pe likha naam *</Text>
          <TextInput style={rs.input} placeholder="Full name jaise DL pe hai" value={regData.dl_name} onChangeText={(v) => updateReg('dl_name', v)} />

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
              <Text style={{ fontSize: 11, color: '#2e7d32', fontWeight: '700' }}>✅ DL number format sahi hai</Text>
            ) : (
              <Text style={{ fontSize: 11, color: '#e65100' }}>⚠️ {15 - dlCleaned.length} characters baaki — Format: UP14 2021 0012345</Text>
            )}
          </View>

          <Text style={rs.fieldLabel}>DL Photo (front side clear) *</Text>
          <PhotoBox field="dl_photo" label="DL Photo" icon="📄" />

          {result ? <Text style={s.err}>{result}</Text> : null}
          <TouchableOpacity
            style={[s.btn, !step3Ok && { opacity: 0.5 }]}
            disabled={!step3Ok}
            onPress={() => { setResult(''); setRegStep(4); }}>
            <Text style={s.btnTxt}>Aage badho →</Text>
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
        <View style={{ height: 4, backgroundColor: '#333' }}><View style={{ height: 4, backgroundColor: '#E91E63', width: '80%' }} /></View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 110 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection:'row', alignItems:'center', marginTop:10, marginBottom:6 }}>
            <Ionicons name="car" size={26} color="#4CAF50" style={{ marginRight:10 }} />
            <Text style={[rs.bigTitle, { marginTop:0 }]}>Vehicle Details</Text>
          </View>
          <Text style={rs.subTitle}>
            {regData.vehicle_type === 'eriksha'       ? 'E-Riksha: photo zaruri, number optional' :
             regData.vehicle_type === 'luxury'        ? 'Premium vehicle — brand, model aur number' :
             regData.vehicle_type === 'green_bike'    ? 'Electric Bike — brand, model, number aur photos' :
             regData.vehicle_type === 'electric_auto' ? 'Electric Auto — model, number aur photos' :
             'Brand, model, number aur photos'}
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
                        style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: regData.vehicle_brand === b ? 'rgba(22,163,74,0.08)' : '#F8FAFC', borderWidth: 2, borderColor: regData.vehicle_brand === b ? '#16A34A' : '#E2E8F0' }}>
                        <Text style={{ fontWeight: '700', color: regData.vehicle_brand === b ? '#16A34A' : '#9CA3AF', fontSize: 13 }}>{b}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {regData.vehicle_brand
                    ? <Text style={{ color: '#2e7d32', fontSize: 12 }}>✅ {regData.vehicle_brand}</Text>
                    : <Text style={{ color: '#e65100', fontSize: 12 }}>Ek brand select karo</Text>}
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
                        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: regData.vehicle_model === m ? 'rgba(233,30,99,0.06)' : '#F8FAFC', borderWidth: 1, borderColor: regData.vehicle_model === m ? '#E91E63' : '#E2E8F0' }}>
                        <Text style={{ fontWeight: '600', color: regData.vehicle_model === m ? '#E91E63' : '#9CA3AF', fontSize: 13 }}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {regData.vehicle_model
                    ? <Text style={{ color: '#2e7d32', fontSize: 12 }}>✅ Model: {regData.vehicle_model}</Text>
                    : <Text style={{ color: '#e65100', fontSize: 12 }}>{regData.vehicle_brand ? 'Model select karo' : 'Pehle brand select karo'}</Text>}
                </View>
              ) : regData.vehicle_type === 'luxury' ? (
                <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
                  <Text style={{ color: '#F59E0B', fontSize: 13 }}>Pehle upar brand select karo — fir model dikhega</Text>
                </View>
              ) : (
                <>
                  <TextInput
                    style={[rs.input, { marginBottom: 4 }]}
                    placeholder={modelPlaceholder[regData.vehicle_type] || 'Vehicle model likhao'}
                    value={regData.vehicle_model}
                    onChangeText={(v) => updateReg('vehicle_model', v)}
                  />
                  <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>Model = brand ke baad ka specific name (eg. Hyundai → Creta)</Text>
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
              {vnValid ? '✅ Format sahi — ' + vnCleaned : '⚠️ Format: UP32AB1234 (2 letter + 2 digit + letters + 4 digit)'}
            </Text>
          ) : null}

          {/* ── Photos ── */}
          <Text style={[rs.fieldLabel, { marginTop: 18 }]}>Vehicle Front Photo *</Text>
          <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>Number plate clearly visible honi chahiye</Text>
          <PhotoBox field="vehicle_photo" label="Vehicle Photo" icon="🚗" />

          <Text style={[rs.fieldLabel, { marginTop: 14 }]}>RC (Registration Certificate) Photo</Text>
          <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>Optional — lekin jaldi verify hoga agar doge</Text>
          <PhotoBox field="rc_photo" label="RC Photo" icon="📋" />

          {result ? <Text style={s.err}>{result}</Text> : null}
          <TouchableOpacity style={[s.btn, !step4Ok && { opacity: 0.5 }]} disabled={!step4Ok} onPress={() => { setResult(''); setRegStep(5); }}>
            <Text style={s.btnTxt}>Aage badho →</Text>
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
        <View style={{ height: 4, backgroundColor: '#333' }}><View style={{ height: 4, backgroundColor: '#E91E63', width: '100%' }} /></View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 110 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection:'row', alignItems:'center', marginTop:10, marginBottom:6 }}>
            <Ionicons name="id-card" size={26} color="#94A3B8" style={{ marginRight:10 }} />
            <Text style={[rs.bigTitle, { marginTop:0 }]}>Aadhaar & Selfie</Text>
          </View>
          <Text style={rs.subTitle}>Last step — aur aap ho jayenge!</Text>

          <View style={[rs.adviceBox, { backgroundColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.25)', borderWidth: 1 }]}>
            <Text style={[rs.adviceTitle, { color: '#10B981' }]}>🔒 Privacy Note:</Text>
            <Text style={[rs.adviceText, { color: '#6EE7B7' }]}>• Aapka Aadhaar sirf verification ke liye hai</Text>
            <Text style={[rs.adviceText, { color: '#6EE7B7' }]}>• Documents securely store kiye jaate hain</Text>
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
              {aadhaarOk ? '✅ 12 digit Aadhaar sahi hai' : `⚠️ ${12 - aadhaarDigits.length} digit aur chahiye`}
            </Text>
          )}

          <Text style={[rs.fieldLabel, { marginTop: 18 }]}>Aadhaar Photo *</Text>
          <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>Front side — naam aur number clearly visible ho</Text>
          <PhotoBox field="aadhaar_photo" label="Aadhaar Photo" icon="🪪" />

          <Text style={[rs.fieldLabel, { marginTop: 18 }]}>Live Selfie *</Text>
          <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 10, padding: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
            <Text style={{ fontSize: 16, marginRight: 8 }}>🔒</Text>
            <Text style={{ fontSize: 11, color: '#F59E0B', flex: 1 }}>Sirf live camera se selfie — gallery se upload nahi hoga. Saaf light mein, seedha chehra.</Text>
          </View>
          <PhotoBox field="face_photo" label="Live Selfie" icon="🤳" cameraOnly />

          {result ? <Text style={s.err}>{result}</Text> : null}
          <TouchableOpacity
            style={[s.btn, !step5Ok && { opacity: 0.5 }, { marginTop: 20 }]}
            disabled={!step5Ok || loading}
            onPress={submitRegistration}>
            <Text style={s.btnTxt}>{loading ? '⏳ Submit ho raha hai...' : '✅ Registration Submit Karo'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ═══ REGISTRATION DONE ═══
  if (screen === 'login' && regStep === 99) return (
    <View style={s.screen}>
      <View style={s.hero}>
        <Text style={{ fontSize: 70 }}>🎉</Text>
        <Text style={s.heroTitle}>Application Submit!</Text>
        <Text style={{ color: '#aaa', fontSize: 13, marginTop: 4 }}>Sppero Buddy Captain</Text>
      </View>
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Text style={{ fontSize: 16, color: '#94A3B8', textAlign: 'center', lineHeight: 26 }}>
          Aapki Sppero Buddy Captain application submit ho gayi! ✅{'\n\n'}Admin aapke sare documents — DL, Aadhaar, Vehicle aur Selfie — verify karega.
        </Text>
        <View style={{ backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 12, padding: 16, marginTop: 16, width: '100%', borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' }}>
          <Text style={{ color: '#10B981', textAlign: 'center', fontWeight: '600', fontSize: 13 }}>✅ Verification hone ke baad app khud notify kar dega</Text>
        </View>
        <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 12, padding: 16, marginTop: 10, width: '100%', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
          <Text style={{ color: '#F59E0B', textAlign: 'center', fontWeight: '600' }}>⏳ Status: Verification Pending</Text>
        </View>
        <TouchableOpacity style={[s.btn, { marginTop: 24, width: '100%' }]} onPress={() => { setRegStep(0); setPhone(regData.phone); }}>
          <Text style={s.btnTxt}>🏠 Login Screen pe jao</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ═══ VERIFICATION STATUS ═══
  if (screen === 'login' && driverInfo && driverInfo.status !== 'approved') {
    const statusConfig: any = {
      pending:   { icon: '⏳', title: 'Verification Pending',    bg: '#fff3e0', col: '#ef6c00', msg: 'Aapke documents admin verify kar raha hai. Thodi der mein status update hoga.' },
      rejected:  { icon: '❌', title: 'Documents Reject Ho Gaye', bg: '#ffebee', col: '#c62828', msg: 'Aapke documents mein problem hai — neeche admin message padho aur resubmit karo.' },
      resubmit:  { icon: '📋', title: 'Documents Resubmit Karein', bg: '#e3f2fd', col: '#1565c0', msg: 'Admin ne kuch documents dobara maange hain — neeche message padho aur upload karo.' },
      suspended: { icon: '🚫', title: 'Account Suspended',        bg: '#ffebee', col: '#c62828', msg: 'Aapka account suspend kar diya gaya hai. Support se contact karo.' },
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
              <Text style={{ fontSize: 13, color: '#94A3B8', marginBottom: 6, fontWeight: '600' }}>📩 Admin ka message:</Text>
              <Text style={{ fontSize: 15, color: '#0F172A', fontWeight: '500', lineHeight: 22 }}>{driverInfo.admin_message}</Text>
            </View>
          ) : null}
          {(driverInfo.status === 'rejected' || driverInfo.status === 'resubmit') && (
            <TouchableOpacity style={s.btn} onPress={() => { setRegData((p: any) => ({ ...p, phone: driverInfo.phone })); setDriverInfo(null); setRegStep(2); }}>
              <Text style={s.btnTxt}>📄 Documents Resubmit Karo</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.btn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#E2E8F0', marginTop: 10 }]} onPress={() => { setDriverInfo(null); setLoginPhone(''); setResult(''); }}>
            <Text style={[s.btnTxt, { color: '#64748B' }]}>← Wapas Login pe jao</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ═══ LOGIN ═══
  if (screen === 'login') {
    const LOGIN_CAPTIONS = [
      { emoji: '👑', line1: 'Become Your', line2: 'Own Boss', sub: 'No office. No fixed hours. You decide when you drive.' },
      { emoji: '🗺️', line1: 'Help People Reach', line2: 'Their Destination', sub: 'Every ride is a story of trust & service.' },
      { emoji: '💰', line1: 'Earn ₹800+', line2: 'Every Day', sub: 'Steady income credited instantly to your wallet.' },
      { emoji: '🛺', line1: 'India Ka Apna', line2: 'Ride Platform', sub: 'Built for Bharat. Powered by 10,000+ Captains.' },
      { emoji: '⭐', line1: 'Join & Keep', line2: 'Earning Daily', sub: 'Morning, afternoon or night — your schedule, your earnings.' },
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
                <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(233,30,99,0.14)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(233,30,99,0.5)', elevation: 12, shadowColor: '#E91E63', shadowOpacity: 0.6, shadowRadius: 16 }}>
                  <Ionicons name="car-sport" size={44} color="#E91E63" />
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
                <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: '#E91E63', alignItems: 'center', justifyContent: 'center', elevation: 10, shadowColor: '#E91E63', shadowOpacity: 0.9, shadowRadius: 12 }}>
                  <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>S</Text>
                </View>
                <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '900', letterSpacing: 0.5 }}>Sppero</Text>
                <View style={{ backgroundColor: 'rgba(233,30,99,0.22)', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(233,30,99,0.55)' }}>
                  <Text style={{ color: '#E91E63', fontSize: 9, fontWeight: '900', letterSpacing: 1.6 }}>CAPTAIN</Text>
                </View>
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '700', letterSpacing: 2.5 }}>INDIA KA APNA RIDE PLATFORM</Text>
            </View>

            {/* Animated motivational caption */}
            <View style={{ position: 'absolute', top: '28%', left: 0, right: 0, paddingHorizontal: 28, alignItems: 'center' }}>
              <Animated.View style={{ alignItems: 'center', opacity: loginCaptionFade, transform: [{ translateY: loginCaptionSlide }] }}>
                <Text style={{ fontSize: 48, marginBottom: 12 }}>{cap.emoji}</Text>
                <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '900', textAlign: 'center', letterSpacing: -0.3, lineHeight: 34 }}>{cap.line1}</Text>
                <Text style={{ color: '#E91E63', fontSize: 28, fontWeight: '900', textAlign: 'center', letterSpacing: -0.3, lineHeight: 34, marginBottom: 10 }}>{cap.line2}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, textAlign: 'center', fontWeight: '500', lineHeight: 19, maxWidth: 260 }}>{cap.sub}</Text>
              </Animated.View>
            </View>

            {/* Caption progress dots */}
            <View style={{ position: 'absolute', bottom: 118, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
              {[0,1,2,3,4].map(i => (
                <View key={i} style={{ width: i === loginCaptionIdx ? 22 : 6, height: 6, borderRadius: 3, backgroundColor: i === loginCaptionIdx ? '#E91E63' : 'rgba(255,255,255,0.2)' }} />
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
          shadowColor: '#E91E63',
          shadowOpacity: 0.18,
          shadowRadius: 22,
          flex: loginOtpSent ? 1 : undefined,
        }}>

          {/* OTP screen mini header */}
          {loginOtpSent && (
            <View style={{ alignItems: 'center', marginBottom: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: '#E91E63', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>S</Text>
                </View>
                <Text style={{ color: '#0F172A', fontSize: 20, fontWeight: '900', letterSpacing: 0.3 }}>Sppero Captain</Text>
              </View>
            </View>
          )}

          {/* Drag handle */}
          {!loginOtpSent && <View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginBottom: 18 }} />}

          <Text style={{ color: '#0F172A', fontSize: 21, fontWeight: '900', marginBottom: 4 }}>
            {loginOtpSent ? '🔑 OTP Enter Karo' : '🚗 Captain Login'}
          </Text>
          <Text style={{ color: '#64748B', fontSize: 13, marginBottom: 22, lineHeight: 19 }}>
            {loginOtpSent
              ? `+91 ${loginPhone} par 6-digit code bheja gaya`
              : 'Sppero ke saath drive karo aur roz kamaao'}
          </Text>

          {!loginOtpSent ? (
            <View>
              {/* Phone input */}
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1.5, borderColor: loginPhone.length > 0 ? '#E91E63' : '#E2E8F0', paddingHorizontal: 14, marginBottom: 16 }}>
                <View style={{ backgroundColor: '#E91E63', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5, marginRight: 12 }}>
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
                  <Ionicons name="checkmark-circle" size={22} color="#16A34A" />
                )}
              </View>

              {result ? <Text style={{ color: '#EF4444', fontSize: 12, marginBottom: 12, fontWeight: '600' }}>{result}</Text> : null}

              {/* Send OTP button */}
              <Bouncy
                style={{ backgroundColor: loginPhone.length !== 10 ? '#F1F5F9' : '#E91E63', borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginBottom: 20, elevation: loginPhone.length === 10 ? 10 : 0, shadowColor: '#E91E63', shadowOpacity: 0.45, shadowRadius: 14 }}
                disabled={loginPhone.length !== 10 || loading}
                onPress={doLogin}>
                <Text style={{ color: loginPhone.length !== 10 ? '#94A3B8' : '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.3 }}>
                  {loading ? '⏳ OTP bhej rahe hain...' : 'OTP Bhejo →'}
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
                <Text style={{ fontSize: 12, color: '#E91E63', flex: 1, fontWeight: '600', lineHeight: 18 }}>SMS se OTP copy karke paste karo — 6 boxes mein auto-fill ho jaayega!</Text>
              </View>

              {/* 6 OTP Boxes */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                {loginOtpDigits.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={(ref) => { loginOtpRefs.current[i] = ref; }}
                    style={{ width: 44, height: 56, borderRadius: 14, textAlign: 'center', fontSize: 24, fontWeight: '900', borderWidth: 2.5, borderColor: digit ? '#E91E63' : '#E2E8F0', backgroundColor: digit ? 'rgba(233,30,99,0.06)' : '#F8FAFC', color: '#0F172A', elevation: digit ? 4 : 0, shadowColor: '#E91E63', shadowOpacity: digit ? 0.25 : 0, shadowRadius: 6 }}
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
                style={{ backgroundColor: (loading || loginOtpDigits.join('').length < 6) ? '#F1F5F9' : '#E91E63', borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginBottom: 14, elevation: loginOtpDigits.join('').length === 6 ? 10 : 0, shadowColor: '#E91E63', shadowOpacity: 0.45, shadowRadius: 14 }}
                disabled={loading || loginOtpDigits.join('').length < 6}
                onPress={() => verifyLoginOtp()}>
                <Text style={{ color: (loading || loginOtpDigits.join('').length < 6) ? '#94A3B8' : '#fff', fontSize: 16, fontWeight: '900' }}>
                  {loading ? '⏳ Verify ho raha hai...' : '✅ Login Karo'}
                </Text>
              </Bouncy>

              {/* Resend */}
              <View style={{ alignItems: 'center', marginBottom: 12 }}>
                {loginCanResend
                  ? <TouchableOpacity onPress={() => { setLoginOtpDigits(['','','','','','']); setLoginOtp(''); setResult(''); doLogin(); }}>
                      <Text style={{ color: '#E91E63', fontWeight: '800', fontSize: 13 }}>🔄 OTP Dobara Bhejo</Text>
                    </TouchableOpacity>
                  : <Text style={{ color: '#94A3B8', fontSize: 12 }}>Dobara bhejne ke liye <Text style={{ color: '#E91E63', fontWeight: '700' }}>{loginResendTimer}s</Text> wait karo</Text>
                }
              </View>
              <TouchableOpacity onPress={() => { setLoginOtpSent(false); setLoginOtpDigits(['','','','','','']); setResult(''); }} style={{ alignItems: 'center', paddingVertical: 4 }}>
                <Text style={{ color: '#64748B', fontSize: 12 }}>← Number change karo</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ═══ PAYMENT WAITING SCREEN ═══
  if (paymentWaiting) return (
    <ScreenIn style={s.screen}>
      {/* Hero */}
      <View style={[s.hero, { paddingTop: 50, paddingBottom: 26, overflow: 'hidden' }]}>
        <View style={{ position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.08)', top: -80, right: -50 }} />
        <Text style={s.heroTitle}>Trip Complete! 🏁</Text>
        <Text style={{ color: '#10B981', fontSize: 50, fontWeight: '900', marginTop: 6, letterSpacing: -1 }}>₹{paymentFare}</Text>
        <View style={{ backgroundColor: 'rgba(16,185,129,0.18)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 6, marginTop: 8, borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)' }}>
          <Text style={{ color: '#10B981', fontSize: 13, fontWeight: '700' }}>Net kamai: ₹{(parseFloat(paymentFare) * 0.85).toFixed(0)} · 15% fee ke baad</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 36 }}>

        {/* ── Cash or UPI confirm (always visible) ── */}
        <Text style={{ fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.45)', letterSpacing: 1.8, marginBottom: 12, textTransform: 'uppercase' }}>
          {paymentMethod === 'cash' ? 'Customer ne cash select kiya — confirm karo' : 'Payment mili? Confirm karo'}
        </Text>

        {paymentMethod === 'cash' ? (
          <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 18, padding: 18, marginBottom: 12, borderWidth: 1.5, borderColor: 'rgba(245,158,11,0.4)' }}>
            <Text style={{ fontSize: 15, fontWeight: '900', color: '#F59E0B', marginBottom: 6 }}>💵 Customer Ne Cash Chuna</Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 16, lineHeight: 20 }}>
              Customer ne app mein cash select ki hai. Unse ₹{paymentFare} cash lo aur neeche confirm karo.
            </Text>
            <Bouncy
              style={{ backgroundColor: '#10B981', borderRadius: 14, padding: 16, alignItems: 'center', opacity: loading ? 0.6 : 1 }}
              onPress={() => confirmDirectPayment('cash')} disabled={loading}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>✅  ₹{paymentFare} Cash Mil Gaya</Text>
            </Bouncy>
          </View>
        ) : (
          <View style={{ backgroundColor: 'rgba(16,185,129,0.06)', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>Customer abhi app mein payment kar raha hai...</Text>
            <FloatingDots color="#10B981" />
          </View>
        )}

        {/* ── Direct confirm buttons ── */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
          <Bouncy
            style={{ flex: 1, backgroundColor: 'rgba(16,185,129,0.10)', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.35)', opacity: loading ? 0.6 : 1 }}
            onPress={() => confirmDirectPayment('cash')} disabled={loading}>
            <Text style={{ fontSize: 28, marginBottom: 4 }}>💵</Text>
            <Text style={{ fontSize: 13, fontWeight: '900', color: '#10B981' }}>Cash Mila</Text>
            <Text style={{ fontSize: 11, color: 'rgba(16,185,129,0.7)', marginTop: 2 }}>₹{paymentFare}</Text>
          </Bouncy>
          <Bouncy
            style={{ flex: 1, backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(233,30,99,0.3)', opacity: loading ? 0.6 : 1 }}
            onPress={() => confirmDirectPayment('upi_direct')} disabled={loading}>
            <Text style={{ fontSize: 28, marginBottom: 4 }}>📱</Text>
            <Text style={{ fontSize: 13, fontWeight: '900', color: '#E91E63' }}>UPI Mila</Text>
            <Text style={{ fontSize: 11, color: 'rgba(233,30,99,0.6)', marginTop: 2 }}>₹{paymentFare}</Text>
          </Bouncy>
        </View>

        {/* ── Divider ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
          <Text style={{ color: 'rgba(255,255,255,0.35)', marginHorizontal: 14, fontSize: 12, fontWeight: '700' }}>YA CUSTOMER KO DIKHAO</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
        </View>

        {/* ── My UPI QR ── */}
        {driverUpiId ? (() => {
          const upiLink = `upi://pay?pa=${encodeURIComponent(driverUpiId)}&pn=${encodeURIComponent(driverInfo?.name || 'Driver')}&am=${paymentFare}&cu=INR&tn=Sppero%20Trip`;
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(upiLink)}`;
          return (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: 18, marginBottom: 16, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)' }}>
              <Text style={{ fontSize: 14, fontWeight: '900', color: '#fff', marginBottom: 4 }}>📱 Customer Ko Dikhao</Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 14 }}>GPay · PhonePe · Paytm · Any UPI</Text>
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 8 }}>
                <Image source={{ uri: qrUrl }} style={{ width: 210, height: 210, borderRadius: 10 }} resizeMode="contain" />
              </View>
              <Text style={{ fontSize: 12, color: '#E91E63', marginTop: 12, fontWeight: '700' }}>{driverUpiId}</Text>
              <View style={{ backgroundColor: '#E91E63', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 8, marginTop: 10, elevation: 4, shadowColor: '#E91E63', shadowOpacity: 0.5, shadowRadius: 8 }}>
                <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>₹{paymentFare}</Text>
              </View>
            </View>
          );
        })() : (
          <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
            <Text style={{ fontSize: 13, color: '#F59E0B', textAlign: 'center', fontWeight: '600' }}>⚠️ Profile mein UPI ID set karo QR dikhane ke liye</Text>
          </View>
        )}

        {/* ── Net earning note ── */}
        <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 18 }}>💡</Text>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 18, flex: 1 }}>
            15% platform fee ke baad aapki net kamai ₹{(parseFloat(paymentFare) * 0.85).toFixed(0)} hogi
          </Text>
        </View>

        {/* ── Payment not received ── */}
        <TouchableOpacity
          onPress={() => Alert.alert(
            '⚠️ Payment Nahi Mili?',
            `Customer ne ₹${paymentFare} cash payment nahi ki?\n\nYeh report 10 minute ke andar hi ki ja sakti hai. Customer ka account flag hoga aur Sppero team investigate karegi.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Haan, Report Karo', style: 'destructive', onPress: async () => {
                try {
                  const res = await fetch(`${API}/api/rides/payment-not-received`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ride_id: paymentRideId, driver_phone: phone }),
                  });
                  const d = await res.json();
                  if (d.success) {
                    Alert.alert('✅ Report Ho Gayi',
                      'Customer ko flag kar diya gaya. Sppero team 24 ghante mein review karegi.\n\nYeh record customer ke account pe jayega.',
                      [{ text: 'OK', onPress: () => setPaymentWaiting(false) }]
                    );
                  } else {
                    Alert.alert('❌ Error', d.error || 'Report nahi ho saki');
                  }
                } catch {
                  Alert.alert('❌ Network Error', 'Dobara try karo');
                }
              }},
            ]
          )}
          style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 16, padding: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.3)' }}>
          <Text style={{ fontSize: 22 }}>🚨</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '900', fontSize: 13, color: '#ef4444' }}>Customer Ne Payment Nahi Ki</Text>
            <Text style={{ fontSize: 11, color: 'rgba(239,68,68,0.65)', marginTop: 2 }}>Cash liye bina chale gaye? Report karo</Text>
          </View>
          <Text style={{ color: '#ef4444', fontSize: 20 }}>›</Text>
        </TouchableOpacity>

      </ScrollView>
    </ScreenIn>
  );

  // ═══ DRIVER CANCEL MODAL ═══
  if (showDriverCancelModal) return (
    <View style={s.screen}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 30, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 16 }} />
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#0F172A', marginBottom: 6 }}>Trip Cancel karein?</Text>
          <View style={{ backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
            <Text style={{ fontSize: 13, color: '#F59E0B', fontWeight: '600' }}>⚠️ Zyada cancel karne se aapka account suspend ho sakta hai!</Text>
          </View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#64748B', marginBottom: 10 }}>Cancel ka reason?</Text>
          {['Customer nahi mila', 'Galat location', 'Emergency aa gayi', 'Vehicle problem', 'Customer rude tha'].map((reason, i) => (
            <TouchableOpacity key={i}
              style={{ backgroundColor: cancelReason === reason ? '#E91E63' : '#F8FAFC', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: cancelReason === reason ? '#E91E63' : '#E2E8F0' }}
              onPress={() => setCancelReason(reason)}>
              <Text style={{ fontSize: 14, color: cancelReason === reason ? '#fff' : '#0F172A' }}>{reason}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={{ backgroundColor: '#E91E63', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8, opacity: cancelReason ? 1 : 0.5 }}
            disabled={!cancelReason || loading}
            onPress={cancelTrip}>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>{loading ? '⏳ Cancel ho raha hai...' : '✕ Trip Cancel Karo'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ padding: 14, alignItems: 'center' }} onPress={() => { setShowDriverCancelModal(false); setCancelReason(''); }}>
            <Text style={{ color: '#64748B', fontWeight: 'bold', fontSize: 14 }}>Nahi, trip rakhni hai</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );


  // ═══ TRIP SUMMARY ═══
  if (tripSummary) return (
    <ScreenIn style={s.screen}>
      <View style={[s.hero, { paddingTop: 50 }]}>
        <Celebration />
        <Text style={{ fontSize: 60 }}>🎉</Text>
        <Text style={s.heroTitle}>Trip Complete!</Text>
        <CountUp value={tripSummary.earned} style={{ color: '#10B981', fontSize: 36, fontWeight: 'bold', marginTop: 8 }} />
        <Text style={{ color: '#aaa', fontSize: 12, marginTop: 2 }}>Aapki kamai is trip se</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        <View style={{ backgroundColor: '#F8FAFC', borderRadius: 20, padding: 24, elevation: 4, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' }}>
          <Text style={[s.sectionTitle, { marginBottom: 16 }]}>💰 Earning Summary</Text>
          {/* Payment method badge */}
          <View style={{ backgroundColor: tripSummary.payment_method === 'cash' ? 'rgba(16,185,129,0.12)' : tripSummary.payment_method === 'wallet' ? 'rgba(233,30,99,0.08)' : 'rgba(168,85,247,0.12)', borderRadius: 10, padding: 10, marginBottom: 14, alignItems: 'center', borderWidth: 1, borderColor: tripSummary.payment_method === 'cash' ? 'rgba(16,185,129,0.3)' : tripSummary.payment_method === 'wallet' ? 'rgba(233,30,99,0.3)' : 'rgba(168,85,247,0.3)' }}>
            <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#0F172A' }}>
              {tripSummary.payment_method === 'cash' ? '💵 Cash Payment' : tripSummary.payment_method === 'wallet' ? '💰 Wallet Payment' : '💳 Online Payment'}
            </Text>
          </View>
          {tripSummary.isHourly && (
            <View style={{ backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 10, padding: 10, marginBottom: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' }}>
              <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#10B981' }}>⏱️ Hourly Trip · 💰 Wallet Payment</Text>
              {tripSummary.earlyEnd && <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Early end — 70% minimum protection applied</Text>}
              {tripSummary.extraKmInfo && <Text style={{ fontSize: 12, color: '#F59E0B', marginTop: 4 }}>📍 {tripSummary.extraKmInfo}</Text>}
            </View>
          )}
          {[['Total Fare', '₹' + tripSummary.fare],[`Platform Fee (${tripSummary.isHourly ? '12' : '15'}%)`, tripSummary.fee],['Aapki Kamai', tripSummary.earned]].map(([k, v], i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: '#334155' }}>
              <Text style={{ fontSize: 14, color: '#94A3B8' }}>{k}</Text>
              <Text style={{ fontSize: 14, fontWeight: i === 4 ? 'bold' : '500', color: i === 4 ? '#10B981' : '#E2E8F0' }}>{v}</Text>
            </View>
          ))}
        </View>
        {/* Ride Extension Request — same customer wants another trip */}
        {extRequest && (
          <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 2, borderColor: 'rgba(245,158,11,0.4)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 28, marginRight: 10 }}>🔄</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#F59E0B', fontWeight: '800', fontSize: 15 }}>Ride Extension Request!</Text>
                <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 2 }}>{extRequest.customer_name} — same customer</Text>
              </View>
              <View style={{ backgroundColor: '#E91E63', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{extRespSec}</Text>
              </View>
            </View>
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ color: '#64748B', fontSize: 11 }}>Naya destination</Text>
              <Text style={{ color: '#0F172A', fontWeight: '700', fontSize: 14, marginTop: 2 }}>{extRequest.new_drop}</Text>
              <Text style={{ color: '#10B981', fontWeight: 'bold', fontSize: 18, marginTop: 6 }}>₹{Math.round(extRequest.estimated_fare)}</Text>
              <Text style={{ color: '#64748B', fontSize: 11 }}>Estimated fare</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Bouncy style={{ flex: 1, backgroundColor: '#10B981', borderRadius: 12, padding: 14, alignItems: 'center' }} onPress={acceptExtension} disabled={extAccLoading}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>{extAccLoading ? '...' : '✅ Accept'}</Text>
              </Bouncy>
              <Bouncy style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }} onPress={rejectExtension}>
                <Text style={{ color: '#94A3B8', fontWeight: 'bold', fontSize: 15 }}>✗ Reject</Text>
              </Bouncy>
            </View>
          </View>
        )}
        {/* Rate Customer */}
        {!custRatingDone ? (
          <View style={{ backgroundColor: '#F8FAFC', borderRadius: 20, padding: 20, elevation: 3, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 2 }}>Customer ko Rate karo</Text>
            <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 14 }}>Yeh customer kaisa tha? (1–5 stars)</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 14 }}>
              {[1,2,3,4,5].map(star => (
                <TouchableOpacity key={star} onPress={() => setCustRatingStars(star)}>
                  <Text style={{ fontSize: 38, opacity: star <= custRatingStars ? 1 : 0.25 }}>⭐</Text>
                </TouchableOpacity>
              ))}
            </View>
            {custRatingStars > 0 && (
              <TouchableOpacity onPress={rateCustomer}
                style={{ backgroundColor: '#10B981', borderRadius: 12, padding: 13, alignItems: 'center', elevation: 3, shadowColor: '#10B981', shadowOpacity: 0.35, shadowRadius: 6 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Submit Rating</Text>
              </TouchableOpacity>
            )}
            {custRatingStars === 0 && (
              <TouchableOpacity onPress={() => setCustRatingDone(true)}>
                <Text style={{ textAlign: 'center', color: '#475569', fontSize: 12, marginTop: 4 }}>Skip</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={{ backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 16, padding: 16, marginBottom: 16, alignItems: 'center', flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' }}>
            <Text style={{ fontSize: 22 }}>✅</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#10B981' }}>Customer rating submit ho gaya!</Text>
          </View>
        )}
        <TouchableOpacity onPress={() => { setDrvCmpType(''); setDrvCmpTitle(''); setDrvCmpDesc(''); setDrvCmpRideId(tripSummary?.ride_id || lastRideId || ''); setDrvCmpStep(1); setDrSubScreen('complaint-new'); setTripSummary(null); }}
          style={{ backgroundColor: 'rgba(233,69,96,0.08)', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: '#E91E63', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Text style={{ fontSize: 18 }}>⚠️</Text>
          <Text style={{ color: '#E91E63', fontWeight: '700', fontSize: 14 }}>Customer Issue? Complaint File Karo</Text>
        </TouchableOpacity>
        <Bouncy style={[s.btn, { backgroundColor: '#10B981', shadowColor: '#10B981', shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 }]} onPress={() => { setTripSummary(null); setExtRequest(null); }}><Text style={s.btnTxt}>🏠 Next Ride ke liye Ready</Text></Bouncy>
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
          <Text style={{ textAlign: 'center', color: '#999', marginTop: 20, fontSize: 13 }}>Koi message nahi</Text>
        ) : chatMsgs.map((m, i) => (
          <View key={i} style={[cs.bubble, m.sender === 'driver' ? cs.mine : cs.theirs]}>
            <Text style={{ color: m.sender === 'driver' ? '#fff' : '#0F172A', fontSize: 14 }}>{m.message}</Text>
          </View>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF' }} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 7, gap: 8 }}>
        {["Cancel mat karo, aa raha hun 🙏", "Pahunch raha hun jaldi", "Main aapke pickup point pe hun", "Main wait kar raha hun", "Please ready raho 🚗"].map(q => (
          <TouchableOpacity key={q} onPress={() => sendChat(q)} style={{ backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, color: '#334155', fontWeight: '600' }}>{q}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={cs.inputRow}>
        <TextInput style={cs.input} placeholder="Message likho..." value={chatInput} onChangeText={setChatInput} onSubmitEditing={() => sendChat()} />
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
          <Text style={{ textAlign: 'center', color: '#999', marginTop: 20, fontSize: 13 }}>Koi message nahi — pehla message bhejo!</Text>
        ) : hourlyChatMsgs.map((m, i) => (
          <View key={i} style={[cs.bubble, m.sender === 'driver' ? cs.mine : cs.theirs]}>
            <Text style={{ color: m.sender === 'driver' ? '#fff' : '#0F172A', fontSize: 14 }}>{m.message}</Text>
          </View>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF' }} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 7, gap: 8 }}>
        {["Cancel mat karo, aa raha hun 🙏", "Pahunch raha hun jaldi", "Main aapke location pe hun", "Main wait kar raha hun", "Please ready raho 🚗"].map(q => (
          <TouchableOpacity key={q} onPress={() => sendHourlyChat(q)} style={{ backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, color: '#334155', fontWeight: '600' }}>{q}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={cs.inputRow}>
        <TextInput style={cs.input} placeholder="Customer ko message karo..." value={hourlyChatInput} onChangeText={setHourlyChatInput} onSubmitEditing={() => sendHourlyChat()} />
        <TouchableOpacity style={cs.send} onPress={() => sendHourlyChat()}><Text style={{ color: '#fff', fontWeight: 'bold' }}>➤</Text></TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );

  // ═══ HOME TAB — Uber style ═══
  if (activeTab === 'home') return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Full map background */}
      <View style={s.mapFit}>
        <MapWebView
          pickupCoords={activeRide ? { lat: activeRide.pickup_lat, lng: activeRide.pickup_lng } : null}
          dropCoords={activeRide ? { lat: activeRide.drop_lat, lng: activeRide.drop_lng } : null}
          driverLat={driverGps?.lat}
          driverLng={driverGps?.lng}
          height={220}
        />
        <MapOverlay hasRoute={!!activeRide} pickup={activeRide?.pickup} drop={activeRide?.drop_location} live={activeRide?.status === 'started'} />
      </View>
      {/* Top bar */}
      <View style={s.topBar}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {isOnline && <PulseView><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A', marginRight: 7 }} /></PulseView>}
            <Text style={s.greeting}>{isOnline ? '🟢 Online' : '🔴 Offline'}</Text>
          </View>
          <Text style={s.subTxt}>{driverInfo?.name || phone} · {driverInfo?.vehicle_no || ''}</Text>
          {driverLevel && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
              <Text style={{ fontSize: 13 }}>{driverLevel.levelEmoji}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700' }}>{driverLevel.levelName}</Text>
              {driverLevel.nextLevel && (
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>· {driverLevel.progress}% to {driverLevel.nextLevelName}</Text>
              )}
            </View>
          )}
        </View>
        <Switch value={isOnline} onValueChange={toggleOnline} trackColor={{ true: '#16A34A', false: '#e0e0e0' }} />
      </View>
      {/* Content */}
      <View style={{ flex: 1, backgroundColor: '#F1F5F9', borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -24, paddingTop: 16, paddingHorizontal: 16 }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ paddingBottom: 130 }}>
          <View style={s.statsRow}>
            <View style={s.statCard}><Text style={s.statIcon}>💰</Text><CountUp value={earnings} style={s.statValue} /><Text style={s.statLabel}>Aaj ki kamai</Text></View>
            <View style={s.statCard}><Text style={s.statIcon}>🚗</Text><Text style={s.statValue}>{rides}</Text><Text style={s.statLabel}>Rides</Text></View>
            <View style={s.statCard}><Text style={s.statIcon}>⭐</Text><Text style={s.statValue}>{driverInfo?.rating || '4.8'}</Text><Text style={s.statLabel}>Rating</Text></View>
          </View>

          {/* Hot Zones — always visible when online */}
          {isOnline && !activeRide && !rideReq && !activeHourlyRide && !hourlyRideReq && (
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 14, elevation: 4, borderWidth: 1.5, borderColor: '#E2E8F0', shadowColor: '#E91E63', shadowOpacity: 0.08, shadowRadius: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(233,30,99,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 18 }}>🔥</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: '#0F172A' }}>Hot Zones</Text>
                    <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>Jahan rides ki demand hai</Text>
                  </View>
                </View>
                <View style={{ backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(233,30,99,0.2)' }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#E91E63' }}>{zonesLoading ? '...' : 'LIVE'}</Text>
                </View>
              </View>
              {demandZones.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 18 }}>
                  <Text style={{ fontSize: 28, marginBottom: 8 }}>🗺️</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>Abhi koi hot zone nahi</Text>
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 4, textAlign: 'center' }}>Jaise hi aapke area mein ride activity badhe,{'\n'}zones yahan dikhenge</Text>
                </View>
              ) : demandZones.slice(0, 5).map((zone, i) => {
                const heatConfig = zone.heat === 'high'
                  ? { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', dot: '#EF4444', label: 'High', labelBg: '#EF4444' }
                  : zone.heat === 'medium'
                  ? { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.35)', dot: '#F59E0B', label: 'Medium', labelBg: '#F59E0B' }
                  : { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.3)', dot: '#10B981', label: 'Low', labelBg: '#10B981' };
                const vehicleEmoji = zone.top_vehicle === 'bike' ? '🏍️' : zone.top_vehicle === 'auto' ? '🛺' : zone.top_vehicle === 'car' ? '🚕' : zone.top_vehicle === 'eriksha' ? '🛵' : '🚗';
                return (
                  <View key={i} style={{ backgroundColor: heatConfig.bg, borderRadius: 12, padding: 12, marginBottom: i < 4 ? 8 : 0, borderWidth: 1, borderColor: heatConfig.border, flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: heatConfig.dot, marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                        {vehicleEmoji} {zone.dist_km < 0.5 ? 'Aapke paas' : `${zone.dist_km} km door`}
                        {zone.avg_fare > 0 ? ` · avg ₹${zone.avg_fare}` : ''}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                        {zone.ride_count} ride{zone.ride_count > 1 ? 's' : ''} is area mein
                      </Text>
                    </View>
                    <View style={{ backgroundColor: heatConfig.labelBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>{heatConfig.label}</Text>
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity onPress={fetchDemandZones} style={{ marginTop: 10, alignItems: 'center', paddingVertical: 6 }}>
                <Text style={{ fontSize: 11, color: '#94A3B8', fontWeight: '600' }}>🔄 Refresh zones</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Sppero Buddy Recruit Banner */}
          {!activeRide && !rideReq && !activeHourlyRide && (
            <TouchableOpacity activeOpacity={0.92}
              onPress={() => { const msg = `🚗 Sppero Buddy Captain bano aur kamai karo!\n\nMere saath join karo Sppero pe — India ka fastest growing ride platform.\n\n📲 App download karo: https://sppero.app\nMera referral: ${driverInfo?.phone || ''}`; Share.share({ message: msg }); }}
              style={{ borderRadius: 20, marginBottom: 12, overflow: 'hidden', elevation: 8, shadowColor: '#E91E63', shadowOpacity: 0.3, shadowRadius: 14 }}>
              <View style={{ backgroundColor: '#E91E63', padding: 16, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 8 }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }}>🚗 DRIVER REFERRAL</Text>
                  </View>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', opacity: 0.9 }}>Naya Sppero Buddy banao</Text>
                  <Text style={{ color: '#FFD700', fontSize: 24, fontWeight: '900', lineHeight: 30, marginTop: 2 }}>₹500 Bonus Kamao!</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 4, lineHeight: 16 }}>Har naye driver jo join kare —{'\n'}₹500 aapके wallet mein!</Text>
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
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700' }}>Referral bonus turant wallet mein credited hoga</Text>
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
                <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Cash rides ki platform fee pending hai. Tap karke pay karo.</Text>
              </View>
              <Text style={{ color: '#FB923C', fontWeight: '700', fontSize: 12 }}>Pay →</Text>
            </TouchableOpacity>
          )}

          {/* Surge Active Banner */}
          {surgeMultiplier > 1.0 && !activeRide && (
            <View style={{ backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 12, padding: 10, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)' }}>
              <Text style={{ fontSize: 20 }}>⚡</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', fontSize: 13, color: '#F59E0B' }}>Surge Active: {surgeMultiplier}x — Rides pe zyada kamai!</Text>
                <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Abhi sabhi ride fares {surgeMultiplier}x hain</Text>
              </View>
            </View>
          )}

          {/* Admin Notification Banner */}
          {adminNotif && adminNotif.created_at !== adminNotifDismissed && (
            <View style={{ borderRadius: 14, marginBottom: 10, backgroundColor: 'rgba(233,30,99,0.08)', borderWidth: 1.5, borderColor: 'rgba(233,30,99,0.3)', padding: 12, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 22, marginRight: 10 }}>📩</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', fontSize: 12, color: '#E91E63', marginBottom: 2 }}>Sppero Admin</Text>
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
                <Text style={s.tripFare}>₹{activeRide.fare}</Text>
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
                  <Ionicons name="chatbubble" size={16} color="#E91E63" />
                  <Text style={{ color: '#fff', fontSize: 13, flex: 1, fontWeight: '600' }} numberOfLines={1}>{chatToast}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>Tap to reply</Text>
                </TouchableOpacity>
              )}
              {!chatToast && unreadChat > 0 && (
                <TouchableOpacity style={{ backgroundColor: '#E91E63', borderRadius: 10, padding: 10, marginBottom: 10, alignItems: 'center' }} onPress={() => { setUnreadChat(0); setShowChat(true); }}>
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
                  <Text style={{ color: '#E91E63', fontWeight: '700', fontSize: 14 }}>📍 {distToPickup}</Text>
                </View>
              )}
              {tripRemainingEta && activeRide.status === 'started' && (
                <View style={{ backgroundColor: 'rgba(255,99,24,0.12)', borderRadius: 10, padding: 10, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,99,24,0.3)', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                  <Text style={{ color: '#F5C518', fontWeight: '700', fontSize: 14 }}>🛣️ {tripRemainingEta}</Text>
                </View>
              )}

              {(activeRide.status === 'matched' || activeRide.status === 'arrived') && (
                <TouchableOpacity style={[s.navBtn, { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6 }]} onPress={() => navigateTo(activeRide.pickup, activeRide.pickup_lat, activeRide.pickup_lng)}>
                  <Ionicons name="navigate" size={15} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Pickup Navigate Karo</Text>
                </TouchableOpacity>
              )}
              {activeRide.status === 'started' && (
                <TouchableOpacity style={[s.navBtn, { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6 }]} onPress={() => navigateTo(activeRide.drop_location, activeRide.drop_lat, activeRide.drop_lng)}>
                  <Ionicons name="navigate" size={15} color="#8ae961" />
                  <Text style={{ color: '#8ae961', fontWeight: '600' }}>Drop Navigate Karo</Text>
                </TouchableOpacity>
              )}

              {activeRide.status === 'matched' && (
                <Bouncy style={s.tripBtn} onPress={markArrived} disabled={loading}><Text style={s.tripBtnTxt}>{loading ? '...' : '📍 Pickup pe pahunch gaya'}</Text></Bouncy>
              )}

              {activeRide.status === 'arrived' && (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                  <Text style={{ fontSize: 13, color: '#64748B', marginBottom: 10, textAlign: 'center', fontWeight: '600' }}>🔐 Passenger se 4-digit OTP poocho</Text>
                  <TextInput
                    style={{ borderWidth: 2.5, borderColor: otpInput.length === 4 ? '#16A34A' : '#E2E8F0', borderRadius: 14, padding: 16, fontSize: 32, textAlign: 'center', letterSpacing: 12, marginBottom: 14, fontWeight: '900', backgroundColor: '#F8FAFC', color: '#0F172A' }}
                    keyboardType="number-pad"
                    maxLength={4}
                    value={otpInput}
                    onChangeText={setOtpInput}
                    placeholder="○ ○ ○ ○"
                    placeholderTextColor="#D4A520"
                    autoFocus
                  />
                  <Bouncy style={s.tripBtn} onPress={startTrip} disabled={loading || otpInput.length < 4}><Text style={s.tripBtnTxt}>{loading ? '...' : '🚀 OTP Verify & Trip Shuru'}</Text></Bouncy>
                </KeyboardAvoidingView>
              )}

              {activeRide.status === 'started' && (
                <View>
                  <Bouncy style={[s.tripBtn, { backgroundColor: '#10B981', shadowColor: '#10B981' }]} onPress={completeTrip} disabled={loading}>
                    <Text style={s.tripBtnTxt}>{loading ? '...' : '✅ Trip Complete Karo'}</Text>
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
                {/* Big fare card */}
                <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 14, alignItems: 'center', elevation: 4, shadowColor: '#22C55E', shadowOpacity: 0.18, shadowRadius: 10 }}>
                  <Text style={{ color: '#94A3B8', fontSize: 11, marginBottom: 4, fontWeight: '700', letterSpacing: 1.5 }}>AAPKI KAMAI</Text>
                  <Text style={{ color: '#22C55E', fontSize: 54, fontWeight: '900', lineHeight: 60 }}>₹{Math.round((rideReq?.fare || 0) * 0.88)}</Text>
                  <Text style={{ color: '#64748B', fontSize: 12 }}>Total: ₹{rideReq?.fare} · 12% commission</Text>
                </View>

                {/* Distance badges */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                  {driverGps && rideReq?.pickup_lat && (
                    <View style={{ flex: 1, backgroundColor: '#EFF6FF', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#BFDBFE' }}>
                      <Text style={{ color: '#2563EB', fontSize: 11, fontWeight: '800' }}>📍 Aap se Pickup</Text>
                      <Text style={{ color: '#1D4ED8', fontSize: 24, fontWeight: '900', marginTop: 3 }}>
                        {haversineKm(driverGps.lat, driverGps.lng, rideReq.pickup_lat, rideReq.pickup_lng).toFixed(1)} km
                      </Text>
                    </View>
                  )}
                  {rideReq?.distance && (
                    <View style={{ flex: 1, backgroundColor: '#F0FDF4', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#BBF7D0' }}>
                      <Text style={{ color: '#16A34A', fontSize: 11, fontWeight: '800' }}>🛣️ Trip Distance</Text>
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
                      {loading ? 'Accept ho raha...' : 'ACCEPT KARO'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* ─── HOURLY RIDE REQUEST (moved to Live tab) ─── */}
          {false && hourlyRideReq && !activeRide && !activeHourlyRide && (
            <SlideIn>
              <View style={[s.rideCard, { borderLeftWidth: 4, borderLeftColor: '#E91E63' }]}>
                <View style={s.rideHeader}>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <View style={{ backgroundColor: '#E91E63', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>⏱️ HOURLY</Text></View>
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
                    <Text style={{ color: '#E91E63', fontSize: 12, fontWeight: '700' }}>SCHEDULED: {new Date(hourlyRideReq.scheduled_at).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</Text>
                  </View>
                )}
                <View style={{ backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 8, padding: 8, marginTop: 6, marginBottom: 4, borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' }}>
                  <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '600' }}>💰 Aapki kamai: ₹{Math.round(parseFloat(hourlyRideReq.base_fare || 0) * 0.88).toFixed(0)} (12% commission, wallet se guaranteed)</Text>
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
            <View style={[s.tripCard, { borderLeftWidth: 4, borderLeftColor: '#E91E63' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ backgroundColor: '#E91E63', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>⏱️ HOURLY TRIP</Text></View>
                {activeHourlyRide.status === 'active' && (
                  <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#0F172A', fontVariant: ['tabular-nums'] }}>
                    {String(Math.floor(hourlyTimerSec/3600)).padStart(2,'0')}:{String(Math.floor((hourlyTimerSec%3600)/60)).padStart(2,'0')}:{String(hourlyTimerSec%60).padStart(2,'0')}
                  </Text>
                )}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ color: '#94A3B8', fontSize: 13 }}>{activeHourlyRide.package_hours === 8 ? 'Full Day' : `${activeHourlyRide.package_hours}h`} · {activeHourlyRide.km_included} km · ₹{activeHourlyRide.base_fare}</Text>
                <Text style={{ color: activeHourlyRide.status === 'active' ? '#10B981' : '#E91E63', fontSize: 12, fontWeight: '600' }}>
                  {activeHourlyRide.status === 'matched' ? '🚗 Pickup pe jao' : '🛣️ Trip chal rahi hai'}
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
                  <Ionicons name="call" size={18} color="#E91E63" />
                  <Text style={{ color: '#E91E63', fontWeight: '700', fontSize: 14 }}>Call</Text>
                </TouchableOpacity>
              </View>

              {activeHourlyRide.status === 'matched' && (
                <View style={{ marginTop: 10 }}>
                  <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 8, textAlign: 'center' }}>🔐 Customer se OTP poocho (woh app mein dekh rahe hain)</Text>
                  <TextInput style={{ borderWidth: 2, borderColor: '#10B981', borderRadius: 12, padding: 14, fontSize: 28, textAlign: 'center', letterSpacing: 10, marginBottom: 10, fontWeight: 'bold', backgroundColor: '#FFFFFF', color: '#0F172A' }} placeholder="0000" placeholderTextColor="#475569" keyboardType="number-pad" maxLength={4} value={hourlyOtpInput} onChangeText={setHourlyOtpInput} />
                  <Bouncy style={s.tripBtn} onPress={startHourlyTrip} disabled={loading}><Text style={s.tripBtnTxt}>{loading ? '...' : '🚀 OTP Verify & Trip Shuru'}</Text></Bouncy>
                  <TouchableOpacity style={[s.navBtn, { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6 }]} onPress={() => Linking.openURL(`google.navigation:q=${encodeURIComponent(activeHourlyRide.pickup)}`).catch(() => Linking.openURL(`https://maps.google.com/?daddr=${encodeURIComponent(activeHourlyRide.pickup)}`))}>
                    <Ionicons name="navigate" size={15} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Pickup Navigate Karo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ marginTop: 10, borderWidth: 1.5, borderColor: '#E91E63', borderRadius: 12, padding: 12, alignItems: 'center' }}
                    onPress={() => {
                      Alert.alert('Ride Cancel?', 'Pickup nahi pahunch sakte? Isse customer ko naya driver milega.', [
                        { text: 'Nahi', style: 'cancel' },
                        { text: 'Haan, Cancel Karo', style: 'destructive', onPress: async () => {
                          try {
                            const r = await fetch(`${API}/api/hourly/driver-cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: activeHourlyRide.id, driver_phone: phone }) });
                            const d = await r.json();
                            if (d.success) { setActiveHourlyRide(null); setResult('Ride cancel ho gayi.'); }
                            else Alert.alert('Error', d.error || 'Cancel nahi hua');
                          } catch (_e) { Alert.alert('Error', 'Network error'); }
                        }},
                      ]);
                    }}>
                    <Text style={{ color: '#E91E63', fontWeight: '700', fontSize: 13 }}>✗ Pickup Nahi Pahunch Sakta — Cancel Karo</Text>
                  </TouchableOpacity>
                </View>
              )}

              {activeHourlyRide.status === 'active' && (
                <View style={{ marginTop: 10 }}>
                  {/* KM + Time progress bars */}
                  <View style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                      <Text style={{ fontSize: 12, color: '#666' }}>📍 {liveKm.toFixed(1)} / {activeHourlyRide.km_included} km</Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: liveKm / (activeHourlyRide.km_included||1) > 0.9 ? '#E91E63' : liveKm / (activeHourlyRide.km_included||1) > 0.8 ? '#ff9800' : '#2e7d32' }}>
                        {Math.max(0, (activeHourlyRide.km_included||0) - liveKm).toFixed(1)} km bache
                      </Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: liveKm / (activeHourlyRide.km_included||1) > 0.9 ? '#E91E63' : liveKm / (activeHourlyRide.km_included||1) > 0.8 ? '#ff9800' : '#16A34A', width: `${Math.min(100, (liveKm / (activeHourlyRide.km_included||1)) * 100)}%` as any }} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                      <Text style={{ fontSize: 12, color: '#666' }}>⏱️ {String(Math.floor(hourlyTimerSec/3600)).padStart(2,'0')}:{String(Math.floor((hourlyTimerSec%3600)/60)).padStart(2,'0')} elapsed</Text>
                      <Text style={{ fontSize: 12, color: '#94A3B8' }}>
                        {(() => { const rem = Math.max(0, parseFloat(activeHourlyRide.package_hours||0)*3600 - hourlyTimerSec); return rem > 0 ? `${String(Math.floor(rem/3600)).padStart(2,'0')}:${String(Math.floor((rem%3600)/60)).padStart(2,'0')} bache` : '⚠️ Time up!'; })()}
                      </Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: '#334155', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: '#10B981', width: `${Math.min(100, (hourlyTimerSec / ((parseFloat(activeHourlyRide.package_hours||1))*3600)) * 100)}%` as any }} />
                    </View>
                    {liveKm / (activeHourlyRide.km_included||1) > 0.8 && (
                      <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
                        <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: '700' }}>⚠️ {Math.max(0, (activeHourlyRide.km_included||0) - liveKm).toFixed(1)} km bache — extra charges lagengen!</Text>
                      </View>
                    )}
                  </View>

                  <View style={{ backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 8, padding: 8, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' }}>
                    <Text style={{ color: '#10B981', fontSize: 12 }}>💰 Guaranteed: ₹{Math.round(parseFloat(activeHourlyRide.base_fare || 0) * 0.70 * 0.88).toFixed(0)} min · Full milne par ₹{Math.round(parseFloat(activeHourlyRide.base_fare || 0) * 0.88).toFixed(0)}</Text>
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
                        <Text style={{ fontWeight: '700', color: '#E91E63', fontSize: 14 }}>Return — Pickup Navigate Karo</Text>
                        <Text style={{ color: '#64748B', fontSize: 11, marginTop: 2 }} numberOfLines={1}>📍 {activeHourlyRide.pickup}</Text>
                      </View>
                      <Text style={{ color: '#E91E63', fontSize: 18 }}>›</Text>
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
                        return <Text style={{ fontWeight: 'bold', color: '#E91E63', marginBottom: 4 }}>📅 Customer +{label} Extend Chahta Hai</Text>;
                      })()}
                      <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 10 }}>Agree karne se trip extend hogi — paise escrow mein hain</Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Bouncy style={{ flex: 1, backgroundColor: hExtendLoading ? '#334155' : '#10B981', borderRadius: 10, padding: 12, alignItems: 'center' }} onPress={acceptExtend} disabled={hExtendLoading}>
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
                          <Text style={{ fontWeight: 'bold', color: '#F59E0B', marginBottom: 6 }}>⚠️ Customer Trip Khatam Karna Chahta Hai</Text>
                          <Text style={{ color: '#94A3B8', fontSize: 12, marginBottom: 10 }}>Agree karne par actual time ke hisaab se proportional payment milegi.</Text>
                          <View style={{ flexDirection: 'row', gap: 10 }}>
                            <Bouncy style={{ flex: 1, backgroundColor: '#10B981', borderRadius: 10, padding: 12, alignItems: 'center' }} onPress={confirmHourlyEarlyEnd} disabled={hEarlyEndLoading}><Text style={{ color: '#fff', fontWeight: 'bold' }}>✅ Agree</Text></Bouncy>
                            <Bouncy style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }} onPress={rejectHourlyEarlyEnd}><Text style={{ color: '#94A3B8', fontWeight: 'bold' }}>✗ Reject</Text></Bouncy>
                          </View>
                        </View>
                      ) : activeHourlyRide.early_end_requested_by === 'driver' ? (
                        <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 10, padding: 10, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
                          <Text style={{ color: '#F59E0B', fontSize: 12 }}>⏳ Customer ke confirm ka intezaar...</Text>
                        </View>
                      ) : (activeHourlyRide.early_end_reject_count || 0) >= 2 ? (
                        <View style={{ backgroundColor: 'rgba(233,69,96,0.1)', borderRadius: 10, padding: 10, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: 'rgba(233,69,96,0.3)' }}>
                          <Text style={{ color: '#E91E63', fontSize: 12, fontWeight: '700' }}>🔒 2 baar reject — Support se contact karo</Text>
                        </View>
                      ) : activeHourlyRide.early_end_last_rejected_at && (Date.now() - new Date(activeHourlyRide.early_end_last_rejected_at).getTime()) < 15 * 60 * 1000 ? (
                        <View style={{ backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
                          <Text style={{ color: '#64748B', fontSize: 12 }}>⏳ {Math.ceil((15 * 60 * 1000 - (Date.now() - new Date(activeHourlyRide.early_end_last_rejected_at).getTime())) / 60000)} min baad phir request</Text>
                        </View>
                      ) : (
                        <Bouncy style={[s.cancelBtn, { borderColor: '#ff9800', borderWidth: 1, marginTop: 8 }]} onPress={requestHourlyEarlyEnd} disabled={hEarlyEndLoading}>
                          <Text style={[s.cancelTxt, { color: '#ff9800' }]}>⏹️ Early End Request (mutual agreement)</Text>
                        </Bouncy>
                      )
                    );

                    // State 1: Legacy pending customer confirm
                    if (activeHourlyRide.pending_customer_confirm) return (
                      <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 12, padding: 14, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' }}>
                        <Text style={{ fontWeight: 'bold', color: '#F59E0B', marginBottom: 4 }}>⏳ Customer Confirmation Ka Intezaar...</Text>
                        <Text style={{ fontSize: 12, color: '#94A3B8' }}>10 min mein auto-confirm ho jayega</Text>
                      </View>
                    );

                    // State 2: 20-min startup lock
                    if (hourlyTimerSec < 20 * 60) return (
                      <View style={{ backgroundColor: '#F8FAFC', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
                        <Text style={{ color: '#94A3B8', fontWeight: '700', fontSize: 14 }}>🔒 Startup: {Math.ceil(20 - hourlyTimerSec / 60)} min aur</Text>
                        <Text style={{ color: '#475569', fontSize: 11, marginTop: 3 }}>Trip start ke baad 20 min ka lock</Text>
                      </View>
                    );

                    // State 3: Package time still remaining — locked, show early end option
                    if (remSec > 0) return (
                      <View style={{ marginBottom: 10 }}>
                        <View style={{ backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(233,30,99,0.3)' }}>
                          <Text style={{ color: '#E91E63', fontWeight: '800', fontSize: 18, marginBottom: 4 }}>⏰ {remStr} Baaki</Text>
                          <Text style={{ color: '#64748B', fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
                            Package time poori hone par hi{'\n'}Complete button aayega
                          </Text>
                        </View>
                        <EarlyEndSection />
                      </View>
                    );

                    // State 4: Time complete — show complete button
                    return (
                      <Bouncy style={[s.tripBtn, { backgroundColor: '#16A34A', marginBottom: 10 }]} onPress={completeHourlyTrip} disabled={loading}>
                        <Text style={s.tripBtnTxt}>{loading ? '...' : '✅ Trip Complete Karo'}</Text>
                      </Bouncy>
                    );
                  })()}
                </View>
              )}
            </View>
          )}

          {isOnline && !rideReq && !activeRide && !activeHourlyRide && !hourlyRideReq && (
            <View style={s.statusCard}><Text style={s.statusText}>✅ Online hain — Live tab pe rides dikhengi</Text></View>
          )}
          {!isOnline && (
            <View style={s.statusCard}><Text style={s.statusText}>💤 Online ho jao rides lene ke liye</Text></View>
          )}
          {(rideReq || activeRide || hourlyRideReq || activeHourlyRide) && (
            <TouchableOpacity onPress={() => setActiveTab('live')} style={{ backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: 14, padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.4)', elevation: 3 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981' }} />
              <Text style={{ color: '#10B981', fontWeight: '800', fontSize: 14, flex: 1 }}>
                {rideReq ? '🔔 Nayi Ride Request — Accept Karo!' : activeRide ? `🚗 Active Ride — ${activeRide.status === 'matched' ? 'Pickup pe jao' : activeRide.status === 'arrived' ? 'OTP Verify Karo' : 'Trip Chal Rahi Hai'}` : '⏱️ Hourly Ride Active'}
              </Text>
              <Text style={{ color: '#10B981', fontSize: 18, fontWeight: '900' }}>›</Text>
            </TouchableOpacity>
          )}

          {/* Rules & Info */}
          <View style={{ marginTop: 10 }}>
              <View style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '800', marginBottom: 10 }}>📋 Standard Rides — Rules & Fees</Text>
                {[
                  ['💰 Commission', '15% platform fee — baaki aapki net kamai'],
                  ['🎯 Ride Accept', '20 second window — miss hone par auto-reject'],
                  ['📍 Arrive', '"Pickup pe pahuncha" dabao tab tak wait karo'],
                  ['🔐 OTP Start', 'Customer ka 4-digit OTP verify karke trip shuru'],
                  ['✅ Complete', 'Trip complete dabao — payment auto process hogi'],
                  ['❌ Cancel', 'Baar baar cancel karne par account suspend ho sakta hai'],
                  ['⭐ Rating', 'Achi service do — 4.5+ rating maintain karo'],
                  ['💳 Payment', 'Cash ya wallet — payment waiting screen pe dikhe'],
                ].map(([icon, text], i) => (
                  <View key={i} style={{ flexDirection: 'row', marginBottom: 7 }}>
                    <Text style={{ color: '#E91E63', fontSize: 12, fontWeight: '700', width: 100 }}>{icon}</Text>
                    <Text style={{ color: '#555', fontSize: 11, flex: 1, lineHeight: 16 }}>{text}</Text>
                  </View>
                ))}
              </View>
              <View style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ color: '#E91E63', fontSize: 14, fontWeight: '800', marginBottom: 10 }}>⏱️ Hourly / Daily — Rules & Fees</Text>
                {[
                  ['💰 Commission', '12% platform fee — standard rides se 3% kam!'],
                  ['📦 Packages', '2h·4h·6h·8h same day | 1·2·3 din multi-day'],
                  ['🔐 OTP Start', 'Customer ka OTP verify karo — tab timer shuroo'],
                  ['⏰ Time Lock', 'Complete button tab tak nahi aayega jab tak poora package time khatam nahi — koi shortcut nahi'],
                  ['🤝 Early End', 'Agar dono agree karein to mutual termination — "Early End Request" se hoga, direct complete nahi'],
                  ['🔄 Extension', 'Customer time extend kar sakta hai — aapko notification aayega, accept/reject karein'],
                  ['🗓️ Schedule', 'Scheduled rides 75 min window mein dikhti hain — accept karo, time pe jaao'],
                  ['📍 Extra KM', 'Package KM se zyada chale to customer se extra charge lega system automatically'],
                  ['🛡️ Escrow', 'Payment safely hold hota hai — trip complete ya early end pe aapko milega'],
                  ['🚫 Misuse', 'Package time sirf customer ke kaam ke liye — personal use billing fraud hai'],
                ].map(([icon, text], i) => (
                  <View key={i} style={{ flexDirection: 'row', marginBottom: 8 }}>
                    <Text style={{ color: '#E91E63', fontSize: 11, fontWeight: '700', width: 105 }}>{icon}</Text>
                    <Text style={{ color: '#64748B', fontSize: 11, flex: 1, lineHeight: 16 }}>{text}</Text>
                  </View>
                ))}
              </View>
            </View>
        </ScrollView>
      </View>
      <View style={s.navFloat}><BottomNav activeTab={activeTab} setActiveTab={setActiveTab} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} /></View>
    </KeyboardAvoidingView>
  );

  // ═══ LIVE TAB — Full-screen active ride control ═══
  if (activeTab === 'live') {
    const PT = Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 14 : 52;
    const isIdle = !rideReq && !activeRide && !hourlyRideReq && !activeHourlyRide;
    return (
      <View style={{ flex: 1, backgroundColor: '#F1F5F9' }}>
        <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
        {/* Header */}
        <View style={{ backgroundColor: '#0F172A', paddingTop: PT, paddingHorizontal: 18, paddingBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 22, letterSpacing: 0.3 }}>⚡ Live</Text>
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 1 }}>Active Ride Control</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {isOnline ? <PulseView><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} /></PulseView> : null}
                <Text style={{ color: isOnline ? '#10B981' : '#EF4444', fontWeight: '700', fontSize: 13 }}>{isOnline ? 'Online' : 'Offline'}</Text>
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 }}>{driverInfo?.name || phone}</Text>
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
                <Text style={{ fontSize: 22, fontWeight: '900', color: '#0F172A', marginTop: 24, textAlign: 'center' }}>Rides Ka Intezaar...</Text>
                <Text style={{ fontSize: 14, color: '#64748B', marginTop: 8, textAlign: 'center', lineHeight: 20 }}>Nayi ride aate hi yahan dikhegi{'\n'}aur phone vibrate karega</Text>
              </>
            ) : (
              <>
                <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(239,68,68,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: 'rgba(239,68,68,0.25)' }}>
                  <Text style={{ fontSize: 44 }}>💤</Text>
                </View>
                <Text style={{ fontSize: 22, fontWeight: '900', color: '#0F172A', marginTop: 24, textAlign: 'center' }}>Abhi Offline Hain</Text>
                <Text style={{ fontSize: 14, color: '#64748B', marginTop: 8, textAlign: 'center', lineHeight: 20 }}>Home tab pe jaake online ho{'\n'}phir rides milne lagengi</Text>
                <TouchableOpacity onPress={() => setActiveTab('home')} style={{ backgroundColor: '#E91E63', borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14, marginTop: 24, elevation: 4 }}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>Home Tab Pe Jao</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* ── INCOMING STANDARD RIDE REQUEST ── */}
        {rideReq && !activeRide && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 0, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
            {/* Yellow header */}
            <View style={{ backgroundColor: '#F5C518', paddingTop: 20, paddingHorizontal: 20, paddingBottom: 24, alignItems: 'center' }}>
              {rideReq?.is_favourite_request && (
                <View style={{ backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 6, marginBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: '#1A1A2E', fontSize: 12, fontWeight: '900', letterSpacing: 1 }}>⭐ AAPKA REGULAR CUSTOMER</Text>
                </View>
              )}
              <Text style={{ color: 'rgba(26,18,0,0.75)', fontSize: 11, fontWeight: '900', letterSpacing: 2.5, marginBottom: 6 }}>
                {rideReq?.is_favourite_request ? '⭐ SEEDHI RIDE REQUEST' : '🔔 NAYI RIDE AAYI!'}
              </Text>
              <Text style={{ fontSize: 64, marginBottom: 4 }}>
                {rideReq?.ride_type === 'car' ? '🚕' : rideReq?.ride_type === 'bike' ? '🏍️' : rideReq?.ride_type === 'eriksha' ? '🛵' : rideReq?.ride_type === 'green_bike' ? '⚡' : rideReq?.ride_type === 'electric_auto' ? '🌿' : '🛺'}
              </Text>
              <Text style={{ color: '#1A1200', fontSize: 24, fontWeight: '900' }}>{rideReq?.passenger_name || 'Passenger'}</Text>
              {surgeMultiplier > 1.0 && (
                <View style={{ backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 5, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: '#1A1A2E', fontWeight: '900', fontSize: 14 }}>⚡ {surgeMultiplier}x SURGE</Text>
                </View>
              )}
            </View>

            <View style={{ padding: 16 }}>
              {/* Fare card */}
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 14, alignItems: 'center', elevation: 4, shadowColor: '#22C55E', shadowOpacity: 0.18, shadowRadius: 10 }}>
                <Text style={{ color: '#94A3B8', fontSize: 11, marginBottom: 4, fontWeight: '700', letterSpacing: 1.5 }}>AAPKI KAMAI</Text>
                <Text style={{ color: '#22C55E', fontSize: 52, fontWeight: '900', lineHeight: 58 }}>₹{Math.round((rideReq?.fare || 0) * 0.88)}</Text>
                <Text style={{ color: '#64748B', fontSize: 12 }}>Total: ₹{rideReq?.fare} · 12% commission</Text>
              </View>

              {/* Distance badges */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                {driverGps && rideReq?.pickup_lat && (
                  <View style={{ flex: 1, backgroundColor: '#EFF6FF', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#BFDBFE' }}>
                    <Text style={{ color: '#2563EB', fontSize: 11, fontWeight: '800' }}>📍 Aap se Pickup</Text>
                    <Text style={{ color: '#1D4ED8', fontSize: 22, fontWeight: '900', marginTop: 3 }}>
                      {haversineKm(driverGps.lat, driverGps.lng, rideReq.pickup_lat, rideReq.pickup_lng).toFixed(1)} km
                    </Text>
                  </View>
                )}
                {rideReq?.distance && (
                  <View style={{ flex: 1, backgroundColor: '#F0FDF4', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#BBF7D0' }}>
                    <Text style={{ color: '#16A34A', fontSize: 11, fontWeight: '800' }}>🛣️ Trip Distance</Text>
                    <Text style={{ color: '#15803D', fontSize: 22, fontWeight: '900', marginTop: 3 }}>{rideReq.distance} km</Text>
                  </View>
                )}
              </View>

              {/* Route */}
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

              {/* Accept / Reject */}
              <View style={{ flexDirection: 'row', gap: 14, marginTop: 14 }}>
                <TouchableOpacity style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB', elevation: 2 }} onPress={rejectRide}>
                  <Text style={{ fontSize: 26 }}>✕</Text>
                  <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 14, marginTop: 4 }}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 2, backgroundColor: '#22C55E', borderRadius: 16, padding: 20, alignItems: 'center', elevation: 6, shadowColor: '#22C55E', shadowOpacity: 0.45, shadowRadius: 12 }} onPress={acceptRide} disabled={loading}>
                  <Text style={{ fontSize: 26 }}>✓</Text>
                  <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16, marginTop: 4 }}>
                    {loading ? 'Accept ho raha...' : 'ACCEPT KARO'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        )}

        {/* ── INCOMING HOURLY RIDE REQUEST ── */}
        {hourlyRideReq && !activeRide && !activeHourlyRide && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
            <View style={{ backgroundColor: '#E91E63', borderRadius: 16, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>⏱️ HOURLY</Text></View>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18, flex: 1 }}>
                {hourlyRideReq.package_hours >= 24 ? `${hourlyRideReq.package_hours / 24} Day${hourlyRideReq.package_hours > 24 ? 's' : ''}` : hourlyRideReq.package_hours === 8 ? 'Full Day (8h)' : `${hourlyRideReq.package_hours} Hours`}
              </Text>
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>₹{hourlyRideReq.base_fare}</Text>
            </View>
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 14, elevation: 3, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <View style={{ flex: 1, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#2563EB', fontSize: 11, fontWeight: '800' }}>📦 Included KM</Text>
                  <Text style={{ color: '#1D4ED8', fontSize: 22, fontWeight: '900', marginTop: 2 }}>{hourlyRideReq.km_included} km</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#F0FDF4', borderRadius: 12, padding: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#16A34A', fontSize: 11, fontWeight: '800' }}>💰 Aapki Kamai</Text>
                  <Text style={{ color: '#15803D', fontSize: 22, fontWeight: '900', marginTop: 2 }}>₹{Math.round(parseFloat(hourlyRideReq.base_fare || 0) * 0.88)}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 }}>PICKUP</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 10 }}>{hourlyRideReq.pickup}</Text>
              {hourlyRideReq.drop_location && (
                <><Text style={{ fontSize: 10, color: '#64748B', fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 }}>DROP</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{hourlyRideReq.drop_location}</Text></>
              )}
              {!hourlyRideReq.drop_location && <Text style={{ color: '#94A3B8', fontSize: 13 }}>Drop: Flexible</Text>}
            </View>
            {hourlyRideReq.scheduled_at && (
              <View style={{ backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: 10, padding: 10, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(233,30,99,0.3)' }}>
                <Text style={{ fontSize: 16 }}>📅</Text>
                <Text style={{ color: '#E91E63', fontSize: 13, fontWeight: '700' }}>SCHEDULED: {new Date(hourlyRideReq.scheduled_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            )}
            {!hourlyRideReq.scheduled_at && <CountdownBar seconds={25} onTimeout={() => setHourlyRideReq(null)} />}
            <View style={{ flexDirection: 'row', gap: 14, marginTop: 14 }}>
              <TouchableOpacity style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB', elevation: 2 }} onPress={() => setHourlyRideReq(null)}>
                <Text style={{ fontSize: 26 }}>✕</Text>
                <Text style={{ color: '#EF4444', fontWeight: '800', fontSize: 14, marginTop: 4 }}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 2, backgroundColor: '#22C55E', borderRadius: 16, padding: 20, alignItems: 'center', elevation: 6, shadowColor: '#22C55E', shadowOpacity: 0.45, shadowRadius: 12 }} onPress={acceptHourlyRide} disabled={loading}>
                <Text style={{ fontSize: 26 }}>✓</Text>
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 16, marginTop: 4 }}>{loading ? 'Accept ho raha...' : 'ACCEPT KARO'}</Text>
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
              <View style={{ backgroundColor: activeRide.status === 'matched' ? '#16A34A' : activeRide.status === 'arrived' ? '#2563EB' : '#10B981', borderRadius: 14, padding: 14, marginBottom: 14, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>
                  {activeRide.status === 'matched' && '🚗 Pickup ki taraf jao'}
                  {activeRide.status === 'arrived' && '📍 Pickup pe pahunche — OTP lo'}
                  {activeRide.status === 'started' && '🛣️ Trip chal rahi hai'}
                </Text>
              </View>

              {/* Customer card */}
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 14, elevation: 3, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(233,30,99,0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 2, borderColor: 'rgba(233,30,99,0.2)' }}>
                    <Text style={{ color: '#E91E63', fontSize: 22, fontWeight: 'bold' }}>{activeRide.passenger_name?.[0] || 'P'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 17, fontWeight: '900', color: '#0F172A' }}>{activeRide.passenger_name || 'Passenger'}</Text>
                    <Text style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>📞 {activeRide.passenger_phone_masked || '**********'}</Text>
                  </View>
                  <Text style={{ fontSize: 24, fontWeight: '900', color: '#16A34A' }}>₹{activeRide.fare}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={{ flex: 1, backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#BBF7D0' }} onPress={() => { setUnreadChat(0); setShowChat(true); }}>
                    <View style={{ position: 'relative' }}>
                      <Ionicons name="chatbubble" size={20} color="#16A34A" />
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
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#16A34A', marginTop: 2 }} numberOfLines={2}>{activeRide.pickup}</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 10, color: '#64748B', fontWeight: '700', letterSpacing: 0.8 }}>DROP</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#E91E63', marginTop: 2 }} numberOfLines={2}>{activeRide.drop_location}</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* ETA / Distance banners */}
              {eta ? (
                <View style={{ backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 10, padding: 10, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)' }}>
                  <Text style={{ color: '#16A34A', fontWeight: '700', fontSize: 14 }}>🕐 {eta}</Text>
                </View>
              ) : null}
              {distToPickup && (activeRide.status === 'matched' || activeRide.status === 'arrived') && (
                <View style={{ backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: 10, padding: 10, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(233,30,99,0.25)' }}>
                  <Text style={{ color: '#E91E63', fontWeight: '700', fontSize: 15 }}>📍 {distToPickup}</Text>
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
                  onPress={() => navigateTo(activeRide.pickup, activeRide.pickup_lat, activeRide.pickup_lng)}
                >
                  <Ionicons name="navigate" size={20} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Pickup Navigate Karo</Text>
                </TouchableOpacity>
              )}
              {activeRide.status === 'started' && (
                <TouchableOpacity
                  style={[s.navBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 0, backgroundColor: 'rgba(14,165,233,0.9)' }]}
                  onPress={() => navigateTo(activeRide.drop_location, activeRide.drop_lat, activeRide.drop_lng)}
                >
                  <Ionicons name="navigate" size={20} color="#8ae961" />
                  <Text style={{ color: '#8ae961', fontWeight: '700', fontSize: 16 }}>Drop Navigate Karo</Text>
                </TouchableOpacity>
              )}

              {/* ── Spacer + divider between navigate and CTA ── */}
              <View style={{ height: 1, backgroundColor: '#E2E8F0', marginVertical: 20, marginHorizontal: 4 }} />

              {/* ── Primary CTA: Arrived at pickup ── */}
              {activeRide.status === 'matched' && (
                <Bouncy style={[s.tripBtn, { paddingVertical: 20, marginBottom: 28 }]} onPress={markArrived} disabled={loading}>
                  <Text style={[s.tripBtnTxt, { fontSize: 18 }]}>{loading ? '...' : '📍 Pickup pe pahunch gaya'}</Text>
                </Bouncy>
              )}

              {/* ── OTP entry — cancel ABOVE so keyboard never hides it ── */}
              {activeRide.status === 'arrived' && (
                <View>
                  <Bouncy
                    style={[s.cancelBtn, { borderWidth: 1.5, borderColor: '#E91E63', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 20 }]}
                    onPress={() => setShowDriverCancelModal(true)}
                    disabled={loading}
                  >
                    <Text style={[s.cancelTxt, { fontSize: 14, fontWeight: '700' }]}>✕ Cancel Trip</Text>
                  </Bouncy>
                  <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, padding: 22, elevation: 4, borderWidth: 2, borderColor: '#E2E8F0' }}>
                    <Text style={{ fontSize: 15, color: '#0F172A', marginBottom: 18, textAlign: 'center', fontWeight: '700' }}>🔐 Passenger se 4-digit OTP poocho</Text>
                    <TextInput
                      style={{ borderWidth: 2.5, borderColor: otpInput.length === 4 ? '#16A34A' : '#E2E8F0', borderRadius: 16, paddingVertical: 20, paddingHorizontal: 18, fontSize: 36, textAlign: 'center', letterSpacing: 14, marginBottom: 20, fontWeight: '900', backgroundColor: '#F8FAFC', color: '#0F172A' }}
                      keyboardType="number-pad"
                      maxLength={4}
                      value={otpInput}
                      onChangeText={setOtpInput}
                      placeholder="○ ○ ○ ○"
                      placeholderTextColor="#D4A520"
                      autoFocus={false}
                    />
                    <Bouncy style={[s.tripBtn, { paddingVertical: 20, opacity: otpInput.length < 4 ? 0.5 : 1 }]} onPress={startTrip} disabled={loading || otpInput.length < 4}>
                      <Text style={[s.tripBtnTxt, { fontSize: 18 }]}>{loading ? '...' : '🚀 OTP Verify & Trip Shuru'}</Text>
                    </Bouncy>
                  </View>
                </View>
              )}

              {/* ── Complete trip + cancel (well spaced) ── */}
              {activeRide.status === 'started' && (
                <View>
                  <Bouncy style={[s.tripBtn, { backgroundColor: '#10B981', shadowColor: '#10B981', paddingVertical: 20, marginBottom: 0 }]} onPress={completeTrip} disabled={loading}>
                    <Text style={[s.tripBtnTxt, { fontSize: 18 }]}>{loading ? '...' : '✅ Trip Complete Karo'}</Text>
                  </Bouncy>
                  {/* Extra large gap so cancel is NOT accidentally hit after tapping Complete */}
                  <View style={{ height: 24 }} />
                  <Bouncy style={[s.cancelBtn, { borderWidth: 1.5, borderColor: '#E91E63', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 16 }]} onPress={() => setShowDriverCancelModal(true)} disabled={loading}>
                    <Text style={[s.cancelTxt, { fontSize: 14, fontWeight: '700' }]}>✕ Cancel Trip</Text>
                  </Bouncy>
                </View>
              )}

              {/* Chat message alert */}
              {unreadChat > 0 && (
                <TouchableOpacity style={{ backgroundColor: '#E91E63', borderRadius: 12, padding: 12, marginTop: 10, alignItems: 'center' }} onPress={() => { setUnreadChat(0); setShowChat(true); }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>💬 Customer ne {unreadChat} message bheja</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {/* ── ACTIVE HOURLY RIDE ── */}
        {activeHourlyRide && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
            <View style={{ backgroundColor: '#E91E63', borderRadius: 16, padding: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>⏱️ HOURLY</Text></View>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>
                  {activeHourlyRide.status === 'matched' ? '🚗 Pickup pe jao' : '🛣️ Trip chal rahi hai'}
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
                  <Ionicons name="chatbubble" size={20} color="#16A34A" />
                  <Text style={{ color: '#15803D', fontWeight: '700', fontSize: 14 }}>Chat</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#BFDBFE' }} onPress={callCustomer}>
                  <Ionicons name="call" size={20} color="#2563EB" />
                  <Text style={{ color: '#1D4ED8', fontWeight: '700', fontSize: 14 }}>Call</Text>
                </TouchableOpacity>
              </View>
              {chatToast && (
                <TouchableOpacity style={{ backgroundColor: '#1a1a2e', borderRadius: 12, padding: 12, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(233,30,99,0.5)', elevation: 6 }} onPress={() => { setChatToast(null); setShowHourlyChat(true); setHourlyChatMsgs([]); }}>
                  <Ionicons name="chatbubble" size={16} color="#E91E63" />
                  <Text style={{ color: '#fff', fontSize: 13, flex: 1, fontWeight: '600' }} numberOfLines={1}>{chatToast}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>Tap to reply</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Route */}
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 13, color: '#16A34A', fontWeight: '700', marginBottom: 6 }}>📍 {activeHourlyRide.pickup}</Text>
              {activeHourlyRide.drop_location && <Text style={{ fontSize: 13, color: '#E91E63', fontWeight: '700', marginTop: 4 }}>🎯 {activeHourlyRide.drop_location}</Text>}
            </View>

            {/* OTP section (matched) */}
            {activeHourlyRide.status === 'matched' && (
              <View>
                {!hourlyArrived ? (
                  <Bouncy
                    style={{ backgroundColor: '#16A34A', borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginBottom: 12, elevation: 4, shadowColor: '#16A34A', shadowOpacity: 0.35, shadowRadius: 10 }}
                    onPress={async () => {
                      try {
                        await fetch(`${API}/api/hourly/arrived`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: activeHourlyRide.id, driver_phone: phone }) });
                        setHourlyArrived(true);
                      } catch (_e) { Alert.alert('Error', 'Network error'); }
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>📍 Pickup Pe Pahunch Gaya</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 3 }}>Customer ko notification milegi</Text>
                  </Bouncy>
                ) : (
                  <View style={{ backgroundColor: '#F0FDF4', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 12, borderWidth: 1.5, borderColor: '#86EFAC' }}>
                    <Text style={{ color: '#15803D', fontWeight: '800', fontSize: 14 }}>✅ Customer ko Notify Ho Gaya — OTP Leke Trip Shuru Karo</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[s.navBtn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 0 }]}
                  onPress={() => Linking.openURL(`google.navigation:q=${encodeURIComponent(activeHourlyRide.pickup)}`).catch(() => Linking.openURL(`https://maps.google.com/?daddr=${encodeURIComponent(activeHourlyRide.pickup)}`))}
                >
                  <Ionicons name="navigate" size={20} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Pickup Navigate Karo</Text>
                </TouchableOpacity>
                <View style={{ height: 1, backgroundColor: '#E2E8F0', marginVertical: 20, marginHorizontal: 4 }} />
                <TouchableOpacity
                  onPress={() => Alert.alert('Ride Cancel?', 'Pickup nahi pahunch sakte?', [
                    { text: 'Nahi', style: 'cancel' },
                    { text: 'Haan, Cancel Karo', style: 'destructive', onPress: async () => {
                      try { const r = await fetch(`${API}/api/hourly/driver-cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: activeHourlyRide.id, driver_phone: phone }) }); const d = await r.json(); if (d.success) { setActiveHourlyRide(null); setResult('Ride cancel ho gayi.'); } else Alert.alert('Error', d.error || 'Cancel nahi hua'); } catch (_e) { Alert.alert('Error', 'Network error'); }
                    }},
                  ])}
                  style={{ borderWidth: 1.5, borderColor: '#E91E63', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center', marginBottom: 20 }}
                >
                  <Text style={{ color: '#E91E63', fontWeight: '700', fontSize: 14 }}>✗ Pickup Nahi Pahunch Sakta — Cancel Karo</Text>
                </TouchableOpacity>
                <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, padding: 22, elevation: 4, borderWidth: 2, borderColor: '#10B981' }}>
                  <Text style={{ fontSize: 14, color: '#0F172A', marginBottom: 16, textAlign: 'center', fontWeight: '700' }}>🔐 Customer se OTP poocho</Text>
                  <TextInput
                    style={{ borderWidth: 2.5, borderColor: '#10B981', borderRadius: 14, paddingVertical: 18, paddingHorizontal: 16, fontSize: 34, textAlign: 'center', letterSpacing: 12, marginBottom: 18, fontWeight: 'bold', backgroundColor: '#F8FAFC', color: '#0F172A' }}
                    placeholder="0000" placeholderTextColor="#94A3B8" keyboardType="number-pad" maxLength={4} value={hourlyOtpInput} onChangeText={setHourlyOtpInput}
                  />
                  <Bouncy style={[s.tripBtn, { paddingVertical: 18 }]} onPress={startHourlyTrip} disabled={loading}>
                    <Text style={[s.tripBtnTxt, { fontSize: 17 }]}>{loading ? '...' : '🚀 OTP Verify & Trip Shuru'}</Text>
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
                    <Text style={{ fontSize: 12, fontWeight: '600', color: liveKm / (activeHourlyRide.km_included || 1) > 0.9 ? '#E91E63' : liveKm / (activeHourlyRide.km_included || 1) > 0.8 ? '#ff9800' : '#2e7d32' }}>
                      {Math.max(0, (activeHourlyRide.km_included || 0) - liveKm).toFixed(1)} km bache
                    </Text>
                  </View>
                  <View style={{ height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: liveKm / (activeHourlyRide.km_included || 1) > 0.9 ? '#E91E63' : liveKm / (activeHourlyRide.km_included || 1) > 0.8 ? '#ff9800' : '#16A34A', width: `${Math.min(100, (liveKm / (activeHourlyRide.km_included || 1)) * 100)}%` as any }} />
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
                        <Text style={{ color: '#E91E63', fontWeight: '800', fontSize: 16 }}>⏰ {remStr} Baaki</Text>
                      </View>
                    );
                    return (
                      <Bouncy style={[s.tripBtn, { backgroundColor: '#16A34A', paddingVertical: 20, marginBottom: 0 }]} onPress={completeHourlyTrip} disabled={loading}>
                        <Text style={[s.tripBtnTxt, { fontSize: 18 }]}>{loading ? '...' : '✅ Trip Complete Karo'}</Text>
                      </Bouncy>
                    );
                  })()}
                </View>
                {!!activeHourlyRide.extend_requested_hours && (
                  <View style={{ backgroundColor: 'rgba(233,30,99,0.08)', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(233,30,99,0.3)' }}>
                    <Text style={{ fontWeight: 'bold', color: '#E91E63', marginBottom: 6 }}>📅 Customer Extend Chahta Hai (+{activeHourlyRide.extend_requested_hours}h)</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Bouncy style={{ flex: 1, backgroundColor: '#10B981', borderRadius: 10, padding: 12, alignItems: 'center' }} onPress={acceptExtend} disabled={hExtendLoading}>
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>✅ Accept</Text>
                      </Bouncy>
                      <Bouncy style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }} onPress={rejectExtend} disabled={hExtendLoading}>
                        <Text style={{ color: '#94A3B8', fontWeight: 'bold' }}>✗ Reject</Text>
                      </Bouncy>
                    </View>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        )}

        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
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

    if (driverSubScreen === 'documents') return (
      <View style={s.screen}>
        <SubHeader title="📋 Documents" />
        <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Verification status */}
          <View style={{ backgroundColor: driverInfo?.status === 'approved' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', borderRadius: 16, padding: 18, marginBottom: 16, alignItems: 'center', elevation: 2, borderWidth: 1, borderColor: driverInfo?.status === 'approved' ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)' }}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>{driverInfo?.status === 'approved' ? '✅' : '⏳'}</Text>
            <Text style={{ fontSize: 16, fontWeight: '900', color: driverInfo?.status === 'approved' ? '#10B981' : '#F59E0B' }}>
              {driverInfo?.status === 'approved' ? 'Verified Driver' : 'Verification Pending'}
            </Text>
            <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 4, textAlign: 'center' }}>
              {driverInfo?.status === 'approved'
                ? 'Aapke sabhi documents verify ho chuke hain'
                : 'Aapke documents review me hain — 24-48 ghante lagenge'}
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
            <Text style={{ fontSize: 13, color: '#E91E63', fontWeight: '600', marginBottom: 4 }}>📌 Documents Update karne ke liye</Text>
            <Text style={{ fontSize: 12, color: '#94A3B8' }}>Support se contact karo ya app re-registration karo naye documents ke saath.</Text>
            <TouchableOpacity onPress={() => { back(); setDrSubScreen('support'); }}
              style={{ backgroundColor: '#E91E63', borderRadius: 10, padding: 10, alignItems: 'center', marginTop: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Contact Support</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        <BottomNav activeTab={activeTab} setActiveTab={(t: string) => { back(); setActiveTab(t); }} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
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
              Bank details verified hone ke baad aapka weekly payout seedha account me aayega. NEFT/IMPS ke through — 1-2 working days.
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
                style={{ backgroundColor: '#10B981', borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 18 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>✏️ Edit Bank Details</Text>
              </TouchableOpacity>
              {bankMsg ? <Text style={{ textAlign: 'center', marginTop: 10, fontSize: 13, color: '#10B981' }}>{bankMsg}</Text> : null}
            </View>
          ) : (
            /* ── Editable form ── */
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 18, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 16 }}>Bank Account Details</Text>

              <Text style={{ fontSize: 12, fontWeight: '600', color: '#94A3B8', marginBottom: 6 }}>Account Holder Name</Text>
              <TextInput
                style={{ borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#0F172A', marginBottom: 14, backgroundColor: '#FFFFFF' }}
                placeholder="Aapka pura naam"
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
                style={{ backgroundColor: bankSaving ? '#334155' : '#10B981', borderRadius: 12, padding: 14, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{bankSaving ? 'Saving...' : '💾 Save Bank Details'}</Text>
              </TouchableOpacity>
              {hasSaved && (
                <TouchableOpacity onPress={() => { setBankMsg(''); setBankEditing(false); }}
                  style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 10 }}>
                  <Text style={{ color: '#94A3B8', fontWeight: '700', fontSize: 14 }}>Cancel</Text>
                </TouchableOpacity>
              )}
              {bankMsg ? <Text style={{ textAlign: 'center', marginTop: 10, fontSize: 13, color: bankMsg.startsWith('✅') ? '#10B981' : '#E91E63' }}>{bankMsg}</Text> : null}
            </View>
          )}
        </ScrollView>
        <BottomNav activeTab={activeTab} setActiveTab={(t: string) => { back(); setActiveTab(t); }} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
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
            <Text style={{ color: '#64748B', fontSize: 12, marginTop: 4, textAlign: 'center' }}>24x7 help ke liye humse contact karo</Text>
          </View>
          {[
            { icon: '📋', label: 'My Complaints', sub: 'File or track complaints', color: '#E91E63', action: async () => { setDrvCmpLoading(true); try { const r = await fetch(`${API}/api/complaints?phone=${encodeURIComponent(phone)}`); const d = await r.json(); if (Array.isArray(d.complaints)) setDrvComplaints(d.complaints); } catch{} setDrvCmpLoading(false); setDrSubScreen('complaints'); } },
            { icon: '💬', label: 'WhatsApp', sub: 'Sabse fast response', color: '#25D366', action: () => Linking.openURL('https://wa.me/919999999999?text=Hi%20Sppero%20Driver%20Support') },
            { icon: '📞', label: 'Helpline Call', sub: '24x7 available', color: '#3B82F6', action: () => Linking.openURL('tel:9999999999') },
            { icon: '📧', label: 'Email Support', sub: 'Response in 24 hrs', color: '#E91E63', action: () => Linking.openURL('mailto:driver.support@sppero.com') },
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
            ['Payment nahi mila?', 'Trip complete ke baad 24 ghante wait karo. Agar nahi aaya toh support contact karo.'],
            ['Account suspend hua?', 'Email pe reason bheja gaya hoga — support se baat karo appeal ke liye.'],
            ['Rating kaise badhayein?', 'Time pe pickup, clean vehicle aur polite behaviour se rating naturally badhti hai.'],
            ['Commission kab katega?', 'Har completed ride pe 15% commission automatically wallet se cut hota hai.'],
          ].map(([q, a], i) => (
            <View key={i} style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 16, marginBottom: 10, elevation: 1, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#CBD5E1', marginBottom: 6 }}>❓ {q}</Text>
              <Text style={{ fontSize: 12, color: '#94A3B8', lineHeight: 18 }}>{a}</Text>
            </View>
          ))}
        </ScrollView>
        <BottomNav activeTab={activeTab} setActiveTab={(t: string) => { back(); setActiveTab(t); }} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
      </View>
    );

    // ─── Driver: My Complaints ───
    if (driverSubScreen === 'complaints') {
      const statusMeta: any = {
        open:               { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  label: 'OPEN',              icon: '🕐' },
        under_review:       { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', label: 'UNDER REVIEW',      icon: '🔍' },
        awaiting_response:  { color: '#a855f7', bg: 'rgba(168,85,247,0.12)', label: 'YOUR REPLY NEEDED', icon: '💬' },
        evidence_requested: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  label: 'EVIDENCE NEEDED',   icon: '📎' },
        resolved:           { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  label: 'RESOLVED',          icon: '✅' },
        closed:             { color: '#6b7280', bg: 'rgba(107,114,128,0.12)', label: 'CLOSED',           icon: '🔒' },
        appealed:           { color: '#E91E63', bg: 'rgba(233,69,96,0.12)',  label: 'APPEALED',          icon: '⚖️' },
        escalated:          { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  label: 'ESCALATED',         icon: '🚨' },
      };
      const typeEmoji: any = { customer_no_show:'🚫', property_damage:'🔧', abusive_behavior:'😠', false_accusation:'⚖️', wrong_location:'📍', payment_issue:'💸', other:'📝' };
      return (
        <View style={s.screen}>
          <SubHeader title="📋 Meri Complaints" />
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
            {/* CTA */}
            <TouchableOpacity
              onPress={() => { setDrvCmpType(''); setDrvCmpTitle(''); setDrvCmpDesc(''); setDrvCmpRideId(lastRideId || ''); setDrvCmpStep(1); setDrSubScreen('complaint-new'); }}
              style={{ backgroundColor: '#E91E63', borderRadius: 16, padding: 16, marginBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, elevation: 4, shadowColor: '#E91E63', shadowOpacity: 0.3, shadowRadius: 8 }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>+</Text>
              </View>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>Nayi Complaint File Karo</Text>
            </TouchableOpacity>

            {/* Loading state */}
            {drvCmpLoading && (
              <View style={{ alignItems: 'center', paddingTop: 40, paddingBottom: 24 }}>
                <ActivityIndicator size="large" color="#E91E63" />
                <Text style={{ fontSize: 13, color: '#94A3B8', marginTop: 14 }}>Complaints load ho rahi hain...</Text>
              </View>
            )}

            {/* Quick categories */}
            {!drvCmpLoading && drvComplaints.length === 0 && (
              <>
                <View style={{ alignItems: 'center', paddingTop: 16, paddingBottom: 24 }}>
                  <Text style={{ fontSize: 48 }}>📭</Text>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A', marginTop: 14 }}>Koi complaint nahi abhi</Text>
                  <Text style={{ fontSize: 13, color: '#94A3B8', marginTop: 6, textAlign: 'center', lineHeight: 18 }}>Koi issue tha? Hum 24-72 ghante mein{'\n'}resolve karte hain</Text>
                </View>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#9ca3af', letterSpacing: 1, marginBottom: 10, marginLeft: 2 }}>COMMON ISSUES</Text>
                {[
                  { id: 'customer_no_show', icon: '🚫', label: 'Customer No Show', sla: '2-4h' },
                  { id: 'abusive_behavior', icon: '😠', label: 'Abusive Customer', sla: '2-4h' },
                  { id: 'payment_issue', icon: '💸', label: 'Payment Refused', sla: '24h' },
                ].map(q => (
                  <TouchableOpacity key={q.id}
                    onPress={() => { setDrvCmpType(q.id); setDrvCmpTitle(''); setDrvCmpDesc(''); setDrvCmpRideId(lastRideId || ''); setDrvCmpStep(2); setDrSubScreen('complaint-new'); }}
                    style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', elevation: 2 }}>
                    <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(233,69,96,0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Text style={{ fontSize: 20 }}>{q.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{q.label}</Text>
                      <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>Usually resolved in {q.sla}</Text>
                    </View>
                    <Text style={{ color: '#E91E63', fontSize: 16 }}>›</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* Complaints list */}
            {drvComplaints.length > 0 && (
              <>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#9ca3af', letterSpacing: 1, marginBottom: 10, marginLeft: 2 }}>COMPLAINTS ({drvComplaints.length})</Text>
                {drvComplaints.map((c: any) => {
                  const sm = statusMeta[c.status] || { color: '#9ca3af', bg: 'rgba(156,163,175,0.1)', label: c.status.replace(/_/g,' ').toUpperCase(), icon: '📋' };
                  const needsAction = ['awaiting_response', 'evidence_requested'].includes(c.status);
                  return (
                    <TouchableOpacity key={c.id} onPress={async () => {
                      setDrvCmpLoading(true);
                      try {
                        const r = await fetch(`${API}/api/complaints/${c.id}?phone=${encodeURIComponent(phone)}`);
                        const d = await r.json();
                        setDrvCmpDetail(d);
                        setDrSubScreen('complaint-detail');
                      } catch {}
                      setDrvCmpLoading(false);
                    }} style={{ backgroundColor: '#F8FAFC', borderRadius: 16, marginBottom: 10, overflow: 'hidden', elevation: 3, borderWidth: needsAction ? 2 : 1, borderColor: needsAction ? '#E91E63' : '#334155' }}>
                      {needsAction && (
                        <View style={{ backgroundColor: '#E91E63', paddingHorizontal: 14, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 10, color: '#fff', fontWeight: '900', letterSpacing: 0.5 }}>ACTION REQUIRED</Text>
                        </View>
                      )}
                      <View style={{ padding: 14 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: sm.bg, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                            <Text style={{ fontSize: 16 }}>{typeEmoji[c.complaint_type] || '📋'}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A', lineHeight: 18 }} numberOfLines={2}>{c.title}</Text>
                            <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                              {c.complaint_type?.replace(/_/g,' ')} · {new Date(c.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}
                            </Text>
                          </View>
                          <View style={{ backgroundColor: sm.bg, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, marginLeft: 6 }}>
                            <Text style={{ fontSize: 9, color: sm.color, fontWeight: '900' }}>{sm.icon} {sm.label}</Text>
                          </View>
                        </View>
                        {c.resolution && (
                          <View style={{ backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                            <Text style={{ fontSize: 11, color: '#16a34a', fontWeight: '700' }}>✅ {c.resolution.replace(/_/g,' ')}</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </ScrollView>
          <BottomNav activeTab={activeTab} setActiveTab={(t: string) => { back(); setActiveTab(t); }} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
        </View>
      );
    }

    // ─── Driver: New Complaint (2-step) ───
    if (driverSubScreen === 'complaint-new') {
      const driverTypes = [
        { id: 'customer_no_show', icon: '🚫', label: 'Customer No Show',    desc: 'Customer pickup pe nahi aaya ya bahut der se aaya', sla: '2-4h',  urgent: true  },
        { id: 'abusive_behavior', icon: '😠', label: 'Abusive Behavior',    desc: 'Customer ne gali di, dhamki di, ya haath utha',       sla: '2-4h',  urgent: true  },
        { id: 'payment_issue',    icon: '💸', label: 'Payment Refused',     desc: 'Customer ne payment karne se mana kiya',             sla: '24h',   urgent: false },
        { id: 'property_damage',  icon: '🔧', label: 'Vehicle Damage',      desc: 'Customer ne gaadi ya samaan ko damage kiya',         sla: '72h',   urgent: false },
        { id: 'false_accusation', icon: '⚖️', label: 'False Accusation',    desc: 'Customer ne mujhpe galat complaint ki hai',          sla: '48h',   urgent: false },
        { id: 'wrong_location',   icon: '📍', label: 'Wrong Location',      desc: 'Customer ne galat pickup/drop location diya',        sla: '48h',   urgent: false },
        { id: 'other',            icon: '📝', label: 'Other Issue',         desc: 'Koi aur problem jo upar nahi hai',                   sla: '72h',   urgent: false },
      ];
      const selectedType = driverTypes.find(t => t.id === drvCmpType);
      const autoTitleMap: any = {
        customer_no_show: 'Customer pickup pe nahi aaya',
        abusive_behavior: 'Customer ne abusive behavior kiya',
        payment_issue: 'Customer ne payment refuse kiya',
        property_damage: 'Customer ne vehicle damage kiya',
        false_accusation: 'Customer ne galat complaint ki',
        wrong_location: 'Customer ne wrong location diya',
      };
      return (
        <View style={s.screen}>
          <View style={{ backgroundColor: '#E91E63', paddingTop: Platform.OS === 'android' ? 44 : 56, paddingBottom: 16, paddingHorizontal: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <TouchableOpacity onPress={() => drvCmpStep === 1 ? setDrSubScreen('complaints') : setDrvCmpStep(1)}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Text style={{ color: '#fff', fontSize: 18 }}>‹</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17, flex: 1 }}>
                {drvCmpStep === 1 ? '⚠️ Issue Type Chunno' : '📝 Details Bharein'}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Step {drvCmpStep}/2</Text>
            </View>
            {/* Step indicator */}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: '#E91E63' }} />
              <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: drvCmpStep === 2 ? '#E91E63' : 'rgba(255,255,255,0.15)' }} />
            </View>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
            {drvCmpStep === 1 && (
              <>
                <Text style={{ fontSize: 13, color: '#94A3B8', marginBottom: 14, lineHeight: 18 }}>
                  Sahi category se complaint jaldi resolve hoti hai
                </Text>
                {driverTypes.map(t => (
                  <TouchableOpacity key={t.id} onPress={() => { setDrvCmpType(t.id); if (!drvCmpTitle) setDrvCmpTitle(autoTitleMap[t.id] || ''); }}
                    style={{
                      backgroundColor: drvCmpType === t.id ? 'rgba(233,30,99,0.08)' : '#F8FAFC',
                      borderRadius: 14, padding: 14, marginBottom: 8,
                      borderWidth: 2, borderColor: drvCmpType === t.id ? '#E91E63' : '#E2E8F0',
                      flexDirection: 'row', alignItems: 'center',
                      elevation: drvCmpType === t.id ? 4 : 2,
                    }}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: drvCmpType === t.id ? 'rgba(233,69,96,0.2)' : 'rgba(233,69,96,0.08)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Text style={{ fontSize: 20 }}>{t.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                        <Text style={{ fontWeight: '800', fontSize: 13, color: '#0F172A' }}>{t.label}</Text>
                        {t.urgent && (
                          <View style={{ backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 9, color: '#ef4444', fontWeight: '800' }}>URGENT</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 11, color: drvCmpType === t.id ? 'rgba(255,255,255,0.55)' : '#64748B', marginTop: 2, lineHeight: 15 }}>{t.desc}</Text>
                      <Text style={{ fontSize: 10, color: drvCmpType === t.id ? '#E91E63' : '#475569', marginTop: 3, fontWeight: '700' }}>⏱ SLA: {t.sla}</Text>
                    </View>
                    {drvCmpType === t.id && (
                      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#E91E63', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={() => { if (!drvCmpType) return Alert.alert('Issue Type', 'Pehle ek category chunen'); setDrvCmpStep(2); }}
                  style={{ backgroundColor: '#E91E63', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8, opacity: drvCmpType ? 1 : 0.5 }}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>Aage Badhein →</Text>
                </TouchableOpacity>
              </>
            )}

            {drvCmpStep === 2 && selectedType && (
              <>
                {/* Selected type recap */}
                <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <Text style={{ fontSize: 24 }}>{selectedType.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#0F172A', fontWeight: '800', fontSize: 14 }}>{selectedType.label}</Text>
                    <Text style={{ color: '#64748B', fontSize: 11, marginTop: 2 }}>SLA: {selectedType.sla} · {selectedType.urgent ? 'Priority case' : 'Standard review'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setDrvCmpStep(1)}>
                    <Text style={{ color: '#E91E63', fontSize: 12, fontWeight: '700' }}>Badlo</Text>
                  </TouchableOpacity>
                </View>

                {/* Ride link (required) */}
                <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#CBD5E1', marginBottom: 4 }}>🚗 Ride ID (Zaroori)</Text>
                  <Text style={{ fontSize: 10, color: '#64748B', marginBottom: 8 }}>Complaint kisi ride ke baare mein honi chahiye</Text>
                  {lastRideId && drvCmpRideId !== lastRideId && (
                    <TouchableOpacity onPress={() => setDrvCmpRideId(lastRideId)}
                      style={{ backgroundColor: 'rgba(233,69,96,0.1)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(233,69,96,0.25)' }}>
                      <Text style={{ fontSize: 12, color: '#E91E63', fontWeight: '700' }}>⚡ Last ride use karo</Text>
                      <Text style={{ fontSize: 11, color: '#64748B' }}>#{lastRideId.slice(-8)}</Text>
                    </TouchableOpacity>
                  )}
                  <TextInput
                    value={drvCmpRideId}
                    onChangeText={setDrvCmpRideId}
                    placeholder="Ride ID daalo..."
                    style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: 10, borderWidth: 1.5, borderColor: drvCmpRideId ? '#10B981' : '#334155', fontSize: 13, color: '#0F172A' }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor="#475569"
                  />
                  {drvCmpRideId ? (
                    <Text style={{ fontSize: 10, color: '#10B981', marginTop: 4, fontWeight: '600' }}>✓ Ride #{drvCmpRideId.slice(-8)} linked</Text>
                  ) : (
                    <Text style={{ fontSize: 10, color: '#F59E0B', marginTop: 4 }}>⚠️ Ride ID zaroori hai</Text>
                  )}
                </View>

                {/* Description */}
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#CBD5E1', marginBottom: 6 }}>📋 Kya Hua? (Zaroori)</Text>
                <TextInput
                  value={drvCmpDesc}
                  onChangeText={setDrvCmpDesc}
                  placeholder={`Puri baat batao — kya hua, kab hua, customer ne kya kiya...\nKam se kam 20 characters`}
                  multiline
                  style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: drvCmpDesc.length >= 20 ? '#10B981' : '#334155', height: 120, textAlignVertical: 'top', fontSize: 13, marginBottom: 16, color: '#0F172A', lineHeight: 18 }}
                  maxLength={2000}
                  placeholderTextColor="#475569"
                />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -12, marginBottom: 14, paddingHorizontal: 2 }}>
                  <Text style={{ fontSize: 10, color: drvCmpDesc.length >= 20 ? '#10B981' : '#64748B', fontWeight: '600' }}>
                    {drvCmpDesc.length >= 20 ? '✓ Enough detail' : `${20 - drvCmpDesc.length} more chars needed`}
                  </Text>
                  <Text style={{ fontSize: 10, color: '#475569' }}>{drvCmpDesc.length}/2000</Text>
                </View>

                {/* SLA info */}
                <View style={{ backgroundColor: 'rgba(233,69,96,0.07)', borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(233,69,96,0.18)', flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  <Text style={{ fontSize: 16 }}>ℹ️</Text>
                  <Text style={{ fontSize: 11, color: '#94A3B8', flex: 1, lineHeight: 16 }}>
                    <Text style={{ fontWeight: '700', color: '#E91E63' }}>{selectedType.label}</Text>
                    {' '}complaints usually resolve in <Text style={{ fontWeight: '700', color: '#0F172A' }}>{selectedType.sla}</Text>.
                    Hum aapke saath email/app se contact karenge.
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={async () => {
                    if (!drvCmpRideId.trim()) return Alert.alert('Ride ID', 'Ride ID zaroori hai — kis ride ke baare mein complaint hai?');
                    if (drvCmpDesc.trim().length < 20) return Alert.alert('Description', 'Thoda aur detail chahiye (20+ characters)');
                    setDrvCmpLoading(true);
                    let submitOk = false;
                    try {
                      const autoTitle = drvCmpTitle || autoTitleMap[drvCmpType] || drvCmpType.replace(/_/g,' ');
                      const body: any = { phone, complaint_type: drvCmpType, title: autoTitle, description: drvCmpDesc.trim(), ride_id: drvCmpRideId.trim() };
                      const res = await fetch(`${API}/api/complaints`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                      });
                      const data = await res.json();
                      if (data.complaint) {
                        submitOk = true;
                        setDrvCmpLoading(false);
                        Alert.alert(
                          '✅ Complaint Submit Ho Gayi',
                          `ID: #${String(data.complaint.id).slice(-8).toUpperCase()}\n\nAapki complaint receive hui. Team ${selectedType?.sla || '48h'} mein review karegi.`,
                          [{ text: 'Theek Hai', onPress: () => setDrSubScreen('complaints') }]
                        );
                        // Reload list non-blocking
                        fetch(`${API}/api/complaints?phone=${encodeURIComponent(phone)}`)
                          .then(r => r.json()).then(ld => setDrvComplaints(ld.complaints || [])).catch(() => {});
                      } else {
                        Alert.alert('Error', data.error || 'Submit failed — retry karo');
                      }
                    } catch { Alert.alert('Error', 'Server se connect nahi ho pa raha — internet check karo'); }
                    if (!submitOk) setDrvCmpLoading(false);
                  }}
                  style={{ backgroundColor: drvCmpLoading ? '#9ca3af' : '#E91E63', borderRadius: 16, padding: 18, alignItems: 'center', elevation: 4, shadowColor: '#E91E63', shadowOpacity: 0.3, shadowRadius: 8 }}
                  disabled={drvCmpLoading}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>
                    {drvCmpLoading ? '⏳ Submit Ho Raha Hai...' : '📤 Complaint Submit Karo'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      );
    }

    // ─── Driver: Complaint Detail ───
    if (driverSubScreen === 'complaint-detail' && drvCmpDetail) {
      const c = drvCmpDetail.complaint;
      const msgs = drvCmpDetail.messages || [];
      const timeline = drvCmpDetail.timeline || [];
      const statusMeta: any = {
        open:               { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  label: 'Open — Under Triage',      icon: '🕐' },
        under_review:       { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',   label: 'Being Reviewed',           icon: '🔍' },
        awaiting_response:  { color: '#a855f7', bg: 'rgba(168,85,247,0.1)',   label: 'Your Reply Needed',        icon: '💬' },
        evidence_requested: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    label: 'Evidence Requested',       icon: '📎' },
        resolved:           { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',    label: 'Resolved',                 icon: '✅' },
        closed:             { color: '#6b7280', bg: 'rgba(107,114,128,0.1)',  label: 'Closed',                   icon: '🔒' },
        appealed:           { color: '#E91E63', bg: 'rgba(233,69,96,0.1)',    label: 'Under Appeal',             icon: '⚖️' },
        escalated:          { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    label: 'Escalated to Senior Team', icon: '🚨' },
      };
      const sm = statusMeta[c?.status] || { color: '#9ca3af', bg: 'rgba(156,163,175,0.1)', label: c?.status, icon: '📋' };
      const typeEmoji: any = { customer_no_show:'🚫', property_damage:'🔧', abusive_behavior:'😠', false_accusation:'⚖️', wrong_location:'📍', payment_issue:'💸', other:'📝' };
      const isClosed = ['resolved','closed'].includes(c?.status);
      const [drvEvidenceUploading, setDrvEvidenceUploading] = React.useState(false);
      const uploadDrvEvidence = async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert('Permission', 'Gallery access chahiye'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.6 });
        if (result.canceled || !result.assets?.[0]) return;
        const dataUri = `data:image/jpeg;base64,${result.assets[0].base64}`;
        setDrvEvidenceUploading(true);
        try {
          const r = await fetch(`${API}/api/complaints/${c.id}/evidence`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, image: dataUri, caption: 'Driver evidence' }),
          });
          const data = await r.json();
          if (data.url) {
            const r2 = await fetch(`${API}/api/complaints/${c.id}?phone=${encodeURIComponent(phone)}`);
            setDrvCmpDetail(await r2.json());
            Alert.alert('✅ Uploaded', 'Evidence submit ho gaya!');
          } else Alert.alert('Error', data.error || 'Upload fail hua');
        } catch { Alert.alert('Error', 'Upload fail hua'); }
        setDrvEvidenceUploading(false);
      };
      return (
        <View style={s.screen}>
          <View style={{ backgroundColor: '#FFFFFF', paddingTop: Platform.OS === 'android' ? 44 : 56, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
            <TouchableOpacity onPress={() => setDrSubScreen('complaints')}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ color: '#0F172A', fontSize: 18 }}>‹</Text>
            </TouchableOpacity>
            <Text style={{ color: '#0F172A', fontWeight: '900', fontSize: 17, flex: 1 }}>Complaint Detail</Text>
            <Text style={{ color: '#475569', fontSize: 10 }}>#{c?.id?.slice(-8)}</Text>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
            {/* Status banner */}
            <View style={{ backgroundColor: sm.bg, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1.5, borderColor: sm.color + '40', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: sm.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 22 }}>{sm.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: sm.color, fontWeight: '900', fontSize: 15 }}>{sm.label}</Text>
                {c.assigned_admin && <Text style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>Reviewed by: {c.assigned_admin}</Text>}
              </View>
            </View>

            {c.status === 'evidence_requested' && (
              <View style={{ backgroundColor: '#FFF7ED', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 2, borderColor: '#FB923C', flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <Text style={{ fontSize: 24 }}>📎</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#EA580C', marginBottom: 4 }}>Admin ne Proof Manga Hai!</Text>
                  <Text style={{ fontSize: 12, color: '#9A3412', lineHeight: 18 }}>Screenshot ya photo upload karo jo aapki baat prove kare</Text>
                  <TouchableOpacity onPress={uploadDrvEvidence} disabled={drvEvidenceUploading}
                    style={{ backgroundColor: '#EA580C', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, marginTop: 10, alignItems: 'center', opacity: drvEvidenceUploading ? 0.6 : 1 }}>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>{drvEvidenceUploading ? '⏳ Uploading...' : '📸 Photo Upload Karo'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Complaint summary card */}
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(233,69,96,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 18 }}>{typeEmoji[c.complaint_type] || '📋'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: '#0F172A' }}>{c.title}</Text>
                  <Text style={{ fontSize: 11, color: '#E91E63', fontWeight: '700', marginTop: 2 }}>{c.complaint_type?.replace(/_/g,' ')}</Text>
                </View>
              </View>
              <View style={{ height: 1, backgroundColor: '#E2E8F0', marginBottom: 12 }} />
              <Text style={{ fontSize: 13, color: '#64748B', lineHeight: 20 }}>{c.description}</Text>
              {c.ride_id && (
                <View style={{ marginTop: 10, backgroundColor: '#FFFFFF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <Text style={{ fontSize: 11, color: '#94A3B8' }}>🚗 Linked ride: <Text style={{ fontWeight: '700', color: '#0F172A' }}>#{c.ride_id.slice(-8)}</Text></Text>
                </View>
              )}
            </View>

            {/* Resolution */}
            {c.resolution && (
              <View style={{ backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: 'rgba(34,197,94,0.25)' }}>
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#10B981', marginBottom: 6 }}>✅ Resolution</Text>
                <Text style={{ fontSize: 13, color: '#16A34A', fontWeight: '700' }}>{c.resolution?.replace(/_/g,' ')}</Text>
                {c.resolution_note && <Text style={{ fontSize: 13, color: '#64748B', marginTop: 8, lineHeight: 18 }}>{c.resolution_note}</Text>}
                {(parseFloat(c.refund_amount||0) > 0) && (
                  <View style={{ marginTop: 10, backgroundColor: 'rgba(22,163,74,0.1)', borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(22,163,74,0.3)' }}>
                    <Text style={{ fontSize: 16 }}>💰</Text>
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: '900', color: '#16A34A' }}>₹{parseFloat(c.refund_amount).toFixed(0)} Refund Processed</Text>
                      <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>Customer ke wallet mein credited</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Messages thread */}
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 13, fontWeight: '900', color: '#0F172A', marginBottom: 12 }}>💬 Messages</Text>
              {msgs.length === 0 && (
                <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                  <Text style={{ fontSize: 28 }}>💬</Text>
                  <Text style={{ color: '#64748B', fontSize: 12, marginTop: 6 }}>Team abhi review kar rahi hai</Text>
                </View>
              )}
              {msgs.map((m: any, i: number) => {
                const isAdmin = m.sender_role === 'admin';
                return (
                  <View key={i} style={{ marginBottom: 10, alignItems: isAdmin ? 'flex-start' : 'flex-end' }}>
                    <View style={{
                      maxWidth: '85%', padding: 12, borderRadius: 14,
                      backgroundColor: isAdmin ? 'rgba(233,30,99,0.08)' : '#F1F5F9',
                      borderWidth: 1, borderColor: isAdmin ? 'rgba(233,30,99,0.3)' : '#E2E8F0',
                      borderBottomLeftRadius: isAdmin ? 4 : 14, borderBottomRightRadius: isAdmin ? 14 : 4,
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: isAdmin ? '#E91E63' : '#64748B', marginBottom: 4 }}>
                        {isAdmin ? '👤 Sppero Support' : '🚗 You'}
                      </Text>
                      <Text style={{ fontSize: 13, color: '#0F172A', lineHeight: 18 }}>{m.message}</Text>
                      <Text style={{ fontSize: 9, color: '#64748B', marginTop: 4, textAlign: isAdmin ? 'left' : 'right' }}>
                        {new Date(m.created_at).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Reply box */}
            {!isClosed && (
              <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 14, marginBottom: 12, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 8, letterSpacing: 0.5 }}>ADD REPLY</Text>
                <TextInput
                  value={drvCmpMsg}
                  onChangeText={setDrvCmpMsg}
                  placeholder="Aur kuch batana hai? Admin ko reply karein..."
                  multiline
                  style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, height: 80, textAlignVertical: 'top', fontSize: 13, marginBottom: 10, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0', lineHeight: 18 }}
                  placeholderTextColor="#475569"
                />
                <TouchableOpacity
                  onPress={async () => {
                    if (!drvCmpMsg.trim()) return;
                    try {
                      await fetch(`${API}/api/complaints/${c.id}/messages`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone, message: drvCmpMsg.trim() }),
                      });
                      setDrvCmpMsg('');
                      const r2 = await fetch(`${API}/api/complaints/${c.id}?phone=${encodeURIComponent(phone)}`);
                      setDrvCmpDetail(await r2.json());
                    } catch { Alert.alert('Error', 'Message nahi bheja — retry karo'); }
                  }}
                  style={{ backgroundColor: '#E91E63', borderRadius: 12, padding: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, elevation: 2, shadowColor: '#E91E63', shadowOpacity: 0.3, shadowRadius: 6 }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>📤 Bhejo</Text>
                </TouchableOpacity>
              </View>
            )}

            {!isClosed && (
              <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 14, marginBottom: 12, elevation: 2, borderWidth: 1.5, borderColor: c.status === 'evidence_requested' ? '#FB923C' : '#E2E8F0' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 8, letterSpacing: 0.5 }}>📎 EVIDENCE UPLOAD</Text>
                <Text style={{ fontSize: 11, color: '#94A3B8', marginBottom: 10, lineHeight: 16 }}>Screenshot ya photo upload karo — max 5</Text>
                <TouchableOpacity onPress={uploadDrvEvidence} disabled={drvEvidenceUploading}
                  style={{ backgroundColor: c.status === 'evidence_requested' ? '#EA580C' : '#E91E63', borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: drvEvidenceUploading ? 0.6 : 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{drvEvidenceUploading ? '⏳ Uploading...' : '📸 Photo/Screenshot Upload'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Timeline */}
            {timeline.length > 0 && (
              <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, marginBottom: 14, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ fontSize: 13, fontWeight: '900', color: '#0F172A', marginBottom: 14 }}>📅 Timeline</Text>
                {timeline.map((t: any, i: number) => (
                  <View key={i} style={{ flexDirection: 'row', marginBottom: i < timeline.length - 1 ? 12 : 0 }}>
                    <View style={{ width: 28, alignItems: 'center' }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#E91E63', marginTop: 2 }} />
                      {i < timeline.length - 1 && <View style={{ width: 2, flex: 1, backgroundColor: '#334155', marginTop: 4 }} />}
                    </View>
                    <View style={{ flex: 1, paddingLeft: 10, paddingBottom: i < timeline.length - 1 ? 8 : 0 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#CBD5E1', lineHeight: 18 }}>{t.description}</Text>
                      <Text style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
                        {new Date(t.created_at).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
          <BottomNav activeTab={activeTab} setActiveTab={(t: string) => { back(); setActiveTab(t); }} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
        </View>
      );
    }

    if (driverSubScreen === 'settings') {
      return (
        <View style={s.screen}>
          <SubHeader title="⚙️ Settings" />
          <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, elevation: 2, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 16 }}>🔔 Notifications</Text>
              {[
                { label: 'Ride Requests', sub: 'Nayi ride ki notification', key: 'notif_rides', def: true },
                { label: 'Wallet Updates', sub: 'Payment credit/debit alerts', key: 'notif_wallet', def: true },
                { label: 'Promotional Offers', sub: 'Bonus aur offers', key: 'notif_promo', def: true },
              ].map((item, i) => (
                <View key={item.key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: i < 2 ? 1 : 0, borderBottomColor: '#334155' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#CBD5E1' }}>{item.label}</Text>
                    <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{item.sub}</Text>
                  </View>
                  <Switch value={true} onValueChange={() => Alert.alert('Notifications', 'Notifications settings OS settings se manage karo:\nSettings → Apps → Sppero Buddy → Notifications')} trackColor={{ false: '#334155', true: '#10B981' }} thumbColor="#fff" />
                </View>
              ))}
            </View>

            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, elevation: 2, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 16 }}>📱 App Info</Text>
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
              onPress={() => Alert.alert('Cache Clear', 'App cache clear ho gaya!')}
              style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 1, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 18, marginRight: 12 }}>🗑️</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#CBD5E1' }}>Clear Cache</Text>
                <Text style={{ fontSize: 11, color: '#64748B' }}>App data clear karo</Text>
              </View>
              <Text style={{ fontSize: 18, color: '#475569' }}>›</Text>
            </TouchableOpacity>
          </ScrollView>
          <BottomNav activeTab={activeTab} setActiveTab={(t: string) => { back(); setActiveTab(t); }} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
        </View>
      );
    }

    return null;
  }

  // ═══ EARNINGS TAB ═══
  if (activeTab === 'earnings') {
    if (!walletLoaded) { loadDriverWallet(phone); loadCommissionHistory(phone); }
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
            <Text style={{ color: '#10B981', fontSize: 22, fontWeight: '900' }}>₹{parseFloat(driverWallet.balance || 0).toFixed(0)}</Text>
            <Text style={{ color: '#64748B', fontSize: 10, marginTop: 3, textAlign: 'center' }}>Wallet Balance</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
            <Text style={{ color: '#FFD700', fontSize: 22, fontWeight: '900' }}>₹{parseFloat(driverWallet.total_earned || 0).toFixed(0)}</Text>
            <Text style={{ color: '#64748B', fontSize: 10, marginTop: 3, textAlign: 'center' }}>Life Earned</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
            <CountUp value={earnings} style={{ color: '#E91E63', fontSize: 22, fontWeight: '900' }} />
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

      {/* Tabs */}
      <View style={{ flexDirection: 'row', margin: 14, gap: 6 }}>
        {(['summary', 'rides', 'hourly', 'commission'] as const).map(t => (
          <TouchableOpacity key={t} onPress={() => setWalletEarningsTab(t)}
            style={{ flex: 1, borderRadius: 20, paddingVertical: 8, alignItems: 'center', backgroundColor: walletEarningsTab === t ? '#10B981' : '#F8FAFC', position: 'relative', borderWidth: 1, borderColor: walletEarningsTab === t ? '#10B981' : '#E2E8F0' }}>
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
          <View style={s.earningsCard}>
            <Row k="Total Rides (All Time)" v={driverRideHistory.length.toString()} />
            <Row k="Hourly Rides" v={driverHourlyHistory.length.toString()} />
            <Row k="Aaj Ke Rides" v={rides.toString()} />
            <Row k="Avg Per Ride" v={'₹' + (rides ? (earnings/rides).toFixed(0) : 0)} />
            <Row k="Platform Fee (15%)" v={'₹' + (earnings * 0.15).toFixed(0)} />
            <Row k="Aaj Ki Net Kamai" v={'₹' + (earnings * 0.85).toFixed(0)} bold last />
          </View>
          <View style={{ backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' }}>
            <Text style={{ fontSize: 13, color: '#10B981', fontWeight: '700', marginBottom: 4 }}>💡 Commission Structure</Text>
            <Text style={{ fontSize: 12, color: '#6EE7B7', lineHeight: 18 }}>Standard rides: 15% platform fee{'\n'}Hourly rides: 12% platform fee{'\n'}Early end: dono ki agreement zaroori — proportional payment</Text>
          </View>
          {/* Pending Commission Card */}
          {commissionData.pending_commission > 0 && (
            <View style={{ backgroundColor: 'rgba(230,81,0,0.08)', borderRadius: 14, padding: 16, elevation: 2, marginBottom: 14, borderWidth: 1.5, borderColor: 'rgba(230,81,0,0.3)' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 18, marginRight: 8 }}>💰</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#e65100' }}>Pending Commission</Text>
                  <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>Cash rides ki platform fee pending hai</Text>
                </View>
                <Text style={{ fontSize: 20, fontWeight: '900', color: '#E91E63' }}>₹{commissionData.pending_commission.toFixed(0)}</Text>
              </View>
              <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 10 }}>
                Wallet/online rides pe jo bhi earn karte ho, usme se auto-deduct hota hai. Ya seedha pay kar do.
              </Text>
              <TouchableOpacity
                disabled={commPayLoading}
                onPress={async () => {
                  setCommPayLoading(true); setCommResult('');
                  try {
                    const r = await fetch(`${API}/api/driver/commission-pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
                    const d = await r.json();
                    if (!d.success) { setCommResult('❌ ' + (d.message || d.error || 'Error')); setCommPayLoading(false); return; }
                    if (!RazorpayCheckout) { Alert.alert('Error', 'Payment module load nahi hua. App restart karein.'); setCommPayLoading(false); return; }
                    RazorpayCheckout.open({
                      key: d.key_id,
                      amount: d.amount,
                      currency: d.currency || 'INR',
                      order_id: d.order_id,
                      name: 'Sppero',
                      description: 'Platform Commission Payment',
                      prefill: { contact: phone },
                      theme: { color: '#e65100' },
                    }).then(async (payment: any) => {
                      const vr = await fetch(`${API}/api/driver/commission-pay-verify`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          phone,
                          razorpay_order_id: payment.razorpay_order_id,
                          razorpay_payment_id: payment.razorpay_payment_id,
                          razorpay_signature: payment.razorpay_signature,
                        }),
                      });
                      const vd = await vr.json();
                      if (vd.success) { setCommResult('✅ Commission paid!'); loadCommissionHistory(phone); }
                      else setCommResult('❌ Verification failed: ' + (vd.error || ''));
                      setCommPayLoading(false);
                    }).catch((e: any) => {
                      setCommResult(e?.code !== 'PAYMENT_CANCELLED' ? '❌ Payment fail: ' + (e?.description || '') : 'Payment cancel hua');
                      setCommPayLoading(false);
                    });
                  } catch (_e) { Alert.alert('Error', 'Server se connect nahi hua'); setCommPayLoading(false); }
                }}
                style={{ backgroundColor: commPayLoading ? '#ccc' : '#e65100', borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{commPayLoading ? 'Opening...' : `💳 Pay ₹${commissionData.pending_commission.toFixed(0)}`}</Text>
              </TouchableOpacity>
              {commResult ? <Text style={{ color: commResult.includes('✅') ? '#16A34A' : '#bf360c', marginTop: 8, fontSize: 12, fontWeight: '600' }}>{commResult}</Text> : null}
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
                style={{ backgroundColor: payoutLoading ? '#334155' : '#10B981', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Request</Text>
              </TouchableOpacity>
            </View>
            {result ? <Text style={{ color: result.includes('✅') ? '#10B981' : '#E91E63', marginTop: 8, fontWeight: '600' }}>{result}</Text> : null}
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
              ['📍 KM Included', 'Package mein KM fix hai — extra per km extra charge'],
              ['🔐 OTP Start', 'Customer OTP se trip shuru hoti hai'],
              ['✅ Complete', 'Actual KM enter karo — extra charge auto-calculate'],
              ['💳 Payment', 'Customer wallet se escrow hold, release on complete'],
            ].map(([icon, text], i) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: 8 }}>
                <Text style={{ color: '#E91E63', fontSize: 12, fontWeight: '700', width: 90 }}>{icon}</Text>
                <Text style={{ color: '#ccc', fontSize: 11, flex: 1, lineHeight: 16 }}>{text}</Text>
              </View>
            ))}
          </View>
        </>)}

        {walletEarningsTab === 'rides' && (<>
          {driverRideHistory.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Text style={{ fontSize: 36 }}>🛺</Text>
              <Text style={{ color: '#475569', marginTop: 10 }}>Koi completed ride nahi mili</Text>
            </View>
          ) : driverRideHistory.map((r: any, i: number) => (
            <View key={r.id || i} style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, marginBottom: 8, elevation: 1, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{r.passenger_name || 'Passenger'}</Text>
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{fmtDate(r.created_at)} · {r.payment_method}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: '#10B981', fontSize: 16, fontWeight: '800' }}>₹{parseFloat(r.fare || 0).toFixed(0)}</Text>
                  <Text style={{ color: '#475569', fontSize: 10 }}>Net: ₹{(parseFloat(r.fare || 0) * 0.85).toFixed(0)}</Text>
                </View>
              </View>
            </View>
          ))}
        </>)}

        {walletEarningsTab === 'hourly' && (<>
          {driverHourlyHistory.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Text style={{ fontSize: 36 }}>⏱️</Text>
              <Text style={{ color: '#475569', marginTop: 10 }}>Koi hourly ride nahi mili</Text>
            </View>
          ) : driverHourlyHistory.map((h: any, i: number) => (
            <View key={h.id || i} style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, marginBottom: 8, elevation: 1, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{h.vehicle_type} · {h.package_hours}h Package</Text>
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{h.customer_phone} · {fmtDate(h.created_at)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: '#10B981', fontSize: 16, fontWeight: '800' }}>₹{parseFloat(h.driver_earning || h.base_fare || 0).toFixed(0)}</Text>
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
                <Text style={{ color: '#E91E63', fontSize: 18, fontWeight: '900' }}>₹{commissionData.pending_commission.toFixed(0)}</Text>
                <Text style={{ color: '#64748B', fontSize: 10, marginTop: 3, textAlign: 'center' }}>Pending</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ color: '#10B981', fontSize: 18, fontWeight: '900' }}>₹{commissionData.settled_commission.toFixed(0)}</Text>
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
                  if (!RazorpayCheckout) { Alert.alert('Error', 'Payment module load nahi hua. App restart karein.'); setCommPayLoading(false); return; }
                  RazorpayCheckout.open({
                    key: d.key_id, amount: d.amount, currency: d.currency || 'INR', order_id: d.order_id,
                    name: 'Sppero', description: 'Platform Commission Payment', prefill: { contact: phone }, theme: { color: '#e65100' },
                  }).then(async (payment: any) => {
                    const vr = await fetch(`${API}/api/driver/commission-pay-verify`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ phone, razorpay_order_id: payment.razorpay_order_id, razorpay_payment_id: payment.razorpay_payment_id, razorpay_signature: payment.razorpay_signature }),
                    });
                    const vd = await vr.json();
                    if (vd.success) { setCommResult('✅ Commission paid!'); loadCommissionHistory(phone); }
                    else setCommResult('❌ Verification failed: ' + (vd.error || ''));
                    setCommPayLoading(false);
                  }).catch((e: any) => {
                    setCommResult(e?.code !== 'PAYMENT_CANCELLED' ? '❌ Payment fail: ' + (e?.description || '') : 'Payment cancel hua');
                    setCommPayLoading(false);
                  });
                } catch (_e) { Alert.alert('Error', 'Server se connect nahi hua'); setCommPayLoading(false); }
              }}
              style={{ backgroundColor: commPayLoading ? '#334155' : '#E91E63', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{commPayLoading ? 'Opening...' : `💳 Pay ₹${commissionData.pending_commission.toFixed(0)} Now`}</Text>
            </TouchableOpacity>
          )}
          {commResult ? <Text style={{ color: commResult.includes('✅') ? '#10B981' : '#E91E63', marginBottom: 10, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>{commResult}</Text> : null}

          {/* Per-ride commission history */}
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 8, marginBottom: 8 }}>Per-Ride Commission</Text>
          {commissionData.records.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 30 }}>
              <Text style={{ fontSize: 32 }}>📋</Text>
              <Text style={{ color: '#475569', marginTop: 8 }}>Koi commission record nahi</Text>
            </View>
          ) : commissionData.records.map((rec: any, i: number) => {
            const statusColor = rec.status === 'collected' || rec.status === 'settled' || rec.status === 'auto_settled' ? '#10B981' : '#F59E0B';
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
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#10B981' }}>₹{parseFloat(p.amount).toFixed(0)} Paid</Text>
                    <Text style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>{fmtDate(p.created_at)}</Text>
                  </View>
                  <View style={{ backgroundColor: p.status === 'paid' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'center' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: p.status === 'paid' ? '#10B981' : '#F59E0B' }}>{p.status === 'paid' ? '✅ Paid' : '⏳ Pending'}</Text>
                  </View>
                </View>
              </View>
            ))}
          </>)}
        </>)}

      </ScrollView>
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} rideReq={rideReq} hourlyRideReq={hourlyRideReq} activeRide={activeRide} activeHourlyRide={activeHourlyRide} />
    </View>
  );
  }

  // ═══ BONUS TAB ═══
  if (activeTab === 'bonus') {
    if (!bonusDash && !bonusLoading) { loadBonusDash(phone); loadBonusHistory(phone); }

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
      <View style={{ backgroundColor: '#E91E63', paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 14 : 52, paddingBottom: 20, paddingHorizontal: 18 }}>
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
              <Text style={{ color: '#16A34A', fontSize: 16, fontWeight: '800' }}>₹{totalEarned.toFixed(0)}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 2 }}>Total Earned</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: '#E91E63', fontSize: 16, fontWeight: '800' }}>₹{totalRedeemed.toFixed(0)}</Text>
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
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'center', marginTop: 8 }}>₹{(50 - balance).toFixed(0)} aur chahiye redeem ke liye (min ₹50)</Text>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {bonusMsg ? (
          <View style={{ backgroundColor: bonusMsg.startsWith('✅') ? 'rgba(76,175,80,0.15)' : 'rgba(233,69,96,0.12)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <Text style={{ color: bonusMsg.startsWith('✅') ? '#2e7d32' : '#c62828', fontWeight: '700', fontSize: 13 }}>{bonusMsg}</Text>
          </View>
        ) : null}

        {bonusLoading && !dash ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ color: '#999', fontSize: 14 }}>Loading bonus data...</Text>
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
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>+₹{peakRule.config.per_ride}/ride · 7-9 AM aur 5-8 PM</Text>
                </View>
                {isPeak && (
                  <View style={{ backgroundColor: '#FF8F00', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 11 }}>LIVE NOW</Text>
                  </View>
                )}
              </View>
              {isPeak && (
                <View style={{ backgroundColor: '#FF8F0015', borderRadius: 10, padding: 10, marginTop: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: '#E65100' }}>Aaj peak bonus earned:</Text>
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
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>Aaj ki rides: {ridesCount} completed · Raat 12 baje reset</Text>
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
                        <Text style={{ fontSize: 13, fontWeight: '700', color: isClaimed ? '#16A34A' : '#0F172A' }}>{tier.rides} rides today</Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: '#E91E63' }}>₹{tier.amount}</Text>
                    </View>
                    <View style={{ height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
                      <View style={{ height: 8, backgroundColor: isClaimed ? '#16A34A' : isUnlocked ? '#FF8F00' : '#E91E63', borderRadius: 4, width: pct + '%' }} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, color: '#999' }}>{ridesCount}/{tier.rides} rides</Text>
                      {isUnlocked && !isClaimed ? (
                        <TouchableOpacity onPress={() => claimDailyBonus(dailyRule.id, idx)} disabled={bonusClaiming}
                          style={{ backgroundColor: bonusClaiming ? '#ccc' : '#16A34A', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 }}>
                          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>Claim ₹{tier.amount} 🎉</Text>
                        </TouchableOpacity>
                      ) : isClaimed ? (
                        <Text style={{ fontSize: 12, color: '#16A34A', fontWeight: '700' }}>✅ Claimed!</Text>
                      ) : (
                        <Text style={{ fontSize: 11, color: '#aaa' }}>{tier.rides - ridesCount} aur rides chahiye</Text>
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
                        backgroundColor: qualified ? '#16A34A' : isToday ? 'rgba(255,143,0,0.2)' : isPast ? 'rgba(233,30,99,0.12)' : '#F1F5F9',
                        borderWidth: isToday ? 2 : 0, borderColor: '#FF8F00' }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: qualified ? '#fff' : isPast ? '#E91E63' : '#bbb' }}>
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
                  style={{ backgroundColor: bonusClaiming ? '#ccc' : '#E91E63', borderRadius: 12, padding: 14, alignItems: 'center' }}>
                  <Text style={{ color: '#FFD700', fontWeight: '900', fontSize: 15 }}>🏆 Claim Weekly Warrior ₹{streakRule.config.amount}</Text>
                </TouchableOpacity>
              ) : streakClaimed ? (
                <View style={{ backgroundColor: 'rgba(76,175,80,0.15)', borderRadius: 12, padding: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#16A34A', fontWeight: '800', fontSize: 13 }}>✅ Is hafte ka bonus claim ho gaya!</Text>
                </View>
              ) : (
                <View style={{ backgroundColor: '#F1F5F9', borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: '#94A3B8', fontSize: 12, textAlign: 'center' }}>{streakTarget - qualifyingDays} aur qualifying days chahiye ({ridesPerDayTarget}+ rides/day)</Text>
                </View>
              )}
            </View>
          )}

          {/* ── How Bonus Works ── */}
          <View style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 16, marginBottom: 14 }}>
            <Text style={{ color: '#0F172A', fontWeight: '800', fontSize: 13, marginBottom: 10 }}>ℹ️ Bonus Kaise Kaam Karta Hai</Text>
            {[
              ['🎯', 'Daily Rides', 'Aaj ke targets complete karo aur bonus claim karo (raat 12 baje reset)'],
              ['⚡', 'Peak Hour', 'Rush hours mein ride complete karo — automatically credit hoga'],
              ['🏆', 'Weekly Warrior', 'Hafte ke 5 din 4+ rides karo — Sunday ko claim karo'],
              ['💸', 'Redeem', 'Minimum ₹50 bonus collect hone par main wallet mein transfer karo'],
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
              <Text style={{ color: '#aaa', fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>Koi bonus history nahi — abhi pehli ride karo!</Text>
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
                    <Text style={{ fontSize: 15, fontWeight: '900', color: isEarn ? '#16A34A' : '#E91E63' }}>
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
      {rideReq && <TouchableOpacity style={s.notifBanner} onPress={() => setActiveTab('live')}><Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>🔔 Nayi Ride! ₹{rideReq.fare}</Text><Text style={{ color: '#fff', fontSize: 13 }}>Dekho →</Text></TouchableOpacity>}
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
                    {driverLevel.nextTarget - driverLevel.completed_rides} aur rides — {driverLevel.nextLevelEmoji} {driverLevel.nextLevelName} unlock hoga
                  </Text>
                </View>
              )}

              {/* Stats row */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {[
                  { label: 'Rating', value: `⭐ ${driverLevel.avg_rating}` },
                  { label: 'Cancel Rate', value: `${driverLevel.cancel_rate}%` },
                  { label: 'Is Mahine', value: `${driverLevel.rides_this_month} rides` },
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
            n === 0 ? 'Abhi tak kisi ne favourite nahi banaya — achhi rides do!' :
            n === 1 ? 'Ek customer ne aapko apna favourite driver banaya! 🙌' :
            n <= 5  ? `${n} loyal customers hain aapke — great job! 🔥` :
            n <= 20 ? `${n} customers aapke diwane hain! ⭐ Top Driver!` :
                      `${n} customers! Aap ek legend hain! 🏆`;
          const cardBg   = n >= 20 ? 'rgba(233,30,99,0.08)' : n >= 6 ? 'rgba(245,158,11,0.1)' : n >= 1 ? 'rgba(16,185,129,0.1)' : '#F8FAFC';
          const numColor = n >= 20 ? '#E91E63' : n >= 6 ? '#F59E0B' : n >= 1 ? '#10B981' : '#94A3B8';
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
                        Jab ye customers directly aapko request bhejengen, aapko ⭐ badge ke saath notification aayega!
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
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 4 }}>📱 Mera UPI ID</Text>
          <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 12 }}>Customer aapka QR scan karke seedha pay karega</Text>
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
              style={{ backgroundColor: upiSaving ? '#334155' : '#10B981', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Save</Text>
            </TouchableOpacity>
          </View>
          {driverUpiId ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6, backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' }}>
              <Text style={{ fontSize: 14 }}>✅</Text>
              <Text style={{ fontSize: 12, color: '#10B981', fontWeight: '600', flex: 1 }}>{driverUpiId}</Text>
            </View>
          ) : null}
          {result && result.includes('UPI') ? <Text style={{ color: result.includes('✅') ? '#10B981' : '#E91E63', marginTop: 6, fontSize: 12 }}>{result}</Text> : null}
        </View>

        {/* Referral Section */}
        <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 4 }}>🎁 Refer & Earn</Text>
          <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 12 }}>Dosto ko refer karo — dono ko ₹50 wallet bonus milega</Text>
          {referralInfo ? (
            <View>
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ color: '#64748B', fontSize: 11, marginBottom: 4, letterSpacing: 1 }}>AAPKA REFERRAL CODE</Text>
                <Text style={{ color: '#FFD700', fontSize: 28, fontWeight: '900', letterSpacing: 6 }}>{referralInfo.code}</Text>
              </View>
              <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#0F172A' }}>{referralInfo.total_referrals}</Text>
                  <Text style={{ fontSize: 10, color: '#64748B' }}>Referrals</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#10B981' }}>₹{referralInfo.total_earned}</Text>
                  <Text style={{ fontSize: 10, color: '#64748B' }}>Earned</Text>
                </View>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: '#E91E63', borderRadius: 10, padding: 12, alignItems: 'center', elevation: 4, shadowColor: '#E91E63', shadowOpacity: 0.35, shadowRadius: 8 }}
                onPress={() => Share.share({ message: `Sppero Buddy pe join karo! Mera referral code use karo: ${referralInfo.code}\nDono ko ₹50 wallet bonus milega! 🎁`, title: 'Sppero Buddy Referral' })}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>📤 Code Share Karo</Text>
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
          ['📋', 'Documents', 'License, RC verification', 'documents'],
          ['🏦', 'Bank Details', 'Payout account', 'bank'],
          ['📞', 'Support', '24x7 help', 'support'],
          ['⚙️', 'Settings', 'Preferences', 'settings'],
        ] as [string,string,string,string][]).map(([icon,title,sub,key]) => (
          <Bouncy key={key} style={s.menuItem} onPress={() => { setDrSubScreen(key as any); setBankMsg(''); }}>
            <Text style={{ fontSize: 22, marginRight: 14 }}>{icon}</Text>
            <View style={{ flex: 1 }}><Text style={{ fontSize: 15, color: '#0F172A', fontWeight: '500' }}>{title}</Text><Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{sub}</Text></View>
            <Text style={{ fontSize: 20, color: '#475569' }}>›</Text>
          </Bouncy>
        ))}
        <Bouncy style={s.logoutBtn} onPress={async () => { stopBgLocation().catch(() => {}); await AsyncStorage.removeItem('driverPhone'); await AsyncStorage.removeItem('driverInfo'); setLoginPhone(''); setLoginOtpSent(false); setRegStep(0); setScreen('login'); setIsOnline(false); stopPolling(); setDriverInfo(null); setPhone(''); }}>
          <Text style={{ color: '#E91E63', fontWeight: 'bold', fontSize: 15 }}>🚪 Logout</Text>
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
      <Text style={[s.earningsVal, bold && { color: '#16A34A', fontWeight: 'bold' }]}>{v}</Text>
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
  const tabs = [
    { t: 'home',     ion: 'home',       lbl: 'Home'   },
    { t: 'live',     ion: 'radio',      lbl: 'Live'   },
    { t: 'earnings', ion: 'wallet',      lbl: 'Kamai'  },
    { t: 'bonus',    ion: 'gift',        lbl: 'Bonus'  },
    { t: 'profile',  ion: 'person',      lbl: 'Profile'},
  ];
  const hasLiveBadge = rideReq || hourlyRideReq || activeRide || activeHourlyRide;
  return (
    <View style={s.nav}>
      {tabs.map(({ t, ion, lbl }) => {
        const active = activeTab === t;
        const isLive = t === 'live';
        const activeColor = isLive ? '#10B981' : '#E91E63';
        const col = active ? activeColor : '#475569';
        return (
          <TouchableOpacity key={t} style={s.navItem} onPress={() => setActiveTab(t)} activeOpacity={0.65}>
            <View style={{ position: 'relative', alignItems: 'center' }}>
              <Ionicons name={active ? ion as any : `${ion}-outline` as any} size={isLive ? 22 : 24} color={col} />
              {isLive && hasLiveBadge && (
                <View style={[s.navDot, { backgroundColor: activeRide || activeHourlyRide ? '#10B981' : '#E91E63' }]} />
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
  mapFit:          { height: 220, width: '100%', backgroundColor: '#F1F5F9' },
  navFloat:        { position:'absolute', bottom:0, left:0, right:0 },
  chatBadge:       { position:'absolute', top:-6, right:-10, backgroundColor:'#E91E63', borderRadius:9, minWidth:18, height:18, alignItems:'center', justifyContent:'center', paddingHorizontal:4 },
  hero:            { backgroundColor:'#E91E63', alignItems:'center', padding:50, paddingTop: Platform.OS==='android' ? (StatusBar.currentHeight||28)+24 : 50, paddingBottom:40 },
  heroIcon:        { fontSize:60 },
  heroTitle:       { color:'#fff', fontSize:28, fontWeight:'bold', marginTop:10 },
  heroSub:         { color:'rgba(255,255,255,0.8)', fontSize:14, marginTop:6 },
  sectionTitle:    { fontSize:16, fontWeight:'bold', color:'#0F172A', marginBottom:12 },
  driverItem:      { flexDirection:'row', alignItems:'center', backgroundColor:'#FFFFFF', borderRadius:14, padding:16, marginBottom:10, elevation:2, borderWidth:1, borderColor:'#E2E8F0' },
  btn:             { backgroundColor:'#E91E63', borderRadius:14, padding:16, alignItems:'center', marginTop:16, marginBottom:10, elevation:4, shadowColor:'#E91E63', shadowOpacity:0.35, shadowRadius:10 },
  btnTxt:          { color:'#fff', fontSize:16, fontWeight:'bold' },
  err:             { textAlign:'center', color:'#EF4444', marginVertical:10 },
  topBar:          { backgroundColor:'#E91E63', flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:16, paddingTop: Platform.OS==='android' ? (StatusBar.currentHeight||28)+12 : 48, borderBottomWidth:0 },
  greeting:        { color:'#fff', fontSize:18, fontWeight:'bold' },
  subTxt:          { color:'rgba(255,255,255,0.75)', fontSize:12, marginTop:2 },
  notifBanner:     { backgroundColor:'#E91E63', padding:12, flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  statsRow:        { flexDirection:'row', gap:10, marginBottom:16 },
  statCard:        { flex:1, backgroundColor:'#FFFFFF', borderRadius:16, padding:14, alignItems:'center', elevation:3, shadowColor:'#000', shadowOpacity:0.07, shadowRadius:8, borderWidth:1, borderColor:'#E2E8F0' },
  statIcon:        { fontSize:22 },
  statValue:       { fontSize:22, fontWeight:'bold', color:'#0F172A', marginTop:4 },
  statLabel:       { fontSize:10, color:'#64748B', marginTop:3, letterSpacing:0.3 },
  targetCard:      { backgroundColor:'#FFFFFF', borderRadius:14, padding:16, marginBottom:14, elevation:2, borderWidth:1, borderColor:'#E2E8F0' },
  statusCard:      { backgroundColor:'#FFFFFF', borderRadius:14, padding:16, marginBottom:16, elevation:2, borderWidth:1, borderColor:'#E2E8F0' },
  statusText:      { fontSize:14, color:'#64748B', textAlign:'center' },
  tripCard:        { backgroundColor:'#FFFFFF', borderRadius:18, padding:16, marginBottom:16, elevation:6, borderWidth:2, borderColor:'#E91E63', shadowColor:'#E91E63', shadowOpacity:0.15, shadowRadius:16 },
  tripBadge:       { backgroundColor:'#16A34A', borderRadius:10, padding:9, marginBottom:12 },
  tripBadgeTxt:    { color:'#fff', textAlign:'center', fontWeight:'bold', fontSize:14 },
  tripCustomer:    { flexDirection:'row', alignItems:'center', marginBottom:12 },
  tripAvatar:      { width:46, height:46, borderRadius:23, backgroundColor:'rgba(233,30,99,0.1)', alignItems:'center', justifyContent:'center', marginRight:12 },
  tripCustName:    { fontSize:16, fontWeight:'bold', color:'#0F172A' },
  tripCustPhone:   { fontSize:13, color:'#64748B', marginTop:2 },
  tripFare:        { fontSize:22, fontWeight:'bold', color:'#16A34A' },
  chatCallBtn:     { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', backgroundColor:'#F8FAFC', borderRadius:12, padding:11, borderWidth:1, borderColor:'#E2E8F0' },
  tripRoute:       { backgroundColor:'#F8FAFC', borderRadius:12, padding:12, marginBottom:12, borderWidth:1, borderColor:'#E2E8F0' },
  tripFrom:        { fontSize:14, color:'#16A34A', fontWeight:'600' },
  tripArrow:       { fontSize:16, textAlign:'center', color:'#94A3B8', marginVertical:4 },
  tripTo:          { fontSize:14, color:'#E91E63', fontWeight:'600' },
  tripBtn:         { backgroundColor:'#16A34A', borderRadius:14, padding:16, alignItems:'center', marginBottom:8, elevation:5, shadowColor:'#16A34A', shadowOpacity:0.4, shadowRadius:10 },
  tripBtnTxt:      { color:'#fff', fontWeight:'bold', fontSize:15 },
  navBtn:          { backgroundColor:'#0EA5E9', borderRadius:12, padding:12, alignItems:'center', marginBottom:10 },
  cancelBtn:       { padding:12, alignItems:'center' },
  cancelTxt:       { color:'#E91E63', fontWeight:'600' },
  rideCard:        { backgroundColor:'#FFFFFF', borderRadius:22, padding:18, marginBottom:16, elevation:4, borderWidth:1.5, borderColor:'#E2E8F0', shadowColor:'#E91E63', shadowOpacity:0.08, shadowRadius:12 },
  rideHeader:      { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10 },
  rideTitle:       { fontSize:16, fontWeight:'bold', color:'#0F172A' },
  rideFare:        { fontSize:24, fontWeight:'bold', color:'#16A34A' },
  rideDetails:     { backgroundColor:'#F8FAFC', borderRadius:12, padding:12, marginBottom:4, borderWidth:1, borderColor:'#E2E8F0' },
  rideFrom:        { fontSize:14, color:'#16A34A', fontWeight:'600' },
  rideDivider:     { fontSize:16, textAlign:'center', color:'#94A3B8', marginVertical:4 },
  rideTo:          { fontSize:14, color:'#E91E63', fontWeight:'600' },
  rideActions:     { flexDirection:'row', gap:10 },
  rejectBtn:       { flex:1, padding:14, borderRadius:12, borderWidth:1, borderColor:'#E91E63', alignItems:'center', backgroundColor:'rgba(233,30,99,0.06)' },
  rejectTxt:       { color:'#E91E63', fontWeight:'bold' },
  acceptBtn:       { flex:2, padding:14, borderRadius:12, backgroundColor:'#16A34A', alignItems:'center', elevation:4, shadowColor:'#16A34A', shadowOpacity:0.4, shadowRadius:8 },
  acceptTxt:       { color:'#fff', fontWeight:'900', fontSize:16 },
  result:          { textAlign:'center', color:'#16A34A', fontSize:14, marginTop:10, fontWeight:'600' },
  nav:             { flexDirection:'row', backgroundColor:'#FFFFFF', borderTopWidth:1, borderTopColor:'#E2E8F0', paddingBottom: Platform.OS==='android' ? 44 : 16, paddingTop:10, elevation:12, shadowColor:'#000', shadowOpacity:0.08, shadowRadius:12 },
  navItem:         { flex:1, alignItems:'center', justifyContent:'center', paddingTop:2 },
  navIcon:         { fontSize:22, color:'#94A3B8' },
  navIconActive:   { color:'#E91E63' },
  navLbl:          { fontSize:10, color:'#94A3B8', marginTop:3, letterSpacing:0.3 },
  navActive:       { color:'#E91E63', fontWeight:'bold' },
  navDot:          { position:'absolute', top:-3, right:-10, width:9, height:9, borderRadius:4.5, backgroundColor:'#E91E63', borderWidth:1.5, borderColor:'#FFFFFF' },
  navLine:         { width:24, height:3, borderRadius:2, backgroundColor:'#E91E63', marginTop:5 },
  earningsCard:    { backgroundColor:'#FFFFFF', borderRadius:14, padding:16, marginBottom:16, elevation:2, borderWidth:1, borderColor:'#E2E8F0' },
  earningsRow:     { flexDirection:'row', justifyContent:'space-between', paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#E2E8F0' },
  earningsKey:     { fontSize:14, color:'#64748B' },
  earningsVal:     { fontSize:14, color:'#0F172A', fontWeight:'500' },
  profileHero:     { backgroundColor:'#E91E63', borderRadius:24, padding:28, alignItems:'center', marginBottom:16, elevation:6, shadowColor:'#E91E63', shadowOpacity:0.3, shadowRadius:14 },
  profileAvatar:   { width:84, height:84, borderRadius:42, backgroundColor:'rgba(255,255,255,0.2)', alignItems:'center', justifyContent:'center', marginBottom:12, borderWidth:3, borderColor:'rgba(255,255,255,0.5)' },
  profileName:     { color:'#fff', fontSize:22, fontWeight:'bold' },
  profilePhone:    { color:'rgba(255,255,255,0.8)', fontSize:14, marginTop:4 },
  profileVehicle:  { color:'rgba(255,255,255,0.7)', fontSize:13, marginTop:4 },
  badge:           { backgroundColor:'rgba(22,163,74,0.1)', borderRadius:12, paddingVertical:5, paddingHorizontal:14, marginTop:10, borderWidth:1, borderColor:'rgba(22,163,74,0.25)' },
  menuItem:        { flexDirection:'row', alignItems:'center', backgroundColor:'#FFFFFF', borderRadius:14, padding:14, marginBottom:8, elevation:2, borderWidth:1, borderColor:'#E2E8F0' },
  logoutBtn:       { borderWidth:1.5, borderColor:'#E91E63', borderRadius:14, padding:14, alignItems:'center', marginTop:8, marginBottom:30, backgroundColor:'rgba(233,30,99,0.06)' },
});

const rs = StyleSheet.create({
  regHeader:   { backgroundColor:'#E91E63', flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:16, paddingTop: Platform.OS==='android' ? (StatusBar.currentHeight||28)+12 : 48 },
  regTitle:    { color:'#fff', fontSize:16, fontWeight:'bold' },
  bigTitle:    { fontSize:26, fontWeight:'bold', color:'#0F172A', marginTop:10 },
  subTitle:    { fontSize:14, color:'#64748B', marginTop:6, marginBottom:10 },
  fieldLabel:  { fontSize:14, fontWeight:'600', color:'#64748B', marginTop:16, marginBottom:8 },
  input:       { borderWidth:1, borderColor:'#E2E8F0', borderRadius:10, padding:14, fontSize:16, backgroundColor:'#F8FAFC', color:'#0F172A' },
  photoBox:    { borderWidth:2, borderColor:'#E2E8F0', borderStyle:'dashed', borderRadius:14, padding:16, alignItems:'center', backgroundColor:'#F8FAFC' },
  vehBox:      { flexDirection:'row', alignItems:'center', backgroundColor:'#F8FAFC', borderRadius:14, padding:18, marginBottom:12, elevation:2, borderWidth:1, borderColor:'#E2E8F0' },
  vehBoxActive:{ backgroundColor:'rgba(233,30,99,0.06)', borderColor:'#E91E63', borderWidth:2 },
  uploadBtn:   { flex:1, backgroundColor:'#E91E63', borderRadius:8, padding:10, alignItems:'center' },
  uploadBtnTxt:{ color:'#fff', fontWeight:'600', fontSize:13 },
  adviceBox:   { backgroundColor:'rgba(233,30,99,0.06)', borderRadius:12, padding:14, marginTop:14, marginBottom:6, borderWidth:1, borderColor:'rgba(233,30,99,0.2)' },
  adviceTitle: { fontSize:14, fontWeight:'bold', color:'#E91E63', marginBottom:6 },
  adviceText:  { fontSize:13, color:'#64748B', marginTop:2 },
});

export default App;

const cs = StyleSheet.create({
  bubble:    { maxWidth:'75%', borderRadius:14, padding:12, marginBottom:8 },
  mine:      { backgroundColor:'#E91E63', alignSelf:'flex-end', borderBottomRightRadius:4 },
  theirs:    { backgroundColor:'#F1F5F9', alignSelf:'flex-start', borderBottomLeftRadius:4, elevation:1, borderWidth:1, borderColor:'#E2E8F0' },
  inputRow:  { flexDirection:'row', alignItems:'center', padding:10, paddingBottom:28, backgroundColor:'#FFFFFF', borderTopWidth:1, borderTopColor:'#E2E8F0' },
  input:     { flex:1, backgroundColor:'#F8FAFC', borderRadius:24, paddingHorizontal:16, paddingVertical:10, fontSize:14, marginRight:8, color:'#0F172A', borderWidth:1, borderColor:'#E2E8F0' },
  send:      { width:44, height:44, borderRadius:22, backgroundColor:'#E91E63', alignItems:'center', justifyContent:'center' },
});
