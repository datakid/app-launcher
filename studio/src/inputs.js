import { scanJson, hostKey, normalizeUrl, uniqueKeys } from '../../shared/harvest-core/sources.js';

const IMAGE_RE = /\.(png|jpe?g|gif|webp|ico|svg|avif|jxl)$/i;

export const isJsonFile = (file) => /\.json$/i.test(file.name) || file.type === 'application/json';
export const isImageFile = (file) => IMAGE_RE.test(file.name) || /^image\//.test(file.type);

const readEntries = (reader) => new Promise((resolve, reject) => reader.readEntries(resolve, reject));
const fileOf = (entry) => new Promise((resolve, reject) => entry.file(resolve, reject));

const walk = async (entry, out) => {
  if (entry.isFile) {
    out.push(await fileOf(entry));
    return;
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    for (;;) {
      const batch = await readEntries(reader);
      if (!batch.length) break;
      for (const child of batch) await walk(child, out);
    }
  }
};

export const filesFromDrop = async (dataTransfer) => {
  const out = [];
  const items = [...(dataTransfer.items || [])];
  const entries = items.map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
  if (entries.length && entries.every(Boolean)) {
    for (const entry of entries) await walk(entry, out);
    return out;
  }
  return [...dataTransfer.files];
};

export const parseUrls = (text) =>
  String(text)
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ({ raw: s, url: normalizeUrl(s) }))
    .filter((x) => x.url);

export const readJsonFile = async (file) => {
  const text = await file.text();
  const data = JSON.parse(text.replace(/^﻿/, ''));
  return { name: file.name, data, scan: scanJson(data) };
};

export const rescan = (json, fields) => {
  json.scan = scanJson(json.data, fields);
  return json;
};

export const buildTargets = async (pending) => {
  const items = [];
  for (const { url } of parseUrls(pending.urlText)) items.push({ key: hostKey(url), url, name: hostKey(url) });
  for (const f of pending.files) items.push({ key: f.name.replace(IMAGE_RE, '') || 'icon', name: f.name.replace(IMAGE_RE, ''), fileName: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
  for (const j of pending.jsons) for (const t of j.scan.targets) items.push({ ...t });
  return uniqueKeys(items);
};

export const pendingCount = (pending) => parseUrls(pending.urlText).length + pending.files.length + pending.jsons.reduce((n, j) => n + j.scan.count, 0);
