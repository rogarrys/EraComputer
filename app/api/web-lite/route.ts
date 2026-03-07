import { NextRequest, NextResponse } from 'next/server';
import { requestExternal } from '@/lib/external-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

function htmlResponse(html: string, status = 200) {
  return new NextResponse(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
    },
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeLiteUrl(appOrigin: string, url: string) {
  return `${appOrigin}/api/web-lite?url=${encodeURIComponent(url)}`;
}

function makeProxyUrl(appOrigin: string, url: string) {
  return `${appOrigin}/api/proxy?url=${encodeURIComponent(url)}`;
}

function normalizeTarget(input: string) {
  const value = input.trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.includes('.')) return `https://${value}`;
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(value)}`;
}

function absolutize(url: string, baseUrl: string) {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<canvas[\s\S]*?<\/canvas>/gi, '')
    .replace(/<video[\s\S]*?<\/video>/gi, '')
    .replace(/<audio[\s\S]*?<\/audio>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<input[^>]*>/gi, '')
    .replace(/<button[\s\S]*?<\/button>/gi, '')
    .replace(/<textarea[\s\S]*?<\/textarea>/gi, '')
    .replace(/<select[\s\S]*?<\/select>/gi, '')
    .replace(/<meta[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, '')
    .replace(/<base[^>]*>/gi, '')
    .replace(/ on[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/ on[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/ on[a-z]+\s*=\s*[^\s>]+/gi, '');
}

function rewriteContent(html: string, pageUrl: string, appOrigin: string) {
  let content = stripHtml(html);

  content = content.replace(/(<a\s[^>]*?href\s*=\s*["'])(.*?)(["'])/gi, (_m, start, href, end) => {
    if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href.trim())) {
      return `${start}${href}${end}`;
    }
    const absolute = absolutize(href, pageUrl);
    return `${start}${makeLiteUrl(appOrigin, absolute)}${end}`;
  });

  content = content.replace(/(<img\s[^>]*?src\s*=\s*["'])(.*?)(["'])/gi, (_m, start, src, end) => {
    if (!src || /^(data:|blob:)/i.test(src.trim())) {
      return `${start}${src}${end}`;
    }
    const absolute = absolutize(src, pageUrl);
    return `${start}${makeProxyUrl(appOrigin, absolute)}${end}`;
  });

  content = content.replace(/(<source\s[^>]*?src\s*=\s*["'])(.*?)(["'])/gi, (_m, start, src, end) => {
    if (!src) return `${start}${src}${end}`;
    const absolute = absolutize(src, pageUrl);
    return `${start}${makeProxyUrl(appOrigin, absolute)}${end}`;
  });

  content = content.replace(/<a([^>]*)>/gi, '<a$1 target="_self" rel="noopener noreferrer">');
  return content;
}

function buildPage(params: {
  appOrigin: string;
  pageUrl: string;
  title: string;
  body: string;
  note?: string;
}) {
  const { appOrigin, pageUrl, title, body, note } = params;
  const safeTitle = escapeHtml(title || pageUrl);
  const safeUrl = escapeHtml(pageUrl);
  const home = makeLiteUrl(appOrigin, 'https://html.duckduckgo.com/html/');

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; background: #0b1020; color: #e5eefc; font-family: Arial, Helvetica, sans-serif; }
    .topbar { position: sticky; top: 0; z-index: 10; background: linear-gradient(180deg, #11182d, #0b1020); border-bottom: 1px solid rgba(255,255,255,0.08); padding: 12px 16px; }
    .title { font-size: 18px; font-weight: 700; color: #7dd3fc; margin-bottom: 4px; }
    .url { font-size: 12px; color: #8ea3c2; word-break: break-all; }
    .note { margin-top: 8px; font-size: 12px; color: #facc15; }
    .actions { margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; }
    .btn { display: inline-block; text-decoration: none; background: #16213a; color: #dbeafe; padding: 7px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); font-size: 12px; }
    .content { padding: 18px; max-width: 980px; margin: 0 auto; line-height: 1.6; }
    .content img { max-width: 100%; height: auto; border-radius: 8px; background: #111827; }
    .content pre, .content code { white-space: pre-wrap; word-break: break-word; }
    .content pre { background: #111827; color: #dbeafe; padding: 12px; border-radius: 8px; overflow: auto; }
    .content table { width: 100%; border-collapse: collapse; display: block; overflow: auto; }
    .content th, .content td { border: 1px solid rgba(255,255,255,0.08); padding: 8px; }
    .content blockquote { margin: 16px 0; padding-left: 12px; border-left: 3px solid #38bdf8; color: #cbd5e1; }
    .content a { color: #7dd3fc; }
    .content h1, .content h2, .content h3 { color: #f8fafc; }
    .empty { padding: 64px 20px; text-align: center; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="title">Web Lite — ${safeTitle}</div>
    <div class="url">${safeUrl}</div>
    ${note ? `<div class="note">${escapeHtml(note)}</div>` : ''}
    <div class="actions">
      <a class="btn" href="${home}">Accueil</a>
      <a class="btn" href="${makeLiteUrl(appOrigin, pageUrl)}">Recharger</a>
      <a class="btn" href="${makeProxyUrl(appOrigin, pageUrl)}">Mode brut</a>
    </div>
  </div>
  <div class="content">${body || '<div class="empty">Aucun contenu lisible trouvé sur cette page.</div>'}</div>
  <script>
    (function(){
      try {
        window.parent.postMessage({ type: 'era-proxy-nav', url: ${JSON.stringify(pageUrl)} }, '*');
      } catch (e) {}
    })();
  </script>
</body>
</html>`;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const appOrigin = req.nextUrl.origin;
  const rawUrl = req.nextUrl.searchParams.get('url') || '';
  const url = normalizeTarget(rawUrl);

  if (!url) {
    return htmlResponse(buildPage({
      appOrigin,
      pageUrl: 'home',
      title: 'Accueil',
      note: 'Tape une URL ou une recherche dans la barre du navigateur Era.',
      body: `
        <div class="empty">
          <h2>Web Lite</h2>
          <p>Alternative fiable au vrai navigateur pour GMod.</p>
          <p>Conseillé : Wikipedia, GitHub, blogs, forums, documentation, old.reddit.</p>
        </div>`,
    }));
  }

  try {
    const response = await requestExternal(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,image/*;q=0.7,*/*;q=0.5',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    const finalUrl = response.url || url;
    const contentType = response.headers['content-type'] || 'text/html';

    if (contentType.startsWith('image/')) {
      const title = new URL(finalUrl).pathname.split('/').pop() || 'Image';
      return htmlResponse(buildPage({
        appOrigin,
        pageUrl: finalUrl,
        title,
        body: `<p><img src="${makeProxyUrl(appOrigin, finalUrl)}" alt="${escapeHtml(title)}"></p>`,
      }));
    }

    if (contentType.includes('text/plain')) {
      const text = escapeHtml(response.body.toString('utf8'));
      return htmlResponse(buildPage({
        appOrigin,
        pageUrl: finalUrl,
        title: finalUrl,
        body: `<pre>${text}</pre>`,
      }));
    }

    const originalHtml = response.body.toString('utf8');
    const titleMatch = originalHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const bodyMatch = originalHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim() || new URL(finalUrl).hostname;
    const sourceBody = bodyMatch?.[1] || originalHtml;
    const rewritten = rewriteContent(sourceBody, finalUrl, appOrigin);

    return htmlResponse(buildPage({
      appOrigin,
      pageUrl: finalUrl,
      title,
      note: 'Mode simplifié : le JavaScript lourd des sites est désactivé pour rester compatible avec GMod.',
      body: rewritten,
    }));
  } catch (error: any) {
    return htmlResponse(buildPage({
      appOrigin,
      pageUrl: url,
      title: 'Erreur de chargement',
      note: error?.message || 'Erreur inconnue',
      body: `
        <div class="empty">
          <h2>Impossible de charger cette page</h2>
          <p>Essaie une autre URL, ou utilise un site plus statique.</p>
        </div>`,
    }), 502);
  }
}
