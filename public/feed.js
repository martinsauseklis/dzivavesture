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
  if (topic !== null) revealAll();
  for (const a of $$('.post')) a.hidden = topic !== null && !a.dataset.topics.split('\n').includes(topic);
  for (const b of $$('.trend')) b.classList.toggle('on', b.dataset.topic === topic);
  $('#filterbar').hidden = topic === null;
  $('#chip').textContent = topic === null ? '' : `${topic} ×`;
}
for (const b of $$('.trend'))
  b.addEventListener('click', () => { filterTopic(b.dataset.topic); showTab('feed'); logEvent('topic'); });
$('#chip')?.addEventListener('click', () => filterTopic(null));

// ---- lazy reveal (feed page only) ------------------------------------------
// Every post is already in the HTML — crawlers, view-source and reader mode see
// all of them, and nothing is ever fetched. The stylesheet hides everything
// past the fifth; this reveals them a batch at a time as the reader arrives at
// the bottom, so the page opens like a feed rather than as one long wall.
//
// `.later` is used rather than `hidden` on purpose: `hidden` belongs to the
// trends filter above, and if both owned it they would silently undo each
// other — filtering a topic and then scrolling would bring back posts the
// filter had excluded.
const BATCH = 5;          // posts revealed per arrival at the bottom
const DELAY_MS = 200;     // his ask: a beat before the next batch lands

const sentinel = $('#more');

function revealAll() {
  for (const a of $$('#feed .post.later')) a.classList.remove('later');
  sentinel?.remove();
}

// Arriving by the browser's Back button without a bfcache restore reloads the
// page, and the browser then puts the reader back at their old scroll position
// — into a document that is only five posts tall at that moment, so they land
// somewhere they never were. The reader has already seen this feed: reveal it
// all before that restore, exactly as the page behaved before lazy reveal.
const returning = performance.getEntriesByType('navigation')[0]?.type === 'back_forward';

if (sentinel && !returning && $$('#feed .post.later').length && 'IntersectionObserver' in window) {
  let busy = false;
  const io = new IntersectionObserver((entries) => {
    if (busy || !entries.some((e) => e.isIntersecting)) return;
    busy = true;
    setTimeout(() => {
      for (const a of $$('#feed .post.later').slice(0, BATCH)) a.classList.remove('later');
      busy = false;
      // Last batch: stop observing and drop the sentinel, so a reader who
      // scrolls back down does not keep triggering an empty reveal.
      if (!$$('#feed .post.later').length) { io.disconnect(); sentinel.remove(); }
    }, DELAY_MS);
  }, { rootMargin: '300px' });   // start the beat before the reader hits the end
  io.observe(sentinel);
} else {
  // No IntersectionObserver (or nothing to reveal): show everything rather than
  // leave posts permanently unreachable.
  revealAll();
}
