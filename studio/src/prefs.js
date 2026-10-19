const KEY = 'hs:prefs';
const defaults = { theme: 'system', lang: 'en', mode: 'follow', spread: 1, monoColor: '#f0475c', monoVary: true, corners: 'balanced', colors: 'vivid', proxyUrl: '' };

export const loadPrefs = () => {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...defaults };
  }
};

export const savePrefs = (prefs) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {}
};

export const loadToken = () => {
  try {
    return sessionStorage.getItem('hs:token') || '';
  } catch {
    return '';
  }
};

export const saveToken = (token) => {
  try {
    sessionStorage.setItem('hs:token', token);
  } catch {}
};
