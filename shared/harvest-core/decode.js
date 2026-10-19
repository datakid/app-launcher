import decodeIco from 'decode-ico';
import { GifReader } from 'omggif';
import { decodePng, decodeJpeg, decodeWebp, decodeAvif, decodeJxl, rasterSvg, svgSize } from './codecs.js';
import { text } from './runtime.js';

export const sniff = (buf) => {
  if (!buf || buf.length < 8) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  const tag = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  if (tag === 'GIF8') return 'gif';
  if (tag === 'RIFF' && String.fromCharCode(buf[8], buf[9], buf[10], buf[11]) === 'WEBP') return 'webp';
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0 && (buf[4] | (buf[5] << 8)) > 0) return 'ico';
  if (String.fromCharCode(buf[4], buf[5], buf[6], buf[7]) === 'ftyp' && buf.length >= 12) {
    const brand = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]);
    if (brand === 'avif' || brand === 'avis') return 'avif';
  }
  if (buf[0] === 0xff && buf[1] === 0x0a) return 'jxl';
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 0 && buf[3] === 0x0c && String.fromCharCode(buf[4], buf[5], buf[6], buf[7]) === 'JXL ') return 'jxl';
  const head = text(buf.subarray(0, 4096)).replace(/^﻿/, '').trimStart();
  if (!/^<(!doctype html|html|head|body)/i.test(head) && /<svg[\s>]/i.test(head)) return 'svg';
  return null;
};

export const EXT_BY_NAME = { png: 'png', jpg: 'jpg', jpeg: 'jpg', gif: 'gif', webp: 'webp', ico: 'ico', svg: 'svg', avif: 'avif', jxl: 'jxl' };

const decodeGif = (bytes) => {
  const reader = new GifReader(bytes);
  const img = { width: reader.width, height: reader.height, data: new Uint8ClampedArray(reader.width * reader.height * 4) };
  reader.decodeAndBlitFrameRGBA(0, img.data);
  return img;
};

export const decodeImage = async (bytes, ext) => {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (ext === 'png') {
    const image = await decodePng(buf);
    return { image, srcWidth: image.width };
  }
  if (ext === 'jpg' || ext === 'jpeg') {
    const image = await decodeJpeg(buf);
    return { image, srcWidth: image.width };
  }
  if (ext === 'webp') {
    const image = await decodeWebp(buf);
    return { image, srcWidth: image.width };
  }
  if (ext === 'avif') {
    const image = await decodeAvif(buf);
    return { image, srcWidth: image.width };
  }
  if (ext === 'jxl') {
    const image = await decodeJxl(buf);
    return { image, srcWidth: image.width };
  }
  if (ext === 'gif') {
    const image = decodeGif(buf);
    return { image, srcWidth: image.width };
  }
  if (ext === 'ico') {
    const frames = decodeIco(buf);
    if (!frames.length) throw new Error('empty ico');
    const best = frames.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
    if (best.type === 'png') {
      const image = await decodePng(new Uint8Array(best.data));
      return { image, srcWidth: best.width };
    }
    const image = { width: best.width, height: best.height, data: new Uint8ClampedArray(best.data) };
    return { image, srcWidth: best.width };
  }
  if (ext === 'svg') {
    const source = text(buf);
    const probe = await svgSize(source);
    const longest = Math.max(probe.width || 100, probe.height || 100);
    const scale = 384 / longest;
    const width = Math.max(1, Math.round((probe.width || 100) * scale));
    const image = await rasterSvg(source, { width });
    return { image, srcWidth: null };
  }
  throw new Error('unsupported image type ' + ext);
};
