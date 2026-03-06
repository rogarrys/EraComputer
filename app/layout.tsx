import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Era Computer',
  description: 'Ordinateur synchronisé pour Garry\'s Mod',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body suppressHydrationWarning
        style={{ margin: 0, padding: 0, background: '#000', color: '#fff', fontFamily: 'Arial, sans-serif', overflow: 'hidden' }}
      >{children}</body>
    </html>
  );
}
