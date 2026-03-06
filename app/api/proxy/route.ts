import { NextRequest, NextResponse } from 'next/server';

// =============================================
// Proxy Web complet pour EraComputer
// Bypass CORS, X-Frame-Options, CSP
// Réécrit HTML + intercepte fetch/XHR/navigation en JS
// =============================================

const PROXY_PATH = '/api/proxy?url=';

// Headers CORS permissifs pour toutes les réponses du proxy
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

// =============================================
// OPTIONS — Répondre aux preflight CORS
// =============================================
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// =============================================
// POST — Proxy les requêtes POST (formulaires, API calls)
// =============================================
export async function POST(req: NextRequest) {
  return handleProxy(req, 'POST');
}

// =============================================
// GET — Proxy principal
// =============================================
export async function GET(req: NextRequest) {
  return handleProxy(req, 'GET');
}

// =============================================
// Handler commun GET/POST
// =============================================
async function handleProxy(req: NextRequest, method: string) {
  const url = req.nextUrl.searchParams.get('url');

  if (!url) {
    return new NextResponse(
      '<html><body style="background:#111;color:#888;font-family:Arial;padding:40px;text-align:center"><h2>URL manquante</h2></body></html>',
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS } },
    );
  }

  try {
    const fetchOpts: RequestInit = {
      method,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      redirect: 'follow',
    };

    // Forward le body pour POST
    if (method === 'POST') {
      try {
        fetchOpts.body = await req.text();
        const ct = req.headers.get('content-type');
        if (ct) (fetchOpts.headers as Record<string, string>)['Content-Type'] = ct;
      } catch { /* pas de body */ }
    }

    const res = await fetch(url, fetchOpts);
    const ct = res.headers.get('content-type') || '';
    const finalUrl = res.url || url;

    // ---- HTML : réécrire + injecter ----
    if (ct.includes('text/html')) {
      let html = await res.text();
      html = rewriteHtml(html, finalUrl);
      return new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS },
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
        headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=3600', ...CORS_HEADERS },
      });
    }

    // ---- JSON / API : passer tel quel avec CORS ----
    if (ct.includes('application/json') || ct.includes('text/javascript') || ct.includes('application/javascript')) {
      const text = await res.text();
      return new NextResponse(text, {
        status: res.status,
        headers: { 'Content-Type': ct, ...CORS_HEADERS },
      });
    }

    // ---- Tout le reste (images, fonts…) : passer tel quel ----
    const body = await res.arrayBuffer();
    return new NextResponse(body, {
      status: res.status,
      headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=3600', ...CORS_HEADERS },
    });
  } catch (e: any) {
    return new NextResponse(
      `<html><body style="background:#111;color:#f55;font-family:Arial;padding:40px;text-align:center">
        <h2>Impossible de charger la page</h2>
        <p style="color:#888">${e.message || 'Erreur inconnue'}</p>
        <p style="color:#555;font-size:0.8rem;word-break:break-all">${url}</p>
        <br><a href="${PROXY_PATH}${encodeURIComponent('https://www.google.com')}" style="color:#00c8ff">Retour à Google</a>
      </body></html>`,
      { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS } },
    );
  }
}

// =============================================
// HTML Rewriter
// =============================================

