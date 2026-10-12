/* DailySpark frontend: personal daily quote, mood picker, card studio. */
(function () {
  'use strict';

  var Cards = window.DailySparkCards;
  var STORE_KEY = 'dailyspark:v1';

  var FALLBACK_MOODS = [
    { id: 'energized', label: 'Ready to go', emoji: '\u26A1' },
    { id: 'tired', label: 'Low on energy', emoji: '\uD83D\uDE34' },
    { id: 'anxious', label: 'Anxious', emoji: '\uD83D\uDE1F' },
    { id: 'unfocused', label: 'Scattered', emoji: '\uD83C\uDF00' },
    { id: 'down', label: 'Feeling low', emoji: '\uD83C\uDF27\uFE0F' },
    { id: 'stuck', label: 'Stuck', emoji: '\uD83E\uDDF1' }
  ];
  var FALLBACK_CATEGORIES = [
    { id: 'motivation', label: 'Motivation' }, { id: 'focus', label: 'Focus' },
    { id: 'calm', label: 'Calm' }, { id: 'courage', label: 'Courage' },
    { id: 'success', label: 'Success' }, { id: 'positivity', label: 'Positivity' },
    { id: 'resilience', label: 'Resilience' }, { id: 'wisdom', label: 'Wisdom' }
  ];
  // Used only if the server cannot be reached.
  var FALLBACK_QUOTES = [
    { id: 'fb000000001', text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius', categories: ['resilience'], source: 'Built-in' },
    { id: 'fb000000002', text: 'Start where you are. Use what you have. Do what you can.', author: 'Arthur Ashe', categories: ['motivation'], source: 'Built-in' },
    { id: 'fb000000003', text: 'Nothing will work unless you do.', author: 'Maya Angelou', categories: ['motivation'], source: 'Built-in' },
    { id: 'fb000000004', text: 'Fall seven times, stand up eight.', author: 'Japanese Proverb', categories: ['resilience'], source: 'Built-in' },
    { id: 'fb000000005', text: 'Calmness is the cradle of power.', author: 'Josiah Gilbert Holland', categories: ['calm'], source: 'Built-in' }
  ];

  var $ = function (sel) { return document.querySelector(sel); };

  var el = {
    canvas: $('#cardCanvas'), wrap: $('#cardWrap'), source: $('#sourceLine'), sr: $('#quoteText'),
    greeting: $('#greeting'), lede: $('#lede'), date: $('#dateLabel'), streak: $('#streak'),
    moods: $('#moods'), tip: $('#tip'), templates: $('#templates'), formats: $('#formats'),
    download: $('#downloadBtn'), save: $('#saveBtn'), copy: $('#copyBtn'), share: $('#shareBtn'), listen: $('#listenBtn'),
    favBtn: $('#favoritesBtn'), favCount: $('#favCount'), favDialog: $('#favs'), favList: $('#favList'), favClose: $('#favsClose'),
    themeBtn: $('#themeBtn'), personalize: $('#personalizeBtn'),
    onboard: $('#onboard'), nameInput: $('#nameInput'), interestChips: $('#interestChips'),
    onboardSave: $('#onboardSave'), onboardSkip: $('#onboardSkip'),
    toast: $('#toast'), pool: $('#poolInfo')
  };

  var moods = FALLBACK_MOODS;
  var categories = FALLBACK_CATEGORIES;
  var current = null; // { quote, tip }
  var toastTimer = null;
  var renderToken = 0;

  /* ---------- storage ---------- */

  function makeUid() {
    var bytes = new Uint8Array(12);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    var out = 'u';
    for (var j = 0; j < bytes.length; j++) out += ('0' + bytes[j].toString(16)).slice(-2);
    return out;
  }

  function defaults() {
    return {
      uid: makeUid(), name: '', interests: [], mood: 'energized', template: 'aurora', format: 'portrait',
      theme: '', onboarded: false, streak: { last: '', count: 0, best: 0 },
      favorites: [], history: [], daily: {}
    };
  }

  function loadState() {
    var base = defaults();
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          Object.keys(base).forEach(function (k) {
            if (saved[k] !== undefined && saved[k] !== null) base[k] = saved[k];
          });
        }
      }
    } catch (e) { /* private mode or corrupt data: start fresh */ }
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(base.uid)) base.uid = makeUid();
    if (!Array.isArray(base.favorites)) base.favorites = [];
    if (!Array.isArray(base.history)) base.history = [];
    if (!Array.isArray(base.interests)) base.interests = [];
    if (!base.daily || typeof base.daily !== 'object') base.daily = {};
    return base;
  }

  var state = loadState();

  function save() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  /* ---------- dates ---------- */

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function localDate(d) { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseDate(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }

  function updateStreak(today) {
    var s = state.streak || { last: '', count: 0, best: 0 };
    if (s.last !== today) {
      s.count = (s.last && daysBetween(s.last, today) === 1) ? s.count + 1 : 1;
      s.last = today;
      s.best = Math.max(s.best || 0, s.count);
    }
    state.streak = s;
    el.streak.textContent = 'Day ' + s.count;
    el.streak.title = 'Days in a row you\u2019ve opened DailySpark (best: ' + s.best + ')';
  }

  /* ---------- small UI helpers ---------- */

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, 2400);
  }

  function openDialog(d) {
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else { d.setAttribute('open', ''); }
  }
  function closeDialog(d) {
    if (typeof d.close === 'function') { if (d.open) d.close(); } else { d.removeAttribute('open'); }
  }

  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }

  function applyTheme() {
    var theme = state.theme;
    if (theme !== 'light' && theme !== 'dark') {
      theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
    el.themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }

  /* ---------- greeting ---------- */

  function renderGreeting() {
    var now = new Date();
    var hour = now.getHours();
    var part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    el.greeting.textContent = state.name ? part + ', ' + state.name : part;
    el.date.textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    var mood = findMood(state.mood);
    el.lede.textContent = mood && mood.description
      ? mood.description + ' Your quote changes with your mood.'
      : 'Your quote for today is picked for you, and changes with your mood.';
  }

  function findMood(id) {
    for (var i = 0; i < moods.length; i++) if (moods[i].id === id) return moods[i];
    return null;
  }

  /* ---------- mood chips ---------- */

  function renderMoods() {
    el.moods.textContent = '';
    moods.forEach(function (m) {
      var b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(m.id === state.mood), 'data-mood': m.id, text: m.emoji + ' ' + m.label });
      b.addEventListener('click', function () {
        if (state.mood === m.id) return;
        state.mood = m.id;
        save();
        renderMoods();
        renderGreeting();
        loadQuote();
      });
      el.moods.appendChild(b);
    });
  }

  /* ---------- quote loading ---------- */

  function hashString(s) {
    var x = 5381;
    for (var i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0;
    return Math.abs(x);
  }

  function fallbackQuote(day) {
    var q = FALLBACK_QUOTES[hashString(state.uid + day + state.mood) % FALLBACK_QUOTES.length];
    return { quote: q, tip: '' };
  }

  function rememberQuote(day, key, result) {
    state.daily[key] = result;
    Object.keys(state.daily).forEach(function (k) { if (k.indexOf(day + '|') !== 0) delete state.daily[k]; });
    var id = result.quote.id;
    state.history = state.history.filter(function (x) { return x !== id; });
    state.history.push(id);
    if (state.history.length > 30) state.history = state.history.slice(-30);
    save();
  }

  function loadQuote() {
    var day = localDate();
    var key = day + '|' + state.mood + '|' + state.interests.slice().sort().join(',');
    var cached = state.daily[key];
    if (cached && cached.quote && cached.quote.text) {
      current = cached;
      showQuote();
      return Promise.resolve();
    }

    el.wrap.classList.add('is-loading');
    var params = new URLSearchParams({ uid: state.uid, mood: state.mood, date: day });
    if (state.interests.length) params.set('interests', state.interests.join(','));
    var recent = state.history.slice(-14);
    if (recent.length) params.set('exclude', recent.join(','));

    return fetch('/api/daily?' + params.toString(), { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        current = { quote: data.quote, tip: data.tip || '', pool: data.pool_size };
        rememberQuote(day, key, current);
        showQuote();
      })
      .catch(function () {
        current = fallbackQuote(day);
        toast('Could not reach the server. Showing a built-in quote.');
        showQuote();
      });
  }

  /* ---------- card rendering ---------- */

  function cardLabel() {
    var d = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    return state.name ? 'A spark for ' + state.name + ' \u00B7 ' + d : d;
  }

  function loadFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var jobs = [
      '500 40px "Fraunces"', '600 40px "Fraunces"', 'italic 400 40px "Fraunces"',
      '700 40px "Plus Jakarta Sans"', '800 40px "Plus Jakarta Sans"'
    ].map(function (f) { return document.fonts.load(f, 'Aa'); });
    return Promise.all(jobs).catch(function () { /* fall back to system fonts */ });
  }

  function drawMain() {
    if (!current) return;
    Cards.draw(el.canvas, current.quote, state.template, { format: state.format, label: cardLabel() });
    el.canvas.setAttribute('aria-label', 'Quote card: ' + current.quote.text + ' by ' + current.quote.author);
  }

  function drawThumbs() {
    if (!current) return;
    var buttons = el.templates.querySelectorAll('canvas');
    Cards.TEMPLATES.forEach(function (t, i) {
      if (buttons[i]) Cards.draw(buttons[i], current.quote, t.id, { format: 'portrait', width: 220 });
    });
  }

  function showQuote() {
    if (!current) return;
    var token = ++renderToken;
    el.wrap.classList.remove('is-loading');
    el.sr.textContent = current.quote.text + ' ' + current.quote.author;
    el.source.textContent = 'Source: ' + (current.quote.source || 'Curated') +
      (current.quote.categories && current.quote.categories.length ? ' \u00B7 ' + current.quote.categories.join(', ') : '');
    if (current.tip) {
      el.tip.hidden = false;
      el.tip.textContent = '';
      el.tip.appendChild(h('strong', { text: 'Try this today' }));
      el.tip.appendChild(document.createTextNode(current.tip));
    } else {
      el.tip.hidden = true;
    }
    drawMain();
    drawThumbs();
    updateSaveButton();
    // Redraw once web fonts are ready so cards use the designed typefaces.
    loadFonts().then(function () { if (token === renderToken) { drawMain(); drawThumbs(); } });
  }

  function renderTemplates() {
    el.templates.textContent = '';
    Cards.TEMPLATES.forEach(function (t) {
      var canvas = h('canvas', { width: '220', height: '275', 'aria-hidden': 'true' });
      var b = h('button', { type: 'button', class: 'tpl', 'aria-pressed': String(t.id === state.template), 'aria-label': t.name + ' template' }, [canvas, h('span', { text: t.name })]);
      b.addEventListener('click', function () {
        state.template = t.id;
        save();
        Array.prototype.forEach.call(el.templates.children, function (c) { c.setAttribute('aria-pressed', String(c === b)); });
        drawMain();
      });
      el.templates.appendChild(b);
    });
  }

  function renderFormats() {
    el.formats.textContent = '';
    Object.keys(Cards.FORMATS).forEach(function (id) {
      var f = Cards.FORMATS[id];
      var b = h('button', { type: 'button', 'aria-pressed': String(id === state.format), text: f.label });
      b.addEventListener('click', function () {
        state.format = id;
        save();
        Array.prototype.forEach.call(el.formats.children, function (c) { c.setAttribute('aria-pressed', String(c === b)); });
        drawMain();
      });
      el.formats.appendChild(b);
    });
  }

  /* ---------- actions ---------- */

  function quoteText() { return '\u201C' + current.quote.text + '\u201D \u2014 ' + current.quote.author; }

  function fileName() { return 'dailyspark-' + localDate() + '-' + state.template + '.png'; }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function withBlob(cb) {
    if (!current) return;
    if (el.canvas.toBlob) {
      el.canvas.toBlob(function (blob) { if (blob) cb(blob); else toast('Could not create the image.'); }, 'image/png');
    } else {
      toast('Your browser cannot export images.');
    }
  }

  function onDownload() {
    withBlob(function (blob) { downloadBlob(blob, fileName()); toast('Card downloaded'); });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? resolve() : reject(new Error('copy failed')); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  function onCopy() {
    if (!current) return;
    copyText(quoteText()).then(function () { toast('Quote copied'); }, function () { toast('Copy failed. Select the text manually.'); });
  }

  function onShare() {
    if (!current) return;
    withBlob(function (blob) {
      var file = null;
      try { file = new File([blob], fileName(), { type: 'image/png' }); } catch (e) { file = null; }
      var text = quoteText();
      var job;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        job = navigator.share({ files: [file], text: text, title: 'DailySpark' });
      } else if (navigator.share) {
        job = navigator.share({ text: text, title: 'DailySpark' });
      } else {
        downloadBlob(blob, fileName());
        toast('Sharing is not supported here, so the card was downloaded.');
        return;
      }
      job.catch(function (err) { if (!err || err.name !== 'AbortError') toast('Could not share.'); });
    });
  }

  function onListen() {
    if (!current) return;
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      toast('Speech is not supported in this browser.');
      return;
    }
    var synth = window.speechSynthesis;
    if (synth.speaking) { synth.cancel(); el.listen.textContent = 'Listen'; return; }
    var u = new SpeechSynthesisUtterance(current.quote.text + ' ' + current.quote.author);
    u.rate = 0.95;
    u.onend = u.onerror = function () { el.listen.textContent = 'Listen'; };
    el.listen.textContent = 'Stop';
    synth.speak(u);
  }

  /* ---------- favourites ---------- */

  function isSaved(id) { return state.favorites.some(function (f) { return f.id === id; }); }

  function updateSaveButton() {
    var saved = current && isSaved(current.quote.id);
    el.save.setAttribute('aria-pressed', String(!!saved));
    el.save.textContent = saved ? 'Saved' : 'Save quote';
    el.favCount.hidden = state.favorites.length === 0;
    el.favCount.textContent = String(state.favorites.length);
  }

  function onSave() {
    if (!current) return;
    var q = current.quote;
    if (isSaved(q.id)) {
      state.favorites = state.favorites.filter(function (f) { return f.id !== q.id; });
      toast('Removed from saved quotes');
    } else {
      state.favorites.unshift({ id: q.id, text: q.text, author: q.author, categories: q.categories || [], source: q.source || '' });
      toast('Saved');
    }
    save();
    updateSaveButton();
  }

  function renderFavorites() {
    el.favList.textContent = '';
    if (!state.favorites.length) {
      el.favList.appendChild(h('li', { class: 'fav-empty', text: 'Nothing saved yet. Tap \u201CSave quote\u201D on a card you like.' }));
      return;
    }
    state.favorites.forEach(function (f) {
      var useBtn = h('button', { type: 'button', class: 'btn', text: 'Use on card' });
      var delBtn = h('button', { type: 'button', class: 'btn', text: 'Remove' });
      useBtn.addEventListener('click', function () {
        current = { quote: f, tip: '' };
        closeDialog(el.favDialog);
        showQuote();
      });
      delBtn.addEventListener('click', function () {
        state.favorites = state.favorites.filter(function (x) { return x.id !== f.id; });
        save();
        renderFavorites();
        updateSaveButton();
      });
      el.favList.appendChild(h('li', {}, [
        h('blockquote', { text: '\u201C' + f.text + '\u201D' }),
        h('div', { class: 'by', text: f.author }),
        h('div', { class: 'row' }, [useBtn, delBtn])
      ]));
    });
  }

  /* ---------- onboarding / personalise ---------- */

  var draftInterests = [];

  function renderInterestChips() {
    el.interestChips.textContent = '';
    categories.forEach(function (c) {
      var on = draftInterests.indexOf(c.id) !== -1;
      var b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(on), text: c.label });
      b.addEventListener('click', function () {
        var i = draftInterests.indexOf(c.id);
        if (i === -1) draftInterests.push(c.id); else draftInterests.splice(i, 1);
        b.setAttribute('aria-pressed', String(i === -1));
      });
      el.interestChips.appendChild(b);
    });
  }

  function openPersonalize() {
    draftInterests = state.interests.slice();
    el.nameInput.value = state.name || '';
    renderInterestChips();
    openDialog(el.onboard);
  }

  function finishOnboarding(saveChanges) {
    if (saveChanges) {
      state.name = el.nameInput.value.trim().slice(0, 24);
      state.interests = draftInterests.slice();
    }
    state.onboarded = true;
    save();
    closeDialog(el.onboard);
    renderGreeting();
    loadQuote();
  }

  /* ---------- startup ---------- */

  function loadMeta() {
    return fetch('/api/moods')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        if (data.moods && data.moods.length) moods = data.moods;
        if (data.categories && data.categories.length) categories = data.categories;
        if (!findMood(state.mood)) state.mood = data.default_mood || moods[0].id;
      })
      .catch(function () { /* keep built-in moods */ });
  }

  function loadPoolInfo() {
    fetch('/api/stats')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        if (!s) return;
        var online = Object.keys(s.by_source || {}).filter(function (k) { return k !== 'Curated'; });
        el.pool.textContent = s.total + ' quotes' + (online.length ? ' from ' + online.join(', ') + ' and our curated list' : ' (curated list)');
      })
      .catch(function () { /* optional */ });
  }

  function bind() {
    el.download.addEventListener('click', onDownload);
    el.save.addEventListener('click', onSave);
    el.copy.addEventListener('click', onCopy);
    el.share.addEventListener('click', onShare);
    el.listen.addEventListener('click', onListen);
    el.favBtn.addEventListener('click', function () { renderFavorites(); openDialog(el.favDialog); });
    el.favClose.addEventListener('click', function () { closeDialog(el.favDialog); });
    el.personalize.addEventListener('click', openPersonalize);
    el.onboardSave.addEventListener('click', function () { finishOnboarding(true); });
    el.onboardSkip.addEventListener('click', function () { finishOnboarding(false); });
    el.themeBtn.addEventListener('click', function () {
      var now = document.documentElement.getAttribute('data-theme');
      state.theme = now === 'dark' ? 'light' : 'dark';
      save();
      applyTheme();
    });
  }

  function init() {
    applyTheme();
    bind();
    renderTemplates();
    renderFormats();
    updateStreak(localDate());
    save();
    loadMeta().then(function () {
      renderMoods();
      renderGreeting();
      loadPoolInfo();
      var first = loadQuote();
      if (!state.onboarded) {
        first.then(function () { openPersonalize(); });
      }
    });
  }

  init();
})();
