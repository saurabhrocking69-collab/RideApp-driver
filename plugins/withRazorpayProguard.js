const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const RULES = `
# Razorpay SDK — keep all classes so ProGuard doesn't strip native module
-keep class com.razorpay.** { *; }
-keepclasseswithmembers class * { public void onPayment*(...); }
-dontwarn com.razorpay.**
-optimizations !method/inlining/*
-keepattributes JavascriptInterface
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
`;

module.exports = function withRazorpayProguard(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      try {
        const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
        if (!existing.includes('com.razorpay')) {
          fs.writeFileSync(file, existing + '\n' + RULES);
        }
      } catch (_e) {}
      return cfg;
    },
  ]);
};
