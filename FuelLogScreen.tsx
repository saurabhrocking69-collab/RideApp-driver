import { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, Text, TextInput, TouchableOpacity, View, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { C, T, R, SP, SHADOW } from './theme';

const FUEL_KEY = 'sppero_fuel_log';
const MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

type FuelEntry = { litres: number; pricePerLitre: number; total: number; date: string; note: string };

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function WeekBar({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 70, marginTop: 8 }}>
      {data.map((d, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center' }}>
          <View style={{
            width: '100%', height: Math.max((d.value / max) * 56, 3), borderRadius: R.xs,
            backgroundColor: d.value > 0 ? 'rgba(239,68,68,0.75)' : C.glassMid,
          }} />
          <Text style={{ ...T.label, color: C.textMuted, marginTop: 4 }}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

interface FuelLogScreenProps {
  onClose: () => void;
  todayEarnings: number;
  weeklyEarnings: number;
}

export function FuelLogScreen({ onClose, todayEarnings, weeklyEarnings }: FuelLogScreenProps) {
  const [entries, setEntries]           = useState<FuelEntry[]>([]);
  const [litres, setLitres]             = useState('');
  const [ppl, setPpl]                   = useState('');
  const [note, setNote]                 = useState('');
  const [showAdd, setShowAdd]           = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(FUEL_KEY).then(raw => { if (raw) setEntries(JSON.parse(raw)); });
    Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 12 }).start();
  }, []);

  const closeWithAnim = () => {
    Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => onClose());
  };

  const saveEntries = async (list: FuelEntry[]) => {
    setEntries(list);
    await AsyncStorage.setItem(FUEL_KEY, JSON.stringify(list));
  };

  const addEntry = async () => {
    const l = parseFloat(litres) || 0;
    const p = parseFloat(ppl) || 0;
    if (l <= 0 || p <= 0) { Alert.alert('', 'Litres aur price dono daalo'); return; }
    const entry: FuelEntry = {
      litres: l, pricePerLitre: p, total: Math.round(l * p),
      date: new Date().toISOString(), note: note.trim(),
    };
    const updated = [entry, ...entries];
    await saveEntries(updated);
    setLitres(''); setPpl(''); setNote(''); setShowAdd(false);
  };

  const deleteEntry = async (i: number) => {
    await saveEntries(entries.filter((_, idx) => idx !== i));
  };

  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 6); weekStart.setHours(0, 0, 0, 0);
  const thisWeekEntries = entries.filter(e => new Date(e.date) >= weekStart);
  const weekFuelCost = thisWeekEntries.reduce((s, e) => s + e.total, 0);

  const todayStr = now.toISOString().split('T')[0];
  const todayFuel = entries.filter(e => e.date.startsWith(todayStr)).reduce((s, e) => s + e.total, 0);
  const todayNet  = todayEarnings - todayFuel;
  const weekNet   = weeklyEarnings - weekFuelCost;

  const chartData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now); d.setDate(now.getDate() - (6 - i));
    const dk = d.toISOString().split('T')[0];
    const cost = entries.filter(e => e.date.startsWith(dk)).reduce((s, e) => s + e.total, 0);
    return { label: MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate(), value: cost };
  });

  return (
    <Animated.View style={{
      position: 'absolute', inset: 0,
      transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [800, 0] }) }],
      backgroundColor: C.bg, zIndex: 999,
    }}>
      {/* Header */}
      <View style={{
        backgroundColor: C.bgDark, paddingTop: 52, paddingBottom: SP.md,
        paddingHorizontal: SP.md, overflow: 'hidden',
      }}>
        <View style={{ position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,45,120,0.08)', top: -80, right: -50 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={closeWithAnim}
            style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: R.xs, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)' }}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={{ ...T.title, color: '#fff', flex: 1 }}>Fuel Log</Text>
          <TouchableOpacity onPress={() => setShowAdd(p => !p)} style={{
            backgroundColor: C.pink, borderRadius: R.sm, paddingHorizontal: SP.md, paddingVertical: 8,
            flexDirection: 'row', alignItems: 'center', gap: 4,
            elevation: 4, shadowColor: C.pink, shadowOpacity: 0.4, shadowRadius: 8,
          }}>
            <Ionicons name={showAdd ? 'close' : 'add'} size={14} color="#fff" />
            <Text style={{ ...T.caption, color: '#fff' }}>{showAdd ? 'Cancel' : 'Add'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: SP.md, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

        {/* ── Net Earnings Cards ── */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: SP.md }}>
          {[
            { label: 'AAJ NET KAMAI', net: todayNet, earn: todayEarnings, fuel: todayFuel },
            { label: 'IS HAFTE NET',  net: weekNet,  earn: weeklyEarnings, fuel: weekFuelCost },
          ].map((item, i) => (
            <View key={i} style={{
              flex: 1, backgroundColor: C.bgCard, borderRadius: R.md, padding: SP.md,
              ...SHADOW.sm, borderWidth: 1.5,
              borderColor: item.net >= 0 ? C.greenBorder : C.redBorder,
            }}>
              <Text style={{ ...T.label, color: C.textMuted, marginBottom: 4 }}>{item.label}</Text>
              <Text style={{ fontSize: 26, fontWeight: '900' as const, color: item.net >= 0 ? C.green : C.red }}>
                ₹{Math.abs(item.net)}
              </Text>
              <Text style={{ ...T.label, color: C.textDim, marginTop: 4 }}>
                ₹{item.earn} − ₹{item.fuel} fuel
              </Text>
            </View>
          ))}
        </View>

        {/* ── Week bar chart ── */}
        <View style={{
          backgroundColor: C.bgCard, borderRadius: R.md, padding: SP.md, marginBottom: SP.md,
          ...SHADOW.sm, borderWidth: 1, borderColor: C.glassBorder,
        }}>
          <Text style={{ ...T.bodyBold, color: C.text, marginBottom: 4 }}>7 Din Ka Fuel Kharch</Text>
          <WeekBar data={chartData} />
        </View>

        {/* ── Add entry form ── */}
        {showAdd && (
          <View style={{
            backgroundColor: C.bgCard, borderRadius: R.md, padding: SP.md, marginBottom: SP.md,
            ...SHADOW.md, borderWidth: 1.5, borderColor: C.pinkBorder,
          }}>
            <Text style={{ ...T.bodyBold, color: C.text, marginBottom: SP.md }}>Nayi Entry</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ ...T.caption, color: C.textMuted, marginBottom: 5 }}>Litres</Text>
                <TextInput
                  value={litres} onChangeText={setLitres}
                  placeholder="e.g. 5.5" placeholderTextColor={C.textDim}
                  keyboardType="decimal-pad"
                  style={{ backgroundColor: C.glassMid, borderRadius: R.xs, padding: 12, fontSize: 15, color: C.text, borderWidth: 1, borderColor: C.glassBorder }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...T.caption, color: C.textMuted, marginBottom: 5 }}>₹/Litre</Text>
                <TextInput
                  value={ppl} onChangeText={setPpl}
                  placeholder="e.g. 97" placeholderTextColor={C.textDim}
                  keyboardType="decimal-pad"
                  style={{ backgroundColor: C.glassMid, borderRadius: R.xs, padding: 12, fontSize: 15, color: C.text, borderWidth: 1, borderColor: C.glassBorder }} />
              </View>
            </View>
            {litres && ppl ? (
              <View style={{ backgroundColor: C.greenGlass, borderRadius: R.xs, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: C.greenBorder }}>
                <Text style={{ ...T.bodyBold, color: C.green, textAlign: 'center' }}>
                  Total: ₹{Math.round((parseFloat(litres) || 0) * (parseFloat(ppl) || 0))}
                </Text>
              </View>
            ) : null}
            <TextInput
              value={note} onChangeText={setNote}
              placeholder="Note (optional)" placeholderTextColor={C.textDim}
              style={{ backgroundColor: C.glassMid, borderRadius: R.xs, padding: 12, fontSize: 14, color: C.text, borderWidth: 1, borderColor: C.glassBorder, marginBottom: 12 }} />
            <TouchableOpacity onPress={addEntry} style={{
              backgroundColor: C.pink, borderRadius: R.sm, padding: 14, alignItems: 'center',
              elevation: 4, shadowColor: C.pink, shadowOpacity: 0.4, shadowRadius: 8,
            }}>
              <Text style={{ ...T.bodyBold, color: '#fff' }}>Save Entry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Entry list ── */}
        {entries.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ fontSize: 36 }}>⛽</Text>
            <Text style={{ ...T.bodyBold, color: C.text, marginTop: 12 }}>Koi entry nahi</Text>
            <Text style={{ ...T.caption, color: C.textMuted, marginTop: 6, textAlign: 'center' }}>
              Fuel bhar ne ke baad upar + button dabao
            </Text>
          </View>
        ) : (
          <View style={{ backgroundColor: C.bgCard, borderRadius: R.md, overflow: 'hidden', ...SHADOW.sm, borderWidth: 1, borderColor: C.glassBorder }}>
            {entries.map((e, i) => (
              <View key={i} style={{
                flexDirection: 'row', alignItems: 'center', padding: SP.md,
                borderBottomWidth: i < entries.length - 1 ? 1 : 0, borderBottomColor: C.glassMid,
              }}>
                <View style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: C.redGlass, alignItems: 'center', justifyContent: 'center',
                  marginRight: 12, borderWidth: 1.5, borderColor: C.redBorder,
                }}>
                  <Text style={{ fontSize: 20 }}>⛽</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...T.bodyBold, color: C.text }}>
                    {e.litres}L @ ₹{e.pricePerLitre}/L
                  </Text>
                  <Text style={{ ...T.caption, color: C.textMuted, marginTop: 2 }}>
                    {formatDate(e.date)}{e.note ? ` · ${e.note}` : ''}
                  </Text>
                </View>
                <Text style={{ fontSize: 16, fontWeight: '900' as const, color: C.red, marginRight: 10 }}>
                  −₹{e.total}
                </Text>
                <TouchableOpacity onPress={() => deleteEntry(i)} style={{ padding: 6 }}>
                  <Ionicons name="trash-outline" size={16} color={C.textDim} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
}
