import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Switch, TextInput, Animated, Linking, Vibration, Platform
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';

const API      = 'https://rideapp-backend-production-5e1c.up.railway.app';
const MAPS_KEY = 'AIzaSyAD-A9qcLSXbgrz4CI4PYLFOZ';

// ── WebView Map ────────────────────────────────────
const MapWebView = ({ pickup, drop, height = 180 }: any) => {
  let mapUrl = '';
  if (pickup && drop) {
    mapUrl = `https://www.google.com/maps/embed/v1/directions?key=${MAPS_KEY}&origin=${encodeURIComponent(pickup)}&destination=${encodeURIComponent(drop)}&mode=driving`;
  } else if (pickup) {
    mapUrl = `https://www.google.com/maps/embed/v1/place?key=${MAPS_KEY}&q=${encodeURIComponent(pickup)}`;
  } else {
    mapUrl = `https://www.google.com/maps/embed/v1/place?key=${MAPS_KEY}&q=Lucknow,India`;
  }

  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;}body{background:#dbeafe;}</style></head><body><iframe width="100%" height="${height}" frameborder="0" style="border:0" src="${mapUrl}" allowfullscreen></iframe></body></html>`;

  return (
    <WebView source={{ html }} style={{ height, width: '100%' }} scrollEnabled={false} javaScriptEnabled />
  );
};

// ── Slide-in ───────────────────────────────────────
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

