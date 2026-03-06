/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Autoriser l'affichage dans les iframes (DHTML de GMod)
          { key: 'Content-Security-Policy', value: "frame-ancestors *" },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      {
        source: '/api/proxy',
        headers: [
          // Le proxy ne doit avoir aucune restriction d'iframe
          { key: 'X-Frame-Options', value: '' },
          { key: 'Content-Security-Policy', value: '' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
    ];
  },
}

module.exports = nextConfig
