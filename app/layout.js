import './globals.css';

export const metadata = {
  title: 'FantaMotoGP 2026',
  description: 'Il vostro mondiale. Il vostro regolamento. Un solo Re.',
  manifest: '/manifest.webmanifest',
  themeColor: '#090b10'
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
