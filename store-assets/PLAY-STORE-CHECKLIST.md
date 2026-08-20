# Sppero Buddy (driver app) — Google Play Console submission kit

Everything below is ready to paste into Play Console once your developer account is active.

> ⚠️ **Hard blocker before submitting** — same backend, same issue: `ALLOW_TEST_OTP=true`
> on Railway currently lets `000000` log into any driver account with no real OTP, and
> leaks the real OTP in the API response. Fix sequence: get a Fast2SMS (or similar) API
> key → add it as `FAST2SMS_API_KEY` on Railway (send-otp already sends real SMS once
> that's set) → confirm real login works → then set `ALLOW_TEST_OTP=false`. Do this
> before uploading — Google's reviewer needs to actually receive an OTP to sign up.

## 1. Assets in this folder
- `hi-res-icon-512.png` — 512x512 store icon
- `feature-graphic-1024x500.png` — store listing banner

Still needed from you:
- Phone screenshots — minimum 2, recommend 4-8. Use: Login screen, Home/ride-request screen, Active trip/navigation screen, Wallet/earnings screen.
- Background location declaration video (see Section 5 — Google usually requires a short screen recording for this specific permission).

## 2. Store Listing Text

**App name** (30 char max):
`Sppero Buddy - Driver App`

**Short description** (80 char max):
`Drive with Sppero. Get ride requests, earn daily, get paid fast.`

**Full description** (4000 char max):
```
Sppero Buddy is the driver-partner app for Sppero, India's own ride-hailing platform. Get ride requests, drive on your own schedule, and get paid — all from one app.

FOR DRIVER-PARTNERS
• Get nearby ride requests in real time — auto, bike, car and more
• See fare and pickup distance before you accept
• Turn-by-turn navigation to pickup and drop
• In-app chat with your rider during the trip
• Sppero by the Hour — longer bookings, better earnings per trip

EARN & GET PAID
• Track your daily and weekly earnings in the app
• Request payouts directly to your bank — ₹100 minimum, processed within 24-48 hours
• Ride-pack subscriptions for lower commission on completed rides
• Bonuses and referral rewards for active driver-partners

SIMPLE ONBOARDING
• Register and upload your documents (licence, RC, vehicle photo) right from the app
• Track your document verification status
• 24x7 in-app support for any issue

Drive when you want, earn what you deserve. Download Sppero Buddy and become a Sppero driver-partner today.
```

## 3. Data Safety form (Play Console → App content → Data safety)

Answer **Yes** — this app collects or shares user data. Declare:

| Data type | Collected? | Shared? | Purpose |
|---|---|---|---|
| Approximate & precise location | Yes | Yes (with matched rider, for the trip only) | App functionality (matching, live tracking, ETA) |
| Name | Yes | Yes (with matched rider) | Account, ride coordination |
| Phone number | Yes | Yes (with matched rider) | OTP login, ride coordination |
| Photos (ID/vehicle documents) | Yes | No (used for internal verification only) | Account verification |
| Payment/financial info | Yes (via Razorpay + payout to bank) | Yes (Razorpay) | Payouts, commission settlement |
| App activity / in-app messages | Yes | No (kept between matched rider & driver) | Trip coordination |
| Device/other IDs (push token) | Yes | No | Ride request alerts, notifications |

- Data encrypted in transit: **Yes**
- Users can request data deletion: **Yes** — via `help@sppero.com`
- Privacy Policy URL: **https://api.sppero.com/privacy**

## 4. Content Rating questionnaire

Category: **Utility / Business**. No violence, gambling, drugs, or adult content. In-app chat exists but is restricted to matched trip participants only. Expected result: **Everyone / PEGI 3** equivalent.

## 5. Permissions used — declare these explicitly (Play Console will prompt)

- `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` — find nearby ride requests, navigate to pickup/drop.
- `ACCESS_BACKGROUND_LOCATION` — **this one needs a separate "Background location" declaration form in Play Console (App content section) and often a short screen-recorded video.** Suggested justification text to paste in the form:
  > "Sppero Buddy is a ride-hailing driver app. Background location access lets a driver-partner's assigned rider see their live position and get an accurate arrival time even if the driver briefly switches to another app during an active trip. Location is collected in the background only while the driver has explicitly toggled themselves 'Online' to accept ride requests, and stops immediately when they go offline."
  This matches the actual app behavior (location tracking is gated on the driver's online toggle in code).
- `CAMERA` / gallery access — suggested justification:
  > "Used so driver-partners can photograph and upload required verification documents (driving licence, RC, vehicle photo) during registration and for support ticket attachments."
- `POST_NOTIFICATIONS` — ride request alerts, trip status.
- `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_LOCATION` — keeps live location updating while online, shown as a persistent notification (required by Android for background location apps).
- `USE_FULL_SCREEN_INTENT` — full-screen incoming ride request alert (like a call screen), so drivers don't miss a request.

**Heads-up:** apps requesting background location get manually reviewed by Google and this can add several extra days to your review time, sometimes with back-and-forth if the justification/video isn't convincing. Budget for this — it's normal for driver-side ride-hailing apps (Uber Driver, Ola Driver all go through the same review).

## 6. Before you upload — checklist
- [ ] Play Console developer account created & verified (₹1,700 one-time)
- [ ] App created in Play Console, package name `com.sppero.driver`
- [ ] Store listing text + icon + feature graphic + screenshots uploaded
- [ ] Data safety form filled (Section 3 above)
- [ ] Content rating questionnaire completed (Section 4 above)
- [ ] Background location permission declaration + video submitted (Section 5)
- [ ] Privacy Policy URL added: `https://api.sppero.com/privacy`
- [ ] Production AAB built (`eas build --platform android --profile production`) and uploaded
- [ ] If this is a brand-new developer account: complete the mandatory closed testing track (12 testers, 14 continuous days) before Google allows a production release.

## Suggestion
Consider submitting the **rider app first**, get it through review and into closed testing while you prep this app's background-location video — the rider app has no extra-scrutiny permissions and should move faster.
