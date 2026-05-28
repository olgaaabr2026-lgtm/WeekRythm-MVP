// Clay variant — modals (task form, edit, move, close-day, delete toast)
import React, { useState, useEffect, useRef } from 'react';
import {
  CLAY, CLAY_CATEGORIES, CLAY_DURATIONS, CLAY_ENERGIES,
  blob, dateLabel, fmtDate, getCurrentWeekStart, getTodayISO,
  parseDate, weekDates, weekdayLong, weekdayShort
} from './clay-helpers.js';

// ───── primitives ─────
function ClayChip({ active, onClick, children, dashed = false, color }) {
  return (
    <button
      className="clay-chip"
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 14px',
        fontFamily: 'inherit',
        fontSize: 13, fontWeight: active ? 600 : 500,
        background: active ? (color || CLAY.coral) : CLAY.paper,
        color: active ? '#fff' : CLAY.ink,
        border: dashed ? `1.5px dashed ${CLAY.borderStrong}` : `1.5px solid ${active ? (color || CLAY.coral) : CLAY.borderStrong}`,
        borderRadius: 999,
        cursor: 'pointer',
        transition: 'all 0.15s',
        boxShadow: active ? `0 2px 0 ${CLAY.coralDeep}` : 'none',
        whiteSpace: 'nowrap'
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = CLAY.paperSoft; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = CLAY.paper; }}
    >{children}</button>
  );
}

function ClayLabel({ children }) {
  return (
    <div style={{
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 10, letterSpacing: '0.22em',
      textTransform: 'uppercase', color: CLAY.muted,
      fontWeight: 600, marginBottom: 8
    }}>{children}</div>
  );
}

function ClayInput({ value, onChange, placeholder, autoFocus, maxLength = 120, multiline, rows = 3 }) {
  const props = {
    value, onChange,
    placeholder,
    autoFocus,
    maxLength,
    style: {
      width: '100%',
      padding: '12px 14px',
      fontFamily: 'inherit',
      fontSize: 15,
      color: CLAY.ink,
      background: CLAY.paperSoft,
      border: `1.5px solid ${CLAY.border}`,
      borderRadius: 12,
      outline: 'none',
      resize: multiline ? 'vertical' : 'none',
      transition: 'border-color 0.15s, box-shadow 0.15s',
      boxShadow: `inset 0 1px 2px rgba(90,50,30,0.06)`
    },
    onFocus: e => { e.currentTarget.style.borderColor = CLAY.coral; e.currentTarget.style.boxShadow = `inset 0 1px 2px rgba(90,50,30,0.06), 0 0 0 3px ${CLAY.coral}22`; },
    onBlur: e => { e.currentTarget.style.borderColor = CLAY.border; e.currentTarget.style.boxShadow = `inset 0 1px 2px rgba(90,50,30,0.06)`; }
  };
  if (multiline) return <textarea {...props} rows={rows} />;
  return <input type="text" {...props} />;
}

function ClayButton({ variant = 'primary', onClick, children, disabled, style = {} }) {
  const base = {
    fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
    padding: '11px 22px', borderRadius: 999,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s',
    border: 'none',
    ...style
  };
  if (variant === 'primary') {
    return (
      <button onClick={onClick} disabled={disabled} style={{
        ...base,
        background: CLAY.coral, color: '#fff',
        boxShadow: `0 4px 0 ${CLAY.coralDeep}, 0 6px 18px rgba(196,74,50,0.28)`
      }}
      onMouseDown={e => !disabled && (e.currentTarget.style.transform = 'translateY(2px)', e.currentTarget.style.boxShadow = `0 2px 0 ${CLAY.coralDeep}`)}
      onMouseUp={e => (e.currentTarget.style.transform = '', e.currentTarget.style.boxShadow = `0 4px 0 ${CLAY.coralDeep}, 0 6px 18px rgba(196,74,50,0.28)`)}
      onMouseLeave={e => (e.currentTarget.style.transform = '', e.currentTarget.style.boxShadow = `0 4px 0 ${CLAY.coralDeep}, 0 6px 18px rgba(196,74,50,0.28)`)}
      >{children}</button>
    );
  }
  if (variant === 'ghost') {
    return (
      <button onClick={onClick} disabled={disabled} style={{
        ...base,
        background: 'transparent', color: CLAY.inkSoft,
        border: `1.5px solid ${CLAY.borderStrong}`,
        boxShadow: `0 2px 0 rgba(90,50,30,0.1)`
      }}>{children}</button>
    );
  }
  if (variant === 'danger') {
    return (
      <button onClick={onClick} disabled={disabled} style={{
        ...base,
        background: '#9a3a26', color: '#fff',
        boxShadow: `0 4px 0 #6e2a1c`
      }}>{children}</button>
    );
  }
  return null;
}

