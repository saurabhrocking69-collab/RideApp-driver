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
  _pollTimer: any;
  _lastRideId: string | null;

  startPolling: (phone: string, onNewRide?: () => void) => void;
  stopPolling: () => void;
  clearAll: () => void;
};

export const useDriverStore = create<DriverState>((set, get) => ({
  activeRide: null,
  pendingRide: null,
  suspended: false,
  _pollTimer: null,
  _lastRideId: null,

  // ─── SINGLE POLLING ENGINE ───
  // active-ride + pending-ride ek hi interval mein
  // Overlap guard — pichli call complete hone tak nayi nahi
  startPolling: (phone: string, onNewRide?: () => void) => {
    const state = get();
    if (state._pollTimer) clearInterval(state._pollTimer);

    let busy = false;

    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        // 1. Active ride check
        const ad = await apiGet(`/api/driver/active-ride?phone=${phone}`);
        if (!ad._error && ad.ride) {
          set({ activeRide: ad.ride, pendingRide: null });
          busy = false;
          return;
        }
        set({ activeRide: null });

        // 2. Pending ride check
        const pd = await apiGet(`/api/driver/pending-ride?phone=${phone}`);
        if (!pd._error) {
          if (pd.suspended) { set({ suspended: true, pendingRide: null }); busy = false; return; }
          if (pd.ride) {
            const lastId = get()._lastRideId;
            if (lastId !== pd.ride.id) {
              set({ _lastRideId: pd.ride.id });
              if (onNewRide) onNewRide(); // Vibration etc
            }
            set({ pendingRide: pd.ride, suspended: false });
          } else {
            set({ pendingRide: null });
          }
        }
      } catch (_e) {}
      busy = false;
    }, 4000);

    set({ _pollTimer: timer });
  },

  stopPolling: () => {
    const t = get()._pollTimer;
    if (t) clearInterval(t);
    set({ _pollTimer: null, pendingRide: null, activeRide: null });
  },

  clearAll: () => {
    get().stopPolling();
    set({ activeRide: null, pendingRide: null, suspended: false, _lastRideId: null });
  },
}));
