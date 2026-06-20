// Exclude react-native-razorpay from native autolinking.
// The JS wrapper still loads (and returns null gracefully) but the Razorpay
// Java/Kotlin module is not compiled into the app, eliminating a potential
// native crash source on app startup.
module.exports = {
  dependencies: {
    'react-native-razorpay': {
      platforms: {
        android: null,
        ios: null,
      },
    },
  },
};
