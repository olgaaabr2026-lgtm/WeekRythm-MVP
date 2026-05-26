// Variant C: Глиняная мастерская — full interactive prototype
// Tactile wellness planner: clay bowls, hand-formed shapes, real CRUD,
// drag-drop between days, smart advice with inline actions, particles,
// keyboard shortcuts, gentle save indicator.

import React, { useState, useEffect, useReducer, useRef, useMemo, useCallback } from 'react';
import { useViewport } from './use-viewport.js';
import {
  CLAY, CLAY_BADGES, CLAY_CATEGORIES, CLAY_DURATIONS, CLAY_ENERGIES,
  antichaosHint, blob, calcAdvice, calcBalance, calcProgress, categoryOf,
  dateLabel, dayLoad, fmtDate, getCurrentWeekEnd, getCurrentWeekId, getLoadStyle,
  getCurrentWeekRange, getCurrentWeekStart, getCurrentWeekDates, getDemoTasks,
  getTodayISO, isAntichaosTask, isFutureTask, isPastTask, loadKey, newTaskId,
  parseDate, setClayTheme, weekRangeLabel, weekdayLong, weekdayShort, isStatsTask
} from './clay-helpers.js';
import {
  ChoiceCard, ClayButton, ClayLabel, ClayModal, CloseDayModal, MoveModal,
  SavedIndicator, TaskFormModal, ToastStack, WeekTransitionModal
} from './clay-modals.jsx';
import {
  exportJSON, getOrCreateUid, getShareUrl,
  importJSON, loadFromCloud, scheduleSave
} from './sync.js';

// ───────────────────────── reducer ─────────────────────────
const initialState = {
  tasks: [],
  closedDays: {},
  ui: {
    formOpen: false,
    formInitial: null,
    editingTaskId: null,
    movingTaskId: null,
    closingDay: null,
    toast: null,
    savedAt: 0,
    dragOverDate: null,
    confettiTrigger: null,
    weekTransitionOpen: false,
    lastSeenWeekId: null,
    userClearedAll: false
  }
};

function reducer(state, action) {
  const touch = (s) => ({ ...s, ui: { ...s.ui, savedAt: Date.now() } });
  switch (action.type) {
    case 'TOGGLE_TASK': {
      const newTasks = state.tasks.map(t => t.id === action.id ? { ...t, completed: !t.completed } : t);
      const target = newTasks.find(t => t.id === action.id);
      return touch({
        ...state,
        tasks: newTasks,
        ui: { ...state.ui, confettiTrigger: target?.completed ? { id: action.id, ts: Date.now() } : state.ui.confettiTrigger }
      });
    }
    case 'ADD_TASK':
      return touch({
        ...state,
        tasks: [...state.tasks, action.task],
        ui: { ...state.ui, userClearedAll: false }
      });
    case 'UPDATE_TASK':
      return touch({
        ...state,
        tasks: state.tasks.map(t => t.id === action.task.id ? action.task : t)
      });
    case 'MOVE_TASK': {
      // Moving to a closed day reopens it
      const newClosed = { ...state.closedDays };
      if (action.date && newClosed[action.date]) delete newClosed[action.date];
      return touch({
        ...state,
        tasks: state.tasks.map(t => t.id === action.id ? { ...t, date: action.date } : t),
        closedDays: newClosed
      });
    }
    case 'MOVE_TASK_WITH_UNDO': {
      const task = state.tasks.find(t => t.id === action.taskId);
      if (!task) return state;
      const newClosed = { ...state.closedDays };
      if (action.toDate && newClosed[action.toDate]) delete newClosed[action.toDate];
      return touch({
        ...state,
        tasks: state.tasks.map(t => t.id === action.taskId ? { ...t, date: action.toDate } : t),
        closedDays: newClosed,
        ui: {
          ...state.ui,
          toast: {
            label: action.toDate === null
              ? 'Перенесено в Антихаос'
              : `Перенесено в ${action.toDateLabel || 'выбранный день'}`,
            undoable: true,
            snapshot: { taskId: task.id, oldDate: task.date }
          }
        }
      });
    }
    case 'DELETE_TASK': {
      const deleted = state.tasks.find(t => t.id === action.id);
      if (!deleted) return state;
      const title = deleted.title || '';
      const shortTitle = `${title.slice(0, 32)}${title.length > 32 ? '…' : ''}`;
      return touch({
        ...state,
        tasks: state.tasks.filter(t => t.id !== action.id),
        ui: {
          ...state.ui,
          toast: {
            label: `Удалено: «${shortTitle}»`,
            undoable: true,
            snapshot: { task: deleted }
          }
        }
      });
    }
    case 'CLOSE_DAY':
      return touch({ ...state, closedDays: { ...state.closedDays, [action.date]: true } });
    case 'OPEN_DAY': {
      const cd = { ...state.closedDays }; delete cd[action.date];
      return touch({ ...state, closedDays: cd });
    }
    case 'TRANSFER_AND_CLOSE': {
      // move all incomplete from action.from to action.to, then close
      const newTasks = state.tasks.map(t =>
        (t.date === action.from && !t.completed)
          ? { ...t, date: action.to }
          : t
      );
      const newClosed = { ...state.closedDays, [action.from]: true };
      if (action.to && newClosed[action.to]) delete newClosed[action.to];
      return touch({ ...state, tasks: newTasks, closedDays: newClosed });
    }
    case 'CLEAR_WEEK': {
      return touch({
        ...state,
        tasks: state.tasks.filter(t => !isStatsTask(t)),
        closedDays: {}
      });
    }
    case 'RESET_TO_DEMO':
      return touch({ ...initialState, tasks: getDemoTasks() });
    case 'RESET_TO_EMPTY':
      return touch({
        ...initialState,
        tasks: [],
        ui: { ...initialState.ui, userClearedAll: true }
      });
    case 'OPEN_WEEK_TRANSITION':
      return { ...state, ui: { ...state.ui, weekTransitionOpen: true } };
    case 'CLOSE_WEEK_TRANSITION':
      return touch({
        ...state,
        ui: { ...state.ui, weekTransitionOpen: false, lastSeenWeekId: getCurrentWeekId() }
      });
    case 'BULK_MOVE_TASKS': {
      const ids = new Set(action.taskIds);
      return touch({
        ...state,
        tasks: state.tasks.map(t => ids.has(t.id) ? { ...t, date: action.targetDate } : t)
      });
    }
    case 'BULK_MOVE_WITH_UNDO': {
      const snapshots = action.taskIds.map(id => {
        const t = state.tasks.find(x => x.id === id);
        return t ? { id: t.id, oldDate: t.date } : null;
      }).filter(Boolean);
      const ids = new Set(action.taskIds);
      const newClosed = { ...state.closedDays };
      if (action.targetDate && newClosed[action.targetDate]) delete newClosed[action.targetDate];
      if (action.closeDate) newClosed[action.closeDate] = true;
      return touch({
        ...state,
        tasks: state.tasks.map(t => ids.has(t.id) ? { ...t, date: action.targetDate } : t),
        closedDays: newClosed,
        ui: {
          ...state.ui,
          toast: {
            label: action.targetDate === null
              ? `${snapshots.length} задач отправлены в Антихаос`
              : `${snapshots.length} задач перенесены`,
            undoable: true,
            snapshot: {
              snapshots,
              closeDate: action.closeDate || null
            }
          }
        }
      });
    }
    case 'UNDO_TOAST': {
      const snapshot = state.ui.toast?.snapshot;
      if (!snapshot) return state;
      if (snapshot.task) {
        return touch({
          ...state,
          tasks: [...state.tasks, snapshot.task],
          ui: { ...state.ui, toast: null }
        });
      }
      if (snapshot.taskId && snapshot.oldDate !== undefined) {
        return touch({
          ...state,
          tasks: state.tasks.map(t =>
            t.id === snapshot.taskId ? { ...t, date: snapshot.oldDate } : t
          ),
          ui: { ...state.ui, toast: null }
        });
      }
      if (snapshot.snapshots) {
        const restoreMap = new Map(snapshot.snapshots.map(s => [s.id, s.oldDate]));
        const newClosed = { ...state.closedDays };
        if (snapshot.closeDate) delete newClosed[snapshot.closeDate];
        return touch({
          ...state,
          tasks: state.tasks.map(t => restoreMap.has(t.id) ? { ...t, date: restoreMap.get(t.id) } : t),
          closedDays: newClosed,
          ui: { ...state.ui, toast: null }
        });
      }
      return state;
    }
    case 'LOAD_STATE': {
      const p = action.payload;
      return touch({
        ...initialState,
        tasks: Array.isArray(p.tasks) ? p.tasks : [],
        closedDays: p.closedDays || {},
        ui: {
          ...initialState.ui,
          lastSeenWeekId: p.lastSeenWeekId || null,
          userClearedAll: p.userClearedAll === true
        }
      });
    }
    case 'CLEAR_TOAST':
      return { ...state, ui: { ...state.ui, toast: null } };
    case 'BULK_DELETE_TASKS': {
      const ids = new Set(action.taskIds);
      return touch({
        ...state,
        tasks: state.tasks.filter(t => !ids.has(t.id))
      });
    }
    case 'UI':
      return { ...state, ui: { ...state.ui, ...action.ui } };
    default:
      return state;
  }
}

// ───────────────────────── chrome bits ─────────────────────────
function ClayGrain() {
  return (
    <svg className="clay-grain" style={{
      position: 'absolute', inset: 0, width: '100%', height: '100%',
      pointerEvents: 'none', mixBlendMode: 'multiply', opacity: 0.55
    }} aria-hidden="true">
      <defs>
        <filter id="clay-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" seed="11"/>
          <feColorMatrix values="0 0 0 0 0.32  0 0 0 0 0.2  0 0 0 0 0.13  0 0 0 0.22 0"/>
        </filter>
      </defs>
      <rect width="100%" height="100%" filter="url(#clay-grain)"/>
    </svg>
  );
}

function CWash({ color, x, y, size = 320, opacity = 0.5, drift = 0 }) {
  return (
    <div className="clay-wash" style={{
      position: 'absolute', left: x, top: y, width: size, height: size,
      borderRadius: '50%',
      background: `radial-gradient(circle at 40% 40%, ${color} 0%, ${color}b0 30%, transparent 70%)`,
      filter: 'blur(36px)', opacity, pointerEvents: 'none',
      animation: `garden-drift ${20 + drift}s ease-in-out infinite alternate`
    }}/>
  );
}

