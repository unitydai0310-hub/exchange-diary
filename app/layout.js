import './globals.css';

export const metadata = {
  title: 'Exchange Diary Book',
  description: '日記を本のページのようにめくって読める交換日記アプリ'
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
