const state = {
  token: '',
  roomCode: '',
  roomName: '',
  nickname: '',
  inviteUrl: '',
  members: [],
  lotteryAssignments: {},
  entries: [],
  dayPageIndex: 0,
  monthCursor: new Date(),
  pollTimer: null
};

const REACTION_EMOJIS = ['👍', '❤️', '😂', '👏', '✨', '🙏'];

const el = {
  authPanel: document.querySelector('#auth-panel'),
  appPanel: document.querySelector('#app-panel'),
  notebookStack: document.querySelector('.notebook-stack'),
  notebookSheet: document.querySelector('.notebook-sheet'),
  createForm: document.querySelector('#create-form'),
  joinForm: document.querySelector('#join-form'),
  entryForm: document.querySelector('#entry-form'),
  joinRoomCode: document.querySelector('#join-room-code'),
  roomMeta: document.querySelector('#room-meta'),
  pageStamp: document.querySelector('#page-stamp'),
  roomTitle: document.querySelector('#room-title'),
  inviteLink: document.querySelector('#invite-link'),
  copyInvite: document.querySelector('#copy-invite'),
  monthLabel: document.querySelector('#month-label'),
  calendar: document.querySelector('#calendar'),
  dailyPage: document.querySelector('#daily-page'),
  pageLabel: document.querySelector('#page-label'),
  prevPage: document.querySelector('#prev-page'),
  nextPage: document.querySelector('#next-page'),
  lotteryPanel: document.querySelector('#lottery-panel'),
  lotteryStatus: document.querySelector('#lottery-status'),
  drawLottery: document.querySelector('#draw-lottery'),
  notice: document.querySelector('#notice'),
  prevMonth: document.querySelector('#prev-month'),
  nextMonth: document.querySelector('#next-month')
};

function notice(message, type = 'ok') {
  el.notice.textContent = message;
  el.notice.className = `notice show ${type}`;
  setTimeout(() => {
    el.notice.className = 'notice';
  }, 2500);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || '通信エラーが発生しました');
  }
  return data;
}

function updateMeta() {
  el.roomMeta.textContent = state.roomCode
    ? `参加中: ${state.roomName} (${state.roomCode}) / ${state.nickname}`
    : 'ルーム未参加';

  el.roomTitle.textContent = `${state.roomName} (${state.roomCode})`;
  el.inviteLink.textContent = state.inviteUrl;
}

function saveAuth() {
  localStorage.setItem(
    'exchange-diary-auth',
    JSON.stringify({
      token: state.token,
      roomCode: state.roomCode,
      roomName: state.roomName,
      nickname: state.nickname,
      inviteUrl: state.inviteUrl
    })
  );
}

function restoreAuth() {
  const saved = localStorage.getItem('exchange-diary-auth');
  if (!saved) return;

  try {
    const auth = JSON.parse(saved);
    state.token = auth.token || '';
    state.roomCode = auth.roomCode || '';
    state.roomName = auth.roomName || '';
    state.nickname = auth.nickname || '';
    state.inviteUrl = auth.inviteUrl || '';
  } catch {
    localStorage.removeItem('exchange-diary-auth');
  }
}

function openAppPanel() {
  el.authPanel.classList.add('hidden');
  el.appPanel.classList.remove('hidden');
  updateMeta();
}

function openAuthPanel() {
  el.authPanel.classList.remove('hidden');
  el.appPanel.classList.add('hidden');
}

function setEntries(entries) {
  const currentDate = getDayPages()[state.dayPageIndex]?.date || null;
  state.entries = entries.slice().sort((a, b) => {
    if (a.date === b.date) return a.createdAt < b.createdAt ? 1 : -1;
    return a.date < b.date ? 1 : -1;
  });

  const pages = getDayPages();
  if (pages.length === 0) {
    state.dayPageIndex = 0;
    return;
  }

  const sameDateIndex = currentDate ? pages.findIndex((page) => page.date === currentDate) : -1;
  if (sameDateIndex >= 0) {
    state.dayPageIndex = sameDateIndex;
  } else {
    state.dayPageIndex = Math.min(state.dayPageIndex, pages.length - 1);
  }
}

function getDayPages() {
  const map = new Map();
  for (const entry of state.entries) {
    if (!map.has(entry.date)) {
      map.set(entry.date, []);
    }
    map.get(entry.date).push(entry);
  }

  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, dayEntries]) => ({ date, entries: dayEntries }));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowKey() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function getAssignment(date) {
  const item = state.lotteryAssignments?.[date];
  if (!item || typeof item !== 'object') return null;
  const winners = Array.isArray(item.winners)
    ? item.winners
    : item.winner
      ? [item.winner]
      : [];
  if (winners.length === 0) return null;
  return item;
}

