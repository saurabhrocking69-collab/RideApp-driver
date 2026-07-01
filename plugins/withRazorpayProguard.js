const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const RAZORPAY_RULES = `
# Razorpay SDK — keep all classes from ProGuard stripping
-keep class com.razorpay.** { *; }
-dontwarn com.razorpay.**
-keepattributes *Annotation*
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclasseswithmembers class * {
    public void onPayment*(...);
}
-optimizations !method/inlining/*
`;

const withRazorpayProguard = (config) => {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const proguardPath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'proguard-rules.pro'
      );
      if (fs.existsSync(proguardPath)) {
        const existing = fs.readFileSync(proguardPath, 'utf8');
        if (!existing.includes('com.razorpay')) {
          fs.appendFileSync(proguardPath, RAZORPAY_RULES);
        }
      }
      return config;
    },
  ]);
};

module.exports = withRazorpayProguard;
