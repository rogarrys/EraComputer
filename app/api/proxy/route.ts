import { NextRequest, NextResponse } from 'next/server';

// Proxy pour charger n'importe quel site dans le DHTML de GMod
// Contourne les restrictions X-Frame-Options / CORS
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');

  if (!url) {
    return new NextResponse('<h1>Erreur: pas d\'URL</h1>', {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      redirect: 'follow',
    });

    const contentType = response.headers.get('content-type') || 'text/html';
    const body = await response.arrayBuffer();

    // Si c'est du HTML, on injecte une balise <base> pour que les liens relatifs marchent
    if (contentType.includes('text/html')) {
      let html = new TextDecoder().decode(body);

      // Extraire l'origine de l'URL cible
      const parsedUrl = new URL(url);
      const base = parsedUrl.origin;

      // Injecter <base> pour les ressources relatives
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head><base href="${base}/">`);
      } else if (html.includes('<HEAD>')) {
        html = html.replace('<HEAD>', `<HEAD><base href="${base}/">`);
      } else {
        html = `<base href="${base}/">` + html;
      }

      return new NextResponse(html, {
        status: response.status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Pour les autres types (images, CSS, JS), renvoyer tel quel
    return new NextResponse(body, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (e: any) {
    return new NextResponse(
      `<html><body style="background:#111;color:#f55;font-family:Arial;padding:40px;text-align:center">
        <h2>Impossible de charger la page</h2>
        <p style="color:#888">${e.message || 'Erreur inconnue'}</p>
        <p style="color:#555;font-size:0.8rem">${url}</p>
      </body></html>`,
      {
        status: 502,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  }
}
