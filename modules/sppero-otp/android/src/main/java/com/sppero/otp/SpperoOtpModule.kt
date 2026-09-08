package com.sppero.otp

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import androidx.core.os.bundleOf
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.MessageDigest

private const val REQ_CONSENT = 47701

// 4 se 8 ank - 2Factor 6 bhejta hai, par template kabhi badla to bhi chale.
private val CODE = Regex("\\d{4,8}")

/**
 * OTP apne aap bharne ke liye - SMS User Consent API.
 *
 * Ye SMS Retriever NAHI hai. Retriever bina kisi tap ke bharta hai par uske
 * liye SMS ke ant me is app ka 11-akshar ka hash chahiye, jo DLT template me
 * likha jaata hai. Abhi jo template chal raha hai wo 2Factor ka default hai,
 * usme hamara hash nahi hai, aur use badalna alag (aur lamba) kaam hai.
 *
 * User Consent theek isi haalat ke liye banaya gaya hai: SMS ka roop kaisa bhi
 * ho, chalta hai. Badle me ek system ka dabba aata hai - "ye code padhne dein?"
 * - aur uspar ek tap. Koi SMS permission nahi lagti, jo Play Store ke liye
 * zaroori baat hai.
 */
class SpperoOtpModule : Module() {

  private var receiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("SpperoOtp")
    Events("onOtp")

    /* Teeno ek try me. JS `start()` ko try me bulata hai, par ye pakka karna
       ki yahan se koi cheez upar na jaye - kyoki ek bhi bina pakdi hui gadbad
       ka matlab hai koi login hi nahi kar payega. */
    Function("start") { try { start() } catch (_: Throwable) {} }
    Function("stop") { try { stop() } catch (_: Throwable) {} }
    Function("getAppHash") { try { appHash() } catch (_: Throwable) { "" } }

    OnActivityResult { _, payload ->
      if (payload.requestCode == REQ_CONSENT) {
        if (payload.resultCode == Activity.RESULT_OK) {
          val msg = payload.data?.getStringExtra(SmsRetriever.EXTRA_SMS_MESSAGE)
          val code = msg?.let { CODE.find(it)?.value }
          if (code != null) sendEvent("onOtp", bundleOf("code" to code))
        }
        // Mana kar diya to kuchh nahi karna - aadmi haath se bhar sakta hai.
        // Yahan koi error bhejna galat hota: "mana karna" koi kharabi nahi hai.
      }
    }

