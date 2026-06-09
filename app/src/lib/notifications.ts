// notifications.ts — on-device local scheduled reminders (the abstraction seam).
// v1 schedules locally from synced server data; swappable to remote push later without
// touching screens. Works in Expo Go (local notifications only).

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'fitsheet reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  return status === 'granted';
}

export interface ReminderPayload {
  weigh_in_weekday: number; // 0 = Sunday
  weigh_in_hour: number;
  workout_reminders: boolean;
  workouts: { id: number; title: string; scheduled_date: string; planned_minutes: number | null }[];
}

const CAP = 60; // stay under iOS's 64 pending limit

/** Cancel everything, then reschedule from the server's reminder payload. Call on app foreground. */
export async function syncReminders(p: ReminderPayload): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (!(await requestPermissions())) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    let n = 0;

    // weekly weigh-in (expo weekday is 1=Sun..7=Sat)
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Weigh-in time ⚖️', body: 'Hop on the scale and log your weight for the week.' },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: (p.weigh_in_weekday % 7) + 1,
        hour: p.weigh_in_hour,
        minute: 0,
      },
    });
    n++;

    if (p.workout_reminders) {
      for (const w of p.workouts) {
        if (n >= CAP) break;
        const d = new Date(`${w.scheduled_date}T18:00:00`);
        d.setDate(d.getDate() - 1); // the evening before
        if (d.getTime() <= Date.now()) continue;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Workout tomorrow 💪',
            body: `${w.title}${w.planned_minutes ? ` · ${w.planned_minutes} min` : ''} — make a little extra time.`,
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: d },
        });
        n++;
      }
    }
  } catch (e) {
    // Best-effort: local notifications are limited in Expo Go.
    console.warn('[notifications] syncReminders failed', e);
  }
}

export async function cancelAll(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    /* noop */
  }
}
