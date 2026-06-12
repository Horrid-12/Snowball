import { Capacitor } from '@capacitor/core';
import { parseTaskDateTime } from '../utils/productivityScore.js';
import { isTauriDesktop } from '../config.js';

const SETTINGS_KEY = 'snowball_notification_settings';
const DEFAULT_SETTINGS = {
    enabled: false,
    habitReminderTime: '08:00'
};
const WEB_LOOKAHEAD_MS = 24 * 60 * 60 * 1000;
const MISSED_NOTIFICATION_GRACE_MS = 15 * 60 * 1000;
const ANDROID_MAX_TASK_NOTIFICATIONS = 48;
const ANDROID_CHANNEL_ID = 'snowball-reminders';

const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

const hashString = (value) => {
    let hash = 0;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
};

const makeTaskNotificationId = (task) => 100000 + (hashString(`task:${task.id}`) % 800000);
const HABIT_NOTIFICATION_ID = 900001;

class NotificationService {
    constructor() {
        this.webTimers = [];
    }

    async ensureAndroidChannel() {
        if (!isNativeAndroid) return;
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        await LocalNotifications.createChannel({
            id: ANDROID_CHANNEL_ID,
            name: 'Snowball reminders',
            description: 'Task and habit reminders from Snowball',
            importance: 5,
            visibility: 1,
            vibration: true,
        });
    }

