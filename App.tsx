import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Switch, TextInput, Animated, Linking, Vibration, KeyboardAvoidingView, Platform, BackHandler
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';

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

type Screen = 'login' | 'home';

export default function App() {
  const [screen, setScreen]         = useState<Screen>('login');
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
  const pollRef = useRef<any>(null);

  // Registration
  const [regStep, setRegStep]       = useState(0);
  const [regData, setRegData]       = useState<any>({ phone:'', vehicle_type:'', vehicle_no:'', dl_name:'', dl_photo:'', vehicle_photo:'', rc_photo:'', aadhaar_number:'', aadhaar_photo:'', face_photo:'' });
  const [uploading, setUploading]   = useState('');
  const [loginPhone, setLoginPhone] = useState('');
  const [loginOtp, setLoginOtp]     = useState('');
  const [loginOtpSent, setLoginOtpSent] = useState(false);
  const [loginOtpDigits, setLoginOtpDigits] = useState(['','','','','','']);
  const [loginResendTimer, setLoginResendTimer] = useState(60);
  const [loginCanResend, setLoginCanResend] = useState(false);
  const loginOtpRefs = useRef<any[]>([]);
  const [driverInfo, setDriverInfo] = useState<any>(null);

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
              if (data.driver.status === 'approved') setScreen('home');
            } else { if (savedInfo) setDriverInfo(JSON.parse(savedInfo)); setScreen('home'); }
          } catch (_e) { if (savedInfo) setDriverInfo(JSON.parse(savedInfo)); setScreen('home'); }
        }
      } catch (_e) {}
    })();
  }, []);
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
    pollRef.current = setInterval(async () => {
      try {
        const ar = await fetch(`${API}/api/driver/active-ride?phone=${dp}`);
        const ad = await ar.json();
        if (ad.ride) { 
          setActiveRide({ ...ad.ride, passenger_name: ad.ride.passenger_name || 'Passenger' }); 
          setRideReq(null); return; 
        }
        setActiveRide(null);
        const pr = await fetch(`${API}/api/driver/pending-ride?phone=${dp}`);
        const pd = await pr.json();
        if (pd.ride) {
          setRideReq((prev: any) => { if (!prev || prev.id !== pd.ride.id) Vibration.vibrate([0, 200, 100, 200]); return pd.ride; });
        } else setRideReq(null);
      } catch (_e) {}
    }, 4000);
  };
  const stopPolling = () => { clearInterval(pollRef.current); setRideReq(null); setActiveRide(null); };

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

  useEffect(() => () => clearInterval(pollRef.current), []);

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
      try { const r = await fetch(`${API}/api/driver/target?phone=${phone}`); const d = await r.json(); setTarget(d); } catch (_e) {}
    })();
  }, [screen, phone, rides]);

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
    if (val) { setResult('🟢 Online hain — rides aayengi!'); startPolling(phone); }
    else { setResult('🔴 Offline hain'); stopPolling(); }
  };

  // ── Ride actions ───────────────────────────────
  const apiCall = async (endpoint: string, body: any) => {
    const res = await fetch(`${API}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return res.json();
  };

  const acceptRide = async () => {
    if (!rideReq) return;
    setLoading(true);
    try {
      const data = await apiCall('/api/rides/accept', { ride_id: rideReq.id, driver_phone: phone });
      if (data.success) { setResult('✅ Ride accept ki!'); setRideReq(null); await fetchEta(rideReq.pickup, rideReq.drop_location); }
    } catch (_e) { setResult('❌ Error'); }
    setLoading(false);
  };
  const rejectRide = () => { setRideReq(null); setResult('❌ Ride reject ki'); };

  const markArrived = async () => {
    setLoading(true);
    await apiCall('/api/rides/arrived', { ride_id: activeRide.id });
    setActiveRide({ ...activeRide, status: 'arrived' });
    setLoading(false);
  };

  const startTrip = async () => {
    if (otpInput.length !== 4) { setResult('❌ 4 digit OTP daalo'); return; }
    setLoading(true);
    const data = await apiCall('/api/rides/start', { ride_id: activeRide.id, otp: otpInput });
    if (data.success) { setActiveRide({ ...activeRide, status: 'started' }); setOtpInput(''); setResult(''); }
    else setResult('❌ ' + (data.message || 'Galat OTP!'));
    setLoading(false);
  };

  const completeTrip = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/rides/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ride_id: activeRide.id })
      });
      const data = await res.json();
      if (data.success) {
        setPaymentRideId(activeRide.id);
        setPaymentWaiting(true);
        const fare = parseFloat(activeRide.fare || 0);
        setEarnings(e => e + fare);
        setRides(r => r + 1);
        setActiveRide(null);
      } else {
        setResult('❌ ' + (data.message || 'Complete nahi hua, retry karo'));
      }
    } catch (_e) {
      setResult('❌ Network error — retry karo');
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
                  else { setLoginOtpSent(true); setLoginResendTimer(60); setLoginCanResend(false); }
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
            {result ? <Text style={s.err}>{result}</Text> : null}
            <TouchableOpacity style={[s.btn, (loading || loginOtpDigits.join('').length < 6) && { opacity: 0.5 }]}
              disabled={loading || loginOtpDigits.join('').length < 6}
              onPress={async () => {
                const otpToUse = loginOtpDigits.join('');
                setLoading(true);
                try {
                  const res = await fetch(`${API}/api/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: regData.phone, otp: otpToUse, name: '' }) });
                  const data = await res.json();
                  if (data.token) { setResult(''); setLoginOtpSent(false); setLoginOtpDigits(['','','','','','']); setRegStep(2); }
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
      <ScrollView style={{ flex: 1, padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text style={rs.bigTitle}>🚗 Vehicle Type</Text><Text style={rs.subTitle}>Aap kya chalate hain?</Text>
        {[{ id:'bike', icon:'🏍️', label:'Bike' },{ id:'auto', icon:'🛺', label:'Auto' },{ id:'car', icon:'🚕', label:'Car / Taxi' },{ id:'eriksha', icon:'🛵', label:'E-Riksha' }].map(v => (
          <TouchableOpacity key={v.id} style={[rs.vehBox, regData.vehicle_type === v.id && rs.vehBoxActive]} onPress={() => updateReg('vehicle_type', v.id)}>
            <Text style={{ fontSize: 32, marginRight: 16 }}>{v.icon}</Text>
            <Text style={[{ fontSize: 18, fontWeight: '600', color: '#1a1a2e' }, regData.vehicle_type === v.id && { color: '#fff' }]}>{v.label}</Text>
            {regData.vehicle_type === v.id && <Text style={{ color: '#fff', fontSize: 20, marginLeft: 'auto' }}>✓</Text>}
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[s.btn, !regData.vehicle_type && { opacity: 0.5 }]} disabled={!regData.vehicle_type} onPress={() => { setResult(''); setRegStep(3); }}><Text style={s.btnTxt}>Aage badho →</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );

  // ═══ REGISTRATION STEP 3 — DL ═══
  if (screen === 'login' && regStep === 3) return (
    <View style={s.screen}>
      <View style={rs.regHeader}><TouchableOpacity onPress={() => setRegStep(2)}><Text style={{ color: '#fff', fontSize: 16 }}>← Back</Text></TouchableOpacity><Text style={rs.regTitle}>Step 3 of 5</Text><View style={{ width: 50 }} /></View>
      <ScrollView style={{ flex: 1, padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text style={rs.bigTitle}>📄 Driving License</Text><Text style={rs.subTitle}>DL ki photo aur naam</Text>
        <View style={rs.adviceBox}>
          <Text style={rs.adviceTitle}>📸 Photo Tips:</Text>
          <Text style={rs.adviceText}>• DL ka front side clear photo lo</Text>
          <Text style={rs.adviceText}>• Achhi roshni mein photo lo</Text>
          <Text style={[rs.adviceText, { marginTop: 6, fontWeight: '600', color: '#c62828' }]}>⚠️ Har ride pe DL saath rakhna zaruri hai!</Text>
        </View>
        <Text style={rs.fieldLabel}>DL pe likha naam</Text>
        <TextInput style={rs.input} placeholder="Pura naam jaisa DL pe hai" value={regData.dl_name} onChangeText={(v) => updateReg('dl_name', v)} />
        <Text style={rs.fieldLabel}>DL Photo (front side)</Text>
        <PhotoBox field="dl_photo" label="DL Photo" icon="📄" />
        {result ? <Text style={s.err}>{result}</Text> : null}
        <TouchableOpacity style={[s.btn, (!regData.dl_name || !regData.dl_photo) && { opacity: 0.5 }]} disabled={!regData.dl_name || !regData.dl_photo} onPress={() => { setResult(''); setRegStep(4); }}><Text style={s.btnTxt}>Aage badho →</Text></TouchableOpacity>
        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );

  // ═══ REGISTRATION STEP 4 — Vehicle ═══
  if (screen === 'login' && regStep === 4) return (
    <View style={s.screen}>
      <View style={rs.regHeader}><TouchableOpacity onPress={() => setRegStep(3)}><Text style={{ color: '#fff', fontSize: 16 }}>← Back</Text></TouchableOpacity><Text style={rs.regTitle}>Step 4 of 5</Text><View style={{ width: 50 }} /></View>
      <ScrollView style={{ flex: 1, padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text style={rs.bigTitle}>🚗 Vehicle Details</Text>
        <Text style={rs.subTitle}>{regData.vehicle_type === 'eriksha' ? 'E-Riksha: photo zaruri, number optional' : 'Vehicle number aur front photo'}</Text>
        <Text style={rs.fieldLabel}>Vehicle Number {regData.vehicle_type === 'eriksha' ? '(optional)' : ''}</Text>
        <TextInput style={rs.input} placeholder="UP32 AB 1234" autoCapitalize="characters" value={regData.vehicle_no} onChangeText={(v) => updateReg('vehicle_no', v)} />
        <Text style={rs.fieldLabel}>Vehicle Front Photo</Text><PhotoBox field="vehicle_photo" label="Vehicle Photo" icon="🚗" />
        <Text style={rs.fieldLabel}>RC Photo (optional)</Text><PhotoBox field="rc_photo" label="RC Photo" icon="📋" />
        {result ? <Text style={s.err}>{result}</Text> : null}
        <TouchableOpacity
          style={[s.btn, (() => { const needNum = regData.vehicle_type !== 'eriksha'; const ok = regData.vehicle_photo && (!needNum || regData.vehicle_no); return !ok ? { opacity: 0.5 } : {}; })()]}
          disabled={(() => { const needNum = regData.vehicle_type !== 'eriksha'; const ok = regData.vehicle_photo && (!needNum || regData.vehicle_no); return !ok; })()}
          onPress={() => { setResult(''); setRegStep(5); }}><Text style={s.btnTxt}>Aage badho →</Text></TouchableOpacity>
        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );

  // ═══ REGISTRATION STEP 5 — Aadhaar + Selfie ═══
  if (screen === 'login' && regStep === 5) return (
    <View style={s.screen}>
      <View style={rs.regHeader}><TouchableOpacity onPress={() => setRegStep(4)}><Text style={{ color: '#fff', fontSize: 16 }}>← Back</Text></TouchableOpacity><Text style={rs.regTitle}>Step 5 of 5</Text><View style={{ width: 50 }} /></View>
      <ScrollView style={{ flex: 1, padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text style={rs.bigTitle}>🪪 Aadhaar & Photo</Text><Text style={rs.subTitle}>Last step!</Text>
        <Text style={rs.fieldLabel}>Aadhaar Number</Text>
        <TextInput style={rs.input} placeholder="12 digit Aadhaar" keyboardType="numeric" maxLength={12} value={regData.aadhaar_number} onChangeText={(v) => updateReg('aadhaar_number', v)} />
        <Text style={rs.fieldLabel}>Aadhaar Photo</Text><PhotoBox field="aadhaar_photo" label="Aadhaar Photo" icon="🪪" />
        <Text style={rs.fieldLabel}>Apni Selfie / Face Photo</Text>
        <Text style={{ fontSize: 11, color: '#c62828', marginBottom: 8 }}>🔒 Security: Sirf live selfie le sakte ho, gallery se nahi</Text>
        <PhotoBox field="face_photo" label="Face Photo" icon="🤳" cameraOnly />
        {result ? <Text style={s.err}>{result}</Text> : null}
        <TouchableOpacity style={[s.btn, (!regData.aadhaar_number || !regData.aadhaar_photo || !regData.face_photo) && { opacity: 0.5 }]} disabled={!regData.aadhaar_number || !regData.aadhaar_photo || !regData.face_photo || loading} onPress={submitRegistration}>
          <Text style={s.btnTxt}>{loading ? 'Submit ho raha hai...' : '✅ Registration Submit Karo'}</Text>
        </TouchableOpacity>
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );

  // ═══ REGISTRATION DONE ═══
  if (screen === 'login' && regStep === 99) return (
    <View style={s.screen}>
      <View style={s.hero}><Text style={{ fontSize: 70 }}>🎉</Text><Text style={s.heroTitle}>Registration Done!</Text></View>
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Text style={{ fontSize: 16, color: '#333', textAlign: 'center', lineHeight: 24 }}>Aapki application submit ho gayi! ✅{'\n\n'}Admin aapke documents verify karega.</Text>
        <View style={{ backgroundColor: '#fff3e0', borderRadius: 12, padding: 16, marginTop: 20, width: '100%' }}>
          <Text style={{ color: '#ef6c00', textAlign: 'center', fontWeight: '600' }}>⏳ Status: Verification Pending</Text>
        </View>
        <TouchableOpacity style={[s.btn, { marginTop: 30, width: '100%' }]} onPress={() => { setRegStep(0); setPhone(regData.phone); }}><Text style={s.btnTxt}>🏠 Login Screen pe jao</Text></TouchableOpacity>
      </View>
    </View>
  );

  // ═══ VERIFICATION STATUS ═══
  if (screen === 'login' && driverInfo && driverInfo.status !== 'approved') return (
    <View style={s.screen}>
      <View style={s.hero}>
        <Text style={{ fontSize: 70 }}>{driverInfo.status === 'pending' ? '⏳' : driverInfo.status === 'suspended' ? '🚫' : '⚠️'}</Text>
        <Text style={s.heroTitle}>{driverInfo.status === 'pending' ? 'Verification Pending' : driverInfo.status === 'suspended' ? 'Account Suspended' : 'Documents Reject'}</Text>
      </View>
      <View style={{ padding: 24 }}>
        <View style={{ backgroundColor: driverInfo.status === 'pending' ? '#fff3e0' : '#ffebee', borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <Text style={{ fontSize: 15, lineHeight: 24, textAlign: 'center', color: driverInfo.status === 'pending' ? '#ef6c00' : '#c62828' }}>
            {driverInfo.status === 'pending' && 'Aapke documents admin verify kar raha hai. Thodi der mein status update hoga.'}
            {driverInfo.status === 'rejected' && 'Aapke documents mein kuch problem hai. Neeche message padho aur dobara upload karo.'}
            {driverInfo.status === 'suspended' && 'Aapka account suspend kar diya gaya hai.'}
          </Text>
        </View>
        {driverInfo.admin_message ? (
          <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 20, borderWidth: 1, borderColor: '#e0e0e0' }}>
            <Text style={{ fontSize: 13, color: '#888', marginBottom: 6 }}>📩 Admin ka message:</Text>
            <Text style={{ fontSize: 15, color: '#1a1a2e', fontWeight: '500' }}>{driverInfo.admin_message}</Text>
          </View>
        ) : null}
        {(driverInfo.status === 'rejected' || driverInfo.status === 'suspended') && (
          <TouchableOpacity style={s.btn} onPress={() => { setRegData((p: any) => ({ ...p, phone: driverInfo.phone })); setDriverInfo(null); setRegStep(1); }}><Text style={s.btnTxt}>📄 Documents Dobara Upload Karo</Text></TouchableOpacity>
        )}
        <TouchableOpacity style={[s.btn, { backgroundColor: '#1a1a2e' }]} onPress={() => { setDriverInfo(null); setLoginPhone(''); setResult(''); }}><Text style={s.btnTxt}>← Wapas Login pe jao</Text></TouchableOpacity>
      </View>
    </View>
  );

  // ═══ LOGIN ═══
  if (screen === 'login') return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.hero}>
        <Text style={s.heroIcon}>🚖</Text>
        <Text style={s.heroTitle}>RideApp Driver</Text>
        <Text style={s.heroSub}>Spero Buddy Login</Text>
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
            <TouchableOpacity style={[s.btn, { marginTop: 0, marginBottom: 16 }, loginPhone.length !== 10 && { opacity: 0.5 }]} disabled={loginPhone.length !== 10 || loading} onPress={doLogin}>
              <Text style={s.btnTxt}>{loading ? '⏳ OTP bhej raha hai...' : 'OTP Bhejo 📱'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ borderWidth: 2, borderColor: '#e94560', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 20 }} onPress={() => { setRegStep(1); setResult(''); }}>
              <Text style={{ color: '#e94560', fontSize: 16, fontWeight: 'bold' }}>🆕 Naya Spero Buddy Banein</Text>
            </TouchableOpacity>
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
            <TouchableOpacity style={[s.btn, !phone && { opacity: 0.5 }]} onPress={() => { if (phone) setScreen('home'); }} disabled={!phone}>
              <Text style={s.btnTxt}>Test Login 🧪</Text>
            </TouchableOpacity>
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
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
            {result ? <Text style={s.err}>{result}</Text> : null}
            <TouchableOpacity style={[s.btn, { marginBottom: 12 }, (loading || loginOtpDigits.join('').length < 6) && { opacity: 0.6 }]} disabled={loading || loginOtpDigits.join('').length < 6} onPress={() => verifyLoginOtp()}>
              <Text style={s.btnTxt}>{loading ? '⏳ Verify ho raha hai...' : '✅ Verify Karo'}</Text>
            </TouchableOpacity>
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
    <View style={s.screen}>
      <View style={[s.hero, { paddingTop: 60, paddingBottom: 40 }]}>
        <Text style={{ fontSize: 60 }}>{paymentMethod === 'cash' ? '💵' : '⏳'}</Text>
        <Text style={s.heroTitle}>{paymentMethod === 'cash' ? 'Cash Payment' : 'Payment ka intezaar...'}</Text>
        <Text style={s.heroSub}>{paymentMethod === 'cash' ? 'Customer se cash lo' : 'Customer payment kar raha hai...'}</Text>
      </View>
      <ScrollView style={{ flex: 1, padding: 16 }}>
        {/* Payment method info */}
        {paymentMethod === 'cash' ? (
          <View>
            <View style={{ backgroundColor: '#e8f5e9', borderRadius: 16, padding: 20, marginBottom: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 50 }}>💵</Text>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#2e7d32', marginTop: 10 }}>Customer cash de raha hai</Text>
              <Text style={{ fontSize: 13, color: '#388e3c', marginTop: 6, textAlign: 'center' }}>Customer se cash lo aur confirm karo</Text>
            </View>
            {/* Commission info */}
            <View style={{ backgroundColor: '#fff3e0', borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#e65100', marginBottom: 8 }}>💰 Commission Info</Text>
              <Text style={{ fontSize: 13, color: '#ef6c00', lineHeight: 20 }}>Cash payment mein 15% commission aapke next payout pe deduct hoga. Sirf aapki net earning wallet mein aayegi.</Text>
            </View>
            {/* Cash confirm button */}
            <TouchableOpacity style={{ backgroundColor: '#4CAF50', borderRadius: 14, padding: 18, alignItems: 'center', elevation: 4, marginBottom: 12 }}
              onPress={async () => {
                try {
                  await fetch(`${API}/api/rides/cash-confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ride_id: paymentRideId, phone }) });
                  setPaymentWaiting(false);
                  const fare = parseFloat(String(earnings) || '0');
                  setTripSummary({ fare: '₹' + fare, payment_method: 'cash', earned: '₹' + (fare * 0.85).toFixed(0), fee: '₹' + (fare * 0.15).toFixed(0) });
                } catch (_e) { setResult('❌ Error'); }
              }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>✅ Cash Mil Gaya — Confirm</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            {/* Waiting animation */}
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', elevation: 3, marginBottom: 16 }}>
              <Text style={{ fontSize: 50, marginBottom: 12 }}>💳</Text>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1a1a2e', marginBottom: 6 }}>Online Payment Processing</Text>
              <Text style={{ fontSize: 13, color: '#888', textAlign: 'center' }}>Customer UPI/Card se payment kar raha hai. Thoda wait karo...</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                {[0,1,2].map(i => (
                  <View key={i} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#e94560', opacity: 0.3 + i * 0.35 }} />
                ))}
              </View>
            </View>
            <View style={{ backgroundColor: '#e3f2fd', borderRadius: 12, padding: 14 }}>
              <Text style={{ fontSize: 13, color: '#1565c0', textAlign: 'center' }}>💡 Payment complete hote hi aapको automatically rating screen dikhega</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
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
    <View style={s.screen}>
      <View style={[s.hero, { paddingTop: 50 }]}><Text style={{ fontSize: 60 }}>🎉</Text><Text style={s.heroTitle}>Trip Complete!</Text></View>
      <ScrollView style={{ flex: 1, padding: 16 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, elevation: 4, marginBottom: 16 }}>
          <Text style={[s.sectionTitle, { marginBottom: 16 }]}>💰 Earning Summary</Text>
          {/* Payment method badge */}
          <View style={{ backgroundColor: tripSummary.payment_method === 'cash' ? '#e8f5e9' : tripSummary.payment_method === 'wallet' ? '#e3f2fd' : '#f3e5f5', borderRadius: 10, padding: 10, marginBottom: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#1a1a2e' }}>
              {tripSummary.payment_method === 'cash' ? '💵 Cash Payment' : tripSummary.payment_method === 'wallet' ? '💰 Wallet Payment' : '💳 Online Payment'}
            </Text>
          </View>
          {[['Total Fare', '₹' + tripSummary.fare],['Platform Fee (15%)', tripSummary.fee],['Aapki Kamai', tripSummary.earned]].map(([k, v], i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: '#f5f5f5' }}>
              <Text style={{ fontSize: 14, color: '#666' }}>{k}</Text>
              <Text style={{ fontSize: 14, fontWeight: i === 4 ? 'bold' : '500', color: i === 4 ? '#4CAF50' : '#333' }}>{v}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity style={[s.btn, { backgroundColor: '#4CAF50' }]} onPress={() => setTripSummary(null)}><Text style={s.btnTxt}>🏠 Next Ride ke liye Ready</Text></TouchableOpacity>
      </ScrollView>
    </View>
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
    <View style={s.screen}>
      {/* Full map background */}
      <View style={s.mapFit}>
        <MapWebView
          pickupCoords={activeRide ? { lat: activeRide.pickup_lat, lng: activeRide.pickup_lng } : null}
          dropCoords={activeRide ? { lat: activeRide.drop_lat, lng: activeRide.drop_lng } : null}
          driverLat={driverGps?.lat}
          driverLng={driverGps?.lng}
          height={220}
        />
      </View>
      {/* Top bar */}
      <View style={s.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={s.greeting}>{isOnline ? '🟢 Online' : '🔴 Offline'}</Text>
          <Text style={s.subTxt}>{driverInfo?.name || selectedDriver?.name} · {driverInfo?.vehicle_no || selectedDriver?.vehicle}</Text>
        </View>
        <Switch value={isOnline} onValueChange={toggleOnline} trackColor={{ true: '#4CAF50', false: '#e0e0e0' }} />
      </View>
      {/* Content */}
      <View style={{ flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -20, paddingTop: 16, paddingHorizontal: 16 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 90 }}>
          <View style={s.statsRow}>
            <View style={s.statCard}><Text style={s.statIcon}>💰</Text><Text style={s.statValue}>₹{earnings.toFixed(0)}</Text><Text style={s.statLabel}>Aaj ki kamai</Text></View>
            <View style={s.statCard}><Text style={s.statIcon}>🚗</Text><Text style={s.statValue}>{rides}</Text><Text style={s.statLabel}>Rides</Text></View>
            <View style={s.statCard}><Text style={s.statIcon}>⭐</Text><Text style={s.statValue}>{driverInfo?.rating || '4.8'}</Text><Text style={s.statLabel}>Rating</Text></View>
          </View>

          {target && !activeRide && (
            <View style={s.targetCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#1a1a2e' }}>🎯 Daily Target</Text>
                <Text style={{ fontSize: 14, fontWeight: 'bold', color: target.achieved ? '#4CAF50' : '#e94560' }}>{target.achieved ? '✅ Bonus ₹' + target.bonus + ' mila!' : '₹' + target.bonus + ' bonus'}</Text>
              </View>
              <View style={{ height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: target.achieved ? '#4CAF50' : '#e94560', width: `${Math.min(100, (target.completed / target.target) * 100)}%` }} />
              </View>
              <Text style={{ fontSize: 12, color: '#666' }}>{target.completed}/{target.target} rides complete {target.achieved ? '' : `· ${target.remaining} aur baaki`}</Text>
            </View>
          )}

          {activeRide && (
            <View style={s.tripCard}>
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
                <TouchableOpacity style={s.tripBtn} onPress={markArrived} disabled={loading}><Text style={s.tripBtnTxt}>{loading ? '...' : '📍 Pickup pe pahunch gaya'}</Text></TouchableOpacity>
              )}

              {activeRide.status === 'arrived' && (
                <View>
                  <Text style={{ fontSize: 13, color: '#666', marginBottom: 8, textAlign: 'center' }}>🔐 Passenger se OTP poocho</Text>
                  <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <TextInput style={{ borderWidth: 2, borderColor: '#1a1a2e', borderRadius: 10, padding: 14, fontSize: 24, textAlign: 'center', letterSpacing: 8, marginBottom: 10, fontWeight: 'bold', backgroundColor: '#fff' }} placeholder="0000" keyboardType="number-pad" maxLength={4} value={otpInput} onChangeText={setOtpInput} />
                  </KeyboardAvoidingView>
                  <TouchableOpacity style={s.tripBtn} onPress={startTrip} disabled={loading}><Text style={s.tripBtnTxt}>{loading ? '...' : '🚀 OTP Verify & Trip Shuru'}</Text></TouchableOpacity>
                </View>
              )}

              {activeRide.status === 'started' && (
                <View>
                  {/* GPS Range check disabled for testing */}
                  <TouchableOpacity style={[s.tripBtn, { backgroundColor: '#4CAF50' }]} onPress={completeTrip} disabled={loading}>
                    <Text style={s.tripBtnTxt}>{loading ? '...' : '✅ Trip Complete Karo'}</Text>
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowDriverCancelModal(true)} disabled={loading}>
                <Text style={s.cancelTxt}>✕ Cancel Trip</Text>
              </TouchableOpacity>
            </View>
          )}

          {rideReq && !activeRide && (
            <SlideIn>
              <View style={s.rideCard}>
                <View style={s.rideHeader}><Text style={s.rideTitle}>🔔 Nayi Ride!</Text><Text style={s.rideFare}>₹{rideReq.fare}</Text></View>
                <View style={s.rideDetails}>
                  <Text style={s.rideFrom}>📍 {rideReq.pickup}</Text>
                  <Text style={s.rideDivider}>↓</Text>
                  <Text style={s.rideTo}>🎯 {rideReq.drop_location}</Text>
                </View>
                <CountdownBar seconds={20} onTimeout={rejectRide} />
                <View style={[s.rideActions, { marginTop: 12 }]}>
                  <TouchableOpacity style={s.rejectBtn} onPress={rejectRide}><Text style={s.rejectTxt}>✕ Reject</Text></TouchableOpacity>
                  <TouchableOpacity style={s.acceptBtn} onPress={acceptRide} disabled={loading}><Text style={s.acceptTxt}>{loading ? '...' : '✓ Accept'}</Text></TouchableOpacity>
                </View>
              </View>
            </SlideIn>
          )}

          {!activeRide && !rideReq && (
            <View style={s.statusCard}><Text style={s.statusText}>{isOnline ? '✅ Online hain — rides ka intezaar...' : '💤 Online ho jao rides lene ke liye'}</Text></View>
          )}
          {result && !activeRide && !rideReq ? <Text style={s.result}>{result}</Text> : null}
        </ScrollView>
      </View>
      <View style={s.navFloat}><BottomNav activeTab={activeTab} setActiveTab={setActiveTab} rideReq={rideReq} /></View>
    </View>
  );

  // ═══ EARNINGS TAB ═══
  if (activeTab === 'earnings') return (
    <View style={s.screen}>
      <View style={s.topBar}><Text style={s.greeting}>💰 Earnings</Text></View>
      {rideReq && <TouchableOpacity style={s.notifBanner} onPress={() => setActiveTab('home')}><Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>🔔 Nayi Ride! ₹{rideReq.fare}</Text><Text style={{ color: '#fff', fontSize: 13 }}>Dekho →</Text></TouchableOpacity>}
      <ScrollView style={{ flex: 1, padding: 16 }}>
        <View style={s.earningsHero}><Text style={s.earningsAmount}>₹{earnings.toFixed(0)}</Text><Text style={s.earningsLabel}>Aaj ki total kamai</Text></View>
        <View style={s.earningsCard}>
          <Row k="Total Rides" v={rides.toString()} />
          <Row k="Average per ride" v={'₹' + (rides ? (earnings/rides).toFixed(0) : 0)} />
          <Row k="Platform fee (15%)" v={'₹' + (earnings * 0.15).toFixed(0)} />
          <Row k="Net Earnings" v={'₹' + (earnings * 0.85).toFixed(0)} bold last />
        </View>
        <TouchableOpacity style={s.payoutBtn}><Text style={s.payoutTxt}>💸 Payout Request Karo</Text></TouchableOpacity>
      </ScrollView>
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} rideReq={rideReq} />
    </View>
  );

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
        {[['📋','Documents','License, RC'],['🏦','Bank Details','Payout account'],['📞','Support','24x7 help'],['⚙️','Settings','Preferences']].map(([icon,title,sub],i) => (
          <TouchableOpacity key={i} style={s.menuItem}>
            <Text style={{ fontSize: 22, marginRight: 14 }}>{icon}</Text>
            <View style={{ flex: 1 }}><Text style={{ fontSize: 15, color: '#1a1a2e', fontWeight: '500' }}>{title}</Text><Text style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{sub}</Text></View>
            <Text style={{ fontSize: 20, color: '#ccc' }}>›</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={s.logoutBtn} onPress={async () => { await AsyncStorage.removeItem('driverPhone'); await AsyncStorage.removeItem('driverInfo'); setScreen('login'); setIsOnline(false); stopPolling(); setDriverInfo(null); setPhone(''); }}>
          <Text style={{ color: '#e94560', fontWeight: 'bold', fontSize: 15 }}>🚪 Logout</Text>
        </TouchableOpacity>
      </ScrollView>
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} rideReq={rideReq} />
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

function BottomNav({ activeTab, setActiveTab, rideReq }: any) {
  return (
    <View style={s.nav}>
      {[['home','🏠','Home'],['earnings','💰','Earnings'],['profile','👤','Profile']].map(([t,icon,lbl]) => (
        <TouchableOpacity key={t} style={s.navItem} onPress={() => setActiveTab(t)}>
          <Text style={s.navIcon}>{icon}</Text>
          <Text style={[s.navLbl, activeTab===t && s.navActive]}>{lbl}</Text>
          {t === 'home' && rideReq && <View style={{ position: 'absolute', top: 4, right: 24, width: 8, height: 8, borderRadius: 4, backgroundColor: '#e94560' }} />}
        </TouchableOpacity>
      ))}
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
  statsRow:        { flexDirection:'row', gap:10, marginBottom:14 },
  statCard:        { flex:1, backgroundColor:'#fff', borderRadius:14, padding:14, alignItems:'center', elevation:2 },
  statIcon:        { fontSize:24 },
  statValue:       { fontSize:20, fontWeight:'bold', color:'#1a1a2e', marginTop:4 },
  statLabel:       { fontSize:11, color:'#999', marginTop:2 },
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
  rideCard:        { backgroundColor:'#fff', borderRadius:16, padding:16, marginBottom:16, elevation:6, borderWidth:2, borderColor:'#e94560' },
  rideHeader:      { flexDirection:'row', justifyContent:'space-between', marginBottom:12 },
  rideTitle:       { fontSize:16, fontWeight:'bold', color:'#1a1a2e' },
  rideFare:        { fontSize:20, fontWeight:'bold', color:'#e94560' },
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
  nav:             { flexDirection:'row', backgroundColor:'#fff', borderTopWidth:1, borderTopColor:'#eee', paddingBottom:12 },
  navItem:         { flex:1, alignItems:'center', paddingTop:10 },
  navIcon:         { fontSize:22 },
  navLbl:          { fontSize:11, color:'#999', marginTop:2 },
  navActive:       { color:'#e94560', fontWeight:'bold' },
  earningsHero:    { backgroundColor:'#1a1a2e', borderRadius:16, padding:30, alignItems:'center', marginBottom:16 },
  earningsAmount:  { color:'#fff', fontSize:40, fontWeight:'bold' },
  earningsLabel:   { color:'#aaa', fontSize:14, marginTop:4 },
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