// ───── modal shell ─────
function ClayModal({ open, onClose, children, width = 540 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(58, 36, 24, 0.4)',
        backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'clay-fade-in 0.2s ease-out'
      }}
    >
      <div
        className="clay-modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          width, maxWidth: 'calc(100% - 80px)',
          maxHeight: 'calc(100% - 80px)',
          overflowY: 'auto',
          background: CLAY.paper,
          borderRadius: blob(99),
          padding: '28px 32px',
          boxShadow: `0 30px 80px rgba(40,20,10,0.4), inset 0 -4px 10px rgba(90,50,30,0.08)`,
          animation: 'clay-modal-rise 0.3s cubic-bezier(0.34,1.2,0.64,1) backwards',
          position: 'relative'
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ───── date-chip row (Mon-Sun + Антихаос + Другая дата) ─────
function DateChipRow({ value, onChange, allowAntichaos = true }) {
  const [customMode, setCustomMode] = useState(false);
  const weekStart = getCurrentWeekStart();
  const weekDs = weekDates(weekStart);
  const weekStrs = weekDs.map(fmtDate);
  const isCustom = value && value !== 'null' && !weekStrs.includes(value);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {weekDs.map(d => {
        const ds = fmtDate(d);
        return (
          <ClayChip key={ds} active={value === ds} onClick={() => { onChange(ds); setCustomMode(false); }}>
            {weekdayShort(d)} {d.getDate()}
          </ClayChip>
        );
      })}
      {allowAntichaos && (
        <ClayChip active={value === 'null'} onClick={() => { onChange('null'); setCustomMode(false); }}
          color={CLAY.lavender}>
          🌀 Антихаос
        </ClayChip>
      )}
      <ClayChip dashed active={isCustom || customMode} onClick={() => setCustomMode(m => !m)}>
        📅 {isCustom ? dateLabel(parseDate(value)) : 'Другая дата'}
      </ClayChip>
      {(customMode || isCustom) && (
        <div style={{ flexBasis: '100%', marginTop: 4 }}>
          <input
            type="date"
            value={isCustom ? value : ''}
            min={fmtDate(new Date(weekStart.getTime() - 30 * 86400000))}
            max={fmtDate(new Date(weekStart.getTime() + 365 * 86400000))}
            onChange={e => { if (e.target.value) { onChange(e.target.value); setCustomMode(false); } }}
            style={{
              padding: '10px 14px', fontSize: 14, fontFamily: 'inherit',
              border: `1.5px solid ${CLAY.borderStrong}`, borderRadius: 10,
              background: CLAY.paperSoft, color: CLAY.ink, cursor: 'pointer'
            }}
          />
        </div>
      )}
    </div>
  );
}