    loadSettings() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw) return { ...DEFAULT_SETTINGS };
            return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
        } catch (_err) {
            return { ...DEFAULT_SETTINGS };
        }
    }

    saveSettings(nextSettings) {
        const merged = { ...DEFAULT_SETTINGS, ...nextSettings };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
        window.dispatchEvent(new CustomEvent('snowball-notification-settings-changed', { detail: merged }));
        return merged;
    }

    async getPermissionStatus() {
        if (isTauriDesktop) {
            try {
                const { isPermissionGranted } = await import('@tauri-apps/plugin-notification');
                return await isPermissionGranted() ? 'granted' : 'default';
            } catch {
                return 'unsupported';
            }
        }

        if (isNativeAndroid) {
            const { LocalNotifications } = await import('@capacitor/local-notifications');
            const result = await LocalNotifications.checkPermissions();
            return result.display || 'prompt';
        }

        if (typeof Notification === 'undefined') return 'unsupported';
        return Notification.permission;
    }

    async requestPermission() {
        if (isTauriDesktop) {
            try {
                const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
                let granted = await isPermissionGranted();
                if (!granted) {
                    granted = (await requestPermission()) === 'granted';
                }
                return granted ? 'granted' : 'denied';
            } catch {
                return 'unsupported';
            }
        }

        if (isNativeAndroid) {
            const { LocalNotifications } = await import('@capacitor/local-notifications');
            const result = await LocalNotifications.requestPermissions();
            const status = result.display || 'denied';
            if (status === 'granted') {
                await this.ensureAndroidChannel();
            }
            return status;
        }

        if (typeof Notification === 'undefined') return 'unsupported';
        return Notification.requestPermission();
    }

    clearWebTimers() {
        this.webTimers.forEach((timer) => clearTimeout(timer));
        this.webTimers = [];
    }

    getNotificationRecordKey(key) {
        return `snowball_notification_sent_${key}`;
    }

    hasSentNotification(key, triggerAt) {
        return localStorage.getItem(this.getNotificationRecordKey(key)) === triggerAt;
    }

    markNotificationSent(key, triggerAt) {
        localStorage.setItem(this.getNotificationRecordKey(key), triggerAt);
    }

    async showWebNotification(title, body, tag) {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        new Notification(title, { body, tag });
    }

    async showTauriNotification(title, body) {
        try {
            const { sendNotification, isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
            let granted = await isPermissionGranted();
            if (!granted) {
                granted = (await requestPermission()) === 'granted';
            }
            if (!granted) return;
            await sendNotification({ title, body });
        } catch {
            // Tauri notification plugin unavailable — silently degrade
        }
    }

    async showAndroidTestNotification() {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        await this.ensureAndroidChannel();
        await LocalNotifications.schedule({
            notifications: [{
                id: 999001,
                title: 'Snowball notifications enabled',
                body: 'Task and habit reminders are ready on this device.',
                schedule: { at: new Date(Date.now() + 1500), allowWhileIdle: true },
                channelId: ANDROID_CHANNEL_ID,
                extra: { type: 'test' }
            }]
        });
    }

    async showWebTestNotification() {
        await this.showWebNotification(
            'Snowball notifications enabled',
            'Task and habit reminders are ready in this browser.',
            'snowball_test'
        );
    }

    async showTauriTestNotification() {
        await this.showTauriNotification(
            'Snowball notifications enabled',
            'Task and habit reminders are ready on this desktop app.'
        );
    }

    async sendTestNotification() {
        const permission = await this.getPermissionStatus();
        if (permission !== 'granted') return false;

        if (isNativeAndroid) {
            await this.showAndroidTestNotification();
            return true;
        }

        if (isTauriDesktop) {
            await this.showTauriTestNotification();
            return true;
        }

        await this.showWebTestNotification();
        return true;
    }

    scheduleTimerNotification({ id, title, body, when, sender }) {
        const delay = when.getTime() - Date.now();
        if (delay <= 0 || delay > WEB_LOOKAHEAD_MS) return;

        const triggerAt = when.toISOString();
        if (this.hasSentNotification(id, triggerAt)) return;

        const timer = setTimeout(async () => {
            await sender(title, body, id);
            this.markNotificationSent(id, triggerAt);
        }, delay);

        this.webTimers.push(timer);
    }

    getNextHabitReminderDate(timeText) {
        const [hoursText = '08', minutesText = '00'] = String(timeText || '08:00').split(':');
        const hours = Number(hoursText);
        const minutes = Number(minutesText);
        const next = new Date();
        next.setHours(hours, minutes, 0, 0);
        if (next.getTime() <= Date.now()) {
            next.setDate(next.getDate() + 1);
        }
        return next;
    }

    getTodayHabitReminderDate(timeText) {
        const [hoursText = '08', minutesText = '00'] = String(timeText || '08:00').split(':');
        const hours = Number(hoursText);
        const minutes = Number(minutesText);
        const today = new Date();
        today.setHours(hours, minutes, 0, 0);
        return today;
    }

    buildPendingTaskReminders(tasks = []) {
        return tasks
            .filter((task) => {
                const allocated = Number(task?.tasksAllocated || 0);
                const completed = Number(task?.tasksCompleted || 0);
                return allocated > 0 ? completed < allocated : completed <= 0;
            })
            .map((task) => ({ task, dueAt: parseTaskDateTime(task?.date) }))
            .filter((entry) => entry.dueAt && entry.dueAt.getTime() > Date.now())
            .sort((a, b) => a.dueAt - b.dueAt);
    }

    async syncAndroidNotifications(tasks = [], habits = []) {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        const settings = this.loadSettings();

        const pending = await LocalNotifications.getPending();
        const existing = pending.notifications || [];
        const ours = existing.filter((item) => item.id >= 100000);
        if (ours.length > 0) {
            await LocalNotifications.cancel({ notifications: ours.map((item) => ({ id: item.id })) });
        }

        if (!settings.enabled) return;

        const notifications = [];
        const upcomingTasks = this.buildPendingTaskReminders(tasks).slice(0, ANDROID_MAX_TASK_NOTIFICATIONS);

        for (const { task, dueAt } of upcomingTasks) {
            notifications.push({
                id: makeTaskNotificationId(task),
                title: 'Task reminder',
                body: `${task.title} is due now${task.description ? `: ${task.description}` : ''}`,
                schedule: { at: dueAt, allowWhileIdle: true },
                channelId: ANDROID_CHANNEL_ID,
                extra: { type: 'task', taskId: String(task.id) }
            });
        }

        if (habits.length > 0) {
            const reminderAt = this.getNextHabitReminderDate(settings.habitReminderTime);
            notifications.push({
                id: HABIT_NOTIFICATION_ID,
                title: 'Habit check-in',
                body: `You have ${habits.length} habit${habits.length === 1 ? '' : 's'} waiting today.`,
                schedule: { at: reminderAt, allowWhileIdle: true },
                channelId: ANDROID_CHANNEL_ID,
                extra: { type: 'habit-daily' }
            });
        }

        if (notifications.length > 0) {
            await LocalNotifications.schedule({ notifications });
        }
    }

    async syncTimerNotifications(tasks = [], habits = [], sender) {
        this.clearWebTimers();

        const settings = this.loadSettings();
        if (!settings.enabled) return;

        for (const { task, dueAt } of this.buildPendingTaskReminders(tasks)) {
            this.scheduleTimerNotification({
                id: `task_${task.id}`,
                title: 'Task reminder',
                body: `${task.title} is due now.`,
                when: dueAt,
                sender
            });
        }

        if (habits.length > 0) {
            const todayReminderAt = this.getTodayHabitReminderDate(settings.habitReminderTime);
            const nextReminderAt = this.getNextHabitReminderDate(settings.habitReminderTime);
            const now = Date.now();
            const reminderKey = todayReminderAt.toISOString();

            if (
                todayReminderAt.getTime() <= now &&
                (now - todayReminderAt.getTime()) <= MISSED_NOTIFICATION_GRACE_MS &&
                !this.hasSentNotification('habit_daily', reminderKey)
            ) {
                await sender(
                    'Habit check-in',
                    `You have ${habits.length} habit${habits.length === 1 ? '' : 's'} to review.`,
                    'habit_daily'
                );
                this.markNotificationSent('habit_daily', reminderKey);
            } else {
                this.scheduleTimerNotification({
                    id: 'habit_daily',
                    title: 'Habit check-in',
                    body: `You have ${habits.length} habit${habits.length === 1 ? '' : 's'} to review.`,
                    when: nextReminderAt,
                    sender
                });
            }
        }
    }

    async syncWebNotifications(tasks = [], habits = []) {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        await this.syncTimerNotifications(tasks, habits, this.showWebNotification.bind(this));
    }

    async syncTauriNotifications(tasks = [], habits = []) {
        const permission = await this.getPermissionStatus();
        if (permission !== 'granted') return;
        await this.syncTimerNotifications(tasks, habits, this.showTauriNotification.bind(this));
    }

    async sync({ tasks = [], habits = [] }) {
        const settings = this.loadSettings();

        if (!settings.enabled) {
            this.clearWebTimers();
            if (isNativeAndroid) {
                await this.syncAndroidNotifications([], []);
            }
            return;
        }

        if (isNativeAndroid) {
            await this.syncAndroidNotifications(tasks, habits);
            return;
        }

        if (isTauriDesktop) {
            await this.syncTauriNotifications(tasks, habits);
            return;
        }

        await this.syncWebNotifications(tasks, habits);
    }
}

export const notificationService = new NotificationService();
