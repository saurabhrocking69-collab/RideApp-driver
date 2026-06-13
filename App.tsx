import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image,
  ScrollView, Switch, TextInput, Animated, Linking, Vibration, KeyboardAvoidingView, Platform, BackHandler, Share
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import * as Notifications from 'expo-notifications';
import { apiGet, apiPost } from './api';
import { useDriverStore } from './store';

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
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#4CAF50', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
      title: 'Pickup', animation: google.maps.Animation.DROP
    });
    bounds.extend({ lat: ${pickupCoords.lat}, lng: ${pickupCoords.lng} }); hasPoint = true;
    ` : ''}
    ${dropCoords?.lat ? `
    new google.maps.Marker({
      position: { lat: ${dropCoords.lat}, lng: ${dropCoords.lng} }, map,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#e94560', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
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
    const dr = new google.maps.DirectionsRenderer({ map, suppressMarkers: true, polylineOptions: { strokeColor: '#1a1a2e', strokeWeight: 4, strokeOpacity: 0.8 } });
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
    Animated.timing(anim, { toValue: 0, duration: seconds * 1000, useNativeDriver: false }).start();
    const t = setInterval(() => {
      setLeft((l: number) => { if (l <= 1) { clearInterval(t); onTimeout?.(); return 0; } return l - 1; });
    }, 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 12, color: '#666' }}>⏱️ Auto-reject in</Text>
        <Text style={{ fontSize: 12, fontWeight: 'bold', color: left <= 5 ? '#e94560' : '#333' }}>{left}s</Text>
      </View>
      <View style={{ height: 4, backgroundColor: '#f0f0f0', borderRadius: 2, overflow: 'hidden' }}>
        <Animated.View style={{ height: 4, borderRadius: 2, backgroundColor: left <= 5 ? '#e94560' : '#4CAF50', width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
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
const FloatingDots = ({ color = '#e94560' }: any) => {
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
      <View style={{ height: 3, backgroundColor: '#e8f5e9', borderRadius: 2, marginHorizontal: 10, marginBottom: 8, overflow: 'hidden' }}>
        <Animated.View style={{ height: 3, backgroundColor: '#4CAF50', borderRadius: 2, width: anim.interpolate({ inputRange: [0, 3], outputRange: ['0%', '100%'] }) }} />
      </View>
      <View style={{ flexDirection: 'row' }}>
        {steps.map((s, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: i <= idx ? '#4CAF50' : '#efefef', alignItems: 'center', justifyContent: 'center', transform: [{ scale: i === idx ? 1.2 : 1 }], elevation: i === idx ? 4 : 0 }}>
              <Text style={{ fontSize: 12 }}>{i <= idx ? s.icon : '·'}</Text>
            </View>
            <Text style={{ fontSize: 9, marginTop: 3, color: i <= idx ? '#4CAF50' : '#bbb', fontWeight: i === idx ? 'bold' : 'normal' }}>{s.label}</Text>
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
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CAF50', marginRight: 6 }} />
          <Text style={{ color: '#fff', fontSize: 11, flex: 1 }} numberOfLines={1}>{pickup}</Text>
          <Text style={{ color: '#555', fontSize: 12, marginHorizontal: 5 }}>→</Text>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#e94560', marginRight: 6 }} />
          <Text style={{ color: '#fff', fontSize: 11, flex: 1 }} numberOfLines={1}>{drop}</Text>
        </View>
      )}
    </View>
  );
};

type Screen = 'login' | 'home';

export default function App() {
  const [screen, setScreen]         = useState<Screen>('login');
  const dstore = useDriverStore();
  // Store watcher — guaranteed UI update
  useEffect(() => {
    const unsub = useDriverStore.subscribe((state) => {
      setActiveRide(state.activeRide);
      setRideReq(state.pendingRide);
    });
    return unsub;
  }, []);
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
  const [tripSummary, setTripSummary]   = useState<any>(null);
  const [paymentWaiting, setPaymentWaiting]     = useState(false);
  const [showDriverCancelModal, setShowDriverCancelModal] = useState(false);
  const [cancelReason, setCancelReason]         = useState('');
  const [paymentRideId, setPaymentRideId] = useState('');
  const [paymentFare, setPaymentFare]     = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [driverGps, setDriverGps]   = useState<any>(null);
  const [pickupInRange, setPickupInRange] = useState(false);
  const [dropInRange, setDropInRange] = useState(false);
  const [rangeDist, setRangeDist]   = useState(0);
  const [target, setTarget]         = useState<any>(null);
  const [chatMsgs, setChatMsgs]     = useState<any[]>([]);
  const [chatInput, setChatInput]   = useState('');
  const [showChat, setShowChat]     = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const lastChatCount = useRef(0);

  // ── Wallet / Earnings + Bonus State ──────────
  const [bonusData, setBonusData] = useState<any>({ rides_today: 0, available_bonuses: [], claimed_tiers: [], next_target: null });
  const [driverOffers, setDriverOffers] = useState<any[]>([]);
  const [offerDismissed, setOfferDismissed] = useState<Set<number>>(new Set());
  const [bonusClaiming, setBonusClaiming] = useState(false);
  const [driverWallet, setDriverWallet] = useState<any>({ balance: 0, total_earned: 0, total_withdrawn: 0 });
  const [driverRideHistory, setDriverRideHistory] = useState<any[]>([]);
  const [driverHourlyHistory, setDriverHourlyHistory] = useState<any[]>([]);
  const [walletEarningsTab, setWalletEarningsTab] = useState<'summary'|'rides'|'hourly'>('summary');
  const [payoutInput, setPayoutInput] = useState('');
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [walletLoaded, setWalletLoaded] = useState(false);

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
  const [hourlyOtpInput, setHourlyOtpInput]     = useState('');
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
  const [driverInfo, setDriverInfo] = useState<any>(null);
  const [devOtp, setDevOtp]         = useState('');

  const DRIVERS = [
    { phone: '8888888888', name: 'Raju',   vehicle: 'UP32AB1234', type: '🛺 Auto' },
    { phone: '7777777777', name: 'Amit',   vehicle: 'UP32CD5678', type: '🏍️ Bike' },
    { phone: '6666666666', name: 'Suresh', vehicle: 'UP32EF9012', type: '🚕 Taxi' },
  ];
  const selectedDriver = DRIVERS.find(d => d.phone === phone);

  // ── Auto login ─────────────────────────────────
  useEffect(() => {
    (async () => {
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
              if (data.driver.status === 'approved') { setScreen('home'); loadUpiId(savedPhone); registerFCM(savedPhone); }
            } else { if (savedInfo) setDriverInfo(JSON.parse(savedInfo)); setScreen('home'); }
          } catch (_e) { if (savedInfo) setDriverInfo(JSON.parse(savedInfo)); setScreen('home'); }
        }
      } catch (_e) {}
    })();
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

  // ── Notification Handler ──────────────────────
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    const sub1 = Notifications.addNotificationReceivedListener(notification => {
      console.log('📱 Driver notification:', notification);
    });

    const sub2 = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('👆 Driver notification tapped:', response);
    });

    return () => {
      sub1.remove();
      sub2.remove();
    };
  }, []);
  // ── FCM Token Register ────────────────────────
  const registerFCM = async (userPhone: string) => {
    try {
      // if (!Device.isDevice) return;
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;
      const token = (await Notifications.getExpoPushTokenAsync({
        projectId: '8c13e622-0206-4e3f-ad33-8851c0f9353c'
      })).data;
      await apiPost('/api/auth/save-fcm-token', { phone: userPhone, token, role: 'driver' });
      console.log('✅ Driver FCM token saved');
    } catch (e) {
      console.log('FCM error:', e);
    }
  };
  // ── Android Back Button ───────────────────────
  useEffect(() => {
    const backAction = () => {
      if (screen === 'login' && regStep === 0) return false; // App exit
      if (screen === 'login' && regStep > 0) {
        if (regStep === 99) { setRegStep(0); return true; }
        setRegStep(regStep - 1); return true;
      }
      if (showChat) { setShowChat(false); return true; }
      if (tripSummary) return true; // Trip summary pe back nahi
      if (paymentWaiting) return true; // Payment waiting pe back nahi
      if (activeTab !== 'home') { setActiveTab('home'); return true; }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [screen, regStep, showChat, activeTab, tripSummary, paymentWaiting]);

  // ── Polling rides ──────────────────────────────
  const startPolling = (dp: string) => {
    // Store ka single polling engine — overlap guard ke saath
    useDriverStore.getState().startPolling(dp, () => {
      Vibration.vibrate([0, 200, 100, 200]);
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

  const loadBonusToday = async (ph: string) => {
    try { const r = await fetch(`${API}/api/driver/bonus-today?phone=${ph}`); const d = await r.json(); setBonusData(d); } catch (_e) {}
  };
  const loadReferralInfo = async () => {
    if (!phone) return;
    try {
      const r = await fetch(`${API}/api/referral/my-code?phone=${phone}`);
      const d = await r.json();
      if (d.code) { setReferralInfo(d); setReferralLoaded(true); }
    } catch (_e) {}
  };
  const claimBonus = async (tier: number) => {
    setBonusClaiming(true);
    try {
      const res = await fetch(`${API}/api/driver/bonus-claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, tier }) });
      const d = await res.json();
      if (d.success) { setResult('✅ ' + d.message); loadBonusToday(phone); loadDriverWallet(phone); }
      else setResult('❌ ' + (d.error || 'Error'));
    } catch (_e) { setResult('❌ Server error'); }
    setBonusClaiming(false);
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
      if (d.success) { setResult('✅ Payout request bhej di!'); setPayoutInput(''); loadDriverWallet(phone); }
      else setResult('❌ ' + (d.message || d.error || 'Error'));
    } catch (_e) { setResult('❌ Server error'); }
    setPayoutLoading(false);
  };

  // (Store sync ab subscribe se hota hai — upar dekho)

  // ── Location tracking + GPS range check ────────
  useEffect(() => {
    if (!isOnline) return;
    let locInterval: any;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      locInterval = setInterval(async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({});
          setDriverGps({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          await fetch(`${API}/api/driver/update-location`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, lat: loc.coords.latitude, lng: loc.coords.longitude }) });
          // GPS range check disabled for testing
        } catch (_e) {}
      }, 5000);
    })();
    return () => clearInterval(locInterval);
  }, [isOnline, activeRide?.id, activeRide?.status]);

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

  // ── Hourly ride polling ───────────────────────
  useEffect(() => {
    if (!isOnline || !phone) return;
    let stopped = false;
    const iv = setInterval(async () => {
      if (stopped) return;
      try {
        const active = await fetch(`${API}/api/hourly/driver-active?phone=${phone}`).then(r => r.json());
        if (active.booking && !['completed','cancelled'].includes(active.booking.status)) {
          setActiveHourlyRide(active.booking);
          setHourlyRideReq(null);
          return;
        }
        setActiveHourlyRide(null);
        if (!activeRide) {
          const pending = await fetch(`${API}/api/hourly/driver-pending?phone=${phone}`).then(r => r.json());
          if (pending.booking) setHourlyRideReq(pending.booking);
          else setHourlyRideReq(null);
        }
      } catch (_e) {}
    }, 4000);
    return () => { stopped = true; clearInterval(iv); };
  }, [isOnline, phone, activeRide?.id]);

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

  // ── Unread badge during ride ───────────────────
  useEffect(() => {
    if (!activeRide?.id || showChat) return;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/chat/${activeRide.id}`);
        const d = await r.json();
        const msgs = d.messages || [];
        if (msgs.length > lastChatCount.current) setUnreadChat(msgs.length - lastChatCount.current);
      } catch (_e) {}
    }, 3000);
    return () => clearInterval(iv);
  }, [activeRide?.id, showChat]);

  // ── Load daily target ──────────────────────────
  useEffect(() => {
    if (screen !== 'home' || !phone) return;
    (async () => {
      try {
        const r = await fetch(`${API}/api/driver/target?phone=${phone}`);
        const d = await r.json();
        setTarget(d);
        if (d?.completed && rides === 0) setRides(d.completed);
      } catch (_e) {}
    })();
  }, [screen, phone]);

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

  // ── Load referral info when profile tab opens ─────────
  useEffect(() => {
    if (activeTab === 'profile' && !referralLoaded && phone) loadReferralInfo();
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
        loadUpiId(data.driver.phone); loadDriverOffers();
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
    try { await fetch(`${API}/api/driver/toggle-online`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, is_online: val }) }); } catch (_e) {}
    if (val) { setResult('🟢 Online hain — rides aayengi!'); startPolling(phone); loadDriverOffers(); }
    else { setResult('🔴 Offline hain'); stopPolling(); }
  };

  // ── Ride actions ───────────────────────────────
  // Smart API call — timeout + retry, kabhi hang nahi
  const apiCall = async (endpoint: string, body: any) => {
    return apiPost(endpoint, body);
  };

  const acceptRide = async () => {
    if (!rideReq) return;
    setLoading(true);
    const data = await apiCall('/api/rides/accept', { ride_id: rideReq.id, driver_phone: phone });
    if (data._error) {
      setResult('❌ ' + data.message);
    } else if (data.success) {
      setResult('✅ Ride accept ki!');
      setRideReq(null);
      fetchEta(rideReq.pickup, rideReq.drop_location);
    } else {
      setResult('❌ ' + (data.message || 'Ride kisi aur ko mil gayi'));
      setRideReq(null);
    }
    setLoading(false);
  };
  const rejectRide = () => {
    setRideReq(null);
    useDriverStore.getState().clearAll();
    // Polling dobara start karo taaki nayi rides aati rahein
    if (isOnline) startPolling(phone);
    setResult('❌ Ride reject ki');
  };

  const markArrived = async () => {
    setLoading(true);
    const data = await apiCall('/api/rides/arrived', { ride_id: activeRide.id });
    if (data._error) setResult('❌ ' + data.message);
    else setActiveRide({ ...activeRide, status: 'arrived' });
    setLoading(false);
  };

  const startTrip = async () => {
    if (otpInput.length !== 4) { setResult('❌ 4 digit OTP daalo'); return; }
    setLoading(true);
    const data = await apiCall('/api/rides/start', { ride_id: activeRide.id, otp: otpInput });
    if (data._error) setResult('❌ ' + data.message);
    else if (data.success) { setActiveRide({ ...activeRide, status: 'started' }); setOtpInput(''); setResult(''); }
    else setResult('❌ ' + (data.message || 'Galat OTP!'));
    setLoading(false);
  };

  const completeTrip = async () => {
    setLoading(true);
    // Capture before any async/state changes
    const rideId = activeRide?.id;
    const rideFare = String(activeRide?.fare || '0');
    const ridePMethod = activeRide?.payment_method || '';
    try {
      const res = await fetch(`${API}/api/rides/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ride_id: rideId })
      });
      let data: any = {};
      try { data = await res.json(); } catch (_e) {}
      // Consider it success if HTTP 2xx OR data.success (backend might send 500 even if UPDATE went through)
      if (res.ok || data.success) {
        setPaymentRideId(rideId);
        setPaymentFare(rideFare);
        setPaymentMethod(ridePMethod);
        setPaymentWaiting(true);
        setEarnings(e => e + parseFloat(rideFare));
        setRides(r => r + 1);
        setActiveRide(null);
      } else {
        setResult('❌ ' + (data.message || data.error || 'Complete nahi hua, retry karo'));
      }
    } catch (_e) {
      // Fetch itself failed (no network) — show error, don't navigate away
      setResult('❌ Network error — check internet aur retry karo');
    }
    setLoading(false);
  };

  // Payment status polling (driver wait kare)
  useEffect(() => {
    if (!paymentWaiting || !paymentRideId) return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/rides/payment-status/${paymentRideId}`);
        const data = await res.json();
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
      await fetch(`${API}/api/rides/cash-confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ride_id: paymentRideId, phone, payment_method: method })
      });
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
      const cr = await fetch(`${API}/api/rides/cancel-smart`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ride_id: activeRide.id, cancelled_by: 'driver', reason: cancelReason || 'Driver cancelled', phone })
      });
      const cd = await cr.json();
      if (cd.success) {
        setResult(cd.message ? '⚠️ ' + cd.message : '❌ Trip cancel ki');
        setActiveRide(null);
        setShowDriverCancelModal(false);
      } else {
        setResult('❌ Cancel nahi hua — retry karo');
      }
    } catch (_e) {
      setResult('❌ Network error — retry karo');
      setActiveRide(null);
    }
    setLoading(false);
  };

  // ── Chat ───────────────────────────────────────
  const sendChat = async () => {
    if (!chatInput.trim() || !activeRide?.id) return;
    const msg = chatInput; setChatInput('');
    try { await fetch(`${API}/api/chat/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ride_id: activeRide.id, sender: 'driver', message: msg }) }); const r = await fetch(`${API}/api/chat/${activeRide.id}`); const d = await r.json(); setChatMsgs(d.messages || []); } catch (_e) {}
  };
  const callCustomer = () => { if (activeRide?.passenger_phone) Linking.openURL(`tel:${activeRide.passenger_phone}`); };

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
    if (!activeHourlyRide) return;
    try {
      const res = await fetch(`${API}/api/hourly/accept-extend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: activeHourlyRide.id }) });
      const data = await res.json();
      if (data.success) setActiveHourlyRide((p: any) => ({ ...p, package_hours: data.new_hours, km_included: data.new_km, base_fare: data.new_fare, extend_requested_hours: null }));
      else setResult('❌ ' + data.message);
    } catch (_e) { setResult('❌ Network error'); }
  };

  const rejectExtend = async () => {
    if (!activeHourlyRide) return;
    try {
      await fetch(`${API}/api/hourly/reject-extend`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: activeHourlyRide.id }) });
      setActiveHourlyRide((p: any) => ({ ...p, extend_requested_hours: null }));
    } catch (_e) {}
  };

  // ── PhotoBox ───────────────────────────────────
  const PhotoBox = ({ field, label, icon, cameraOnly }: any) => (
    <View style={rs.photoBox}>
      {regData[field] ? (
        <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 32 }}>✅</Text><Text style={{ color: '#4CAF50', fontWeight: '600', marginTop: 4 }}>Uploaded</Text></View>
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

  // ═══ REGISTRATION STEP 1 — Phone + OTP ═══
  if (screen === 'login' && regStep === 1) return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={rs.regHeader}>
        <TouchableOpacity onPress={() => { setRegStep(0); setLoginOtpSent(false); setLoginOtpDigits(['','','','','','']); }}>
          <Text style={{ color: '#fff', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={rs.regTitle}>Step 1 of 5</Text>
        <View style={{ width: 50 }} />
      </View>
      <View style={{ height: 4, backgroundColor: '#333' }}><View style={{ height: 4, backgroundColor: '#e94560', width: '20%' }} /></View>
      <ScrollView style={{ flex: 1, padding: 20 }} keyboardShouldPersistTaps="handled">
        {!loginOtpSent ? (
          <View>
            <Text style={rs.bigTitle}>📱 Phone Number</Text>
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
            <View style={{ backgroundColor: '#fff3e0', borderRadius: 10, padding: 12, marginTop: 16, marginBottom: 20, flexDirection: 'row' }}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>💡</Text>
              <Text style={{ fontSize: 12, color: '#e65100', flex: 1 }}>SMS aane par OTP copy karo — boxes mein auto fill ho jaayega!</Text>
            </View>
            {/* 6 OTP Boxes */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
              {loginOtpDigits.map((digit, i) => (
                <TextInput key={i}
                  ref={(ref) => { loginOtpRefs.current[i] = ref; }}
                  style={{ width: 44, height: 54, borderRadius: 12, textAlign: 'center', fontSize: 22, fontWeight: 'bold', borderWidth: 2, borderColor: digit ? '#e94560' : '#e0e0e0', backgroundColor: digit ? '#fff8f8' : '#fafafa', color: '#1a1a2e' }}
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
                  <Text style={{ color: '#e94560', fontWeight: 'bold' }}>🔄 OTP Dobara Bhejo</Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ color: '#999', fontSize: 13 }}>Dobara bhejne ke liye <Text style={{ color: '#e94560', fontWeight: 'bold' }}>{loginResendTimer}s</Text> wait karo</Text>
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
      <View style={rs.regHeader}><TouchableOpacity onPress={() => setRegStep(1)}><Text style={{ color: '#fff', fontSize: 16 }}>← Back</Text></TouchableOpacity><Text style={rs.regTitle}>Step 2 of 5</Text><View style={{ width: 50 }} /></View>
      <View style={{ height: 4, backgroundColor: '#333' }}><View style={{ height: 4, backgroundColor: '#e94560', width: '40%' }} /></View>
      <ScrollView style={{ flex: 1, padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text style={rs.bigTitle}>🚗 Vehicle Type</Text><Text style={rs.subTitle}>Aap kya chalate hain?</Text>
        {[
          { id:'bike', icon:'🏍️', label:'Bike', sub:'' },
          { id:'auto', icon:'🛺', label:'Auto', sub:'' },
          { id:'car', icon:'🚕', label:'Car / Taxi', sub:'' },
          { id:'eriksha', icon:'🛵', label:'E-Riksha', sub:'' },
          { id:'ultra_luxury', icon:'💎', label:'Ultra Luxury', sub:'BMW · Mercedes · Audi · Land Rover · Lexus' },
        ].map(v => (
          <TouchableOpacity key={v.id}
            style={[rs.vehBox, regData.vehicle_type === v.id && rs.vehBoxActive, v.id === 'ultra_luxury' && { borderWidth: 2, borderColor: regData.vehicle_type === v.id ? '#e94560' : '#c9a227' }]}
            onPress={() => { updateReg('vehicle_type', v.id); updateReg('vehicle_brand', ''); updateReg('vehicle_model', ''); }}>
            <Text style={{ fontSize: 32, marginRight: 16 }}>{v.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[{ fontSize: 18, fontWeight: '600', color: '#1a1a2e' }, regData.vehicle_type === v.id && { color: '#fff' }]}>{v.label}</Text>
              {v.sub ? <Text style={{ fontSize: 11, color: regData.vehicle_type === v.id ? '#ddd' : '#c9a227', marginTop: 2 }}>{v.sub}</Text> : null}
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
      <View style={s.screen}>
        <View style={rs.regHeader}>
          <TouchableOpacity onPress={() => setRegStep(2)}><Text style={{ color: '#fff', fontSize: 16 }}>← Back</Text></TouchableOpacity>
          <Text style={rs.regTitle}>Step 3 of 5</Text>
          <View style={{ width: 50 }} />
        </View>
        <View style={{ height: 4, backgroundColor: '#333' }}><View style={{ height: 4, backgroundColor: '#e94560', width: '60%' }} /></View>
        <ScrollView style={{ flex: 1, padding: 20 }} keyboardShouldPersistTaps="handled">
          <Text style={rs.bigTitle}>📄 Driving License</Text>
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
              <Text style={{ fontSize: 11, color: '#888' }}>Format: XX00 YYYY XXXXXXX (2 letter + 13 digits)</Text>
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
          <View style={{ height: 30 }} />
        </ScrollView>
      </View>
    );
  }

  // ═══ REGISTRATION STEP 4 — Vehicle ═══
  if (screen === 'login' && regStep === 4) {
    const needBrand  = ['bike','car','ultra_luxury'].includes(regData.vehicle_type);
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
      bike:  'eg. Activa 6G, Splendor Plus, Pulsar 150, Royal Enfield Classic',
      car:   'eg. Swift Dzire, Creta, Nexon, City, Fortuner',
      auto:  'eg. Bajaj RE, TVS King, Piaggio Ape',
    };

    return (
      <View style={s.screen}>
        <View style={rs.regHeader}>
          <TouchableOpacity onPress={() => setRegStep(3)}><Text style={{ color: '#fff', fontSize: 16 }}>← Back</Text></TouchableOpacity>
          <Text style={rs.regTitle}>Step 4 of 5</Text>
          <View style={{ width: 50 }} />
        </View>
        <View style={{ height: 4, backgroundColor: '#333' }}><View style={{ height: 4, backgroundColor: '#e94560', width: '80%' }} /></View>
        <ScrollView style={{ flex: 1, padding: 20 }} keyboardShouldPersistTaps="handled">
          <Text style={rs.bigTitle}>{regData.vehicle_type === 'ultra_luxury' ? '💎' : '🚗'} Vehicle Details</Text>
          <Text style={rs.subTitle}>
            {regData.vehicle_type === 'eriksha' ? 'E-Riksha: photo zaruri, number optional' :
             regData.vehicle_type === 'ultra_luxury' ? 'Premium vehicle — brand, model aur number' :
             'Brand, model, number aur photos'}
          </Text>

          {/* ── Brand ── */}
          {needBrand && (
            <>
              <Text style={rs.fieldLabel}>Vehicle Brand / Company *</Text>
              {regData.vehicle_type === 'ultra_luxury' ? (
                <View style={{ marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                    {LUXURY_BRANDS.map(b => (
                      <TouchableOpacity key={b}
                        onPress={() => { updateReg('vehicle_brand', b); updateReg('vehicle_model', ''); }}
                        style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: regData.vehicle_brand === b ? '#1a1a2e' : '#fff8e1', borderWidth: 2, borderColor: regData.vehicle_brand === b ? '#c9a227' : '#ffe082' }}>
                        <Text style={{ fontWeight: '700', color: regData.vehicle_brand === b ? '#ffd700' : '#b8860b', fontSize: 13 }}>{b}</Text>
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
                  placeholder={regData.vehicle_type === 'bike' ? 'eg. Honda, Bajaj, Royal Enfield, TVS' : 'eg. Maruti, Hyundai, Tata, Honda'}
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
              {regData.vehicle_type === 'ultra_luxury' && regData.vehicle_brand ? (
                <View style={{ marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                    {(LUXURY_MODELS[regData.vehicle_brand] || []).map((m: string) => (
                      <TouchableOpacity key={m} onPress={() => updateReg('vehicle_model', m)}
                        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: regData.vehicle_model === m ? '#1a1a2e' : '#f5f5f5', borderWidth: 1, borderColor: regData.vehicle_model === m ? '#e94560' : '#e0e0e0' }}>
                        <Text style={{ fontWeight: '600', color: regData.vehicle_model === m ? '#fff' : '#333', fontSize: 13 }}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {regData.vehicle_model
                    ? <Text style={{ color: '#2e7d32', fontSize: 12 }}>✅ Model: {regData.vehicle_model}</Text>
                    : <Text style={{ color: '#e65100', fontSize: 12 }}>{regData.vehicle_brand ? 'Model select karo' : 'Pehle brand select karo'}</Text>}
                </View>
              ) : regData.vehicle_type === 'ultra_luxury' ? (
                <View style={{ backgroundColor: '#fff3e0', borderRadius: 10, padding: 12, marginBottom: 8 }}>
                  <Text style={{ color: '#e65100', fontSize: 13 }}>Pehle upar brand select karo — fir model dikhega</Text>
                </View>
              ) : (
                <>
                  <TextInput
                    style={[rs.input, { marginBottom: 4 }]}
                    placeholder={modelPlaceholder[regData.vehicle_type] || 'Vehicle model likhao'}
                    value={regData.vehicle_model}
                    onChangeText={(v) => updateReg('vehicle_model', v)}
                  />
                  <Text style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Model = brand ke baad ka specific name (eg. Hyundai → Creta)</Text>
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
          <Text style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Number plate clearly visible honi chahiye</Text>
          <PhotoBox field="vehicle_photo" label="Vehicle Photo" icon="🚗" />

          <Text style={[rs.fieldLabel, { marginTop: 14 }]}>RC (Registration Certificate) Photo</Text>
          <Text style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Optional — lekin jaldi verify hoga agar doge</Text>
          <PhotoBox field="rc_photo" label="RC Photo" icon="📋" />

          {result ? <Text style={s.err}>{result}</Text> : null}
          <TouchableOpacity style={[s.btn, !step4Ok && { opacity: 0.5 }]} disabled={!step4Ok} onPress={() => { setResult(''); setRegStep(5); }}>
            <Text style={s.btnTxt}>Aage badho →</Text>
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  }

  // ═══ REGISTRATION STEP 5 — Aadhaar + Selfie ═══
  if (screen === 'login' && regStep === 5) {
    const aadhaarDigits = regData.aadhaar_number.replace(/\D/g, '');
    const aadhaarOk = aadhaarDigits.length === 12;
    const step5Ok = aadhaarOk && !!regData.aadhaar_photo && !!regData.face_photo;
    return (
      <View style={s.screen}>
        <View style={rs.regHeader}>
          <TouchableOpacity onPress={() => setRegStep(4)}><Text style={{ color: '#fff', fontSize: 16 }}>← Back</Text></TouchableOpacity>
          <Text style={rs.regTitle}>Step 5 of 5</Text>
          <View style={{ width: 50 }} />
        </View>
        <View style={{ height: 4, backgroundColor: '#333' }}><View style={{ height: 4, backgroundColor: '#e94560', width: '100%' }} /></View>
        <ScrollView style={{ flex: 1, padding: 20 }} keyboardShouldPersistTaps="handled">
          <Text style={rs.bigTitle}>🪪 Aadhaar & Selfie</Text>
          <Text style={rs.subTitle}>Last step — aur aap ho jayenge!</Text>

          <View style={[rs.adviceBox, { backgroundColor: '#e8f5e9' }]}>
            <Text style={[rs.adviceTitle, { color: '#2e7d32' }]}>🔒 Privacy Note:</Text>
            <Text style={[rs.adviceText, { color: '#388e3c' }]}>• Aapka Aadhaar sirf verification ke liye hai</Text>
            <Text style={[rs.adviceText, { color: '#388e3c' }]}>• Documents securely store kiye jaate hain</Text>
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
          <Text style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Front side — naam aur number clearly visible ho</Text>
          <PhotoBox field="aadhaar_photo" label="Aadhaar Photo" icon="🪪" />

          <Text style={[rs.fieldLabel, { marginTop: 18 }]}>Live Selfie *</Text>
          <View style={{ backgroundColor: '#fff3e0', borderRadius: 10, padding: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 16, marginRight: 8 }}>🔒</Text>
            <Text style={{ fontSize: 11, color: '#e65100', flex: 1 }}>Sirf live camera se selfie — gallery se upload nahi hoga. Saaf light mein, seedha chehra.</Text>
          </View>
          <PhotoBox field="face_photo" label="Live Selfie" icon="🤳" cameraOnly />

          {result ? <Text style={s.err}>{result}</Text> : null}
          <TouchableOpacity
            style={[s.btn, !step5Ok && { opacity: 0.5 }, { marginTop: 20 }]}
            disabled={!step5Ok || loading}
            onPress={submitRegistration}>
            <Text style={s.btnTxt}>{loading ? '⏳ Submit ho raha hai...' : '✅ Registration Submit Karo'}</Text>
          </TouchableOpacity>
          <View style={{ height: 60 }} />
        </ScrollView>
      </View>
    );
  }

  // ═══ REGISTRATION DONE ═══
  if (screen === 'login' && regStep === 99) return (
    <View style={s.screen}>
      <View style={s.hero}>
        <Text style={{ fontSize: 70 }}>🎉</Text>
        <Text style={s.heroTitle}>Application Submit!</Text>
        <Text style={{ color: '#aaa', fontSize: 13, marginTop: 4 }}>Spero Buddy Captain</Text>
      </View>
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Text style={{ fontSize: 16, color: '#333', textAlign: 'center', lineHeight: 26 }}>
          Aapki Spero Buddy Captain application submit ho gayi! ✅{'\n\n'}Admin aapke sare documents — DL, Aadhaar, Vehicle aur Selfie — verify karega.
        </Text>
        <View style={{ backgroundColor: '#e8f5e9', borderRadius: 12, padding: 16, marginTop: 16, width: '100%' }}>
          <Text style={{ color: '#2e7d32', textAlign: 'center', fontWeight: '600', fontSize: 13 }}>✅ Verification hone ke baad app khud notify kar dega</Text>
        </View>
        <View style={{ backgroundColor: '#fff3e0', borderRadius: 12, padding: 16, marginTop: 10, width: '100%' }}>
          <Text style={{ color: '#ef6c00', textAlign: 'center', fontWeight: '600' }}>⏳ Status: Verification Pending</Text>
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
          <Text style={{ color: '#aaa', fontSize: 13, marginTop: 4 }}>Spero Buddy Captain</Text>
        </View>
        <View style={{ padding: 24 }}>
          <View style={{ backgroundColor: cfg.bg, borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <Text style={{ fontSize: 15, lineHeight: 24, textAlign: 'center', color: cfg.col }}>{cfg.msg}</Text>
          </View>
          {driverInfo.admin_message ? (
            <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 20, borderWidth: 2, borderColor: cfg.col }}>
              <Text style={{ fontSize: 13, color: '#888', marginBottom: 6, fontWeight: '600' }}>📩 Admin ka message:</Text>
              <Text style={{ fontSize: 15, color: '#1a1a2e', fontWeight: '500', lineHeight: 22 }}>{driverInfo.admin_message}</Text>
            </View>
          ) : null}
          {(driverInfo.status === 'rejected' || driverInfo.status === 'resubmit') && (
            <TouchableOpacity style={s.btn} onPress={() => { setRegData((p: any) => ({ ...p, phone: driverInfo.phone })); setDriverInfo(null); setRegStep(2); }}>
              <Text style={s.btnTxt}>📄 Documents Resubmit Karo</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.btn, { backgroundColor: '#1a1a2e', marginTop: 10 }]} onPress={() => { setDriverInfo(null); setLoginPhone(''); setResult(''); }}>
            <Text style={s.btnTxt}>← Wapas Login pe jao</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ═══ LOGIN ═══
  if (screen === 'login') return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.hero}>
        <Text style={s.heroIcon}>🚖</Text>
        <Text style={s.heroTitle}>Spero Buddy</Text>
        <Text style={s.heroSub}>Captain Login</Text>
      </View>
      <ScrollView style={{ flex: 1, padding: 16 }} keyboardShouldPersistTaps="handled">
        {!loginOtpSent ? (
          // ── Phone Input ──
          <View>
            <Text style={s.sectionTitle}>📱 Apne number se login karo:</Text>
            <View style={[s.driverItem, { marginBottom: 12 }]}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>🇮🇳 +91</Text>
              <TextInput style={{ flex: 1, fontSize: 18 }} placeholder="10 digit number" keyboardType="numeric" maxLength={10} value={loginPhone} onChangeText={setLoginPhone} />
            </View>
            {result ? <Text style={s.err}>{result}</Text> : null}
            <Bouncy style={[s.btn, { marginTop: 0, marginBottom: 16 }, loginPhone.length !== 10 && { opacity: 0.5 }]} disabled={loginPhone.length !== 10 || loading} onPress={doLogin}>
              <Text style={s.btnTxt}>{loading ? '⏳ OTP bhej raha hai...' : 'OTP Bhejo 📱'}</Text>
            </Bouncy>
            <Bouncy style={{ borderWidth: 2, borderColor: '#e94560', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 20 }} onPress={() => { setRegStep(1); setResult(''); }}>
              <Text style={{ color: '#e94560', fontSize: 16, fontWeight: 'bold' }}>🆕 Spero Buddy Captain Banein</Text>
            </Bouncy>
            {/* Test drivers */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 12 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: '#e0e0e0' }} />
              <Text style={{ color: '#999', marginHorizontal: 12, fontSize: 12 }}>TEST DRIVERS</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: '#e0e0e0' }} />
            </View>
            {DRIVERS.map((d, i) => (
              <TouchableOpacity key={i} style={[s.driverItem, phone === d.phone && s.driverItemActive]} onPress={() => setPhone(d.phone)}>
                <Text style={s.driverItemIcon}>{d.type.split(' ')[0]}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.driverItemName, phone === d.phone && { color: '#fff' }]}>{d.name}</Text>
                  <Text style={[s.driverItemVehicle, phone === d.phone && { color: '#ddd' }]}>{d.vehicle} · {d.type}</Text>
                </View>
                {phone === d.phone && <Text style={{ color: '#fff', fontSize: 20 }}>✓</Text>}
              </TouchableOpacity>
            ))}
            <Bouncy style={[s.btn, !phone && { opacity: 0.5 }]} onPress={() => { if (phone) { setScreen('home'); registerFCM(phone); } }} disabled={!phone}>
              <Text style={s.btnTxt}>Test Login 🧪</Text>
            </Bouncy>
          </View>
        ) : (
          // ── OTP Input ──
          <View>
            <View style={{ backgroundColor: '#e3f2fd', borderRadius: 12, padding: 14, marginBottom: 20, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 20, marginRight: 10 }}>📱</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, color: '#1565c0', fontWeight: '600' }}>OTP bheja gaya!</Text>
                <Text style={{ fontSize: 12, color: '#1976d2', marginTop: 2 }}>+91 {loginPhone} pe 6-digit code aaya hoga</Text>
              </View>
            </View>
            <View style={{ backgroundColor: '#fff3e0', borderRadius: 10, padding: 12, marginBottom: 18, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>💡</Text>
              <Text style={{ fontSize: 12, color: '#e65100', flex: 1 }}>SMS aane par OTP copy karo — 6 boxes mein paste ho jaayega!</Text>
            </View>
            {/* 6 OTP Boxes */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
              {loginOtpDigits.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={(ref) => { loginOtpRefs.current[i] = ref; }}
                  style={{ width: 44, height: 54, borderRadius: 12, textAlign: 'center', fontSize: 22, fontWeight: 'bold', borderWidth: 2, borderColor: digit ? '#e94560' : '#e0e0e0', backgroundColor: digit ? '#fff8f8' : '#fafafa', color: '#1a1a2e' }}
                  keyboardType="number-pad" maxLength={1} value={digit}
                  onChangeText={(t) => handleLoginOtpChange(t, i)}
                  onKeyPress={({ nativeEvent }) => handleLoginOtpKeyPress(nativeEvent.key, i)}
                />
              ))}
            </View>
            {/* Test OTP banner */}
            {devOtp ? (
              <TouchableOpacity
                onPress={() => { const d = devOtp.split(''); setLoginOtpDigits(d); setLoginOtp(devOtp); }}
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
            <Bouncy style={[s.btn, { marginBottom: 12 }, (loading || loginOtpDigits.join('').length < 6) && { opacity: 0.6 }]} disabled={loading || loginOtpDigits.join('').length < 6} onPress={() => verifyLoginOtp()}>
              <Text style={s.btnTxt}>{loading ? '⏳ Verify ho raha hai...' : '✅ Verify Karo'}</Text>
            </Bouncy>
            {/* Resend */}
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              {loginCanResend ? (
                <TouchableOpacity onPress={() => { setLoginOtpDigits(['','','','','','']); setLoginOtp(''); setResult(''); doLogin(); }}>
                  <Text style={{ color: '#e94560', fontWeight: 'bold', fontSize: 14 }}>🔄 OTP Dobara Bhejo</Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ color: '#999', fontSize: 13 }}>Dobara bhejne ke liye <Text style={{ color: '#e94560', fontWeight: 'bold' }}>{loginResendTimer}s</Text> wait karo</Text>
              )}
            </View>
            <TouchableOpacity onPress={() => { setLoginOtpSent(false); setLoginOtpDigits(['','','','','','']); setResult(''); }} style={{ alignItems: 'center' }}>
              <Text style={{ color: '#666', fontSize: 13 }}>← Number change karo</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );

  // ═══ PAYMENT WAITING SCREEN ═══
  if (paymentWaiting) return (
    <ScreenIn style={s.screen}>
      <View style={[s.hero, { paddingTop: 50, paddingBottom: 28 }]}>
        <Text style={{ fontSize: 60 }}>💰</Text>
        <Text style={s.heroTitle}>Trip Complete!</Text>
        <Text style={{ color: '#4CAF50', fontSize: 40, fontWeight: 'bold', marginTop: 8 }}>₹{paymentFare}</Text>
        <Text style={{ color: '#aaa', fontSize: 13, marginTop: 4 }}>Net kamai: ₹{(parseFloat(paymentFare) * 0.85).toFixed(0)} (15% fee ke baad)</Text>
      </View>
      <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ paddingBottom: 30 }}>

        {/* ── Driver se directly pay kiya ── */}
        <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#1a1a2e', marginBottom: 12 }}>
          Customer ne aapko directly pay kiya?
        </Text>

        <Bouncy
          style={{ backgroundColor: '#e8f5e9', borderRadius: 14, padding: 18, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#a5d6a7', opacity: loading ? 0.6 : 1 }}
          onPress={() => confirmDirectPayment('cash')} disabled={loading}>
          <Text style={{ fontSize: 36, marginRight: 14 }}>💵</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#2e7d32' }}>Cash Mila — ₹{paymentFare}</Text>
            <Text style={{ fontSize: 12, color: '#388e3c', marginTop: 3 }}>Customer ne haath mein cash diya</Text>
          </View>
          <Text style={{ fontSize: 22, color: '#2e7d32' }}>›</Text>
        </Bouncy>

        <Bouncy
          style={{ backgroundColor: '#e3f2fd', borderRadius: 14, padding: 18, marginBottom: 18, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#90caf9', opacity: loading ? 0.6 : 1 }}
          onPress={() => confirmDirectPayment('upi_direct')} disabled={loading}>
          <Text style={{ fontSize: 36, marginRight: 14 }}>📱</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#1565c0' }}>UPI / QR Se Mila — ₹{paymentFare}</Text>
            <Text style={{ fontSize: 12, color: '#1976d2', marginTop: 3 }}>Customer ne mera QR scan kiya ya UPI pe diya</Text>
          </View>
          <Text style={{ fontSize: 22, color: '#1565c0' }}>›</Text>
        </Bouncy>

        {/* ── Divider ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: '#e0e0e0' }} />
          <Text style={{ color: '#999', marginHorizontal: 12, fontSize: 13, fontWeight: '600' }}>YA</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: '#e0e0e0' }} />
        </View>

        {/* ── My UPI QR — customer scan kar sakta hai ── */}
        {driverUpiId ? (() => {
          const upiLink = `upi://pay?pa=${encodeURIComponent(driverUpiId)}&pn=${encodeURIComponent(driverInfo?.name || 'Driver')}&am=${paymentFare}&cu=INR&tn=RideApp%20Trip`;
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(upiLink)}`;
          return (
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, elevation: 3, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: '#e0e0e0' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#1a1a2e', marginBottom: 4 }}>📱 Customer Ko Dikhao — Scan Kare</Text>
              <Text style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>GPay · PhonePe · Paytm · Koi bhi UPI</Text>
              <Image source={{ uri: qrUrl }} style={{ width: 200, height: 200, borderRadius: 12 }} resizeMode="contain" />
              <Text style={{ fontSize: 12, color: '#1565c0', marginTop: 10, fontWeight: '600' }}>{driverUpiId}</Text>
              <View style={{ backgroundColor: '#e94560', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 7, marginTop: 10 }}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>₹{paymentFare}</Text>
              </View>
            </View>
          );
        })() : (
          <View style={{ backgroundColor: '#fff3e0', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#ffe082' }}>
            <Text style={{ fontSize: 13, color: '#e65100', textAlign: 'center' }}>⚠️ UPI ID set karo profile mein QR dikhane ke liye</Text>
          </View>
        )}

        {/* ── Customer app se payment ── */}
        {paymentMethod !== 'cash' ? (
          <View style={{ backgroundColor: '#f5f5f5', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ fontSize: 13, color: '#888', textAlign: 'center' }}>Customer abhi app mein pay kar raha hai...</Text>
            <FloatingDots color="#e94560" />
          </View>
        ) : (
          <View style={{ backgroundColor: '#fff8e1', borderRadius: 14, padding: 18, elevation: 2, marginBottom: 14, borderWidth: 1, borderColor: '#ffe082' }}>
            <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#f57f17', marginBottom: 6 }}>💵 Customer Ne Cash Select Kiya</Text>
            <Text style={{ fontSize: 13, color: '#e65100', marginBottom: 16, lineHeight: 20 }}>
              Customer ne app mein cash payment select ki hai. Unse ₹{paymentFare} cash lo aur confirm karo.
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: '#4CAF50', borderRadius: 12, padding: 16, alignItems: 'center', opacity: loading ? 0.6 : 1 }}
              onPress={() => confirmDirectPayment('cash')} disabled={loading}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>✅ ₹{paymentFare} Cash Mil Gaya</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ backgroundColor: '#f5f5f5', borderRadius: 12, padding: 14 }}>
          <Text style={{ fontSize: 12, color: '#888', textAlign: 'center', lineHeight: 18 }}>
            💡 15% platform fee ke baad aapki net kamai ₹{(parseFloat(paymentFare) * 0.85).toFixed(0)} hogi
          </Text>
        </View>
      </ScrollView>
    </ScreenIn>
  );

  // ═══ DRIVER CANCEL MODAL ═══
  if (showDriverCancelModal) return (
    <View style={s.screen}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 30 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#ddd', alignSelf: 'center', marginBottom: 16 }} />
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1a1a2e', marginBottom: 6 }}>Trip Cancel karein?</Text>
          <View style={{ backgroundColor: '#fff3e0', borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <Text style={{ fontSize: 13, color: '#e65100', fontWeight: '600' }}>⚠️ Zyada cancel karne se aapka account suspend ho sakta hai!</Text>
          </View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 10 }}>Cancel ka reason?</Text>
          {['Customer nahi mila', 'Galat location', 'Emergency aa gayi', 'Vehicle problem', 'Customer rude tha'].map((reason, i) => (
            <TouchableOpacity key={i}
              style={{ backgroundColor: cancelReason === reason ? '#1a1a2e' : '#f5f5f5', borderRadius: 10, padding: 14, marginBottom: 8 }}
              onPress={() => setCancelReason(reason)}>
              <Text style={{ fontSize: 14, color: cancelReason === reason ? '#fff' : '#333' }}>{reason}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={{ backgroundColor: '#e94560', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8, opacity: cancelReason ? 1 : 0.5 }}
            disabled={!cancelReason || loading}
            onPress={cancelTrip}>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>{loading ? '⏳ Cancel ho raha hai...' : '✕ Trip Cancel Karo'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ padding: 14, alignItems: 'center' }} onPress={() => { setShowDriverCancelModal(false); setCancelReason(''); }}>
            <Text style={{ color: '#1a1a2e', fontWeight: 'bold', fontSize: 14 }}>Nahi, trip rakhni hai</Text>
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
        <CountUp value={tripSummary.earned} style={{ color: '#4CAF50', fontSize: 36, fontWeight: 'bold', marginTop: 8 }} />
        <Text style={{ color: '#aaa', fontSize: 12, marginTop: 2 }}>Aapki kamai is trip se</Text>
      </View>
      <ScrollView style={{ flex: 1, padding: 16 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, elevation: 4, marginBottom: 16 }}>
          <Text style={[s.sectionTitle, { marginBottom: 16 }]}>💰 Earning Summary</Text>
          {/* Payment method badge */}
          <View style={{ backgroundColor: tripSummary.payment_method === 'cash' ? '#e8f5e9' : tripSummary.payment_method === 'wallet' ? '#e3f2fd' : '#f3e5f5', borderRadius: 10, padding: 10, marginBottom: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#1a1a2e' }}>
              {tripSummary.payment_method === 'cash' ? '💵 Cash Payment' : tripSummary.payment_method === 'wallet' ? '💰 Wallet Payment' : '💳 Online Payment'}
            </Text>
          </View>
          {tripSummary.isHourly && (
            <View style={{ backgroundColor: '#e8f5e9', borderRadius: 10, padding: 10, marginBottom: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#1a1a2e' }}>⏱️ Hourly Trip · 💰 Wallet Payment</Text>
              {tripSummary.earlyEnd && <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Early end — 70% minimum protection applied</Text>}
              {tripSummary.extraKmInfo && <Text style={{ fontSize: 12, color: '#e65100', marginTop: 4 }}>📍 {tripSummary.extraKmInfo}</Text>}
            </View>
          )}
          {[['Total Fare', '₹' + tripSummary.fare],[`Platform Fee (${tripSummary.isHourly ? '12' : '15'}%)`, tripSummary.fee],['Aapki Kamai', tripSummary.earned]].map(([k, v], i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: '#f5f5f5' }}>
              <Text style={{ fontSize: 14, color: '#666' }}>{k}</Text>
              <Text style={{ fontSize: 14, fontWeight: i === 4 ? 'bold' : '500', color: i === 4 ? '#4CAF50' : '#333' }}>{v}</Text>
            </View>
          ))}
        </View>
        <Bouncy style={[s.btn, { backgroundColor: '#4CAF50' }]} onPress={() => setTripSummary(null)}><Text style={s.btnTxt}>🏠 Next Ride ke liye Ready</Text></Bouncy>
      </ScrollView>
    </ScreenIn>
  );

  // ═══ CHAT (driver) ═══
  if (showChat) return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => setShowChat(false)} style={{ width: 36 }}><Text style={{ color: '#fff', fontSize: 22 }}>←</Text></TouchableOpacity>
        <Text style={s.greeting}>💬 {activeRide?.passenger_name || 'Customer'}</Text>
        <TouchableOpacity onPress={callCustomer} style={{ width: 36, alignItems: 'flex-end' }}><Text style={{ fontSize: 20 }}>📞</Text></TouchableOpacity>
      </View>
      <ScrollView style={{ flex: 1, padding: 14 }} contentContainerStyle={{ paddingBottom: 10 }}>
        {chatMsgs.length === 0 ? (
          <Text style={{ textAlign: 'center', color: '#999', marginTop: 20, fontSize: 13 }}>Koi message nahi</Text>
        ) : chatMsgs.map((m, i) => (
          <View key={i} style={[cs.bubble, m.sender === 'driver' ? cs.mine : cs.theirs]}>
            <Text style={{ color: m.sender === 'driver' ? '#fff' : '#1a1a2e', fontSize: 14 }}>{m.message}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={cs.inputRow}>
        <TextInput style={cs.input} placeholder="Message likho..." value={chatInput} onChangeText={setChatInput} onSubmitEditing={sendChat} />
        <TouchableOpacity style={cs.send} onPress={sendChat}><Text style={{ color: '#fff', fontWeight: 'bold' }}>➤</Text></TouchableOpacity>
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
            {isOnline && <PulseView><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CAF50', marginRight: 7 }} /></PulseView>}
            <Text style={s.greeting}>{isOnline ? '🟢 Online' : '🔴 Offline'}</Text>
          </View>
          <Text style={s.subTxt}>{driverInfo?.name || selectedDriver?.name} · {driverInfo?.vehicle_no || selectedDriver?.vehicle}</Text>
        </View>
        <Switch value={isOnline} onValueChange={toggleOnline} trackColor={{ true: '#4CAF50', false: '#e0e0e0' }} />
      </View>
      {/* Content */}
      <View style={{ flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -20, paddingTop: 16, paddingHorizontal: 16 }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ paddingBottom: 90 }}>
          <View style={s.statsRow}>
            <View style={s.statCard}><Text style={s.statIcon}>💰</Text><CountUp value={earnings} style={s.statValue} /><Text style={s.statLabel}>Aaj ki kamai</Text></View>
            <View style={s.statCard}><Text style={s.statIcon}>🚗</Text><Text style={s.statValue}>{rides}</Text><Text style={s.statLabel}>Rides</Text></View>
            <View style={s.statCard}><Text style={s.statIcon}>⭐</Text><Text style={s.statValue}>{driverInfo?.rating || '4.8'}</Text><Text style={s.statLabel}>Rating</Text></View>
          </View>

          {/* Surge Active Banner */}
          {surgeMultiplier > 1.0 && !activeRide && (
            <View style={{ backgroundColor: '#fff3e0', borderRadius: 12, padding: 10, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 20 }}>⚡</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', fontSize: 13, color: '#e65100' }}>Surge Active: {surgeMultiplier}x — Rides pe zyada kamai!</Text>
                <Text style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Abhi sabhi ride fares {surgeMultiplier}x hain</Text>
              </View>
            </View>
          )}

          {/* Admin Notification Banner */}
          {adminNotif && adminNotif.created_at !== adminNotifDismissed && (
            <View style={{ borderRadius: 14, marginBottom: 10, backgroundColor: '#e3f2fd', borderWidth: 1.5, borderColor: '#1565c0', padding: 12, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 22, marginRight: 10 }}>📩</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', fontSize: 12, color: '#1565c0', marginBottom: 2 }}>RideApp Admin</Text>
                <Text style={{ fontSize: 12, color: '#1a1a2e' }}>{adminNotif.body || adminNotif.title}</Text>
              </View>
              <TouchableOpacity onPress={() => setAdminNotifDismissed(adminNotif.created_at)} style={{ padding: 6 }}>
                <Text style={{ fontSize: 16, color: '#aaa' }}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Driver-targeted marketing banners */}
          {driverOffers.filter(o => !offerDismissed.has(o.id)).map((offer: any) => (
            <View key={offer.id} style={{ borderRadius: 14, marginBottom: 10, backgroundColor: offer.type === 'incentive' ? '#e8f5e9' : '#fff3e0', borderWidth: 1.5, borderColor: offer.type === 'incentive' ? '#2e7d32' : '#e65100', overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
                <Text style={{ fontSize: 22, marginRight: 10 }}>{offer.type === 'incentive' ? '💰' : '📢'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', fontSize: 13, color: '#1a1a2e' }}>{offer.title}</Text>
                  {offer.body ? <Text style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{offer.body}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => setOfferDismissed(s => new Set([...s, offer.id]))} style={{ padding: 6 }}>
                  <Text style={{ fontSize: 16, color: '#aaa' }}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {target && !activeRide && (
            <View style={s.targetCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#1a1a2e' }}>🎯 Daily Target</Text>
                <Text style={{ fontSize: 14, fontWeight: 'bold', color: target.achieved ? '#4CAF50' : '#e94560' }}>{target.achieved ? '✅ Bonus ₹' + target.bonus + ' mila!' : '₹' + target.bonus + ' bonus'}</Text>
              </View>
              <View style={{ height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                <AnimatedBar pct={Math.min(100, (target.completed / target.target) * 100)} color={target.achieved ? '#4CAF50' : '#e94560'} />
              </View>
              <Text style={{ fontSize: 12, color: '#666' }}>{target.completed}/{target.target} rides complete {target.achieved ? '' : `· ${target.remaining} aur baaki`}</Text>
            </View>
          )}

          {activeRide && (
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
                  <Text style={s.tripCustPhone}>📞 {activeRide.passenger_phone || 'N/A'}</Text>
                </View>
                <Text style={s.tripFare}>₹{activeRide.fare}</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <TouchableOpacity style={s.chatCallBtn} onPress={() => { setUnreadChat(0); setShowChat(true); }}>
                  <View>
                    <Text style={{ fontSize: 16 }}>💬</Text>
                    {unreadChat > 0 && <View style={s.chatBadge}><Text style={{ color: '#fff', fontSize: 9, fontWeight: 'bold' }}>{unreadChat}</Text></View>}
                  </View>
                  <Text style={{ fontSize: 12, color: '#1a1a2e', fontWeight: '600', marginLeft: 6 }}>Chat</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.chatCallBtn} onPress={callCustomer}><Text style={{ fontSize: 16 }}>📞</Text><Text style={{ fontSize: 12, color: '#1a1a2e', fontWeight: '600', marginLeft: 6 }}>Call</Text></TouchableOpacity>
              </View>
              {unreadChat > 0 && (
                <TouchableOpacity style={{ backgroundColor: '#e94560', borderRadius: 10, padding: 10, marginBottom: 10, alignItems: 'center' }} onPress={() => { setUnreadChat(0); setShowChat(true); }}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>💬 Customer ne {unreadChat} message bheja</Text>
                </TouchableOpacity>
              )}

              <View style={s.tripRoute}>
                <Text style={s.tripFrom}>📍 {activeRide.pickup}</Text>
                <Text style={s.tripArrow}>↓</Text>
                <Text style={s.tripTo}>🎯 {activeRide.drop_location}</Text>
              </View>
              {eta ? <View style={{ backgroundColor: '#e8f5e9', borderRadius: 8, padding: 8, marginBottom: 10, alignItems: 'center' }}><Text style={{ color: '#2e7d32', fontWeight: '600', fontSize: 13 }}>🕐 {eta}</Text></View> : null}

              {(activeRide.status === 'matched' || activeRide.status === 'arrived') && (
                <TouchableOpacity style={s.navBtn} onPress={() => navigateTo(activeRide.pickup, activeRide.pickup_lat, activeRide.pickup_lng)}><Text style={{ color: '#fff', fontWeight: '600' }}>🗺️ Pickup Navigate Karo</Text></TouchableOpacity>
              )}
              {activeRide.status === 'started' && (
                <TouchableOpacity style={s.navBtn} onPress={() => navigateTo(activeRide.drop_location, activeRide.drop_lat, activeRide.drop_lng)}><Text style={{ color: '#8ae961', fontWeight: '600' }}>🗺️ Drop Navigate Karo</Text></TouchableOpacity>
              )}

              {activeRide.status === 'matched' && (
                <Bouncy style={s.tripBtn} onPress={markArrived} disabled={loading}><Text style={s.tripBtnTxt}>{loading ? '...' : '📍 Pickup pe pahunch gaya'}</Text></Bouncy>
              )}

              {activeRide.status === 'arrived' && (
                <View>
                  <Text style={{ fontSize: 13, color: '#666', marginBottom: 8, textAlign: 'center' }}>🔐 Passenger se OTP poocho</Text>
                  <TextInput style={{ borderWidth: 2, borderColor: '#1a1a2e', borderRadius: 10, padding: 14, fontSize: 24, textAlign: 'center', letterSpacing: 8, marginBottom: 10, fontWeight: 'bold', backgroundColor: '#fff' }} placeholder="0000" keyboardType="number-pad" maxLength={4} value={otpInput} onChangeText={setOtpInput} />
                  <Bouncy style={s.tripBtn} onPress={startTrip} disabled={loading}><Text style={s.tripBtnTxt}>{loading ? '...' : '🚀 OTP Verify & Trip Shuru'}</Text></Bouncy>
                </View>
              )}

              {activeRide.status === 'started' && (
                <View>
                  {/* GPS Range check disabled for testing */}
                  <Bouncy style={[s.tripBtn, { backgroundColor: '#4CAF50' }]} onPress={completeTrip} disabled={loading}>
                    <Text style={s.tripBtnTxt}>{loading ? '...' : '✅ Trip Complete Karo'}</Text>
                  </Bouncy>
                </View>
              )}
              <Bouncy style={s.cancelBtn} onPress={() => setShowDriverCancelModal(true)} disabled={loading}>
                <Text style={s.cancelTxt}>✕ Cancel Trip</Text>
              </Bouncy>
            </View>
          )}

          {rideReq && !activeRide && (
            <SlideIn>
              <View style={s.rideCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <View style={{ backgroundColor: '#fff3e0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 }}>
                    <Text style={{ color: '#e65100', fontSize: 11, fontWeight: '700' }}>🔔 NEW RIDE</Text>
                  </View>
                  {driverGps && rideReq.pickup_lat && (
                    <View style={{ backgroundColor: '#e8f5e9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ color: '#2e7d32', fontSize: 11, fontWeight: '600' }}>
                        📍 {haversineKm(driverGps.lat, driverGps.lng, rideReq.pickup_lat, rideReq.pickup_lng).toFixed(1)} km door
                      </Text>
                    </View>
                  )}
                </View>
                <View style={s.rideHeader}>
                  <Text style={s.rideTitle}>{rideReq.ride_type === 'car' ? '🚕' : rideReq.ride_type === 'bike' ? '🏍️' : rideReq.ride_type === 'eriksha' ? '🛵' : '🛺'} {rideReq.passenger_name || 'Passenger'}</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.rideFare}>₹{rideReq.fare}</Text>
                    {surgeMultiplier > 1.0 && <View style={{ backgroundColor: '#fff3e0', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginTop: 2 }}><Text style={{ color: '#e65100', fontSize: 10, fontWeight: '800' }}>⚡ {surgeMultiplier}x SURGE</Text></View>}
                  </View>
                </View>
                <View style={s.rideDetails}>
                  <Text style={s.rideFrom}>📍 {rideReq.pickup}</Text>
                  <Text style={s.rideDivider}>↓</Text>
                  <Text style={s.rideTo}>🎯 {rideReq.drop_location}</Text>
                </View>
                {rideReq.distance && <View style={{ backgroundColor: '#f5f5f5', borderRadius: 8, padding: 8, marginTop: 6, marginBottom: 2, flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: '#666', fontSize: 12 }}>📏 Distance: {rideReq.distance} km</Text><Text style={{ color: '#e94560', fontSize: 12, fontWeight: '600' }}>💰 Net: ₹{Math.round(rideReq.fare * 0.85)}</Text></View>}
                <CountdownBar seconds={20} onTimeout={rejectRide} />
                <View style={[s.rideActions, { marginTop: 12 }]}>
                  <Bouncy style={s.rejectBtn} onPress={rejectRide}><Text style={s.rejectTxt}>✕ Reject</Text></Bouncy>
                  <Bouncy style={s.acceptBtn} onPress={acceptRide} disabled={loading}><Text style={s.acceptTxt}>{loading ? '⏳' : '✓ Accept'}</Text></Bouncy>
                </View>
              </View>
            </SlideIn>
          )}

          {/* ─── HOURLY RIDE REQUEST ─── */}
          {hourlyRideReq && !activeRide && !activeHourlyRide && (
            <SlideIn>
              <View style={[s.rideCard, { borderLeftWidth: 4, borderLeftColor: '#e94560' }]}>
                <View style={s.rideHeader}>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <View style={{ backgroundColor: '#e94560', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>⏱️ HOURLY</Text></View>
                      <Text style={s.rideTitle}>{hourlyRideReq.package_hours >= 24 ? `${hourlyRideReq.package_hours/24} Day${hourlyRideReq.package_hours > 24?'s':''}` : hourlyRideReq.package_hours === 8 ? 'Full Day (8h)' : `${hourlyRideReq.package_hours} Hours`}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: '#888' }}>{hourlyRideReq.km_included} km included · {hourlyRideReq.is_roundtrip ? '🔄 Round trip' : '➡️ One way'}</Text>
                  </View>
                  <Text style={s.rideFare}>₹{hourlyRideReq.base_fare}</Text>
                </View>
                <View style={s.rideDetails}>
                  <Text style={s.rideFrom}>📍 {hourlyRideReq.pickup}</Text>
                  {hourlyRideReq.drop_location && <><Text style={s.rideDivider}>↓</Text><Text style={s.rideTo}>🎯 {hourlyRideReq.drop_location}</Text></>}
                  {!hourlyRideReq.drop_location && <Text style={[s.rideTo, { color: '#999' }]}>📍 Drop: Flexible</Text>}
                </View>
                {hourlyRideReq.scheduled_at && (
                  <View style={{ backgroundColor: '#e3f2fd', borderRadius: 8, padding: 8, marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 14 }}>📅</Text>
                    <Text style={{ color: '#1565c0', fontSize: 12, fontWeight: '700' }}>SCHEDULED: {new Date(hourlyRideReq.scheduled_at).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</Text>
                  </View>
                )}
                <View style={{ backgroundColor: '#e8f5e9', borderRadius: 8, padding: 8, marginTop: 6, marginBottom: 4 }}>
                  <Text style={{ color: '#2e7d32', fontSize: 11, fontWeight: '600' }}>💰 Aapki kamai: ₹{Math.round(parseFloat(hourlyRideReq.base_fare || 0) * 0.88).toFixed(0)} (12% commission, wallet se guaranteed)</Text>
                </View>
                {!hourlyRideReq.scheduled_at && <CountdownBar seconds={25} onTimeout={() => setHourlyRideReq(null)} />}
                <View style={[s.rideActions, { marginTop: 12 }]}>
                  <Bouncy style={s.rejectBtn} onPress={() => setHourlyRideReq(null)}><Text style={s.rejectTxt}>✕ Skip</Text></Bouncy>
                  <Bouncy style={s.acceptBtn} onPress={acceptHourlyRide} disabled={loading}><Text style={s.acceptTxt}>{loading ? '...' : '✓ Accept'}</Text></Bouncy>
                </View>
              </View>
            </SlideIn>
          )}

          {/* ─── ACTIVE HOURLY RIDE ─── */}
          {activeHourlyRide && (
            <View style={[s.tripCard, { borderLeftWidth: 4, borderLeftColor: '#e94560' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ backgroundColor: '#e94560', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>⏱️ HOURLY TRIP</Text></View>
                {activeHourlyRide.status === 'active' && (
                  <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1a1a2e', fontVariant: ['tabular-nums'] }}>
                    {String(Math.floor(hourlyTimerSec/3600)).padStart(2,'0')}:{String(Math.floor((hourlyTimerSec%3600)/60)).padStart(2,'0')}:{String(hourlyTimerSec%60).padStart(2,'0')}
                  </Text>
                )}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ color: '#666', fontSize: 13 }}>{activeHourlyRide.package_hours === 8 ? 'Full Day' : `${activeHourlyRide.package_hours}h`} · {activeHourlyRide.km_included} km · ₹{activeHourlyRide.base_fare}</Text>
                <Text style={{ color: activeHourlyRide.status === 'active' ? '#4CAF50' : '#e94560', fontSize: 12, fontWeight: '600' }}>
                  {activeHourlyRide.status === 'matched' ? '🚗 Pickup pe jao' : '🛣️ Trip chal rahi hai'}
                </Text>
              </View>

              <View style={s.tripRoute}>
                <Text style={s.tripFrom}>📍 {activeHourlyRide.pickup}</Text>
                {activeHourlyRide.drop_location && <><Text style={s.tripArrow}>↓</Text><Text style={s.tripTo}>🎯 {activeHourlyRide.drop_location}</Text></>}
              </View>

              {activeHourlyRide.status === 'matched' && (
                <View style={{ marginTop: 10 }}>
                  <Text style={{ fontSize: 12, color: '#666', marginBottom: 8, textAlign: 'center' }}>🔐 Customer se OTP poocho (woh app mein dekh rahe hain)</Text>
                  <TextInput style={{ borderWidth: 2, borderColor: '#1a1a2e', borderRadius: 10, padding: 14, fontSize: 24, textAlign: 'center', letterSpacing: 8, marginBottom: 10, fontWeight: 'bold', backgroundColor: '#fff' }} placeholder="0000" keyboardType="number-pad" maxLength={4} value={hourlyOtpInput} onChangeText={setHourlyOtpInput} />
                  <Bouncy style={s.tripBtn} onPress={startHourlyTrip} disabled={loading}><Text style={s.tripBtnTxt}>{loading ? '...' : '🚀 OTP Verify & Trip Shuru'}</Text></Bouncy>
                  <TouchableOpacity style={s.navBtn} onPress={() => activeHourlyRide.pickup_lat ? undefined : undefined}>
                    <Text style={{ color: '#fff', fontWeight: '600' }} onPress={() => Linking.openURL(`google.navigation:q=${encodeURIComponent(activeHourlyRide.pickup)}`).catch(() => Linking.openURL(`https://maps.google.com/?daddr=${encodeURIComponent(activeHourlyRide.pickup)}`))}>🗺️ Pickup Navigate Karo</Text>
                  </TouchableOpacity>
                </View>
              )}

              {activeHourlyRide.status === 'active' && (
                <View style={{ marginTop: 10 }}>
                  {/* KM + Time progress bars */}
                  <View style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                      <Text style={{ fontSize: 12, color: '#666' }}>📍 {liveKm.toFixed(1)} / {activeHourlyRide.km_included} km</Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: liveKm / (activeHourlyRide.km_included||1) > 0.9 ? '#e94560' : liveKm / (activeHourlyRide.km_included||1) > 0.8 ? '#ff9800' : '#2e7d32' }}>
                        {Math.max(0, (activeHourlyRide.km_included||0) - liveKm).toFixed(1)} km bache
                      </Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: liveKm / (activeHourlyRide.km_included||1) > 0.9 ? '#e94560' : liveKm / (activeHourlyRide.km_included||1) > 0.8 ? '#ff9800' : '#4CAF50', width: `${Math.min(100, (liveKm / (activeHourlyRide.km_included||1)) * 100)}%` as any }} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                      <Text style={{ fontSize: 12, color: '#666' }}>⏱️ {String(Math.floor(hourlyTimerSec/3600)).padStart(2,'0')}:{String(Math.floor((hourlyTimerSec%3600)/60)).padStart(2,'0')} elapsed</Text>
                      <Text style={{ fontSize: 12, color: '#666' }}>
                        {(() => { const rem = Math.max(0, parseFloat(activeHourlyRide.package_hours||0)*3600 - hourlyTimerSec); return rem > 0 ? `${String(Math.floor(rem/3600)).padStart(2,'0')}:${String(Math.floor((rem%3600)/60)).padStart(2,'0')} bache` : '⚠️ Time up!'; })()}
                      </Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: '#1a1a2e', width: `${Math.min(100, (hourlyTimerSec / ((parseFloat(activeHourlyRide.package_hours||1))*3600)) * 100)}%` as any }} />
                    </View>
                    {liveKm / (activeHourlyRide.km_included||1) > 0.8 && (
                      <View style={{ backgroundColor: '#fff3e0', borderRadius: 8, padding: 8 }}>
                        <Text style={{ color: '#e65100', fontSize: 12, fontWeight: '700' }}>⚠️ {Math.max(0, (activeHourlyRide.km_included||0) - liveKm).toFixed(1)} km bache — extra charges lagengen!</Text>
                      </View>
                    )}
                  </View>

                  <View style={{ backgroundColor: '#e8f5e9', borderRadius: 8, padding: 8, marginBottom: 10 }}>
                    <Text style={{ color: '#2e7d32', fontSize: 12 }}>💰 Guaranteed: ₹{Math.round(parseFloat(activeHourlyRide.base_fare || 0) * 0.70 * 0.88).toFixed(0)} min · Full milne par ₹{Math.round(parseFloat(activeHourlyRide.base_fare || 0) * 0.88).toFixed(0)}</Text>
                  </View>

                  {/* Return trip navigation — driver navigates back to original pickup */}
                  {activeHourlyRide.is_roundtrip && (
                    <TouchableOpacity
                      style={{ backgroundColor: '#e3f2fd', borderRadius: 12, padding: 13, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}
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
                        <Text style={{ fontWeight: '700', color: '#1565c0', fontSize: 14 }}>Return — Pickup Navigate Karo</Text>
                        <Text style={{ color: '#888', fontSize: 11, marginTop: 2 }} numberOfLines={1}>📍 {activeHourlyRide.pickup}</Text>
                      </View>
                      <Text style={{ color: '#1565c0', fontSize: 18 }}>›</Text>
                    </TouchableOpacity>
                  )}

                  {/* Extension request from customer */}
                  {!!activeHourlyRide.extend_requested_hours && (
                    <View style={{ backgroundColor: '#e3f2fd', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                      {(() => {
                        const dec = parseFloat(activeHourlyRide.extend_requested_hours);
                        const hrs = Math.floor(dec);
                        const mins = Math.round((dec - hrs) * 60);
                        const label = hrs > 0 && mins > 0 ? `${hrs}h ${mins}m` : hrs > 0 ? `${hrs}h` : `${mins} min`;
                        return <Text style={{ fontWeight: 'bold', color: '#1565c0', marginBottom: 4 }}>📅 Customer +{label} Extend Chahta Hai</Text>;
                      })()}
                      <Text style={{ fontSize: 12, color: '#555', marginBottom: 10 }}>Agree karne se trip extend hogi — paise escrow mein hain</Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Bouncy style={{ flex: 1, backgroundColor: '#4CAF50', borderRadius: 10, padding: 12, alignItems: 'center' }} onPress={acceptExtend}><Text style={{ color: '#fff', fontWeight: 'bold' }}>✅ Accept</Text></Bouncy>
                        <Bouncy style={{ flex: 1, backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, alignItems: 'center' }} onPress={rejectExtend}><Text style={{ color: '#333', fontWeight: 'bold' }}>✗ Reject</Text></Bouncy>
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
                        <View style={{ backgroundColor: '#fff3e0', borderRadius: 12, padding: 14, marginTop: 10 }}>
                          <Text style={{ fontWeight: 'bold', color: '#e65100', marginBottom: 6 }}>⚠️ Customer Trip Khatam Karna Chahta Hai</Text>
                          <Text style={{ color: '#666', fontSize: 12, marginBottom: 10 }}>Agree karne par actual time ke hisaab se proportional payment milegi.</Text>
                          <View style={{ flexDirection: 'row', gap: 10 }}>
                            <Bouncy style={{ flex: 1, backgroundColor: '#4CAF50', borderRadius: 10, padding: 12, alignItems: 'center' }} onPress={confirmHourlyEarlyEnd} disabled={hEarlyEndLoading}><Text style={{ color: '#fff', fontWeight: 'bold' }}>✅ Agree</Text></Bouncy>
                            <Bouncy style={{ flex: 1, backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, alignItems: 'center' }} onPress={rejectHourlyEarlyEnd}><Text style={{ color: '#333', fontWeight: 'bold' }}>✗ Reject</Text></Bouncy>
                          </View>
                        </View>
                      ) : activeHourlyRide.early_end_requested_by === 'driver' ? (
                        <View style={{ backgroundColor: '#fff3e0', borderRadius: 10, padding: 10, alignItems: 'center', marginTop: 8 }}>
                          <Text style={{ color: '#e65100', fontSize: 12 }}>⏳ Customer ke confirm ka intezaar...</Text>
                        </View>
                      ) : (activeHourlyRide.early_end_reject_count || 0) >= 2 ? (
                        <View style={{ backgroundColor: '#ffebee', borderRadius: 10, padding: 10, alignItems: 'center', marginTop: 8 }}>
                          <Text style={{ color: '#c62828', fontSize: 12, fontWeight: '700' }}>🔒 2 baar reject — Support se contact karo</Text>
                        </View>
                      ) : activeHourlyRide.early_end_last_rejected_at && (Date.now() - new Date(activeHourlyRide.early_end_last_rejected_at).getTime()) < 15 * 60 * 1000 ? (
                        <View style={{ backgroundColor: '#f5f5f5', borderRadius: 10, padding: 10, alignItems: 'center', marginTop: 8 }}>
                          <Text style={{ color: '#999', fontSize: 12 }}>⏳ {Math.ceil((15 * 60 * 1000 - (Date.now() - new Date(activeHourlyRide.early_end_last_rejected_at).getTime())) / 60000)} min baad phir request</Text>
                        </View>
                      ) : (
                        <Bouncy style={[s.cancelBtn, { borderColor: '#ff9800', borderWidth: 1, marginTop: 8 }]} onPress={requestHourlyEarlyEnd} disabled={hEarlyEndLoading}>
                          <Text style={[s.cancelTxt, { color: '#ff9800' }]}>⏹️ Early End Request (mutual agreement)</Text>
                        </Bouncy>
                      )
                    );

                    // State 1: Legacy pending customer confirm
                    if (activeHourlyRide.pending_customer_confirm) return (
                      <View style={{ backgroundColor: '#fff3e0', borderRadius: 12, padding: 14, marginBottom: 10, alignItems: 'center' }}>
                        <Text style={{ fontWeight: 'bold', color: '#e65100', marginBottom: 4 }}>⏳ Customer Confirmation Ka Intezaar...</Text>
                        <Text style={{ fontSize: 12, color: '#888' }}>10 min mein auto-confirm ho jayega</Text>
                      </View>
                    );

                    // State 2: 20-min startup lock
                    if (hourlyTimerSec < 20 * 60) return (
                      <View style={{ backgroundColor: '#f5f5f5', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10 }}>
                        <Text style={{ color: '#999', fontWeight: '700', fontSize: 14 }}>🔒 Startup: {Math.ceil(20 - hourlyTimerSec / 60)} min aur</Text>
                        <Text style={{ color: '#bbb', fontSize: 11, marginTop: 3 }}>Trip start ke baad 20 min ka lock</Text>
                      </View>
                    );

                    // State 3: Package time still remaining — locked, show early end option
                    if (remSec > 0) return (
                      <View style={{ marginBottom: 10 }}>
                        <View style={{ backgroundColor: '#e3f2fd', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#90caf9' }}>
                          <Text style={{ color: '#1565c0', fontWeight: '800', fontSize: 18, marginBottom: 4 }}>⏰ {remStr} Baaki</Text>
                          <Text style={{ color: '#1565c0', fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
                            Package time poori hone par hi{'\n'}Complete button aayega
                          </Text>
                        </View>
                        <EarlyEndSection />
                      </View>
                    );

                    // State 4: Time complete — show complete button
                    return (
                      <Bouncy style={[s.tripBtn, { backgroundColor: '#4CAF50', marginBottom: 10 }]} onPress={completeHourlyTrip} disabled={loading}>
                        <Text style={s.tripBtnTxt}>{loading ? '...' : '✅ Trip Complete Karo'}</Text>
                      </Bouncy>
                    );
                  })()}
                </View>
              )}
            </View>
          )}

          {!activeRide && !rideReq && !activeHourlyRide && !hourlyRideReq && (
            <View style={s.statusCard}><Text style={s.statusText}>{isOnline ? '✅ Online hain — rides ka intezaar...' : '💤 Online ho jao rides lene ke liye'}</Text></View>
          )}
          {result && !activeRide && !rideReq ? <Text style={s.result}>{result}</Text> : null}

          {/* Rules & Info */}
          {!activeRide && !activeHourlyRide && (
            <View style={{ marginTop: 10 }}>
              <View style={{ backgroundColor: '#f8f9fa', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#e0e0e0' }}>
                <Text style={{ color: '#1a1a2e', fontSize: 14, fontWeight: '800', marginBottom: 10 }}>📋 Standard Rides — Rules & Fees</Text>
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
                    <Text style={{ color: '#e94560', fontSize: 12, fontWeight: '700', width: 100 }}>{icon}</Text>
                    <Text style={{ color: '#555', fontSize: 11, flex: 1, lineHeight: 16 }}>{text}</Text>
                  </View>
                ))}
              </View>
              <View style={{ backgroundColor: '#1a1a2e', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#2a2a4e' }}>
                <Text style={{ color: '#e94560', fontSize: 14, fontWeight: '800', marginBottom: 10 }}>⏱️ Hourly / Daily — Rules & Fees</Text>
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
                    <Text style={{ color: '#e94560', fontSize: 11, fontWeight: '700', width: 105 }}>{icon}</Text>
                    <Text style={{ color: '#ccc', fontSize: 11, flex: 1, lineHeight: 16 }}>{text}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </View>
      <View style={s.navFloat}><BottomNav activeTab={activeTab} setActiveTab={setActiveTab} rideReq={rideReq} hourlyRideReq={hourlyRideReq} /></View>
    </KeyboardAvoidingView>
  );

  // ═══ EARNINGS TAB ═══
  if (activeTab === 'earnings') {
    if (!walletLoaded) { loadDriverWallet(phone); loadBonusToday(phone); }
    const fmtDate = (d: string) => { try { return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return d; } };
    return (
    <View style={s.screen}>
      {/* Dark header */}
      <View style={{ backgroundColor: '#1a1a2e', paddingTop: 52, paddingBottom: 20, paddingHorizontal: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', flex: 1 }}>💰 Wallet & Earnings</Text>
          <TouchableOpacity onPress={() => loadDriverWallet(phone)} style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10 }}>
            <Text style={{ fontSize: 16 }}>⟳</Text>
          </TouchableOpacity>
        </View>
        {/* 3-stat grid */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, alignItems: 'center' }}>
            <Text style={{ color: '#4CAF50', fontSize: 22, fontWeight: '900' }}>₹{parseFloat(driverWallet.balance || 0).toFixed(0)}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, marginTop: 3, textAlign: 'center' }}>Wallet Balance</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, alignItems: 'center' }}>
            <Text style={{ color: '#FFD700', fontSize: 22, fontWeight: '900' }}>₹{parseFloat(driverWallet.total_earned || 0).toFixed(0)}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, marginTop: 3, textAlign: 'center' }}>Life Earned</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, alignItems: 'center' }}>
            <CountUp value={earnings} style={{ color: '#e94560', fontSize: 22, fontWeight: '900' }} />
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, marginTop: 3, textAlign: 'center' }}>Aaj Ki Kamai</Text>
          </View>
        </View>
      </View>

      {(rideReq || hourlyRideReq) && (
        <TouchableOpacity style={s.notifBanner} onPress={() => setActiveTab('home')}>
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>{hourlyRideReq ? '⏱️ Hourly Ride!' : '🔔 Nayi Ride!'} ₹{(rideReq || hourlyRideReq)?.fare || hourlyRideReq?.base_fare}</Text>
          <Text style={{ color: '#fff', fontSize: 13 }}>Dekho →</Text>
        </TouchableOpacity>
      )}

      {/* Tabs */}
      <View style={{ flexDirection: 'row', margin: 14, gap: 8 }}>
        {(['summary', 'rides', 'hourly'] as const).map(t => (
          <TouchableOpacity key={t} onPress={() => setWalletEarningsTab(t)}
            style={{ flex: 1, borderRadius: 20, paddingVertical: 8, alignItems: 'center', backgroundColor: walletEarningsTab === t ? '#1a1a2e' : '#f0f0f0' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: walletEarningsTab === t ? '#fff' : '#888', textTransform: 'capitalize' }}>{t === 'summary' ? 'Summary' : t === 'rides' ? 'Rides' : 'Hourly'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 14 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>

        {walletEarningsTab === 'summary' && (<>
          <View style={s.earningsCard}>
            <Row k="Total Rides (All Time)" v={driverRideHistory.length.toString()} />
            <Row k="Hourly Rides" v={driverHourlyHistory.length.toString()} />
            <Row k="Aaj Ke Rides" v={rides.toString()} />
            <Row k="Avg Per Ride" v={'₹' + (rides ? (earnings/rides).toFixed(0) : 0)} />
            <Row k="Platform Fee (15%)" v={'₹' + (earnings * 0.15).toFixed(0)} />
            <Row k="Aaj Ki Net Kamai" v={'₹' + (earnings * 0.85).toFixed(0)} bold last />
          </View>
          <View style={{ backgroundColor: '#e8f5e9', borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <Text style={{ fontSize: 13, color: '#2e7d32', fontWeight: '700', marginBottom: 4 }}>💡 Commission Structure</Text>
            <Text style={{ fontSize: 12, color: '#4CAF50', lineHeight: 18 }}>Standard rides: 15% platform fee{'\n'}Hourly rides: 12% platform fee{'\n'}Early end: dono ki agreement zaroori — proportional payment</Text>
          </View>
          {/* Payout */}
          <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, elevation: 2, marginBottom: 14 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#1a1a2e', marginBottom: 12 }}>💸 Payout Request</Text>
            <Text style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Available: ₹{parseFloat(driverWallet.balance || 0).toFixed(0)} · Min ₹100</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput
                style={{ flex: 1, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: '#1a1a2e' }}
                placeholder="Enter amount (₹)"
                keyboardType="numeric"
                value={payoutInput}
                onChangeText={setPayoutInput}
                placeholderTextColor="#bbb"
              />
              <TouchableOpacity onPress={requestPayout}
                style={{ backgroundColor: payoutLoading ? '#ccc' : '#4CAF50', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Request</Text>
              </TouchableOpacity>
            </View>
            {result ? <Text style={{ color: result.includes('✅') ? '#4CAF50' : '#e94560', marginTop: 8, fontWeight: '600' }}>{result}</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
            {[100, 200, 500, 1000].map(a => (
              <TouchableOpacity key={a} onPress={() => setPayoutInput(a.toString())}
                style={{ flex: 1, backgroundColor: '#f5f5f5', borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}>
                <Text style={{ color: '#1a1a2e', fontWeight: '700', fontSize: 13 }}>₹{a}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Daily Bonus Target Card ── */}
          <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, elevation: 2, marginTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 20, marginRight: 8 }}>🎯</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#1a1a2e', flex: 1 }}>Daily Bonus Targets</Text>
              <TouchableOpacity onPress={() => loadBonusToday(phone)} style={{ padding: 4 }}><Text style={{ fontSize: 16 }}>⟳</Text></TouchableOpacity>
            </View>
            {[{rides:5,bonus:30,tier:1},{rides:10,bonus:50,tier:2},{rides:15,bonus:100,tier:3}].map(t => {
              const isClaimed = (bonusData?.claimed_tiers || []).includes(t.tier);
              const isUnlocked = (bonusData?.rides_today || 0) >= t.rides;
              const isAvail = (bonusData?.available_bonuses || []).some((b: any) => b.tier === t.tier);
              return (
                <View key={t.tier} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isClaimed ? '#e8f5e9' : isUnlocked ? '#fff3e0' : '#f5f5f5', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Text style={{ fontSize: 16 }}>{isClaimed ? '✅' : isUnlocked ? '🔓' : '🔒'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1a1a2e' }}>{t.rides} rides today</Text>
                    <Text style={{ fontSize: 11, color: '#888', marginTop: 1 }}>Bonus: ₹{t.bonus} · ({bonusData?.rides_today || 0}/{t.rides})</Text>
                  </View>
                  {isAvail ? (
                    <TouchableOpacity onPress={() => claimBonus(t.tier)}
                      style={{ backgroundColor: '#4CAF50', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Claim ₹{t.bonus}</Text>
                    </TouchableOpacity>
                  ) : isClaimed ? (
                    <Text style={{ fontSize: 12, color: '#4CAF50', fontWeight: '700' }}>Claimed!</Text>
                  ) : (
                    <Text style={{ fontSize: 11, color: '#bbb' }}>{t.rides - (bonusData?.rides_today || 0)} aur</Text>
                  )}
                </View>
              );
            })}
            <Text style={{ fontSize: 11, color: '#888', marginTop: 10, textAlign: 'center' }}>Aaj ke rides se unlock hote hain — raat 12 baje reset</Text>
          </View>

          {/* ── How Hourly Works ── */}
          <View style={{ backgroundColor: '#1a1a2e', borderRadius: 14, padding: 16, marginTop: 10 }}>
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
                <Text style={{ color: '#e94560', fontSize: 12, fontWeight: '700', width: 90 }}>{icon}</Text>
                <Text style={{ color: '#ccc', fontSize: 11, flex: 1, lineHeight: 16 }}>{text}</Text>
              </View>
            ))}
          </View>
        </>)}

        {walletEarningsTab === 'rides' && (<>
          {driverRideHistory.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Text style={{ fontSize: 36 }}>🛺</Text>
              <Text style={{ color: '#bbb', marginTop: 10 }}>Koi completed ride nahi mili</Text>
            </View>
          ) : driverRideHistory.map((r: any, i: number) => (
            <View key={r.id || i} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, elevation: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#1a1a2e' }}>{r.passenger_name || 'Passenger'}</Text>
                  <Text style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{fmtDate(r.created_at)} · {r.payment_method}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: '#4CAF50', fontSize: 16, fontWeight: '800' }}>₹{parseFloat(r.fare || 0).toFixed(0)}</Text>
                  <Text style={{ color: '#bbb', fontSize: 10 }}>Net: ₹{(parseFloat(r.fare || 0) * 0.85).toFixed(0)}</Text>
                </View>
              </View>
            </View>
          ))}
        </>)}

        {walletEarningsTab === 'hourly' && (<>
          {driverHourlyHistory.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Text style={{ fontSize: 36 }}>⏱️</Text>
              <Text style={{ color: '#bbb', marginTop: 10 }}>Koi hourly ride nahi mili</Text>
            </View>
          ) : driverHourlyHistory.map((h: any, i: number) => (
            <View key={h.id || i} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, elevation: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#1a1a2e' }}>{h.vehicle_type} · {h.package_hours}h Package</Text>
                  <Text style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{h.customer_phone} · {fmtDate(h.created_at)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: '#4CAF50', fontSize: 16, fontWeight: '800' }}>₹{parseFloat(h.driver_earning || h.base_fare || 0).toFixed(0)}</Text>
                  <Text style={{ color: '#bbb', fontSize: 10 }}>Base: ₹{parseFloat(h.base_fare || 0).toFixed(0)}</Text>
                </View>
              </View>
            </View>
          ))}
        </>)}

      </ScrollView>
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} rideReq={rideReq} hourlyRideReq={hourlyRideReq} />
    </View>
  );
  }

  // ═══ PROFILE TAB ═══
  return (
    <View style={s.screen}>
      <View style={s.topBar}><Text style={s.greeting}>👤 Profile</Text></View>
      {rideReq && <TouchableOpacity style={s.notifBanner} onPress={() => setActiveTab('home')}><Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>🔔 Nayi Ride! ₹{rideReq.fare}</Text><Text style={{ color: '#fff', fontSize: 13 }}>Dekho →</Text></TouchableOpacity>}
      <ScrollView style={{ flex: 1, padding: 16 }}>
        <View style={s.profileHero}>
          <View style={s.profileAvatar}><Text style={{ color: '#fff', fontSize: 36, fontWeight: 'bold' }}>{(driverInfo?.name || selectedDriver?.name || 'D')[0].toUpperCase()}</Text></View>
          <Text style={s.profileName}>{driverInfo?.name || selectedDriver?.name}</Text>
          <Text style={s.profilePhone}>+91 {phone}</Text>
          <Text style={s.profileVehicle}>{driverInfo?.vehicle_type || selectedDriver?.type} · {driverInfo?.vehicle_no || selectedDriver?.vehicle}</Text>
          <View style={s.badge}><Text style={{ color: '#fff', fontWeight: 'bold' }}>⭐ {driverInfo?.rating || '4.8'}</Text></View>
        </View>
        {/* UPI ID Section */}
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#1a1a2e', marginBottom: 4 }}>📱 Mera UPI ID</Text>
          <Text style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Customer aapka QR scan karke seedha pay karega</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={{ flex: 1, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#1a1a2e' }}
              placeholder="yourname@upi / 9999@paytm"
              value={upiInput}
              onChangeText={setUpiInput}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor="#bbb"
            />
            <TouchableOpacity onPress={saveUpiId}
              style={{ backgroundColor: upiSaving ? '#ccc' : '#1a1a2e', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Save</Text>
            </TouchableOpacity>
          </View>
          {driverUpiId ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6, backgroundColor: '#e8f5e9', borderRadius: 8, padding: 8 }}>
              <Text style={{ fontSize: 14 }}>✅</Text>
              <Text style={{ fontSize: 12, color: '#2e7d32', fontWeight: '600', flex: 1 }}>{driverUpiId}</Text>
            </View>
          ) : null}
          {result && result.includes('UPI') ? <Text style={{ color: result.includes('✅') ? '#4CAF50' : '#e94560', marginTop: 6, fontSize: 12 }}>{result}</Text> : null}
        </View>

        {/* Referral Section */}
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#1a1a2e', marginBottom: 4 }}>🎁 Refer & Earn</Text>
          <Text style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Dosto ko refer karo — dono ko ₹50 wallet bonus milega</Text>
          {referralInfo ? (
            <View>
              <View style={{ backgroundColor: '#1a1a2e', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ color: '#aaa', fontSize: 11, marginBottom: 4 }}>Aapka Referral Code</Text>
                <Text style={{ color: '#FFD700', fontSize: 24, fontWeight: '900', letterSpacing: 4 }}>{referralInfo.code}</Text>
              </View>
              <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#1a1a2e' }}>{referralInfo.total_referrals}</Text>
                  <Text style={{ fontSize: 10, color: '#999' }}>Referrals</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#4CAF50' }}>₹{referralInfo.total_earned}</Text>
                  <Text style={{ fontSize: 10, color: '#999' }}>Earned</Text>
                </View>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: '#e94560', borderRadius: 10, padding: 12, alignItems: 'center' }}
                onPress={() => Share.share({ message: `RideApp pe join karo! Mera referral code use karo: ${referralInfo.code}\nDono ko ₹50 wallet bonus milega! 🎁`, title: 'RideApp Referral' })}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>📤 Code Share Karo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={{ backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, alignItems: 'center' }}
              onPress={loadReferralInfo}>
              <Text style={{ color: '#666', fontSize: 13 }}>🔑 Code Generate Karo</Text>
            </TouchableOpacity>
          )}
        </View>

        {[['📋','Documents','License, RC'],['🏦','Bank Details','Payout account'],['📞','Support','24x7 help'],['⚙️','Settings','Preferences']].map(([icon,title,sub],i) => (
          <Bouncy key={i} style={s.menuItem} onPress={() => {}}>
            <Text style={{ fontSize: 22, marginRight: 14 }}>{icon}</Text>
            <View style={{ flex: 1 }}><Text style={{ fontSize: 15, color: '#1a1a2e', fontWeight: '500' }}>{title}</Text><Text style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{sub}</Text></View>
            <Text style={{ fontSize: 20, color: '#ccc' }}>›</Text>
          </Bouncy>
        ))}
        <Bouncy style={s.logoutBtn} onPress={async () => { await AsyncStorage.removeItem('driverPhone'); await AsyncStorage.removeItem('driverInfo'); setScreen('login'); setIsOnline(false); stopPolling(); setDriverInfo(null); setPhone(''); }}>
          <Text style={{ color: '#e94560', fontWeight: 'bold', fontSize: 15 }}>🚪 Logout</Text>
        </Bouncy>
      </ScrollView>
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} rideReq={rideReq} hourlyRideReq={hourlyRideReq} />
    </View>
  );
}

