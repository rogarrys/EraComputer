import http from 'node:http';
import https from 'node:https';

const MAX_REDIRECTS = 5;
const TLS_FALLBACK_CODES = new Set([
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'CERT_HAS_EXPIRED',
]);

export interface ExternalRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface ExternalResponse {
  status: number;
  url: string;
  headers: Record<string, string>;
  body: Buffer;
}

function normalizeHeaders(headers: http.IncomingHttpHeaders) {
  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      out[key.toLowerCase()] = value.join(', ');
      continue;
    }

    if (typeof value === 'string') {
      out[key.toLowerCase()] = value;
    }
  }

  return out;
}

function shouldRetryInsecure(error: unknown) {
  let current = error as { code?: string; cause?: unknown } | undefined;

  while (current) {
    if (current.code && TLS_FALLBACK_CODES.has(current.code)) {
      return true;
    }
    current = current.cause as { code?: string; cause?: unknown } | undefined;
  }

  return false;
}

function requestOnce(
  targetUrl: string,
  options: ExternalRequestOptions,
  redirectCount = 0,
  allowInsecureTls = false,
): Promise<ExternalResponse> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(targetUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const transport = isHttps ? https : http;
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body;
    const headers: Record<string, string> = {
      'accept-encoding': 'identity',
      ...(options.headers || {}),
    };

    if (body !== undefined && headers['content-length'] === undefined && headers['Content-Length'] === undefined) {
      headers['content-length'] = Buffer.byteLength(body).toString();
    }

    const request = transport.request(
      parsedUrl,
      {
        method,
        headers,
        rejectUnauthorized: !allowInsecureTls,
      },
      (response) => {
        const status = response.statusCode || 500;
        const location = response.headers.location;

        if (location && status >= 300 && status < 400 && redirectCount < MAX_REDIRECTS) {
          response.resume();

          const nextUrl = new URL(location, parsedUrl).href;
          const nextMethod = status === 303 || ((status === 301 || status === 302) && method !== 'GET' && method !== 'HEAD')
            ? 'GET'
            : method;

          const nextHeaders = { ...headers };
          if (nextMethod === 'GET') {
            delete nextHeaders['content-length'];
            delete nextHeaders['Content-Length'];
            delete nextHeaders['content-type'];
            delete nextHeaders['Content-Type'];
          }

          requestOnce(
            nextUrl,
            {
              method: nextMethod,
              headers: nextHeaders,
              body: nextMethod === 'GET' ? undefined : body,
            },
            redirectCount + 1,
            allowInsecureTls,
          ).then(resolve, reject);
          return;
        }

        const chunks: Buffer[] = [];
        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on('end', () => {
          resolve({
            status,
            url: parsedUrl.href,
            headers: normalizeHeaders(response.headers),
            body: Buffer.concat(chunks),
          });
        });
      },
    );

    request.on('error', reject);

    if (body !== undefined) {
      request.write(body);
    }

    request.end();
  });
}

export async function requestExternal(targetUrl: string, options: ExternalRequestOptions = {}) {
  try {
    return await requestOnce(targetUrl, options);
  } catch (error) {
    if (!targetUrl.startsWith('https://') || !shouldRetryInsecure(error)) {
      throw error;
    }

    // Fallback utile quand la machine hôte n'a pas une chaîne CA complète.
    return requestOnce(targetUrl, options, 0, true);
  }
}
