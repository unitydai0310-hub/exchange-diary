'use client';

import { useEffect, useMemo, useState } from 'react';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '👏', '✨', '🙏'];

function formatDateLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function HomePage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reacting, setReacting] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [error, setError] = useState('');
  const [nickname, setNickname] = useState('');

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    title: '',
    body: ''
  });

  const pages = useMemo(() => {
    if (entries.length === 0) {
      return [
        {
          id: 'empty',
          date: '',
          title: 'まだページがありません',
          body: '左側のフォームから日記を追加してください。1日1ページで保存されます。',
          createdAt: ''
        }
      ];
    }
    return entries;
  }, [entries]);

  const current = pages[Math.min(pageIndex, pages.length - 1)];

  async function loadEntries() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/entries', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '読み込みに失敗しました');
      const sorted = (data.entries || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
      setEntries(sorted);
      setPageIndex(0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEntries();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('exchange-diary-nickname');
    if (saved) setNickname(saved);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存に失敗しました');

      setEntries((prev) => [data.entry, ...prev].sort((a, b) => (a.date < b.date ? 1 : -1)));
      setPageIndex(0);
      setForm((prev) => ({ ...prev, title: '', body: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleReaction(emoji) {
    if (!current?.id || current.id === 'empty') return;
    if (!nickname.trim()) {
      setError('リアクションにはニックネームが必要です。');
      return;
    }

    setReacting(true);
    setError('');
    try {
      const actor = nickname.trim();
      localStorage.setItem('exchange-diary-nickname', actor);
      const res = await fetch('/api/entries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId: current.id, emoji, actor })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'リアクション更新に失敗しました');

      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === data.entryId
            ? {
                ...entry,
                reactions: data.reactions || {}
              }
            : entry
        )
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setReacting(false);
    }
  }

  return (
    <main className="book-app">
      <section className="left-panel">
        <h1>交換日記ノート</h1>
        <p className="desc">1日1ページ。アニメーションなしで日付ページを切り替えます。</p>

        <form className="entry-form" onSubmit={handleSubmit}>
          <label>
            ニックネーム
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={24}
              placeholder="リアクション用ニックネーム"
              required
            />
          </label>

          <label>
            日付
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
              required
            />
          </label>

          <label>
            タイトル
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              maxLength={60}
              placeholder="今日のタイトル"
            />
          </label>

          <label>
            本文
            <textarea
              value={form.body}
              onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
              rows={5}
              maxLength={3000}
              placeholder="今日のできごとを書いてください"
              required
            />
          </label>

          <button type="submit" disabled={submitting}>
            {submitting ? '保存中...' : 'ページを追加'}
          </button>
        </form>

        <div className="book-nav">
          <button type="button" onClick={() => setPageIndex((p) => Math.max(0, p - 1))} disabled={pageIndex === 0}>
            前の日
          </button>
          <span>
            {pageIndex + 1} / {pages.length}
          </span>
          <button
            type="button"
            onClick={() => setPageIndex((p) => Math.min(pages.length - 1, p + 1))}
            disabled={pageIndex >= pages.length - 1}
          >
            次の日
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="book-stage">
        {loading ? (
          <p className="loading">読み込み中...</p>
        ) : (
          <article className="static-page">
            <div className="sheet-inner">
              {current.date ? <p className="entry-date">{formatDateLabel(current.date)}</p> : null}
              <h2 className="entry-title">{current.title || 'Diary'}</h2>
              <p className="entry-body">{current.body}</p>
              {current.createdAt ? (
                <p className="entry-meta">created {new Date(current.createdAt).toLocaleString('ja-JP')}</p>
              ) : null}
              {current.id !== 'empty' ? (
                <div className="reaction-row">
                  {REACTION_EMOJIS.map((emoji) => {
                    const users = Array.isArray(current.reactions?.[emoji]) ? current.reactions[emoji] : [];
                    const active = nickname ? users.includes(nickname.trim()) : false;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        className={`reaction-btn ${active ? 'active' : ''}`}
                        onClick={() => handleToggleReaction(emoji)}
                        disabled={reacting}
                        aria-label={`reaction ${emoji}`}
                      >
                        <span>{emoji}</span>
                        <span>{users.length}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </article>
        )}
      </section>
    </main>
  );
}
