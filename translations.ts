export type Lang = 'hi' | 'en';

export const TR: Record<Lang, Record<string, string>> = {
  hi: {
    // Login
    login_title:         '🚗 Captain Login',
    login_subtitle:      'Sppero ke saath drive karo aur roz kamaao',
    login_otp_title:     '🔑 OTP Enter Karo',
    login_otp_sub:       '+91 {phone} par 6-digit code bheja gaya',
    login_sending:       '⏳ OTP bhej rahe hain...',
    login_send_otp:      'OTP Bhejo →',
    login_verifying:     '⏳ Verify ho raha hai...',
    login_verify:        '✅ Login Karo',
    login_resend:        '🔄 OTP Dobara Bhejo',
    login_resend_wait:   'Dobara bhejne ke liye {sec}s wait karo',
    login_change_number: '← Number change karo',
    login_otp_tip:       'SMS se OTP copy karke paste karo — 6 boxes mein auto-fill ho jaayega!',

    // Login captions (line1 / line2 / sub)
    cap0_l1: 'Become Your',      cap0_l2: 'Own Boss',       cap0_sub: 'No office. No fixed hours. You decide when you drive.',
    cap1_l1: 'Help People Reach',cap1_l2: 'Their Destination',cap1_sub: 'Every ride is a story of trust & service.',
    cap2_l1: 'Earn ₹800+',       cap2_l2: 'Every Day',      cap2_sub: 'Steady income credited instantly to your wallet.',
    cap3_l1: 'India Ka Apna',    cap3_l2: 'Ride Platform',  cap3_sub: 'Built for Bharat. Powered by 10,000+ Captains.',
    cap4_l1: 'Join & Keep',      cap4_l2: 'Earning Daily',  cap4_sub: 'Morning, afternoon or night — your schedule, your earnings.',

    // Language picker
    lang_choose:    'भाषा चुनें',
    lang_hi_label:  'हिंदी + EN',
    lang_en_label:  'English',

    // Live tab — idle state
    live_waiting_title: 'Rides Ka Intezaar...',
    live_waiting_sub:   'Nayi ride aate hi yahan dikhegi\naur phone vibrate karega',
    live_offline_title:  'Abhi Offline Hain',
    live_offline_sub:    'Home tab pe jaake online ho\nphir rides milne lagengi',
    live_go_home:        'Home Tab Pe Jao',

    // Live tab — ride accept
    live_accept_loading: 'Accept ho raha...',
    live_accept:         'ACCEPT KARO',
    live_reject:         'Reject',

    // Live tab — trip buttons
    trip_verify_start:   '🚀 OTP Verify & Trip Shuru',
    trip_complete:       '✅ Trip Complete Karo',

    // Hourly live card
    hourly_accept:  '✓ Accept',
    hourly_skip:    '✕ Skip',

    // Home tab status bar
    home_live_new_ride: '🔔 Nayi Ride Request — Accept Karo!',
    home_live_pickup:   '🚗 Active Ride — Pickup pe jao',
    home_live_otp:      '🚗 Active Ride — OTP Verify Karo',
    home_live_ongoing:  '🚗 Active Ride — Trip Chal Rahi Hai',
    home_live_hourly:   '⏱️ Hourly Ride Active',

    // Profile tab banner
    prof_new_ride_banner: '🔔 Nayi Ride! ₹{fare}',
    prof_view:            'Dekho →',

    // Settings
    settings_lang:      'Language / भाषा',
    settings_lang_sub:  'App ki bhasha badlo',
    settings_notif_section: '🔔 Notifications',
    settings_ride_notif:    'Ride Requests',
    settings_ride_nsub:     'Nayi ride ki notification',
    settings_wallet_notif:  'Wallet Updates',
    settings_wallet_nsub:   'Payment credit/debit alerts',
    settings_promo_notif:   'Promotional Offers',
    settings_promo_nsub:    'Bonus aur offers',
    settings_app_section:   '📱 App Info',
    settings_cache:         'Clear Cache',
    settings_cache_sub:     'App data clear karo',
    settings_notif_msg:     'Notifications settings OS settings se manage karo:\nSettings → Apps → Sppero Buddy → Notifications',
    settings_cache_msg:     'App cache clear ho gaya!',

    // Bottom nav
    nav_earnings: 'Kamai',
    nav_bonus:    'Bonus',
  },

  en: {
    // Login
    login_title:         '🚗 Captain Login',
    login_subtitle:      'Drive with Sppero and earn every day',
    login_otp_title:     '🔑 Enter OTP',
    login_otp_sub:       '6-digit OTP sent to +91 {phone}',
    login_sending:       '⏳ Sending OTP...',
    login_send_otp:      'Send OTP →',
    login_verifying:     '⏳ Verifying...',
    login_verify:        '✅ Login',
    login_resend:        '🔄 Resend OTP',
    login_resend_wait:   'Resend in {sec}s',
    login_change_number: '← Change Number',
    login_otp_tip:       'Copy the SMS OTP and paste — it auto-fills into the 6 boxes!',

    // Login captions
    cap0_l1: 'Become Your',       cap0_l2: 'Own Boss',        cap0_sub: 'No office, no fixed hours. You choose when you drive.',
    cap1_l1: 'Help Riders',       cap1_l2: 'Get There',       cap1_sub: 'Every ride is a story of trust and service.',
    cap2_l1: 'Earn ₹800+',        cap2_l2: 'Every Day',       cap2_sub: 'Steady income, credited instantly to your wallet.',
    cap3_l1: "India's Own",       cap3_l2: 'Ride Platform',   cap3_sub: 'Built for Bharat. Powered by 10,000+ Captains.',
    cap4_l1: 'Join & Keep',       cap4_l2: 'Earning Daily',   cap4_sub: 'Morning, noon, or night — your schedule, your earnings.',

    // Language picker
    lang_choose:    'Choose Language',
    lang_hi_label:  'हिंदी + EN',
    lang_en_label:  'English',

    // Live tab — idle state
    live_waiting_title: 'Waiting for Rides...',
    live_waiting_sub:   'New rides will appear here\nand your phone will vibrate',
    live_offline_title:  "You're Offline",
    live_offline_sub:    'Go online from Home tab\nto start receiving rides',
    live_go_home:        'Go to Home Tab',

    // Live tab — ride accept
    live_accept_loading: 'Accepting...',
    live_accept:         'ACCEPT',
    live_reject:         'Reject',

    // Live tab — trip buttons
    trip_verify_start:   '🚀 Verify OTP & Start Trip',
    trip_complete:       '✅ Complete Trip',

    // Hourly live card
    hourly_accept:  '✓ Accept',
    hourly_skip:    '✕ Skip',

    // Home tab status bar
    home_live_new_ride: '🔔 New Ride Request — Accept Now!',
    home_live_pickup:   '🚗 Active Ride — Go to Pickup',
    home_live_otp:      '🚗 Active Ride — Verify OTP',
    home_live_ongoing:  '🚗 Active Ride — Trip in Progress',
    home_live_hourly:   '⏱️ Hourly Ride Active',

    // Profile tab banner
    prof_new_ride_banner: '🔔 New Ride! ₹{fare}',
    prof_view:            'View →',

    // Settings
    settings_lang:      'Language',
    settings_lang_sub:  'Change app language',
    settings_notif_section: '🔔 Notifications',
    settings_ride_notif:    'Ride Requests',
    settings_ride_nsub:     'New ride notifications',
    settings_wallet_notif:  'Wallet Updates',
    settings_wallet_nsub:   'Payment credit/debit alerts',
    settings_promo_notif:   'Promotional Offers',
    settings_promo_nsub:    'Bonus and offers',
    settings_app_section:   '📱 App Info',
    settings_cache:         'Clear Cache',
    settings_cache_sub:     'Clear app data',
    settings_notif_msg:     'Manage notification settings from OS:\nSettings → Apps → Sppero Buddy → Notifications',
    settings_cache_msg:     'App cache cleared!',

    // Bottom nav
    nav_earnings: 'Earnings',
    nav_bonus:    'Bonus',
  },
};
