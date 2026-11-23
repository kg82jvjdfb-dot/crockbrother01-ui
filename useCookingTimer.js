import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
const Notifications = Platform.OS === 'web' ? null : require('expo-notifications');

const timerStorageKey = 'vadyaway:timer:v1';
const channelId = 'cooking-timer';

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const canNotify = permissions => permissions.granted ||
  permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

export default function useCookingTimer() {
  const [timer, setTimer] = useState(null);
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const pending = useRef(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(timerStorageKey).then(raw => {
      if (!active || raw === null) return;
      const saved = JSON.parse(raw);
      if (!saved || (Notifications ? typeof saved.id !== 'string' : saved.id !== null) ||
          !Number.isFinite(saved.endsAt) ||
          typeof saved.recipeName !== 'string') return;
      const time = Date.now();
      setNow(time);
      if (saved.endsAt > time) setTimer(saved);
      else setMessage('Время вышло: ' + saved.recipeName);
    }).catch(error => {
      console.warn('VadyaWay could not restore the cooking timer', error);
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!timer) return;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      if (time >= timer.endsAt) {
        setTimer(null);
        setMessage('Время вышло: ' + timer.recipeName);
      }
    };
    const interval = setInterval(tick, 250);
    tick();
    return () => clearInterval(interval);
  }, [timer]);

  async function start(minutes, recipeName) {
    if (busy || pending.current || timer) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    try {
      if (Notifications) {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync(channelId, {
            name: 'Таймер готовки',
            importance: Notifications.AndroidImportance.HIGH,
            sound: 'default',
          });
        }
        let permissions = await Notifications.getPermissionsAsync();
        if (!canNotify(permissions) && permissions.canAskAgain) {
          permissions = await Notifications.requestPermissionsAsync();
        }
        if (!canNotify(permissions)) {
          if (permissions.canAskAgain) {
            setMessage('Чтобы получить сигнал, разреши уведомления при следующем запуске таймера.');
          } else {
            Alert.alert(
              'Разрешить уведомления?',
              'Включи уведомления в настройках, чтобы телефон подал сигнал, когда время выйдет. Затем снова нажми «Запустить».',
              [
                { text: 'Не сейчас', style: 'cancel' },
                {
                  text: 'Открыть настройки',
                  onPress: () => {
                    Linking.openSettings().catch(() => {
                      setMessage('Открой настройки телефона и включи уведомления для приложения.');
                    });
                  },
                },
              ],
            );
          }
          return;
        }
      }
      const startedAt = Date.now();
      const endsAt = startedAt + minutes * 60_000;
      const id = Notifications ? await Notifications.scheduleNotificationAsync({
        content: { title: 'Таймер готовки завершён', body: recipeName, sound: 'default' },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(endsAt),
          ...(Platform.OS === 'android' ? { channelId } : {}),
        },
      }) : null;
      const next = { id, endsAt, recipeName };
      setNow(startedAt);
      setTimer(next);
      try {
        await AsyncStorage.setItem(timerStorageKey, JSON.stringify(next));
      } catch {
        setMessage('Таймер запущен, но не сохранится после перезапуска.');
      }
    } catch {
      setMessage('Не удалось запланировать уведомление. Попробуй ещё раз.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function cancel() {
    if (!timer || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      if (Notifications) await Notifications.cancelScheduledNotificationAsync(timer.id);
      setTimer(null);
      setMessage('');
      try {
        await AsyncStorage.removeItem(timerStorageKey);
      } catch {
        setMessage('Таймер отменён, но запись о нём не удалось удалить.');
      }
    } catch {
      setMessage('Не удалось отменить таймер. Попробуй ещё раз.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const seconds = timer ? Math.max(0, Math.ceil((timer.endsAt - now) / 1000)) : 0;
  return { timer, seconds, busy, message, start, cancel };
}
