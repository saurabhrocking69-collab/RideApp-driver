// ═══════════════════════════════════════════════
//  DRIVER STORE — Zustand (single polling engine)
//  File: store.ts (driver app ke App.tsx ke saath)
// ═══════════════════════════════════════════════
import { create } from 'zustand';
import { apiGet } from './api';

type DriverState = {
  activeRide: any;
  // Set alongside activeRide only when the current ride is part of a route
  // batch (2 parcels, one trip) — { id, stops: [...] }, the full ordered
  // stop sequence, so the UI can show "Stop 2 of 4" context. activeRide
  // itself is always just the CURRENT stop's real ride row (see doPoll
  // below) — every existing single-ride screen keeps working unmodified
  // because that stop object has the exact same shape a normal ride does.
  activeBatch: any;
  pendingRide: any;
  suspended: boolean;
  hourlyBusy: boolean;
  _pollTimer: any;
  _lastRideId: string | null;
  _pollFn: (() => void) | null;

  startPolling: (phone: string, onNewRide?: () => void) => void;
  triggerPoll: () => void;
  stopPolling: () => void;
  clearAll: () => void;
  setHourlyBusy: (busy: boolean) => void;
};

export const useDriverStore = create<DriverState>((set, get) => ({
  activeRide: null,
  activeBatch: null,
  pendingRide: null,
  suspended: false,
  hourlyBusy: false,
  _pollTimer: null,
  _lastRideId: null,
  _pollFn: null,

  // ─── SINGLE POLLING ENGINE ───
  startPolling: (phone: string, onNewRide?: () => void) => {
    const state = get();
    if (state._pollTimer) clearInterval(state._pollTimer);

    let busy = false;

    const doPoll = async () => {
      if (busy) return;
      busy = true;
      try {
        const ad = await apiGet(`/api/driver/active-ride?phone=${phone}`, 0, 5000);
        if (!ad._error && ad.ride) {
          // /active-ride's own query can return EITHER of a batch's 2
          // simultaneously-active rides (ORDER BY created_at DESC LIMIT 1)
          // — not necessarily the one the driver should be working on right
          // now. batch_id is already present on the row (SELECT r.* already
          // includes it) whenever this ride is part of one; when it is,
          // fetch the real ordered stop sequence and use ITS current
          // (first not-done) stop instead of blindly trusting the pick
          // /active-ride happened to make.
          if (ad.ride.batch_id) {
            const bd = await apiGet(`/api/parcel/batch/active?phone=${phone}`, 0, 5000);
            const currentStop = !bd._error && bd.batch ? (bd.stops || []).find((s: any) => !s.done) : null;
            if (currentStop) {
              set({ activeRide: currentStop, activeBatch: { id: bd.batch.id, stops: bd.stops }, pendingRide: null });
              busy = false;
              return;
            }
            // Batch fetch failed or every stop is already done (settling —
            // the last /complete just hasn't flipped ride.status yet) — fall
            // through to the plain single-ride value rather than get stuck.
          }
          set({ activeRide: ad.ride, activeBatch: null, pendingRide: null });
          busy = false;
          return;
        }
        // Only clear activeRide on explicit "no ride" response — not on network error
        // (transient errors would flash the card blank for 2s between polls)
        if (!ad._error) set({ activeRide: null, activeBatch: null });

        // Driver engaged in hourly ride — don't surface standard ride requests
        if (get().hourlyBusy) { set({ pendingRide: null }); busy = false; return; }

        const pd = await apiGet(`/api/driver/pending-ride?phone=${phone}`, 0, 5000);
        if (!pd._error) {
          if (pd.suspended) { set({ suspended: true, pendingRide: null }); busy = false; return; }
          set({ suspended: false });
          if (pd.ride) {
            const lastId = get()._lastRideId;
            if (lastId !== pd.ride.id) {
              set({ _lastRideId: pd.ride.id });
              if (onNewRide) onNewRide();
            }
            set({ pendingRide: pd.ride });
          } else {
            set({ pendingRide: null });
          }
        }
      } catch (_e) {}
      busy = false;
    };

    const timer = setInterval(doPoll, 6000);
    set({ _pollTimer: timer, _pollFn: doPoll });
  },

  // Socket.io calls this to trigger an immediate poll without waiting for the
  // next 6s tick
  triggerPoll: () => {
    const fn = get()._pollFn;
    if (fn) fn();
  },

  stopPolling: () => {
    const t = get()._pollTimer;
    if (t) clearInterval(t);
    set({ _pollTimer: null, pendingRide: null, activeRide: null, activeBatch: null, _pollFn: null });
  },

  clearAll: () => {
    get().stopPolling();
    set({ activeRide: null, activeBatch: null, pendingRide: null, suspended: false, hourlyBusy: false, _lastRideId: null, _pollFn: null });
  },

  setHourlyBusy: (busy: boolean) => set({ hourlyBusy: busy, ...(busy ? { pendingRide: null } : {}) }),
}));
