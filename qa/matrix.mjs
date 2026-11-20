export const PALETTES = ['vivid', 'curated', 'muted', 'mono'];
export const CORNERS = ['balanced', 'soft', 'crisp'];
export const THEMES = ['light', 'dark'];
export const LANGS = ['ar', 'en'];
export const VIEWS = ['bento', 'list', 'icons'];
export const SIZES = [{ width: 390, height: 844 }, { width: 1280, height: 900 }, { width: 1707, height: 960 }];
export const WIDE = SIZES[1];
export const SURFACES = ['zen-bento', 'zen-icons', 'palette-query', 'palette-detail', 'context-menu', 'qr-dialog', 'appearance-menu'];
export const QUICK_SURFACES = ['palette-query', 'context-menu'];

export const DEFAULT_CHROME_ARGS = '--force-color-profile=srgb --font-render-hinting=none --disable-lcd-text';
export const chromeArgs = (value) => (value || DEFAULT_CHROME_ARGS).split(/\s+/).filter(Boolean);

const cascadeJobs = () => {
  const jobs = [];
  const add = (theme, lang, size, palette, view, surface, touch) => {
    const tag = touch ? '-touch' : '';
    jobs.push({ group: `${theme}-${lang}-${size.width}${tag}`, theme, lang, size, palette, corner: 'balanced', view, surface, touch, name: `${theme}-${lang}-${palette}-balanced-${surface || view}-${size.width}${tag}` });
  };
  for (const theme of THEMES) {
    for (const palette of PALETTES) {
      for (const view of VIEWS) {
        add(theme, 'en', WIDE, palette, view, null, false);
        add(theme, 'en', SIZES[0], palette, view, null, true);
      }
      for (const surface of SURFACES) add(theme, 'en', WIDE, palette, surface === 'zen-icons' ? 'icons' : 'bento', surface, false);
    }
    for (const view of VIEWS) add(theme, 'ar', WIDE, 'vivid', view, null, false);
  }
  return jobs;
};

export const buildJobs = (matrix, only) => {
  if (matrix === 'cascade') {
    const all = cascadeJobs();
    return only.length ? all.filter((j) => only.some((o) => j.name.includes(o))) : all;
  }
  const quick = matrix === 'quick';
  const wantGrid = ['full', 'grid', 'quick'].includes(matrix);
  const wantSurfaces = ['full', 'surfaces', 'quick'].includes(matrix);
  const langs = quick ? ['en'] : LANGS;
  const corners = quick ? ['balanced'] : CORNERS;
  const sizes = quick ? [WIDE] : SIZES;
  const surfaces = quick ? QUICK_SURFACES : SURFACES;
  const jobs = [];
  for (const theme of THEMES) {
    for (const lang of langs) {
      for (const size of sizes) {
        const group = `${theme}-${lang}-${size.width}`;
        if (wantGrid) {
          for (const palette of PALETTES) {
            for (const corner of corners) {
              for (const view of VIEWS) {
                jobs.push({ group, theme, lang, size, palette, corner, view, surface: null, name: `${theme}-${lang}-${palette}-${corner}-${view}-${size.width}` });
              }
            }
          }
        }
        if (wantSurfaces && size === WIDE) {
          for (const palette of PALETTES) {
            for (const surface of surfaces) {
              const view = surface === 'zen-icons' ? 'icons' : 'bento';
              jobs.push({ group, theme, lang, size, palette, corner: 'balanced', view, surface, name: `${theme}-${lang}-${palette}-balanced-${surface}-${size.width}` });
            }
          }
        }
      }
    }
  }
  return only.length ? jobs.filter((j) => only.some((o) => j.name.includes(o))) : jobs;
};

export const laneGroups = (jobs, count) => {
  const byGroup = new Map();
  for (const j of jobs) {
    if (!byGroup.has(j.group)) byGroup.set(j.group, []);
    byGroup.get(j.group).push(j);
  }
  const lanes = Array.from({ length: count }, () => ({ load: 0, groups: [] }));
  for (const g of [...byGroup.values()].sort((a, b) => b.length - a.length)) {
    const lane = lanes.reduce((m, l) => (l.load < m.load ? l : m), lanes[0]);
    lane.groups.push(g);
    lane.load += g.length;
  }
  return lanes.map((l) => l.groups);
};

