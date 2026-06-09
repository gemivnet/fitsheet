// ReminderSync — re-schedules on-device local notifications from the server's reminder payload
// on launch and whenever the app returns to the foreground. Renders nothing.

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { api } from '../lib/api';
import { syncReminders } from '../lib/notifications';

export function ReminderSync() {
  useEffect(() => {
    const run = () => api.settings.reminders().then(syncReminders).catch(() => {});
    run();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') run();
    });
    return () => sub.remove();
  }, []);
  return null;
}
