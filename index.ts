import { registerRootComponent } from 'expo';
import React from 'react';
import { Text, ScrollView } from 'react-native';
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

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      const e = this.state.error;
      return React.createElement(
        ScrollView,
        {
          style: { flex: 1, backgroundColor: '#fff', padding: 16 },
          contentContainerStyle: { paddingTop: 60 },
        },
        React.createElement(
          Text,
          { style: { color: '#cc0000', fontSize: 18, fontWeight: 'bold', marginBottom: 8 } },
          'App JS Error'
        ),
        React.createElement(
          Text,
          { style: { color: '#333', fontSize: 14, marginBottom: 12 } },
          e.message || String(e)
        ),
        React.createElement(
          Text,
          { style: { color: '#666', fontSize: 11 } },
          (e.stack || '').substring(0, 1200)
        )
      );
    }
    return this.props.children;
  }
}

const Root = () =>
  React.createElement(ErrorBoundary, {}, React.createElement(App));

registerRootComponent(Root);
