import { registerRootComponent } from 'expo';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Register notification channels before App mounts — Android drops notifications
// if channelId doesn't exist when they arrive (e.g. fresh install, first FCM).
// Channels persist across app restarts once created, so this is idempotent.
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('ride_requests', {
    name: 'Ride Requests',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 500, 150, 500, 150, 800],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  }).catch(() => {});

  Notifications.setNotificationChannelAsync('default', {
    name: 'General Notifications',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  }).catch(() => {});

  Notifications.setNotificationChannelAsync('driver_status', {
    name: 'Driver Online Status',
    importance: Notifications.AndroidImportance.LOW,
    enableVibrate: false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  }).catch(() => {});
}

import App from './App';
registerRootComponent(App);
