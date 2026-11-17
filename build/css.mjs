import { transform } from 'esbuild';
import postcss from 'postcss';
import { LAYERS, LAYER_STATEMENT, normalizeLayerStatement } from './layers.mjs';

const CRITICAL_SELECTOR = /^(?::root|html|body|\*)(?:\[[^\]]*\])*$/;

export const isCritical = (node) => (node.type === 'atrule' && (node.name === 'font-face' || node.name === 'property'))
  || (node.type === 'rule' && node.selectors.every((s) => CRITICAL_SELECTOR.test(s.trim())));

export const splitCss = (css) => {
  const tree = postcss.parse(css);
  const critical = [LAYER_STATEMENT];
  const rest = [];
  tree.each((node) => {
    if (node.type === 'atrule' && node.name === 'layer') {
      if (!node.nodes) {
        if (normalizeLayerStatement(`@layer ${node.params}`) !== normalizeLayerStatement(LAYER_STATEMENT)) throw new Error(`css: layer order statement differs from build/layers.mjs: ${node.params}`);
        return;
      }
      const name = node.params.trim();
      if (!LAYERS.includes(name)) throw new Error(`css: unknown layer "${name}"`);
      const inCritical = [];
      const inRest = [];
      node.each((child) => (isCritical(child) ? inCritical : inRest).push(child.toString()));
      if (inCritical.length) critical.push(`@layer ${name} {\n${inCritical.join('\n')}\n}`);
      if (inRest.length) rest.push(`@layer ${name} {\n${inRest.join('\n')}\n}`);
      return;
    }
    (isCritical(node) ? critical : rest).push(node.toString());
  });
  return { critical: critical.join('\n'), rest: rest.join('\n') };
};

export const minifyCss = async (css) => (await transform(css, { loader: 'css', minify: true })).code;