// Confetti particles when completing a task
function ConfettiBurst({ x, y, palette = [CLAY.coral, CLAY.peach, CLAY.sage, CLAY.amber] }) {
  const particles = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 40 + Math.random() * 40;
      return {
        id: i,
        px: Math.cos(angle) * dist,
        py: Math.sin(angle) * dist - 20,
        color: palette[i % palette.length],
        size: 5 + Math.random() * 4,
        delay: Math.random() * 0.1
      };
    });
  }, []);
  return (
    <div style={{
      position: 'fixed', left: x, top: y, pointerEvents: 'none', zIndex: 50
    }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute',
          width: p.size, height: p.size,
          borderRadius: '50%',
          background: p.color,
          boxShadow: `0 2px 4px ${p.color}66`,
          '--px': `${p.px}px`,
          '--py': `${p.py}px`,
          animation: `clay-particle 0.9s ${p.delay}s cubic-bezier(0.22,1,0.36,1) forwards`
        }}/>
      ))}
    </div>
  );
}

// ───────────────────────── header ─────────────────────────
function CHeader({ savedAt, onClear, onNew, theme, onToggleTheme, onShare, vp }) {
  const showSaved = Date.now() - savedAt < 1800;
  const isDark = theme === 'dark';
  const isMobile = vp?.isMobile;
  return (
    <header style={{
      position: 'relative',
      padding: isMobile ? '22px 16px 18px' : '36px 48px 28px',
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'stretch' : 'center',
      justifyContent: 'space-between',
      gap: isMobile ? 16 : 24
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 14 : 22, flexShrink: 0 }}>
        <div style={{
          width: isMobile ? 48 : 64, height: isMobile ? 48 : 64,
          background: `radial-gradient(circle at 35% 30%, ${CLAY.peachSoft} 0%, ${CLAY.coral} 75%)`,
          borderRadius: blob(1),
          boxShadow: `inset -4px -6px 12px rgba(90,30,15,0.25), inset 3px 4px 8px rgba(255,230,200,0.5), 0 6px 20px rgba(196,74,50,0.3)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Fraunces, Georgia, serif',
          fontStyle: 'italic', fontWeight: 600, fontSize: isMobile ? 24 : 32, color: '#fff',
          animation: 'clay-mood-breathe 6s ease-in-out infinite',
          flexShrink: 0
        }}>р</div>
        <div>
          <div style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontWeight: 500, fontSize: isMobile ? 24 : 38,
            color: CLAY.ink, lineHeight: 1,
            letterSpacing: '-0.025em', whiteSpace: 'nowrap'
          }}>Ритм Недели</div>
          <div style={{
            marginTop: 8, display: 'flex', alignItems: 'center', gap: 12,
            fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic',
            fontSize: isMobile ? 13 : 15, color: CLAY.inkSoft, fontWeight: 400,
            flexWrap: 'wrap'
          }}>
            <span>{weekdayLong(parseDate(getTodayISO())).toLowerCase()} · {weekRangeLabel(getCurrentWeekStart(), getCurrentWeekEnd())}</span>
            {showSaved && <SavedIndicator pulseKey={savedAt}/>}
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: isMobile ? 'space-between' : 'flex-end',
        gap: 8,
        width: isMobile ? '100%' : 'auto',
        flexWrap: 'wrap'
      }}>
        {/* theme toggle */}
        <button onClick={onToggleTheme} title={isDark ? 'Светлый режим' : 'Тёплый уголь (тёмный)'} style={{
          width: 40, height: 40,
          background: CLAY.paper, border: `1.5px solid ${CLAY.borderStrong}`,
          color: CLAY.ink, borderRadius: '50%', cursor: 'pointer',
          fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 0 rgba(90,50,30,0.15)',
          transition: 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)',
          transform: isDark ? 'rotate(180deg)' : 'rotate(0deg)',
          display: 'flex'
        }}>
          {isDark ? '☀' : '☾'}
        </button>
        {/* share / export */}
        <button onClick={onShare} title="Поделиться · ⌘E" style={{
          width: 40, height: 40,
          background: CLAY.paper, border: `1.5px solid ${CLAY.borderStrong}`,
          color: CLAY.ink, borderRadius: '50%', cursor: 'pointer',
          fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 0 rgba(90,50,30,0.15)'
        }}>↗</button>
        <button onClick={onClear} style={{
          fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
          background: CLAY.paper, border: `1.5px solid ${CLAY.borderStrong}`,
          color: CLAY.ink, padding: isMobile ? '10px 14px' : '11px 20px',
          borderRadius: blob(2), cursor: 'pointer',
          boxShadow: '0 2px 0 rgba(90,50,30,0.15)'
        }}>Очистить</button>
        <button onClick={onNew} style={{
          fontFamily: 'inherit', fontSize: isMobile ? 13 : 14, fontWeight: 600,
          background: CLAY.coral, color: '#fff',
          border: 'none', padding: isMobile ? '11px 16px' : '11px 24px',
          borderRadius: blob(3), cursor: 'pointer',
          boxShadow: `0 4px 0 ${CLAY.coralDeep}, 0 8px 20px rgba(196,74,50,0.3)`,
          display: 'flex', alignItems: 'center', gap: 8
        }}
        onMouseDown={e => (e.currentTarget.style.transform = 'translateY(2px)', e.currentTarget.style.boxShadow = `0 2px 0 ${CLAY.coralDeep}`)}
        onMouseUp={e => (e.currentTarget.style.transform = '', e.currentTarget.style.boxShadow = `0 4px 0 ${CLAY.coralDeep}, 0 8px 20px rgba(196,74,50,0.3)`)}
        onMouseLeave={e => (e.currentTarget.style.transform = '', e.currentTarget.style.boxShadow = `0 4px 0 ${CLAY.coralDeep}, 0 8px 20px rgba(196,74,50,0.3)`)}
        >
          + Новая задача
          {!isMobile && <span style={{
            fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
            background: 'rgba(255,255,255,0.25)', padding: '2px 6px',
            borderRadius: 6, letterSpacing: '0.06em', opacity: 0.9
          }}>⌘N</span>}
        </button>
      </div>
    </header>
  );
}

// ───────────────────────── advice (with inline action) ─────────────────────────
function CAdvice({ advice, onAction }) {
  return (
    <div className="clay-section" style={{
      position: 'relative',
      margin: '8px 48px 0',
      padding: '24px 32px',
      background: `linear-gradient(135deg, ${CLAY.peachSoft} 0%, ${CLAY.cream} 100%)`,
      borderRadius: blob(4),
      boxShadow: `inset 0 -3px 8px rgba(154,58,38,0.1), 0 8px 24px rgba(154,58,38,0.08)`,
      display: 'flex', gap: 22, alignItems: 'center',
      overflow: 'hidden'
    }}>
      <CWash color="#fff" x={-40} y={-40} size={200} opacity={0.3}/>
      <div style={{
        flexShrink: 0,
        width: 52, height: 52,
        background: CLAY.paper,
        borderRadius: blob(5),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic',
        fontSize: 26, fontWeight: 600, color: CLAY.coralDeep,
        boxShadow: 'inset -2px -2px 6px rgba(90,50,30,0.1), 2px 4px 12px rgba(0,0,0,0.06)'
      }}>‹</div>
      <div style={{ flex: 1, position: 'relative' }}>
        <div style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10, letterSpacing: '0.22em',
          color: CLAY.coralDeep, textTransform: 'uppercase',
          fontWeight: 600, marginBottom: 6
        }}>Подсказка дня</div>
        <div style={{
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 20, fontWeight: 400,
          lineHeight: 1.4, color: CLAY.ink,
          letterSpacing: '-0.005em', textWrap: 'pretty'
        }}>{advice.text}</div>
        {advice.action && advice.action.kind === 'move' && (
          <button onClick={() => onAction(advice.action)} style={{
            marginTop: 12,
            fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
            background: CLAY.coralDeep, color: '#fff',
            border: 'none', padding: '8px 16px',
            borderRadius: 999, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
            boxShadow: `0 3px 0 #6e2a1c`
          }}>
            <span style={{ fontStyle: 'italic', fontFamily: 'Fraunces, Georgia, serif', fontSize: 14 }}>
              «{advice.action.taskTitle.slice(0, 30)}{advice.action.taskTitle.length > 30 ? '…' : ''}»
            </span>
            → {advice.action.toLabel.toLowerCase()}
          </button>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── rhythm meter ─────────────────────────
//
// Пак позиционируется через position:absolute поверх SVG.
// Процентные координаты вычислены из геометрии дуги:
//   viewBox 240×135, центр дуги (c=120, y=120), r=100.
//   Геометрический центр чаши: x=120 → left 50%,
//   y = 120 - 4r/(3π) ≈ 78 → top = 78/135 ≈ 57.8% ≈ 58%.
// Такой подход работает на любой ширине без foreignObject.
//
function CRhythm({ value, status }) {
  const r = 100, c = 120, sw = 22;
  const mood = value > 80 ? '◡' : value > 64 ? '◡' : value > 39 ? '−' : '◠';
  const moodColor = value > 64 ? CLAY.sage : value > 39 ? CLAY.amber : CLAY.coral;

  const arcPath = (from, to) => {
    const a0 = Math.PI + (from / 100) * Math.PI;
    const a1 = Math.PI + (to / 100) * Math.PI;
    return `M ${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)}`;
  };

  return (
    <div style={{
      position: 'relative',
      background: CLAY.paper,
      borderRadius: blob(6),
      padding: '28px 32px 26px',
      boxShadow: `inset 0 -4px 10px rgba(90,50,30,0.08), 0 10px 28px rgba(60,30,15,0.08)`,
      overflow: 'hidden'
    }}>
      <CWash color={CLAY.peachSoft} x={-60} y={-40} size={240} opacity={0.5}/>
      <CWash color={CLAY.sageSoft} x={300} y={200} size={220} opacity={0.4} drift={3}/>

      <div style={{ position: 'relative' }}>
        <div style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: CLAY.muted, fontWeight: 600, marginBottom: 4
        }}>Ритм-индекс</div>
        <div style={{
          fontFamily: 'Fraunces, Georgia, serif', fontSize: 26,
          fontWeight: 500, color: CLAY.ink, letterSpacing: '-0.015em',
          marginBottom: 18
        }}>Настроение недели</div>
      </div>

      {/*
        Обёртка position:relative — якорь для абсолютного пака.
        SVG: viewBox 240×135 (обрезан снизу; дуга + метки умещаются до y≈131).
        overflow:visible сохраняет видимость меток у краёв.
      */}
      <div style={{ position: 'relative', width: '100%' }}>
        <svg
          viewBox="0 0 240 135"
          style={{ display: 'block', width: '100%', overflow: 'visible' }}
          aria-hidden="true"
        >
          {/* трек (серый) */}
          <path
            d={arcPath(0, 100)}
            fill="none"
            stroke={CLAY.clay}
            strokeWidth={sw}
            strokeLinecap="round"
          />
          {/* прогресс (цветной) */}
          <path
            d={arcPath(0, value || 1)}
            fill="none"
            stroke={moodColor}
            strokeWidth={sw}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 2px 4px ${moodColor}66)`,
              strokeDasharray: 1000,
              strokeDashoffset: 1000,
              animation: 'morning-arc-trace 1.8s 0.3s ease-out forwards',
            }}
          />
          {/* метки шкалы */}
          {[0, 33, 66, 100].map((tv, i) => {
            const a  = Math.PI + (tv / 100) * Math.PI;
            const tx = c + (r + sw / 2 + 14) * Math.cos(a);
            const ty = c + (r + sw / 2 + 14) * Math.sin(a) + 3;
            return (
              <text
                key={tv}
                x={tx} y={ty}
                textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}
                style={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 9, fill: CLAY.muted, letterSpacing: '0.1em'
                }}
              >
                {['0','33','66','100'][i]}
              </text>
            );
          })}
        </svg>

        {/*
          Пак — наложен поверх SVG, не внутри него.
          left: 50%  → x = 120/240 = 50% viewBox
          top:  58%  → y ≈ 78/135 = 57.8% viewBox (центроид чаши)
          width: 31% → ≈ 75px при типичной ширине карточки
          aspect-ratio 1:1 сохраняет круглость на любой ширине
        */}
        <div style={{
          position: 'absolute',
          top: '58%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '31%',
          aspectRatio: '1 / 1',
          background: `radial-gradient(circle at 35% 30%, ${CLAY.cream} 0%, ${moodColor}88 80%)`,
          borderRadius: blob(7),
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `inset -4px -6px 12px ${moodColor}55, inset 2px 3px 6px rgba(255,250,240,0.5), 0 4px 12px rgba(0,0,0,0.1)`,
          animation: 'clay-mood-breathe 5s ease-in-out infinite',
          pointerEvents: 'none',
          userSelect: 'none',
          boxSizing: 'border-box',
          zIndex: 1,
        }}>
          <div style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 'clamp(16px, 2.8vw, 38px)',
            fontWeight: 300,
            color: CLAY.ink,
            lineHeight: 1,
          }}>{value}</div>
          <div style={{
            fontSize: 'clamp(11px, 1.5vw, 18px)',
            color: moodColor,
            marginTop: 2,
            fontWeight: 700,
          }}>{mood}</div>
        </div>
      </div>

      <div style={{
        position: 'relative', textAlign: 'center', marginTop: 8,
        fontFamily: 'Fraunces, Georgia, serif',
        fontSize: 19, fontStyle: 'italic', fontWeight: 500,
        color: CLAY.ink
      }}>«{status}»</div>

      <div style={{
        position: 'relative', display: 'flex',
        justifyContent: 'space-around', marginTop: 14,
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 9, letterSpacing: '0.16em',
        color: CLAY.muted, textTransform: 'uppercase'
      }}>
        <span>пауза</span><span>ритм</span><span>живо</span><span>дышит</span>
      </div>
    </div>
  );
}

// ───────────────────────── balance bowls ─────────────────────────
function CBalance({ data, advice }) {
  return (
    <div style={{
      position: 'relative',
      background: CLAY.paper,
      borderRadius: blob(8),
      padding: '28px 32px 26px',
      boxShadow: `inset 0 -4px 10px rgba(90,50,30,0.08), 0 10px 28px rgba(60,30,15,0.08)`,
      overflow: 'hidden'
    }}>
      <CWash color={CLAY.sageSoft} x={250} y={-50} size={240} opacity={0.45}/>

      <div style={{ position: 'relative' }}>
        <div style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: CLAY.muted, fontWeight: 600, marginBottom: 4
        }}>Баланс жизни</div>
        <div style={{
          fontFamily: 'Fraunces, Georgia, serif', fontSize: 26,
          fontWeight: 500, color: CLAY.ink, letterSpacing: '-0.015em',
          marginBottom: 22
        }}>Чаши недели</div>
      </div>

      <div style={{
        position: 'relative',
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10,
        alignItems: 'end', marginBottom: 16
      }}>
        {data.map((sphere, i) => (
          <Bowl key={sphere.id} sphere={sphere} delay={i * 0.12} seed={i + 4}/>
        ))}
      </div>

      <div style={{
        position: 'relative',
        padding: '12px 16px',
        background: CLAY.coralSoft + '40',
        borderRadius: blob(9),
        fontFamily: 'Fraunces, Georgia, serif',
        fontStyle: 'italic', fontSize: 14,
        color: CLAY.ink, lineHeight: 1.5
      }}>{advice}</div>
    </div>
  );
}

function Bowl({ sphere, delay, seed }) {
  const c = sphere.color;
  const fillPct = Math.min(92, sphere.percent * 2.2);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{
        position: 'relative',
        width: '100%', maxWidth: 78, aspectRatio: '1.1 / 1',
        borderRadius: `${30 + (seed * 3) % 12}% ${28 + (seed * 5) % 14}% 48% 48% / 24% 24% 50% 50%`,
        background: CLAY.clay,
        boxShadow: `inset 0 -6px 10px rgba(90,50,30,0.18), inset 0 4px 6px rgba(255,255,255,0.4), 0 4px 8px rgba(60,30,15,0.1)`,
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          height: `${fillPct}%`,
          background: `linear-gradient(180deg, ${c}dd 0%, ${c} 100%)`,
          borderRadius: '0 0 48% 48% / 0 0 50% 50%',
          animation: `garden-vessel-fill 1.5s ${delay}s cubic-bezier(0.34,1.2,0.64,1) backwards`,
          transformOrigin: 'bottom',
          transition: 'height 0.5s cubic-bezier(0.34,1.2,0.64,1)'
        }}>
          <svg viewBox="0 0 100 8" preserveAspectRatio="none" style={{
            position: 'absolute', top: -3, left: 0, width: '100%', height: 6,
            animation: `garden-wave 5s ${delay}s ease-in-out infinite`
          }}>
            <path d="M 0 5 Q 30 0, 50 4 T 100 3 L 100 8 L 0 8 Z" fill={c}/>
          </svg>
        </div>
        <div style={{
          position: 'absolute', top: '15%', left: '12%',
          width: '20%', height: '12%',
          background: 'rgba(255,255,255,0.5)',
          borderRadius: '50%', filter: 'blur(2px)'
        }}/>
      </div>
      <div style={{
        fontFamily: 'Fraunces, Georgia, serif', fontSize: 13,
        fontWeight: 500, color: CLAY.ink, textAlign: 'center', lineHeight: 1.1
      }}>{sphere.label}</div>
      <div style={{
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11, color: c, fontWeight: 700, letterSpacing: '0.04em'
      }}>{sphere.percent}%</div>
    </div>
  );
}

// ───────────────────────── week board ─────────────────────────
function CWeekBoard({ tasks, closedDays, progress, onToggle, onEdit, onMove, onDelete, onCloseDay, onOpenDay, onDrop, dragOverDate, setDragOver, vp, onNew }) {
  const weekDs = getCurrentWeekDates();
  return (
    <div className="clay-section" style={{ position: 'relative', margin: vp.isMobile ? '0 16px' : '0 48px' }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 18, gap: 24,
        flexDirection: vp.isMobile ? 'column' : 'row'
      }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase',
            color: CLAY.muted, fontWeight: 600, marginBottom: 6
          }}>Неделя</div>
          <div style={{
            fontFamily: 'Fraunces, Georgia, serif', fontSize: vp.isMobile ? 26 : 34,
            fontWeight: 500, color: CLAY.ink, letterSpacing: '-0.025em',
            whiteSpace: vp.isMobile ? 'normal' : 'nowrap'
          }}>Семь камней недели</div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          width: vp.isMobile ? '100%' : 'auto'
        }}>
          {!vp.isMobile && (
            <span style={{
              fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic',
              fontSize: 14, color: CLAY.inkSoft
            }}>Перетащи задачу, чтобы перенести</span>
          )}
          <span style={{
            padding: '4px 10px', background: CLAY.paperSoft, borderRadius: 999,
            fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
            letterSpacing: '0.1em', color: CLAY.muted, fontWeight: 600,
            border: `1px solid ${CLAY.border}`
          }}>{progress.completed} / {progress.total}</span>
          {onNew && (
            <button
              onClick={onNew}
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                padding: vp.isMobile ? '10px 0' : '7px 16px',
                borderRadius: 999,
                background: CLAY.coral, color: '#fff',
                border: 'none', cursor: 'pointer', fontWeight: 700,
                width: vp.isMobile ? '100%' : 'auto',
                transition: 'opacity 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >+ Новая задача</button>
          )}
        </div>
      </div>

      <div className={vp.isMobile ? 'clay-week-scroll' : ''} style={{
        display: vp.isMobile ? 'flex' : 'grid',
        gridTemplateColumns: vp.isDesktop ? 'repeat(7, 1fr)' : (vp.isTablet ? 'repeat(4, 1fr)' : undefined),
        gap: 10,
        gridAutoRows: vp.isTablet ? 'min-content' : undefined,
        ...(vp.isMobile && { paddingBottom: 8 })
      }}>
        {weekDs.map((d, i) => {
          const ds = fmtDate(d);
          return (
            <div key={ds} style={vp.isMobile ? { minWidth: 280, flexShrink: 0 } : {}}>
              <CDayCard
                date={d}
                dateStr={ds}
                index={i}
                tasks={tasks.filter(t => t.date === ds)}
                isClosed={!!closedDays[ds]}
                isToday={ds === getTodayISO()}
                onToggle={onToggle}
                onEdit={onEdit}
                onMove={onMove}
                onDelete={onDelete}
                onCloseDay={onCloseDay}
                onOpenDay={onOpenDay}
                onDrop={onDrop}
                dragOverDate={dragOverDate}
                setDragOver={setDragOver}
                allTasks={tasks}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CDayCard({ date, dateStr, index, tasks, isClosed, isToday, onToggle, onEdit, onMove, onDelete, onCloseDay, onOpenDay, onDrop, dragOverDate, setDragOver, allTasks }) {
  const score = dayLoad(allTasks, dateStr);
  const lk = loadKey(score);
  const load = getLoadStyle(lk) || getLoadStyle('empty');
  const isOverload = lk === 'overload';
  // Форматирование балла: целые без точки, дробные — 1 знак
  const scoreDisplay = (s) => {
    const r = Math.round(s * 10) / 10;
    return r === Math.floor(r) ? String(Math.floor(r)) : r.toFixed(1);
  };
  const isDragOver = dragOverDate === dateStr;
  // sort tasks: incomplete + important first, then by energy desc, then completed
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.important !== b.important) return a.important ? -1 : 1;
    return (b.energy || 0) - (a.energy || 0);
  });

  return (
    <div
      data-today={isToday ? 'true' : undefined}
      onDragOver={e => { e.preventDefault(); setDragOver(dateStr); }}
      onDragLeave={e => { if (e.currentTarget.contains(e.relatedTarget)) return; setDragOver(null); }}
      onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) onDrop(id, dateStr); setDragOver(null); }}
      style={{
        position: 'relative',
        background: isClosed ? CLAY.paperSoft : CLAY.paper,
        borderRadius: blob(10 + index),
        minHeight: 380,
        overflow: 'hidden',
        opacity: isClosed ? 0.78 : 1,
        boxShadow: isToday
          ? `inset 0 0 0 3px ${CLAY.coral}, inset 0 -4px 10px rgba(90,50,30,0.08), 0 10px 28px rgba(196,74,50,0.25)`
          : `inset 0 -4px 10px rgba(90,50,30,0.08), 0 6px 18px rgba(60,30,15,0.08)`,
        display: 'flex', flexDirection: 'column',
        animation: isDragOver
          ? 'clay-drag-over 0.9s ease-in-out infinite'
          : `clay-rise 0.8s ${index * 0.07}s cubic-bezier(0.34,1.2,0.64,1) backwards`,
        transition: 'box-shadow 0.3s, transform 0.2s',
        transform: isDragOver ? 'scale(1.02)' : 'scale(1)'
      }}>
      {/* load pebble cap */}
      <div style={{
        position: 'relative',
        padding: '14px 14px 12px',
        background: load.bg,
        boxShadow: `inset 0 -2px 6px rgba(90,50,30,0.1)`
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 17, fontWeight: 600,
            color: load.ink, letterSpacing: '-0.01em'
          }}>{weekdayShort(date)}</div>
          <div style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 11, color: load.ink, opacity: 0.7, fontWeight: 500
          }}>{date.getDate()}</div>
        </div>
        <div style={{
          marginTop: 8, display: 'flex', alignItems: 'center', gap: 6
        }}>
          <span style={{
            fontSize: 14, color: load.ink, opacity: 0.9,
            animation: isOverload ? 'garden-pulse 1.6s ease-in-out infinite' : 'none'
          }}>{load.glyph}</span>
          <span style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: load.ink, fontWeight: 600
          }}>{load.label} · {scoreDisplay(score)}ч</span>
        </div>
        {isToday && (
          <div style={{
            position: 'absolute', top: 12, right: 12,
            padding: '3px 9px', background: CLAY.coral, color: '#fff',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase',
            fontWeight: 700, borderRadius: 999
          }}>сегодня</div>
        )}
        {isClosed && (
          <div style={{
            position: 'absolute', top: 12, right: 12,
            padding: '3px 9px', background: CLAY.sageSoft, color: '#476039',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase',
            fontWeight: 700, borderRadius: 999
          }}>закрыт ✦</div>
        )}
      </div>

      <div style={{
        padding: '10px 10px 12px', flex: 1,
        display: 'flex', flexDirection: 'column', gap: 7,
        minHeight: 60
      }}>
        {sortedTasks.length === 0 && (
          <div style={{
            fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic',
            fontSize: 13, color: CLAY.muted, padding: 14, textAlign: 'center'
          }}>{isDragOver ? '↓ оставь здесь' : 'пусто и хорошо'}</div>
        )}
        {sortedTasks.map(t => (
          <CTaskRow key={t.id} t={t}
            onToggle={onToggle} onEdit={onEdit} onMove={onMove} onDelete={onDelete}/>
        ))}
      </div>

      <div style={{
        padding: '10px 14px',
        borderTop: `1px dashed ${CLAY.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10, letterSpacing: '0.14em',
          color: CLAY.muted, fontWeight: 600
        }}>
          {tasks.filter(t => t.completed).length}/{tasks.length}
        </span>
        {isClosed ? (
          <button onClick={() => onOpenDay(dateStr)} style={{
            fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic',
            fontSize: 12, color: CLAY.inkSoft,
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontWeight: 500
          }}>↺ открыть</button>
        ) : (
          <button onClick={() => onCloseDay(dateStr)} style={{
            fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic',
            fontSize: 12, color: CLAY.coralDeep,
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontWeight: 500
          }}>закрыть ✦</button>
        )}
      </div>
    </div>
  );
}

