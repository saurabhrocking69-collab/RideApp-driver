import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Animated, Text, TouchableOpacity, View } from 'react-native';
import * as Updates from 'expo-updates';

/* "Update ready — tap to restart", driver side.
 *
 * The app runs `checkAutomatically: ON_LOAD` with `fallbackToCacheTimeout: 0`:
 * it never waits on the network, it starts on the JS it already has and fetches
 * the new bundle in the background. Nothing applied it, so new code only ran on
 * the next COLD start — and a driver's app is online all day and rarely killed,
 * so that could be a week. A shipped fix looked like it had never shipped, and
 * nothing on screen said an update was sitting there, downloaded.
 *
 * Two deliberate differences from the customer app's version:
 *
 *   1. During a live trip the restart is not offered at all — only the fact of
 *      the update is. reloadAsync() tears down the JS context; doing that to
 *      someone riding to a drop, mid-navigation, with an OTP half-typed, is not
 *      a thing to leave one stray tap away. It waits.
 *
 *   2. English, always. Per the standing rule, alerts and transient messages
 *      stay English regardless of the driver's language toggle.
 */
/* Launch ke alawa bhi poochho.

   `checkAutomatically: ON_LOAD` sirf launch par poochhta hai. Driver ka app
   ghanton khula rehta hai aur Android us process ko maarta nahi - to launch ke
   baad wo dobara poochhta hi nahi, aur ek poori shift bina jaanch ke nikal
   jaati hai. Naapa gaya: teen update publish ho chuke the, Expo unhe de bhi
   raha tha, aur app purane par hi khada tha.

   Sirf poochhna aur utaarna. Lagana aadmi ke tap par hi rehta hai. */
function useUpdateWatch() {
  useEffect(() => {
    if (!Updates.isEnabled) return;   // dev aur Expo Go me kuch nahi karna
    let dead = false;
    const look = async () => {
      try {
        const r = await Updates.checkForUpdateAsync();
        if (!dead && r.isAvailable) await Updates.fetchUpdateAsync();
      } catch (_e) { /* net nahi hai ya server chup hai - agli baar */ }
    };
    const sub = AppState.addEventListener('change', s => { if (s === 'active') look(); });
    const iv = setInterval(look, 15 * 60 * 1000);
    look();
    return () => { dead = true; sub.remove(); clearInterval(iv); };
  }, []);
}

export function UpdateBanner({ busyWithRide }: { busyWithRide: boolean }) {
  useUpdateWatch();
  const { isUpdatePending } = Updates.useUpdates();
  const [applying, setApplying] = useState(false);
  const slide = useRef(new Animated.Value(-70)).current;

  // isEnabled is false in dev and Expo Go, where a reload achieves nothing.
  const show = Updates.isEnabled && isUpdatePending;

  // Animate from an effect. Starting it during render re-fires on every render,
  // and this screen re-renders on every GPS tick.
  useEffect(() => {
    if (show) Animated.spring(slide, { toValue: 0, useNativeDriver: true, tension: 70, friction: 11 }).start();
    else slide.setValue(-70);
  }, [show]);

  if (!show) return null;

  const apply = async () => {
    if (applying || busyWithRide) return;
    setApplying(true);
    try {
      await Updates.reloadAsync();
    } catch {
      setApplying(false);
    }
  };

  return (
    <Animated.View style={{
      position: 'absolute', top: 0, left: 0, right: 0, zIndex: 997,
      transform: [{ translateY: slide }],
    }}>
      <TouchableOpacity
        onPress={apply}
        activeOpacity={busyWithRide ? 1 : 0.85}
        disabled={busyWithRide}
        style={{
          backgroundColor: busyWithRide ? '#475569' : '#16A34A',
          paddingTop: 44, paddingBottom: 10, paddingHorizontal: 16,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          elevation: 20, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 8,
        }}
      >
        {applying ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '800' }}>
              {busyWithRide ? '⬆️  Update ready' : '⬆️  Update ready — tap to restart'}
            </Text>
            {busyWithRide && (
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 10.5, fontWeight: '600', marginTop: 2 }}>
                It will install after this trip
              </Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}
