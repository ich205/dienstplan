(() => {
  'use strict';

  // ============================================================
  // Offline Dienstplan Generator (Monat)
  // Version 4.3
  // ============================================================

  const STORAGE_KEY = 'dienstplan_generator_offline_v2';

  const BLOCK = {
    NONE: '',
    FREE0: 'FREE0', // Frei ohne Stunden
    WF: 'WF',       // Wunschfrei (Priorität, max. 3x pro Person/Monat)
    FREEH: 'FREEH', // Urlaub (mit Stunden-Gutschrift)
  };

  const SHIFT = {
    IWD: { key: 'IWD', label: 'IWD', hours: 20 },
    TD: { key: 'TD', label: 'TD', hours: 10 },
  };

  const WEEKDAY_SHORT = ['So','Mo','Di','Mi','Do','Fr','Sa']; // JS: 0=So

  // ---------- DOM helpers ----------
  const $ = (sel) => document.querySelector(sel);

  // ---------- Date helpers ----------
  function pad2(n){ return String(n).padStart(2, '0'); }

  function toISODate(date){
    const y = date.getFullYear();
    const m = pad2(date.getMonth() + 1);
    const d = pad2(date.getDate());
    return `${y}-${m}-${d}`;
  }

  function parseISODate(iso){
    // safer than new Date("YYYY-MM-DD") because of timezone parsing differences
    const [y, m, d] = String(iso).split('-').map(Number);
    if (!y || !m || !d) return null;
    const date = new Date(y, m - 1, d);
    if (Number.isNaN(date.getTime())) return null;
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return date;
  }

  function monthKeyFromDate(date){
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
  }

  function parseMonthKey(monthKey){
    const [y, m] = String(monthKey || '').split('-').map(Number);
    if (!y || !m) return null;
    return { y, m }; // m: 1..12
  }

  function formatMonthLabelDE(monthKey){
    const p = parseMonthKey(monthKey);
    if (!p) return String(monthKey || '');
    const dt = new Date(p.y, p.m - 1, 1);
    try {
      return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(dt);
    } catch {
      return `${pad2(p.m)}.${p.y}`;
    }
  }

  function daysInMonth(y, m){
    // m 1..12
    return new Date(y, m, 0).getDate();
  }

  function isWeekday(date){
    const d = date.getDay();
    return d >= 1 && d <= 5; // Mo..Fr
  }

  function getMonday(date){
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay(); // 0=So,1=Mo...
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function weekKey(date){
    // Monday (ISO-like week start) as YYYY-MM-DD
    return toISODate(getMonday(date));
  }

  function getMonthDays(monthKey){
    const parsed = parseMonthKey(monthKey);
    if (!parsed) return [];
    const { y, m } = parsed;
    const count = daysInMonth(y, m);
    const out = [];
    for (let i = 1; i <= count; i++){
      const date = new Date(y, m - 1, i);
      const iso = toISODate(date);
      const dow = date.getDay();
      out.push({
        index: i - 1,
        date,
        iso,
        dow,
        label: `${WEEKDAY_SHORT[dow]} ${pad2(i)}.${pad2(m)}.${y}`,
      });
    }
    return out;
  }

  // ---------- Feiertage (Berlin) ----------
  // Quelle/Logik: Kombination aus festen und beweglichen Feiertagen (über Ostern berechnet).
  // Hinweis: Einzelne einmalige Feiertage (z.B. 08.05.2025 in Berlin) werden separat ergänzt.
  const HOLIDAY_CACHE = new Map(); // year -> { isoDate: name }

  function addDays(date, delta){
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + delta);
    return d;
  }

  // Gregorian Easter Sunday (Meeus/Jones/Butcher)
  function easterSunday(year){
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March,4=April
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function buildBerlinHolidayMap(year){
    const map = {};
    const add = (dt, name) => { map[toISODate(dt)] = name; };

    // feste Feiertage
    add(new Date(year, 0, 1), 'Neujahr');
    add(new Date(year, 2, 8), 'Internationaler Frauentag');
    add(new Date(year, 4, 1), 'Tag der Arbeit');
    add(new Date(year, 9, 3), 'Tag der Deutschen Einheit');
    add(new Date(year, 11, 25), '1. Weihnachtstag');
    add(new Date(year, 11, 26), '2. Weihnachtstag');

    // bewegliche Feiertage (Ostern)
    const easter = easterSunday(year);
    add(addDays(easter, -2), 'Karfreitag');
    add(addDays(easter, 1), 'Ostermontag');
    add(addDays(easter, 39), 'Christi Himmelfahrt');
    add(addDays(easter, 50), 'Pfingstmontag');

    // Berlin-spezifisch / einmalig
    if (year === 2025){
      add(new Date(2025, 4, 8), '80. Jahrestag der Befreiung');
    }

    return map;
  }

  function berlinHolidayMapForYear(year){
    if (HOLIDAY_CACHE.has(year)) return HOLIDAY_CACHE.get(year);
    const m = buildBerlinHolidayMap(year);
    HOLIDAY_CACHE.set(year, m);
    return m;
  }

  function holidayNameBerlin(isoDate){
    const dt = parseISODate(isoDate);
    if (!dt) return '';
    const year = dt.getFullYear();
    const map = berlinHolidayMapForYear(year);
    return map[isoDate] || '';
  }

  function holidayMapForMonth(monthKey){
    const p = parseMonthKey(monthKey);
    if (!p) return {};
    return berlinHolidayMapForYear(p.y);
  }

  function buildWeekSegments(days){
    // Group the month days by calendar weeks (Mo..So), but only using dates inside the month.
    const segments = [];
    let current = null;

    for (const day of days){
      const wk = weekKey(day.date);
      if (!current || current.key !== wk){
        current = { key: wk, indices: [], weekdaysCount: 0 };
        segments.push(current);
      }
      current.indices.push(day.index);
      if (isWeekday(day.date)) current.weekdaysCount += 1;
    }
    return segments;
  }

  // ---------- State ----------
  function makeId(){
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `id_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
  }

  function clamp(n, min, max){
    return Math.max(min, Math.min(max, n));
  }

  function round1(n){
    return Math.round(n * 10) / 10;
  }

  function isPlainObject(value){
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function safeRecord(value){
    return isPlainObject(value) ? value : {};
  }

  function safeSettings(value, baseSettings){
    return { ...baseSettings, ...(isPlainObject(value) ? value : {}) };
  }

  function defaultState(){
    const month = monthKeyFromDate(new Date());
    return {
      version: 4.3,
      month,
      employees: [],
      blocksByMonth: {},
      tdRequiredByMonth: {},
      settings: {
        attempts: 10000,
        preferGaps: true,
      },
      lastResultByMonth: {},
    };
  }

  
  function defaultEmpPrefs(){
    return {
      allowIWD: true,
      allowTD: true,
      tdBias: 0,       // -1 = mehr IWD, 0 = neutral, +1 = mehr TD
      bannedDows: [],  // Array von 0..6 (0=So)

      // --- Erweiterte Sonderwünsche ---
      // gewünschter Mindestabstand zwischen IWDs (in Tagen)
      // (neutral = 4; "doppel IWD" => 2; "kein doppel IWD" => 3)
      iwdMinGap: 4,
      // -1 = kein Doppel-IWD, 0 = neutral, +1 = Doppel-IWD bevorzugt
      doubleIwdPref: 0,
      // 0/1: Wunsch, dass der Tag nach dem obligatorischen "/" ebenfalls frei bleibt (also 2 freie Tage nach IWD)
      extraRestAfterIWD: 0,

      // bevorzugte Arbeitstage (wenn möglich nicht "leer" lassen; kann auch "/" durch IWD am Vortag sein)
      preferWorkDows: [],

      // Wochenend-Neigung: -1 = ungern, 0 = neutral, +1 = bevorzugt
      weekendBias: 0,

      // Limits (optional): max Anzahl pro Woche/Monat
      maxIwdPerWeek: null,
      maxTdPerWeek: null,
      maxIwdPerMonth: null,
      maxTdPerMonth: null,
    };
  }

  function sanitizePrefs(prefs){
    const base = defaultEmpPrefs();
    const p = (prefs && typeof prefs === 'object') ? prefs : {};

    const allowIWD = ('allowIWD' in p) ? Boolean(p.allowIWD) : base.allowIWD;
    const allowTD  = ('allowTD'  in p) ? Boolean(p.allowTD)  : base.allowTD;

    let tdBias = Number(('tdBias' in p) ? p.tdBias : base.tdBias);
    if (![ -1, 0, 1 ].includes(tdBias)) tdBias = 0;

    const banned = Array.isArray(p.bannedDows) ? p.bannedDows : [];
    const bannedDows = Array.from(new Set(
      banned.map(n => Number(n)).filter(n => [0,1,2,3,4,5,6].includes(n))
    ));

    // Erweiterte Sonderwünsche
    let iwdMinGap = Number(('iwdMinGap' in p) ? p.iwdMinGap : base.iwdMinGap);
    iwdMinGap = clamp(Math.round(iwdMinGap || base.iwdMinGap), 2, 7);

    let doubleIwdPref = Number(('doubleIwdPref' in p) ? p.doubleIwdPref : base.doubleIwdPref);
    if (![ -1, 0, 1 ].includes(doubleIwdPref)) doubleIwdPref = 0;

    let extraRestAfterIWD = Number(('extraRestAfterIWD' in p) ? p.extraRestAfterIWD : base.extraRestAfterIWD);
    extraRestAfterIWD = clamp(Math.round(extraRestAfterIWD || 0), 0, 2);

    const preferWork = Array.isArray(p.preferWorkDows) ? p.preferWorkDows : [];
    const preferWorkDows = Array.from(new Set(
      preferWork.map(n => Number(n)).filter(n => [0,1,2,3,4,5,6].includes(n))
    ));

    let weekendBias = Number(('weekendBias' in p) ? p.weekendBias : base.weekendBias);
    if (![ -1, 0, 1 ].includes(weekendBias)) weekendBias = 0;

    const normLimit = (v) => {
      if (v === null || typeof v === 'undefined' || v === '') return null;
      const n = Math.round(Number(v));
      if (!Number.isFinite(n)) return null;
      return clamp(n, 0, 31);
    };

    const maxIwdPerWeek = normLimit(('maxIwdPerWeek' in p) ? p.maxIwdPerWeek : base.maxIwdPerWeek);
    const maxTdPerWeek  = normLimit(('maxTdPerWeek'  in p) ? p.maxTdPerWeek  : base.maxTdPerWeek);
    const maxIwdPerMonth = normLimit(('maxIwdPerMonth' in p) ? p.maxIwdPerMonth : base.maxIwdPerMonth);
    const maxTdPerMonth  = normLimit(('maxTdPerMonth'  in p) ? p.maxTdPerMonth  : base.maxTdPerMonth);

    return {
      allowIWD,
      allowTD,
      tdBias,
      bannedDows,
      iwdMinGap,
      doubleIwdPref,
      extraRestAfterIWD,
      preferWorkDows,
      weekendBias,
      maxIwdPerWeek,
      maxTdPerWeek,
      maxIwdPerMonth,
      maxTdPerMonth,
    };
  }

  function parseWishText(text){
    const base = defaultEmpPrefs();
    const t = String(text || '')
      .toLowerCase()
      .replace(/[\n\r\t]/g, ' ')
      .replace(/[.,;]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!t) return base;

    const prefs = { ...base };

    // --- Schichtarten ---
    // Beispiele: "kein TD", "nur IWD", "keine TD"
    if (/(kein|keine|ohne|no)\s*td\b/.test(t) || /\bnur\s*iwd\b/.test(t)) prefs.allowTD = false;

    // Beispiele: "kein IWD", "nur TD"
    if (/(kein|keine|ohne|no)\s*iwd\b/.test(t) || /\bnur\s*td\b/.test(t)) prefs.allowIWD = false;

    // --- Präferenzen ---
    const preferTd  = /\b(mehr|bevorzugt)\s*td\b/.test(t)  || /\btd\s*>\s*iwd\b/.test(t);
    const preferIwd = /\b(mehr|bevorzugt)\s*iwd\b/.test(t) || /\biwd\s*>\s*td\b/.test(t);
    if (preferTd && !preferIwd) prefs.tdBias = 1;
    if (preferIwd && !preferTd) prefs.tdBias = -1;

    // --- Tage sperren ---
    // Beispiele: "nie Mo", "nicht Dienstag", "kein Montag"
    const dayDefs = [
      { dow: 1, keys: ['mo','montag'] },
      { dow: 2, keys: ['di','dienstag'] },
      { dow: 3, keys: ['mi','mittwoch'] },
      { dow: 4, keys: ['do','donnerstag'] },
      { dow: 5, keys: ['fr','freitag'] },
      { dow: 6, keys: ['sa','samstag'] },
      { dow: 0, keys: ['so','sonntag'] },
    ];

    const banned = new Set();

    if (/\b(nie|kein|keine|nicht)\s+(am\s+)?(wochenende|weekend)\b/.test(t)){
      banned.add(6); // Sa
      banned.add(0); // So
    }

    for (const def of dayDefs){
      for (const k of def.keys){
        const re = new RegExp(`\\b(nie|kein|keine|nicht)\\s+(am\\s+)?(${k})\\b`);
        if (re.test(t)) banned.add(def.dow);
      }
    }

    prefs.bannedDows = Array.from(banned);

    // --- IWD Muster / Erholung ---
    // Beispiele: "doppel IWD" (IWD, /, IWD, /)
    //            "kein doppel IWD" (nach / noch ein Tag frei)
    const noDouble = /\b(kein|keine|ohne|nicht)\s+(doppel|double)\s*iwd\b/.test(t)
      || /\bnach\s*\/\s*(noch\s*)?frei\b/.test(t)
      || /\bnach\s*iwd\s*(noch\s*)?frei\b/.test(t)
      || /\b(2|zwei)\s*(freie|frei)\s*(tage|tag)?\s*(nach|nach\s+dem)\s*iwd\b/.test(t);

    const yesDouble = !noDouble && (/\b(doppel|double)\s*iwd\b/.test(t) || /\biwd\s*\/\s*iwd\b/.test(t));

    if (noDouble){
      prefs.doubleIwdPref = -1;
      prefs.iwdMinGap = 3;
      prefs.extraRestAfterIWD = 1;
    } else if (yesDouble){
      prefs.doubleIwdPref = 1;
      prefs.iwdMinGap = 2;
      prefs.extraRestAfterIWD = 0;
    }

    // --- bevorzugter Dienst-Tag (weich) ---
    // Beispiele: "montags dienst", "jeden Freitag Dienst", "immer Di"
    const prefer = new Set();
    const preferDefs = [
      { dow: 1, keys: ['mo','montag','montags'] },
      { dow: 2, keys: ['di','dienstag','dienstags'] },
      { dow: 3, keys: ['mi','mittwoch','mittwochs'] },
      { dow: 4, keys: ['do','donnerstag','donnerstags'] },
      { dow: 5, keys: ['fr','freitag','freitags'] },
      { dow: 6, keys: ['sa','samstag','samstags'] },
      { dow: 0, keys: ['so','sonntag','sonntags'] },
    ];

    for (const def of preferDefs){
      for (const k of def.keys){
        const re1 = new RegExp(`\\b(jeden|immer)\\s+(am\\s+)?(${k})\\b`);
        const re2 = new RegExp(`\\b(${k})\\s*(dienst|schicht)\\b`);
        const re3 = new RegExp(`\\b(${k})\\b\\s*dienst\\b`);
        if (re1.test(t) || re2.test(t) || re3.test(t)){
          prefer.add(def.dow);
        }
      }
    }

    // "montags" etc.
    for (const def of preferDefs){
      for (const k of def.keys){
        if (k.endsWith('s')){
          const re = new RegExp(`\\b(${k})\\b`);
          if (re.test(t)) prefer.add(def.dow);
        }
      }
    }

    prefs.preferWorkDows = Array.from(prefer);

    // --- Wochenende weich bevorzugt/ungern ---
    if (/\b(wochenende|weekend)\s*(bevorzugt|gern|lieber|ok)\b/.test(t) || /\b(bevorzugt)\s*(am\s+)?(wochenende|weekend)\b/.test(t)){
      prefs.weekendBias = 1;
    }
    if (/\b(wochenende|weekend)\s*(ungern|lieber\s*nicht)\b/.test(t) || /\b(ungern)\s*(am\s+)?(wochenende|weekend)\b/.test(t)){
      prefs.weekendBias = -1;
    }

    // --- Limits (max pro Woche/Monat) ---
    // Beispiele: "max 1 IWD pro Woche", "max 2 TD Monat"
    const limitRe = /\bmax\s*(\d+)\s*(iwd|td)\s*(pro\s*)?(woche|wk|monat|mon)\b/g;
    for (const m of t.matchAll(limitRe)){
      const num = clamp(Math.round(Number(m[1])), 0, 31);
      const kind = m[2];
      const per = m[4];
      const isWeek = (per === 'woche' || per === 'wk');
      const isMonth = (per === 'monat' || per === 'mon');
      if (kind === 'iwd' && isWeek) prefs.maxIwdPerWeek = num;
      if (kind === 'td' && isWeek) prefs.maxTdPerWeek = num;
      if (kind === 'iwd' && isMonth) prefs.maxIwdPerMonth = num;
      if (kind === 'td' && isMonth) prefs.maxTdPerMonth = num;
    }

    // Spezial: "nur Wochenende" => unter der Woche nicht einplanen
    if (/\bnur\s+(am\s+)?(wochenende|weekend)\b/.test(t)){
      // sperre Mo-Fr
      prefs.bannedDows = Array.from(new Set([...(prefs.bannedDows || []), 1,2,3,4,5]));
    }

    return prefs;
  }


function normalizeEmployee(emp){
    const basePrefs = defaultEmpPrefs();

    const safe = {
      id: emp && emp.id ? String(emp.id) : makeId(),
      name: String(emp && emp.name ? emp.name : '').trim() || 'Unbenannt',
      weeklyHours: clamp(Number(emp && emp.weeklyHours ? emp.weeklyHours : 0), 0, 80),
      // Stundenkonto: positive Zahl = Überstunden, negative = Minusstunden
      balanceHours: round1(clamp(Number(((emp && (emp.balanceHours ?? emp.overtimeHours ?? emp.stundenkonto)) ?? 0)), -10000, 10000)),
      wishText: String(emp && (emp.wishText ?? emp.wishes ?? '') ? (emp.wishText ?? emp.wishes) : '').trim(),
      prefs: sanitizePrefs(emp && emp.prefs ? emp.prefs : basePrefs),
    };

    // Keep weeklyHours to sensible values; still allow any number, but we round to 1.
    safe.weeklyHours = round1(safe.weeklyHours);

    // Merge parsed wishText rules (wishText overrides prefs)
    const parsed = parseWishText(safe.wishText);
    safe.prefs = sanitizePrefs({ ...safe.prefs, ...parsed });

    return safe;
  }


  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();

      const parsed = JSON.parse(raw);
      const base = defaultState();

      const state = {
        ...base,
        ...parsed,
        settings: safeSettings(parsed.settings, base.settings),
        employees: Array.isArray(parsed.employees) ? parsed.employees.map(normalizeEmployee) : [],
        blocksByMonth: safeRecord(parsed.blocksByMonth),
        tdRequiredByMonth: safeRecord(parsed.tdRequiredByMonth),
        lastResultByMonth: safeRecord(parsed.lastResultByMonth),
      };

      // Normalize month
      if (typeof state.month !== 'string' || !/^\d{4}-\d{2}$/.test(state.month)) {
        state.month = base.month;
      }

      // Normalize settings
      state.settings.attempts = clamp(Math.round(Number(state.settings.attempts || 10000)), 10, 1000000);
      state.settings.preferGaps = Boolean(state.settings.preferGaps);

      return state;
    }catch(e){
      console.warn('State konnte nicht geladen werden, nutze Default.', e);
      return defaultState();
    }
  }

  let state = loadState();

  function saveState(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      scheduleCacheWrite();
    }catch(e){
      console.warn('State konnte nicht gespeichert werden.', e);
    }
  }


  // ---------- Cache-Datei (optional, File System Access API) ----------
  // Hinweis: Browser dürfen nicht still "in den Ordner" schreiben. Mit der File System Access API
  // kann der User aber eine Datei auswählen – danach kann automatisch gespeichert werden.
  const CACHE_DB = 'dienstplan_generator_cache_db_v1';
  const CACHE_STORE = 'kv';
  const CACHE_KEY_HANDLE = 'cacheFileHandle';
  const CACHE_KEY_DIR_HANDLE = 'cacheDirHandle';
  const CACHE_KEY_LOG_HANDLE = 'cacheLogHandle';
  const CACHE_FILE_NAME = 'dienstplan_cache.json';
  const CACHE_LOG_NAME = 'dienstplan_cache.log';

  let cacheFileHandle = null;
  let cacheDirHandle = null;
  let cacheLogHandle = null;
  let cacheWriteTimer = null;

  function idbOpen(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(CACHE_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(CACHE_STORE)){
          db.createObjectStore(CACHE_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(key){
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readonly');
      const st = tx.objectStore(CACHE_STORE);
      const req = st.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  }

  async function idbSet(key, value){
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      const st = tx.objectStore(CACHE_STORE);
      const req = st.put(value, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  }

  async function idbDel(key){
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      const st = tx.objectStore(CACHE_STORE);
      const req = st.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  }

  function projectSnapshot(){
    // Nur das Nötigste speichern (Plan-Ergebnisse werden nicht mitgespeichert, kann man neu generieren).
    return {
      version: state.version || 3,
      month: state.month,
      settings: state.settings,
      employees: state.employees,
      blocksByMonth: state.blocksByMonth,
      tdRequiredByMonth: state.tdRequiredByMonth,
      exportedAt: new Date().toISOString(),
    };
  }

  function loadProjectObject(obj){
    const base = defaultState();
    state = {
      ...base,
      ...obj,
      settings: safeSettings(obj && obj.settings, base.settings),
      employees: Array.isArray(obj.employees) ? obj.employees.map(normalizeEmployee) : [],
      blocksByMonth: safeRecord(obj && obj.blocksByMonth),
      tdRequiredByMonth: safeRecord(obj && obj.tdRequiredByMonth),
      lastResultByMonth: {}, // immer leer, neu generieren
    };

    // Normalize month
    if (typeof state.month !== 'string' || !/^\d{4}-\d{2}$/.test(state.month)) {
      state.month = base.month;
    }

    // Normalize settings
    state.settings.attempts = clamp(Math.round(Number(state.settings.attempts || 10000)), 10, 1000000);
    state.settings.preferGaps = Boolean(state.settings.preferGaps);

    ensureMonthStructures(state.month);

    saveState();
    renderAll();
  }

  function cacheApiSupported(){
    const filePicker = window.showDirectoryPicker || window.showSaveFilePicker;
    return !!(filePicker && window.FileSystemFileHandle && window.indexedDB);
  }

  function setCacheStatus(msg){
    if (!cacheStatusEl) return;
    cacheStatusEl.innerHTML = msg || '';
  }

  function setCacheError(msg){
    setCacheStatus(`⚠️ ${escapeHtml(msg)}. Nutze Export/Import.`);
  }

  function updateCacheUi(){
    if (!cacheCardEl) return;

    const supported = cacheApiSupported();

    if (cacheSupportEl){
      if (supported){
        if (window.showDirectoryPicker){
          cacheSupportEl.innerHTML = `✅ Dein Browser unterstützt die Cache-Datei-Funktion. Wähle den App-Ordner, damit Cache und Log dort gespeichert werden.`;
        } else {
          cacheSupportEl.innerHTML = `✅ Dein Browser unterstützt die Cache-Datei-Funktion. Wähle nach Möglichkeit denselben Ordner wie die App.`;
        }
      } else {
        cacheSupportEl.innerHTML = `ℹ️ Dein Browser unterstützt das direkte Schreiben in eine Datei evtl. nicht. Nutze dann bitte Export/Import.`;
      }
    }

    const connected = !!cacheFileHandle;

    if (connectCacheBtn) connectCacheBtn.disabled = !supported;
    if (loadCacheBtn) loadCacheBtn.disabled = !supported || !connected;
    if (saveCacheBtn) saveCacheBtn.disabled = !supported || !connected;
    if (disconnectCacheBtn) disconnectCacheBtn.disabled = !supported || !connected;

    if (connected){
      const details = cacheDirHandle ? 'Ordner ausgewählt' : 'Datei ausgewählt';
      setCacheStatus(`Verbunden: <strong>${CACHE_FILE_NAME}</strong> (${details}, Auto-Speichern aktiv)`);
    } else {
      setCacheStatus(`Nicht verbunden.`);
    }
  }

  async function ensureCacheHandleLoaded(){
    try{
      if (!cacheApiSupported()){
        updateCacheUi();
        return;
      }

      const [handle, dirHandle, logHandle] = await Promise.all([
        idbGet(CACHE_KEY_HANDLE),
        idbGet(CACHE_KEY_DIR_HANDLE),
        idbGet(CACHE_KEY_LOG_HANDLE),
      ]);
      if (dirHandle) cacheDirHandle = dirHandle;
      if (handle) cacheFileHandle = handle;
      if (logHandle) cacheLogHandle = logHandle;
      updateCacheUi();
    }catch(e){
      console.warn('Cache-Handle konnte nicht geladen werden', e);
      cacheFileHandle = null;
      cacheDirHandle = null;
      cacheLogHandle = null;
      setCacheError('Cache-Handle konnte nicht geladen werden');
      updateCacheUi();
    }
  }

  async function connectCacheFile(){
    if (!cacheApiSupported()){
      alert('Dein Browser unterstützt diese Funktion nicht. Bitte Export/Import nutzen.');
      return;
    }

    try{
      if (window.showDirectoryPicker){
        cacheDirHandle = await window.showDirectoryPicker();
        cacheFileHandle = await cacheDirHandle.getFileHandle(CACHE_FILE_NAME, { create: true });
        cacheLogHandle = await cacheDirHandle.getFileHandle(CACHE_LOG_NAME, { create: true });
        await Promise.all([
          idbSet(CACHE_KEY_DIR_HANDLE, cacheDirHandle),
          idbSet(CACHE_KEY_HANDLE, cacheFileHandle),
          idbSet(CACHE_KEY_LOG_HANDLE, cacheLogHandle),
        ]);
      }else{
        cacheFileHandle = await window.showSaveFilePicker({
          suggestedName: CACHE_FILE_NAME,
          types: [
            { description: 'JSON', accept: { 'application/json': ['.json'] } }
          ],
        });
        cacheDirHandle = null;
        cacheLogHandle = null;
        await Promise.all([
          idbSet(CACHE_KEY_HANDLE, cacheFileHandle),
          idbSet(CACHE_KEY_DIR_HANDLE, null),
          idbSet(CACHE_KEY_LOG_HANDLE, null),
        ]);
      }

      await saveToCacheFile(); // initial write
      await appendCacheLog('Cache-Datei verbunden.');
      updateCacheUi();
    }catch(e){
      // User cancelled => ignore
      console.warn('Cache-Datei verbinden abgebrochen/fehlgeschlagen', e);
      setCacheError('Cache-Datei verbinden fehlgeschlagen');
      updateCacheUi();
    }
  }

  async function disconnectCacheFile(){
    await appendCacheLog('Cache-Datei getrennt.');
    cacheFileHandle = null;
    cacheDirHandle = null;
    cacheLogHandle = null;
    try{
      await Promise.all([
        idbDel(CACHE_KEY_HANDLE),
        idbDel(CACHE_KEY_DIR_HANDLE),
        idbDel(CACHE_KEY_LOG_HANDLE),
      ]);
    }catch(e){
      console.warn('Cache-Handle konnte nicht gelöscht werden', e);
      setCacheError('Cache-Handle konnte nicht gelöscht werden');
    }
    updateCacheUi();
  }

  async function saveToCacheFile(){
    if (!cacheFileHandle) return;
    try{
      const perm = await cacheFileHandle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return;

      const writable = await cacheFileHandle.createWritable();
      await writable.write(JSON.stringify(projectSnapshot(), null, 2));
      await writable.close();

      await appendCacheLog('Cache-Datei gespeichert.');
      setCacheStatus(`Verbunden: <strong>${CACHE_FILE_NAME}</strong> (zuletzt gespeichert: ${new Date().toLocaleString()})`);
    }catch(e){
      console.warn('In Cache-Datei speichern fehlgeschlagen', e);
      setCacheError('Speichern in Cache-Datei fehlgeschlagen');
      await appendCacheLog(`Fehler beim Speichern: ${String(e && e.message ? e.message : e)}`);
    }
  }

  async function loadFromCacheFile(){
    if (!cacheFileHandle) return;
    try{
      const perm = await cacheFileHandle.requestPermission({ mode: 'read' });
      if (perm !== 'granted') return;

      const file = await cacheFileHandle.getFile();
      const text = await file.text();
      const obj = JSON.parse(text);

      if (!obj || typeof obj !== 'object') throw new Error('Ungültige Cache-Datei.');

      loadProjectObject(obj);
      await appendCacheLog('Cache-Datei geladen.');
      setCacheStatus(`✅ Aus Cache-Datei geladen (${new Date().toLocaleString()})`);
    }catch(e){
      console.warn('Aus Cache-Datei laden fehlgeschlagen', e);
      setCacheError('Laden fehlgeschlagen');
      await appendCacheLog(`Fehler beim Laden: ${String(e && e.message ? e.message : e)}`);
    }
  }

  async function appendCacheLog(message){
    if (!cacheLogHandle) return;
    try{
      const perm = await cacheLogHandle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return;
      const file = await cacheLogHandle.getFile();
      const writable = await cacheLogHandle.createWritable({ keepExistingData: true });
      await writable.seek(file.size);
      const stamp = new Date().toISOString();
      await writable.write(`[${stamp}] ${message}\n`);
      await writable.close();
    }catch(e){
      console.warn('Logdatei konnte nicht geschrieben werden', e);
    }
  }

  function scheduleCacheWrite(){
    if (!cacheFileHandle) return;
    if (cacheWriteTimer) clearTimeout(cacheWriteTimer);
    cacheWriteTimer = setTimeout(() => {
      saveToCacheFile();
    }, 900);
  }



  function ensureMonthStructures(monthKey){
    if (!state.blocksByMonth[monthKey]) state.blocksByMonth[monthKey] = {};
    if (!state.tdRequiredByMonth[monthKey]) state.tdRequiredByMonth[monthKey] = {};
    if (!state.lastResultByMonth[monthKey]) state.lastResultByMonth[monthKey] = null;
  }

  ensureMonthStructures(state.month);

  // ---------- Blocks (Month) ----------
  function getBlock(monthKey, empId, isoDate){
    const mb = state.blocksByMonth[monthKey];
    if (!mb) return BLOCK.NONE;
    const eb = mb[empId];
    if (!eb) return BLOCK.NONE;
    return eb[isoDate] || BLOCK.NONE;
  }

  function setBlock(monthKey, empId, isoDate, value){
    ensureMonthStructures(monthKey);
    state.blocksByMonth[monthKey][empId] = state.blocksByMonth[monthKey][empId] || {};
    const eb = state.blocksByMonth[monthKey][empId];

    if (!value || value === BLOCK.NONE){
      delete eb[isoDate];
      // cleanup
      if (Object.keys(eb).length === 0){
        delete state.blocksByMonth[monthKey][empId];
      }
    } else {
      eb[isoDate] = value;
    }
  }

  function countBlocks(monthKey, empId, value){
    const mb = state.blocksByMonth[monthKey];
    const eb = mb && mb[empId] ? mb[empId] : null;
    if (!eb) return 0;
    let c = 0;
    for (const v of Object.values(eb)){
      if (v === value) c += 1;
    }
    return c;
  }

  // ---------- TD Pflicht (pro Tag, global) ----------
  function getTdRequired(monthKey, isoDate){
    const m = state.tdRequiredByMonth && state.tdRequiredByMonth[monthKey];
    if (!m) return false;
    return Boolean(m[isoDate]);
  }

  function setTdRequired(monthKey, isoDate, required){
    ensureMonthStructures(monthKey);
    const m = state.tdRequiredByMonth[monthKey];
    if (!required){
      delete m[isoDate];
    } else {
      m[isoDate] = true;
    }
  }

  // ---------- UI Elements ----------
  const monthSelectEl = $('#monthSelect');
  const attemptsInputEl = $('#attemptsInput');
  const preferGapsEl = $('#preferGaps');

  const newEmpNameEl = $('#newEmpName');
  const newEmpHoursEl = $('#newEmpHours');
  const addEmpBtn = $('#addEmpBtn');

  const generateBtn = $('#generateBtn');
  const clearBtn = $('#clearBtn');
  const printBtn = $('#printBtn');

  // Progress UI
  const progressWrapEl = $('#progressWrap');
  const progressBarEl = $('#progressBar');
  const progressTextEl = $('#progressText');
  const progressPctEl = $('#progressPct');

  const exportBtn = $('#exportBtn');
  const importFileEl = $('#importFile');

  // Cache-Datei Integration (optional)
  const cacheCardEl = $('#cacheCard');
  const cacheSupportEl = $('#cacheSupport');
  const cacheStatusEl = $('#cacheStatus');
  const connectCacheBtn = $('#connectCacheBtn');
  const loadCacheBtn = $('#loadCacheBtn');
  const saveCacheBtn = $('#saveCacheBtn');
  const disconnectCacheBtn = $('#disconnectCacheBtn');

  const employeeListEl = $('#employeeList');
  const blockTableEl = $('#blockTable');

  const messagesEl = $('#messages');
  const printHeaderEl = $('#printHeader');
  const planTableEl = $('#planTable');
  const hoursTableEl = $('#hoursTable');
  const printHoursNotesEl = $('#printHoursNotes');

  // ---------- Progress helpers ----------
  function setProgressVisible(visible){
    if (!progressWrapEl) return;
    progressWrapEl.classList.toggle('hidden', !visible);
  }

  function updateProgress(done, total, extra){
    if (!progressWrapEl) return;
    const safeTotal = Math.max(1, Number(total) || 1);
    const safeDone = clamp(Number(done) || 0, 0, safeTotal);
    const pct = Math.floor((safeDone / safeTotal) * 100);

    if (progressBarEl) progressBarEl.style.width = `${pct}%`;
    if (progressPctEl) progressPctEl.textContent = `${pct}%`;

    if (progressTextEl){
      const base = `Berechnung läuft: ${safeDone} / ${safeTotal} Versuche`;
      progressTextEl.textContent = extra ? `${base} · ${extra}` : base;
    }
  }

  function resetProgress(){
    if (!progressWrapEl) return;
    if (progressBarEl) progressBarEl.style.width = `0%`;
    if (progressPctEl) progressPctEl.textContent = `0%`;
    if (progressTextEl) progressTextEl.textContent = `Bereit.`;
  }

  function nextFrame(){
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame === 'function'){
        requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 0);
      }
    });
  }



  // ---------- Render ----------
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }[ch]));
  }

  function renderDateCellHtml(day, { isHoliday = false, isSunday = false, holidayName = '', tdReq = false } = {}){
    const dd = pad2(day.date.getDate());
    const mm = pad2(day.date.getMonth() + 1);
    const yyyy = day.date.getFullYear();

    const numCls = isHoliday ? 'date-num holiday' : (isSunday ? 'date-num sunday' : 'date-num');
    const title = holidayName ? `title="${escapeHtml(holidayName)}"` : '';
    const tdMark = tdReq ? `<span class="tdreq-mark" title="TD an diesem Tag ist verpflichtend">TD!</span>` : '';

    return `
      <div class="datecell">
        <span class="weekday">${escapeHtml(WEEKDAY_SHORT[day.dow])}</span>
        <span class="${numCls}" ${title}>${dd}</span><span class="date-sep">.</span>
        <span class="date-mm">${mm}</span><span class="date-sep">.</span>
        <span class="date-yy">${yyyy}</span>
        ${tdMark}
      </div>
    `.trim();
  }

  function deltaBadgeHtml(delta){
    // Kleine Visualisierung für +/- Abweichung (zum Ziel inkl. Konto)
    const d = round1(Number(delta || 0));
    let cls = 'ok';
    if (d >= -10 && d <= 4) cls = 'ok';
    else if (d >= -20 && d <= 12) cls = 'warn';
    else cls = 'danger';
    const sign = d > 0 ? '+' : '';
    return `<span class="badge ${cls}">${sign}${d}h</span>`;
  }

  function dowShort(dow){
    return ['So','Mo','Di','Mi','Do','Fr','Sa'][dow] || String(dow);
  }

  function describePrefs(prefs){
    const p = sanitizePrefs(prefs);
    const parts = [];

    if (p.allowTD === false) parts.push('kein TD');
    if (p.allowIWD === false) parts.push('kein IWD');
    if (p.tdBias === 1) parts.push('mehr TD');
    if (p.tdBias === -1) parts.push('mehr IWD');

    if (p.bannedDows && p.bannedDows.length){
      parts.push(`nie: ${p.bannedDows.map(dowShort).join(', ')}`);
    }

    // IWD-Abstände / Muster
    if (p.doubleIwdPref === 1) parts.push('Doppel-IWD bevorzugt');
    if (p.doubleIwdPref === -1) parts.push('kein Doppel-IWD');
    if (p.extraRestAfterIWD >= 1) parts.push('nach IWD extra frei');
    if (Number.isFinite(p.iwdMinGap) && p.iwdMinGap !== 4) parts.push(`IWD Abstand ≥${p.iwdMinGap}d`);

    // bevorzugte Tage
    if (p.preferWorkDows && p.preferWorkDows.length){
      parts.push(`bevorzugt: ${p.preferWorkDows.map(dowShort).join(', ')}`);
    }

    // Wochenend-Bias
    if (p.weekendBias === 1) parts.push('Wochenende bevorzugt');
    if (p.weekendBias === -1) parts.push('Wochenende ungern');

    // Limits
    if (p.maxIwdPerWeek !== null && typeof p.maxIwdPerWeek === 'number') parts.push(`max IWD/Woche: ${p.maxIwdPerWeek}`);
    if (p.maxTdPerWeek !== null && typeof p.maxTdPerWeek === 'number') parts.push(`max TD/Woche: ${p.maxTdPerWeek}`);
    if (p.maxIwdPerMonth !== null && typeof p.maxIwdPerMonth === 'number') parts.push(`max IWD/Monat: ${p.maxIwdPerMonth}`);
    if (p.maxTdPerMonth !== null && typeof p.maxTdPerMonth === 'number') parts.push(`max TD/Monat: ${p.maxTdPerMonth}`);

    return parts.length ? parts.join(' • ') : 'keine besonderen Regeln';
  }

  // Tooltip-Inhalt für Sonderwünsche (UI)
  const WISH_HELP_TOOLTIP_HTML = `
    <span class="info-icon" tabindex="0" aria-label="Info: Sonderwünsche">i
      <span class="tooltip">
        <strong>Erkannte Sonderwünsche</strong>
        <ul>
          <li><code>kein TD</code> / <code>nur IWD</code></li>
          <li><code>kein IWD</code> / <code>nur TD</code></li>
          <li><code>mehr TD</code> / <code>mehr IWD</code></li>
          <li><code>nie Mo</code>, <code>nie Dienstag</code>, <code>nie Wochenende</code></li>
          <li><code>doppel IWD</code> (IWD, /, IWD, /)</li>
          <li><code>kein doppel IWD</code> (nach / noch ein Tag frei)</li>
          <li><code>montags dienst</code> / <code>jeden Freitag Dienst</code> (weich)</li>
          <li><code>wochenende bevorzugt</code> / <code>wochenende ungern</code> (weich)</li>
          <li><code>max 1 IWD pro Woche</code> / <code>max 3 TD Monat</code></li>
        </ul>
      </span>
    </span>
  `;


  function renderAll(){
    // Inputs
    monthSelectEl.value = state.month;
    attemptsInputEl.value = state.settings.attempts;
    preferGapsEl.checked = state.settings.preferGaps;

    renderEmployeeList();
    renderBlockTable();
    renderOutput();
  }

  
function renderEmployeeList(){
    if (state.employees.length === 0){
      employeeListEl.innerHTML = `<div class="hint">Noch keine Mitarbeiter angelegt.</div>`;
      return;
    }

    const cards = state.employees.map(emp => {
      const daily = round1(emp.weeklyHours / 5);
      const prefs = sanitizePrefs(emp.prefs);
      const desc = describePrefs(prefs);

      return `
        <div class="emp-card" data-emp-id="${escapeHtml(emp.id)}">
          <div class="top">
            <div class="name">
              <input type="text" data-field="name" value="${escapeHtml(emp.name)}" />
            </div>
            <button class="btn danger smallbtn" data-action="remove-emp" data-emp-id="${escapeHtml(emp.id)}" type="button">Entfernen</button>
          </div>

          <div class="emp-row">
            <label class="field">
              <span>Wochenstunden</span>
              <input type="number" min="0" max="80" step="1" data-field="weeklyHours" value="${escapeHtml(emp.weeklyHours)}" />
            </label>

            <label class="field">
              <span>Stundenkonto (+/-)</span>
              <input type="number" step="1" data-field="balanceHours" value="${escapeHtml(emp.balanceHours ?? 0)}" />
            </label>
          </div>

          <div class="emp-small">
            Frei-mit-Stunden (Mo–Fr): <strong>${daily}h</strong> pro Wochentag
          </div>

          <details>
            <summary>Sonderwünsche (optional)</summary>

            <label class="field">
              <span class="wish-label">Wünsche / Regeln ${WISH_HELP_TOOLTIP_HTML}</span>
              <textarea data-field="wishText" placeholder="z.B. kein TD, mehr TD, nie Mo, doppel IWD, max 1 IWD pro Woche">${escapeHtml(emp.wishText || '')}</textarea>
            </label>

            <div class="prefs-parsed" data-role="prefsParsed"><strong>Erkannt:</strong> ${escapeHtml(desc)}</div>
          </details>
        </div>
      `;
    }).join('');

    employeeListEl.innerHTML = cards;
  }


  function renderBlockTable(){
    const monthKey = state.month;
    const days = getMonthDays(monthKey);
    const holMap = holidayMapForMonth(monthKey);

    if (state.employees.length === 0){
      blockTableEl.innerHTML = `
        <thead><tr><th>Datum</th></tr></thead>
        <tbody><tr><td class="hint">Bitte zuerst Mitarbeiter hinzufügen.</td></tr></tbody>
      `;
      return;
    }

    const thead = `
      <thead>
        <tr>
          <th class="sticky-col" style="min-width: 170px;">Datum</th>
          <th class="sticky-col2" style="min-width: 92px;">TD Pflicht</th>
          ${state.employees.map(emp => `<th style="min-width: 220px;">${escapeHtml(emp.name)}</th>`).join('')}
        </tr>
      </thead>
    `;

    const rows = days.map(day => {
      const holidayName = holMap[day.iso] || '';
      const isHoliday = Boolean(holidayName);
      const isSunday = (day.dow === 0);
      const tdReq = getTdRequired(monthKey, day.iso);

      const rowCls = [isSunday ? 'row-sunday' : '', isHoliday ? 'row-holiday' : ''].filter(Boolean).join(' ');

      const dateHtml = renderDateCellHtml(day, { isHoliday, isSunday, holidayName, tdReq });
      const cells = state.employees.map(emp => {
        const st = getBlock(monthKey, emp.id, day.iso);

        const btn0Active = st === BLOCK.FREE0 ? 'active' : '';
        const btnWfActive = st === BLOCK.WF ? 'active' : '';
        const btnHActive = st === BLOCK.FREEH ? 'active' : '';

        const creditHint = isWeekday(day.date) ? `+${round1(emp.weeklyHours/5)}h` : `+0h`;

        return `
          <td>
            <div class="toggle2" data-emp-id="${escapeHtml(emp.id)}" data-iso="${escapeHtml(day.iso)}">
              <button class="tbtn t0 ${btn0Active}" data-action="set-block" data-value="${BLOCK.FREE0}" title="Frei ohne Stunden (Stunden werden in der Woche verschoben)">Frei</button>
              <button class="tbtn twf ${btnWfActive}" data-action="set-block" data-value="${BLOCK.WF}" title="WF = Wunschfrei (Priorität, max. 3× pro Person/Monat)">WF</button>
              <button class="tbtn th ${btnHActive}" data-action="set-block" data-value="${BLOCK.FREEH}" title="Urlaub / bezahlt frei (${creditHint} an Werktagen)">Urlaub</button>
            </div>
          </td>
        `;
      }).join('');

      return `
        <tr class="${rowCls}">
          <td class="sticky-col">${dateHtml}</td>
          <td class="sticky-col2">
            <label class="tdreq">
              <input type="checkbox" data-action="toggle-td-required" data-iso="${escapeHtml(day.iso)}" ${tdReq ? 'checked' : ''} />
              <span>TD</span>
            </label>
          </td>
          ${cells}
        </tr>
      `;
    }).join('');

    blockTableEl.innerHTML = `${thead}<tbody>${rows}</tbody>`;
  }

  function renderOutput(){
    const monthKey = state.month;
    const res = state.lastResultByMonth[monthKey];

    if (!res){
      messagesEl.innerHTML = `<div class="hint">Noch kein Dienstplan generiert.</div>`;
      planTableEl.innerHTML = '';
      hoursTableEl.innerHTML = '';
      if (printHeaderEl) printHeaderEl.innerHTML = '';
      if (printHoursNotesEl) printHoursNotesEl.innerHTML = '';
      if (printBtn) printBtn.disabled = true;
      return;
    }

    // Messages
    if (!res.messages || res.messages.length === 0){
      messagesEl.innerHTML = `<div class="msg"><strong>Info</strong> Plan wurde generiert.</div>`;
    } else {
      messagesEl.innerHTML = res.messages.map(m => {
        const cls = m.type === 'danger' ? 'danger' : (m.type === 'warn' ? 'warn' : '');
        return `<div class="msg ${cls}"><strong>${escapeHtml(m.title)}</strong><div>${escapeHtml(m.details)}</div></div>`;
      }).join('');
    }

    planTableEl.innerHTML = renderPlanTable(res);
    hoursTableEl.innerHTML = renderHoursTable(res);
    renderPrintNotes(res);

    if (printBtn) printBtn.disabled = false;

    if (printHeaderEl){
      const monthLabel = formatMonthLabelDE(res.monthKey);
      const gen = res.generatedAt ? new Date(res.generatedAt) : new Date();
      let genStr = '';
      try {
        genStr = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(gen);
      } catch {
        genStr = gen.toLocaleString();
      }
      printHeaderEl.innerHTML = `
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;">
          <div style="font-size:16px;font-weight:800;">Dienstplan – ${escapeHtml(monthLabel)}</div>
          <div class="muted" style="font-size:12px;">Stand: ${escapeHtml(genStr)}</div>
        </div>
      `;
    }
  }

  function buildPlanCell(res, empId, dayIdx){
    const monthKey = res.monthKey;
    const day = res.days[dayIdx];

    const iwdEmp = res.schedule.iwd[dayIdx];
    const tdEmp = res.schedule.td[dayIdx];

    if (iwdEmp === empId) return `<span class="badge iwd">IWD</span>`;
    if (tdEmp === empId) return `<span class="badge td">TD</span>`;

    const blk = getBlock(monthKey, empId, day.iso);
    const forced = res.forcedOff && res.forcedOff[empId] && res.forcedOff[empId][dayIdx];
    if (forced){
      const badges = [`<span class="badge off">/</span>`];
      if (blk === BLOCK.FREE0) badges.push(`<span class="badge free0">Frei</span>`);
      if (blk === BLOCK.WF) badges.push(`<span class="badge wf">WF</span>`);
      if (blk === BLOCK.FREEH){
        const emp = res.empById[empId];
        const credit = (emp && isWeekday(day.date)) ? round1(emp.weeklyHours / 5) : 0;
        const extra = (credit > 0) ? ` +${credit}h` : '';
        badges.push(`<span class="badge freeh">Urlaub${extra}</span>`);
      }
      return badges.join(' ');
    }

    if (blk === BLOCK.FREE0) return `<span class="badge free0">Frei</span>`;
    if (blk === BLOCK.WF) return `<span class="badge wf">WF</span>`;
    if (blk === BLOCK.FREEH){
      const emp = res.empById[empId];
      const credit = (emp && isWeekday(day.date)) ? round1(emp.weeklyHours / 5) : 0;
      const extra = (credit > 0) ? ` +${credit}h` : '';
      return `<span class="badge freeh">Urlaub${extra}</span>`;
    }

    return '';
  }

  function renderPlanTable(res){
    const monthKey = res.monthKey;
    const monthLabel = formatMonthLabelDE(monthKey);
    const holMap = holidayMapForMonth(monthKey);
    const days = res.days;
    const employees = res.employees;

    const thead = `
      <thead>
        <tr>
          <th class="sticky-col plan-head" style="min-width: 170px;">
            <span class="screen-only">Datum</span>
            <span class="print-only-inline plan-print-title">Dienstplan – ${escapeHtml(monthLabel)}</span>
          </th>
          ${employees.map(e => `<th style="min-width: 180px;">${escapeHtml(e.name)}</th>`).join('')}
        </tr>
      </thead>
    `;

    const rows = days.map((day, idx) => {
      const holidayName = holMap[day.iso] || '';
      const isHoliday = Boolean(holidayName);
      const isSunday = (day.dow === 0);
      const tdReq = getTdRequired(monthKey, day.iso);

      const rowCls = [isSunday ? 'row-sunday' : '', isHoliday ? 'row-holiday' : ''].filter(Boolean).join(' ');
      const dateHtml = renderDateCellHtml(day, { isHoliday, isSunday, holidayName, tdReq });

      const cells = employees.map(emp => `<td>${buildPlanCell(res, emp.id, idx)}</td>`).join('');
      return `
        <tr class="${rowCls}">
          <td class="sticky-col">${dateHtml}</td>
          ${cells}
        </tr>
      `;
    }).join('');

    // footer row: total hours per employee
    const totals = employees.map(emp => {
      const sum = res.monthSummaryByEmpId[emp.id]?.totalHours ?? 0;
      return `<td><strong>${round1(sum)}h</strong></td>`;
    }).join('');

    const tfoot = `
      <tfoot>
        <tr>
          <th class="sticky-col">Summe (Monat)</th>
          ${totals}
        </tr>
      </tfoot>
    `;

    return `${thead}<tbody>${rows}</tbody>${tfoot}`;
  }

  function renderHoursTable(res){
    const employees = res.employees;

    const thead = `
      <thead>
        <tr>
          <th style="min-width: 190px;">Mitarbeiter</th>
          <th>Wochenstunden</th>
          <th>Konto Start</th>
          <th>Korrektur*</th>
          <th>Ziel Vertrag</th>
          <th>Ziel inkl. Konto</th>
          <th>Gutschrift</th>
          <th>IWD</th>
          <th>TD</th>
          <th>Arbeitsstunden</th>
          <th>Gesamt</th>
          <th>Δ (zum Ziel inkl. Konto)</th>
          <th>Neues Konto</th>
        </tr>
      </thead>
    `;

    const rows = employees.map(emp => {
      const s = res.monthSummaryByEmpId[emp.id];
      if (!s) return '';

      const balStart = Number(s.balanceStart || 0);
      const balAdj = Number(s.balanceAdjust || 0);
      const balEnd = Number(s.balanceEnd || 0);

      const balStartStr = `${balStart > 0 ? '+' : ''}${round1(balStart)}`;
      const balAdjStr = `${balAdj > 0 ? '+' : ''}${round1(balAdj)}`;
      const balEndStr = `${balEnd > 0 ? '+' : ''}${round1(balEnd)}`;

      const deltaBadge = deltaBadgeHtml(s.deltaDesired);

      return `
        <tr>
          <th>${escapeHtml(emp.name)}</th>
          <td class="num">${round1(emp.weeklyHours)}</td>
          <td class="num">${balStartStr}</td>
          <td class="num">${balAdjStr}</td>
          <td class="num">${round1(s.contractTargetHours)}</td>
          <td class="num"><strong>${round1(s.targetHours)}</strong></td>
          <td class="num">${round1(s.creditHours)}</td>
          <td class="num">${s.iwdCount}</td>
          <td class="num">${s.tdCount}</td>
          <td class="num">${round1(s.workHours)}</td>
          <td class="num">${round1(s.totalHours)}</td>
          <td class="center">${deltaBadge}</td>
          <td class="num"><strong>${balEndStr}</strong></td>
        </tr>
      `;
    }).join('');

    const foot = `
      <tfoot>
        <tr>
          <th colspan="13" class="small">
            * Korrektur = ungefähr −(Konto)/12, gedeckelt auf ±20h/Monat.
            Ziel inkl. Konto = Monats-Ziel (Vertrag) + Korrektur.
          </th>
        </tr>
      </tfoot>
    `;

    return `${thead}<tbody>${rows}</tbody>${foot}`;
  }

  function renderPrintNotes(res){
    if (!printHoursNotesEl) return;
    if (!res){
      printHoursNotesEl.innerHTML = '';
      return;
    }

    const notes = [];
    const messages = Array.isArray(res.messages) ? res.messages : [];
    const overtimeWarns = messages.filter(m => m.type === 'warn' && /zu wenig Soll-Stunden/i.test(m.title || ''));
    for (const warn of overtimeWarns){
      notes.push({
        type: 'warn',
        title: warn.title || 'Hinweis',
        details: warn.details || '',
      });
    }

    const missingIwdDays = res.days
      .filter((day, idx) => !res.schedule.iwd[idx])
      .map(day => day.label);
    if (missingIwdDays.length){
      notes.push({
        type: 'danger',
        title: 'IWD nicht möglich',
        details: missingIwdDays.join(', '),
      });
    }

    const plannedTdDays = Array.isArray(res.plannedTdDays) ? res.plannedTdDays : [];
    const savedTdDays = plannedTdDays
      .filter(idx => !res.schedule.td[idx])
      .sort((a,b) => a - b)
      .map(idx => res.days[idx]?.label)
      .filter(Boolean);
    if (savedTdDays.length){
      notes.push({
        type: 'warn',
        title: 'Gesparte TD2',
        details: savedTdDays.join(', '),
      });
    }

    if (notes.length === 0){
      printHoursNotesEl.innerHTML = '';
      return;
    }

    const items = notes.map(note => {
      const cls = note.type === 'danger' ? 'danger' : 'warn';
      return `
        <li class="print-note ${cls}">
          <strong>${escapeHtml(note.title)}</strong>
          <div>${escapeHtml(note.details)}</div>
        </li>
      `.trim();
    }).join('');

    printHoursNotesEl.innerHTML = `
      <h3>Druck-Hinweise</h3>
      <ul class="print-note-list">${items}</ul>
    `.trim();
  }

  // ---------- Scheduling Logic ----------

  function balanceMonthlyAdjustment(balanceHours){
    // Positive balance = Überstunden (soll runter), negative = Minusstunden (soll rauf)
    // Ziel: ca. 1/12 pro Monat, aber max ±20h pro Monat.
    const b = Number(balanceHours) || 0;
    const adj = -b / 12;
    return round1(clamp(adj, -20, 20));
  }

  function buildMonthContext({ monthKey, days, segments, employees, settings }){
    const N = days.length;
    const segIdByDay = Array(N).fill(0);
    segments.forEach((seg, si) => {
      for (const idx of seg.indices){
        segIdByDay[idx] = si;
      }
    });

    const empDataById = {};

    for (const emp of employees){
      const prefs = sanitizePrefs(emp.prefs);
      const perWeekday = emp.weeklyHours / 5;

      const blockByDay = Array(N);
      const creditByDay = Array(N);
      const allowedByDay = Array(N);
      const preferWorkByDay = Array(N);

      for (let i = 0; i < N; i++){
        const day = days[i];
        const blk = getBlock(monthKey, emp.id, day.iso);
        blockByDay[i] = blk;
        creditByDay[i] = (isWeekday(day.date) && blk === BLOCK.FREEH) ? perWeekday : 0;
        allowedByDay[i] = !(prefs.bannedDows && prefs.bannedDows.includes(day.dow));
        preferWorkByDay[i] = Boolean(prefs.preferWorkDows && prefs.preferWorkDows.includes(day.dow));
      }

      const segContractTarget = segments.map(seg => emp.weeklyHours * (seg.weekdaysCount / 5));
      const segCredit = segments.map(seg => seg.indices.reduce((sum, idx) => sum + (creditByDay[idx] || 0), 0));

      const monthContractTarget = segContractTarget.reduce((a,b) => a + b, 0);
      const monthCredit = segCredit.reduce((a,b) => a + b, 0);

      const adjust = balanceMonthlyAdjustment(emp.balanceHours);
      const monthDesiredTarget = round1(Math.max(0, monthContractTarget + adjust));

      // Verteile die Monats-Korrektur anteilig auf Segmente (damit Wochenziele konsistent bleiben)
      const segDesiredTarget = segments.map((seg, si) => {
        if (monthContractTarget <= 0) return 0;
        const share = segContractTarget[si] / monthContractTarget;
        return Math.max(0, segContractTarget[si] + adjust * share);
      });
      // Rundungsdifferenz in letztes Segment schieben
      if (segments.length && monthContractTarget > 0){
        const sumDesired = segDesiredTarget.reduce((a,b) => a + b, 0);
        const diff = (monthDesiredTarget - sumDesired);
        const last = segDesiredTarget.length - 1;
        segDesiredTarget[last] = round1(Math.max(0, segDesiredTarget[last] + diff));
      }

      const segRequired = segments.map((seg, si) => Math.max(0, segDesiredTarget[si] - segCredit[si]));
      const monthRequired = segRequired.reduce((a,b) => a + b, 0);

      empDataById[emp.id] = {
        emp,
        prefs,
        perWeekday,
        blockByDay,
        creditByDay,
        allowedByDay,
        preferWorkByDay,
        segContractTarget,
        segCredit,
        segDesiredTarget,
        segRequired,
        monthContractTarget: round1(monthContractTarget),
        monthDesiredTarget: round1(monthDesiredTarget),
        monthCredit: round1(monthCredit),
        balanceStart: round1(Number(emp.balanceHours) || 0),
        balanceAdjust: round1(adjust),
        monthRequired: round1(monthRequired),
      };
    }

    // Segment totals for quick feasibility checks
    const segRequiredTotal = segments.map((seg, si) => {
      let total = 0;
      for (const emp of employees){
        total += empDataById[emp.id]?.segRequired[si] || 0;
      }
      return total;
    });

    // TD Pflicht (global pro Tag)
    const tdRequiredByDay = Array(N).fill(false);
    for (let i = 0; i < N; i++){
      tdRequiredByDay[i] = getTdRequired(monthKey, days[i].iso);
    }

    return {
      monthKey,
      days,
      segments,
      employees,
      settings,
      N,
      segIdByDay,
      empDataById,
      segRequiredTotal,
      tdRequiredByDay,
    };
  }

  function blockStageAllows(blk, stage){
    // stage 0: nur frei
    // stage 1: frei + (Frei ohne Stunden)
    // stage 2: frei + (Frei ohne Std) + (WF)
    // stage 3: zusätzlich Urlaub (nur als absoluter Notfall)
    if (!blk || blk === BLOCK.NONE) return true;
    if (blk === BLOCK.FREE0) return stage >= 1;
    if (blk === BLOCK.WF) return stage >= 2;
    if (blk === BLOCK.FREEH) return stage >= 3;
    return false;
  }

  function isEmployeeAvailableCtx(ctx, empId, dayIdx, shift, forcedOff, blockStage = 0){
    // Achtung: Sonderwünsche (z.B. "nie Mo", "kein TD") sind bewusst *weich*.
    // Die Rangfolge wird über Scoring/Kosten abgebildet.
    const ed = ctx.empDataById[empId];
    if (!ed) return false;
    if (forcedOff && forcedOff[empId] && forcedOff[empId][dayIdx]) return false;

    const blk = ed.blockByDay[dayIdx];
    if (shift && shift.key === SHIFT.IWD.key && blk === BLOCK.WF) return false;
    if (!blockStageAllows(blk, blockStage)) return false;
    return true;
  }

  function countAvailableForDayCtx(ctx, dayIdx, forcedOff, shift){
    let count = 0;
    for (const emp of ctx.employees){
      if (!isEmployeeAvailableCtx(ctx, emp.id, dayIdx, shift, forcedOff, 0)) continue;
      count += 1;
    }
    return count;
  }

  function chooseTdDaysCtx(ctx, segmentIndices, forcedOff, tdCount, tdRequiredByDay){
    if (tdCount <= 0) return [];
    const days = ctx.days;

    // Pflicht-TD Tage: immer dabei
    const required = [];
    if (Array.isArray(tdRequiredByDay)){
      for (const idx of segmentIndices){
        if (tdRequiredByDay[idx]) required.push(idx);
      }
    }
    const requiredSet = new Set(required);

    const candidates = segmentIndices
      .filter(idx => !requiredSet.has(idx))
      .map(idx => {
        const day = days[idx];
        const weekend = (day.dow === 0 || day.dow === 6);
        const avail = countAvailableForDayCtx(ctx, idx, forcedOff, SHIFT.TD);
        return { idx, weekend, avail };
      });

    // Wichtig: Wenn Stunden knapp sind, zuerst TD am Wochenende einsparen.
    candidates.sort((a,b) => {
      if (a.weekend !== b.weekend) return a.weekend ? 1 : -1; // weekdays first
      if (b.avail !== a.avail) return b.avail - a.avail; // more available first
      return a.idx - b.idx;
    });

    const picked = required.slice();
    const need = Math.max(0, tdCount - picked.length);
    for (let i = 0; i < Math.min(need, candidates.length); i++){
      picked.push(candidates[i].idx);
    }

    picked.sort((a,b) => a - b);
    return picked;
  }

  function scoreIwdCtx(ctx, empId, dayIdx, remainingWeek, remainingMonth, counts, weekCounts, lastWork, lastIwd){
    const ed = ctx.empDataById[empId];
    if (!ed) return -Infinity;
    const prefs = ed.prefs;

    const remW = (remainingWeek && typeof remainingWeek[empId] === 'number') ? remainingWeek[empId] : 0;
    const remM = (remainingMonth && typeof remainingMonth[empId] === 'number') ? remainingMonth[empId] : 0;

    const gap = dayIdx - (lastWork[empId] ?? -999);
    const gapIwd = dayIdx - (lastIwd[empId] ?? -999);

    const iCount = (counts && counts.iwd && counts.iwd[empId]) ? counts.iwd[empId] : 0;
    const tCount = (counts && counts.td && counts.td[empId]) ? counts.td[empId] : 0;

    const weekI = (weekCounts && weekCounts.iwd && weekCounts.iwd[empId]) ? weekCounts.iwd[empId] : 0;

    const day = ctx.days[dayIdx];
    const isWeekend = (day.dow === 0 || day.dow === 6);

    let score = 0;

    // Sonderwünsche (weich, Prio 5)
    // (wird bewusst nicht hart ausgeschlossen – nur bestraft)
    if (!ed.allowedByDay[dayIdx]) score -= 260;
    if (prefs.allowIWD === false) score -= 900;

    // Bedarf: Woche (stärker) + Monat (leichter)
    score += remW * 4.0 + remM * 1.2;

    // Abstand zwischen Einsätzen
    score += Math.min(gap, 14) * (ctx.settings.preferGaps ? 18 : 10);
    if (gap === 1) score -= 500;
    if (gap === 2) score -= 120;

    // IWD-Abstand (pro MA konfigurierbar)
    const minGap = prefs.iwdMinGap ?? 4;
    if (gapIwd < minGap){
      score -= 260 * (minGap - gapIwd);
    }
    if (prefs.doubleIwdPref === 1 && gapIwd === 2) score += 140;
    if (prefs.doubleIwdPref === -1 && gapIwd === 2) score -= 220;

    // Extra-Erholung nach IWD (Tag nach "/" soll wenn möglich frei bleiben)
    if ((prefs.extraRestAfterIWD || 0) >= 1 && gapIwd === 2) score -= 420;

    // Wochenend-Präferenz
    if (prefs.weekendBias === 1 && isWeekend) score += 70;
    if (prefs.weekendBias === -1 && isWeekend) score -= 70;

    // Bevorzugter Dienst-Tag
    if (ed.preferWorkByDay[dayIdx]) score += 120;
    if (dayIdx + 1 < ctx.N && ed.preferWorkByDay[dayIdx + 1]) score += 90; // / morgen

    // Limits
    if (prefs.maxIwdPerWeek != null && weekI >= prefs.maxIwdPerWeek) score -= 700;
    if (prefs.maxIwdPerMonth != null && iCount >= prefs.maxIwdPerMonth) score -= 900;

    // Sonderwünsche: TD/IWD Bias
    if (prefs.tdBias === -1) score += 120; // mehr IWD
    if (prefs.tdBias === 1) score -= 80;   // mehr TD
    if (prefs.tdBias === 1){
      score -= Math.max(0, iCount - tCount) * 20;
    } else if (prefs.tdBias === -1){
      score += Math.max(0, tCount - iCount) * 20;
    }

    // Folgetag nach IWD: keine "Frei"-Logik, sondern WF/Urlaub vermeiden
    if (dayIdx + 1 < ctx.N){
      const nextBlock = ed.blockByDay[dayIdx + 1];
      if (nextBlock === BLOCK.FREEH) score -= 800;
      else if (nextBlock === BLOCK.WF) score -= 500;
      else if (nextBlock === BLOCK.FREE0) score -= 120;
    }

    // Vermeide starke Überplanung
    if (remW < 0) score -= 900 + Math.abs(remW) * 12;
    if (remM < 0) score -= 400 + Math.abs(remM) * 4;

    // etwas Zufall für Vielfalt
    score += (Math.random() - 0.5) * 40;
    return score;
  }

  function scoreTdCtx(ctx, empId, dayIdx, remainingWeek, remainingMonth, counts, weekCounts, lastWork, lastIwd){
    const ed = ctx.empDataById[empId];
    if (!ed) return -Infinity;
    const prefs = ed.prefs;

    const remW = (remainingWeek && typeof remainingWeek[empId] === 'number') ? remainingWeek[empId] : 0;
    const remM = (remainingMonth && typeof remainingMonth[empId] === 'number') ? remainingMonth[empId] : 0;

    const gap = dayIdx - (lastWork[empId] ?? -999);
    const gapIwd = dayIdx - (lastIwd[empId] ?? -999);

    const iCount = (counts && counts.iwd && counts.iwd[empId]) ? counts.iwd[empId] : 0;
    const tCount = (counts && counts.td && counts.td[empId]) ? counts.td[empId] : 0;

    const weekT = (weekCounts && weekCounts.td && weekCounts.td[empId]) ? weekCounts.td[empId] : 0;

    const day = ctx.days[dayIdx];
    const isWeekend = (day.dow === 0 || day.dow === 6);

    let score = 0;

    // Sonderwünsche (weich, Prio 5)
    if (!ed.allowedByDay[dayIdx]) score -= 200;
    if (prefs.allowTD === false) score -= 750;

    // Bedarf
    score += remW * 2.6 + remM * 0.8;

    // Abstand
    score += Math.min(gap, 14) * (ctx.settings.preferGaps ? 10 : 6);
    if (gap === 1) score -= 260;
    if (gap === 2) score -= 70;

    // Extra-Erholung nach IWD
    if ((prefs.extraRestAfterIWD || 0) >= 1 && gapIwd === 2) score -= 250;

    // Wochenend-Präferenz
    if (prefs.weekendBias === 1 && isWeekend) score += 50;
    if (prefs.weekendBias === -1 && isWeekend) score -= 50;

    // Bevorzugter Dienst-Tag
    if (ed.preferWorkByDay[dayIdx]) score += 80;

    // Limits
    if (prefs.maxTdPerWeek != null && weekT >= prefs.maxTdPerWeek) score -= 450;
    if (prefs.maxTdPerMonth != null && tCount >= prefs.maxTdPerMonth) score -= 650;

    // Sonderwünsche: TD/IWD Bias
    if (prefs.tdBias === 1) score += 140; // mehr TD
    if (prefs.tdBias === -1) score -= 90; // mehr IWD

    if (prefs.tdBias === 1){
      score += Math.max(0, iCount - tCount) * 20;
    } else if (prefs.tdBias === -1){
      score -= Math.max(0, tCount - iCount) * 20;
    }

    // Vermeide starke Überplanung
    if (remW < 0) score -= 500 + Math.abs(remW) * 6;
    if (remM < 0) score -= 220 + Math.abs(remM) * 3;

    score += (Math.random() - 0.5) * 30;
    return score;
  }

  function chooseEmployeeForShiftCtx({ ctx, shift, dayIdx, schedule, remainingWeek, remainingMonth, counts, weekCounts, lastWork, lastIwd, forcedOff }){
    // Block-Rangfolge (siehe Info-Tafel):
    // 0 = frei (keine Sperre)
    // 1 = Frei ohne Stunden
    // 2 = WF
    // 3 = Urlaub (nur absoluter Notfall, v.a. um IWD überhaupt zu besetzen)
    const maxStage = (shift.key === SHIFT.IWD.key) ? 3 : 0; // TD: keine Sperren "brechen"

    let candidates = [];
    let usedStage = 0;

    for (let stage = 0; stage <= maxStage; stage++){
      candidates = [];

      for (const emp of ctx.employees){
        const empId = emp.id;
        if (!isEmployeeAvailableCtx(ctx, empId, dayIdx, shift, forcedOff, stage)) continue;

        // already assigned other shift?
        if (shift.key === SHIFT.IWD.key){
          if (schedule.iwd[dayIdx]) continue;
        } else {
          if (schedule.td[dayIdx]) continue;
          // TD darf nicht dieselbe Person sein wie IWD am selben Tag
          if (schedule.iwd[dayIdx] && schedule.iwd[dayIdx] === empId) continue;
        }

        candidates.push(empId);
      }

      if (candidates.length > 0){
        usedStage = stage;
        break;
      }
    }

    if (candidates.length === 0) return null;

    let best = null;
    let bestScore = -Infinity;

    for (const empId of candidates){
      let s = (shift.key === SHIFT.IWD.key)
        ? scoreIwdCtx(ctx, empId, dayIdx, remainingWeek, remainingMonth, counts, weekCounts, lastWork, lastIwd)
        : scoreTdCtx(ctx, empId, dayIdx, remainingWeek, remainingMonth, counts, weekCounts, lastWork, lastIwd);

      // Wenn wir Sperren brechen müssen, bleibt das möglich – aber unattraktiv.
      // (Lexikografisch wird das hier schon über usedStage erreicht; der Zusatz ist nur ein Tie-Breaker.)
      if (usedStage === 1) s -= 1200;
      if (usedStage === 2) s -= 2400;
      if (usedStage === 3) s -= 8000;

      if (s > bestScore){
        bestScore = s;
        best = empId;
      }
    }

    return best;
  }

  function buildScheduleAttemptCtx(ctx){
    const N = ctx.N;
    const schedule = { iwd: Array(N).fill(null), td: Array(N).fill(null) };
    const plannedTdDays = [];

    const forcedOff = {};
    const lastWork = {};
    const lastIwd = {};
    const counts = { iwd: {}, td: {} };

    for (const emp of ctx.employees){
      forcedOff[emp.id] = Array(N).fill(false);
      lastWork[emp.id] = -999;
      lastIwd[emp.id] = -999;
      counts.iwd[emp.id] = 0;
      counts.td[emp.id] = 0;
    }

    // Monatsbedarf (inkl. Stundenkonto-Korrektur)
    const remainingMonth = {};
    for (const emp of ctx.employees){
      remainingMonth[emp.id] = Number(ctx.empDataById[emp.id]?.monthRequired) || 0;
    }

    for (let si = 0; si < ctx.segments.length; si++){
      const seg = ctx.segments[si];
      const segIndices = seg.indices;

      // Wochenbedarf
      const remainingWeek = {};
      let totalRequired = 0;
      for (const emp of ctx.employees){
        const req = Number(ctx.empDataById[emp.id]?.segRequired[si]) || 0;
        remainingWeek[emp.id] = req;
        totalRequired += req;
      }

      const baseIwd = segIndices.length * SHIFT.IWD.hours;
      const requiredTdCount = segIndices.reduce((n, idx) => n + (ctx.tdRequiredByDay[idx] ? 1 : 0), 0);
      const autoTdCount = chooseTdCount(totalRequired, baseIwd, segIndices.length);
      const tdCount = clamp(Math.max(autoTdCount, requiredTdCount), 0, segIndices.length);
      const tdDays = chooseTdDaysCtx(ctx, segIndices, forcedOff, tdCount, ctx.tdRequiredByDay);
      plannedTdDays.push(...tdDays);

      // Wochenzählung für Limits
      const weekCounts = { iwd: {}, td: {} };
      for (const emp of ctx.employees){
        weekCounts.iwd[emp.id] = 0;
        weekCounts.td[emp.id] = 0;
      }

      // IWD jeden Tag
      for (const dayIdx of segIndices){
        const empId = chooseEmployeeForShiftCtx({
          ctx,
          shift: SHIFT.IWD,
          dayIdx,
          schedule,
          remainingWeek,
          remainingMonth,
          counts,
          weekCounts,
          lastWork,
          lastIwd,
          forcedOff,
        });

        schedule.iwd[dayIdx] = empId;
        if (empId){
          remainingWeek[empId] -= SHIFT.IWD.hours;
          remainingMonth[empId] -= SHIFT.IWD.hours;

          counts.iwd[empId] += 1;
          weekCounts.iwd[empId] += 1;
          lastWork[empId] = dayIdx;
          lastIwd[empId] = dayIdx;

          if (dayIdx + 1 < N){
            forcedOff[empId][dayIdx + 1] = true;
          }
        }
      }

      // TD optional
      for (const dayIdx of tdDays){
        const empId = chooseEmployeeForShiftCtx({
          ctx,
          shift: SHIFT.TD,
          dayIdx,
          schedule,
          remainingWeek,
          remainingMonth,
          counts,
          weekCounts,
          lastWork,
          lastIwd,
          forcedOff,
        });

        schedule.td[dayIdx] = empId;
        if (empId){
          remainingWeek[empId] -= SHIFT.TD.hours;
          remainingMonth[empId] -= SHIFT.TD.hours;

          counts.td[empId] += 1;
          weekCounts.td[empId] += 1;
          lastWork[empId] = dayIdx;
        }
      }
    }

    return { schedule, forcedOff, plannedTdDays };
  }

  function evaluateAttemptCtx(ctx, attempt){
    const schedule = attempt.schedule;
    const forcedOff = attempt.forcedOff;

    let cost = 0;
    const N = ctx.N;

    // Kosten-Gewichte (Prioritäten):
    // 0) IWD muss besetzt sein (stärkste Strafe bei Lücke)
    // 1) Urlaub möglichst nie verplanen
    // 2) WF besser als normales Frei schützen
    // 3) Frei ohne Stunden schützen
    // 4) Überstunden / Stundenkonto
    // 5) Sonderwünsche (weich)
    const COST = {
      HARD: 20_000_000,
      MISSING_IWD: 20_000_000,
      MISSING_REQUIRED_TD: 8_000_000,
      SAME_PERSON: 20_000_000,

      BLOCK_URLAUB: 10_000_000,
      BLOCK_WF: 2_500_000,
      BLOCK_FREE0: 1_500_000,

      WISH_DAY: 8_000,
      WISH_SHIFT: 12_000,
      FORCED_URLAUB: 15_000_000,
      FORCED_WF: 2_000_000,
      FORCED_FREE0: 600_000,
    };

    // IWD jeden Tag
    for (let i = 0; i < N; i++){
      if (!schedule.iwd[i]) cost += COST.MISSING_IWD;
      if (ctx.tdRequiredByDay && ctx.tdRequiredByDay[i] && !schedule.td[i]) cost += COST.MISSING_REQUIRED_TD;
    }

    // Harte Checks
    for (let i = 0; i < N; i++){
      const iwdEmpId = schedule.iwd[i];
      const tdEmpId  = schedule.td[i];

      if (iwdEmpId && tdEmpId && iwdEmpId === tdEmpId) cost += COST.SAME_PERSON;

      const checkOne = (empId, shift) => {
        if (!empId) return;
        const ed = ctx.empDataById[empId];
        if (!ed) { cost += COST.HARD; return; }

        const blk = ed.blockByDay[i];
        if (blk === BLOCK.FREEH) cost += COST.BLOCK_URLAUB;
        else if (blk === BLOCK.WF) cost += COST.BLOCK_WF;
        else if (blk === BLOCK.FREE0) cost += COST.BLOCK_FREE0;

        if (forcedOff[empId] && forcedOff[empId][i]) cost += COST.HARD;

        // Sonderwünsche (weich): nur leichte Strafe
        if (!ed.allowedByDay[i]) cost += COST.WISH_DAY;
        if (shift.key === SHIFT.IWD.key && ed.prefs.allowIWD === false) cost += COST.WISH_SHIFT;
        if (shift.key === SHIFT.TD.key && ed.prefs.allowTD === false) cost += COST.WISH_SHIFT;
      };

      checkOne(iwdEmpId, SHIFT.IWD);
      checkOne(tdEmpId, SHIFT.TD);
    }

    // /-Tag darf kein Urlaub/WF sein (Frei nur im Notfall)
    for (const emp of ctx.employees){
      const ed = ctx.empDataById[emp.id];
      if (!ed) continue;
      for (let i = 0; i < N; i++){
        if (!forcedOff[emp.id] || !forcedOff[emp.id][i]) continue;
        const blk = ed.blockByDay[i];
        if (blk === BLOCK.FREEH) cost += COST.FORCED_URLAUB;
        else if (blk === BLOCK.WF) cost += COST.FORCED_WF;
        else if (blk === BLOCK.FREE0) cost += COST.FORCED_FREE0;
      }
    }

    // --- Wochenstunden (Segmentweise) ---
    for (let si = 0; si < ctx.segments.length; si++){
      const seg = ctx.segments[si];
      const segIndices = seg.indices;

      // pro Woche Counts (für max-Regeln)
      const weekIwd = {};
      const weekTd = {};
      for (const emp of ctx.employees){
        weekIwd[emp.id] = 0;
        weekTd[emp.id] = 0;
      }

      for (const emp of ctx.employees){
        const ed = ctx.empDataById[emp.id];
        if (!ed) continue;

        const target = Number(ed.segDesiredTarget[si]) || 0;
        const credit = Number(ed.segCredit[si]) || 0;

        let work = 0;
        let iwdC = 0;
        let tdC = 0;

        for (const dayIdx of segIndices){
          if (schedule.iwd[dayIdx] === emp.id){ work += SHIFT.IWD.hours; iwdC++; }
          if (schedule.td[dayIdx] === emp.id){ work += SHIFT.TD.hours; tdC++; }
        }

        weekIwd[emp.id] = iwdC;
        weekTd[emp.id] = tdC;

        const total = work + credit;
        const delta = total - target;

        cost += Math.abs(delta) * 120 + (delta > 0 ? delta * 60 : 0);

        // Week limits
        const p = ed.prefs;
        if (p.maxIwdPerWeek != null && iwdC > p.maxIwdPerWeek) cost += (iwdC - p.maxIwdPerWeek) * 600;
        if (p.maxTdPerWeek != null && tdC > p.maxTdPerWeek) cost += (tdC - p.maxTdPerWeek) * 450;
      }
    }

    // --- Monatsstunden (stark gewichtet) ---
    const workHours = {};
    const iwdCount = {};
    const tdCount = {};
    for (const emp of ctx.employees){
      workHours[emp.id] = 0;
      iwdCount[emp.id] = 0;
      tdCount[emp.id] = 0;
    }

    for (let i = 0; i < N; i++){
      const iwdEmp = schedule.iwd[i];
      if (iwdEmp){
        workHours[iwdEmp] += SHIFT.IWD.hours;
        iwdCount[iwdEmp] += 1;
      }
      const tdEmp = schedule.td[i];
      if (tdEmp){
        workHours[tdEmp] += SHIFT.TD.hours;
        tdCount[tdEmp] += 1;
      }
    }

    let maxDelta = -Infinity;
    let minDelta = Infinity;

    for (const emp of ctx.employees){
      const ed = ctx.empDataById[emp.id];
      if (!ed) { cost += 1_000_000; continue; }

      const total = (workHours[emp.id] || 0) + (ed.monthCredit || 0);
      const delta = total - (ed.monthDesiredTarget || 0);
      maxDelta = Math.max(maxDelta, delta);
      minDelta = Math.min(minDelta, delta);

      if (delta >= -10 && delta <= 4){
        cost += Math.abs(delta) * 8;
        if (delta > 0) cost += delta * 12;
      } else if (delta >= -20 && delta <= 12){
        cost += Math.abs(delta) * 120;
        if (delta > 0) cost += delta * 50;
      } else {
        cost += Math.abs(delta) * 320;
        if (delta > 0) cost += delta * 200;
      }

      if (delta > 20){
        cost += (delta - 20) * 2000;
      }

      // Month limits
      const p = ed.prefs;
      if (p.maxIwdPerMonth != null && (iwdCount[emp.id] || 0) > p.maxIwdPerMonth) cost += ((iwdCount[emp.id] || 0) - p.maxIwdPerMonth) * 900;
      if (p.maxTdPerMonth != null && (tdCount[emp.id] || 0) > p.maxTdPerMonth) cost += ((tdCount[emp.id] || 0) - p.maxTdPerMonth) * 650;
    }

    if (ctx.employees.length >= 2){
      cost += Math.max(0, (maxDelta - minDelta)) * 500;
    }

    // --- Abstand / Durchmischung / IWD-Muster ---
    for (const emp of ctx.employees){
      const ed = ctx.empDataById[emp.id];
      if (!ed) continue;

      let streak = 0;
      let lastWasWork = false;
      for (let i = 0; i < N; i++){
        const works = (schedule.iwd[i] === emp.id) || (schedule.td[i] === emp.id);
        if (works){
          streak = lastWasWork ? (streak + 1) : 1;
          if (streak >= 2) cost += 500 * (streak - 1);
          lastWasWork = true;
        } else {
          lastWasWork = false;
          streak = 0;
        }
      }

      // IWD-Abstand
      let lastI = -999;
      const minGap = ed.prefs.iwdMinGap ?? 4;
      for (let i = 0; i < N; i++){
        if (schedule.iwd[i] === emp.id){
          const gap = i - lastI;
          if (gap < minGap) cost += 200 * (minGap - gap);
          lastI = i;
        }

        // Extra Rest day after "/"
        if ((ed.prefs.extraRestAfterIWD || 0) >= 1 && lastI > -900){
          // Wenn der MA 2 Tage nach einem IWD arbeitet (IWD,/,X) -> Strafe
          if (i === lastI + 2){
            const works = (schedule.iwd[i] === emp.id) || (schedule.td[i] === emp.id);
            if (works) cost += 350;
          }
        }
      }
    }

    // --- Bevorzugte Dienst-Tage (nicht "leer" lassen) ---
    for (const emp of ctx.employees){
      const ed = ctx.empDataById[emp.id];
      if (!ed || !ed.prefs.preferWorkDows || ed.prefs.preferWorkDows.length === 0) continue;
      for (let i = 0; i < N; i++){
        if (!ed.preferWorkByDay[i]) continue;
        // wenn blockiert -> egal
        if (ed.blockByDay[i] !== BLOCK.NONE) continue;
        const hasMark = (schedule.iwd[i] === emp.id) || (schedule.td[i] === emp.id) || (forcedOff[emp.id] && forcedOff[emp.id][i]);
        if (!hasMark) cost += 120;
      }
    }

    return cost;
  }

  function buildMonthSummaryCtx(ctx, schedule, forcedOff){
    const summary = {};
    for (const emp of ctx.employees){
      const ed = ctx.empDataById[emp.id];
      summary[emp.id] = {
        targetHours: round1(ed ? ed.monthDesiredTarget : 0),
        contractTargetHours: round1(ed ? ed.monthContractTarget : 0),
        desiredTargetHours: round1(ed ? ed.monthDesiredTarget : 0),
        creditHours: round1(ed ? ed.monthCredit : 0),
        iwdCount: 0,
        tdCount: 0,
        workHours: 0,
        totalHours: 0,

        balanceStart: round1(ed ? ed.balanceStart : 0),
        balanceAdjust: round1(ed ? ed.balanceAdjust : 0),
        deltaContract: 0,
        deltaDesired: 0,
        balanceEnd: 0,
      };
    }

    for (let i = 0; i < ctx.N; i++){
      const iwdEmp = schedule.iwd[i];
      if (iwdEmp && summary[iwdEmp]){
        summary[iwdEmp].iwdCount += 1;
        summary[iwdEmp].workHours += SHIFT.IWD.hours;
      }

      const tdEmp = schedule.td[i];
      if (tdEmp && summary[tdEmp]){
        summary[tdEmp].tdCount += 1;
        summary[tdEmp].workHours += SHIFT.TD.hours;
      }
    }

    for (const emp of ctx.employees){
      const row = summary[emp.id];
      row.workHours = round1(row.workHours);
      row.totalHours = round1(row.workHours + row.creditHours);
      row.deltaContract = round1(row.totalHours - row.contractTargetHours);
      row.deltaDesired = round1(row.totalHours - row.desiredTargetHours);
      row.balanceEnd = round1(row.balanceStart + row.deltaContract);
    }

    const empById = Object.fromEntries(ctx.employees.map(e => [e.id, e]));
    return { summaryByEmpId: summary, empById };
  }

  function isEmployeeAllowedForShift(emp, shift){
    const p = sanitizePrefs(emp && emp.prefs);
    if (shift.key === SHIFT.IWD.key) return p.allowIWD !== false;
    if (shift.key === SHIFT.TD.key) return p.allowTD !== false;
    return true;
  }

  function isEmployeeAllowedOnDay(emp, day){
    const p = sanitizePrefs(emp && emp.prefs);
    if (p.bannedDows && p.bannedDows.includes(day.dow)) return false;
    return true;
  }

  function isEmployeeAvailable(monthKey, emp, day, dayIdx, shift, forcedOff){
    if (!isEmployeeAllowedForShift(emp, shift)) return false;
    if (!isEmployeeAllowedOnDay(emp, day)) return false;

    const blk = getBlock(monthKey, emp.id, day.iso);
    if (blk !== BLOCK.NONE) return false;

    if (forcedOff && forcedOff[emp.id] && forcedOff[emp.id][dayIdx]) return false;

    return true;
  }

  function chooseTdCount(totalRequiredWork, baseIwdHours, maxDays){
    // if we already have more mandatory IWD hours than needed: no TD
    if (totalRequiredWork <= baseIwdHours) return 0;

    let best = 0;
    let bestDiff = Infinity;

    for (let c = 0; c <= maxDays; c++){
      const total = baseIwdHours + c * SHIFT.TD.hours;
      const diff = Math.abs(totalRequiredWork - total);
      if (diff < bestDiff){
        bestDiff = diff;
        best = c;
      } else if (diff === bestDiff){
        // tie-break: prefer FEWER TD (weniger Überstunden)
        if (c < best) best = c;
      }
    }
    return best;
  }

  
function countAvailableForDay(monthKey, employees, day, forcedOff, shift){
    let count = 0;
    for (const emp of employees){
      if (!isEmployeeAvailable(monthKey, emp, day, day.index, shift, forcedOff)) continue;
      count += 1;
    }
    return count;
  }


  function chooseTdDays(segmentIndices, days, employees, monthKey, forcedOff, tdCount){
    if (tdCount <= 0) return [];
    const candidates = segmentIndices.map(idx => {
      const day = days[idx];
      const weekend = (day.dow === 0 || day.dow === 6);
      const avail = countAvailableForDay(monthKey, employees, day, forcedOff, SHIFT.TD);
      return { idx, weekend, avail };
    });

    // Important: If hours are tight, first save TD on weekend (=> weekend has lower priority).
    candidates.sort((a,b) => {
      if (a.weekend !== b.weekend) return a.weekend ? 1 : -1; // weekdays first
      if (b.avail !== a.avail) return b.avail - a.avail; // more available first
      return a.idx - b.idx;
    });

    const picked = candidates.slice(0, tdCount).map(c => c.idx);
    picked.sort((a,b) => a - b); // schedule in date order
    return picked;
  }

  
function scoreIwd(emp, dayIdx, remainingWeek, remainingMonth, counts, lastWork, lastIwd, settings, days, monthKey){
    const remW = (remainingWeek && typeof remainingWeek[emp.id] === 'number') ? remainingWeek[emp.id] : 0;
    const remM = (remainingMonth && typeof remainingMonth[emp.id] === 'number') ? remainingMonth[emp.id] : 0;

    const gap = dayIdx - (lastWork[emp.id] ?? -999);
    const gapIwd = dayIdx - (lastIwd[emp.id] ?? -999);

    const iCount = (counts && counts.iwd && counts.iwd[emp.id]) ? counts.iwd[emp.id] : 0;
    const tCount = (counts && counts.td && counts.td[emp.id]) ? counts.td[emp.id] : 0;

    const prefs = sanitizePrefs(emp.prefs);

    let score = 0;

    // Bedarf: Woche (stärker) + Monat (leichter) => bessere Balance über den Monat
    score += remW * 4.0 + remM * 1.2;

    // Abstand zwischen Einsätzen
    score += Math.min(gap, 14) * (settings.preferGaps ? 18 : 10);
    if (gap === 1) score -= 500;
    if (gap === 2) score -= 120;

    // IWD nicht zu oft hintereinander (IWD blockiert Folgetag)
    if (gapIwd < 4) score -= 250;

    // Sonderwünsche: TD/IWD Bias
    if (prefs.tdBias === -1) score += 120; // mehr IWD gewünscht
    if (prefs.tdBias === 1) score -= 80;   // mehr TD gewünscht -> IWD leicht unattraktiver

    // Wenn jemand "mehr TD" will und schon viele IWD hat: IWD weiter unattraktiver
    if (prefs.tdBias === 1){
      score -= Math.max(0, iCount - tCount) * 20;
    } else if (prefs.tdBias === -1){
      score += Math.max(0, tCount - iCount) * 20;
    }

    // Bonus, wenn der obligatorische Folgetag ohnehin frei/blockiert ist
    if (dayIdx + 1 < days.length){
      const nextDay = days[dayIdx + 1];
      const nextBlk = getBlock(monthKey, emp.id, nextDay.iso);
      if (nextBlk !== BLOCK.NONE) score += 60;
      if (prefs.bannedDows && prefs.bannedDows.includes(nextDay.dow)) score += 60;
    }

    // Vermeide starke Überplanung
    if (remW < 0) score -= 900 + Math.abs(remW) * 12;
    if (remM < 0) score -= 400 + Math.abs(remM) * 4;

    // etwas Zufall für Vielfalt
    score += (Math.random() - 0.5) * 40;

    return score;
  }


  
function scoreTd(emp, dayIdx, remainingWeek, remainingMonth, counts, lastWork, settings){
    const remW = (remainingWeek && typeof remainingWeek[emp.id] === 'number') ? remainingWeek[emp.id] : 0;
    const remM = (remainingMonth && typeof remainingMonth[emp.id] === 'number') ? remainingMonth[emp.id] : 0;

    const gap = dayIdx - (lastWork[emp.id] ?? -999);

    const iCount = (counts && counts.iwd && counts.iwd[emp.id]) ? counts.iwd[emp.id] : 0;
    const tCount = (counts && counts.td && counts.td[emp.id]) ? counts.td[emp.id] : 0;

    const prefs = sanitizePrefs(emp.prefs);

    let score = 0;

    // Bedarf
    score += remW * 2.6 + remM * 0.8;

    // Abstand
    score += Math.min(gap, 14) * (settings.preferGaps ? 10 : 6);
    if (gap === 1) score -= 260;
    if (gap === 2) score -= 70;

    // Sonderwünsche: TD/IWD Bias
    if (prefs.tdBias === 1) score += 140; // mehr TD
    if (prefs.tdBias === -1) score -= 90; // mehr IWD -> TD unattraktiver

    if (prefs.tdBias === 1){
      score += Math.max(0, iCount - tCount) * 20; // wenn mehr IWD als TD -> TD pushen
    } else if (prefs.tdBias === -1){
      score -= Math.max(0, tCount - iCount) * 20;
    }

    // Vermeide starke Überplanung
    if (remW < 0) score -= 500 + Math.abs(remW) * 6;
    if (remM < 0) score -= 220 + Math.abs(remM) * 3;

    score += (Math.random() - 0.5) * 30;

    return score;
  }


  
function chooseEmployeeForShift({ shift, dayIdx, employees, monthKey, days, schedule, remainingWeek, remainingMonth, counts, lastWork, lastIwd, forcedOff, settings }){
    const day = days[dayIdx];

    const candidates = [];
    for (const emp of employees){
      // Block/forced off + Sonderwünsche
      if (!isEmployeeAvailable(monthKey, emp, day, dayIdx, shift, forcedOff)) continue;

      // already assigned other shift?
      if (shift.key === SHIFT.IWD.key){
        if (schedule.iwd[dayIdx]) continue;
      } else {
        if (schedule.td[dayIdx]) continue;
        // TD darf nicht dieselbe Person sein wie IWD am selben Tag
        if (schedule.iwd[dayIdx] && schedule.iwd[dayIdx] === emp.id) continue;
      }

      candidates.push(emp);
    }

    if (candidates.length === 0){
      return null;
    }

    let best = null;
    let bestScore = -Infinity;

    for (const emp of candidates){
      const s = (shift.key === SHIFT.IWD.key)
        ? scoreIwd(emp, dayIdx, remainingWeek, remainingMonth, counts, lastWork, lastIwd, settings, days, monthKey)
        : scoreTd(emp, dayIdx, remainingWeek, remainingMonth, counts, lastWork, settings);

      if (s > bestScore){
        bestScore = s;
        best = emp;
      }
    }

    return best ? best.id : null;
  }


  
function buildScheduleAttempt({ monthKey, days, segments, employees, settings }){
    const N = days.length;

    const schedule = {
      iwd: Array(N).fill(null),
      td: Array(N).fill(null),
    };

    const forcedOff = {};
    const lastWork = {};
    const lastIwd = {};
    const counts = { iwd: {}, td: {} };

    for (const emp of employees){
      forcedOff[emp.id] = Array(N).fill(false);
      lastWork[emp.id] = -999;
      lastIwd[emp.id] = -999;
      counts.iwd[emp.id] = 0;
      counts.td[emp.id] = 0;
    }

    // ---- Monatsbedarf (für bessere Balance über alle Wochen) ----
    const remainingMonth = {};
    for (const emp of employees) remainingMonth[emp.id] = 0;

    for (const seg of segments){
      for (const emp of employees){
        const perWeekday = emp.weeklyHours / 5;
        const target = emp.weeklyHours * (seg.weekdaysCount / 5);

        let credit = 0;
        for (const dayIdx of seg.indices){
          const day = days[dayIdx];
          if (!isWeekday(day.date)) continue;
          const blk = getBlock(monthKey, emp.id, day.iso);
          if (blk === BLOCK.FREEH) credit += perWeekday;
        }
        credit = Math.min(credit, target);

        const required = Math.max(0, target - credit);
        remainingMonth[emp.id] += required;
      }
    }

    // ---- Segmentweise planen (kalenderwochenähnlich) ----
    for (const seg of segments){
      const segIndices = seg.indices;

      // Wochenbedarf
      const remainingWeek = {};
      let totalRequired = 0;

      for (const emp of employees){
        const perWeekday = emp.weeklyHours / 5;
        const target = emp.weeklyHours * (seg.weekdaysCount / 5);

        let credit = 0;
        for (const dayIdx of segIndices){
          const day = days[dayIdx];
          if (!isWeekday(day.date)) continue;
          const blk = getBlock(monthKey, emp.id, day.iso);
          if (blk === BLOCK.FREEH) credit += perWeekday;
        }
        credit = Math.min(credit, target);

        const required = Math.max(0, target - credit);
        remainingWeek[emp.id] = required;
        totalRequired += required;
      }

      const baseIwd = segIndices.length * SHIFT.IWD.hours;
      const tdCount = chooseTdCount(totalRequired, baseIwd, segIndices.length);
      const tdDays = chooseTdDays(segIndices, days, employees, monthKey, forcedOff, tdCount);

      // IWD jeden Tag
      for (const dayIdx of segIndices){
        const empId = chooseEmployeeForShift({
          shift: SHIFT.IWD,
          dayIdx,
          employees,
          monthKey,
          days,
          schedule,
          remainingWeek,
          remainingMonth,
          counts,
          lastWork,
          lastIwd,
          forcedOff,
          settings,
        });

        schedule.iwd[dayIdx] = empId;

        if (empId){
          remainingWeek[empId] -= SHIFT.IWD.hours;
          remainingMonth[empId] -= SHIFT.IWD.hours;

          counts.iwd[empId] += 1;
          lastWork[empId] = dayIdx;
          lastIwd[empId] = dayIdx;

          if (dayIdx + 1 < N){
            forcedOff[empId][dayIdx + 1] = true;
          }
        }
      }

      // TD optional
      for (const dayIdx of tdDays){
        const empId = chooseEmployeeForShift({
          shift: SHIFT.TD,
          dayIdx,
          employees,
          monthKey,
          days,
          schedule,
          remainingWeek,
          remainingMonth,
          counts,
          lastWork,
          lastIwd,
          forcedOff,
          settings,
        });

        schedule.td[dayIdx] = empId;

        if (empId){
          remainingWeek[empId] -= SHIFT.TD.hours;
          remainingMonth[empId] -= SHIFT.TD.hours;

          counts.td[empId] += 1;
          lastWork[empId] = dayIdx;
        }
      }
    }

    return { schedule, forcedOff };
  }


  
function evaluateAttempt({ monthKey, days, segments, employees, schedule, forcedOff }){
    let cost = 0;
    const N = days.length;

    const empById = {};
    for (const e of employees) empById[e.id] = e;

    // --- Harte Anforderungen ---
    // IWD jeden Tag
    for (let i = 0; i < N; i++){
      if (!schedule.iwd[i]) cost += 1_000_000;
    }

    for (let i = 0; i < N; i++){
      const day = days[i];

      const iwdEmpId = schedule.iwd[i];
      const tdEmpId  = schedule.td[i];

      // gleiche Person darf nicht IWD+TD am selben Tag haben
      if (iwdEmpId && tdEmpId && iwdEmpId === tdEmpId) cost += 1_000_000;

      // prüfen: Block / forcedOff / Sonderwünsche
      const checkOne = (empId, shift) => {
        if (!empId) return;
        const emp = empById[empId];
        if (!emp) { cost += 1_000_000; return; }

        if (getBlock(monthKey, empId, day.iso) !== BLOCK.NONE) cost += 1_000_000;
        if (forcedOff[empId] && forcedOff[empId][i]) cost += 1_000_000;

        if (!isEmployeeAllowedOnDay(emp, day)) cost += 1_000_000;
        if (!isEmployeeAllowedForShift(emp, shift)) cost += 1_000_000;
      };

      checkOne(iwdEmpId, SHIFT.IWD);
      checkOne(tdEmpId, SHIFT.TD);
    }

    // --- Wochenstunden (Segmentweise) ---
    for (const seg of segments){
      const segIndices = seg.indices;

      for (const emp of employees){
        const perWeekday = emp.weeklyHours / 5;
        const target = emp.weeklyHours * (seg.weekdaysCount / 5);

        let credit = 0;
        let work = 0;

        for (const dayIdx of segIndices){
          const day = days[dayIdx];

          if (schedule.iwd[dayIdx] === emp.id) work += SHIFT.IWD.hours;
          if (schedule.td[dayIdx] === emp.id) work += SHIFT.TD.hours;

          if (isWeekday(day.date)){
            const blk = getBlock(monthKey, emp.id, day.iso);
            if (blk === BLOCK.FREEH) credit += perWeekday;
          }
        }

        credit = Math.min(credit, target);

        const total = work + credit;
        const delta = total - target;

        // Ziel: nah an 0. Überstunden etwas teurer als Minus, weil Meetings/Supervision nicht geplant.
        cost += Math.abs(delta) * 120 + (delta > 0 ? delta * 60 : 0);
      }
    }

    // --- Monatsstunden (stark gewichtet) ---
    const monthSummaryObj = buildMonthSummary({ monthKey, days, segments, employees, schedule });
    const monthSummaryByEmpId = monthSummaryObj.summaryByEmpId;

    let maxDelta = -Infinity;
    let minDelta = Infinity;

    for (const emp of employees){
      const row = monthSummaryByEmpId[emp.id];
      if (!row) { cost += 1_000_000; continue; }

      const delta = (row.totalHours - row.targetHours);
      maxDelta = Math.max(maxDelta, delta);
      minDelta = Math.min(minDelta, delta);

      if (delta >= -10 && delta <= 4){
        cost += Math.abs(delta) * 8;
        if (delta > 0) cost += delta * 12;
      } else if (delta >= -20 && delta <= 12){
        cost += Math.abs(delta) * 120;
        if (delta > 0) cost += delta * 50;
      } else {
        cost += Math.abs(delta) * 320;
        if (delta > 0) cost += delta * 200;
      }

      if (delta > 20){
        cost += (delta - 20) * 2000;
      }
    }

    if (employees.length >= 2){
      // Zusätzlich: Spreizung reduzieren (wenn einer +40 und anderer -20 => hoch)
      cost += Math.max(0, (maxDelta - minDelta)) * 500;
    }

    // --- Abstand / Durchmischung ---
    for (const emp of employees){
      let streak = 0;
      let lastWasWork = false;

      for (let i = 0; i < N; i++){
        const works = (schedule.iwd[i] === emp.id) || (schedule.td[i] === emp.id);

        if (works){
          if (lastWasWork){
            streak += 1;
          } else {
            streak = 1;
          }
          if (streak >= 2){
            cost += 500 * (streak - 1);
          }
          lastWasWork = true;
        } else {
          lastWasWork = false;
          streak = 0;
        }
      }

      // IWD-Abstand (weil Folgetag immer frei)
      let lastI = -999;
      for (let i = 0; i < N; i++){
        if (schedule.iwd[i] === emp.id){
          const gap = i - lastI;
          if (gap < 4) cost += 200 * (4 - gap);
          lastI = i;
        }
      }
    }

    return cost;
  }


  function buildMonthSummary({ monthKey, days, segments, employees, schedule }){
    const empById = Object.fromEntries(employees.map(e => [e.id, e]));

    const summary = {};
    for (const emp of employees){
      summary[emp.id] = {
        targetHours: 0,
        creditHours: 0,
        iwdCount: 0,
        tdCount: 0,
        workHours: 0,
        totalHours: 0,
      };
    }

    // Target hours are computed per segment
    for (const seg of segments){
      for (const emp of employees){
        const target = emp.weeklyHours * (seg.weekdaysCount / 5);
        summary[emp.id].targetHours += target;
      }
    }

    // Work + credit
    for (let i = 0; i < days.length; i++){
      const day = days[i];

      const iwdEmp = schedule.iwd[i];
      if (iwdEmp && summary[iwdEmp]){
        summary[iwdEmp].iwdCount += 1;
        summary[iwdEmp].workHours += SHIFT.IWD.hours;
      }

      const tdEmp = schedule.td[i];
      if (tdEmp && summary[tdEmp]){
        summary[tdEmp].tdCount += 1;
        summary[tdEmp].workHours += SHIFT.TD.hours;
      }

      // credit
      if (isWeekday(day.date)){
        for (const emp of employees){
          const blk = getBlock(monthKey, emp.id, day.iso);
          if (blk === BLOCK.FREEH){
            summary[emp.id].creditHours += (emp.weeklyHours / 5);
          }
        }
      }
    }

    for (const emp of employees){
      summary[emp.id].targetHours = round1(summary[emp.id].targetHours);
      summary[emp.id].creditHours = round1(summary[emp.id].creditHours);
      summary[emp.id].workHours = round1(summary[emp.id].workHours);
      summary[emp.id].totalHours = round1(summary[emp.id].workHours + summary[emp.id].creditHours);
    }

    return { summaryByEmpId: summary, empById };
  }

  async function generateMonthPlan({ onProgress } = {}){
    const monthKey = state.month;
    ensureMonthStructures(monthKey);

    const employees = state.employees.map(normalizeEmployee);
    const days = getMonthDays(monthKey);
    const segments = buildWeekSegments(days);

    const settings = {
      attempts: clamp(Number(state.settings.attempts || 10000), 10, 1000000),
      preferGaps: Boolean(state.settings.preferGaps),
    };

    const ctx = buildMonthContext({ monthKey, days, segments, employees, settings });

    const messages = [];

    if (employees.length === 0){
      return {
        monthKey,
        days,
        employees,
        empById: {},
        segments,
        schedule: { iwd: Array(days.length).fill(null), td: Array(days.length).fill(null) },
        forcedOff: {},
        plannedTdDays: [],
        monthSummaryByEmpId: {},
        messages: [{ type: 'danger', title: 'Fehler', details: 'Bitte zuerst Mitarbeiter hinzufügen.' }],
      };
    }

    // quick weekly feasibility notes
    for (let si = 0; si < segments.length; si++){
      const seg = segments[si];
      const segIndices = seg.indices;
      const totalRequired = Number(ctx.segRequiredTotal[si] || 0);

      const baseIwd = segIndices.length * SHIFT.IWD.hours;
      const maxWithTd = baseIwd + segIndices.length * SHIFT.TD.hours;

      const first = days[segIndices[0]];
      const last = days[segIndices[segIndices.length - 1]];
      const label = `${first.label} – ${last.label}`;

      if (totalRequired < baseIwd){
        messages.push({
          type: 'warn',
          title: 'Hinweis (Woche hat zu wenig Soll-Stunden)',
          details: `${label}: Soll-Arbeit ${round1(totalRequired)}h < notwendige IWD-Stunden ${baseIwd}h → Überstunden sind in dieser Woche unvermeidbar.`,
        });
      }

      if (totalRequired > maxWithTd){
        messages.push({
          type: 'warn',
          title: 'Hinweis (Woche hat zu viele Soll-Stunden)',
          details: `${label}: Soll-Arbeit ${round1(totalRequired)}h > Maximum mit TD ${maxWithTd}h → Unterdeckung ist in dieser Woche unvermeidbar.`,
        });
      }
    }

    // Run multiple attempts (randomized scoring) and pick best
    let bestAttempt = null;
    let bestCost = Infinity;

    const totalAttempts = settings.attempts;
    // Progress-Updates: bei 100.000 Versuchen nicht zu chatty
    const chunkSize = clamp(Math.round(totalAttempts / 200), 50, 2000);
    const t0 = (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();

    if (typeof onProgress === 'function'){
      onProgress(0, totalAttempts, { bestCost, elapsedMs: 0 });
    }

    for (let i = 0; i < totalAttempts; i++){
      const attempt = buildScheduleAttemptCtx(ctx);
      const evCost = evaluateAttemptCtx(ctx, attempt);

      if (evCost < bestCost){
        bestCost = evCost;
        bestAttempt = attempt;
      }

      if (typeof onProgress === 'function' && (((i + 1) % chunkSize) === 0 || (i + 1) === totalAttempts)){
        const now = (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();
        onProgress(i + 1, totalAttempts, { bestCost, elapsedMs: (now - t0) });
        // UI repaint ermöglichen
        await nextFrame();
      }
    }

    if (!bestAttempt){
      return {
        monthKey,
        days,
        employees,
        empById: Object.fromEntries(employees.map(e => [e.id, e])),
        segments,
        schedule: { iwd: Array(days.length).fill(null), td: Array(days.length).fill(null) },
        forcedOff: {},
        plannedTdDays: [],
        monthSummaryByEmpId: {},
        messages: [{ type: 'danger', title: 'Fehler', details: 'Konnte keinen Plan erstellen. Bitte Eingaben prüfen.' }],
      };
    }

    // Final messages: missing IWD?
    const missingIwd = bestAttempt.schedule.iwd.filter(x => !x).length;
    if (missingIwd > 0){
      messages.unshift({
        type: 'danger',
        title: 'IWD konnte nicht vollständig geplant werden',
        details: `${missingIwd} Tag(e) haben keinen IWD. Ursache: zu viele Sperren oder Zwangs-Frei durch vorherige IWD.`,
      });
    }

    // Pflicht-TD Tage
    const missingReqTd = [];
    for (let i = 0; i < days.length; i++){
      if (ctx.tdRequiredByDay && ctx.tdRequiredByDay[i] && !bestAttempt.schedule.td[i]){
        missingReqTd.push(days[i].label);
      }
    }
    if (missingReqTd.length > 0){
      messages.unshift({
        type: 'danger',
        title: 'Pflicht-TD konnte nicht vollständig geplant werden',
        details: `${missingReqTd.length} Tag(e) sind als „TD Pflicht“ markiert, aber konnten nicht besetzt werden. Prüfe Sperren/Urlaub/WF an diesen Tagen.`,
      });
    }

    const monthSummary = buildMonthSummaryCtx(ctx, bestAttempt.schedule, bestAttempt.forcedOff);

    return {
      monthKey,
      days,
      segments,
      employees,
      empById: monthSummary.empById,
      schedule: bestAttempt.schedule,
      forcedOff: bestAttempt.forcedOff,
      plannedTdDays: bestAttempt.plannedTdDays || [],
      monthSummaryByEmpId: monthSummary.summaryByEmpId,
      messages: dedupeMessages(messages),
      generatedAt: new Date().toISOString(),
      bestCost,
      attemptsUsed: totalAttempts,
      settings,
    };
  }

  function dedupeMessages(msgs){
    const seen = new Set();
    const out = [];
    for (const m of msgs){
      const key = `${m.type}|${m.title}|${m.details}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
    // Sort: danger first, then warn, then info
    const prio = { danger: 0, warn: 1, info: 2 };
    out.sort((a,b) => (prio[a.type] ?? 9) - (prio[b.type] ?? 9));
    return out;
  }

  // ---------- Events ----------
  monthSelectEl.addEventListener('change', () => {
    const v = String(monthSelectEl.value || '').trim();
    if (!/^\d{4}-\d{2}$/.test(v)) return;

    state.month = v;
    ensureMonthStructures(state.month);
    saveState();
    renderAll();
  });

  attemptsInputEl.addEventListener('change', () => {
    state.settings.attempts = clamp(Math.round(Number(attemptsInputEl.value || 10000)), 10, 1000000);
    attemptsInputEl.value = state.settings.attempts;
    saveState();
  });

  preferGapsEl.addEventListener('change', () => {
    state.settings.preferGaps = Boolean(preferGapsEl.checked);
    saveState();
  });

  addEmpBtn.addEventListener('click', () => {
    const name = String(newEmpNameEl.value || '').trim();
    const weeklyHours = Number(newEmpHoursEl.value || 0);

    if (!name){
      alert('Bitte einen Namen eingeben.');
      return;
    }

    const emp = normalizeEmployee({ id: makeId(), name, weeklyHours });

    state.employees.push(emp);

    newEmpNameEl.value = '';
    newEmpNameEl.focus();

    saveState();
    renderAll();
  });

  employeeListEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action="remove-emp"]');
    if (!btn) return;
    const empId = btn.getAttribute('data-emp-id');
    if (!empId) return;

    const ok = confirm('Mitarbeiter wirklich entfernen? (Blockliste & Plan werden entsprechend angepasst)');
    if (!ok) return;

    state.employees = state.employees.filter(e => e.id !== empId);

    // Remove blocks for this employee in all months
    for (const mk of Object.keys(state.blocksByMonth)){
      if (state.blocksByMonth[mk] && state.blocksByMonth[mk][empId]){
        delete state.blocksByMonth[mk][empId];
      }
    }

    // Remove plan results for all months (safe)
    for (const mk of Object.keys(state.lastResultByMonth)){
      if (state.lastResultByMonth[mk]){
        // do not try to partially remove; just clear
        state.lastResultByMonth[mk] = null;
      }
    }

    saveState();
    renderAll();
  });

  

  // Live update for Sonderwünsche (damit die erkannten Regeln sofort sichtbar sind)
  employeeListEl.addEventListener('input', (ev) => {
    const el = ev.target;
    if (!el || typeof el.getAttribute !== 'function') return;
    if (el.getAttribute('data-field') !== 'wishText') return;

    const card = el.closest('.emp-card');
    const empId = card ? card.getAttribute('data-emp-id') : null;
    if (!empId) return;

    const emp = state.employees.find(e => e.id === empId);
    if (!emp) return;

    emp.wishText = String(el.value || '');
    emp.prefs = sanitizePrefs({ ...emp.prefs, ...parseWishText(emp.wishText) });

    const parsedEl = card.querySelector('[data-role="prefsParsed"]');
    if (parsedEl){
      parsedEl.innerHTML = `<strong>Erkannt:</strong> ${escapeHtml(describePrefs(emp.prefs))}`;
    }

    saveState();
  });

  // Name / Wochenstunden committen (Change = meistens Blur/Enter)
  employeeListEl.addEventListener('change', (ev) => {
    const el = ev.target;
    if (!el || typeof el.getAttribute !== 'function') return;

    const field = el.getAttribute('data-field');
    if (!field) return;

    const card = el.closest('.emp-card');
    const empId = card ? card.getAttribute('data-emp-id') : null;
    if (!empId) return;

    const emp = state.employees.find(e => e.id === empId);
    if (!emp) return;

    if (field === 'name'){
      emp.name = String(el.value || '').trim() || 'Unbenannt';
      el.value = emp.name;
    } else if (field === 'weeklyHours'){
      emp.weeklyHours = round1(clamp(Number(el.value || 0), 0, 80));
      el.value = emp.weeklyHours;
    } else if (field === 'balanceHours'){
      emp.balanceHours = round1(clamp(Number(el.value || 0), -10000, 10000));
      el.value = emp.balanceHours;
    } else if (field === 'wishText'){
      emp.wishText = String(el.value || '').trim();
      emp.prefs = sanitizePrefs({ ...emp.prefs, ...parseWishText(emp.wishText) });
    }

    // Änderung an Mitarbeiterdaten => Ergebnisse verwerfen (sicher)
    for (const mk of Object.keys(state.lastResultByMonth)){
      state.lastResultByMonth[mk] = null;
    }

    saveState();
    renderAll();
  });

blockTableEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action="set-block"]');
    if (!btn) return;

    const wrap = btn.closest('.toggle2');
    if (!wrap) return;

    const empId = wrap.getAttribute('data-emp-id');
    const iso = wrap.getAttribute('data-iso');
    const value = btn.getAttribute('data-value');

    if (!empId || !iso || !value) return;

    const current = getBlock(state.month, empId, iso);
    const next = (current === value) ? BLOCK.NONE : value;

    // WF-Limit (max. 3 pro Person / Monat)
    if (next === BLOCK.WF && current !== BLOCK.WF){
      const used = countBlocks(state.month, empId, BLOCK.WF);
      if (used >= 3){
        alert(`WF ist auf max. 3 Tage pro Person/Monat begrenzt (aktuell: ${used}/3).`);
        return;
      }
    }

    setBlock(state.month, empId, iso, next);

    // Clear last result for this month (because inputs changed)
    state.lastResultByMonth[state.month] = null;

    saveState();
    renderAll();
  });

  // TD Pflicht Checkbox (pro Datum, global)
  blockTableEl.addEventListener('change', (ev) => {
    const cb = ev.target && ev.target.closest ? ev.target.closest('input[data-action="toggle-td-required"]') : null;
    if (!cb) return;

    const iso = cb.getAttribute('data-iso');
    if (!iso) return;

    setTdRequired(state.month, iso, Boolean(cb.checked));

    // Inputs changed -> Ergebnis für diesen Monat verwerfen
    state.lastResultByMonth[state.month] = null;

    saveState();
    renderAll();
  });

  generateBtn.addEventListener('click', async () => {
    // basic validation: at least one employee
    if (state.employees.length === 0){
      alert('Bitte zuerst mindestens einen Mitarbeiter hinzufügen.');
      return;
    }

    const totalAttempts = clamp(Math.round(Number(state.settings.attempts || 10000)), 10, 1000000);

    try{
      generateBtn.disabled = true;
      clearBtn.disabled = true;

      setProgressVisible(true);
      resetProgress();
      updateProgress(0, totalAttempts, 'Start…');
      await nextFrame();

      const res = await generateMonthPlan({
        onProgress: (done, total, info) => {
          const sec = (info && typeof info.elapsedMs === 'number') ? Math.round(info.elapsedMs / 1000) : null;
          const extra = (sec !== null) ? `Zeit: ${sec}s` : '';
          updateProgress(done, total, extra);
        },
      });

      state.lastResultByMonth[state.month] = res;
      saveState();
      renderAll();
    }catch(e){
      console.error(e);
      alert(`Generierung fehlgeschlagen: ${e && e.message ? e.message : e}`);
    } finally {
      generateBtn.disabled = false;
      clearBtn.disabled = false;
      setProgressVisible(false);
      resetProgress();
    }
  });

  clearBtn.addEventListener('click', () => {
    state.lastResultByMonth[state.month] = null;
    saveState();
    renderAll();
  });

  printBtn.addEventListener('click', () => {
    const res = state.lastResultByMonth[state.month];
    if (!res){
      alert('Noch kein Dienstplan vorhanden. Bitte zuerst generieren.');
      return;
    }
    window.print();
  });

  exportBtn.addEventListener('click', () => {
    const payload = JSON.stringify(state, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `dienstplan_state_${state.month}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  });

  importFileEl.addEventListener('change', async () => {
    const file = importFileEl.files && importFileEl.files[0];
    if (!file) return;

    try{
      const text = await file.text();
      const obj = JSON.parse(text);

      // very simple validation
      if (!obj || typeof obj !== 'object') throw new Error('Ungültige JSON-Datei.');
      if (!Array.isArray(obj.employees)) throw new Error('JSON enthält keine employees-Liste.');

      // Load into state
      const base = defaultState();
      state = {
        ...base,
        ...obj,
        settings: safeSettings(obj.settings, base.settings),
        employees: obj.employees.map(normalizeEmployee),
        blocksByMonth: safeRecord(obj.blocksByMonth),
        tdRequiredByMonth: safeRecord(obj.tdRequiredByMonth),
        lastResultByMonth: safeRecord(obj.lastResultByMonth),
      };

      if (typeof state.month !== 'string' || !/^\d{4}-\d{2}$/.test(state.month)){
        state.month = base.month;
      }

      state.settings.attempts = clamp(Math.round(Number(state.settings.attempts || 10000)), 10, 1000000);
      state.settings.preferGaps = Boolean(state.settings.preferGaps);

      ensureMonthStructures(state.month);

      saveState();
      renderAll();

      alert('Import erfolgreich.');
    }catch(e){
      console.error(e);
      alert(`Import fehlgeschlagen: ${e.message || e}`);
    } finally {
      importFileEl.value = '';
    }
  });

  // ---------- Init ----------
  // Cache-Datei Buttons
  if (connectCacheBtn) connectCacheBtn.addEventListener('click', connectCacheFile);
  if (saveCacheBtn) saveCacheBtn.addEventListener('click', saveToCacheFile);
  if (loadCacheBtn) loadCacheBtn.addEventListener('click', loadFromCacheFile);
  if (disconnectCacheBtn) disconnectCacheBtn.addEventListener('click', disconnectCacheFile);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveToCacheFile();
    }
  });

  window.addEventListener('beforeunload', () => {
    saveToCacheFile();
  });

  ensureCacheHandleLoaded();

  renderAll();

})();
