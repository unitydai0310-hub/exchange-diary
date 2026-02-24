const state = {
  token: '',
  roomCode: '',
  roomName: '',
  nickname: '',
  inviteUrl: '',
  savedRooms: [],
  hostNickname: '',
  pushEnabled: false,
  pushSupported: false,
  members: [],
  lotteryAssignments: {},
  entries: [],
  dayPageIndex: 0,
  monthCursor: new Date(),
  pollTimer: null
};

const REACTION_EMOJIS = ['👍', '❤️', '😂', '👏', '✨', '🙏'];
const ROOM_STORE_KEY = 'exchange-diary-rooms';
const AUTH_STORE_KEY = 'exchange-diary-auth';

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
  pushToggle: document.querySelector('#push-toggle'),
  roomSwitcher: document.querySelector('#room-switcher'),
  openAuth: document.querySelector('#open-auth'),
  backToApp: document.querySelector('#back-to-app'),
  monthLabel: document.querySelector('#month-label'),
  calendar: document.querySelector('#calendar'),
  dailyPage: document.querySelector('#daily-page'),
  pageLabel: document.querySelector('#page-label'),
  prevPage: document.querySelector('#prev-page'),
  nextPage: document.querySelector('#next-page'),
  lotteryPanel: document.querySelector('#lottery-panel'),
  lotteryStatus: document.querySelector('#lottery-status'),
  drawLottery: document.querySelector('#draw-lottery'),
  memberCount: document.querySelector('#member-count'),
  memberList: document.querySelector('#member-list'),
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

function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function updateMeta() {
  el.roomMeta.textContent = state.roomCode
    ? `参加中: ${state.roomName} (${state.roomCode}) / ${state.nickname}`
    : 'ルーム未参加';

  el.roomTitle.textContent = `${state.roomName} (${state.roomCode})`;
  el.inviteLink.textContent = state.inviteUrl;
}

function normalizeSavedRoom(item) {
  const roomCode = String(item?.roomCode || '').trim().toUpperCase();
  const token = String(item?.token || '').trim();
  const nickname = String(item?.nickname || '').trim();
  if (!roomCode || !token || !nickname) return null;

  return {
    roomCode,
    token,
    nickname,
    roomName: String(item?.roomName || '').trim() || roomCode,
    inviteUrl: String(item?.inviteUrl || '').trim(),
    lastUsedAt: Number(item?.lastUsedAt || Date.now())
  };
}

function loadSavedRooms() {
  const raw = localStorage.getItem(ROOM_STORE_KEY);
  if (!raw) {
    state.savedRooms = [];
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed.map(normalizeSavedRoom).filter(Boolean) : [];
    state.savedRooms = list.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  } catch {
    state.savedRooms = [];
    localStorage.removeItem(ROOM_STORE_KEY);
  }
}

function persistSavedRooms() {
  localStorage.setItem(ROOM_STORE_KEY, JSON.stringify(state.savedRooms));
}

function upsertCurrentRoom() {
  if (!state.roomCode || !state.token || !state.nickname) return;
  const payload = normalizeSavedRoom({
    roomCode: state.roomCode,
    token: state.token,
    nickname: state.nickname,
    roomName: state.roomName,
    inviteUrl: state.inviteUrl,
    lastUsedAt: Date.now()
  });
  if (!payload) return;

  const index = state.savedRooms.findIndex((item) => item.roomCode === payload.roomCode);
  if (index >= 0) {
    state.savedRooms[index] = payload;
  } else {
    state.savedRooms.push(payload);
  }
  state.savedRooms.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  persistSavedRooms();
}

function removeSavedRoom(roomCode) {
  state.savedRooms = state.savedRooms.filter((item) => item.roomCode !== roomCode);
  persistSavedRooms();
}

