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
    <html lang="fr">
      <head>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: #000; color: #fff; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; overflow: hidden; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