function Row({ k, v, bold, last }: any) {
  return (
    <View style={[s.earningsRow, last && { borderBottomWidth: 0 }]}>
      <Text style={[s.earningsKey, bold && { fontWeight: 'bold' }]}>{k}</Text>
      <Text style={[s.earningsVal, bold && { color: '#4CAF50', fontWeight: 'bold' }]}>{v}</Text>
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

function BottomNav({ activeTab, setActiveTab, rideReq, hourlyRideReq }: any) {
  const tabs = [
    { t: 'home',     icon: '🏠', lbl: 'Home'    },
    { t: 'earnings', icon: '💰', lbl: 'Kamai'   },
    { t: 'profile',  icon: '👤', lbl: 'Profile' },
  ];
  const hasBadge = rideReq || hourlyRideReq;
  return (
    <View style={s.nav}>
      {tabs.map(({ t, icon, lbl }) => {
        const active = activeTab === t;
        return (
          <TouchableOpacity key={t} style={s.navItem} onPress={() => setActiveTab(t)} activeOpacity={0.65}>
            <View style={{ position: 'relative', alignItems: 'center' }}>
              <Text style={[s.navIcon, active && s.navIconActive]}>{icon}</Text>
              {t === 'home' && hasBadge && <View style={s.navDot} />}
            </View>
            <Text style={[s.navLbl, active && s.navActive]}>{lbl}</Text>
            {active && <View style={s.navLine} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  screen:          { flex:1, backgroundColor:'#f5f5f5' },
  mapFit:          { height: 220, width: '100%', backgroundColor: '#e8eaed' },
  mapFull:         { position:'absolute', top:0, left:0, right:0, bottom:0 },
  topOverlay:      { position:'absolute', top:0, left:0, right:0, paddingTop:44, paddingHorizontal:14 },
  topGlass:        { flexDirection:'row', alignItems:'center', backgroundColor:'rgba(255,255,255,0.95)', borderRadius:16, padding:12, elevation:6, shadowColor:'#000', shadowOpacity:0.1, shadowRadius:8 },
  greetingDark:    { color:'#1a1a2e', fontSize:15, fontWeight:'bold' },
  subTxtDark:      { color:'#666', fontSize:11, marginTop:2 },
  bottomSheet:     { position:'absolute', bottom:0, left:0, right:0, backgroundColor:'#fff', borderTopLeftRadius:24, borderTopRightRadius:24, padding:16, paddingTop:8, elevation:12, shadowColor:'#000', shadowOpacity:0.15, shadowRadius:12 },
  sheetHandle:     { width:40, height:4, borderRadius:2, backgroundColor:'#ddd', alignSelf:'center', marginBottom:12 },
  navFloat:        { position:'absolute', bottom:0, left:0, right:0 },
  chatBadge:       { position:'absolute', top:-6, right:-10, backgroundColor:'#e94560', borderRadius:9, minWidth:18, height:18, alignItems:'center', justifyContent:'center', paddingHorizontal:4 },
  hero:            { backgroundColor:'#1a1a2e', alignItems:'center', padding:50, paddingBottom:40 },
  heroIcon:        { fontSize:60 },
  heroTitle:       { color:'#fff', fontSize:28, fontWeight:'bold', marginTop:10 },
  heroSub:         { color:'#aaa', fontSize:14, marginTop:6 },
  sectionTitle:    { fontSize:16, fontWeight:'bold', color:'#1a1a2e', marginBottom:12 },
  driverItem:      { flexDirection:'row', alignItems:'center', backgroundColor:'#fff', borderRadius:14, padding:16, marginBottom:10, elevation:2, borderWidth:2, borderColor:'transparent' },
  driverItemActive:{ backgroundColor:'#1a1a2e', borderColor:'#e94560' },
  driverItemIcon:  { fontSize:28, marginRight:14 },
  driverItemName:  { fontSize:16, fontWeight:'bold', color:'#1a1a2e' },
  driverItemVehicle:{ fontSize:13, color:'#666', marginTop:2 },
  btn:             { backgroundColor:'#e94560', borderRadius:12, padding:16, alignItems:'center', marginTop:16, marginBottom:10 },
  btnTxt:          { color:'#fff', fontSize:16, fontWeight:'bold' },
  err:             { textAlign:'center', color:'#e94560', marginVertical:10 },
  topBar:          { backgroundColor:'#1a1a2e', flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:16, paddingTop:48 },
  greeting:        { color:'#fff', fontSize:18, fontWeight:'bold' },
  subTxt:          { color:'#aaa', fontSize:12, marginTop:2 },
  notifBanner:     { backgroundColor:'#e94560', padding:12, flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  statsRow:        { flexDirection:'row', gap:10, marginBottom:16 },
  statCard:        { flex:1, backgroundColor:'#fff', borderRadius:16, padding:16, alignItems:'center', elevation:3, shadowColor:'#000', shadowOpacity:0.06, shadowRadius:8 },
  statIcon:        { fontSize:22 },
  statValue:       { fontSize:22, fontWeight:'bold', color:'#1a1a2e', marginTop:4 },
  statLabel:       { fontSize:10, color:'#999', marginTop:3, letterSpacing:0.3 },
  targetCard:      { backgroundColor:'#fff', borderRadius:14, padding:16, marginBottom:14, elevation:2 },
  statusCard:      { backgroundColor:'#fff', borderRadius:14, padding:16, marginBottom:16, elevation:2 },
  statusText:      { fontSize:14, color:'#333', textAlign:'center' },
  tripCard:        { backgroundColor:'#fff', borderRadius:16, padding:16, marginBottom:16, elevation:4, borderWidth:2, borderColor:'#4CAF50' },
  tripBadge:       { backgroundColor:'#4CAF50', borderRadius:8, padding:8, marginBottom:12 },
  tripBadgeTxt:    { color:'#fff', textAlign:'center', fontWeight:'bold', fontSize:14 },
  tripCustomer:    { flexDirection:'row', alignItems:'center', marginBottom:12 },
  tripAvatar:      { width:44, height:44, borderRadius:22, backgroundColor:'#1a1a2e', alignItems:'center', justifyContent:'center', marginRight:12 },
  tripCustName:    { fontSize:16, fontWeight:'bold', color:'#1a1a2e' },
  tripCustPhone:   { fontSize:13, color:'#666', marginTop:2 },
  tripFare:        { fontSize:20, fontWeight:'bold', color:'#4CAF50' },
  chatCallBtn:     { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', backgroundColor:'#f0f0f0', borderRadius:10, padding:10 },
  tripRoute:       { backgroundColor:'#f9f9f9', borderRadius:10, padding:12, marginBottom:12 },
  tripFrom:        { fontSize:14, color:'#4CAF50', fontWeight:'600' },
  tripArrow:       { fontSize:16, textAlign:'center', color:'#999', marginVertical:4 },
  tripTo:          { fontSize:14, color:'#e94560', fontWeight:'600' },
  tripBtn:         { backgroundColor:'#1a1a2e', borderRadius:10, padding:16, alignItems:'center', marginBottom:8 },
  tripBtnTxt:      { color:'#fff', fontWeight:'bold', fontSize:15 },
  navBtn:          { backgroundColor:'#2196F3', borderRadius:10, padding:12, alignItems:'center', marginBottom:10 },
  rangeWarn:       { backgroundColor:'#fff3e0', borderRadius:10, padding:12, marginBottom:10, borderWidth:1, borderColor:'#ffe0b2' },
  cancelBtn:       { padding:12, alignItems:'center' },
  cancelTxt:       { color:'#e94560', fontWeight:'600' },
  rideCard:        { backgroundColor:'#fff', borderRadius:20, padding:18, marginBottom:16, elevation:8, borderWidth:0, shadowColor:'#e94560', shadowOpacity:0.15, shadowRadius:16 },
  rideHeader:      { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10 },
  rideTitle:       { fontSize:16, fontWeight:'bold', color:'#1a1a2e' },
  rideFare:        { fontSize:22, fontWeight:'bold', color:'#e94560' },
  rideDetails:     { backgroundColor:'#f9f9f9', borderRadius:10, padding:12, marginBottom:4 },
  rideFrom:        { fontSize:14, color:'#4CAF50', fontWeight:'600' },
  rideDivider:     { fontSize:16, textAlign:'center', color:'#999', marginVertical:4 },
  rideTo:          { fontSize:14, color:'#e94560', fontWeight:'600' },
  rideActions:     { flexDirection:'row', gap:10 },
  rejectBtn:       { flex:1, padding:14, borderRadius:10, borderWidth:1, borderColor:'#e0e0e0', alignItems:'center' },
  rejectTxt:       { color:'#e94560', fontWeight:'bold' },
  acceptBtn:       { flex:2, padding:14, borderRadius:10, backgroundColor:'#4CAF50', alignItems:'center' },
  acceptTxt:       { color:'#fff', fontWeight:'bold', fontSize:15 },
  result:          { textAlign:'center', color:'#4CAF50', fontSize:14, marginTop:10, fontWeight:'600' },
  nav:             { flexDirection:'row', backgroundColor:'#fff', borderTopWidth:1, borderTopColor:'#f0f0f0', paddingBottom:16, paddingTop:8, elevation:16, shadowColor:'#000', shadowOpacity:0.1, shadowRadius:12 },
  navItem:         { flex:1, alignItems:'center', justifyContent:'center', paddingTop:2 },
  navIcon:         { fontSize:22, color:'#ccc' },
  navIconActive:   { color:'#e94560' },
  navLbl:          { fontSize:10, color:'#bbb', marginTop:3, letterSpacing:0.3 },
  navActive:       { color:'#e94560', fontWeight:'bold' },
  navDot:          { position:'absolute', top:-3, right:-10, width:9, height:9, borderRadius:4.5, backgroundColor:'#e94560', borderWidth:1.5, borderColor:'#fff' },
  navLine:         { width:20, height:3, borderRadius:2, backgroundColor:'#e94560', marginTop:4 },
  earningsHero:    { backgroundColor:'#1a1a2e', borderRadius:20, padding:32, alignItems:'center', marginBottom:16, elevation:6, shadowColor:'#1a1a2e', shadowOpacity:0.3, shadowRadius:16 },
  earningsAmount:  { color:'#fff', fontSize:44, fontWeight:'bold', letterSpacing:1 },
  earningsLabel:   { color:'#aaa', fontSize:13, marginTop:6, letterSpacing:0.5 },
  earningsCard:    { backgroundColor:'#fff', borderRadius:14, padding:16, marginBottom:16, elevation:2 },
  earningsRow:     { flexDirection:'row', justifyContent:'space-between', paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#f0f0f0' },
  earningsKey:     { fontSize:14, color:'#666' },
  earningsVal:     { fontSize:14, color:'#333', fontWeight:'500' },
  payoutBtn:       { backgroundColor:'#4CAF50', borderRadius:12, padding:16, alignItems:'center', marginBottom:30 },
  payoutTxt:       { color:'#fff', fontSize:16, fontWeight:'bold' },
  profileHero:     { backgroundColor:'#1a1a2e', borderRadius:16, padding:24, alignItems:'center', marginBottom:16 },
  profileAvatar:   { width:80, height:80, borderRadius:40, backgroundColor:'#e94560', alignItems:'center', justifyContent:'center', marginBottom:12 },
  profileName:     { color:'#fff', fontSize:22, fontWeight:'bold' },
  profilePhone:    { color:'#aaa', fontSize:14, marginTop:4 },
  profileVehicle:  { color:'#aaa', fontSize:13, marginTop:4 },
  badge:           { backgroundColor:'#f0a500', borderRadius:12, paddingVertical:4, paddingHorizontal:12, marginTop:8 },
  menuItem:        { flexDirection:'row', alignItems:'center', backgroundColor:'#fff', borderRadius:12, padding:14, marginBottom:8, elevation:1 },
  logoutBtn:       { borderWidth:1, borderColor:'#e94560', borderRadius:12, padding:14, alignItems:'center', marginTop:8, marginBottom:30 },
});

const rs = StyleSheet.create({
  regHeader:   { backgroundColor:'#1a1a2e', flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:16, paddingTop:48 },
  regTitle:    { color:'#fff', fontSize:16, fontWeight:'bold' },
  bigTitle:    { fontSize:26, fontWeight:'bold', color:'#1a1a2e', marginTop:10 },
  subTitle:    { fontSize:14, color:'#888', marginTop:6, marginBottom:10 },
  fieldLabel:  { fontSize:14, fontWeight:'600', color:'#333', marginTop:16, marginBottom:8 },
  input:       { borderWidth:1, borderColor:'#e0e0e0', borderRadius:10, padding:14, fontSize:16, backgroundColor:'#fff' },
  photoBox:    { borderWidth:2, borderColor:'#e0e0e0', borderStyle:'dashed', borderRadius:14, padding:16, alignItems:'center', backgroundColor:'#fafafa' },
  vehBox:      { flexDirection:'row', alignItems:'center', backgroundColor:'#fff', borderRadius:14, padding:18, marginBottom:12, elevation:2, borderWidth:2, borderColor:'transparent' },
  vehBoxActive:{ backgroundColor:'#1a1a2e', borderColor:'#e94560' },
  uploadBtn:   { flex:1, backgroundColor:'#1a1a2e', borderRadius:8, padding:10, alignItems:'center' },
  uploadBtnTxt:{ color:'#fff', fontWeight:'600', fontSize:13 },
  adviceBox:   { backgroundColor:'#e3f2fd', borderRadius:12, padding:14, marginTop:14, marginBottom:6 },
  adviceTitle: { fontSize:14, fontWeight:'bold', color:'#1565c0', marginBottom:6 },
  adviceText:  { fontSize:13, color:'#1976d2', marginTop:2 },
});

const cs = StyleSheet.create({
  bubble:    { maxWidth:'75%', borderRadius:14, padding:12, marginBottom:8 },
  mine:      { backgroundColor:'#e94560', alignSelf:'flex-end', borderBottomRightRadius:4 },
  theirs:    { backgroundColor:'#fff', alignSelf:'flex-start', borderBottomLeftRadius:4, elevation:1 },
  inputRow:  { flexDirection:'row', alignItems:'center', padding:10, paddingBottom:28, backgroundColor:'#fff', borderTopWidth:1, borderTopColor:'#f0f0f0' },
  input:     { flex:1, backgroundColor:'#f5f5f5', borderRadius:24, paddingHorizontal:16, paddingVertical:10, fontSize:14, marginRight:8 },
  send:      { width:44, height:44, borderRadius:22, backgroundColor:'#e94560', alignItems:'center', justifyContent:'center' },
});
