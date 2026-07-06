import { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from './theme';

const NAV_BLUE = '#1A73E8';

// metres → "200 m" / "1.2 km"
function fmtDist(m: number): string {
  if (m <= 0) return '';
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 50) * 50 || 50} m`;
}

function turnIconName(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('left'))       return 'arrow-back';
  if (t.includes('right'))      return 'arrow-forward';
  if (t.includes('u-turn'))     return 'return-up-back';
  if (t.includes('straight') || t.includes('continue')) return 'arrow-up';
  if (t.includes('arrive') || t.includes('destination')) return 'location';
  if (t.includes('roundabout') || t.includes('circle')) return 'refresh';
  return 'arrow-up';
}

interface Props {
  instruction: string;
  nextDistM:   number;
  phase:       'to_pickup' | 'to_drop';
  onMute:      () => void;
  muted:       boolean;
  visible:     boolean;
}

export function VoiceNavBar({ instruction, nextDistM, phase, onMute, muted, visible }: Props) {
  const slideAnim = useRef(new Animated.Value(-160)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : -160,
      useNativeDriver: true,
      tension: 80, friction: 12,
    }).start();
  }, [visible]);

  // Subtle scale pulse when instruction text changes — draws driver's eye
  useEffect(() => {
    if (!instruction) return;
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.015, duration: 160, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1,     duration: 160, useNativeDriver: true }),
    ]).start();
  }, [instruction]);

  if (!visible) return null;

  const dist    = fmtDist(nextDistM);
  const urgent  = nextDistM > 0 && nextDistM < 100;   // < 100m = turn imminent → red
  const icon    = turnIconName(instruction);
  const isPickup = phase === 'to_pickup';
  const phaseLabel = isPickup ? 'PICKUP KI TARAF' : 'DROP KI TARAF';

  return (
    <Animated.View style={{ transform: [{ translateY: slideAnim }], marginHorizontal: 10 }}>
      <View style={{
        backgroundColor: '#0D1117',
        borderRadius: 20,
        overflow: 'hidden',
        elevation: 22,
        shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 20,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
      }}>
        {/* Phase colour bar — top edge */}
        <View style={{ height: 4, backgroundColor: isPickup ? C.green : NAV_BLUE }} />

        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 14 }}>

          {/* ── Turn direction icon ── */}
          <View style={{
            width: 64, height: 64, borderRadius: 18,
            backgroundColor: `${NAV_BLUE}18`,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: `${NAV_BLUE}45`,
          }}>
            <Ionicons name={icon as any} size={34} color={NAV_BLUE} />
          </View>

          {/* ── Main content ── */}
          <Animated.View style={{ flex: 1, transform: [{ scale: pulseAnim }] }}>

            {/* Phase micro-label */}
            <Text style={{
              color: 'rgba(255,255,255,0.40)',
              fontSize: 9, fontWeight: '800', letterSpacing: 1.8,
              marginBottom: 2,
            }}>
              {phaseLabel}
            </Text>

            {/* Distance — dominant, largest element on the bar */}
            {dist ? (
              <Text style={{
                fontSize: urgent ? 38 : 32,
                fontWeight: '900',
                color: urgent ? '#FF3B30' : NAV_BLUE,
                lineHeight: urgent ? 42 : 36,
                letterSpacing: -0.5,
              }}>
                {dist}
              </Text>
            ) : null}

            {/* Turn instruction */}
            <Text
              style={{
                color: '#E8EAED',
                fontSize: 15,
                fontWeight: '700',
                lineHeight: 20,
                marginTop: dist ? 3 : 0,
              }}
              numberOfLines={2}
            >
              {instruction || 'Route mil raha hai...'}
            </Text>

          </Animated.View>

          {/* ── Mute toggle ── */}
          <TouchableOpacity
            onPress={onMute}
            activeOpacity={0.75}
            style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: muted ? 'rgba(255,59,48,0.14)' : 'rgba(255,255,255,0.09)',
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1.5,
              borderColor: muted ? 'rgba(255,59,48,0.40)' : 'rgba(255,255,255,0.16)',
            }}>
            <Ionicons
              name={muted ? 'volume-mute' : 'volume-high'}
              size={20}
              color={muted ? '#FF3B30' : '#fff'}
            />
          </TouchableOpacity>

        </View>
      </View>
    </Animated.View>
  );
}
