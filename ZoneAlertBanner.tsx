import { useEffect, useRef, useState } from 'react';
import { Animated, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type ZoneAlert = {
  from: string;
  alertType: string;
  message: string;
  distKm: number;
  sentAt: string;
};

const ALERT_META: Record<string, { icon: string; color: string; label: string }> = {
  police:   { icon: 'shield-checkmark', color: '#EF4444', label: 'Police Check' },
  traffic:  { icon: 'car',              color: '#F97316', label: 'Traffic Jam' },
  demand:   { icon: 'trending-up',      color: '#16A34A', label: 'High Demand' },
  accident: { icon: 'warning',          color: '#EAB308', label: 'Accident' },
  closed:   { icon: 'close-circle',     color: '#64748B', label: 'Road Closed' },
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
        backgroundColor: '#0F172A',
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
              <Text style={{ color: '#64748B', fontSize: 10 }}>{alert.distKm} km door</Text>
            </View>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 18 }}>
              {alert.message || `Driver ${alert.from} ne alert bheja`}
            </Text>
            <Text style={{ color: '#475569', fontSize: 10, marginTop: 3 }}>
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

// ── Quick alert sender panel ──────────────────────────────────────────────────
const ALERT_TYPES = [
  { key: 'police',   emoji: '🚔', label: 'Police',  color: '#EF4444' },
  { key: 'traffic',  emoji: '🚧', label: 'Traffic', color: '#F97316' },
  { key: 'demand',   emoji: '🔥', label: 'Demand',  color: '#16A34A' },
  { key: 'accident', emoji: '⚠️', label: 'Accident',color: '#EAB308' },
  { key: 'closed',   emoji: '🚫', label: 'Closed',  color: '#64748B' },
];

interface SenderProps {
  visible: boolean;
  onSend: (alertType: string, message: string) => void;
  onClose: () => void;
  sentCount: number | null;
}

export function ZoneAlertSender({ visible, onSend, onClose, sentCount }: SenderProps) {
  const slideAnim = useRef(new Animated.Value(300)).current;
  const [selected, setSelected] = useState<string | null>(null);
  const [showSent, setShowSent] = useState(false);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : 300,
      useNativeDriver: true, tension: 80, friction: 12,
    }).start();
    if (!visible) { setSelected(null); setShowSent(false); }
  }, [visible]);

  useEffect(() => {
    if (sentCount !== null) {
      setShowSent(true);
      setTimeout(() => { setShowSent(false); onClose(); }, 2000);
    }
  }, [sentCount]);

  const handleSend = (key: string) => {
    setSelected(key);
    const meta = ALERT_TYPES.find(a => a.key === key)!;
    onSend(key, `${meta.emoji} ${meta.label} alert — apna dhyan rakho!`);
  };

  return (
    <Animated.View style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      transform: [{ translateY: slideAnim }],
      zIndex: 9998,
    }}>
      <View style={{
        backgroundColor: '#0F172A',
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        paddingTop: 10, paddingBottom: 34, paddingHorizontal: 20,
        elevation: 24,
      }}>
        {/* Drag handle */}
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#334155', alignSelf: 'center', marginBottom: 18 }} />

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>Zone Alert Bhejo</Text>
            <Text style={{ color: '#64748B', fontSize: 12, marginTop: 3 }}>3km ke andar sabhi drivers ko</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{
            width: 34, height: 34, borderRadius: 10,
            backgroundColor: 'rgba(255,255,255,0.08)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name="close" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* Sent confirmation */}
        {showSent && (
          <View style={{
            backgroundColor: '#16A34A22', borderRadius: 14,
            borderWidth: 1, borderColor: '#16A34A55',
            padding: 14, marginBottom: 16, alignItems: 'center',
          }}>
            <Text style={{ color: '#4ADE80', fontSize: 15, fontWeight: '800' }}>
              ✅ {sentCount} drivers ko bheja gaya!
            </Text>
          </View>
        )}

        {/* Alert type grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {ALERT_TYPES.map(a => {
            const isSelected = selected === a.key;
            return (
              <TouchableOpacity
                key={a.key}
                onPress={() => handleSend(a.key)}
                activeOpacity={0.75}
                style={{
                  flex: 1, minWidth: '28%',
                  backgroundColor: isSelected ? a.color + '33' : 'rgba(255,255,255,0.06)',
                  borderRadius: 16, padding: 14,
                  borderWidth: 1.5,
                  borderColor: isSelected ? a.color : 'rgba(255,255,255,0.1)',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 26, marginBottom: 6 }}>{a.emoji}</Text>
                <Text style={{ color: isSelected ? a.color : '#CBD5E1', fontSize: 11, fontWeight: '800' }}>
                  {a.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}