// ───── task form (add or edit) ─────
function TaskFormModal({ open, onClose, onSave, initial, title }) {
  const [form, setForm] = useState(initial || {});
  useEffect(() => { setForm(initial || {}); }, [initial, open]);
  const [error, setError] = useState('');

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.title || !form.title.trim()) {
      setError('Задаче нужно хотя бы короткое название.');
      return;
    }
    onSave({ ...form, title: form.title.trim(), note: (form.note || '').trim() });
  };

  return (
    <ClayModal open={open} onClose={onClose}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 6
      }}>
        <ClayLabel>{title || 'Новая задача'}</ClayLabel>
        <button onClick={onClose} style={{
          background: 'transparent', border: 'none', color: CLAY.muted,
          fontSize: 22, cursor: 'pointer', padding: 4, lineHeight: 1
        }} aria-label="Закрыть">✕</button>
      </div>
      <div style={{
        fontFamily: 'Fraunces, Georgia, serif', fontSize: 26, fontWeight: 500,
        color: CLAY.ink, letterSpacing: '-0.015em', marginBottom: 22
      }}>{initial && initial.id ? 'Редактировать' : 'Что собираешься сделать?'}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <ClayInput
          value={form.title || ''}
          onChange={e => { setError(''); update('title', e.target.value); }}
          placeholder="Например: написать письмо Ане"
          autoFocus
          maxLength={120}
        />
        {error && (
          <div style={{ color: CLAY.coralDeep, fontSize: 13, marginTop: -10 }}>{error}</div>
        )}

        <div>
          <ClayLabel>День</ClayLabel>
          <DateChipRow value={form.date === null ? 'null' : (form.date || getTodayISO())} onChange={(v) => update('date', v === 'null' ? null : v)} />
        </div>

        <div>
          <ClayLabel>Категория</ClayLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {CLAY_CATEGORIES.map(cat => (
              <ClayChip key={cat.id} active={form.category === cat.id}
                onClick={() => update('category', cat.id)} color={cat.color}>
                {cat.label}
              </ClayChip>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div>
            <ClayLabel>Энергия</ClayLabel>
            <div style={{ display: 'flex', gap: 6 }}>
              {CLAY_ENERGIES.map(e => (
                <ClayChip key={e.value} active={form.energy === e.value} onClick={() => update('energy', e.value)}>
                  {e.glyph} {e.label}
                </ClayChip>
              ))}
            </div>
          </div>
          <div>
            <ClayLabel>Длительность</ClayLabel>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CLAY_DURATIONS.map(d => (
                <ClayChip key={d.value} active={form.duration === d.value} onClick={() => update('duration', d.value)}>
                  {d.label}
                </ClayChip>
              ))}
            </div>
          </div>
        </div>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
          padding: '10px 14px', background: form.important ? CLAY.coralSoft + '40' : CLAY.paperSoft,
          borderRadius: 12, border: `1.5px solid ${form.important ? CLAY.coral : CLAY.border}`,
          transition: 'all 0.15s'
        }}>
          <input type="checkbox" checked={!!form.important} onChange={e => update('important', e.target.checked)}
            style={{ width: 18, height: 18, accentColor: CLAY.coral, cursor: 'pointer' }} />
          <span style={{ fontSize: 14, color: CLAY.ink, fontWeight: 500 }}>
            ✦ Важное — поднять в верх дня
          </span>
        </label>

        <div>
          <ClayLabel>Заметка (по желанию)</ClayLabel>
          <ClayInput
            value={form.note || ''}
            onChange={e => update('note', e.target.value)}
            placeholder="Контекст, ссылка, мысль…"
            multiline
            rows={3}
            maxLength={500}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
        <ClayButton variant="ghost" onClick={onClose}>Отмена</ClayButton>
        <ClayButton variant="primary" onClick={handleSave}>
          {initial && initial.id ? 'Сохранить' : '+ Добавить'}
        </ClayButton>
      </div>
    </ClayModal>
  );
}

// ───── move task modal ─────
function MoveModal({ open, onClose, task, onMove }) {
  const [target, setTarget] = useState('null');
  useEffect(() => { if (task) setTarget(task.date === null ? 'null' : (task.date || getTodayISO())); }, [task, open]);
  if (!task) return null;

  return (
    <ClayModal open={open} onClose={onClose} width={520}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <ClayLabel>Перенести задачу</ClayLabel>
        <button onClick={onClose} style={{
          background: 'transparent', border: 'none', color: CLAY.muted,
          fontSize: 22, cursor: 'pointer', padding: 4, lineHeight: 1
        }} aria-label="Закрыть">✕</button>
      </div>
      <div style={{
        fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic',
        fontSize: 18, color: CLAY.ink, marginBottom: 8
      }}>«{task.title}»</div>
      <div style={{
        fontFamily: 'Fraunces, Georgia, serif',
        fontSize: 14, color: CLAY.muted, marginBottom: 22
      }}>
        Куда отправим? Можно выбрать день недели, конкретную дату или Антихаос.
      </div>

      <DateChipRow value={target} onChange={setTarget} />

      <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
        <ClayButton variant="ghost" onClick={onClose}>Отмена</ClayButton>
        <ClayButton variant="primary" onClick={() => onMove(task.id, target === 'null' ? null : target)}>
          Перенести
        </ClayButton>
      </div>
    </ClayModal>
  );
}