// ── Countdown ──────────────────────────────────────
const CountdownBar = ({ seconds, onTimeout }: { seconds: number; onTimeout?: () => void }) => {
  const [left, setLeft] = useState(seconds);
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 0, duration: seconds * 1000, useNativeDriver: false }).start();
    const t = setInterval(() => {
      setLeft((l: number) => {
        if (l <= 1) { clearInterval(t); onTimeout?.(); return 0; }
        return l - 1;
      });
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
        <Animated.View style={{ height: 4, borderRadius: 2, backgroundColor: left <= 5 ? '#e94560' : '#4CAF50',
          width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
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
  const [tripSummary, setTripSummary] = useState<any>(null);
  const pollRef = useRef<any>(null);

  // Registration
  const [regStep, setRegStep]       = useState(0);
  const [regData, setRegData]       = useState<any>({ phone:'', vehicle_type:'', vehicle_no:'', dl_name:'', dl_photo:'', vehicle_photo:'', rc_photo:'', aadhaar_number:'', aadhaar_photo:'', face_photo:'' });
  const [uploading, setUploading]   = useState('');
  const [loginPhone, setLoginPhone] = useState('');
  const [driverInfo, setDriverInfo] = useState<any>(null);

  const DRIVERS = [
    { phone: '8888888888', name: 'Raju',   vehicle: 'UP32AB1234', type: '🛺 Auto' },
    { phone: '7777777777', name: 'Amit',   vehicle: 'UP32CD5678', type: '🏍️ Bike' },
    { phone: '6666666666', name: 'Suresh', vehicle: 'UP32EF9012', type: '🚕 Taxi' },
    { phone: '5555555555', name: 'Vikram', vehicle: 'UP32GH3456', type: '🚕 Economy' },
    { phone: '4444444444', name: 'Rahul',  vehicle: 'UP32IJ7890', type: '🚗 Premium' },
    { phone: '3333333333', name: 'Deepak', vehicle: 'UP32KL1234', type: '🏍️ Moto' },
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
          if (savedInfo) setDriverInfo(JSON.parse(savedInfo));
          setScreen('home');
        }
      } catch (_e) {}
    })();
  }, []);

  // ── Polling ────────────────────────────────────
  const startPolling = (dp: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const ar = await fetch(`${API}/api/driver/active-ride?phone=${dp}`);
        const ad = await ar.json();
        if (ad.ride) { setActiveRide(ad.ride); setRideReq(null); return; }
        setActiveRide(null);
        const pr = await fetch(`${API}/api/driver/pending-ride?phone=${dp}`);
        const pd = await pr.json();
        if (pd.ride) { Vibration.vibrate([0, 200, 100, 200]); setRideReq(pd.ride); }
        else setRideReq(null);
      } catch (_e) {}
    }, 4000);
  };

  const stopPolling = () => { clearInterval(pollRef.current); setRideReq(null); setActiveRide(null); };

  // ── Location ───────────────────────────────────
  useEffect(() => {
    if (!isOnline) return;
    let locInterval: any;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      locInterval = setInterval(async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({});
          await fetch(`${API}/api/driver/update-location`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, lat: loc.coords.latitude, lng: loc.coords.longitude })
          });
        } catch (_e) {}
      }, 5000);
    })();
    return () => clearInterval(locInterval);
  }, [isOnline]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  // ── Navigate ───────────────────────────────────
  const navigateTo = (location: string) => {
    const url = Platform.OS === 'ios'
      ? `maps:?daddr=${encodeURIComponent(location)}`
      : `google.navigation:q=${encodeURIComponent(location)}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/?daddr=${encodeURIComponent(location)}`)
    );
  };

  // ── ETA ────────────────────────────────────────
  const fetchEta = async (origin: string, dest: string) => {
    try {
      const res  = await fetch(
        `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(dest)}&key=${MAPS_KEY}`
      );
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
      const res  = await fetch(`${API}/api/driver/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: loginPhone })
      });
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

  // ── Registration ───────────────────────────────
  const updateReg = (field: string, value: string) => setRegData((p: any) => ({ ...p, [field]: value }));

  const doUpload = async (field: string, base64: string) => {
    setUploading(field);
    try {
      const up   = await fetch(`${API}/api/upload`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: `data:image/jpeg;base64,${base64}` })
      });
      const data = await up.json();
      if (data.success) setRegData((p: any) => ({ ...p, [field]: data.url }));
      else setResult('❌ Upload fail');
    } catch (_e) { setResult('❌ Upload error'); }
    setUploading('');
  };

  const fromCamera = async (field: string) => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) { setResult('❌ Camera permission do'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true });
    if (!r.canceled && r.assets?.[0]?.base64) doUpload(field, r.assets[0].base64);
  };

  const fromGallery = async (field: string) => {
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) { setResult('❌ Gallery permission do'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, base64: true });
    if (!r.canceled && r.assets?.[0]?.base64) doUpload(field, r.assets[0].base64);
  };

  const submitRegistration = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/api/driver/register-buddy`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...regData, name: regData.dl_name })
      });
      const data = await res.json();
      if (data.success) setRegStep(99);
      else setResult('❌ ' + (data.error || 'Registration fail'));
    } catch (_e) { setResult('❌ Server error'); }
    setLoading(false);
  };

  // ── Online toggle ──────────────────────────────
  const toggleOnline = async (val: boolean) => {
    setIsOnline(val);
    try {
      await fetch(`${API}/api/driver/toggle-online`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, is_online: val })
      });
    } catch (_e) {}
    if (val) { setResult('🟢 Online hain — rides aayengi!'); startPolling(phone); }
    else { setResult('🔴 Offline hain'); stopPolling(); }
  };

  // ── Ride actions ───────────────────────────────
  const apiCall = async (endpoint: string, body: any) => {
    const res = await fetch(`${API}${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return res.json();
  };

  const acceptRide = async () => {
    if (!rideReq) return;
    setLoading(true);
    try {
      const data = await apiCall('/api/rides/accept', { ride_id: rideReq.id, driver_phone: phone });
      if (data.success) {
        setResult('✅ Ride accept ki!');
        setRideReq(null);
        await fetchEta(rideReq.pickup, rideReq.drop_location);
      }
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
    await apiCall('/api/rides/complete', { ride_id: activeRide.id });
    const fare = parseFloat(activeRide.fare || 0);
    setEarnings(e => e + fare);
    setRides(r => r + 1);
    setTripSummary({
      fare: activeRide.fare,
      pickup: activeRide.pickup,
      drop: activeRide.drop_location,
      passenger: activeRide.passenger_name,
      earned: '₹' + (fare * 0.85).toFixed(0),
      fee: '₹' + (fare * 0.15).toFixed(0)
    });
    setActiveRide(null);
    setLoading(false);
  };

  const cancelTrip = async () => {
    setLoading(true);
    await apiCall('/api/rides/cancel', { ride_id: activeRide.id, reason: 'Driver cancelled' });
    setResult('❌ Trip cancel ki');
    setActiveRide(null);
    setLoading(false);
  };

  // ── PhotoBox ───────────────────────────────────
  const PhotoBox = ({ field, label, icon }: any) => (
    <View style={rs.photoBox}>
      {regData[field] ? (
        <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 32 }}>✅</Text><Text style={{ color: '#4CAF50', fontWeight: '600', marginTop: 4 }}>Uploaded</Text></View>
      ) : uploading === field ? (
        <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 32 }}>⏳</Text><Text style={{ color: '#666', marginTop: 4 }}>Uploading...</Text></View>
      ) : (
        <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 28 }}>{icon}</Text><Text style={{ color: '#666', fontWeight: '600', marginTop: 4, marginBottom: 10 }}>{label}</Text></View>
      )}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <TouchableOpacity style={rs.uploadBtn} onPress={() => fromCamera(field)}><Text style={rs.uploadBtnTxt}>📷 Camera</Text></TouchableOpacity>
        <TouchableOpacity style={rs.uploadBtn} onPress={() => fromGallery(field)}><Text style={rs.uploadBtnTxt}>🖼️ Gallery</Text></TouchableOpacity>
      </View>
    </View>
  );

  // ══════════════════════════════════════════════
  //  REGISTRATION STEPS
  // ══════════════════════════════════════════════
  if (screen === 'login' && regStep === 1) return (
    <View style={s.screen}>
      <View style={rs.regHeader}><TouchableOpacity onPress={() => setRegStep(0)}><Text style={{ color: '#fff', fontSize: 16 }}>← Back</Text></TouchableOpacity><Text style={rs.regTitle}>Step 1 of 5</Text><View style={{ width: 50 }} /></View>
      <ScrollView style={{ flex: 1, padding: 20 }}>
        <Text style={rs.bigTitle}>📱 Phone Number</Text><Text style={rs.subTitle}>Aapka mobile number daalo</Text>
        <View style={[s.driverItem, { marginTop: 20 }]}>
          <Text style={{ fontSize: 16, marginRight: 8 }}>🇮🇳 +91</Text>
          <TextInput style={{ flex: 1, fontSize: 18 }} placeholder="10 digit number" keyboardType="numeric" maxLength={10} value={regData.phone} onChangeText={(v) => updateReg('phone', v)} />
        </View>
        {result ? <Text style={s.err}>{result}</Text> : null}
        <TouchableOpacity style={[s.btn, regData.phone.length !== 10 && { opacity: 0.5 }]} disabled={regData.phone.length !== 10} onPress={() => { setResult(''); setRegStep(2); }}><Text style={s.btnTxt}>Aage badho →</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );

  if (screen === 'login' && regStep === 2) return (
    <View style={s.screen}>
      <View style={rs.regHeader}><TouchableOpacity onPress={() => setRegStep(1)}><Text style={{ color: '#fff', fontSize: 16 }}>← Back</Text></TouchableOpacity><Text style={rs.regTitle}>Step 2 of 5</Text><View style={{ width: 50 }} /></View>
      <ScrollView style={{ flex: 1, padding: 20 }}>
        <Text style={rs.bigTitle}>🚗 Vehicle Type</Text><Text style={rs.subTitle}>Aap kya chalate hain?</Text>
        {[{ id:'bike', icon:'🏍️', label:'Bike' },{ id:'auto', icon:'🛺', label:'Auto' },{ id:'car', icon:'🚕', label:'Car / Taxi' },{ id:'eriksha', icon:'🛵', label:'E-Riksha' }].map(v => (
          <TouchableOpacity key={v.id} style={[rs.vehBox, regData.vehicle_type === v.id && rs.vehBoxActive]} onPress={() => updateReg('vehicle_type', v.id)}>
            <Text style={{ fontSize: 32, marginRight: 16 }}>{v.icon}</Text>
            <Text style={[{ fontSize: 18, fontWeight: '600', color: '#1a1a2e' }, regData.vehicle_type === v.id && { color: '#fff' }]}>{v.label}</Text>
            {regData.vehicle_type === v.id && <Text style={{ color: '#fff', fontSize: 20, marginLeft: 'auto' }}>✓</Text>}
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[s.btn, !regData.vehicle_type && { opacity: 0.5 }]} disabled={!regData.vehicle_type} onPress={() => setRegStep(3)}><Text style={s.btnTxt}>Aage badho →</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );

  if (screen === 'login' && regStep === 3) return (
    <View style={s.screen}>
      <View style={rs.regHeader}><TouchableOpacity onPress={() => setRegStep(2)}><Text style={{ color: '#fff', fontSize: 16 }}>← Back</Text></TouchableOpacity><Text style={rs.regTitle}>Step 3 of 5</Text><View style={{ width: 50 }} /></View>
      <ScrollView style={{ flex: 1, padding: 20 }}>
        <Text style={rs.bigTitle}>📄 Driving License</Text><Text style={rs.subTitle}>DL ki photo aur naam</Text>
        <View style={rs.adviceBox}>
          <Text style={rs.adviceTitle}>📸 Photo Tips:</Text>
          <Text style={rs.adviceText}>• DL ka front side clear photo lo</Text>
          <Text style={rs.adviceText}>• Achhi roshni mein photo lo</Text>
          <Text style={rs.adviceText}>• Saari details saaf dikhni chahiye</Text>
          <Text style={[rs.adviceText, { marginTop: 6, fontWeight: '600', color: '#c62828' }]}>⚠️ Har ride pe DL saath rakhna zaruri hai!</Text>
        </View>
        <Text style={rs.fieldLabel}>DL pe likha naam</Text>
        <TextInput style={rs.input} placeholder="Pura naam jaisa DL pe hai" value={regData.dl_name} onChangeText={(v) => updateReg('dl_name', v)} />
        <Text style={rs.fieldLabel}>DL Photo (front side)</Text>
        <PhotoBox field="dl_photo" label="DL Photo" icon="📄" />
        {result ? <Text style={s.err}>{result}</Text> : null}
        <TouchableOpacity style={[s.btn, (!regData.dl_name || !regData.dl_photo) && { opacity: 0.5 }]} disabled={!regData.dl_name || !regData.dl_photo} onPress={() => { setResult(''); setRegStep(4); }}><Text style={s.btnTxt}>Aage badho →</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );

  if (screen === 'login' && regStep === 4) return (
    <View style={s.screen}>
      <View style={rs.regHeader}><TouchableOpacity onPress={() => setRegStep(3)}><Text style={{ color: '#fff', fontSize: 16 }}>← Back</Text></TouchableOpacity><Text style={rs.regTitle}>Step 4 of 5</Text><View style={{ width: 50 }} /></View>
      <ScrollView style={{ flex: 1, padding: 20 }}>
        <Text style={rs.bigTitle}>🚗 Vehicle Details</Text>
        <Text style={rs.subTitle}>{regData.vehicle_type === 'eriksha' ? 'E-Riksha: photo zaruri, number optional' : 'Vehicle number aur front photo'}</Text>
        <Text style={rs.fieldLabel}>Vehicle Number {regData.vehicle_type === 'eriksha' ? '(optional)' : ''}</Text>
        <TextInput style={rs.input} placeholder="UP32 AB 1234" autoCapitalize="characters" value={regData.vehicle_no} onChangeText={(v) => updateReg('vehicle_no', v)} />
        <Text style={rs.fieldLabel}>Vehicle Front Photo</Text><PhotoBox field="vehicle_photo" label="Vehicle Photo" icon="🚗" />
        <Text style={rs.fieldLabel}>RC Photo (optional)</Text><PhotoBox field="rc_photo" label="RC Photo" icon="📋" />
        {result ? <Text style={s.err}>{result}</Text> : null}
        <TouchableOpacity
          style={[s.btn, (() => { const n = regData.vehicle_type !== 'eriksha'; return !(regData.vehicle_photo && (!n || regData.vehicle_no)) ? { opacity: 0.5 } : {}; })()]}
          disabled={(() => { const n = regData.vehicle_type !== 'eriksha'; return !(regData.vehicle_photo && (!n || regData.vehicle_no)); })()}
          onPress={() => { setResult(''); setRegStep(5); }}><Text style={s.btnTxt}>Aage badho →</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );

  if (screen === 'login' && regStep === 5) return (
    <View style={s.screen}>
      <View style={rs.regHeader}><TouchableOpacity onPress={() => setRegStep(4)}><Text style={{ color: '#fff', fontSize: 16 }}>← Back</Text></TouchableOpacity><Text style={rs.regTitle}>Step 5 of 5</Text><View style={{ width: 50 }} /></View>
      <ScrollView style={{ flex: 1, padding: 20 }}>
        <Text style={rs.bigTitle}>🪪 Aadhaar & Photo</Text><Text style={rs.subTitle}>Last step!</Text>
        <Text style={rs.fieldLabel}>Aadhaar Number</Text>
        <TextInput style={rs.input} placeholder="12 digit Aadhaar" keyboardType="numeric" maxLength={12} value={regData.aadhaar_number} onChangeText={(v) => updateReg('aadhaar_number', v)} />
        <Text style={rs.fieldLabel}>Aadhaar Photo</Text><PhotoBox field="aadhaar_photo" label="Aadhaar Photo" icon="🪪" />
        <Text style={rs.fieldLabel}>Apni Selfie / Face Photo</Text><PhotoBox field="face_photo" label="Face Photo" icon="🤳" />
        {result ? <Text style={s.err}>{result}</Text> : null}
        <TouchableOpacity style={[s.btn, (!regData.aadhaar_number || !regData.aadhaar_photo || !regData.face_photo) && { opacity: 0.5 }]}
          disabled={!regData.aadhaar_number || !regData.aadhaar_photo || !regData.face_photo || loading} onPress={submitRegistration}>
          <Text style={s.btnTxt}>{loading ? 'Submit ho raha hai...' : '✅ Registration Submit Karo'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  if (screen === 'login' && regStep === 99) return (
    <View style={s.screen}>
      <View style={s.hero}><Text style={{ fontSize: 70 }}>🎉</Text><Text style={s.heroTitle}>Registration Done!</Text></View>
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Text style={{ fontSize: 16, color: '#333', textAlign: 'center', lineHeight: 24 }}>Aapki application submit ho gayi! ✅{'\n\n'}Admin aapke documents verify karega.</Text>
        <View style={{ backgroundColor: '#fff3e0', borderRadius: 12, padding: 16, marginTop: 20, width: '100%' }}>
          <Text style={{ color: '#ef6c00', textAlign: 'center', fontWeight: '600' }}>⏳ Status: Verification Pending</Text>
        </View>
        <TouchableOpacity style={[s.btn, { marginTop: 30, width: '100%' }]} onPress={() => { setRegStep(0); setPhone(regData.phone); }}>
          <Text style={s.btnTxt}>🏠 Login Screen pe jao</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ══════════════════════════════════════════════
  //  VERIFICATION STATUS
  // ══════════════════════════════════════════════
  if (screen === 'login' && driverInfo && driverInfo.status !== 'approved') return (
    <View style={s.screen}>
      <View style={s.hero}>
        <Text style={{ fontSize: 70 }}>{driverInfo.status === 'pending' ? '⏳' : driverInfo.status === 'suspended' ? '🚫' : '⚠️'}</Text>
        <Text style={s.heroTitle}>{driverInfo.status === 'pending' ? 'Verification Pending' : driverInfo.status === 'suspended' ? 'Account Suspended' : 'Documents Reject'}</Text>
      </View>
      <View style={{ padding: 24 }}>
        <View style={{ backgroundColor: driverInfo.status === 'pending' ? '#fff3e0' : '#ffebee', borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <Text style={{ fontSize: 15, lineHeight: 24, textAlign: 'center', color: driverInfo.status === 'pending' ? '#ef6c00' : '#c62828' }}>
            {driverInfo.status === 'pending' && 'Aapke documents admin verify kar raha hai.'}
            {driverInfo.status === 'rejected' && 'Aapke documents mein kuch problem hai.'}
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
          <TouchableOpacity style={s.btn} onPress={() => { setRegData((p: any) => ({ ...p, phone: driverInfo.phone })); setDriverInfo(null); setRegStep(1); }}>
            <Text style={s.btnTxt}>📄 Documents Dobara Upload Karo</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[s.btn, { backgroundColor: '#1a1a2e' }]} onPress={() => { setDriverInfo(null); setLoginPhone(''); setResult(''); }}>
          <Text style={s.btnTxt}>← Wapas Login pe jao</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ══════════════════════════════════════════════
  //  LOGIN SCREEN
  // ══════════════════════════════════════════════
  if (screen === 'login') return (
    <View style={s.screen}>
      <View style={s.hero}><Text style={s.heroIcon}>🚖</Text><Text style={s.heroTitle}>RideApp Driver</Text><Text style={s.heroSub}>Spero Buddy Login</Text></View>
      <ScrollView style={{ flex: 1, padding: 16 }}>
        <Text style={s.sectionTitle}>📱 Apne number se login karo:</Text>
        <View style={[s.driverItem, { marginBottom: 12 }]}>
          <Text style={{ fontSize: 16, marginRight: 8 }}>🇮🇳 +91</Text>
          <TextInput style={{ flex: 1, fontSize: 18 }} placeholder="10 digit number" keyboardType="numeric" maxLength={10} value={loginPhone} onChangeText={setLoginPhone} />
        </View>
        <TouchableOpacity style={[s.btn, { marginTop: 0, marginBottom: 16 }, loginPhone.length !== 10 && { opacity: 0.5 }]} disabled={loginPhone.length !== 10 || loading} onPress={doLogin}>
          <Text style={s.btnTxt}>{loading ? 'Login ho raha hai...' : 'Login Karo 🚀'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ borderWidth: 2, borderColor: '#e94560', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 20 }} onPress={() => { setRegStep(1); setResult(''); }}>
          <Text style={{ color: '#e94560', fontSize: 16, fontWeight: 'bold' }}>🆕 Naya Spero Buddy Banein</Text>
        </TouchableOpacity>
        {result ? <Text style={s.err}>{result}</Text> : null}
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
      </ScrollView>
    </View>
  );

  // ══════════════════════════════════════════════
  //  TRIP SUMMARY
  // ══════════════════════════════════════════════
  if (tripSummary) return (
    <View style={s.screen}>
      <View style={[s.hero, { paddingTop: 50 }]}><Text style={{ fontSize: 60 }}>🎉</Text><Text style={s.heroTitle}>Trip Complete!</Text></View>
      <ScrollView style={{ flex: 1, padding: 16 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, elevation: 4, marginBottom: 16 }}>
          <Text style={[s.sectionTitle, { marginBottom: 16 }]}>💰 Earning Summary</Text>
          {[['Passenger', tripSummary.passenger || 'Customer'],
            ['Route', (tripSummary.pickup||'').substring(0,18) + ' → ' + (tripSummary.drop||'').substring(0,14)],
            ['Total Fare', '₹' + tripSummary.fare],
            ['Platform Fee (15%)', tripSummary.fee],
            ['Aapki Kamai', tripSummary.earned]].map(([k, v], i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: '#f5f5f5' }}>
              <Text style={{ fontSize: 14, color: '#666' }}>{k}</Text>
              <Text style={{ fontSize: 14, fontWeight: i === 4 ? 'bold' : '500', color: i === 4 ? '#4CAF50' : '#333' }}>{v}</Text>
            </View>
          ))}
        </View>
        <View style={{ backgroundColor: '#e8f5e9', borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 14, color: '#2e7d32', fontWeight: '600', textAlign: 'center' }}>💚 Paisa wallet mein add ho gaya!</Text>
        </View>
        <TouchableOpacity style={[s.btn, { backgroundColor: '#4CAF50' }]} onPress={() => setTripSummary(null)}>
          <Text style={s.btnTxt}>🏠 Next Ride ke liye Ready</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  // ══════════════════════════════════════════════
  //  HOME TAB
  // ══════════════════════════════════════════════
  if (activeTab === 'home') return (
    <View style={s.screen}>
      <View style={s.topBar}>
        <View>
          <Text style={s.greeting}>{isOnline ? '🟢 Online' : '🔴 Offline'}</Text>
          <Text style={s.subTxt}>{driverInfo?.name || selectedDriver?.name} · {driverInfo?.vehicle_no || selectedDriver?.vehicle}</Text>
        </View>
        <Switch value={isOnline} onValueChange={toggleOnline} trackColor={{ true: '#4CAF50', false: '#e0e0e0' }} />
      </View>

      {/* Map */}
      <MapWebView
        pickup={activeRide ? activeRide.pickup : 'Lucknow,India'}
        drop={activeRide ? activeRide.drop_location : ''}
        height={activeRide ? 160 : 180}
      />

      <ScrollView style={{ flex: 1, padding: 16 }}>
        <View style={s.statsRow}>
          <View style={s.statCard}><Text style={s.statIcon}>💰</Text><Text style={s.statValue}>₹{earnings.toFixed(0)}</Text><Text style={s.statLabel}>Aaj ki kamai</Text></View>
          <View style={s.statCard}><Text style={s.statIcon}>🚗</Text><Text style={s.statValue}>{rides}</Text><Text style={s.statLabel}>Rides</Text></View>
          <View style={s.statCard}><Text style={s.statIcon}>⭐</Text><Text style={s.statValue}>{driverInfo?.rating || '4.8'}</Text><Text style={s.statLabel}>Rating</Text></View>
        </View>

        {/* Active Ride */}
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
            <View style={s.tripRoute}>
              <Text style={s.tripFrom}>📍 {activeRide.pickup}</Text>
              <Text style={s.tripArrow}>↓</Text>
              <Text style={s.tripTo}>🎯 {activeRide.drop_location}</Text>
            </View>
            {eta ? <View style={{ backgroundColor: '#e8f5e9', borderRadius: 8, padding: 8, marginBottom: 10, alignItems: 'center' }}><Text style={{ color: '#2e7d32', fontWeight: '600', fontSize: 13 }}>🕐 {eta}</Text></View> : null}

            {/* Navigate buttons */}
            {(activeRide.status === 'matched' || activeRide.status === 'arrived') && (
              <TouchableOpacity style={s.navBtn} onPress={() => navigateTo(activeRide.pickup)}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>🗺️ Pickup Navigate Karo</Text>
              </TouchableOpacity>
            )}
            {activeRide.status === 'started' && (
              <TouchableOpacity style={s.navBtn} onPress={() => navigateTo(activeRide.drop_location)}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>🗺️ Drop Navigate Karo</Text>
              </TouchableOpacity>
            )}

            {activeRide.status === 'matched' && (
              <TouchableOpacity style={s.tripBtn} onPress={markArrived} disabled={loading}>
                <Text style={s.tripBtnTxt}>{loading ? '...' : '📍 Pickup pe pahunch gaya'}</Text>
              </TouchableOpacity>
            )}
            {activeRide.status === 'arrived' && (
              <View>
                <Text style={{ fontSize: 13, color: '#666', marginBottom: 8, textAlign: 'center' }}>🔐 Passenger se OTP poocho</Text>
                <TextInput style={{ borderWidth: 2, borderColor: '#1a1a2e', borderRadius: 10, padding: 14, fontSize: 24, textAlign: 'center', letterSpacing: 8, marginBottom: 10, fontWeight: 'bold' }}
                  placeholder="0000" keyboardType="number-pad" maxLength={4} value={otpInput} onChangeText={setOtpInput} />
                <TouchableOpacity style={s.tripBtn} onPress={startTrip} disabled={loading}>
                  <Text style={s.tripBtnTxt}>{loading ? '...' : '🚀 OTP Verify & Trip Shuru'}</Text>
                </TouchableOpacity>
              </View>
            )}
            {activeRide.status === 'started' && (
              <TouchableOpacity style={[s.tripBtn, { backgroundColor: '#4CAF50' }]} onPress={completeTrip} disabled={loading}>
                <Text style={s.tripBtnTxt}>{loading ? '...' : '✅ Trip Complete Karo'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.cancelBtn} onPress={cancelTrip} disabled={loading}><Text style={s.cancelTxt}>Cancel Trip</Text></TouchableOpacity>
          </View>
        )}

        {/* Ride Request */}
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
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </View>
  );

  // ══════════════════════════════════════════════
  //  EARNINGS TAB
  // ══════════════════════════════════════════════
  if (activeTab === 'earnings') return (
    <View style={s.screen}>
      <View style={s.topBar}><Text style={s.greeting}>💰 Earnings</Text></View>
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
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </View>
  );

  // ══════════════════════════════════════════════
  //  PROFILE TAB
  // ══════════════════════════════════════════════
  return (
    <View style={s.screen}>
      <View style={s.topBar}><Text style={s.greeting}>👤 Profile</Text></View>
      <ScrollView style={{ flex: 1, padding: 16 }}>
        <View style={s.profileHero}>
          <View style={s.profileAvatar}><Text style={{ color: '#fff', fontSize: 36, fontWeight: 'bold' }}>{(driverInfo?.name || selectedDriver?.name || 'D')[0].toUpperCase()}</Text></View>
          <Text style={s.profileName}>{driverInfo?.name || selectedDriver?.name}</Text>
          <Text style={s.profilePhone}>+91 {phone}</Text>
          <Text style={s.profileVehicle}>{driverInfo?.vehicle_type || selectedDriver?.type} · {driverInfo?.vehicle_no || selectedDriver?.vehicle}</Text>
          <View style={s.badge}><Text style={{ color: '#fff', fontWeight: 'bold' }}>⭐ {driverInfo?.rating || '4.8'}</Text></View>
        </View>
        {[['📋','Documents','License, RC, Insurance'],['🏦','Bank Details','Payout account'],['📞','Support','24x7 help'],['⚙️','Settings','Preferences']].map(([icon,title,sub],i) => (
          <TouchableOpacity key={i} style={s.menuItem}>
            <Text style={{ fontSize: 22, marginRight: 14 }}>{icon}</Text>
            <View style={{ flex: 1 }}><Text style={{ fontSize: 15, color: '#1a1a2e', fontWeight: '500' }}>{title}</Text><Text style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{sub}</Text></View>
            <Text style={{ fontSize: 20, color: '#ccc' }}>›</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={s.logoutBtn} onPress={async () => {
          await AsyncStorage.removeItem('driverPhone');
          await AsyncStorage.removeItem('driverInfo');
          setScreen('login'); setIsOnline(false); stopPolling(); setDriverInfo(null); setPhone('');
        }}>
          <Text style={{ color: '#e94560', fontWeight: 'bold', fontSize: 15 }}>🚪 Logout</Text>
        </TouchableOpacity>
      </ScrollView>
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
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

function BottomNav({ activeTab, setActiveTab }: any) {
  return (
    <View style={s.nav}>
      {[['home','🏠','Home'],['earnings','💰','Earnings'],['profile','👤','Profile']].map(([t,icon,lbl]) => (
        <TouchableOpacity key={t} style={s.navItem} onPress={() => setActiveTab(t)}>
          <Text style={s.navIcon}>{icon}</Text>
          <Text style={[s.navLbl, activeTab===t && s.navActive]}>{lbl}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  screen:          { flex:1, backgroundColor:'#f5f5f5' },
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
  btn:             { backgroundColor:'#e94560', borderRadius:12, padding:16, alignItems:'center', marginTop:16, marginBottom:30 },
  btnTxt:          { color:'#fff', fontSize:16, fontWeight:'bold' },
  err:             { textAlign:'center', color:'#e94560', marginVertical:10 },
  topBar:          { backgroundColor:'#1a1a2e', flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:16, paddingTop:48 },
  greeting:        { color:'#fff', fontSize:18, fontWeight:'bold' },
  subTxt:          { color:'#aaa', fontSize:12, marginTop:2 },
  statsRow:        { flexDirection:'row', gap:10, marginBottom:16 },
  statCard:        { flex:1, backgroundColor:'#fff', borderRadius:14, padding:14, alignItems:'center', elevation:2 },
  statIcon:        { fontSize:24 },
  statValue:       { fontSize:20, fontWeight:'bold', color:'#1a1a2e', marginTop:4 },
  statLabel:       { fontSize:11, color:'#999', marginTop:2 },
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
  tripRoute:       { backgroundColor:'#f9f9f9', borderRadius:10, padding:12, marginBottom:12 },
  tripFrom:        { fontSize:14, color:'#4CAF50', fontWeight:'600' },
  tripArrow:       { fontSize:16, textAlign:'center', color:'#999', marginVertical:4 },
  tripTo:          { fontSize:14, color:'#e94560', fontWeight:'600' },
  tripBtn:         { backgroundColor:'#1a1a2e', borderRadius:10, padding:16, alignItems:'center', marginBottom:8 },
  tripBtnTxt:      { color:'#fff', fontWeight:'bold', fontSize:16 },
  navBtn:          { backgroundColor:'#2196F3', borderRadius:10, padding:12, alignItems:'center', marginBottom:10 },
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
  acceptTxt:       { color:'#fff', fontWeight:'bold', fontSize:16 },
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
  photoBox:    { borderWidth:2, borderColor:'#e0e0e0', borderStyle:'dashed', borderRadius:14, padding:24, alignItems:'center', backgroundColor:'#fafafa' },
  vehBox:      { flexDirection:'row', alignItems:'center', backgroundColor:'#fff', borderRadius:14, padding:18, marginBottom:12, elevation:2, borderWidth:2, borderColor:'transparent' },
  vehBoxActive:{ backgroundColor:'#1a1a2e', borderColor:'#e94560' },
  uploadBtn:   { flex:1, backgroundColor:'#1a1a2e', borderRadius:8, padding:10, alignItems:'center' },
  uploadBtnTxt:{ color:'#fff', fontWeight:'600', fontSize:13 },
  adviceBox:   { backgroundColor:'#e3f2fd', borderRadius:12, padding:14, marginTop:14, marginBottom:6 },
  adviceTitle: { fontSize:14, fontWeight:'bold', color:'#1565c0', marginBottom:6 },
  adviceText:  { fontSize:13, color:'#1976d2', marginTop:2 },
});