function CTaskRow({ t, onToggle, onEdit, onMove, onDelete }) {
  const cat = categoryOf(t.category);
  const c = cat.color;
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      draggable={!t.completed}
      onDragStart={e => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; setDragging(true); }}
      onDragEnd={() => setDragging(false)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        padding: '9px 8px 9px 30px',
        background: t.completed ? 'transparent' : CLAY.paperSoft,
        borderRadius: 12,
        cursor: t.completed ? 'default' : 'grab',
        transition: 'all 0.15s',
        opacity: t.completed ? 0.55 : (dragging ? 0.3 : 1),
        boxShadow: t.completed ? 'none' : `inset 0 -1px 3px rgba(90,50,30,0.04)`,
        borderLeft: t.important && !t.completed ? `3px solid ${CLAY.coral}` : '3px solid transparent',
        userSelect: 'none'
      }}
    >
      {/* checkbox */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          // Trigger confetti from this position
          if (!t.completed) {
            const rect = e.currentTarget.getBoundingClientRect();
            onToggle(t.id, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
          } else {
            onToggle(t.id, null);
          }
        }}
        style={{
          position: 'absolute', left: 9, top: 11,
          width: 14, height: 14,
          borderRadius: '50%',
          background: t.completed ? c : CLAY.paper,
          boxShadow: t.completed ? `inset 1px 2px 3px rgba(0,0,0,0.15)` : `inset 0 -1px 2px rgba(90,50,30,0.15), 0 1px 0 rgba(255,255,255,0.8)`,
          border: t.completed ? 'none' : `1px solid ${CLAY.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
          cursor: 'pointer'
        }}>
        {t.completed && (
          <svg viewBox="0 0 12 12" width="9" height="9" style={{ animation: 'garden-check-pop 0.3s ease-out' }}>
            <path d="M 2 6 L 5 9 L 10 3" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      <div onClick={() => onEdit(t.id)} style={{
        fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
        color: CLAY.ink, lineHeight: 1.3,
        textDecoration: t.completed ? 'line-through' : 'none',
        textDecorationColor: CLAY.muted,
        marginBottom: 3, textWrap: 'pretty', cursor: 'pointer'
      }}>{t.title}</div>
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 9, letterSpacing: '0.06em', color: CLAY.muted
      }}>
        <span style={{
          padding: '1px 6px', borderRadius: 999,
          background: c + '22', color: c, fontWeight: 700, letterSpacing: '0.08em'
        }}>{cat.label.toUpperCase()}</span>
        <span>{'●'.repeat(t.energy)}</span>
        <span>{t.duration}</span>
        {t.note && <span title={t.note} style={{ cursor: 'help' }}>✎</span>}
      </div>
      {/* hover actions */}
      <div style={{
        position: 'absolute', top: 6, right: 6,
        display: 'flex', gap: 2,
        opacity: hover && !t.completed ? 1 : 0,
        transition: 'opacity 0.15s'
      }}>
        <IconBtn title="Перенести" onClick={() => onMove(t.id)}>📅</IconBtn>
        <IconBtn title="Удалить" onClick={() => onDelete(t.id)}>✕</IconBtn>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} title={title}
      style={{
        background: CLAY.paper, border: `1px solid ${CLAY.border}`,
        borderRadius: 8, padding: '3px 6px',
        cursor: 'pointer', fontSize: 11, color: CLAY.inkSoft,
        lineHeight: 1, fontFamily: 'inherit',
        boxShadow: '0 1px 2px rgba(90,50,30,0.08)'
      }}
      onMouseEnter={e => { e.currentTarget.style.background = CLAY.paperSoft; e.currentTarget.style.color = CLAY.coralDeep; }}
      onMouseLeave={e => { e.currentTarget.style.background = CLAY.paper; e.currentTarget.style.color = CLAY.inkSoft; }}
    >{children}</button>
  );
}

// ───────────────────────── progress strip ─────────────────────────
function CProgress({ p }) {
  const stats = [
    { v: p.remaining, l: 'осталось' },
    { v: p.closedDays, l: 'закрыто дней' },
    { v: p.busiest, l: 'самый плотный', text: true }
  ];
  return (
    <div style={{
      position: 'relative',
      background: CLAY.paper,
      borderRadius: blob(11),
      padding: '26px 32px',
      boxShadow: `inset 0 -4px 10px rgba(90,50,30,0.08), 0 10px 28px rgba(60,30,15,0.08)`,
      overflow: 'hidden',
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: 20
    }}>
      <CWash color={CLAY.peachSoft} x={-50} y={-50} size={200} opacity={0.5}/>
      <div style={{ position: 'relative' }}>
        <div style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: CLAY.muted, fontWeight: 600, marginBottom: 10
        }}>Прогресс недели</div>
        <div style={{
          position: 'relative', height: 18,
          background: CLAY.clay, borderRadius: 999,
          overflow: 'hidden', boxShadow: `inset 0 2px 4px rgba(90,50,30,0.2)`
        }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${p.percent}%`,
            background: `linear-gradient(90deg, ${CLAY.peach} 0%, ${CLAY.coral} 100%)`,
            borderRadius: 999,
            boxShadow: `0 0 18px ${CLAY.coral}77, inset 0 1px 2px rgba(255,200,170,0.4)`,
            transition: 'width 0.6s cubic-bezier(0.22,1,0.36,1)'
          }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
              animation: 'garden-shimmer 3.5s ease-in-out infinite'
            }}/>
          </div>
        </div>
        <div style={{
          marginTop: 10,
          fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic',
          fontSize: 14, color: CLAY.inkSoft
        }}>{p.completed} из {p.total} · {p.percent}%</div>
      </div>
      <div className="clay-progress-stats" style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 16,
        alignItems: 'end'
      }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            alignItems: 'flex-start',
            paddingTop: 12,
            borderTop: `1px solid ${CLAY.border}`
          }}>
            <div style={{
              fontFamily: 'Fraunces, Georgia, serif',
              fontWeight: 500,
              fontSize: s.text ? 28 : 34,
              fontStyle: 'normal',
              color: CLAY.ink,
              lineHeight: 1.05,
              letterSpacing: '-0.015em',
              whiteSpace: s.text ? 'normal' : 'nowrap',
              overflowWrap: 'break-word',
              maxWidth: '100%',
              minHeight: 42,
              display: 'flex',
              alignItems: 'flex-end'
            }}>{s.v}</div>
            <div style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: CLAY.muted, fontWeight: 600, marginTop: 8
            }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── antichaos (drag-droppable) ─────────────────────────
