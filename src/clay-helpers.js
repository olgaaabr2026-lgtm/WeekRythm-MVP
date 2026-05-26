// Clay variant — tokens, helpers, initial data
// All pure functions and constants; no React.

// ───── theme palettes ─────
const CLAY_LIGHT = {
  mode: 'light',
  bg: '#f0e4d5',
  paper: '#fbf2e4',
  paperSoft: '#f5e9d6',
  clay: '#e8d4b8',
  ink: '#3a2418',
  inkSoft: '#6b4738',
  muted: '#a07e63',
  border: 'rgba(90, 50, 30, 0.14)',
  borderStrong: 'rgba(90, 50, 30, 0.28)',
  coral: '#c44a32',
  coralDeep: '#9a3a26',
  coralSoft: '#e8a087',
  peach: '#d99560',
  peachSoft: '#f0c89a',
  sage: '#7a9468',
  sageSoft: '#b8c8a4',
  amber: '#c98a3a',
  lavender: '#9484a8',
  lavenderSoft: '#c4b8d0',
  cream: '#f5e1c0',
  backdrop: 'rgba(58, 36, 24, 0.45)',
  grainOpacity: 0.55
};

// «Тёплый уголь» — вечерний режим
const CLAY_DARK = {
  mode: 'dark',
  bg: '#231811',
  paper: '#332217',
  paperSoft: '#2c1d14',
  clay: '#43301f',
  ink: '#f3e6cf',
  inkSoft: '#d5b793',
  muted: '#9a7f63',
  border: 'rgba(243, 230, 207, 0.10)',
  borderStrong: 'rgba(243, 230, 207, 0.22)',
  coral: '#e87358',
  coralDeep: '#c44a32',
  coralSoft: '#7e3a2c',
  peach: '#e8b078',
  peachSoft: '#7a4a2c',
  sage: '#9eba84',
  sageSoft: '#3e5230',
  amber: '#d9a050',
  lavender: '#b3a4c6',
  lavenderSoft: '#4a3e58',
  cream: '#5a4530',
  backdrop: 'rgba(10, 6, 3, 0.65)',
  grainOpacity: 0.35
};

// «CLAY» is a live reference that's swapped on theme change.
// Components read `CLAY.x` freshly on every render — assignment in ClayVariant render
// makes all inline styles re-evaluate with the new palette.
let CLAY = CLAY_LIGHT;

const CLAY_CATEGORIES = [
  { id: 'work',     label: 'Работа',   colorKey: 'coral' },
  { id: 'personal', label: 'Личное',   colorKey: 'lavender' },
  { id: 'health',   label: 'Здоровье', colorKey: 'sage' },
  { id: 'rest',     label: 'Отдых',    colorKey: 'peach' },
  { id: 'learning', label: 'Обучение', colorKey: 'amber' }
];

function getCategoryColor(id) {
  const cat = CLAY_CATEGORIES.find(c => c.id === id);
  if (!cat) return CLAY.muted;
  return CLAY[cat.colorKey] || CLAY.muted;
}

const CLAY_ENERGIES = [
  { value: 1, label: 'Лёгкая',  glyph: '●' },
  { value: 2, label: 'Средняя', glyph: '●●' },
  { value: 3, label: 'Тяжёлая', glyph: '●●●' }
];

const CLAY_DURATIONS = [
  { value: '15м', label: '15 мин' },
  { value: '30м', label: '30 мин' },
  { value: '1ч',  label: '1 час' },
  { value: '2ч+', label: '2+ часа' }
];

// Перевод duration в условные часы нагрузки
const DURATION_H = {
  '15м': 0.25,
  '30м': 0.5,
  '1ч':  1.0,
  '2ч+': 2.0
};

// Множитель energy — во сколько раз задача «тяжелее» своей длительности
const ENERGY_MULT = {
  1: 1.0,  // лёгкая: идёт как идёт
  2: 1.5,  // средняя: полтора коэффициента
  3: 2.0   // тяжёлая: двойная нагрузка
};

