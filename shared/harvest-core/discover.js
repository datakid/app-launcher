import { utf8, text, errText } from './runtime.js';

export const decodeDataUri = (uri) => {
  const m = /^data:([^,]*),([\s\S]*)$/i.exec(uri);
  if (!m) return null;
  if (/;base64$/i.test(m[1])) {
    const bin = atob(m[2].replace(/\s+/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  try {
    return utf8(decodeURIComponent(m[2]));
  } catch {
    return utf8(m[2]);
  }
};

export const resolveHref = (href, base) => {
  if (/^data:/i.test(href)) return href;
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
};

export const sizeScore = (sizes) => {
  if (!sizes) return 0;
  if (/\bany\b/i.test(sizes)) return 1e6;
  let best = 0;
  for (const m of String(sizes).matchAll(/(\d+)\s*[x×]\s*(\d+)/gi)) best = Math.max(best, Number(m[1]) * Number(m[2]));
  return best;
};

export const bySize = (a, b) => sizeScore(b.sizes) - sizeScore(a.sizes);

export const iconKind = (l) => {
  const h = l.href.toLowerCase();
  const pathPart = h.startsWith('data:') ? '' : h.split(/[?#]/)[0];
  if (l.type.includes('svg') || h.startsWith('data:image/svg') || pathPart.endsWith('.svg')) return 'svg';
  if (l.type.includes('x-icon') || l.type.includes('microsoft.icon') || h.startsWith('data:image/x-icon') || h.startsWith('data:image/vnd.microsoft') || pathPart.endsWith('.ico')) return 'ico';
  return 'png';
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeAttr = (v) =>
  v.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

const parseAttrs = (src) => {
  const attrs = {};
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1].toLowerCase();
    if (name in attrs) continue;
    attrs[name] = unescapeAttr(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
};

export const readLinks = (html) => {
  const clean = String(html).replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, '');
  const links = [];
  const re = /<link\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(clean))) {
    const a = parseAttrs(m[1]);
    if (!a.href || !a.href.trim()) continue;
    links.push({
      rel: (a.rel || '').toLowerCase().split(/\s+/).filter(Boolean),
      href: a.href.trim(),
      sizes: a.sizes || '',
      type: (a.type || '').toLowerCase()
    });
  }
  return links;
};

export const readBaseHref = (html, pageUrl) => {
  const m = /<base\b([^>]*)>/i.exec(String(html).replace(/<!--[\s\S]*?-->/g, ''));
  if (!m) return pageUrl;
  const a = parseAttrs(m[1]);
  return a.href ? resolveHref(a.href, pageUrl) || pageUrl : pageUrl;
};

export const candidateGroups = (links, base, errors, io) => {
  const make = (type, list, from = base) =>
    list
      .map((l) => ({ type, href: resolveHref(l.href, from) }))
      .filter((c, i, arr) => c.href && arr.findIndex((x) => x.href === c.href) === i);
  const iconLinks = links.filter((l) => l.rel.includes('icon'));
  const apple = links.filter((l) => l.rel.some((r) => r === 'apple-touch-icon' || r === 'apple-touch-icon-precomposed')).sort(bySize);
  const svg = iconLinks.filter((l) => iconKind(l) === 'svg').sort(bySize);
  const png = iconLinks.filter((l) => iconKind(l) === 'png').sort(bySize);
  const ico = iconLinks.filter((l) => iconKind(l) === 'ico').sort(bySize);

  const manifest = async () => {
    const l = links.find((x) => x.rel.includes('manifest'));
    if (!l) return [];
    const href = resolveHref(l.href, base);
    if (!href) return [];
    try {
      let body;
      if (href.startsWith('data:')) body = text(decodeDataUri(href));
      else {
        const res = await io.fetchBytes(href);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        body = text(res.bytes);
      }
      const json = JSON.parse(body);
      const mbase = href.startsWith('data:') ? base : href;
      const icons = (Array.isArray(json.icons) ? json.icons : []).filter((i) => i && typeof i.src === 'string').sort(bySize);
      return make('manifest', icons.map((i) => ({ href: i.src })), mbase);
    } catch (e) {
      errors.push('manifest: ' + errText(e));
      return [];
    }
  };

  const fallback = async () => {
    try {
      return [{ type: 'favicon.ico', href: new URL('/favicon.ico', base).href }];
    } catch {
      return [];
    }
  };

  return [async () => make('apple-touch-icon', apple), async () => make('svg', svg), async () => make('png', png), manifest, async () => make('ico', ico), fallback];
};

export const loadHref = async (href, io) => {
  if (href.startsWith('data:')) return decodeDataUri(href);
  const res = await io.fetchBytes(href);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.bytes;
};
