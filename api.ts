// ═══════════════════════════════════════════════
//  SMART API LAYER — timeout + retry + error handling
//  File: api.ts (App.tsx ke saath same folder mein)
// ═══════════════════════════════════════════════

export const API = 'https://api.sppero.com';

/* fetch, par token ke saath - aur signature bilkul fetch jaisa.

   Ye jaan-boojh kar apiAuthGet/apiAuthPost se ALAG hai. Wo parsed data dete
   hain; ye Response deta hai, theek fetch ki tarah. Isse maujooda `fetch(...)`
   wali jagahon par sirf ek shabd badalna padta hai aur upar ka `.json()`
   waisa ka waisa sahi rehta hai.

   Yahi galti pehle ho chuki hai: fetch ko parsed-data wale helper me badla
   gaya tha aur `.json()` upar laga rah gaya - chaar jagah chupchaap toot gaya
   tha aur try/catch ne use nigal liya.

   Token pehle memory se, phir AsyncStorage se. Memory isliye ki customer app
   me AsyncStorage ka seedha padhna api.ts ke andar khali laut raha tha,
   jabki wahi padhna App ke andar chalta tha. */
let _driverToken = '';
export const setDriverToken = (t: string | null | undefined): void => { _driverToken = t || ''; };

export const authFetch = async (url: string, opts: any = {}): Promise<Response> => {
  let t = _driverToken;
  if (!t) {
    try {
      const AS = require('@react-native-async-storage/async-storage').default;
      t = (await AS.getItem('driverToken')) || '';
    } catch (_e) { t = ''; }
  }
  return fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) },
  });
};

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

// ─── Transport metadata ───
// Attaches the HTTP status to the parsed body WITHOUT altering any existing
// field. Callers test `_error` / `success` / `error`, and a 4xx/5xx that
// still returns a JSON body must keep reaching them unchanged — swapping a
// real server message for a generic "Network error" would be a regression.
// `_status` and `_authExpired` are purely additive, so nothing downstream
// changes until something opts in to reading them.
const withMeta = (data: any, res: Response) => {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    data._status = res.status;
    if (res.status === 401) data._authExpired = true;
  }
  return data;
};

// ─── Smart API call: timeout + retries + JSON parse ───
export const apiGet = async (path: string, retries = 2, timeoutMs = 10000): Promise<any> => {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchWithTimeout(`${API}${path}`, {}, timeoutMs);
      return withMeta(await res.json(), res);
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
      return withMeta(await res.json(), res);
    } catch (err) {
      if (i === retries) return { _error: true, message: 'Network error — dobara try karo' };
      await new Promise(r => setTimeout(r, 800));
    }
  }
  return { _error: true, message: 'Network error — dobara try karo' };
};

// ─── Auth-aware POST (includes Bearer token) — for endpoints that verify
// the caller's identity server-side, like ride accept/arrived/start/etc. ───
export const apiAuthPost = async (path: string, body: any, token: string, retries = 1): Promise<any> => {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchWithTimeout(`${API}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }, 10000);
      return withMeta(await res.json(), res);
    } catch (err) {
      if (i === retries) return { _error: true, message: 'Network error — dobara try karo' };
      await new Promise(r => setTimeout(r, 800));
    }
  }
  return { _error: true, message: 'Network error — dobara try karo' };
};

// ─── Auth-aware GET (includes Bearer token) — for endpoints that verify
// the caller's identity server-side, like wallet/upi/bank details. ───
export const apiAuthGet = async (path: string, token: string, retries = 1): Promise<any> => {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchWithTimeout(`${API}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      }, 10000);
      return withMeta(await res.json(), res);
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
