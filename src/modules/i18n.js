import { LX_DEBUG } from './util.js';

export const STRINGS = {
  skipToContent: { ar: 'تخطي إلى المحتوى', en: 'Skip to content' },
  metaDescription: { ar: 'لوحة انطلاق للأدوات والروابط الداخلية', en: 'Launchpad for internal tools and links' },
  categoriesLabel: { ar: 'التصنيفات', en: 'Categories' },
  commandPaletteLabel: { ar: 'لوحة الأوامر', en: 'Command Palette' },
  resultsLabel: { ar: 'النتائج', en: 'Results' },
  actionsLabel: { ar: 'الإجراءات', en: 'Actions' },
  searchPlaceholder: { ar: 'ابحث عن تطبيق أو رابط أو نطاق…', en: 'Search apps, links, hosts…' },
  barSearchLabel: { ar: 'ابحث في كل الأدوات…', en: 'Search all tools…' },
  barSearchLabelShort: { ar: 'ابحث…', en: 'Search…' },
  quickSearch: { ar: 'بحث سريع', en: 'Quick search' },
  soundEnable: { ar: 'تفعيل الصوت', en: 'Enable sound' },
  soundMute: { ar: 'كتم الصوت', en: 'Mute sound' },
  themeToDark: { ar: 'التبديل إلى المظهر الداكن', en: 'Switch to dark mode' },
  themeToLight: { ar: 'التبديل إلى المظهر الفاتح', en: 'Switch to light mode' },
  zenEnter: { ar: 'تفعيل الوضع الهادئ', en: 'Enter Zen mode' },
  zenExit: { ar: 'إنهاء الوضع الهادئ', en: 'Exit Zen mode' },
  zenEntered: { ar: 'تم تفعيل الوضع الهادئ', en: 'Zen mode enabled' },
  zenExited: { ar: 'تم إنهاء الوضع الهادئ', en: 'Zen mode disabled' },
  hintNavigate: { ar: 'تنقل', en: 'Navigate' },
  hintSwitchPanel: { ar: 'تبديل اللوحة', en: 'Switch panel' },
  hintOpen: { ar: 'فتح', en: 'Open' },
  hintClose: { ar: 'إغلاق', en: 'Close' },
  badgeNew: { ar: 'جديد', en: 'New' },
  badgeClosed: { ar: 'مغلق', en: 'Closed' },
  altShortcutHint: { ar: 'اضغط {n} للفتح', en: 'Press {n} to open' },
  closedReasonDefault: { ar: 'هذا الرابط مغلق مؤقتًا وقد لا يعمل عند فتحه.', en: 'This link is temporarily closed and may not work.' },
  chooseVersionOf: { ar: 'اختر نسخة', en: 'Choose a version of' },
  actionNewTab: { ar: 'فتح في تبويب جديد', en: 'Open in new tab' },
  actionSameTab: { ar: 'فتح في نفس التبويب', en: 'Open in same tab' },
  actionCopyLink: { ar: 'نسخ الرابط', en: 'Copy link' },
  actionCopyTitle: { ar: 'نسخ الاسم', en: 'Copy name' },
  actionReveal: { ar: 'إظهار في الشبكة', en: 'Reveal in grid' },
  linkCopied: { ar: 'تم نسخ الرابط', en: 'Link copied' },
  copyFailed: { ar: 'تعذر النسخ', en: "Couldn't copy" },
  nameCopied: { ar: 'تم نسخ الاسم', en: 'Name copied' },
  noResults: { ar: 'لا توجد نتائج', en: 'No results' },
  ctxOpen: { ar: 'فتح', en: 'Open' },
  ctxCopyLink: { ar: 'نسخ الرابط', en: 'Copy link' },
  ctxCopyName: { ar: 'نسخ الاسم', en: 'Copy name' },
  ctxDetails: { ar: 'عرض التفاصيل', en: 'Show details' },
  ctxDefault: { ar: 'افتراضي', en: 'Default' },
  ctxCurrent: { ar: 'الحالية', en: 'Current' },
  ctxUseVersion: { ar: 'اعتمادها للبطاقة', en: 'Keep on card' },
  ctxOpenWith: { ar: 'الفتح الافتراضي', en: 'Default open' },
  openMode: { ar: 'فتح الروابط', en: 'Open links' },
  openMode_new: { ar: 'تبويب جديد', en: 'New tab' },
  openMode_same: { ar: 'نفس التبويب', en: 'Same tab' },
  openModeHint_new: { ar: 'تبقى LinkExpress مفتوحة', en: 'Keeps LinkExpress open' },
  openModeHint_same: { ar: 'يستبدل هذه الصفحة', en: 'Replaces this page' },
  openModeSet: { ar: 'الروابط تُفتح في {m}', en: 'Links open in {m}' },
  cmdOpenMode: { ar: 'فتح الروابط في {m}', en: 'Open links in {m}' },
  emptyCategory: { ar: 'لا توجد عناصر هنا بعد', en: 'Nothing here yet' },
  catalogUnavailable: { ar: 'تعذر تحميل قائمة الأدوات', en: 'Could not load the tool list' },
  resultsCountLabel: { ar: 'نتيجة', en: 'results' },
  noResultsMatch: { ar: 'لا توجد نتائج مطابقة', en: 'No matching results' },
  recentGroup: { ar: 'الأخيرة', en: 'Recent' },
  allGroup: { ar: 'الكل', en: 'All' },
  tryGroup: { ar: 'جرّب', en: 'Try' },
  langSwitchToEn: { ar: 'التبديل إلى الإنجليزية', en: 'Switch to English' },
  langSwitchToAr: { ar: 'التبديل إلى العربية', en: 'Switch to Arabic' },
  dataMenu: { ar: 'بياناتي', en: 'My data' },
  dataImport: { ar: 'استيراد روابط (JSON)', en: 'Import links (JSON)' },
  dataExport: { ar: 'تصدير بياناتي', en: 'Export my data' },
  dataReset: { ar: 'حذف روابطي', en: 'Remove my links' },
  userCategory: { ar: 'روابطي', en: 'My Links' },
  importConfirm: { ar: 'سيتم استبدال روابطك الحالية ({m}) بـ {n} رابط من الملف. متابعة؟', en: 'Replace your {m} current link(s) with {n} from this file?' },
  importConfirmNew: { ar: 'إضافة {n} رابط من الملف إلى «روابطي»؟', en: 'Add {n} link(s) from this file to “My Links”?' },
  importDone: { ar: 'تم استيراد {n} رابط', en: 'Imported {n} link(s)' },
  importPrefsDone: { ar: 'تم استيراد إعداداتك', en: 'Your settings were imported' },
  importSkipped: { ar: '(تم تجاهل {n} غير صالح)', en: '({n} invalid skipped)' },
  exportDone: { ar: 'تم تصدير بياناتك', en: 'Your data was exported' },
  resetConfirm: { ar: 'حذف كل روابطك المستوردة؟', en: 'Remove all your imported links?' },
  resetDone: { ar: 'تم حذف روابطك', en: 'Your links were removed' },
  confirmCancel: { ar: 'إلغاء', en: 'Cancel' },
  confirmImport: { ar: 'استيراد', en: 'Import' },
  confirmRemove: { ar: 'حذف الروابط', en: 'Remove links' },
  dataChanged: { ar: 'تغيرت روابطك أثناء التأكيد. راجعها ثم حاول مجددًا.', en: 'Your links changed while confirming. Review them and try again.' },
  importTooLarge: { ar: 'الملف أكبر من {n} كيلوبايت.', en: 'File is larger than {n} KB.' },
  importTooMany: { ar: 'الحد الأقصى {n} رابطًا.', en: 'Maximum is {n} links.' },
  importEmpty: { ar: 'لا توجد روابط صالحة (يجب أن تبدأ بـ https://).', en: 'No valid links (must start with https://).' },
  importInvalid: { ar: 'ملف غير صالح.', en: 'Invalid file.' },
  storageFailed: { ar: 'تعذر الحفظ في المتصفح.', en: "Couldn't save in this browser." },
  commandsGroup: { ar: 'الأوامر', en: 'Commands' },
  commandKind: { ar: 'أمر', en: 'Command' },
  actionRun: { ar: 'تنفيذ الأمر', en: 'Run command' },
  cmdGoTo: { ar: 'الانتقال إلى', en: 'Go to' },
  hintCommands: { ar: 'الأوامر', en: 'Commands' },
  cmdPlaceholder: { ar: 'اكتب أمرًا…', en: 'Type a command…' },
  factRun: { ar: 'التنفيذ', en: 'Run' },
  factLink: { ar: 'الرابط', en: 'Link' },
  factActivity: { ar: 'النشاط', en: 'Activity' },
  factShortcut: { ar: 'الاختصار', en: 'Shortcut' },
  statOpened: { ar: 'فُتح {n} مرة', en: 'Opened {n}×' },
  statNever: { ar: 'لم يُفتح بعد', en: 'Not opened yet' },
  barSearchCount: { ar: 'ابحث في {n} أداة…', en: 'Search {n} tools…' },
  refreshCatalog: { ar: 'تحديث الأدوات من links.json', en: 'Refresh tools from links.json' },
  refreshUpdated: { ar: 'تم تحديث قائمة الأدوات', en: 'Tool list updated' },
  refreshSame: { ar: 'القائمة محدّثة بالفعل', en: 'Already up to date' },
  refreshMissing: { ar: 'لم يُعثر على links.json، تم استخدام النسخة المدمجة', en: 'links.json not found, using the built-in list' },
  refreshOffline: { ar: 'التحديث يتطلب فتح الموقع عبر الإنترنت', en: 'Refresh needs the site to be served over http(s)' },
  refreshFailed: { ar: 'تعذر التحديث، تم الإبقاء على النسخة الحالية', en: 'Refresh failed, kept the current list' },
  scopesLabel: { ar: 'النطاق', en: 'Scope' },
  scopeAll: { ar: 'الكل', en: 'All' },
  hintScope: { ar: 'النطاق', en: 'Scope' },
  lookMenu: { ar: 'التفضيلات', en: 'Preferences' },
  lookColors: { ar: 'الألوان', en: 'Colors' },
  lookCorners: { ar: 'الزوايا', en: 'Corners' },
  palette_curated: { ar: 'منسقة', en: 'Curated' },
  palette_muted: { ar: 'هادئة', en: 'Muted' },
  palette_vivid: { ar: 'زاهية', en: 'Vivid' },
  palette_mono: { ar: 'أحادية', en: 'Monochrome' },
  corners_soft: { ar: 'ناعمة', en: 'Soft' },
  corners_balanced: { ar: 'متوازنة', en: 'Balanced' },
  corners_crisp: { ar: 'حادة', en: 'Crisp' },
  lookLayout: { ar: 'التخطيط', en: 'Layout' },
  view_bento: { ar: 'بطاقات', en: 'Bento' },
  view_list: { ar: 'قائمة', en: 'List' },
  view_icons: { ar: 'أيقونات', en: 'Icons' },
  cmdSwitchView: { ar: 'تبديل التخطيط', en: 'Switch layout' },
  viewChanged: { ar: 'تم تغيير التخطيط إلى {m}', en: 'Layout changed to {m}' },
  actionQr: { ar: 'رمز QR', en: 'QR code' },
  ctxQr: { ar: 'عرض رمز QR', en: 'Show QR code' },
  qrPng: { ar: 'تنزيل PNG', en: 'Download PNG' },
  qrSvg: { ar: 'تنزيل SVG', en: 'Download SVG' },
  qrImage: { ar: 'نسخ الصورة', en: 'Copy image' },
  qrImageShort: { ar: 'صورة', en: 'Image' },
  qrReady: { ar: 'الرمز جاهز', en: 'QR ready' },
  qrImageCopied: { ar: 'تم نسخ الصورة', en: 'Image copied' },
  qrShare: { ar: 'مشاركة', en: 'Share' },
  qrHint: { ar: 'امسح الرمز بكاميرا الهاتف لفتح الرابط', en: 'Scan with a phone camera to open the link' },
  qrTooLong: { ar: 'الرابط أطول من أن يُعرض كرمز QR', en: 'This link is too long for a QR code' },
  qrSaved: { ar: 'تم تنزيل الرمز', en: 'QR code downloaded' },
  cmdShareSite: { ar: 'مشاركة LinkExpress برمز QR', en: 'Share LinkExpress as a QR code' }
};
export let lang = 'ar';
export const assignLang = (v) => (lang = v);
export const t = (key) => { const e = STRINGS[key]; return e ? (e[lang] ?? e.ar) : key; };
export const loc = (obj) => obj ? (obj[lang] ?? obj.ar ?? obj.en ?? '') : '';

const getStoredLang = () => {
  try { return localStorage.getItem('lx-lang'); } catch (e) { return null; }
};

export const resolveInitialLang = () => {
  const stored = getStoredLang();
  if (stored === 'ar' || stored === 'en') return stored;
  return (navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'ar';
};
let baseManifest = null;
try {
  const href = document.querySelector('link[rel="manifest"]').getAttribute('href');
  baseManifest = JSON.parse(decodeURIComponent(href.slice(href.indexOf(',') + 1)));
} catch (e) { if (LX_DEBUG) console.warn(e); }

export const applyManifest = () => {
  if (!baseManifest) return;
  const link = document.querySelector('link[rel="manifest"]');
  if (!link) return;
  const m = {
    ...baseManifest,
    name: 'LinkExpress',
    short_name: 'LinkExpress',
    description: t('metaDescription'),
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    lang
  };
  link.setAttribute('href', 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(m)));
};