const pinRandom = (s0) => {
  let s = s0 >>> 0;
  Math.random = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const freezeOrbClock = (fixed) => {
  let instance;
  Object.defineProperty(window, 'bgAnim', {
    configurable: true,
    get: () => instance,
    set: (value) => {
      instance = value;
      const original = value.render;
      value.render = function (now) {
        const real = performance.now;
        performance.now = () => fixed;
        try { return original.call(this, now); } finally { performance.now = real; }
      };
      value.render(0);
    }
  });
};

export const newGroupPage = async (browser, first, base, { pin, seed, lowend, errors }) => {
  const ctx = await browser.newContext({ viewport: { width: first.size.width, height: first.size.height }, reducedMotion: 'reduce', ...(first.touch ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addInitScript(([t, l]) => { try { localStorage.setItem('lx-theme', t); localStorage.setItem('lx-lang', l); } catch (e) {} }, [first.theme, first.lang]);
  await ctx.addInitScript((cores) => {
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => cores });
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => cores });
  }, lowend ? 2 : 8);
  if (pin) {
    await ctx.addInitScript(pinRandom, seed);
    await ctx.addInitScript(freezeOrbClock, 1000);
  }
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${base}/__origin`);
  return { ctx, page };
};

export const settle = async (page, settleMs) => {
  await page.waitForSelector('#appGrid .app-card');
  await page.evaluate(async () => {
    const running = () => document.getAnimations().filter((a) => {
      const t = a.effect && a.effect.getComputedTiming();
      return t && Number.isFinite(t.endTime) && a.playState === 'running';
    });
    const deadline = performance.now() + 4000;
    while (performance.now() < deadline) {
      const live = running();
      if (!live.length) break;
      await Promise.race([Promise.allSettled(live.map((a) => a.finished)), new Promise((r) => setTimeout(r, 200))]);
    }
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode().catch(() => null)));
    const urls = new Set();
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      for (const v of [cs.backgroundImage, cs.maskImage, cs.webkitMaskImage, cs.borderImageSource]) {
        if (!v || v === 'none') continue;
        for (const m of v.matchAll(/url\("?([^")]+)"?\)/g)) if (!m[1].startsWith('data:')) urls.add(m[1]);
      }
    }
    await Promise.all([...urls].map((u) => {
      const img = new Image();
      img.src = u;
      return img.decode().catch(() => null);
    }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.waitForTimeout(settleMs);
};

const readState = (page) => page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  palette: document.documentElement.dataset.palette,
  corners: document.documentElement.dataset.corners,
  view: document.documentElement.dataset.view,
  lang: document.documentElement.lang,
  dir: document.documentElement.dir,
  zen: document.body.classList.contains('is-zen'),
  width: window.innerWidth
}));

const openPalette = async (page) => {
  await page.keyboard.press('Control+KeyK');
  await page.waitForSelector('#lx-palette[open]');
  await page.waitForSelector('body.palette-open');
  await page.fill('#paletteInput', 'form');
  await page.waitForFunction(() => document.querySelectorAll('#paletteResults [id^="palette-item-"]').length > 0);
  await page.waitForFunction(() => !!document.querySelector('#paletteDetail .palette-detail-title'));
};

const enterSurface = async (page, job, settleMs, pointer) => {
  if (job.surface === 'palette-query' || job.surface === 'palette-detail') {
    await openPalette(page);
  } else if (job.surface === 'context-menu') {
    if (pointer) {
      const card = await page.$('#appGrid .app-card');
      await card.click({ button: 'right' });
    } else {
      await page.evaluate(() => {
        const card = document.querySelector('#appGrid .app-card');
        const r = card.getBoundingClientRect();
        card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      });
    }
    await page.waitForSelector('.lx-context-menu.is-open');
  } else if (job.surface === 'appearance-menu') {
    if (pointer) await page.click('#lookToggle');
    else await page.evaluate(() => document.querySelector('#lookToggle').click());
    await page.waitForSelector('#lookToggle[aria-expanded="true"]');
  } else if (job.surface === 'qr-dialog') {
    if (pointer) await page.click('#appGrid .app-card .card-qr');
    else await page.evaluate(() => document.querySelector('#appGrid .app-card .card-qr').click());
    await page.waitForSelector('#lx-qr[open]');
    await page.waitForSelector('#qrStage canvas, #qrStage svg');
  }
  if (job.surface) await settle(page, settleMs);
};

export const reach = async (page, job, base, { pin, settleMs, errors, pointer = true }) => {
  const zen = job.surface === 'zen-bento' || job.surface === 'zen-icons';
  if (pointer) await page.mouse.move(0, 0);
  await page.evaluate(([corner, z]) => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('lx-corners', corner);
      localStorage.setItem('lx-zen', z);
    } catch (e) {}
  }, [job.corner, zen ? '1' : '0']);
  await page.goto(`${base}/?view=${job.view}&palette=${job.palette}`);
  await settle(page, settleMs);
  const seen = await readState(page);
  const want = { theme: job.theme, palette: job.palette, corners: job.corner, view: job.view, lang: job.lang, dir: job.lang === 'ar' ? 'rtl' : 'ltr', zen, width: job.size.width };
  const wrong = Object.keys(want).filter((k) => seen[k] !== want[k]).map((k) => `${k}: wanted ${want[k]}, got ${seen[k]}`);
  if (wrong.length) errors.push(`${job.name}: state mismatch (${wrong.join('; ')})`);
  if (pin && !(await page.evaluate(() => !!window.bgAnim))) errors.push(`${job.name}: window.bgAnim is missing, the orb clock pin is inactive`);
  await enterSurface(page, job, settleMs, pointer);
  await page.addStyleTag({ content: '@layer a11y { input, textarea { transition: none !important; } } *, *::before, *::after { caret-color: transparent !important; }' });
};
