import crypto from 'node:crypto';
import { DAILY_WINNER_COUNT } from './constants.js';

export function normalizeRoomCode(roomCode) {
  return String(roomCode || '').trim().toUpperCase();
}

export function normalizeNickname(nickname) {
  return String(nickname || '').trim();
}

export function isDateKey(dateKey) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || '').trim());
}

export function getTomorrowDateKey() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function pickWinners(members) {
  const pool = members.slice();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(1, Math.min(DAILY_WINNER_COUNT, pool.length)));
}

export function newEntryId() {
  return crypto.randomUUID();
}

export function normalizeEntryReactions(entry) {
  if (!entry.reactions || typeof entry.reactions !== 'object') {
    entry.reactions = {};
  }

  for (const key of Object.keys(entry.reactions)) {
    if (!Array.isArray(entry.reactions[key])) {
      delete entry.reactions[key];
      continue;
    }
    entry.reactions[key] = entry.reactions[key].map((name) => normalizeNickname(name)).filter(Boolean);
  }
}

export function normalizeRoom(room, roomCode) {
  if (!room || typeof room !== 'object') {
    return {
      code: roomCode,
      name: '交換日記ルーム',
      createdAt: new Date().toISOString(),
      hostNickname: '',
      members: [],
      entries: [],
      lotteryAssignments: {}
    };
  }

  room.code = normalizeRoomCode(room.code || roomCode);
  room.name = String(room.name || '交換日記ルーム');
  room.createdAt = room.createdAt || new Date().toISOString();
  room.members = Array.isArray(room.members) ? room.members.map((m) => normalizeNickname(m)).filter(Boolean) : [];
  room.hostNickname = normalizeNickname(room.hostNickname || '');
  if (!room.hostNickname && room.members.length > 0) {
    room.hostNickname = room.members[0];
  }
  room.entries = Array.isArray(room.entries) ? room.entries : [];
  room.lotteryAssignments = room.lotteryAssignments && typeof room.lotteryAssignments === 'object'
    ? room.lotteryAssignments
    : {};

  for (const date of Object.keys(room.lotteryAssignments)) {
    if (!isDateKey(date)) {
      delete room.lotteryAssignments[date];
      continue;
    }
    const item = room.lotteryAssignments[date];
    const winners = Array.isArray(item?.winners)
      ? item.winners.map((w) => normalizeNickname(w)).filter(Boolean)
      : item?.winner
        ? [normalizeNickname(item.winner)].filter(Boolean)
        : [];

    if (winners.length === 0) {
      delete room.lotteryAssignments[date];
      continue;
    }

    room.lotteryAssignments[date] = {
      winners: Array.from(new Set(winners)),
      drawnBy: normalizeNickname(item.drawnBy || ''),
      drawnAt: item.drawnAt || new Date().toISOString()
    };
  }

  for (const entry of room.entries) {
    normalizeEntryReactions(entry);
    if (!Array.isArray(entry.media)) {
      entry.media = [];
    }
  }

  return room;
}
