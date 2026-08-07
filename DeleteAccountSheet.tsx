import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from './theme';
import { API } from './api';

// Account deletion, as Google Play requires it: initiated from inside the app,
// with what will happen spelled out before anything is confirmed.
//
// Deliberately a request-and-review flow rather than an instant wipe. A ride
// business holds money in both directions — wallet balance, commission owed,
// escrowed parcels — and an irreversible one-tap delete on a phone is how
// people lose money they did not mean to give up. The window also gives them a
// way back: it can be cancelled right up until it runs.
export function DeleteAccountSheet({
  visible, onClose, phone, role = 'driver', onDeleted,
}: {
  visible: boolean;
  onClose: () => void;
  phone: string;
  role?: 'customer' | 'driver';
  onDeleted?: () => void;
}) {
  const [loading, setLoading]   = useState(true);
  const [busy, setBusy]         = useState(false);
  const [state, setState]       = useState<any>(null);
  const [reason, setReason]     = useState('');
  const [confirming, setConfirming] = useState(false);
  const [err, setErr]           = useState('');

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const r = await fetch(`${API}/api/account/deletion?phone=${encodeURIComponent(phone)}&role=${role}`);
      setState(await r.json());
    } catch { setErr('Could not reach the server. Check your connection.'); }
    setLoading(false);
  };
  // Re-read every time it opens: a request may have been actioned, or a ride
  // started, since the last look.
  useEffect(() => { if (visible && phone) { setConfirming(false); setReason(''); load(); } }, [visible, phone]);

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch(`${API}/api/account/deletion`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, role, reason }),
      });
      const d = await r.json();
      if (!r.ok) setErr(d.error || 'Could not submit the request.');
      else { setConfirming(false); await load(); }
    } catch { setErr('Could not reach the server. Check your connection.'); }
    setBusy(false);
  };

  const cancelRequest = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch(`${API}/api/account/deletion/cancel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const d = await r.json();
      if (!r.ok) setErr(d.error || 'Could not cancel.');
      else await load();
    } catch { setErr('Could not reach the server. Check your connection.'); }
    setBusy(false);
  };

  const pending  = state?.request;
  const blockers = state?.blockers || [];
  const notes    = state?.notes || [];
  const days     = state?.review_days ?? 7;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '900', color: '#0F172A' }}>Delete account</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={'#64748B'} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 28 }}>
            {loading ? (
              <View style={{ paddingVertical: 30, alignItems: 'center' }}><ActivityIndicator color={C.pink} /></View>
            ) : pending ? (
              // ── Already requested ──
              <>
                <View style={{ backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)' }}>
                  <Text style={{ color: '#B45309', fontWeight: '900', fontSize: 14, marginBottom: 4 }}>Deletion requested</Text>
                  <Text style={{ color: '#92400E', fontSize: 12.5, lineHeight: 18 }}>
                    Your account is scheduled for deletion by{' '}
                    {new Date(pending.scheduled_for).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.
                    You can keep using the app until then.
                  </Text>
                </View>
                <Text style={{ color: '#64748B', fontSize: 12.5, lineHeight: 19, marginTop: 16 }}>
                  Changed your mind? Cancelling keeps everything exactly as it is —
                  your rides, wallet and saved places.
                </Text>
                <TouchableOpacity onPress={cancelRequest} disabled={busy}
                  style={{ marginTop: 16, backgroundColor: C.green, borderRadius: 12, paddingVertical: 15, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>
                    {busy ? 'Cancelling…' : 'Keep my account'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : blockers.length > 0 ? (
              // ── Something must be settled first ──
              <>
                <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '800', marginBottom: 10 }}>
                  You can't delete the account just yet
                </Text>
                {blockers.map((b: string, i: number) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 9, marginBottom: 9 }}>
                    <Ionicons name="alert-circle" size={17} color={C.red} style={{ marginTop: 1 }} />
                    <Text style={{ flex: 1, color: '#64748B', fontSize: 13, lineHeight: 19 }}>{b}</Text>
                  </View>
                ))}
                <TouchableOpacity onPress={load}
                  style={{ marginTop: 14, borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}>
                  <Text style={{ color: '#0F172A', fontWeight: '800', fontSize: 14 }}>Check again</Text>
                </TouchableOpacity>
              </>
            ) : (
              // ── Explain, then confirm ──
              <>
                <Text style={{ color: '#64748B', fontSize: 13, lineHeight: 20 }}>
                  We'll review your request and delete your account within {days} days.
                  You can cancel at any point before that.
                </Text>

                <Text style={{ color: '#0F172A', fontSize: 12.5, fontWeight: '900', marginTop: 18, marginBottom: 8, letterSpacing: 0.6 }}>
                  WHAT GETS DELETED
                </Text>
                {['Your name, phone number and profile',
                  role === 'driver'
                    ? 'Your licence, Aadhaar, vehicle papers and payout details'
                    : 'Your saved places and emergency contacts',
                  'Your login — you will not be able to sign in again'].map((t, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 9, marginBottom: 7 }}>
                    <Ionicons name="trash-outline" size={15} color={C.red} style={{ marginTop: 2 }} />
                    <Text style={{ flex: 1, color: '#64748B', fontSize: 12.5, lineHeight: 18 }}>{t}</Text>
                  </View>
                ))}

                <Text style={{ color: '#0F172A', fontSize: 12.5, fontWeight: '900', marginTop: 14, marginBottom: 8, letterSpacing: 0.6 }}>
                  WHAT WE HAVE TO KEEP
                </Text>
                <View style={{ flexDirection: 'row', gap: 9 }}>
                  <Ionicons name="receipt-outline" size={15} color={'#94A3B8'} style={{ marginTop: 2 }} />
                  <Text style={{ flex: 1, color: '#64748B', fontSize: 12.5, lineHeight: 18 }}>
                    Trip and payment records, with your personal details removed. Indian
                    tax rules require these, and the other person on each ride has a
                    right to their own history.
                  </Text>
                </View>

                {notes.map((n: string, i: number) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 9, marginTop: 12, backgroundColor: 'rgba(245,158,11,0.10)', borderRadius: 12, padding: 11, borderWidth: 1, borderColor: 'rgba(245,158,11,0.30)' }}>
                    <Ionicons name="wallet-outline" size={15} color="#B45309" style={{ marginTop: 1 }} />
                    <Text style={{ flex: 1, color: '#92400E', fontSize: 12.5, fontWeight: '700', lineHeight: 18 }}>{n}</Text>
                  </View>
                ))}

                {!confirming ? (
                  <TouchableOpacity onPress={() => setConfirming(true)}
                    style={{ marginTop: 20, borderWidth: 1.5, borderColor: C.red, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
                    <Text style={{ color: C.red, fontWeight: '900', fontSize: 14.5 }}>Continue</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <Text style={{ color: '#0F172A', fontSize: 12.5, fontWeight: '800', marginTop: 20, marginBottom: 7 }}>
                      Why are you leaving? (optional)
                    </Text>
                    <TextInput
                      value={reason} onChangeText={setReason} multiline
                      placeholder="Tell us what went wrong — it helps us fix it"
                      placeholderTextColor={'#94A3B8'}
                      style={{ borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12, padding: 12, minHeight: 70, color: '#0F172A', fontSize: 13, textAlignVertical: 'top' }}
                    />
                    <TouchableOpacity onPress={submit} disabled={busy}
                      style={{ marginTop: 14, backgroundColor: C.red, borderRadius: 12, paddingVertical: 15, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
                      <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>
                        {busy ? 'Submitting…' : 'Request account deletion'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setConfirming(false)} style={{ paddingVertical: 12, alignItems: 'center' }}>
                      <Text style={{ color: '#64748B', fontWeight: '700', fontSize: 13.5 }}>Not now</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}

            {!!err && (
              <Text style={{ color: C.red, fontSize: 12.5, fontWeight: '700', marginTop: 12, textAlign: 'center' }}>{err}</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