function proxyHref(href: string, baseUrl: string): string {
  if (!href) return href;
  if (/^(data:|blob:|javascript:|#|mailto:|tel:)/i.test(href.trim())) return href;
  try {
    return PROXY_PATH + encodeURIComponent(new URL(href, baseUrl).href);
  } catch { return href; }
}

function rewriteHtml(html: string, finalUrl: string): string {
  const origin = new URL(finalUrl).origin;

  // Supprimer CSP meta tags
  html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, '');
  // Supprimer <base> existants
  html = html.replace(/<base[^>]*>/gi, '');

  // Réécrire href sur <a>
  html = html.replace(/(<a\s[^>]*?)(href\s*=\s*)(["'])(.*?)\3/gi, (_m, pre, attr, q, val) => {
    if (/^(#|javascript:|mailto:|tel:)/i.test(val.trim())) return _m;
    return `${pre}${attr}${q}${proxyHref(val, finalUrl)}${q}`;
  });
  // Réécrire action sur <form>
  html = html.replace(/(<form\s[^>]*?)(action\s*=\s*)(["'])(.*?)\3/gi, (_m, pre, attr, q, val) => {
    return `${pre}${attr}${q}${proxyHref(val, finalUrl)}${q}`;
  });
  // Réécrire src sur <iframe>
  html = html.replace(/(<iframe\s[^>]*?)(src\s*=\s*)(["'])(.*?)\3/gi, (_m, pre, attr, q, val) => {
    if (/^(about:|data:)/i.test(val.trim())) return _m;
    return `${pre}${attr}${q}${proxyHref(val, finalUrl)}${q}`;
  });

  // =============================================
  // Script injecté : intercepte TOUT (fetch, XHR, navigation, formulaires)
  // =============================================
  const injectedScript = `
<base href="${origin}/">
<script>
(function(){
  var P='/api/proxy?url=';
  var ORIGIN='${origin}';
  function isExt(u){
    if(!u||typeof u!=='string')return false;
    if(u.indexOf(P)===0)return false;
    if(u.indexOf('/api/proxy')===0)return false;
    return /^https?:\\/\\//i.test(u);
  }
  function wrap(u,base){
    if(!u)return u;
    if(typeof u!=='string')return u;
    var s=u.trim();
    if(!s||s.charAt(0)==='#'||s.indexOf('javascript:')===0||s.indexOf('data:')===0||s.indexOf('blob:')===0||s.indexOf('mailto:')===0)return u;
    if(s.indexOf(P)===0||s.indexOf('/api/proxy')===0)return u;
    try{var abs=new URL(s,base||ORIGIN).href;return P+encodeURIComponent(abs)}catch(e){return u}
  }

  // ---- Fake top ----
  try{Object.defineProperty(window,'top',{get:function(){return window.self},configurable:true})}catch(e){}

  // ---- Override fetch ----
  var _fetch=window.fetch;
  window.fetch=function(input,init){
    var u=(typeof input==='string')?input:(input&&input.url?input.url:'');
    if(isExt(u)){
      var nu=wrap(u);
      if(typeof input==='string')input=nu;
      else if(input&&input.url)input=new Request(nu,input);
    }
    return _fetch.call(window,input,init);
  };

  // ---- Override XMLHttpRequest ----
  var _xhrOpen=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(method,url){
    if(isExt(url))url=wrap(url);
    return _xhrOpen.apply(this,arguments.length>=3?[method,url,arguments[2],arguments[3],arguments[4]]:[method,url]);
  };

  // ---- Override window.open ----
  var _open=window.open;
  window.open=function(url){
    if(url&&isExt(url)){arguments[0]=wrap(url)}
    return _open.apply(window,arguments);
  };

  // ---- Override location setters (assign, replace, href setter) ----
  try{
    var ld=Object.getOwnPropertyDescriptor(window.__proto__.__proto__||Window.prototype,'location');
    // Can't reliably override location in all browsers, use navigation events instead
  }catch(e){}

  // ---- Intercepter clics sur <a> ----
  document.addEventListener('click',function(e){
    var a=e.target;while(a&&a.tagName!=='A')a=a.parentElement;
    if(!a||!a.href)return;
    var h=a.getAttribute('href')||'';
    if(!h||h.charAt(0)==='#'||h.indexOf('javascript:')===0||h.indexOf('mailto:')===0)return;
    if(h.indexOf('/api/proxy')===0||h.indexOf(P)===0)return;
    e.preventDefault();e.stopPropagation();
    try{window.location.href=wrap(h,document.baseURI)}catch(ex){}
  },true);

  // ---- Intercepter submit de formulaire ----
  document.addEventListener('submit',function(e){
    var f=e.target;
    var act=f.getAttribute('action')||'';
    if(act.indexOf('/api/proxy')===0)return;
    e.preventDefault();
    try{
      var base=new URL(act||window.location.href,document.baseURI).href;
      var fd=new FormData(f);
      if(!f.method||f.method.toUpperCase()==='GET'){
        var p=new URLSearchParams(fd).toString();
        var sep=base.indexOf('?')>=0?'&':'?';
        window.location.href=P+encodeURIComponent(base+sep+p);
      }else{
        _fetch(P+encodeURIComponent(base),{method:'POST',body:fd}).then(function(r){return r.text()}).then(function(h){document.open();document.write(h);document.close()}).catch(function(){});
      }
    }catch(ex){}
  },true);

  // ---- Notifier le parent de l'URL courante ----
  try{
    var cu=new URLSearchParams(window.location.search).get('url');
    if(cu)window.parent.postMessage({type:'era-proxy-nav',url:cu},'*');
  }catch(e){}

  // ---- Service Worker Intercept (dernière chance pour les requêtes dynamiques) ----
  // Pas possible dans une iframe sandbox, on se fie à fetch/XHR override
})();
</script>`;

  // Injecter AVANT tout autre script
  if (/<head[\s>]/i.test(html)) {
    html = html.replace(/<head[\s>]/i, (m) => m + injectedScript);
  } else if (/<html[\s>]/i.test(html)) {
    html = html.replace(/<html[^>]*>/i, (m) => m + '<head>' + injectedScript + '</head>');
  } else {
    html = injectedScript + html;
  }

  return html;
}