function CAntichaos({ antiTasks, futureTasks, pastIncomplete, onEdit, onMove, onDelete, onDrop, isDragOver, setDragOver, vp }) {
  const total = antiTasks.length + futureTasks.length + pastIncomplete.length;
  const completed = [...antiTasks, ...futureTasks, ...pastIncomplete].filter(t => t.completed).length;
  return (
    <div
      className="clay-section"
      onDragOver={e => { e.preventDefault(); setDragOver('null'); }}
      onDragLeave={e => { if (e.currentTarget.contains(e.relatedTarget)) return; setDragOver(null); }}
      onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) onDrop(id, null); setDragOver(null); }}
      style={{
        position: 'relative',
        margin: vp.isMobile ? '0 16px 32px' : '0 48px 40px',
        padding: vp.isMobile ? '22px 18px' : '26px 32px',
        background: CLAY.paper,
        borderRadius: blob(12),
        boxShadow: isDragOver
          ? `inset 0 0 0 2px ${CLAY.lavender}, 0 10px 32px rgba(148,132,168,0.3)`
          : `inset 0 -4px 10px rgba(90,50,30,0.08), 0 10px 28px rgba(60,30,15,0.08)`,
        overflow: 'hidden',
        animation: isDragOver ? 'clay-drag-over 0.9s ease-in-out infinite' : 'none',
        transition: 'box-shadow 0.2s'
      }}>
      <CWash color={'#d8caea'} x={-60} y={-40} size={240} opacity={0.5}/>

      <div style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6
      }}>
        <div style={{
          width: 36, height: 36,
          background: CLAY.lavender,
          borderRadius: blob(13),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 18, fontWeight: 700,
          boxShadow: `inset -2px -2px 4px rgba(60,30,80,0.2), 0 4px 12px rgba(148,132,168,0.3)`
        }}>🌀</div>
        <div>
          <div style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
            color: CLAY.lavender, fontWeight: 700
          }}>Антихаос</div>
          <div style={{
            fontFamily: 'Fraunces, Georgia, serif', fontSize: 23,
            fontWeight: 500, color: CLAY.ink, letterSpacing: '-0.015em'
          }}>Мысли, которые ждут своего дня</div>
        </div>
        <div style={{
          marginLeft: 'auto',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 11, color: CLAY.muted, fontWeight: 600,
          letterSpacing: '0.12em'
        }}>{completed} / {total} решено</div>
      </div>

      <div style={{
        position: 'relative',
        fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic',
        fontSize: 14, color: CLAY.inkSoft, marginBottom: 6
      }}>{isDragOver ? '↓ положи сюда — задача ляжет в Антихаос' : 'Здесь живут мысли без даты, будущие планы и хвостики прошлых недель.'}</div>

      {antiTasks.length > 0 && (
        <AntiSection
          title="Без даты"
          hint={antichaosHint(antiTasks.length)}
          tasks={antiTasks}
          accentColor={CLAY.lavender}
          onEdit={onEdit} onMove={onMove} onDelete={onDelete}
        />
      )}

      {futureTasks.length > 0 && (
        <AntiSection
          title="Запланировано"
          hint="Эти задачи ждут своей недели"
          tasks={futureTasks}
          accentColor={CLAY.sage}
          showDate
          onEdit={onEdit} onMove={onMove} onDelete={onDelete}
        />
      )}

      {pastIncomplete.length > 0 && (
        <AntiSection
          title="Просрочено"
          hint="Эти задачи остались с прошлых недель — перенести или закрыть?"
          tasks={pastIncomplete}
          accentColor={CLAY.peach}
          showDate
          onEdit={onEdit} onMove={onMove} onDelete={onDelete}
        />
      )}

      {total === 0 && (
        <div style={{
          padding: '24px 16px', textAlign: 'center',
          fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic',
          fontSize: 15, color: CLAY.muted
        }}>тут пусто — и это прекрасно</div>
      )}
    </div>
  );
}

