// ═══════════════════════════════════════════════
//  SMART API LAYER — timeout + retry + error handling
//  File: api.ts (App.tsx ke saath same folder mein)
// ═══════════════════════════════════════════════

export const API = 'https://rideapp-backend-production-5e1c.up.railway.app';

// ─── Fetch with timeout (10 sec default) ───
const fetchWithTimeout = async (url: string, options: any = {}, timeout = 10000): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
};

// ─── Smart API call: timeout + retries + JSON parse ───
export const apiGet = async (path: string, retries = 2, timeoutMs = 10000): Promise<any> => {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchWithTimeout(`${API}${path}`, {}, timeoutMs);
      return await res.json();
    } catch (err) {
      if (i === retries) return { _error: true, message: 'Network error' };
      await new Promise(r => setTimeout(r, 600));
    }
  }
  return { _error: true, message: 'Network error' };
};

export const apiPost = async (path: string, body: any, retries = 1): Promise<any> => {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchWithTimeout(`${API}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, 10000);
      return await res.json();
    } catch (err) {
      if (i === retries) return { _error: true, message: 'Network error — dobara try karo' };
      await new Promise(r => setTimeout(r, 800));
    }
  }
  return { _error: true, message: 'Network error — dobara try karo' };
};

// ─── External API (Google Maps etc) with timeout ───
export const externalGet = async (url: string): Promise<any> => {
  try {
    const res = await fetchWithTimeout(url, {}, 8000);
    return await res.json();
  } catch (err) {
    return { _error: true };
  }
};
