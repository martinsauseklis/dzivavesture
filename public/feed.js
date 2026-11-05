// Interactions only. Every piece of content — folds, trends — is already in
// the HTML; this file shows and hides it. With scripts off, nojs.css unfolds
// everything instead. The same file runs on the feed and on every profile
// page; the feed-only hooks (tabs, trends, chip) find nothing there and do nothing.
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

// ---- tabs (feed page only; a profile page has none of these) --------------
function showTab(name) {
  for (const b of $$('.tabs [data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  $('#panel-feed').hidden = name !== 'feed';
  $('#panel-trends').hidden = name !== 'trends';
  scrollTo({ top: 0 });
}
for (const b of $$('.tabs [data-tab]')) b.addEventListener('click', () => showTab(b.dataset.tab));

// ---- folds (replies): one open per card, so the card stays a post ----------
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
$('#chip')?.addEventListener('click', () => filterTopic(null));
