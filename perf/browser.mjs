import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const FA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '@fortawesome', 'fontawesome-free', 'svgs', 'solid');
const FA_URL = /^https:\/\/cdn\.jsdelivr\.net\/npm\/@fortawesome\/fontawesome-free@[^/]+\/svgs\/solid\/([a-z0-9-]+)\.svg(?:\?.*)?$/;
const CORS = { 'access-control-allow-origin': '*' };

export const routeFontAwesome = (target) => target.route('https://cdn.jsdelivr.net/**', async (route) => {
  const hit = FA_URL.exec(route.request().url());
  if (!hit) return route.fulfill({ status: 404, headers: CORS, body: 'not found' });
  try {
    const body = await fs.readFile(path.join(FA_DIR, hit[1] + '.svg'));
    return route.fulfill({ status: 200, headers: CORS, contentType: 'image/svg+xml', body });
  } catch (e) {
    return route.fulfill({ status: 404, headers: CORS, body: 'not found' });
  }
});

export const launchBrowser = async (options) => {
  const browser = await chromium.launch(options);
  const newContext = browser.newContext.bind(browser);
  const newPage = browser.newPage.bind(browser);
  browser.newContext = async (contextOptions) => {
    const context = await newContext(contextOptions);
    await routeFontAwesome(context);
    return context;
  };
  browser.newPage = async (pageOptions) => {
    const page = await newPage(pageOptions);
    await routeFontAwesome(page.context());
    return page;
  };
  return browser;
};
