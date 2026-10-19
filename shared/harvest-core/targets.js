export const KEY_RE = /^[a-z0-9-]+$/;
export const buildTargets = (catalog) => {
  const out = [];
  const categories = catalog && Array.isArray(catalog.categories) ? catalog.categories : [];
  for (const cat of categories) {
    if (!cat || cat.id === 'mine') continue;
    for (const app of Array.isArray(cat.apps) ? cat.apps : []) {
      if (!app || typeof app.id !== 'string' || app.id.startsWith('u-')) continue;
      if (Array.isArray(app.variants) && app.variants.length) {
        for (const v of app.variants) out.push({ key: app.id + '--' + v.id, appId: app.id, variantId: v.id, url: v.url });
      } else if (typeof app.url === 'string') {
        out.push({ key: app.id, appId: app.id, variantId: null, url: app.url });
      }
    }
  }
  return out;
};

export const extrasToTargets = (parsed) => {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  return Object.entries(parsed)
    .filter(([k, u]) => KEY_RE.test(k) && typeof u === 'string' && /^https?:/.test(u))
    .map(([k, u]) => ({ key: k, appId: k, variantId: null, url: u, extra: true }));
};

export const mergeTargets = (catalogTargets, extras) => {
  const taken = new Set(catalogTargets.map((t) => t.key));
  return catalogTargets.concat(extras.filter((t) => !taken.has(t.key)));
};