// Категориальный коэффициент: психофизиологическая природа нагрузки.
// Работа = эталон (1.0); Отдых почти не нагружает (0.1, не 0 — см. комментарий).
const CATEGORY_MULT = {
  work:     1.0,  // концентрация + ответственность + дедлайны
  learning: 0.9,  // требует концентрации, но без внешней ответственности
  personal: 0.5,  // бытовые дела: надо сделать, но не «интеллектуальный труд»
  health:   0.3,  // физическая активность восстанавливает, а не истощает
  rest:     0.1   // почти нулевая нагрузка (не 0 — чтобы не показывать «пусто» при наличии задач)
};

// CLAY_LOAD must reflect current theme — make it a getter
function getLoadStyle(key) {
  if (CLAY.mode === 'dark') {
    return ({
      empty:    { bg: CLAY.clay,   ink: CLAY.muted,   label: 'пусто',    glyph: '◯' },
      light:    { bg: '#4a5a3a',   ink: '#cee0b8',    label: 'лёгкий',   glyph: '◔' },
      normal:   { bg: '#7e5a23',   ink: '#f0d4a0',    label: 'ровный',   glyph: '◑' },
      dense:    { bg: '#8e3e2a',   ink: '#f0c8b0',    label: 'плотный',  glyph: '◕' },
      overload: { bg: '#c44a32',   ink: '#fdf2e4',    label: 'перегруз', glyph: '●' }
    })[key];
  }
  return ({
    empty:    { bg: CLAY.clay,  ink: CLAY.muted,  label: 'пусто',    glyph: '◯' },
    light:    { bg: '#cee0b8',  ink: '#476039',   label: 'лёгкий',   glyph: '◔' },
    normal:   { bg: '#e8c993',  ink: '#7e5a23',   label: 'ровный',   glyph: '◑' },
    dense:    { bg: '#e8a087',  ink: '#9a3a26',   label: 'плотный',  glyph: '◕' },
    overload: { bg: '#d35a3e',  ink: '#fdf2e4',   label: 'перегруз', glyph: '●' }
  })[key];
}

// ───── date helpers ─────
function pad(n) { return String(n).padStart(2, '0'); }