function canPostOn(date, nickname) {
  const assignment = getAssignment(date);
  if (!assignment) return true;
  const winners = Array.isArray(assignment.winners)
    ? assignment.winners
    : assignment.winner
      ? [assignment.winner]
      : [];
  return winners.includes(nickname);
}

function renderBookPage() {
  const pages = getDayPages();

  if (pages.length === 0) {
    el.pageLabel.textContent = '0 / 0';
    el.prevPage.disabled = true;
    el.nextPage.disabled = true;
    el.dailyPage.innerHTML = '<div class="empty-page">まだ日記ページがありません。</div>';
    return;
  }

  state.dayPageIndex = Math.max(0, Math.min(state.dayPageIndex, pages.length - 1));
  const page = pages[state.dayPageIndex];

  const html = `
    <div class="day-page-head">
      <h4>${page.date}</h4>
      <span class="count">${page.entries.length} entries</span>
    </div>
    ${page.entries
      .map((entry) => {
        const mediaHtml = (entry.media || [])
          .map((media) => {
            if (media.type.startsWith('image/')) {
              return `<img src="${media.url}" alt="${media.name || 'image'}" loading="lazy" />`;
            }
            if (media.type.startsWith('video/')) {
              return `<video src="${media.url}" controls preload="metadata"></video>`;
            }
            return `<a href="${media.url}" target="_blank" rel="noreferrer">${media.name || '添付ファイル'}</a>`;
          })
          .join('');

        const reactionHtml = REACTION_EMOJIS.map((emoji) => {
          const users = Array.isArray(entry.reactions?.[emoji]) ? entry.reactions[emoji] : [];
          const count = users.length;
          const active = users.includes(state.nickname);
          const activeClass = active ? 'active' : '';
          return `
            <button
              type="button"
              class="reaction-btn ${activeClass}"
              data-entry-id="${entry.id}"
              data-emoji="${emoji}"
              aria-label="reaction ${emoji}"
            >
              <span class="emoji">${emoji}</span>
              <span class="count">${count}</span>
            </button>
          `;
        }).join('');

        return `
          <article class="day-entry">
            <div class="day-entry-head">
              <strong>${escapeHtml(entry.author)}</strong>
              <span>${new Date(entry.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <p>${escapeHtml(entry.body || '')}</p>
            ${mediaHtml ? `<div class="media-row">${mediaHtml}</div>` : ''}
            <div class="reaction-row">${reactionHtml}</div>
          </article>
        `;
      })
      .join('')}
  `;

  el.pageLabel.textContent = `${state.dayPageIndex + 1} / ${pages.length}`;
  el.prevPage.disabled = state.dayPageIndex === 0;
  el.nextPage.disabled = state.dayPageIndex === pages.length - 1;
  el.dailyPage.innerHTML = html;
}

function renderCalendar() {
  const year = state.monthCursor.getFullYear();
  const month = state.monthCursor.getMonth();
  const first = new Date(year, month, 1);
  const firstWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  el.monthLabel.textContent = `${year}年 ${month + 1}月`;

  const names = ['日', '月', '火', '水', '木', '金', '土'];
  const items = [];
  names.forEach((name) => {
    items.push(`<div class="day-name">${name}</div>`);
  });

  const postedDates = new Set(state.entries.map((entry) => entry.date));
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);

  for (let i = 0; i < firstWeekday; i += 1) {
    items.push(`<div class="day muted">${prevDays - firstWeekday + i + 1}</div>`);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const classes = ['day'];
    if (postedDates.has(key)) classes.push('has-entry');
    if (key === todayKey) classes.push('today');
    if (postedDates.has(key)) {
      items.push(`<button type="button" class="${classes.join(' ')}" data-date="${key}">${day}</button>`);
    } else {
      items.push(`<div class="${classes.join(' ')}">${day}</div>`);
    }
  }

  while ((items.length - 7) % 7 !== 0) {
    items.push('<div class="day muted"></div>');
  }

  el.calendar.innerHTML = items.join('');
}

function render() {
  const total = state.entries.length;
  const pages = getDayPages().length;
  const page = Math.max(1, pages);
  if (el.pageStamp) {
    el.pageStamp.textContent = `PAGE ${page} · ENTRIES ${total}`;
  }
  renderBookPage();
  renderCalendar();
  renderLottery();
}

function updateEntryReactions(entryId, reactions) {
  const index = state.entries.findIndex((entry) => entry.id === entryId);
  if (index < 0) return;
  state.entries[index] = {
    ...state.entries[index],
    reactions: reactions || {}
  };
}

async function refreshRoom() {
  const data = await api(`/api/rooms/${state.roomCode}`);
  state.roomName = data.room.name;
  state.members = Array.isArray(data.room.members) ? data.room.members : [];
  state.lotteryAssignments = data.room.lotteryAssignments || {};
  setEntries(data.entries);
  saveAuth();
  updateMeta();
  render();
}

function renderLottery() {
  if (!el.lotteryStatus || !el.drawLottery || !el.entryForm) return;

  const nextDate = tomorrowKey();
  const currentDateInput = el.entryForm.querySelector('input[name="date"]');
  const submitButton = el.entryForm.querySelector('button[type="submit"]');
  const hint = el.entryForm.querySelector('.hint');

  const next = getAssignment(nextDate);
  if (next) {
    const winners = Array.isArray(next.winners)
      ? next.winners
      : next.winner
        ? [next.winner]
        : [];
    el.lotteryStatus.textContent = `明日(${nextDate})の担当: ${winners.join(' / ')}`;
  } else {
    el.lotteryStatus.textContent = `明日(${nextDate})の担当: 未抽選`;
  }

  const chosenDate = currentDateInput?.value || todayKey();
  const assigned = getAssignment(chosenDate);
  if (submitButton && hint) {
    const winners = assigned
      ? Array.isArray(assigned.winners)
        ? assigned.winners
        : assigned.winner
          ? [assigned.winner]
          : []
      : [];
    if (winners.length > 0 && !winners.includes(state.nickname)) {
      submitButton.disabled = true;
      hint.textContent = `${chosenDate} の担当は ${winners.join(' / ')} さんです。担当者のみ投稿できます。`;
    } else {
      submitButton.disabled = false;
      hint.textContent = '画像/動画だけでも投稿できます。';
    }
  }
}

function startPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
  }
  state.pollTimer = setInterval(() => {
    if (!state.token || !state.roomCode) return;
    refreshRoom().catch(() => {
      // ignore polling errors
    });
  }, 5000);
}

