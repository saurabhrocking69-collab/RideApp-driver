import { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, Text, TextInput, TouchableOpacity, View, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const FUEL_KEY = 'sppero_fuel_log';
const MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

type FuelEntry = { litres: number; pricePerLitre: number; total: number; date: string; note: string };

const PINK  = '#E91E63';
const GREEN = '#16A34A';

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
            width: '100%', height: Math.max((d.value / max) * 56, 3), borderRadius: 6,
            backgroundColor: d.value > 0 ? 'rgba(239,68,68,0.8)' : '#F1F5F9',
          }} />
          <Text style={{ fontSize: 9, color: '#64748B', marginTop: 4 }}>{d.label}</Text>
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

  // This week's fuel cost
  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 6); weekStart.setHours(0, 0, 0, 0);
  const thisWeekEntries = entries.filter(e => new Date(e.date) >= weekStart);
  const weekFuelCost = thisWeekEntries.reduce((s, e) => s + e.total, 0);

  // Today's fuel cost
  const todayStr = now.toISOString().split('T')[0];
  const todayFuel = entries.filter(e => e.date.startsWith(todayStr)).reduce((s, e) => s + e.total, 0);
  const todayNet  = todayEarnings - todayFuel;
  const weekNet   = weeklyEarnings - weekFuelCost;

  // 7-day bar chart
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
      backgroundColor: '#F8FAFC', zIndex: 999,
    }}>
      {/* Header */}
      <View style={{
        backgroundColor: '#0F172A', paddingTop: 52, paddingBottom: 20,
        paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12,
      }}>
        <TouchableOpacity onPress={closeWithAnim} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', flex: 1 }}>⛽ Fuel Log</Text>
        <TouchableOpacity onPress={() => setShowAdd(p => !p)} style={{
          backgroundColor: PINK, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
          flexDirection: 'row', alignItems: 'center', gap: 4,
        }}>
          <Ionicons name={showAdd ? 'close' : 'add'} size={14} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{showAdd ? 'Cancel' : 'Add'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

        {/* ── Net Earnings Cards ── */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <View style={{
            flex: 1, backgroundColor: '#fff', borderRadius: 18, padding: 16,
            elevation: 4, borderWidth: 1.5,
            borderColor: todayNet >= 0 ? '#BBF7D0' : 'rgba(239,68,68,0.3)',
          }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#64748B', marginBottom: 4 }}>AAJ NET KAMAI</Text>
            <Text style={{ fontSize: 26, fontWeight: '900', color: todayNet >= 0 ? GREEN : '#EF4444' }}>
              ₹{Math.abs(todayNet)}
            </Text>
            <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>
              ₹{todayEarnings} − ₹{todayFuel} fuel
            </Text>
          </View>
          <View style={{
            flex: 1, backgroundColor: '#fff', borderRadius: 18, padding: 16,
            elevation: 4, borderWidth: 1.5,
            borderColor: weekNet >= 0 ? '#BBF7D0' : 'rgba(239,68,68,0.3)',
          }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#64748B', marginBottom: 4 }}>IS HAFTE NET</Text>
            <Text style={{ fontSize: 26, fontWeight: '900', color: weekNet >= 0 ? GREEN : '#EF4444' }}>
              ₹{Math.abs(weekNet)}
            </Text>
            <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>
              ₹{weeklyEarnings} − ₹{weekFuelCost} fuel
            </Text>
          </View>
        </View>

        {/* ── Week bar chart ── */}
        <View style={{
          backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 14,
          elevation: 3, borderWidth: 1, borderColor: '#E2E8F0',
        }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginBottom: 4 }}>7 Din Ka Fuel Kharch</Text>
          <WeekBar data={chartData} />
        </View>

        {/* ── Add entry form ── */}
        {showAdd && (
          <View style={{
            backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 14,
            elevation: 5, borderWidth: 1.5, borderColor: 'rgba(233,30,99,0.2)',
          }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 14 }}>⛽ Nayi Entry</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 5 }}>Litres</Text>
                <TextInput
                  value={litres} onChangeText={setLitres}
                  placeholder="e.g. 5.5" placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, fontSize: 15, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0' }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 5 }}>₹/Litre</Text>
                <TextInput
                  value={ppl} onChangeText={setPpl}
                  placeholder="e.g. 97" placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, fontSize: 15, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0' }} />
              </View>
            </View>
            {litres && ppl ? (
              <View style={{ backgroundColor: '#F0FDF4', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                <Text style={{ color: GREEN, fontWeight: '800', fontSize: 14, textAlign: 'center' }}>
                  Total: ₹{Math.round((parseFloat(litres) || 0) * (parseFloat(ppl) || 0))}
                </Text>
              </View>
            ) : null}
            <TextInput
              value={note} onChangeText={setNote}
              placeholder="Note (optional)" placeholderTextColor="#94A3B8"
              style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, fontSize: 14, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12 }} />
            <TouchableOpacity onPress={addEntry} style={{
              backgroundColor: PINK, borderRadius: 14, padding: 14, alignItems: 'center',
              elevation: 4, shadowColor: PINK, shadowOpacity: 0.4, shadowRadius: 8,
            }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>Save Entry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Entry list ── */}
        {entries.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ fontSize: 36 }}>⛽</Text>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A', marginTop: 12 }}>Koi entry nahi</Text>
            <Text style={{ fontSize: 12, color: '#64748B', marginTop: 6, textAlign: 'center' }}>
              Fuel bhar ne ke baad upar + button dabao
            </Text>
          </View>
        ) : (
          <View style={{ backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', elevation: 3, borderWidth: 1, borderColor: '#E2E8F0' }}>
            {entries.map((e, i) => (
              <View key={i} style={{
                flexDirection: 'row', alignItems: 'center', padding: 14,
                borderBottomWidth: i < entries.length - 1 ? 1 : 0, borderBottomColor: '#F1F5F9',
              }}>
                <View style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: 'rgba(239,68,68,0.1)', alignItems: 'center', justifyContent: 'center',
                  marginRight: 12,
                }}>
                  <Text style={{ fontSize: 20 }}>⛽</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>
                    {e.litres}L @ ₹{e.pricePerLitre}/L
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                    {formatDate(e.date)}{e.note ? ` · ${e.note}` : ''}
                  </Text>
                </View>
                <Text style={{ fontSize: 16, fontWeight: '900', color: '#EF4444', marginRight: 10 }}>
                  −₹{e.total}
                </Text>
                <TouchableOpacity onPress={() => deleteEntry(i)} style={{ padding: 6 }}>
                  <Ionicons name="trash-outline" size={16} color="#94A3B8" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
}