function saveAuth() {
  upsertCurrentRoom();
  localStorage.setItem(
    AUTH_STORE_KEY,
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
  loadSavedRooms();
  const saved = localStorage.getItem(AUTH_STORE_KEY);

  if (saved) {
    try {
      const auth = JSON.parse(saved);
      state.token = auth.token || '';
      state.roomCode = auth.roomCode || '';
      state.roomName = auth.roomName || '';
      state.nickname = auth.nickname || '';
      state.inviteUrl = auth.inviteUrl || '';
    } catch {
      localStorage.removeItem(AUTH_STORE_KEY);
    }
  }

  if ((!state.token || !state.roomCode) && state.savedRooms.length > 0) {
    const latest = state.savedRooms[0];
    state.token = latest.token;
    state.roomCode = latest.roomCode;
    state.roomName = latest.roomName;
    state.nickname = latest.nickname;
    state.inviteUrl = latest.inviteUrl;
  }
}

function openAppPanel() {
  el.authPanel.classList.add('hidden');
  el.appPanel.classList.remove('hidden');
  if (el.backToApp) el.backToApp.classList.add('hidden');
  updateMeta();
}

function openAuthPanel() {
  el.authPanel.classList.remove('hidden');
  el.appPanel.classList.add('hidden');
  if (el.backToApp && state.roomCode) {
    el.backToApp.classList.remove('hidden');
  }
}

function renderRoomSwitcher() {
  if (!el.roomSwitcher) return;

  const options = state.savedRooms
    .map((item) => {
      const selected = item.roomCode === state.roomCode ? 'selected' : '';
      const label = `${item.roomName} (${item.roomCode}) / ${item.nickname}`;
      return `<option value="${item.roomCode}" ${selected}>${escapeHtml(label)}</option>`;
    })
    .join('');

  el.roomSwitcher.innerHTML = options || '<option value="">保存済みルームなし</option>';
  el.roomSwitcher.disabled = state.savedRooms.length <= 1;
}

async function switchRoom(roomCode) {
  const target = state.savedRooms.find((item) => item.roomCode === roomCode);
  if (!target) return;

  state.token = target.token;
  state.roomCode = target.roomCode;
  state.roomName = target.roomName;
  state.nickname = target.nickname;
  state.inviteUrl = target.inviteUrl || `${location.origin}/?room=${target.roomCode}`;
  state.hostNickname = '';
  state.entries = [];
  state.lotteryAssignments = {};
  state.dayPageIndex = 0;

  openAppPanel();
  try {
    await refreshRoom();
    startPolling();
    notice(`${state.roomName} に切り替えました`);
  } catch (error) {
    removeSavedRoom(roomCode);
    throw error;
  }
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
  renderMembers();
  renderRoomSwitcher();
  renderPushToggle();
}

function renderPushToggle() {
  if (!el.pushToggle) return;
  if (!state.pushSupported) {
    el.pushToggle.disabled = true;
    el.pushToggle.textContent = 'この端末は通知非対応';
    return;
  }

  el.pushToggle.disabled = false;
  el.pushToggle.textContent = state.pushEnabled ? '通知を無効化' : '通知を有効化';
}

function renderMembers() {
  if (!el.memberList || !el.memberCount) return;

  const members = Array.isArray(state.members) ? state.members : [];
  el.memberCount.textContent = `${members.length}名`;

  if (members.length === 0) {
    el.memberList.innerHTML = '<li class="member-item">メンバー情報がありません</li>';
    return;
  }

  el.memberList.innerHTML = members
    .map((name) => {
      const hostBadge = state.hostNickname && name === state.hostNickname
        ? '<span class="badge">HOST</span>'
        : '';
      return `<li class="member-item"><span>${escapeHtml(name)}</span>${hostBadge}</li>`;
    })
    .join('');
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
  state.hostNickname = String(data.room.hostNickname || '');
  state.pushEnabled = Boolean(data.room.mePushEnabled);
  state.members = Array.isArray(data.room.members) ? data.room.members : [];
  state.lotteryAssignments = data.room.lotteryAssignments || {};
  setEntries(data.entries);
  saveAuth();
  updateMeta();
  render();
}

function applySession(data) {
  state.token = data.token;
  state.roomCode = data.roomCode;
  state.roomName = data.roomName;
  state.nickname = data.nickname;
  state.inviteUrl = data.inviteUrl?.startsWith('http')
    ? data.inviteUrl
    : `${location.origin}${data.inviteUrl || `/?room=${data.roomCode}`}`;
  saveAuth();
  updateMeta();
  renderRoomSwitcher();
}

function renderLottery() {
  if (!el.lotteryStatus || !el.drawLottery || !el.entryForm) return;
  const isHost = state.hostNickname && state.nickname === state.hostNickname;

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
    const hostLabel = state.hostNickname ? `${state.hostNickname}（ホスト）` : 'ホスト';
    el.lotteryStatus.textContent = `明日(${nextDate})の担当: 未抽選（抽選可能: ${hostLabel}）`;
  }

  el.drawLottery.disabled = !isHost || Boolean(next);
  if (next) {
    el.drawLottery.textContent = '抽選済み';
  } else if (isHost) {
    el.drawLottery.textContent = '明日の担当を抽選';
  } else {
    el.drawLottery.textContent = 'ホストのみ抽選可能';
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

async function getServiceWorkerRegistration() {
  const reg = await navigator.serviceWorker.register('/sw.js');
  return reg;
}

async function getPushPublicKey() {
  const res = await fetch('/api/push/public-key');
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.publicKey) {
    throw new Error(data.error || '通知公開鍵の取得に失敗しました');
  }
  return data.publicKey;
}

async function enablePushForCurrentRoom() {
  if (!state.roomCode) throw new Error('ルームに参加してから設定してください');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('通知の許可が必要です');
  }

  const reg = await getServiceWorkerRegistration();
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    const publicKey = await getPushPublicKey();
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }

  await api(`/api/rooms/${state.roomCode}/push/subscription`, {
    method: 'POST',
    body: JSON.stringify({ subscription })
  });

  state.pushEnabled = true;
  renderPushToggle();
}

