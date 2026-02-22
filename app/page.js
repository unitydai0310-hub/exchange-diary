'use client';

import { useEffect } from 'react';

export default function HomePage() {
  useEffect(() => {
    const target = `/index.html${window.location.search || ''}`;
    window.location.replace(target);
  }, []);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <p>読み込み中...</p>
    </main>
  );
}
