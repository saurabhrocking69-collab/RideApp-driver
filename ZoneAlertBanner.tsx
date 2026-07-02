import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from './theme';

export type ZoneAlert = {
  from: string;
  alertType: string;
  message: string;
  distKm: number;
  sentAt: string;
};

const ALERT_META: Record<string, { icon: string; color: string; label: string }> = {
  police:   { icon: 'shield-checkmark', color: C.red,      label: 'Police Check' },
  traffic:  { icon: 'car',              color: '#F97316',  label: 'Traffic Jam' },
  demand:   { icon: 'trending-up',      color: C.green,    label: 'High Demand' },
  accident: { icon: 'warning',          color: '#EAB308',  label: 'Accident' },
  closed:   { icon: 'close-circle',     color: C.textMuted, label: 'Road Closed' },
};

interface Props {
  alert: ZoneAlert | null;
  onDismiss: () => void;
}

export function ZoneAlertBanner({ alert, onDismiss }: Props) {
  const slideAnim = useRef(new Animated.Value(-110)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissingRef = useRef(false);

  useEffect(() => {
    if (!alert) return;
    dismissingRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 90, friction: 11 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    timerRef.current = setTimeout(() => dismiss(), 8000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [alert?.sentAt]);

  const dismiss = () => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: -110, duration: 250, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onDismiss());
  };

  if (!alert) return null;

  const meta = ALERT_META[alert.alertType] ?? ALERT_META['traffic'];

  return (
    <Animated.View style={{
      position: 'absolute', top: 0, left: 12, right: 12,
      transform: [{ translateY: slideAnim }],
      opacity: opacityAnim,
      zIndex: 9999,
    }}>
      <View style={{
        backgroundColor: C.bgDark,
        borderRadius: 20,
        overflow: 'hidden',
        elevation: 18,
        shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 18,
      }}>
        {/* Alert type color strip */}
        <View style={{ backgroundColor: meta.color, height: 4 }} />

        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
          {/* Icon */}
          <View style={{
            width: 48, height: 48, borderRadius: 16,
            backgroundColor: meta.color + '22',
            borderWidth: 1.5, borderColor: meta.color + '55',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name={meta.icon as any} size={24} color={meta.color} />
          </View>

          {/* Content */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <View style={{
                backgroundColor: meta.color + '33',
                borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
              }}>
                <Text style={{ color: meta.color, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 }}>
                  {meta.label.toUpperCase()}
                </Text>
              </View>
              <Text style={{ color: C.textMuted, fontSize: 10 }}>{alert.distKm} km door</Text>
            </View>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 18 }}>
              {alert.message || `Driver ${alert.from} ne alert bheja`}
            </Text>
            <Text style={{ color: C.textDim, fontSize: 10, marginTop: 3 }}>
              Driver {alert.from} · nearby zone
            </Text>
          </View>

          {/* Dismiss */}
          <TouchableOpacity onPress={() => { if (timerRef.current) clearTimeout(timerRef.current); dismiss(); }}
            style={{ padding: 6 }}>
            <Ionicons name="close" size={18} color="#475569" />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// ── Zone Alert Sender — full-screen Modal card ────────────────────────────────
const ALERT_TYPES = [
  { key: 'police',   emoji: '🚔', label: 'Police Check', desc: 'Police nakabandi hai aage', color: C.red },
  { key: 'traffic',  emoji: '🚧', label: 'Traffic Jam',  desc: 'Rasta bhara hua hai',       color: '#F97316' },
  { key: 'demand',   emoji: '🔥', label: 'High Demand',  desc: 'Rides bahut aa rahi hain',  color: C.green },
  { key: 'accident', emoji: '⚠️', label: 'Accident',     desc: 'Hadsa hua hai, sambhal ke', color: '#EAB308' },
  { key: 'closed',   emoji: '🚫', label: 'Road Closed',  desc: 'Rasta band hai, doosra lo', color: C.textMuted },
];

const HOW_IT_WORKS = [
  { icon: '📡', text: '3km ke andar ke sabhi online Sppero Buddy ko alert milta hai' },
  { icon: '⚡', text: 'Real-time — 1 second mein sabke phone pe notification' },
  { icon: '🤝', text: 'Ek dusre ki madad karo — team Sppero' },
];

interface SenderProps {
  visible: boolean;
  onSend: (alertType: string, message: string) => void;
  onClose: () => void;
  sentCount: number | null;
}

export function ZoneAlertSender({ visible, onSend, onClose, sentCount }: SenderProps) {
  const scaleAnim   = useRef(new Animated.Value(0.88)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [selected, setSelected] = useState<string | null>(null);
  const [showSent, setShowSent] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelected(null); setShowSent(false);
      Animated.parallel([
        Animated.spring(scaleAnim,   { toValue: 1,   useNativeDriver: true, tension: 80, friction: 10 }),
        Animated.timing(opacityAnim, { toValue: 1,   duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim,   { toValue: 0.88, duration: 180, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0,    duration: 160, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  useEffect(() => {
    if (sentCount !== null) {
      setShowSent(true);
      setTimeout(() => { setShowSent(false); onClose(); }, 2200);
    }
  }, [sentCount]);

  const handleSend = (key: string) => {
    setSelected(key);
    const meta = ALERT_TYPES.find(a => a.key === key)!;
    onSend(key, `${meta.emoji} ${meta.label} — ${meta.desc}`);
    // Clear sending indicator after 5s if server confirmation (zoneAlertSent) never arrives
    setTimeout(() => setSelected(s => s === key ? null : s), 5000);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}
      >
        {/* Card — stop propagation so taps inside don't close */}
        <Animated.View
          style={{ width: '100%', transform: [{ scale: scaleAnim }], opacity: opacityAnim }}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{
              backgroundColor: C.bgDark,
              borderRadius: 28,
              overflow: 'hidden',
              elevation: 32,
              shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24,
            }}>
              {/* Top color accent strip */}
              <View style={{ height: 4, backgroundColor: C.pink }} />

              <View style={{ padding: 20 }}>
                {/* Header row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: -0.3 }}>📡 Zone Alert Bhejo</Text>
                    <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 3 }}>3km ke andar sabhi Sppero Buddy ko</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setShowInfo(s => !s)}
                    style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}
                  >
                    <Ionicons name="information-circle-outline" size={20} color={C.textDim} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={onClose}
                    style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="close" size={18} color={C.textDim} />
                  </TouchableOpacity>
                </View>

                {/* Info panel — toggleable */}
                {showInfo && (
                  <View style={{ backgroundColor: C.pinkGlass, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.pinkBorder }}>
                    <Text style={{ color: C.pink, fontSize: 12, fontWeight: '800', marginBottom: 8 }}>Ye Feature Kya Hai?</Text>
                    {HOW_IT_WORKS.map((h, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: i < HOW_IT_WORKS.length - 1 ? 6 : 0 }}>
                        <Text style={{ fontSize: 14 }}>{h.icon}</Text>
                        <Text style={{ color: C.textDim, fontSize: 11, lineHeight: 16, flex: 1 }}>{h.text}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Sent confirmation */}
                {showSent ? (
                  <View style={{ backgroundColor: C.greenGlass, borderRadius: 18, borderWidth: 1, borderColor: C.greenBorder, padding: 22, alignItems: 'center', marginVertical: 8 }}>
                    <Text style={{ fontSize: 40, marginBottom: 8 }}>✅</Text>
                    <Text style={{ color: C.green, fontSize: 17, fontWeight: '900' }}>{sentCount} Drivers Ko Bheja!</Text>
                    <Text style={{ color: C.green, fontSize: 12, marginTop: 4, opacity: 0.7 }}>Sabko real-time alert mil gaya</Text>
                  </View>
                ) : (
                  <>
                    {/* Alert type grid — 2 columns */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                      {ALERT_TYPES.map(a => {
                        const isSelected = selected === a.key;
                        return (
                          <TouchableOpacity
                            key={a.key}
                            onPress={() => handleSend(a.key)}
                            activeOpacity={0.75}
                            style={{
                              width: '47%',
                              backgroundColor: isSelected ? a.color + '28' : 'rgba(255,255,255,0.05)',
                              borderRadius: 18, padding: 16,
                              borderWidth: 1.5,
                              borderColor: isSelected ? a.color : 'rgba(255,255,255,0.1)',
                              alignItems: 'center',
                            }}
                          >
                            <Text style={{ fontSize: 28, marginBottom: 6 }}>{a.emoji}</Text>
                            <Text style={{ color: isSelected ? a.color : C.textDim, fontSize: 12, fontWeight: '900', marginBottom: 3 }}>{a.label}</Text>
                            <Text style={{ color: C.textMuted, fontSize: 10, textAlign: 'center', lineHeight: 13 }}>{a.desc}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {selected && (
                      <View style={{ marginTop: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="time-outline" size={14} color={C.textDim} />
                        <Text style={{ color: C.textDim, fontSize: 11 }}>Alert bheja ja raha hai...</Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}
