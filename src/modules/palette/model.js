export const entryKey = (e) => e.app.id;

const itemRow = (entry, index) => {
  const hit = entry.hit;
  return {
    type: 'item',
    key: entryKey(entry),
    entry,
    index,
    tier: hit ? hit.tier : 0,
    field: hit ? hit.field : '',
    ranges: hit ? hit.ranges : []
  };
};

export const buildModel = ({ query, isCmd, scored, cmdHits, commandList, recents, tryPicks }) => {
  const rows = [];
  const header = (group) => rows.push({ type: 'header', key: `h:${group}`, group });
  const items = [];
  const push = (entry) => {
    rows.push(itemRow(entry, items.length));
    items.push(entry);
  };

  if (isCmd) {
    if (commandList.length) header('commands');
    commandList.forEach(push);
  } else if (!query && !scored.length) {
    return { rows, items, kind: 'empty' };
  } else if (!query) {
    const recentIds = new Set(recents.map((e) => e.app.id));
    const rest = scored.filter((e) => !recentIds.has(e.app.id));
    if (recents.length) {
      header('recent');
      recents.forEach(push);
      header('all');
    }
    rest.forEach(push);
    return { rows, items, kind: 'browse' };
  } else if (scored.length || cmdHits.length) {
    scored.forEach(push);
    if (cmdHits.length) {
      header('commands');
      cmdHits.forEach(push);
    }
    return { rows, items, kind: 'results' };
  } else {
    header('try');
    tryPicks.forEach(push);
    return { rows, items, kind: 'try' };
  }
  return { rows, items, kind: 'commands' };
};

export const needsTryPicks = ({ query, isCmd, scored, cmdHits }) => !isCmd && !!query && !scored.length && !cmdHits.length;

export const pickActive = (items, previousKey, sameView) => {
  const kept = sameView && previousKey ? items.findIndex((e) => entryKey(e) === previousKey) : -1;
  if (kept !== -1) return kept;
  return items.length ? 0 : -1;
};
