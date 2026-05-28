function localISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function listenOnce() {
  return new Promise((resolve, reject) => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      reject(new Error('Web Speech API не поддерживается в этом браузере'));
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'ru-RU';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn(value);
    };

    const timeout = setTimeout(() => {
      try { rec.stop(); } catch {}
      finish(reject, new Error('Время ожидания истекло'));
    }, 10000);

    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript || '';
      finish(resolve, transcript);
    };

    rec.onerror = (e) => {
      const message = e.error === 'not-allowed'
        ? 'Нет доступа к микрофону'
        : `Ошибка распознавания: ${e.error}`;
      finish(reject, new Error(message));
    };

    rec.start();
  });
}

export async function parseVoiceCommand(text, weekDatesISO) {
  // today вычисляется на клиенте — сервер может быть в другой таймзоне
  const todayISO = localISODate(new Date());
  const today = weekDatesISO.find((date) => date === todayISO) || weekDatesISO[0];

  const response = await fetch('/api/voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, weekDatesISO, today })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Ошибка сервера: ${response.status}`);
  }

  const cmd = await response.json();
  return cmd;
}