// ───── close day modal (ritual) ─────
function CloseDayModal({ open, onClose, dateStr, tasks, onCloseAsIs, onSendAntichaos, onTransfer }) {
  const [transferMode, setTransferMode] = useState(false);
  const [target, setTarget] = useState('null');
  useEffect(() => { setTransferMode(false); }, [open]);

  if (!dateStr) return null;
  const date = parseDate(dateStr);
  const dayTasks = tasks.filter(t => t.date === dateStr);
  const done = dayTasks.filter(t => t.completed).length;
  const total = dayTasks.length;
  const incomplete = total - done;

  let opener = '';
  if (total === 0) opener = 'Пустой день. И это тоже план.';
  else if (incomplete === 0) opener = 'Все задачи закрыты — день получился цельным.';
  else if (done > 0) opener = 'День не обязан быть идеальным. Заберём полезное, остальное перенесём бережно.';
  else opener = 'Бывают дни без галочек. Это не провал — это данные для более мягкого плана.';

  return (
    <ClayModal open={open} onClose={onClose} width={560}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <ClayLabel>Закрытие дня</ClayLabel>
        <button onClick={onClose} style={{
          background: 'transparent', border: 'none', color: CLAY.muted,
          fontSize: 22, cursor: 'pointer', padding: 4, lineHeight: 1
        }} aria-label="Закрыть">✕</button>
      </div>
      <div style={{
        fontFamily: 'Fraunces, Georgia, serif',
        fontSize: 28, fontWeight: 500, color: CLAY.ink,
        letterSpacing: '-0.02em', marginBottom: 12
      }}>{weekdayLong(date)}, {dateLabel(date)}</div>

      {/* stats pebbles */}
      {total > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          <StatPebble label="всего" value={total} />
          <StatPebble label="закрыто" value={done} color={CLAY.sage} />
          <StatPebble label="осталось" value={incomplete} color={incomplete > 0 ? CLAY.coral : CLAY.muted} />
        </div>
      )}

      <div style={{
        fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic',
        fontSize: 17, color: CLAY.inkSoft, lineHeight: 1.5, marginBottom: 22
      }}>{opener}</div>

      {!transferMode ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {incomplete > 0 && (
            <>
              <ChoiceCard onClick={() => setTransferMode(true)}
                title="Перенести задачи в другой день"
                hint="Выберешь дату — задачи аккуратно переедут туда" glyph="→" />
              <ChoiceCard onClick={onSendAntichaos}
                title="Отправить в Антихаос"
                hint="Подождут своего дня" glyph="🌀" />
            </>
          )}
          <ChoiceCard onClick={onCloseAsIs} primary
            title={incomplete > 0 ? 'Закрыть как есть' : 'Закрыть день ✦'}
            hint={incomplete > 0 ? 'Незавершённые останутся в этом дне' : 'Готово, можно выдохнуть'} glyph="✦" />
        </div>
      ) : (
        <div>
          <ClayLabel>Куда перенести?</ClayLabel>
          <DateChipRow value={target} onChange={setTarget} allowAntichaos={true} />
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'space-between' }}>
            <ClayButton variant="ghost" onClick={() => setTransferMode(false)}>← Назад</ClayButton>
            <ClayButton variant="primary" onClick={() => onTransfer(target === 'null' ? null : target)}>
              Перенести и закрыть
            </ClayButton>
          </div>
        </div>
      )}
    </ClayModal>
  );
}

function WeekTransitionModal({ open, pastTasks, onClose, onMoveAll, onAntichaosAll, onDeleteAll, onIndividual }) {
  if (!open) return null;
  return (
    <ClayModal open={open} onClose={onClose} width={580}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <ClayLabel>Закрытие недели</ClayLabel>
        <button onClick={onClose} style={{
          background: 'transparent', border: 'none', color: CLAY.muted,
          fontSize: 22, cursor: 'pointer', padding: 4, lineHeight: 1
        }} aria-label="Закрыть">✕</button>
      </div>
      <div style={{
        fontFamily: 'Fraunces, Georgia, serif', fontSize: 28, fontWeight: 500,
        color: CLAY.ink, letterSpacing: '-0.02em', marginBottom: 12
      }}>Началась новая неделя</div>
      <div style={{
        fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic',
        fontSize: 17, color: CLAY.inkSoft, lineHeight: 1.5, marginBottom: 18
      }}>С прошлой недели остались {pastTasks.length} незавершённых задач. Что с ними сделаем?</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ChoiceCard onClick={onMoveAll} primary
          title="Перенести в новую неделю"
          hint="Все задачи переедут на этот понедельник" glyph="→" />
        <ChoiceCard onClick={onAntichaosAll}
          title="Отправить в Антихаос"
          hint="Подождут, пока не выберешь им день" glyph="🌀" />
        <ChoiceCard onClick={onDeleteAll}
          title="Закрыть без переноса"
          hint="Просто удалить" glyph="✕" />
        <ChoiceCard onClick={onIndividual}
          title="Разобрать вручную"
          hint="Открою Антихаос и разберу каждую" glyph="✦" />
      </div>
    </ClayModal>
  );
}

