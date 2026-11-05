// Interactions only. Every piece of content — folds, profiles, trends — is
// already in the HTML; this file shows and hides it. With scripts off,
// nojs.css unfolds everything instead.
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---- telemetry: the one place anything is reported -------------------------
// GoatCounter sets no cookies and stores no personal data. The page loads it
// with `no_onload`, so nothing is sent unless this function is called.
// Field values are closed enums (the fold kinds) — never free text, because a
// string field is how content would leak into telemetry. When the script is
// not on the page (no site code set), this is a no-op.
const EVENTS = { pageview: 1, fold: 1, topic: 1, thread: 1 };
function logEvent(name, fields = {}) {
  if (!(name in EVENTS) || !window.goatcounter) return;
  if (name === 'pageview') { window.goatcounter.count(); return; }
  window.goatcounter.count({ path: [name, ...Object.values(fields)].join('/'), event: true });
}
const gc = $('script[data-goatcounter]');
if (window.goatcounter) logEvent('pageview');
else gc?.addEventListener('load', () => logEvent('pageview'));

// ---- tabs ------------------------------------------------------------------
function showTab(name) {
  for (const b of $$('.tabs [data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  $('#panel-feed').hidden = name !== 'feed';
  $('#panel-trends').hidden = name !== 'trends';
  scrollTo({ top: 0 });
}
for (const b of $$('.tabs [data-tab]')) b.addEventListener('click', () => showTab(b.dataset.tab));

// ---- folds: one open per card, so the card stays a post --------------------
function openFold(card, button) {
  const target = document.getElementById(button.getAttribute('aria-controls'));
  const wasOpen = !target.hidden;
  for (const f of $$('.fold', card)) f.hidden = true;
  for (const b of $$('.bar [aria-controls]', card)) b.setAttribute('aria-expanded', 'false');
  if (wasOpen) return;
  target.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  logEvent('fold', { kind: target.dataset.kind });
}
for (const b of $$('.bar [aria-controls]:not(.thread-toggle)'))
  b.addEventListener('click', () => openFold(b.closest('.post'), b));

// A thread is collapsed to its first segment; this unfolds the rest below the
// connector. Independent of the folds, so opening a source does not close it.
for (const b of $$('.thread-toggle'))
  b.addEventListener('click', () => {
    const rest = document.getElementById(b.getAttribute('aria-controls'));
    rest.hidden = !rest.hidden;
    b.setAttribute('aria-expanded', String(!rest.hidden));
    b.textContent = rest.hidden ? b.textContent.replace('sakļaut pavedienu', 'rādīt pavedienu') : b.textContent.replace('rādīt pavedienu', 'sakļaut pavedienu');
    if (!rest.hidden) logEvent('thread');
  });

// A [?] gap reaches its explanation in one tap: the source fold holds the warn.
for (const g of $$('.gap'))
  g.addEventListener('click', () => {
    const card = g.closest('.post');
    const src = $('.fold.src', g.closest('.seg'));
    if (src.hidden) openFold(card, $(`.bar [aria-controls="${src.id}"]`, card));
    $('.warn', src).scrollIntoView({ block: 'nearest' });
  });

// ---- profiles: who this account was on 18 November 1918 ---------------------
// Tapping the name opens it above the text; tapping a mention opens it below.
// Tapping the same one again closes it.
function toggleProfile(button) {
  const body = $('.body', button.closest('.post'));
  const open = $('.profile', body);
  if (open) {
    open.remove();
    $('[aria-expanded="true"][data-handle]', body.parentElement)?.setAttribute('aria-expanded', 'false');
    if (open.dataset.handle === button.dataset.handle) return;
  }
  const tpl = document.getElementById('prof-' + button.dataset.handle);
  if (!tpl) return; // no profile exists for this handle — show nothing rather than guess
  const card = tpl.content.firstElementChild.cloneNode(true);
  button.matches('.acct') ? body.prepend(card) : body.append(card);
  button.setAttribute('aria-expanded', 'true');
}
for (const b of $$('.acct, .mention')) b.addEventListener('click', () => toggleProfile(b));

// ---- trends filter -----------------------------------------------------------
// Topics are joined with "\n" in data-topics because topic names contain
// commas ("Dievs, svētī Latviju"); a newline cannot occur in a JSON topic string.
function filterTopic(topic) {
  for (const a of $$('.post')) a.hidden = topic !== null && !a.dataset.topics.split('\n').includes(topic);
  for (const b of $$('.trend')) b.classList.toggle('on', b.dataset.topic === topic);
  $('#filterbar').hidden = topic === null;
  $('#chip').textContent = topic === null ? '' : `${topic} ×`;
}
for (const b of $$('.trend'))
  b.addEventListener('click', () => { filterTopic(b.dataset.topic); showTab('feed'); logEvent('topic'); });
$('#chip').addEventListener('click', () => filterTopic(null));
