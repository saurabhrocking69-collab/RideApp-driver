/* OTP apne aap bharne ka JS sira.
 *
 * SABSE ZAROORI BAAT: `requireOptionalNativeModule` - agar native hissa is
 * build me hai hi nahi (yaani aaj wali app, jismein wo abhi nahi gaya), to ye
 * `null` deta hai aur neeche ka sab kuchh chup-chaap kuch-na-karne wala ban
 * jaata hai. Isse ye file aaj ke builds par bhej dene se kuchh TOOTTA nahi -
 * OTP screen jaisi chal rahi hai waisi hi chalti hai, aur naya build aate hi
 * apne aap jaag jaati hai.
 *
 * iOS par bhi yahi hota hai: wahan ye module hai hi nahi, aur wahan iski
 * zaroorat bhi nahi - iOS khud `textContentType="oneTimeCode"` se keyboard ke
 * uper code de deta hai.
 */
import { requireOptionalNativeModule } from 'expo-modules-core';

const Native = requireOptionalNativeModule<any>('SpperoOtp');

/** Is build me apne aap bharna ho sakta hai ya nahi. */
export const smsOtpAvailable = (): boolean => !!Native;

/** Sunna shuru karo. Jo laut-ta hai use band karne ke liye bulao. */
export function startSmsOtp(onCode: (code: string) => void): () => void {
  if (!Native) return () => {};
  let sub: any = null;
  try {
    sub = Native.addListener('onOtp', (e: { code?: string }) => {
      if (e && e.code) onCode(e.code);
    });
    Native.start();
  } catch (_e) {
    try { sub?.remove(); } catch (_e2) {}
    return () => {};
  }
  return () => {
    try { Native.stop(); } catch (_e) {}
    try { sub?.remove(); } catch (_e) {}
  };
}

/** Bina tap wale raaste ke liye - jis din hash wala DLT template approve ho.
 *  Dekho modules/sppero-otp/android/.../SpperoOtpModule.kt */
export function smsAppHash(): string {
  try { return (Native && Native.getAppHash && Native.getAppHash()) || ''; }
  catch (_e) { return ''; }
}
