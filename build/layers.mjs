export const LAYERS = ['tokens', 'base', 'layout', 'components', 'looks', 'states', 'a11y'];
export const LAYER_STATEMENT = `@layer ${LAYERS.join(',')};`;
export const normalizeLayerStatement = (text) => text.replace(/\s+/g, '').replace(/;$/, '');