function StatPebble({ label, value, color = CLAY.muted }) {
  return (
    <div style={{
      flex: 1,
      padding: '12px 14px',
      background: CLAY.paperSoft,
      borderRadius: blob(20),
      boxShadow: `inset 0 -2px 4px rgba(90,50,30,0.06)`
    }}>
      <div style={{
        fontFamily: 'Fraunces, Georgia, serif', fontSize: 28, fontWeight: 500,
        color, lineHeight: 1, letterSpacing: '-0.02em'
      }}>{value}</div>
      <div style={{
        fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
        letterSpacing: '0.16em', textTransform: 'uppercase',
        color: CLAY.muted, marginTop: 4, fontWeight: 600
      }}>{label}</div>
    </div>
  );
}

function ChoiceCard({ onClick, title, hint, glyph, primary, danger }) {
  const accent = danger ? CLAY.coralDeep : CLAY.coral;
  const background = danger
    ? CLAY.coralSoft + '40'
    : primary
      ? `linear-gradient(135deg, ${CLAY.peachSoft} 0%, ${CLAY.coralSoft} 100%)`
      : CLAY.paperSoft;
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 18px',
      background,
      border: `1.5px solid ${primary || danger ? accent : CLAY.borderStrong}`,
      borderRadius: blob(21),
      cursor: 'pointer',
      fontFamily: 'inherit',
      textAlign: 'left',
      transition: 'all 0.15s',
      boxShadow: primary || danger ? `0 4px 0 ${CLAY.coralDeep}` : `0 2px 0 rgba(90,50,30,0.1)`
    }}
    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
    onMouseLeave={e => e.currentTarget.style.transform = ''}
    >
      <div style={{
        width: 36, height: 36, flexShrink: 0,
        borderRadius: '50%',
        background: primary ? CLAY.paper : CLAY.paper,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, color: primary || danger ? accent : CLAY.inkSoft,
        boxShadow: 'inset -1px -1px 3px rgba(90,50,30,0.1)'
      }}>{glyph}</div>
      <div>
        <div style={{
          fontFamily: 'Fraunces, Georgia, serif', fontSize: 16, fontWeight: 500,
          color: CLAY.ink, marginBottom: 2
        }}>{title}</div>
        <div style={{
          fontSize: 12, color: CLAY.inkSoft, fontStyle: 'italic'
        }}>{hint}</div>
      </div>
    </button>
  );
}

// ───── toast stack (single visible toast with optional undo) ─────
function ToastStack({ toast, onUndo, onDismiss }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, toast.duration ?? 5000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);
  if (!toast) return null;
  return (
    <div
      className="clay-toast"
      role="alert"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: CLAY.ink,
        color: '#fff',
        padding: '14px 20px',
        borderRadius: 999,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
        fontSize: 14,
        maxWidth: 'min(540px, calc(100vw - 32px))',
        animation: 'clay-toast-rise 0.3s cubic-bezier(0.34,1.2,0.64,1)'
      }}
    >
      <span style={{
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }}>
        {toast.label}
      </span>
      {toast.undoable && (
        <button onClick={onUndo} style={{
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 600,
          background: CLAY.coralSoft,
          color: CLAY.coralDeep,
          border: 'none',
          padding: '8px 16px',
          borderRadius: 999,
          cursor: 'pointer',
          flexShrink: 0,
          minHeight: 36
        }}>↶ Вернуть</button>
      )}
    </div>
  );
}

// ───── saved indicator (subtle breath) ─────
function SavedIndicator({ pulseKey }) {
  return (
    <div key={pulseKey} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '6px 12px',
      background: CLAY.sageSoft + '70',
      borderRadius: 999,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
      color: '#476039', fontWeight: 600,
      animation: 'clay-saved-pulse 1.6s ease-out'
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: '#476039'
      }}/>
      сохранено
    </div>
  );
}

export {
  ClayChip, ClayLabel, ClayInput, ClayButton, ClayModal,
  DateChipRow, TaskFormModal, MoveModal, CloseDayModal,
  WeekTransitionModal, StatPebble, ChoiceCard, ToastStack, SavedIndicator
};