function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function weekStartFor(date) {
  const d = new Date(date);
  const dow = d.getDay() || 7;
  d.setDate(d.getDate() - (dow - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekDates(start) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

const RU_WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const RU_WEEKDAYS_LONG  = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function weekdayShort(date) {
  const idx = (date.getDay() || 7) - 1;
  return RU_WEEKDAYS_SHORT[idx];
}

function weekdayLong(date) {
  const idx = (date.getDay() || 7) - 1;
  return RU_WEEKDAYS_LONG[idx];
}

function dateLabel(date) {
  return `${date.getDate()} ${RU_MONTHS[date.getMonth()]}`;
}

function weekRangeLabel(start, end) {
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${RU_MONTHS[end.getMonth()]}`;
  }
  return `${dateLabel(start)} – ${dateLabel(end)}`;
}

// ───── task math ─────
function taskScore(task) {
  const d = DURATION_H[task.duration] ?? 0.5;
  const e = ENERGY_MULT[Number(task.energy)] ?? 1.0;
  const c = CATEGORY_MULT[task.category] ?? 0.7;
  return d * e * c;
}

function dayLoad(tasks, dateStr) {
  return tasks
    .filter(t => t.date === dateStr && !t.completed)
    .reduce((s, t) => s + taskScore(t), 0);
}

// Пороги под новую систему (duration × energy × category).
// Эталон: 6 ч работы средней = 6 × 1.5 × 1.0 = 9.0 → граница перегруза.
function loadKey(score) {
  if (score === 0)  return 'empty';
  if (score <= 3.0) return 'light';
  if (score <= 6.0) return 'normal';
  if (score <= 9.0) return 'dense';
  return 'overload';
}

// ───── BLOB radius generator (hand-formed shapes) ─────
function blob(seed = 0) {
  const r = (s) => 22 + ((Math.sin(seed * 7.31 + s) + 1) * 6);
  return `${r(0)}px ${r(1)}px ${r(2)}px ${r(3)}px / ${r(4)}px ${r(5)}px ${r(6)}px ${r(7)}px`;
}

function categoryOf(id) {
  const cat = CLAY_CATEGORIES.find(c => c.id === id);
  if (!cat) return { label: 'Другое', color: CLAY.muted };
  return { ...cat, color: CLAY[cat.colorKey] || CLAY.muted };
}

// ───── current week (computed from real Date) ─────
function getTodayISO() {
  return fmtDate(new Date());
}

function getCurrentWeekStart() {
  return weekStartFor(new Date());
}

function getCurrentWeekEnd() {
  const start = getCurrentWeekStart();
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

function getCurrentWeekRange() {
  return {
    start: getCurrentWeekStart(),
    end: getCurrentWeekEnd(),
    startISO: fmtDate(getCurrentWeekStart()),
    endISO: fmtDate(getCurrentWeekEnd())
  };
}

// ───── ISO week id (e.g. "2026-W22") ─────
function getWeekId(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function getCurrentWeekId() {
  return getWeekId(new Date());
}

// ───── task scope helpers ─────
function isInCurrentWeek(task) {
  if (!task || !task.date) return false;
  const { startISO, endISO } = getCurrentWeekRange();
  return task.date >= startISO && task.date <= endISO;
}

function isAntichaosTask(task) {
  return task && task.date === null;
}

function isFutureTask(task) {
  if (!task || !task.date) return false;
  const { endISO } = getCurrentWeekRange();
  return task.date > endISO;
}

function isPastTask(task) {
  if (!task || !task.date) return false;
  const { startISO } = getCurrentWeekRange();
  return task.date < startISO;
}

function isVisibleInAntichaos(task) {
  return isAntichaosTask(task) || isFutureTask(task) || (isPastTask(task) && !task.completed);
}

function isStatsTask(task) {
  return isInCurrentWeek(task);
}

function getCurrentWeekDates() {
  return weekDates(getCurrentWeekStart());
}

function currentWeekISOByOffset(offset) {
  const date = getCurrentWeekStart();
  date.setDate(date.getDate() + offset);
  return fmtDate(date);
}

// ───── initial sample tasks ─────

const CLAY_INITIAL_TASKS = [
  // Mon
  { id: 't1',  title: 'Stand-up команды',           date: currentWeekISOByOffset(0), category: 'work',     energy: 1, duration: '15м', important: false, completed: true,  note: '' },
  { id: 't2',  title: 'Прогулка после обеда',       date: currentWeekISOByOffset(0), category: 'health',   energy: 1, duration: '30м', important: false, completed: true,  note: '' },
  { id: 't3',  title: 'Глава из «Тихой силы»',      date: currentWeekISOByOffset(0), category: 'rest',     energy: 1, duration: '30м', important: false, completed: false, note: '' },
  // Tue
  { id: 't4',  title: 'Презентация для клиента',    date: currentWeekISOByOffset(1), category: 'work',     energy: 3, duration: '2ч+', important: true,  completed: false, note: 'Прислать слайды до 11:00' },
  { id: 't5',  title: 'Йога-сессия',                date: currentWeekISOByOffset(1), category: 'health',   energy: 2, duration: '1ч',  important: false, completed: false, note: '' },
  { id: 't6',  title: 'Ответить Лене',              date: currentWeekISOByOffset(1), category: 'personal', energy: 1, duration: '15м', important: false, completed: false, note: '' },
  // Wed
  { id: 't7',  title: '1:1 с Аней',                 date: currentWeekISOByOffset(2), category: 'work',     energy: 2, duration: '30м', important: false, completed: true,  note: '' },
  { id: 't8',  title: 'Купить продукты',            date: currentWeekISOByOffset(2), category: 'personal', energy: 1, duration: '30м', important: false, completed: false, note: '' },
  { id: 't9',  title: 'Позвонить маме',             date: currentWeekISOByOffset(2), category: 'personal', energy: 1, duration: '30м', important: false, completed: false, note: '' },
  // Thu (overload)
  { id: 't10', title: 'Глубокая работа над лендингом', date: currentWeekISOByOffset(3), category: 'work',  energy: 3, duration: '2ч+', important: true,  completed: false, note: '' },
  { id: 't11', title: 'Обед с Машей',               date: currentWeekISOByOffset(3), category: 'personal', energy: 1, duration: '1ч',  important: false, completed: false, note: '' },
  { id: 't12', title: 'Сделать ревью PR',           date: currentWeekISOByOffset(3), category: 'work',     energy: 2, duration: '1ч',  important: false, completed: false, note: '' },
  { id: 't13', title: 'Статья по UX',               date: currentWeekISOByOffset(3), category: 'learning', energy: 3, duration: '2ч+', important: false, completed: false, note: '' },
  // Fri
  { id: 't14', title: 'Разобрать почту',            date: currentWeekISOByOffset(4), category: 'work',     energy: 1, duration: '30м', important: false, completed: false, note: '' },
  { id: 't15', title: 'Сходить в парк',             date: currentWeekISOByOffset(4), category: 'rest',     energy: 2, duration: '1ч',  important: false, completed: false, note: '' },
  // Sat
  { id: 't16', title: 'Кофе в новом месте',         date: currentWeekISOByOffset(5), category: 'rest',     energy: 1, duration: '1ч',  important: false, completed: false, note: '' },
  { id: 't17', title: 'Длинная прогулка',           date: currentWeekISOByOffset(5), category: 'health',   energy: 1, duration: '1ч',  important: false, completed: false, note: '' },
  // Sun
  { id: 't18', title: 'Спланировать неделю',        date: currentWeekISOByOffset(6), category: 'personal', energy: 2, duration: '30м', important: false, completed: false, note: '' },
  { id: 't19', title: 'Медитация утром',            date: currentWeekISOByOffset(6), category: 'health',   energy: 1, duration: '15м', important: false, completed: false, note: '' },
  { id: 't20', title: 'Звонок с Артёмом',           date: currentWeekISOByOffset(6), category: 'personal', energy: 1, duration: '30м', important: false, completed: false, note: '' },
  // Антихаос (date=null)
  { id: 'a1',  title: 'Записаться к стоматологу',   date: null,         category: 'health',   energy: 1, duration: '30м', important: false, completed: false, note: '' },
  { id: 'a2',  title: 'Подумать про отпуск летом',  date: null,         category: 'personal', energy: 2, duration: '30м', important: false, completed: false, note: '' },
  { id: 'a3',  title: 'Поменять масло в машине',    date: null,         category: 'personal', energy: 2, duration: '1ч',  important: false, completed: false, note: '' }
];

function getDemoTasks() {
  const { start } = getCurrentWeekRange();
  const dayIso = (offset) => {
    const d = new Date(start);
    d.setDate(d.getDate() + offset);
    return fmtDate(d);
  };

  return CLAY_INITIAL_TASKS.map(t => {
    if (t.date === null) return { ...t, id: newTaskId() };
    const parsed = parseDate(t.date);
    const offset = parsed.getDay() === 0 ? 6 : parsed.getDay() - 1;
    return { ...t, id: newTaskId(), date: dayIso(offset) };
  });
}

function newTaskId() {
  return 'tk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

// ───── balance + advice + badges calc ─────
function calcBalance(tasks) {
  const inWeek = tasks.filter(isStatsTask);
  const total = inWeek.length;
  return CLAY_CATEGORIES.map(cat => {
    const count = inWeek.filter(t => t.category === cat.id).length;
    const pct = total ? Math.round((count / total) * 100) : 0;
    return { id: cat.id, label: cat.label, color: CLAY[cat.colorKey] || CLAY.muted, count, percent: pct };
  });
}

function calcProgress(tasks, closedDays) {
  const inWeek = tasks.filter(isStatsTask);
  const total = inWeek.length;
  const completed = inWeek.filter(t => t.completed).length;
  const remaining = total - completed;
  const percent = total ? Math.round(completed / total * 100) : 0;

  const weekDs = getCurrentWeekDates();
  let overloaded = 0;
  let busiest = '—';
  let highest = -1;
  weekDs.forEach(d => {
    const ds = fmtDate(d);
    const score = dayLoad(tasks, ds);
    if (loadKey(score) === 'overload') overloaded++;
    if (score > highest) { highest = score; busiest = weekdayLong(d); }
  });

  // rhythm index
  const progressScore = total ? completed / total * 100 : 0;
  const noOverloadScore = ((7 - overloaded) / 7) * 100;
  const hasRest = inWeek.some(t => t.category === 'rest');
  const restScore = hasRest ? 100 : 0;
  const rhythm = total ? Math.round(0.5 * progressScore + 0.3 * noOverloadScore + 0.2 * restScore) : 0;

  let rhythmStatus = 'Неделя дышит';
  if (rhythm <= 39) rhythmStatus = 'Нужна спасательная пауза';
  else if (rhythm <= 64) rhythmStatus = 'Есть риск мини-апокалипсиса';
  else if (rhythm <= 84) rhythmStatus = 'Плотная, но живая';

  return {
    total, completed, remaining, percent,
    closedDays: Object.keys(closedDays || {}).length,
    busiest, overloaded, rhythm, rhythmStatus, hasRest
  };
}

// returns { text, action?: { kind: 'move', taskId, suggestedDate } | null }
function calcAdvice(tasks, isFirstVisit) {
  const inWeek = tasks.filter(isStatsTask);
  const antiCount = tasks.filter(isAntichaosTask).length;
  if (inWeek.length === 0 && antiCount === 0) {
    return { text: 'Добро пожаловать. Добавь первую задачу — и неделя начнёт обретать форму.', action: null };
  }

  // overload check — suggest moving a task from overloaded day to lightest day
  const weekDs = getCurrentWeekDates();
  const dayScores = weekDs.map(d => ({ d, ds: fmtDate(d), score: dayLoad(tasks, fmtDate(d)) }));
  const overload = dayScores.find(x => loadKey(x.score) === 'overload');
  if (overload) {
    // find a lightest day that isn't itself overloaded
    const lightest = [...dayScores]
      .filter(x => x.ds !== overload.ds && loadKey(x.score) !== 'overload')
      .sort((a, b) => a.score - b.score)[0];
    // pick the smallest non-important task on overload day
    const movableTask = tasks
      .filter(t => t.date === overload.ds && !t.completed && !t.important)
      .sort((a, b) => taskScore(a) - taskScore(b))[0];
    if (lightest && movableTask) {
      return {
        text: `В ${weekdayLong(overload.d).toLowerCase()} намечается мини-апокалипсис. В ${weekdayLong(lightest.d).toLowerCase()} есть воздух — можно перенести туда одну задачу.`,
        action: { kind: 'move', taskId: movableTask.id, taskTitle: movableTask.title, fromDate: overload.ds, toDate: lightest.ds, toLabel: weekdayLong(lightest.d) }
      };
    }
    return {
      text: 'Один день перегружен — лучше разгрузить его до того, как он начнётся.',
      action: null
    };
  }

  if (inWeek.length > 0 && !inWeek.some(t => t.category === 'rest')) {
    return { text: 'Отдых пока не попал в план. Он тоже задача, просто добрая.', action: null };
  }

  if (antiCount >= 4) {
    return { text: 'Антихаос немного разросся. Можно выбрать одну задачу и найти ей день.', action: null };
  }

  const workCount = inWeek.filter(t => t.category === 'work').length;
  if (inWeek.length > 0 && workCount / inWeek.length > 0.6) {
    return { text: 'Работа занимает почти всю неделю. Проверь, есть ли там место для тебя.', action: null };
  }

  if (inWeek.length > 0) {
    return { text: 'План выглядит живым: есть дела, есть паузы, есть ты.', action: null };
  }

  return { text: 'Неделя почти пустая. Самое время добавить пару важных дел.', action: null };
}

// ───── antichaos copy (variant A's gentle tone) ─────
function antichaosHint(count) {
  if (count === 0)  return 'Антихаос пуст. Редкий и прекрасный момент.';
  if (count <= 2)   return 'Здесь спокойно. Мысли под контролем.';
  if (count <= 4)   return 'Здесь спокойно. Мысли под контролем — но несколько задач давно ждут, чтобы им нашли день.';
  return 'Похоже, тут маленький склад мыслей. Выберем одной задаче день?';
}

// ───── badges ─────
const CLAY_BADGES = [
  { id: 'breathing', label: 'Неделя дышит',     glyph: '🌿', test: (p) => p.overloaded === 0 && p.total > 0 },
  { id: 'rest',      label: 'Отдых не потерян', glyph: '☕', test: (p) => p.hasRest },
  { id: 'anti',      label: 'Антихаос приручён', glyph: '🌀', test: (p, antiCount) => antiCount < 3 },
  { id: 'noheroism', label: 'План без героизма', glyph: '🎯', test: (p) => p.overloaded === 0 && p.hasRest && p.total > 0 }
];

function setClayTheme(mode) {
  CLAY = (mode === 'dark') ? CLAY_DARK : CLAY_LIGHT;
  if (typeof window !== 'undefined') window.CLAY = CLAY;
}

export {
  CLAY_LIGHT, CLAY_DARK, CLAY, setClayTheme,
  CLAY_CATEGORIES, CLAY_ENERGIES, CLAY_DURATIONS, DURATION_H, ENERGY_MULT, CATEGORY_MULT, CLAY_BADGES,
  getLoadStyle, getCategoryColor,
  CLAY_INITIAL_TASKS, getDemoTasks,
  RU_MONTHS, RU_WEEKDAYS_LONG, RU_WEEKDAYS_SHORT,
  fmtDate, parseDate, weekStartFor, weekDates, weekdayShort, weekdayLong, dateLabel, weekRangeLabel,
  getTodayISO, getCurrentWeekStart, getCurrentWeekEnd, getCurrentWeekRange, getCurrentWeekDates,
  getWeekId, getCurrentWeekId,
  isInCurrentWeek, isAntichaosTask, isFutureTask, isPastTask, isVisibleInAntichaos, isStatsTask,
  taskScore, dayLoad, loadKey, blob, categoryOf, newTaskId, calcBalance, calcProgress, calcAdvice, antichaosHint
};

if (typeof window !== 'undefined') {
  window.CLAY = CLAY;
  Object.assign(window, {
    CLAY_LIGHT, CLAY_DARK, setClayTheme,
    CLAY_CATEGORIES, CLAY_ENERGIES, CLAY_DURATIONS, DURATION_H, ENERGY_MULT, CATEGORY_MULT, CLAY_BADGES,
    getLoadStyle, getCategoryColor,
    CLAY_INITIAL_TASKS, getDemoTasks,
    RU_MONTHS, RU_WEEKDAYS_LONG, RU_WEEKDAYS_SHORT,
    fmtDate, parseDate, weekStartFor, weekDates, weekdayShort, weekdayLong, dateLabel, weekRangeLabel,
    getTodayISO, getCurrentWeekStart, getCurrentWeekEnd, getCurrentWeekRange, getCurrentWeekDates,
    getWeekId, getCurrentWeekId,
    isInCurrentWeek, isAntichaosTask, isFutureTask, isPastTask, isVisibleInAntichaos, isStatsTask,
    taskScore, dayLoad, loadKey, blob, categoryOf, newTaskId, calcBalance, calcProgress, calcAdvice, antichaosHint
  });
}
