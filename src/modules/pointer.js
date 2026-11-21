let subscribers = [];
let attached = false;

const dispatchPointerMove = (e) => {
  const list = subscribers;
  for (let i = 0; i < list.length; i++) list[i](e);
};

export const onPointerMove = (fn) => {
  subscribers = [...subscribers, fn];
  if (!attached) {
    attached = true;
    document.addEventListener('pointermove', dispatchPointerMove, { passive: true });
  }
  return () => { subscribers = subscribers.filter((s) => s !== fn); };
};