async function uploadMedia(file) {
  const res = await fetch(`/api/media/upload?filename=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: {
      'content-type': file.type || 'application/octet-stream'
    },
    body: file
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'メディアのアップロードに失敗しました');
  }

  return {
    name: data.name || file.name,
    type: data.type || file.type || 'application/octet-stream',
    url: data.url
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function handleCreate(event) {
  event.preventDefault();
  const formData = new FormData(el.createForm);

  const data = await api('/api/rooms/create', {
    method: 'POST',
    body: JSON.stringify({
      nickname: formData.get('nickname'),
      roomName: formData.get('roomName')
    })
  });

  state.token = data.token;
  state.roomCode = data.roomCode;
  state.roomName = data.roomName;
  state.nickname = data.nickname;
  state.inviteUrl = `${location.origin}${data.inviteUrl}`;

  saveAuth();
  openAppPanel();
  await refreshRoom();
  startPolling();
  notice('ルームを作成しました');
}

async function handleJoin(event) {
  event.preventDefault();
  const formData = new FormData(el.joinForm);

  const data = await api('/api/rooms/join', {
    method: 'POST',
    body: JSON.stringify({
      nickname: formData.get('nickname'),
      roomCode: formData.get('roomCode')
    })
  });

  state.token = data.token;
  state.roomCode = data.roomCode;
  state.roomName = data.roomName;
  state.nickname = data.nickname;
  state.inviteUrl = `${location.origin}${data.inviteUrl}`;

  saveAuth();
  openAppPanel();
  await refreshRoom();
  startPolling();
  notice('ルームに参加しました');
}

async function handlePostEntry(event) {
  event.preventDefault();

  const formData = new FormData(el.entryForm);
  const files = Array.from(formData.getAll('media')).filter((item) => item instanceof File && item.size > 0);

  if (files.length > 3) {
    notice('添付は最大3件までです', 'err');
    return;
  }

  const media = [];
  for (const file of files) {
    if (file.size > 4 * 1024 * 1024) {
      throw new Error(`${file.name} は4MB以下にしてください`);
    }
    media.push(await uploadMedia(file));
  }

  const dateValue = String(formData.get('date') || '');
  const body = String(formData.get('body') || '');

  if (!canPostOn(dateValue, state.nickname)) {
    const assigned = getAssignment(dateValue);
    const winners = assigned
      ? Array.isArray(assigned.winners)
        ? assigned.winners
        : assigned.winner
          ? [assigned.winner]
          : []
      : [];
    throw new Error(`${dateValue} の担当は ${winners.join(' / ')} さんです`);
  }

  await api(`/api/rooms/${state.roomCode}/entries`, {
    method: 'POST',
    body: JSON.stringify({ date: dateValue, body, media })
  });

  el.entryForm.reset();
  await refreshRoom();
  notice('投稿しました');
}

async function drawTomorrowLottery() {
  const date = tomorrowKey();
  const data = await api(`/api/rooms/${state.roomCode}/lottery/draw`, {
    method: 'POST',
    body: JSON.stringify({ date })
  });

  const winners = Array.isArray(data?.assignment?.winners)
    ? data.assignment.winners
    : data?.assignment?.winner
      ? [data.assignment.winner]
      : [];
  if (data?.assignment?.date && winners.length > 0) {
    state.lotteryAssignments[data.assignment.date] = {
      winners,
      drawnBy: data.assignment.drawnBy || '',
      drawnAt: data.assignment.drawnAt || ''
    };
    renderLottery();
    notice(`明日(${data.assignment.date})の担当は ${winners.join(' / ')} さんです`);
  }
}

async function toggleReaction(entryId, emoji) {
  const data = await api(`/api/rooms/${state.roomCode}/entries/${entryId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji })
  });
  updateEntryReactions(data.entryId, data.reactions);
  renderBookPage();
}

