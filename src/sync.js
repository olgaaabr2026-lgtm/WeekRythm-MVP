// sync.js — синхронизация «Ритм Недели»
// Два слоя: автосинк через Supabase + ручной экспорт/импорт JSON.
// Если env-переменные не выставлены — работает только localStorage (graceful degradation).

import { createClient } from '@supabase/supabase-js';

// ── Supabase client ──────────────────────────────────────────────────────────
// Создаётся один раз. Если URL или ключ не заданы — все cloud-функции вернут null.
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const TABLE = 'planner_states';

let _sb = null;
function sb() {
  if (!_sb && SUPABASE_URL && SUPABASE_ANON_KEY) {
    _sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _sb;
}

// ── UID ──────────────────────────────────────────────────────────────────────
const LS_UID_KEY = 'clay-planner-uid';

/**
 * Возвращает uid текущего пользователя.
 * Приоритеты:
 *   1. URL-параметр ?uid=   (переход по личной ссылке)
 *   2. localStorage
 *   3. crypto.randomUUID()  (первый запуск)
 */
export function getOrCreateUid() {
  // 1. URL-параметр
  try {
    const urlUid = new URLSearchParams(window.location.search).get('uid');
    if (urlUid && /^[0-9a-f-]{36}$/i.test(urlUid)) {
      localStorage.setItem(LS_UID_KEY, urlUid);
      // убираем uid из адресной строки без перезагрузки
      const clean = new URL(window.location.href);
      clean.searchParams.delete('uid');
      window.history.replaceState({}, '', clean.toString());
      return urlUid;
    }
  } catch {}

  // 2. localStorage
  try {
    const stored = localStorage.getItem(LS_UID_KEY);
    if (stored) return stored;
  } catch {}

  // 3. Новый uid
  const fresh = crypto.randomUUID();
  try { localStorage.setItem(LS_UID_KEY, fresh); } catch {}
  return fresh;
}

/**
 * Возвращает полный URL для шаринга: текущий origin + path + ?uid=<uid>.
 * Пользователь сохраняет эту ссылку — на другом устройстве откроются его данные.
 */
export function getShareUrl(uid) {
  const url = new URL(window.location.href);
  url.searchParams.set('uid', uid);
  return url.toString();
}

// ── Cloud CRUD ───────────────────────────────────────────────────────────────

/**
 * Загрузить состояние из облака.
 * Возвращает объект { tasks, closedDays, lastSeenWeekId, userClearedAll, _cloudUpdatedAt }
 * или null если Supabase не настроен / строки нет / ошибка сети.
 */
export async function loadFromCloud(uid) {
  const client = sb();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from(TABLE)
      .select('data, updated_at')
      .eq('uid', uid)
      .maybeSingle();      // maybeSingle: не кидает ошибку если строки нет
    if (error || !data) return null;
    return { ...data.data, _cloudUpdatedAt: data.updated_at };
  } catch {
    return null;
  }
}

/**
 * Сохранить состояние в облако (upsert по uid).
 * Возвращает true при успехе, false при ошибке.
 */
export async function saveToCloud(uid, stateData) {
  const client = sb();
  if (!client) return false;
  try {
    const { error } = await client
      .from(TABLE)
      .upsert(
        { uid, data: stateData, updated_at: new Date().toISOString() },
        { onConflict: 'uid' }
      );
    return !error;
  } catch {
    return false;
  }
}

// ── Debounced autosave ───────────────────────────────────────────────────────
let _saveTimer = null;

/**
 * Откладывает сохранение на delay мс. Вызывать при каждом изменении state.
 *
 * @param uid       - uid пользователя
 * @param stateData - { tasks, closedDays, lastSeenWeekId, userClearedAll }
 * @param onStatus  - колбек (status: 'pending'|'syncing'|'saved'|'error'|'offline')
 * @param delay     - задержка в мс (по умолчанию 1500)
 */
export function scheduleSave(uid, stateData, onStatus, delay = 1500) {
  clearTimeout(_saveTimer);
  onStatus('pending');
  _saveTimer = setTimeout(async () => {
    if (!navigator.onLine) { onStatus('offline'); return; }
    onStatus('syncing');
    const ok = await saveToCloud(uid, stateData);
    onStatus(ok ? 'saved' : 'error');
  }, delay);
}

// ── Export / Import JSON ─────────────────────────────────────────────────────

/**
 * Скачать текущее состояние как .json файл.
 * Формат совместим с importJSON.
 */
export function exportJSON(state) {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: state.tasks,
    closedDays: state.closedDays || {},
    lastSeenWeekId: state.ui?.lastSeenWeekId || null,
    userClearedAll: state.ui?.userClearedAll === true
  };
  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: 'application/json' }
  );
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = `ritm-nedeli-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Прочитать .json файл и вернуть распаршенный объект.
 * Бросает Error если файл невалидный.
 */
export function importJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed || !Array.isArray(parsed.tasks)) {
          reject(new Error('Неверный формат — нужен файл экспорта «Ритм Недели»'));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error('Не удалось прочитать файл'));
      }
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsText(file);
  });
}
