import { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { C } from './theme';

// metres → "200 m" / "1.2 km"
function fmtDist(m: number): string {
  if (m <= 0) return '';
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 10) * 10} m`;
}

// Parse turn direction from instruction text for arrow icon
function turnIcon(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('left'))       return 'arrow-back';
  if (t.includes('right'))      return 'arrow-forward';
  if (t.includes('u-turn'))     return 'return-up-back';
  if (t.includes('straight'))   return 'arrow-up';
  if (t.includes('arrive'))     return 'location';
  if (t.includes('roundabout')) return 'refresh';
  return 'arrow-up';
}

interface Props {
  instruction: string;
  nextDistM: number;
  phase: 'to_pickup' | 'to_drop';
  onMute: () => void;
  muted: boolean;
  visible: boolean;
}

export function VoiceNavBar({ instruction, nextDistM, phase, onMute, muted, visible }: Props) {
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : -120,
      useNativeDriver: true,
      tension: 80, friction: 12,
    }).start();
  }, [visible]);

  // Pulse when instruction changes
  useEffect(() => {
    if (!instruction) return;
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.04, duration: 180, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1,    duration: 180, useNativeDriver: true }),
    ]).start();
  }, [instruction]);

  if (!visible) return null;

  const phaseColor = phase === 'to_pickup' ? C.green : C.pink;
  const phaseLabel = phase === 'to_pickup' ? 'Pickup ki taraf' : 'Drop ki taraf';

  return (
    <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>
      <View style={{
        backgroundColor: C.bgDark,
        marginHorizontal: 12, borderRadius: 20,
        elevation: 14, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16,
        overflow: 'hidden',
      }}>
        {/* Phase indicator strip */}
        <View style={{ backgroundColor: phaseColor, height: 3 }} />

        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
          {/* Turn icon */}
          <View style={{
            width: 52, height: 52, borderRadius: 16,
            backgroundColor: phaseColor + '22',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1.5, borderColor: phaseColor + '55',
          }}>
            <Ionicons name={turnIcon(instruction) as any} size={26} color={phaseColor} />
          </View>

          {/* Instruction + distance */}
          <Animated.View style={{ flex: 1, transform: [{ scale: pulseAnim }] }}>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 3 }}>
              {phaseLabel.toUpperCase()}
            </Text>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800', lineHeight: 19 }} numberOfLines={2}>
              {instruction || 'Route calculate ho raha hai...'}
            </Text>
            {nextDistM > 0 && (
              <Text style={{ color: phaseColor, fontSize: 18, fontWeight: '900', marginTop: 4 }}>
                {fmtDist(nextDistM)}
              </Text>
            )}
          </Animated.View>

          {/* Mute toggle */}
          <TouchableOpacity onPress={onMute} style={{
            width: 38, height: 38, borderRadius: 12,
            backgroundColor: muted ? C.redGlass : 'rgba(255,255,255,0.10)',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: muted ? C.redBorder : 'rgba(255,255,255,0.15)',
          }}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color={muted ? C.red : '#fff'} />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}