function AntiSection({ title, hint, tasks, accentColor, showDate = false, onEdit, onMove, onDelete }) {
  return (
    <div style={{
      position: 'relative',
      marginTop: 24,
      paddingTop: 16,
      borderTop: `1px dashed ${CLAY.border}`
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6
      }}>
        <div style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: accentColor, fontWeight: 700
        }}>{title}</div>
        <div style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 11, color: CLAY.muted
        }}>· {tasks.length}</div>
      </div>
      <div style={{
        fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic',
        fontSize: 13, color: CLAY.inkSoft, marginBottom: 14
      }}>{hint}</div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12
      }}>
        {tasks.map((task, i) => (
          <AntiCard key={task.id} task={task} index={i}
            onEdit={onEdit} onMove={onMove} onDelete={onDelete}
            showDate={showDate} />
        ))}
      </div>
    </div>
  );
}

function AntiCard({ task, index, onEdit, onMove, onDelete, showDate = false }) {
  const cat = categoryOf(task.category);
  const c = cat.color;
  const [hover, setHover] = useState(false);
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        padding: '14px 16px',
        background: CLAY.paperSoft,
        borderRadius: blob(14 + index),
        display: 'flex', flexDirection: 'column', gap: 10,
        boxShadow: `inset 0 -2px 4px rgba(90,50,30,0.06)`,
        cursor: 'grab',
        transition: 'transform 0.15s, box-shadow 0.15s'
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%', background: c,
          boxShadow: `inset -1px -1px 2px rgba(0,0,0,0.2)`
        }}/>
        <span style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: c, fontWeight: 700
        }}>{cat.label}</span>
        <div style={{
          marginLeft: 'auto', display: 'flex', gap: 4,
          opacity: hover ? 1 : 0, transition: 'opacity 0.15s'
        }}>
          <IconBtn title="Редактировать" onClick={() => onEdit(task.id)}>✎</IconBtn>
          <IconBtn title="Удалить" onClick={() => onDelete(task.id)}>✕</IconBtn>
        </div>
      </div>
      {showDate && task.date && (
        <div style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10, letterSpacing: '0.12em',
          color: CLAY.muted, marginBottom: -4, fontWeight: 600
        }}>📅 {dateLabel(parseDate(task.date))}</div>
      )}
      <div onClick={() => onEdit(task.id)} style={{
        fontFamily: 'Fraunces, Georgia, serif',
        fontSize: 16, fontWeight: 500,
        color: CLAY.ink, lineHeight: 1.3, cursor: 'pointer'
      }}>{task.title}</div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 'auto', paddingTop: 8,
        borderTop: `1px dashed ${CLAY.border}`
      }}>
        <span style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10, color: CLAY.muted, letterSpacing: '0.08em'
        }}>{'●'.repeat(task.energy)} · {task.duration}</span>
        <button onClick={() => onMove(task.id)} style={{
          fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic',
          fontSize: 12, color: CLAY.coralDeep,
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontWeight: 600
        }}>найти день →</button>
      </div>
    </div>
  );
}