async function disablePushForCurrentRoom() {
  const reg = await getServiceWorkerRegistration();
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    state.pushEnabled = false;
    renderPushToggle();
    return;
  }

  await api(`/api/rooms/${state.roomCode}/push/subscription`, {
    method: 'DELETE',
    body: JSON.stringify({ endpoint: subscription.endpoint })
  });

  state.pushEnabled = false;
  renderPushToggle();
}

async function togglePushForCurrentRoom() {
  if (!state.pushSupported) {
    notice('この端末は通知に対応していません', 'err');
    return;
  }
  if (state.pushEnabled) {
    await disablePushForCurrentRoom();
    notice('通知を無効化しました');
  } else {
    await enablePushForCurrentRoom();
    notice('通知を有効化しました');
  }
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

  applySession(data);
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

  applySession(data);
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

  if (el.pushToggle) {
    el.pushToggle.addEventListener('click', () => {
      togglePushForCurrentRoom().catch((err) => notice(err.message, 'err'));
    });
  }

  if (el.roomSwitcher) {
    el.roomSwitcher.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      const nextRoomCode = target.value;
      if (!nextRoomCode || nextRoomCode === state.roomCode) return;
      switchRoom(nextRoomCode).catch((err) => notice(err.message, 'err'));
    });
  }

  if (el.openAuth) {
    el.openAuth.addEventListener('click', () => {
      openAuthPanel();
    });
  }

  if (el.backToApp) {
    el.backToApp.addEventListener('click', () => {
      openAppPanel();
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
  state.pushSupported = isPushSupported();
  bindEvents();
  applyInviteFromUrl();
  restoreAuth();
  renderRoomSwitcher();

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
    removeSavedRoom(state.roomCode);
    localStorage.removeItem(AUTH_STORE_KEY);
    state.token = '';
    state.roomCode = '';
    openAuthPanel();
    renderRoomSwitcher();
    updateMeta();
  }
}

bootstrap();