    OnDestroy { stop() }
  }

  private fun start() {
    val ctx = appContext.reactContext ?: return
    stop()

    val r = object : BroadcastReceiver() {
      /* Poora onReceive ek try me hai, aur wo dikhawa nahi hai.

         Ye MAIN THREAD par chalta hai. Yahan se nikla koi bhi exception seedhe
         app ko le doobta hai - koi red screen nahi, app bas band. Ek captain ke
         saath theek yahi hua: OTP ka panna khula tha, SMS aane hi wala tha, aur
         app band ho gayi. Wajah log ke bina dikhi nahi, isliye ab ye hissa aisa
         likha gaya hai ki wajah chahe jo ho, app na gire - OTP haath se bhar
         lena us se bahut behtar hai ki app hi band ho jaye.

         appContext.currentActivity apne aap me phenk sakta hai (sirf null nahi
         deta) - wo bhi isi ke andar hai. */
      override fun onReceive(c: Context?, intent: Intent?) = try {
        onSms(intent)
      } catch (_: Throwable) { /* chup - app girne se OTP na bharna behtar hai */ }

      private fun onSms(intent: Intent?) {
        if (intent?.action != SmsRetriever.SMS_RETRIEVED_ACTION) return
        val extras = intent.extras ?: return
        val status = if (Build.VERSION.SDK_INT >= 33)
          extras.getParcelable(SmsRetriever.EXTRA_STATUS, Status::class.java)
        else
          @Suppress("DEPRECATION") extras.getParcelable<Status>(SmsRetriever.EXTRA_STATUS)

        if (status?.statusCode != CommonStatusCodes.SUCCESS) return

        val consent = if (Build.VERSION.SDK_INT >= 33)
          extras.getParcelable(SmsRetriever.EXTRA_CONSENT_INTENT, Intent::class.java)
        else
          @Suppress("DEPRECATION") extras.getParcelable<Intent>(SmsRetriever.EXTRA_CONSENT_INTENT)

        if (consent == null) return
        val act = appContext.currentActivity ?: return
        /* Activity kholna main thread ka kaam hai. onReceive waise to main
           thread par hi chalta hai, par ise saaf-saaf post karna sasta hai aur
           ek poora khatra hata deta hai. Nateeja OnActivityResult me aayega. */
        android.os.Handler(android.os.Looper.getMainLooper()).post {
          try { act.startActivityForResult(consent, REQ_CONSENT) } catch (_: Throwable) {}
        }
      }
    }

    /* RECEIVER_EXPORTED zaroori hai, marzi ki baat nahi: ye broadcast Google
       Play services se aata hai, yaani app ke BAHAR se. Android 14 (API 34)
       se har aisa receiver saaf-saaf "exported" likhe bina register karne par
       app CRASH kar deti hai. SEND_PERMISSION lagi hone se ise sirf Play
       services hi bhej sakti hai, koi doosri app nahi.

       Ye ContextCompat se nahi, seedhe Context se kiya gaya hai: ContextCompat
       ka ye roop androidx.core ke naye version me hai aur yahan purana laga hua
       hai. Nayi dependency jodne par wo app me pehle se lagi androidx se ladh
       sakti thi - itni si baat ke liye wo khatra theek nahi. */
    val filter = IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION)
    if (Build.VERSION.SDK_INT >= 33) {
      ctx.registerReceiver(r, filter, SmsRetriever.SEND_PERMISSION, null, Context.RECEIVER_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      ctx.registerReceiver(r, filter, SmsRetriever.SEND_PERMISSION, null)
    }
    receiver = r

    // null = kisi bhi number se aaya SMS chalega. Hamara SMS har baar alag
    // header se aa sakta hai (2Factor ka apna route), to number bandhna theek
    // nahi. Ye 5 minute tak sunta hai, phir apne aap band ho jaata hai.
    SmsRetriever.getClient(ctx).startSmsUserConsent(null)
  }

  private fun stop() {
    val ctx = appContext.reactContext
    val r = receiver ?: return
    receiver = null
    try { ctx?.unregisterReceiver(r) } catch (_: Throwable) {}
  }

  /* Bina tap wale (Retriever) raaste ke liye hash - jis din hash wala template
     approve ho.

     Ise andaaze se nikalna galat hai: hash signing cert se banta hai, aur Play
     App Signing me Google app ko DOBARA sign karta hai - yaani jo hash aapke
     apne banaye APK ka hai, wo Play se utri app ka NAHI hoga. Isliye ye asli
     chalti hui app se padha jaata hai.

     Tarika Google ke apne AppSignatureHelper wala hai:
       sha256(packageName + " " + cert ka hex) -> pehle 9 byte -> base64 -> 11 akshar */
  private fun appHash(): String {
    val ctx = appContext.reactContext ?: return ""
    return try {
      val pkg = ctx.packageName
      val pm = ctx.packageManager
      val sigs = if (Build.VERSION.SDK_INT >= 28) {
        pm.getPackageInfo(pkg, PackageManager.GET_SIGNING_CERTIFICATES)
          .signingInfo?.apkContentsSigners
      } else {
        @Suppress("DEPRECATION")
        pm.getPackageInfo(pkg, PackageManager.GET_SIGNATURES).signatures
      } ?: return ""
      val sig = sigs.firstOrNull() ?: return ""
      val appInfo = pkg + " " + sig.toCharsString()
      val digest = MessageDigest.getInstance("SHA-256")
        .digest(appInfo.toByteArray(Charsets.UTF_8))
      Base64.encodeToString(digest.copyOfRange(0, 9), Base64.NO_PADDING or Base64.NO_WRAP)
        .substring(0, 11)
    } catch (_: Throwable) { "" }
  }
}