// ───────────────────────── badges ─────────────────────────
function CBadges({ progress, antiCount }) {
  const active = CLAY_BADGES.filter(b => b.test(progress, antiCount));
  return (
    <div style={{
      position: 'relative',
      background: CLAY.paper,
      borderRadius: blob(15),
      padding: '24px 28px',
      boxShadow: `inset 0 -4px 10px rgba(90,50,30,0.08), 0 10px 28px rgba(60,30,15,0.08)`,
      overflow: 'hidden'
    }}>
      <CWash color={CLAY.sageSoft} x={180} y={-30} size={200} opacity={0.45} drift={2}/>
      <div style={{ position: 'relative' }}>
        <div style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: CLAY.muted, fontWeight: 600, marginBottom: 4
        }}>Бейджи</div>
        <div style={{
          fontFamily: 'Fraunces, Georgia, serif', fontSize: 22,
          fontWeight: 500, color: CLAY.ink, letterSpacing: '-0.015em',
          marginBottom: 14
        }}>Что уже получилось</div>
      </div>
      {active.length === 0 ? (
        <div style={{
          position: 'relative',
          fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic',
          fontSize: 14, color: CLAY.muted, padding: '8px 0'
        }}>Бейджи появятся по ходу недели.</div>
      ) : (
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {active.map((b, i) => (
            <div key={b.id} style={{
              padding: '11px 14px',
              background: `linear-gradient(135deg, ${CLAY.cream} 0%, ${CLAY.peachSoft} 100%)`,
              borderRadius: blob(16 + i),
              display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: `inset 0 -2px 4px rgba(90,50,30,0.06), 0 2px 6px rgba(196,74,50,0.1)`,
              animation: `clay-rise 0.7s ${0.3 + i * 0.1}s ease-out backwards`
            }}>
              <div style={{
                width: 30, height: 30,
                background: CLAY.paper, borderRadius: blob(17 + i),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15,
                boxShadow: `inset -1px -1px 3px rgba(90,50,30,0.1)`
              }}>{b.glyph}</div>
              <span style={{
                fontFamily: 'Fraunces, Georgia, serif',
                fontSize: 14, fontWeight: 500, color: CLAY.ink
              }}>{b.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── share menu ─────────────────────────
// Метки статуса синхронизации
const SYNC_LABEL = {
  idle:    null,
  pending: { text: 'ожидание…',      dot: CLAY_LIGHT.amber  },
  syncing: { text: 'синхронизация…', dot: CLAY_LIGHT.peach  },
  saved:   { text: 'в облаке ✓',     dot: '#476039'         },
  error:   { text: 'не сохранено',   dot: CLAY_LIGHT.coral  },
  offline: { text: 'офлайн',         dot: CLAY_LIGHT.muted  }
};

function ShareMenu({ open, onClose, onPDF, onEmail, onExport, onImport, uid, syncStatus, onCopyLink }) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;

  const syncInfo = SYNC_LABEL[syncStatus];
  const shareUrl = uid ? getShareUrl(uid) : null;

  const actions = [
    {
      glyph: '🔗',
      label: 'Скопировать личную ссылку',
      hint: 'Открывает ваши данные на любом устройстве',
      do: () => shareUrl && onCopyLink(shareUrl),
      hide: !uid
    },
    { glyph: '⬇', label: 'Сохранить резервную копию', hint: 'Скачать файл .json — открывается на другом устройстве через «Загрузить»', do: onExport },
    { glyph: '⬆', label: 'Загрузить резервную копию', hint: 'Открыть .json файл с другого устройства', do: onImport },
    { glyph: '📄', label: 'Сохранить как PDF', hint: 'Откроется страница печати — нажми Cmd+P', do: onPDF },
    { glyph: '✉', label: 'Отправить на e-mail', hint: 'Откроется почтовый клиент', do: onEmail }
  ].filter(a => !a.hide);

  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 200,
      background: CLAY.backdrop, backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
      paddingTop: 110, paddingRight: 60,
      animation: 'clay-fade-in 0.15s ease-out'
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 360, background: CLAY.paper,
        borderRadius: blob(50),
        padding: 12,
        boxShadow: '0 24px 60px rgba(40,20,10,0.45), inset 0 -4px 10px rgba(90,50,30,0.08)',
        animation: 'clay-modal-rise 0.25s cubic-bezier(0.34,1.2,0.64,1) backwards'
      }}>
        {/* заголовок + статус облака */}
        <div style={{
          padding: '10px 14px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <span style={{
            fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
            letterSpacing: '0.22em', color: CLAY.muted, textTransform: 'uppercase',
            fontWeight: 600
          }}>Поделиться неделей</span>
          {syncInfo && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
              letterSpacing: '0.14em', color: syncInfo.dot,
              textTransform: 'uppercase', fontWeight: 600
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: syncInfo.dot }}/>
              {syncInfo.text}
            </span>
          )}
        </div>

        {/* uid-строка для ручного ввода */}
        {uid && (
          <div style={{
            margin: '0 14px 10px',
            padding: '8px 12px',
            background: CLAY.paperSoft,
            borderRadius: 10,
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 10, color: CLAY.muted, letterSpacing: '0.08em',
            wordBreak: 'break-all', lineHeight: 1.6
          }}>
            <span style={{ display: 'block', fontSize: 8, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 }}>
              ваш id — для ввода на другом устройстве
            </span>
            {uid}
          </div>
        )}

        {actions.map((a, i) => (
          <button key={i} onClick={() => { a.do(); onClose(); }} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            width: '100%', padding: '12px 14px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 14, color: a.danger ? CLAY.coralDeep : CLAY.ink,
            borderRadius: 12, textAlign: 'left'
          }}
          onMouseEnter={e => e.currentTarget.style.background = CLAY.paperSoft}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{
              width: 32, height: 32, borderRadius: '50%',
              background: a.danger ? CLAY.coralSoft + '40' : CLAY.cream,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, flexShrink: 0
            }}>{a.glyph}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{a.label}</div>
              <div style={{ fontSize: 11, color: CLAY.muted, marginTop: 1, fontStyle: 'italic' }}>{a.hint}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── persistence helpers ─────────────────────────
const LS_KEY_STATE = 'clay-planner-state-v1';
const LS_KEY_THEME = 'clay-planner-theme-v1';

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(LS_KEY_STATE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tasks)) return null;
    return parsed;
  } catch (e) { return null; }
}

function persistState(state) {
  try {
    localStorage.setItem(LS_KEY_STATE, JSON.stringify({
      tasks: state.tasks,
      closedDays: state.closedDays || {},
      lastSeenWeekId: state.ui?.lastSeenWeekId || null,
      userClearedAll: state.ui?.userClearedAll === true
    }));
  } catch (e) { /* quota / private mode */ }
}

function loadPersistedTheme() {
  try { return localStorage.getItem(LS_KEY_THEME) || 'light'; }
  catch { return 'light'; }
}

function persistTheme(mode) {
  try { localStorage.setItem(LS_KEY_THEME, mode); } catch {}
}

function initFromStorage() {
  const saved = loadPersistedState();
  if (!saved) return { ...initialState, tasks: getDemoTasks() };
  if (saved.tasks.length === 0 && saved.userClearedAll !== true) {
    return { ...initialState, tasks: getDemoTasks() };
  }
  const lastSeenWeekId = saved.lastSeenWeekId || saved.ui?.lastSeenWeekId || null;
  const currentWeekId = getCurrentWeekId();
  const hasPastIncomplete = saved.tasks.some(t => isPastTask(t) && !t.completed);
  const weekChanged = !!lastSeenWeekId && lastSeenWeekId !== currentWeekId;
  const weekTransitionOpen = hasPastIncomplete;
  const normalizedLastSeenWeekId = (!lastSeenWeekId || (!hasPastIncomplete && weekChanged))
    ? currentWeekId
    : lastSeenWeekId;
  return {
    ...initialState,
    tasks: saved.tasks,
    closedDays: saved.closedDays || {},
    ui: {
      ...initialState.ui,
      lastSeenWeekId: normalizedLastSeenWeekId,
      weekTransitionOpen,
      userClearedAll: saved.userClearedAll === true
    }
  };
}

// ───────────────────────── share / print ─────────────────────────
function buildPrintableHTML(state, weekRange) {
  const weekDs = getCurrentWeekDates();
  const closed = state.closedDays || {};
  const dayBlocks = weekDs.map(d => {
    const ds = fmtDate(d);
    const dayTasks = state.tasks.filter(t => t.date === ds);
    const done = dayTasks.filter(t => t.completed).length;
    const score = dayLoad(state.tasks, ds);
    const lk = loadKey(score);
    const labels = { empty:'пусто', light:'лёгкий', normal:'ровный', dense:'плотный', overload:'перегруз' };
    const isClosed = closed[ds];
    const rows = dayTasks.map(t => {
      const mark = t.completed ? '✓' : '○';
      const star = t.important ? ' ★' : '';
      const cat = (CLAY_CATEGORIES.find(c => c.id === t.category) || {}).label || '';
      return `<li class="${t.completed ? 'done' : ''}"><span class="m">${mark}</span> ${escapeHTML(t.title)}${star} <span class="meta">· ${cat} · ${'●'.repeat(t.energy)} · ${t.duration}</span></li>`;
    }).join('');
    return `
      <section class="day">
        <h3>${weekdayLong(d)}, ${d.getDate()} ${RU_MONTHS[d.getMonth()]} <span class="badge">${labels[lk]}${isClosed ? ' · закрыт ✦' : ''}</span></h3>
        <div class="counter">${done} / ${dayTasks.length}</div>
        <ul>${rows || '<li class="empty">пусто и хорошо</li>'}</ul>
      </section>
    `;
  }).join('');

  const antiTasks = state.tasks.filter(t => t.date === null);
  const antiHTML = antiTasks.length === 0 ? '<p class="empty">Антихаос пуст.</p>' :
    `<ul>${antiTasks.map(t => `<li><span class="m">○</span> ${escapeHTML(t.title)} <span class="meta">· ${(CLAY_CATEGORIES.find(c => c.id === t.category) || {}).label || ''} · ${'●'.repeat(t.energy)}</span></li>`).join('')}</ul>`;

  const progress = calcProgress(state.tasks, closed);
  const balance = calcBalance(state.tasks);

  return `<!DOCTYPE html>
<html lang="ru"><head>
<meta charset="UTF-8">
<title>Ритм Недели · ${weekRange}</title>
<style>
  @page { size: A4 portrait; margin: 18mm 14mm; }
  body { font-family: Georgia, "Times New Roman", serif; color: #2a1810; line-height: 1.5; max-width: 800px; margin: 0 auto; padding: 24px; }
  h1 { font-style: italic; font-weight: 400; font-size: 32px; letter-spacing: -0.02em; margin: 0 0 4px; }
  .sub { color: #8a6e58; font-style: italic; margin-bottom: 24px; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 14px 0; border-top: 1px solid #d4b896; border-bottom: 1px solid #d4b896; margin-bottom: 24px; }
  .stat .v { font-size: 26px; font-weight: 400; font-style: italic; }
  .stat .l { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: #8a6e58; margin-top: 4px; }
  .balance { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-bottom: 24px; font-size: 13px; }
  .balance span b { font-style: normal; color: #c44a32; }
  .day { margin-bottom: 18px; page-break-inside: avoid; border-bottom: 1px dashed #d4b896; padding-bottom: 12px; }
  .day h3 { font-size: 18px; font-style: italic; font-weight: 500; margin: 0 0 4px; display: flex; justify-content: space-between; align-items: baseline; }
  .badge { font-size: 11px; font-style: normal; text-transform: uppercase; letter-spacing: 0.14em; color: #8a6e58; font-weight: 400; }
  .counter { font-size: 11px; color: #8a6e58; letter-spacing: 0.1em; margin-bottom: 8px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 4px 0; font-size: 14px; }
  li.done { color: #8a6e58; text-decoration: line-through; }
  li.empty { font-style: italic; color: #8a6e58; }
  .m { font-weight: 700; margin-right: 6px; }
  .meta { color: #8a6e58; font-size: 12px; }
  .antichaos { margin-top: 32px; padding-top: 16px; border-top: 2px solid #c44a32; }
  .antichaos h2 { font-style: italic; font-weight: 400; font-size: 22px; margin: 0 0 12px; }
  .footer { margin-top: 40px; text-align: center; color: #8a6e58; font-size: 11px; font-style: italic; }
</style>
</head>
<body>
  <h1>Ритм Недели</h1>
  <div class="sub">${weekRange} · ритм-индекс «${progress.rhythmStatus.toLowerCase()}» · ${progress.rhythm}/100</div>
  <div class="stats">
    <div class="stat"><div class="v">${progress.percent}%</div><div class="l">прогресс</div></div>
    <div class="stat"><div class="v">${progress.completed}/${progress.total}</div><div class="l">задач</div></div>
    <div class="stat"><div class="v">${progress.closedDays}</div><div class="l">дней закрыто</div></div>
    <div class="stat"><div class="v" style="font-size: 16px;">${progress.busiest}</div><div class="l">самый плотный</div></div>
  </div>
  <div class="balance">
    ${balance.map(b => `<span><b>${b.percent}%</b> ${b.label.toLowerCase()} (${b.count})</span>`).join('')}
  </div>
  ${dayBlocks}
  <div class="antichaos">
    <h2>🌀 Антихаос · ${antiTasks.length}</h2>
    ${antiHTML}
  </div>
  <div class="footer">сделано в Ритме Недели · ${new Date().toLocaleDateString('ru-RU')}</div>
  <script>
    // Auto-open print dialog
    window.addEventListener('load', () => setTimeout(() => window.print(), 300));
  </script>
</body></html>`;
}

