export let lastInteractionPoint = null;

export const railCenter = () => {
  const rail = document.getElementById('tabRail');
  const r = rail.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

export const setInteractionOrigin = (el) => {
  const r = el.getBoundingClientRect();
  lastInteractionPoint = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