function applyInviteFromUrl() {
  const params = new URLSearchParams(location.search);
  const room = (params.get('room') || '').trim().toUpperCase();
  if (room) {
    el.joinRoomCode.value = room;
  }
}

function bindEvents() {
  el.createForm.addEventListener('submit', (event) => {
    handleCreate(event).catch((err) => notice(err.message, 'err'));
  });

  el.joinForm.addEventListener('submit', (event) => {
    handleJoin(event).catch((err) => notice(err.message, 'err'));
  });

  el.entryForm.addEventListener('submit', (event) => {
    handlePostEntry(event).catch((err) => notice(err.message, 'err'));
  });

  const dateField = el.entryForm.querySelector('input[name="date"]');
  if (dateField) {
    dateField.addEventListener('change', () => {
      renderLottery();
    });
  }

  if (el.drawLottery) {
    el.drawLottery.addEventListener('click', () => {
      drawTomorrowLottery().catch((err) => notice(err.message, 'err'));
    });
  }

  el.copyInvite.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.inviteUrl);
      notice('招待リンクをコピーしました');
    } catch {
      notice('コピーに失敗しました', 'err');
    }
  });

  el.prevMonth.addEventListener('click', () => {
    state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
    renderCalendar();
  });

  el.nextMonth.addEventListener('click', () => {
    state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
    renderCalendar();
  });

  el.prevPage.addEventListener('click', () => {
    const totalPages = getDayPages().length;
    if (totalPages === 0) return;
    state.dayPageIndex = Math.max(0, state.dayPageIndex - 1);
    renderBookPage();
  });

  el.nextPage.addEventListener('click', () => {
    const totalPages = getDayPages().length;
    if (totalPages === 0) return;
    state.dayPageIndex = Math.min(totalPages - 1, state.dayPageIndex + 1);
    renderBookPage();
  });

  el.calendar.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const date = target.dataset.date;
    if (!date) return;

    const pages = getDayPages();
    const index = pages.findIndex((page) => page.date === date);
    if (index >= 0) {
      state.dayPageIndex = index;
      renderBookPage();
    }
  });

  el.dailyPage.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('.reaction-btn');
    if (!(button instanceof HTMLButtonElement)) return;
    const entryId = button.dataset.entryId;
    const emoji = button.dataset.emoji;
    if (!entryId || !emoji) return;

    toggleReaction(entryId, emoji).catch((err) => notice(err.message, 'err'));
  });

  if (dateField) {
    dateField.value = new Date().toISOString().slice(0, 10);
  }
}

async function bootstrap() {
  bindEvents();
  applyInviteFromUrl();
  restoreAuth();

  if (!state.token || !state.roomCode) {
    openAuthPanel();
    updateMeta();
    return;
  }

  try {
    openAppPanel();
    await refreshRoom();
    startPolling();
  } catch {
    localStorage.removeItem('exchange-diary-auth');
    state.token = '';
    state.roomCode = '';
    openAuthPanel();
    updateMeta();
  }
}

bootstrap();
