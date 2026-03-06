import { NextRequest, NextResponse } from 'next/server';

// =============================================
// Proxy Web complet pour EraComputer
// - Récupère la page côté serveur (bypass CORS / X-Frame-Options)
// - Réécrit les liens pour rester dans le proxy
// - Injecte un intercepteur JS pour la navigation dynamique
// - Supprime les balises CSP qui bloquent le contenu
// =============================================

const PROXY = '/api/proxy?url=';

/** Rend une URL absolue puis la wrappe dans le proxy */
function proxyHref(href: string, baseUrl: string): string {
  if (!href) return href;
  const skip = /^(data:|blob:|javascript:|#|mailto:|tel:)/i;
  if (skip.test(href.trim())) return href;
  try {
    const abs = new URL(href, baseUrl).href;
    return PROXY + encodeURIComponent(abs);
  } catch {
    return href;
  }
}

/** Réécrit le HTML : liens, CSP, injection script */
function rewriteHtml(html: string, finalUrl: string): string {
  const origin = new URL(finalUrl).origin;

  // 1. Supprimer les balises <meta> CSP (bloquent nos scripts injectés)
  html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, '');

  // 2. Supprimer les <base> existants
  html = html.replace(/<base[^>]*>/gi, '');

  // 3. Réécrire <a href="..."> pour passer par le proxy
  html = html.replace(/(<a\s[^>]*?)(href\s*=\s*)(["'])(.*?)\3/gi, (_m, pre, attr, q, val) => {
    if (/^(#|javascript:|mailto:|tel:)/i.test(val.trim())) return _m;
    return `${pre}${attr}${q}${proxyHref(val, finalUrl)}${q}`;
  });

  // 4. Réécrire <form action="...">
  html = html.replace(/(<form\s[^>]*?)(action\s*=\s*)(["'])(.*?)\3/gi, (_m, pre, attr, q, val) => {
    return `${pre}${attr}${q}${proxyHref(val, finalUrl)}${q}`;
  });

  // 5. Réécrire <iframe src="..."> imbriqués
  html = html.replace(/(<iframe\s[^>]*?)(src\s*=\s*)(["'])(.*?)\3/gi, (_m, pre, attr, q, val) => {
    if (/^(about:|data:)/i.test(val.trim())) return _m;
    return `${pre}${attr}${q}${proxyHref(val, finalUrl)}${q}`;
  });

  // 6. Script injecté : <base> + intercepteur de navigation + postMessage
  const injected = `
<base href="${origin}/">
<script>
(function(){
  // Faux "top" pour empêcher la détection d'iframe
  try{Object.defineProperty(window,'top',{get:function(){return window.self}})}catch(e){}

  // Intercepter les clics sur les liens
  document.addEventListener('click',function(e){
    var a=e.target;while(a&&a.tagName!=='A')a=a.parentElement;
    if(!a||!a.href)return;
    var h=a.getAttribute('href')||'';
    if(!h||h.charAt(0)==='#'||h.indexOf('javascript:')===0||h.indexOf('mailto:')===0)return;
    if(h.indexOf('/api/proxy')===0)return;
    e.preventDefault();e.stopPropagation();
    try{var u=new URL(h,document.baseURI).href;window.location.href='/api/proxy?url='+encodeURIComponent(u)}catch(ex){}
  },true);

  // Intercepter les soumissions de formulaires GET
  document.addEventListener('submit',function(e){
    var f=e.target;
    var act=f.getAttribute('action')||'';
    if(act.indexOf('/api/proxy')===0)return;
    if(f.method&&f.method.toLowerCase()==='post')return;
    e.preventDefault();
    try{
      var base=new URL(act||window.location.href,document.baseURI).href;
      var p=new URLSearchParams(new FormData(f)).toString();
      var s=base.indexOf('?')>=0?'&':'?';
      window.location.href='/api/proxy?url='+encodeURIComponent(base+s+p);
    }catch(ex){}
  },true);

  // Notifier le parent (EraComputer) de l'URL courante
  try{
    var cu=new URLSearchParams(window.location.search).get('url');
    if(cu)window.parent.postMessage({type:'era-proxy-nav',url:cu},'*');
  }catch(e){}
})();
</script>`;

  // Injecter dans <head>
  if (/<head[\s>]/i.test(html)) {
    html = html.replace(/<head[\s>]/i, (m) => m + injected);
  } else if (/<html[\s>]/i.test(html)) {
    html = html.replace(/<html[^>]*>/i, (m) => m + '<head>' + injected + '</head>');
  } else {
    html = injected + html;
  }

  return html;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');

  if (!url) {
    return new NextResponse(
      '<html><body style="background:#111;color:#888;font-family:Arial;padding:40px;text-align:center"><h2>URL manquante</h2></body></html>',
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  try {
    // Fetch côté serveur — bypass toutes les restrictions navigateur
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      redirect: 'follow',
    });

    const ct = res.headers.get('content-type') || '';
    const finalUrl = res.url || url;

    // ---- HTML : réécrire + injecter ----
    if (ct.includes('text/html')) {
      let html = await res.text();
      html = rewriteHtml(html, finalUrl);
      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // ---- CSS : réécrire url() relatifs en absolus ----
    if (ct.includes('text/css')) {
      let css = await res.text();
      css = css.replace(/url\(\s*["']?(?!data:|blob:|https?:\/\/)(.*?)["']?\s*\)/gi, (_m, v) => {
        try { return `url(${new URL(v.trim(), finalUrl).href})`; } catch { return _m; }
      });
      return new NextResponse(css, {
        status: 200,
        headers: { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' },
      });
    }

    // ---- Tout le reste (images, JS, fonts…) : passer tel quel ----
    const body = await res.arrayBuffer();
    return new NextResponse(body, {
      status: res.status,
      headers: { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (e: any) {
    return new NextResponse(
      `<html><body style="background:#111;color:#f55;font-family:Arial;padding:40px;text-align:center">
        <h2>Impossible de charger la page</h2>
        <p style="color:#888">${e.message || 'Erreur inconnue'}</p>
        <p style="color:#555;font-size:0.8rem;word-break:break-all">${url}</p>
        <br><a href="/api/proxy?url=${encodeURIComponent('https://www.google.com')}"
          style="color:#00c8ff">Retour à Google</a>
      </body></html>`,
      { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}
