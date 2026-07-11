// ═══════════════════════════════════════════════
//  DRIVER STORE — Zustand (single polling engine)
//  File: store.ts (driver app ke App.tsx ke saath)
// ═══════════════════════════════════════════════
import { create } from 'zustand';
import { apiGet } from './api';

type DriverState = {
  activeRide: any;
  pendingRide: any;
  suspended: boolean;
  pendingCommission: number;
  _pollTimer: any;
  _lastRideId: string | null;
  _pollFn: (() => void) | null;

  startPolling: (phone: string, onNewRide?: () => void) => void;
  triggerPoll: () => void;
  stopPolling: () => void;
  clearAll: () => void;
};

export const useDriverStore = create<DriverState>((set, get) => ({
  activeRide: null,
  pendingRide: null,
  suspended: false,
  pendingCommission: 0,
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
          set({ activeRide: ad.ride, pendingRide: null });
          busy = false;
          return;
        }
        // Only clear activeRide on explicit "no ride" response — not on network error
        // (transient errors would flash the card blank for 2s between polls)
        if (!ad._error) set({ activeRide: null });

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

  // Socket.io calls this to trigger an immediate poll without waiting 4s
  triggerPoll: () => {
    const fn = get()._pollFn;
    if (fn) fn();
  },

  stopPolling: () => {
    const t = get()._pollTimer;
    if (t) clearInterval(t);
    set({ _pollTimer: null, pendingRide: null, activeRide: null, _pollFn: null, pendingCommission: 0 });
  },

  clearAll: () => {
    get().stopPolling();
    set({ activeRide: null, pendingRide: null, suspended: false, pendingCommission: 0, _lastRideId: null, _pollFn: null });
  },
}));
