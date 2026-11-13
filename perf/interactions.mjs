const settleIdle = async (page) => {
  await page.waitForFunction(() => window.__perf.running() === 0, null, { timeout: 8000 });
  await page.waitForTimeout(250);
};

export const INTERACTIONS = {
  versionSwitch: {
    trigger: { type: 'click' },
    mode: 'settle',
    prepare: async (page) => {
      await page.evaluate((want) => {
        const cards = [...document.querySelectorAll('#appGrid .app-card')];
        const multi = cards.filter((c) => c.querySelectorAll('.variant-chip').length > 1);
        const vectorOnly = multi.filter((c) => !c.querySelector('[data-ms^="g:"], [data-ms^="f:"]'));
        const card = (want && multi.find((c) => (c.querySelector('.app-title') || {}).textContent === want)) || vectorOnly[0] || multi[0];
        if (!card) throw new Error('no multi-version card');
        document.querySelectorAll('[data-perf-target]').forEach((n) => n.removeAttribute('data-perf-target'));
        card.setAttribute('data-perf-target', '1');
      }, process.env.LX_PERF_CARD || '');
    },
    run: async (page) => {
      const handle = await page.evaluateHandle(() => {
        const card = document.querySelector('#appGrid .app-card[data-perf-target]') || [...document.querySelectorAll('#appGrid .app-card')].find((c) => c.querySelectorAll('.variant-chip').length > 1);
        const chips = [...card.querySelectorAll('.variant-chip')].slice(0, 2);
        return chips.find((c) => c.getAttribute('aria-checked') !== 'true') || chips[0];
      });
      await handle.asElement().click();
    }
  },
  tabSwitch: {
    trigger: { type: 'click' },
    mode: 'settle',
    run: async (page) => {
      const handle = await page.evaluateHandle(() => {
        const tabs = [...document.querySelectorAll('.tab-btn')];
        const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true' || t.classList.contains('active') || t.classList.contains('is-active'));
        return tabs[(i + 1) % tabs.length];
      });
      await handle.asElement().click();
    }
  },
  viewSwitch: {
    trigger: { type: 'keydown', key: 'v' },
    mode: 'settle',
    run: async (page) => {
      await page.keyboard.press('Alt+KeyV');
    }
  },
  paletteOpen: {
    trigger: { type: 'keydown', key: 'k' },
    mode: 'settle',
    run: async (page) => {
      await page.keyboard.press('Control+KeyK');
    },
    after: async (page) => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  },
  colorsChange: {
    trigger: { type: 'keydown', key: 'p' },
    mode: 'settle',
    run: async (page) => {
      await page.keyboard.press('Alt+KeyP');
    }
  },
  pointerSweep: {
    trigger: { type: 'pointermove' },
    mode: 'fixed',
    fixedMs: 3000,
    run: async (page) => {
      const box = await page.evaluate(() => {
        const r = document.getElementById('appGrid').getBoundingClientRect();
        return { x: r.left, y: Math.max(r.top, 0), w: r.width, h: Math.min(r.height, innerHeight - Math.max(r.top, 0)) };
      });
      const tri = (u) => 1 - Math.abs(((u % 2) + 2) % 2 - 1);
      const start = Date.now();
      let step = 0;
      await page.mouse.move(box.x + 4, box.y + 4);
      while (Date.now() - start < 3000) {
        const t = step * 8;
        const x = box.x + 8 + (box.w - 16) * tri(t / 900);
        const y = box.y + 8 + (box.h - 16) * tri(t / 2300);
        await page.mouse.move(x, y);
        step += 1;
        const wait = start + step * 8 - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
};

export const NAMES = Object.keys(INTERACTIONS);
export { settleIdle };