function escapeHTML(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function exportPDF(state, weekRange) {
  const html = buildPrintableHTML(state, weekRange);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) {
    // popup blocked — offer download
    const a = document.createElement('a');
    a.href = url; a.download = `ritm-nedeli-${weekRange.replace(/\s/g,'-')}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function buildEmailBody(state, weekRange) {
  const weekDs = getCurrentWeekDates();
  const progress = calcProgress(state.tasks, state.closedDays || {});
  const lines = [];
  lines.push(`Ритм Недели · ${weekRange}`);
  lines.push(`Ритм-индекс: ${progress.rhythm}/100 — «${progress.rhythmStatus}»`);
  lines.push(`Прогресс: ${progress.completed} из ${progress.total} (${progress.percent}%)`);
  lines.push('');
  weekDs.forEach(d => {
    const ds = fmtDate(d);
    const dayTasks = state.tasks.filter(t => t.date === ds);
    if (dayTasks.length === 0) return;
    lines.push(`— ${weekdayLong(d)}, ${d.getDate()} ${RU_MONTHS[d.getMonth()]} —`);
    dayTasks.forEach(t => {
      const mark = t.completed ? '[x]' : '[ ]';
      const star = t.important ? ' ★' : '';
      lines.push(`  ${mark} ${t.title}${star}`);
    });
    lines.push('');
  });
  const anti = state.tasks.filter(t => t.date === null);
  if (anti.length > 0) {
    lines.push(`🌀 Антихаос (${anti.length}):`);
    anti.forEach(t => lines.push(`  · ${t.title}`));
  }
  return lines.join('\n');
}

function exportEmail(state, weekRange) {
  const body = buildEmailBody(state, weekRange);
  const subject = `Моя неделя · ${weekRange}`;
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ───────────────────────── main ─────────────────────────
export default function ClayVariant() {
  const [state, dispatch] = useReducer(reducer, undefined, initFromStorage);
  const vp = useViewport();
  const [theme, setTheme] = useState(loadPersistedTheme);
  const [confettiPos, setConfettiPos] = useState(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const rootRef      = useRef(null);
  const importFileRef = useRef(null);
  const [uid]         = useState(getOrCreateUid);
  const [syncStatus, setSyncStatus] = useState('idle');
  // 'idle' | 'pending' | 'syncing' | 'saved' | 'error' | 'offline'

  // Swap the live CLAY palette before child JSX is built so inline styles see the right colors
  if (typeof window !== 'undefined' && window.setClayTheme) {
    window.setClayTheme(theme);
  }

  const balance  = useMemo(() => calcBalance(state.tasks), [state.tasks]);
  const progress = useMemo(() => calcProgress(state.tasks, state.closedDays), [state.tasks, state.closedDays]);
  const advice   = useMemo(() => calcAdvice(state.tasks, false), [state.tasks]);
  const antiTasks = useMemo(() => state.tasks.filter(isAntichaosTask), [state.tasks]);
  const futureTasks = useMemo(() => state.tasks.filter(isFutureTask), [state.tasks]);
  const pastIncomplete = useMemo(() => state.tasks.filter(t => isPastTask(t) && !t.completed), [state.tasks]);
  const balanceAdvice = useMemo(() => {
    const work = balance.find(b => b.id === 'work');
    const rest = balance.find(b => b.id === 'rest');
    if (work && work.percent > 50) return 'Работа налита почти до краёв. Чаша «Отдых» едва на дне — добавим капельку?';
    if (rest && rest.percent === 0) return 'В чаше отдыха пусто. Даже 15-минутная пауза считается.';
    return 'Чаши недели налиты живо: дела есть, но ты тоже есть.';
  }, [balance]);
  const moveDateLabel = useCallback((date) => (
    date ? weekdayLong(parseDate(date)).toLowerCase() : null
  ), []);

  // ───── handlers ─────
  const onToggle = useCallback((id, pos) => {
    dispatch({ type: 'TOGGLE_TASK', id });
    if (pos) setConfettiPos({ ...pos, ts: Date.now() });
  }, []);
  const openNew = useCallback((preset) => {
    dispatch({ type: 'UI', ui: { formOpen: true, formInitial: {
      id: null, title: '', date: getTodayISO(),
      category: 'work', energy: 2, duration: '30м',
      important: false, completed: false, note: '',
      ...preset
    } }});
  }, []);
  const openEdit = useCallback((id) => {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;
    dispatch({ type: 'UI', ui: { formOpen: true, formInitial: { ...task } }});
  }, [state.tasks]);
  const openMove = useCallback((id) => {
    dispatch({ type: 'UI', ui: { movingTaskId: id }});
  }, []);
  const onDelete = useCallback((id) => {
    dispatch({ type: 'DELETE_TASK', id });
  }, []);
  const saveForm = useCallback((form) => {
    if (form.id) {
      dispatch({ type: 'UPDATE_TASK', task: form });
    } else {
      dispatch({ type: 'ADD_TASK', task: { ...form, id: newTaskId() } });
    }
    dispatch({ type: 'UI', ui: { formOpen: false, formInitial: null }});
  }, []);
  const moveTask = useCallback((id, date) => {
    dispatch({ type: 'MOVE_TASK_WITH_UNDO', taskId: id, toDate: date, toDateLabel: moveDateLabel(date) });
    dispatch({ type: 'UI', ui: { movingTaskId: null }});
  }, [moveDateLabel]);
  const onDrop = useCallback((id, dateStr) => {
    dispatch({ type: 'MOVE_TASK_WITH_UNDO', taskId: id, toDate: dateStr, toDateLabel: moveDateLabel(dateStr) });
  }, [moveDateLabel]);
  const closeDayConfirm = useCallback((dateStr) => {
    dispatch({ type: 'CLOSE_DAY', date: dateStr });
    dispatch({ type: 'UI', ui: { closingDay: null }});
  }, []);
  const sendIncompleteToAnti = useCallback(() => {
    const ds = state.ui.closingDay;
    const taskIds = state.tasks.filter(t => t.date === ds && !t.completed).map(t => t.id);
    if (taskIds.length > 0) {
      dispatch({ type: 'BULK_MOVE_WITH_UNDO', taskIds, targetDate: null, closeDate: ds });
    } else {
      dispatch({ type: 'CLOSE_DAY', date: ds });
    }
    dispatch({ type: 'UI', ui: { closingDay: null }});
  }, [state.tasks, state.ui.closingDay]);
  const transferAndClose = useCallback((target) => {
    const ds = state.ui.closingDay;
    const taskIds = state.tasks.filter(t => t.date === ds && !t.completed).map(t => t.id);
    if (taskIds.length > 0) {
      dispatch({ type: 'BULK_MOVE_WITH_UNDO', taskIds, targetDate: target, closeDate: ds });
    } else {
      dispatch({ type: 'CLOSE_DAY', date: ds });
    }
    dispatch({ type: 'UI', ui: { closingDay: null }});
  }, [state.tasks, state.ui.closingDay]);
  const handleImportFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await importJSON(file);
      dispatch({ type: 'LOAD_STATE', payload: parsed });
      dispatch({ type: 'UI', ui: {
        toast: { label: 'Данные загружены из файла', undoable: false }
      }});
    } catch (err) {
      dispatch({ type: 'UI', ui: {
        toast: { label: `Ошибка импорта: ${err.message}`, undoable: false }
      }});
    }
    e.target.value = '';
  }, []);

  const onAdviceAction = useCallback((action) => {
    if (action.kind === 'move') {
      dispatch({ type: 'MOVE_TASK_WITH_UNDO', taskId: action.taskId, toDate: action.toDate, toDateLabel: moveDateLabel(action.toDate) });
    }
  }, [moveDateLabel]);

  // ───── initial cloud load ─────
  useEffect(() => {
    loadFromCloud(uid).then(cloud => {
      if (!cloud) return;
      const localAt = state.ui.savedAt || 0;
      const cloudAt = cloud._cloudUpdatedAt
        ? new Date(cloud._cloudUpdatedAt).getTime()
        : 0;
      if (cloudAt > localAt) {
        dispatch({ type: 'LOAD_STATE', payload: cloud });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // только при монтировании

  // ───── week transition check ─────
  useEffect(() => {
    const currentWeekId = getCurrentWeekId();
    const lastSeen = state.ui.lastSeenWeekId;
    const hasPastIncomplete = state.tasks.some(t => isPastTask(t) && !t.completed);
    if (hasPastIncomplete && !state.ui.weekTransitionOpen) {
      dispatch({ type: 'OPEN_WEEK_TRANSITION' });
      return;
    }
    if (lastSeen && lastSeen !== currentWeekId) {
      if (hasPastIncomplete) {
        dispatch({ type: 'OPEN_WEEK_TRANSITION' });
      } else {
        dispatch({ type: 'CLOSE_WEEK_TRANSITION' });
      }
    } else if (!lastSeen) {
      dispatch({ type: 'CLOSE_WEEK_TRANSITION' });
    }
  }, []);

  // ───── keyboard shortcuts ─────
  useEffect(() => {
    const onKey = (e) => {
      const isMeta = e.metaKey || e.ctrlKey;
      const tag = (e.target.tagName || '').toLowerCase();
      const inField = tag === 'input' || tag === 'textarea';
      if (isMeta && e.key === 'n') { e.preventDefault(); openNew(); }
      if (isMeta && e.key === 'e') { e.preventDefault(); setShareMenuOpen(true); }
      if (e.key === 'Escape' && !inField) {
        if (shareMenuOpen) setShareMenuOpen(false);
        if (state.ui.formOpen) dispatch({ type: 'UI', ui: { formOpen: false }});
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [shareMenuOpen, state.ui.formOpen, openNew]);

  // ───── confetti auto-dismiss ─────
  useEffect(() => {
    if (!confettiPos) return;
    const t = setTimeout(() => setConfettiPos(null), 1000);
    return () => clearTimeout(t);
  }, [confettiPos]);

  // ───── persist: localStorage + cloud autosync ─────
  useEffect(() => {
    persistState(state);
    scheduleSave(
      uid,
      {
        tasks: state.tasks,
        closedDays: state.closedDays || {},
        lastSeenWeekId: state.ui?.lastSeenWeekId || null,
        userClearedAll: state.ui?.userClearedAll === true
      },
      setSyncStatus
    );
  }, [state.tasks, state.closedDays, state.ui.lastSeenWeekId]);

  // ───── persist theme ─────
  useEffect(() => {
    persistTheme(theme);
  }, [theme]);

  const weekRange = weekRangeLabel(getCurrentWeekStart(), getCurrentWeekEnd());

  // ───── reset ─────
  const handleReset = () => {
    try { localStorage.removeItem(LS_KEY_STATE); } catch {}
    dispatch({ type: 'RESET_TO_DEMO' });
  };

  const handleClearAll = () => {
    try { localStorage.removeItem(LS_KEY_STATE); } catch {}
    dispatch({ type: 'RESET_TO_EMPTY' });
  };

  return (
    <div ref={rootRef} style={{
      position: 'relative', width: '100%', minHeight: '100%',
      background: CLAY.bg,
      fontFamily: '"Inter", -apple-system, system-ui, sans-serif',
      color: CLAY.ink, overflowX: 'hidden'
    }}>
      <ClayGrain/>
      <CWash color={CLAY.peachSoft} x={-180} y={300} size={560} opacity={0.4}/>
      <CWash color={CLAY.sageSoft} x={1100} y={1400} size={460} opacity={0.35} drift={4}/>
      <CWash color={CLAY.coralSoft} x={1200} y={150} size={320} opacity={0.3} drift={2}/>

      <CHeader
        savedAt={state.ui.savedAt}
        onClear={() => setClearConfirm(true)}
        onNew={() => openNew()}
        theme={theme}
        onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
        onShare={() => setShareMenuOpen(true)}
        vp={vp}
      />
      <CAdvice advice={advice} onAction={onAdviceAction}/>

      <div className="clay-section" style={{
        margin: vp.isMobile ? '20px 16px' : '20px 48px',
        display: 'grid',
        gridTemplateColumns: vp.isMobile ? '1fr' : '1fr 1.3fr',
        gap: 16
      }}>
        <CRhythm value={progress.rhythm} status={progress.rhythmStatus}/>
        <CBalance data={balance} advice={balanceAdvice}/>
      </div>

      <CWeekBoard
        tasks={state.tasks}
        closedDays={state.closedDays}
        progress={progress}
        onToggle={onToggle}
        onEdit={openEdit}
        onMove={openMove}
        onDelete={onDelete}
        onCloseDay={(ds) => dispatch({ type: 'UI', ui: { closingDay: ds }})}
        onOpenDay={(ds) => dispatch({ type: 'OPEN_DAY', date: ds })}
        onDrop={onDrop}
        dragOverDate={state.ui.dragOverDate}
        setDragOver={(d) => dispatch({ type: 'UI', ui: { dragOverDate: d }})}
        vp={vp}
        onNew={() => openNew()}
      />

      <div className="clay-section" style={{
        margin: vp.isMobile ? '24px 16px 0' : '24px 48px 0',
        display: 'grid',
        gridTemplateColumns: vp.isMobile ? '1fr' : '1.6fr 1fr',
        gap: 16
      }}>
        <CProgress p={progress}/>
        <CBadges progress={progress} antiCount={antiTasks.length}/>
      </div>

      <div style={{ marginTop: 24 }}>
        <CAntichaos
          antiTasks={antiTasks}
          futureTasks={futureTasks}
          pastIncomplete={pastIncomplete}
          onEdit={openEdit} onMove={openMove} onDelete={onDelete}
          onDrop={onDrop}
          isDragOver={state.ui.dragOverDate === 'null'}
          setDragOver={(d) => dispatch({ type: 'UI', ui: { dragOverDate: d }})}
          vp={vp}/>
      </div>

      {/* ── modals & overlays ── */}
      <TaskFormModal
        open={state.ui.formOpen}
        onClose={() => dispatch({ type: 'UI', ui: { formOpen: false, formInitial: null }})}
        onSave={saveForm}
        initial={state.ui.formInitial}
        title={state.ui.formInitial?.id ? 'Редактирование' : 'Новая задача'}
      />
      <MoveModal
        open={!!state.ui.movingTaskId}
        onClose={() => dispatch({ type: 'UI', ui: { movingTaskId: null }})}
        task={state.tasks.find(t => t.id === state.ui.movingTaskId)}
        onMove={moveTask}
      />
      <CloseDayModal
        open={!!state.ui.closingDay}
        onClose={() => dispatch({ type: 'UI', ui: { closingDay: null }})}
        dateStr={state.ui.closingDay}
        tasks={state.tasks}
        onCloseAsIs={() => closeDayConfirm(state.ui.closingDay)}
        onSendAntichaos={sendIncompleteToAnti}
        onTransfer={transferAndClose}
      />
      <ToastStack
        toast={state.ui.toast}
        onUndo={() => dispatch({ type: 'UNDO_TOAST' })}
        onDismiss={() => dispatch({ type: 'CLEAR_TOAST' })}
      />
      <WeekTransitionModal
        open={state.ui.weekTransitionOpen}
        pastTasks={pastIncomplete}
        onClose={() => dispatch({ type: 'CLOSE_WEEK_TRANSITION' })}
        onMoveAll={() => {
          const { startISO } = getCurrentWeekRange();
          dispatch({ type: 'BULK_MOVE_TASKS', taskIds: pastIncomplete.map(t => t.id), targetDate: startISO });
          dispatch({ type: 'CLOSE_WEEK_TRANSITION' });
        }}
        onAntichaosAll={() => {
          dispatch({ type: 'BULK_MOVE_TASKS', taskIds: pastIncomplete.map(t => t.id), targetDate: null });
          dispatch({ type: 'CLOSE_WEEK_TRANSITION' });
        }}
        onDeleteAll={() => {
          dispatch({ type: 'BULK_DELETE_TASKS', taskIds: pastIncomplete.map(t => t.id) });
          dispatch({ type: 'CLOSE_WEEK_TRANSITION' });
        }}
        onIndividual={() => dispatch({ type: 'CLOSE_WEEK_TRANSITION' })}
      />
      <ShareMenu
        open={shareMenuOpen}
        onClose={() => setShareMenuOpen(false)}
        onPDF={() => exportPDF(state, weekRange)}
        onEmail={() => exportEmail(state, weekRange)}
        onExport={() => exportJSON(state)}
        onImport={() => importFileRef.current?.click()}
        uid={uid}
        syncStatus={syncStatus}
        onCopyLink={(url) => {
          navigator.clipboard.writeText(url).then(() =>
            dispatch({ type: 'UI', ui: {
              toast: { label: 'Ссылка скопирована — открывай на другом устройстве', undoable: false }
            }})
          );
        }}
      />
      {/* скрытый input для импорта */}
      <input
        ref={importFileRef}
        type="file"
        accept=".json"
        onChange={handleImportFile}
        style={{ display: 'none' }}
        aria-hidden="true"
      />

      {/* clear-week confirm */}
      {clearConfirm && (
        <ClayModal open onClose={() => setClearConfirm(false)} width={520}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <ClayLabel>Очистить</ClayLabel>
            <button onClick={() => setClearConfirm(false)} style={{
              background: 'transparent', border: 'none', color: CLAY.muted,
              fontSize: 22, cursor: 'pointer', padding: 4, lineHeight: 1
            }} aria-label="Закрыть">✕</button>
          </div>
          <div style={{
            fontFamily: 'Fraunces, Georgia, serif', fontSize: 26, fontWeight: 500,
            color: CLAY.ink, letterSpacing: '-0.015em', marginBottom: 10
          }}>Что сделать с данными?</div>
          <div style={{
            fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic',
            fontSize: 15, color: CLAY.inkSoft, lineHeight: 1.5, marginBottom: 22
          }}>Можно убрать только текущую неделю — Антихаос останется. Или полностью обнулить данные.</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ChoiceCard
              onClick={() => { dispatch({ type: 'CLEAR_WEEK' }); setClearConfirm(false); }}
              title="Очистить только неделю"
              hint="Задачи текущей недели исчезнут. Антихаос остаётся."
              glyph="🗓"
            />
            <ChoiceCard
              onClick={() => { handleClearAll(); setClearConfirm(false); }}
              title="Очистить полностью"
              hint="Все задачи и Антихаос — пустая неделя."
              glyph="✕"
              danger
            />
            <ChoiceCard
              onClick={() => { handleReset(); setClearConfirm(false); }}
              title="Сброс к демо"
              hint="Все задачи заменятся демо-набором на актуальной неделе."
              glyph="↺"
            />
          </div>
        </ClayModal>
      )}

      {/* confetti */}
      {confettiPos && <ConfettiBurst x={confettiPos.x} y={confettiPos.y}/>}
    </div>
  );
}

window.ClayVariant = ClayVariant;
