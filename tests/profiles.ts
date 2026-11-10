// The machine rows of store/systems/outcomes/profile-pages.md (P1–P9), run
// against the built site. Table-driven, no framework. `pnpm test` builds
// first, so this always judges the current source.
//   node tests/profiles.ts                 — file checks on dist/
//   node tests/profiles.ts http://host:8150 — additionally fetches every page (P1: 200)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { DAYS, DAYS_SPAN, DAY_CARD_SEQ, dayStripLabel, dayWeights, descriptionLines, plural, publishedOn, reachableHandles, readIdentities, renderedPosts, type Account, type Post } from '../src/lib/feed.ts';

const DIST = resolve(new URL('../dist', import.meta.url).pathname);
if (!existsSync(join(DIST, 'index.html'))) { console.error('dist/ missing — run pnpm build first'); process.exit(1); }

let failed = 0;
function check(name: string, ok: boolean, note = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`);
}

const data = JSON.parse(readFileSync(new URL('../src/data/18-11-1918.json', import.meta.url), 'utf8'));
const accounts = data.accounts as Record<string, Account>;
// CHANGED 2026-11-10: the site renders four days. `handles` are the accounts
// that get a page (reachable from a rendered post or mention — 36); the three
// memoirists stay in the data but are parked with their recollections.
const { shown: feedPosts, byDay, parked } = renderedPosts(data);
const handles = reachableHandles(accounts, feedPosts);
const parkedHandles = Object.keys(accounts).filter((h) => !handles.includes(h));
const postless = handles.filter((h) => !feedPosts.some((p) => p.handle === h));

const html = (file: string) => readFileSync(file, 'utf8');
// One built page per day; the 18th is dist/index.html.
const dayFile = (d: typeof DAYS[number]) => join(DIST, d.path, 'index.html');
const dayDocs = DAYS.map((d) => [d, html(dayFile(d))] as const);
const feed = html(join(DIST, 'index.html'));
const page = (h: string) => join(DIST, h, 'index.html');
const attr = (doc: string, re: RegExp) => [...doc.matchAll(re)].map((m) => m[1]);
const meta = (doc: string, name: string) => attr(doc, new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)"`, 'g'))[0] ?? '';
const titleOf = (doc: string) => attr(doc, /<title>([^<]*)<\/title>/g)[0] ?? '';

// --- P1: exactly one page per account --------------------------------------
const built = readdirSync(DIST).filter((d) => d.startsWith('@') && statSync(join(DIST, d)).isDirectory());
check(`P1: one directory per account with a page, ${handles.length} of them`, built.length === handles.length && handles.every((h) => existsSync(page(h))), `${built.length} built`);
check('P1: no profile directory without an account', built.every((d) => handles.includes(d)), built.filter((d) => !handles.includes(d)).join());
check('P1: the 3 parked memoirists have no page built', parkedHandles.join() === '@ed_calitis,@j_ampermanis,@a_brigadere' && parkedHandles.every((h) => !existsSync(page(h))), parkedHandles.join());
check('P1: one page per day, the 18th at the root', DAYS.every((d) => existsSync(dayFile(d))) && DAYS.find((d) => d.path === '')!.key === '18.11.1918');

// --- P2: every author name and (@mention) on the feed links to its page ------
for (const [d, doc] of dayDocs) {
  const mine = byDay.get(d.key)!;
  const base = d.path ? '../' : '';
  const acctLinks = attr(doc, /<a class="acct" href="([^"]*)"/g);
  check(`P2: ${d.key} — ${mine.length} author links, each to its own account page`, acctLinks.length === mine.length && acctLinks.every((href, i) => href === `${base}${mine[i].handle}/`), `${acctLinks.length} links`);
  const mentionLinks = attr(doc, /<a class="mention" href="([^"]*)">/g);
  check(`P2: ${d.key} — every (@mention) is a link to an existing page`, mentionLinks.every((href) => existsSync(join(DIST, d.path, href, 'index.html'))), `${mentionLinks.length} links`);
  check(`P2: ${d.key} — no mention button is left over`, !/class="mention"[^>]*<\/button>|<button[^>]*class="mention"/.test(doc));
}

// --- P3: a profile lists exactly that account's posts, in feed order --------
for (const h of handles) {
  const doc = html(page(h));
  const ids = attr(doc, /<article class="post" id="p-(\d+)"/g).map(Number);
  const want = feedPosts.filter((p) => p.handle === h).map((p) => p.seq);
  check(`P3: ${h} lists ${want.length} post(s) in feed order`, JSON.stringify(ids) === JSON.stringify(want), `got ${ids.length}`);
  const foreign = attr(doc, /<a class="acct" href="([^"]*)"/g).filter((href) => href !== `../${h}/`);
  check(`P3: ${h} shows no other account's post`, foreign.length === 0, foreign.join());
}

// --- P4: unique title / description / canonical / og:* per page ------------
const docs = [...dayDocs.map(([d, doc]) => [d.key, doc] as const), ...handles.map((h) => [h, html(page(h))] as const)];
for (const key of ['title', 'description', 'canonical', 'og:title', 'og:url', 'og:image', 'og:image:alt'] as const) {
  const values = docs.map(([, d]) => key === 'title' ? titleOf(d) : key === 'canonical' ? attr(d, /<link rel="canonical" href="([^"]*)"/g)[0] ?? '' : meta(d, key));
  check(`P4: ${key} is present and unique across all ${docs.length} pages`, values.every(Boolean) && new Set(values).size === values.length, `${new Set(values).size} distinct`);
}
// CHANGED 2026-11-10: a profile spans the four days, so its title names the span, not the 18th.
check('P4: every profile title names the account and the span of days', handles.every((h) => { const t = titleOf(html(page(h))); return t.includes(accounts[h].name) && t.includes(h) && t.includes(DAYS_SPAN); }));
// | day page   | title names                   | og:image                 | canonical            | og:type |
// | 18.11.1918 | 1918. gada 18. novembris      | /og.png                  | ORIGIN/              | website |
// | others     | 1918. gada DD. novembris      | /og/DD-11-1918.png       | ORIGIN/DD-11-1918/   | website |
for (const [d, doc] of dayDocs) {
  const image = d.path ? `/og/${d.path.slice(0, -1)}.png` : '/og.png';
  check(`P4: ${d.key} — title, canonical, og:image and og:type are its own`, titleOf(doc).includes(`1918. gada ${d.n}. novembris`) && (attr(doc, /<link rel="canonical" href="([^"]*)"/g)[0] ?? '').endsWith(`/${d.path}`)
    && meta(doc, 'og:image').endsWith(image) && existsSync(join(DIST, image)) && meta(doc, 'og:type') === 'website');
  const card = byDay.get(d.key)!.find((p) => p.seq === DAY_CARD_SEQ[d.key]);
  check(`P4: ${d.key} — the card post is on this day and the alt quotes it`, !!card && meta(doc, 'og:image:alt').includes(card!.handle) && doc.includes(`id="p-${card!.seq}"`));
}
check('P4: no profile reuses the feed og:image', handles.every((h) => meta(html(page(h)), 'og:image').endsWith(`/og/${h}.png`)));
check('P4: every profile og:image file exists', handles.every((h) => existsSync(join(DIST, 'og', `${h}.png`))), handles.filter((h) => !existsSync(join(DIST, 'og', `${h}.png`))).join());

// --- P5: the post-less accounts render their own state, never a zero -------
check('P5: 8 post-less accounts', postless.length === 8, postless.join());
for (const h of postless) {
  const doc = html(page(h));
  const body = doc.slice(doc.indexOf('<body'));
  check(`P5: ${h} has an empty-state statement, no post list, no zero`,
    /<section class="empty"><p>[^<]{40,}<\/p><\/section>/.test(doc) && !doc.includes('id="feed"') && !/\b0 ierakst/.test(body) && !new RegExp(`0 ${plural(0)}`).test(body));
  check(`P5: ${h} shows where it was named`, doc.includes('<section class="named">'));
}

// --- P11: the description is the researched identity, or deliberately nothing --
// | handle          | identity  | expected on the page                                  |
// | 28 accounts     | string    | exactly one <p class="bio"> holding it, no <p class="what"> |
// | 28 accounts     | bio set   | one <p class="bio"> equal to `bio` — the ~750-char      |
//                                   `identity` is the record, never the page             |
// | @zemes_sargi    | null      | the paper-sourced what + bio                          |
// | @f_brodermanis  | null      | no description paragraph at all                       |
const identities = readIdentities(JSON.parse(readFileSync(new URL('../rereading/identities.json', import.meta.url), 'utf8')), handles);
// `?.` not `!.`: an account the identities file does not list yet is not an
// error (feed.ts says so) — the three memoirists are described from the 1923
// volume alone, and the page falls back to the data's own what/bio.
const described = handles.filter((h) => identities.get(h)?.bio);
const unescape = (s: string) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const paras = (h: string) => [...html(page(h)).matchAll(/<p class="(what|bio)">([^<]*)<\/p>/g)].map((m) => [m[1], unescape(m[2])]);
check('P11: 28 profiles render their BIO as the one description paragraph (never the long identity)', described.length === 28 && described.every((h) => JSON.stringify(paras(h)) === JSON.stringify([['bio', identities.get(h)!.bio]])), described.filter((h) => JSON.stringify(paras(h)) !== JSON.stringify([['bio', identities.get(h)!.bio]])).join());
// | handle            | identities.json | expected on the page                                     |
// | the 3 memoirists  | absent          | the data's own what + bio, and the warn word for word     |
// The warning is the only thing standing between a description built from one
// 1923 book and a reader taking it for researched biography, so the test is
// byte equality with the data, not a shape — a reworded warning is a changed
// claim. (Two of the three open in capitals; Brigadere's does not, because
// hers states her verified death year first. The wording is the source's.)
const memoirHandles = handles.filter((h) => !identities.has(h));
const pwarn = (h) => [...html(page(h)).matchAll(/<p class="pwarn">([^<]*)<\/p>/g)].map((m) => unescape(m[1]));
// CHANGED 2026-11-10, and the old assertion was wrong, not merely outdated.
// It required these three profiles to PRINT their warning word for word — but
// that warning was a working note to ourselves ("to be obtained from an
// external register before publication", the copyright arithmetic), and the
// owner found it on the live page. Those notes now live in `note`, which
// nothing renders. The row now asserts the opposite: the description still
// shows, and the internal note does NOT reach the page.
// CHANGED 2026-11-10: the memoirists are parked with their recollections — no
// page is built, so nothing of theirs can leak. Their accounts and internal
// notes stay in the data (asserted), ready to return. The six accounts the
// 19/20 November papers added are the unresearched ones now, and the row that
// used to guard the memoirists' description now guards theirs.
check('P11: the 3 memoirists are parked — in the data with their notes, not in identities, no page',
  parkedHandles.length === 3 && parkedHandles.every((h) => !identities.has(h) && !!(accounts[h] as any).note && !existsSync(page(h))), parkedHandles.join());
check('P11: the 6 unresearched new accounts show the data\'s what and bio, and NO internal note',
  memoirHandles.length === 6 && memoirHandles.every((h) => JSON.stringify(paras(h)) === JSON.stringify([['what', accounts[h].what], ['bio', accounts[h].bio]])
    && pwarn(h).length === 0
    && !html(page(h)).includes('pirms publicēšanas')), memoirHandles.join());
check('P11: @zemes_sargi keeps the paper-sourced what and bio', JSON.stringify(paras('@zemes_sargi')) === JSON.stringify(descriptionLines(accounts['@zemes_sargi'], identities.get('@zemes_sargi')!).map((l, i) => [i === 0 ? 'what' : 'bio', l])));
check('P11: @f_brodermanis renders no description at all', paras('@f_brodermanis').length === 0 && html(page('@f_brodermanis')).includes('<div class="handle">@f_brodermanis</div>'));

// --- P6: back to the feed on every profile ----------------------------------
check('P6: every profile has the back link in the header (there is no footer)', handles.every((h) => { const d = html(page(h)); return d.includes('<a class="back" href="../">') && !d.includes('<footer'); }));
// The eight removals: nothing of the reveal, standfirst, place line, one-day
// note, type badge, source fold or invariant line renders on any page — the
// corpus text itself may contain the words, so these look for the markup.
// CHANGED 2026-11-10 — behaviour changed, so the row did. `<footer` left this
// list: a day page now carries exactly one footer, the site-level credit to
// the National Library's periodika collection, which is what lets the site
// republish the scans at all (he asked for it: „for copyright purposes“). It
// is NOT a licence to put footers back: his „all the footer — gone“ still
// holds everywhere else, so the next two rows pin the footer to the day pages
// and keep P6's no-footer rule on every profile.
const gone = ['later-btn', 'class="fold later"', 'class="standfirst"', '<p class="when">', '<p class="one">', 'Konts rāda', 'class="badge', 'class="fold src"', '<pre class="ocr"', 'Kā to ierāmēja laikraksts', 'class="src-btn"', 'class="inv"', 'Kā robi avotos'];
const everyPage = [...dayDocs.map(([, doc]) => doc), ...handles.map((h) => html(page(h)))];
check('face: the eight removals render nowhere', everyPage.every((d) => gone.every((g) => !d.includes(g))));
const footers = (d: string) => (d.match(/<footer/g) ?? []).length;
check('credit: every day page ends with exactly one footer naming periodika.lndb.lv and the public domain',
  dayDocs.every(([, d]) => footers(d) === 1 && /<footer class="wrap credit">/.test(d)
    && d.includes('<a href="https://periodika.lndb.lv/" target="_blank" rel="noopener">periodika.lndb.lv</a>')
    && d.includes('sabiedriskajā īpašumā')),
  dayDocs.map(([d, doc]) => `${d.key}:${footers(doc)}`).join(' '));
check('credit: no profile page has a footer — a profile still ends at its last post',
  handles.every((h) => footers(html(page(h))) === 0));
// Two archives now: periodika.lndb.lv for the newspaper scans (the viewer
// host — periodika.lv's deep links open an empty viewer), eraksti.lv for the
// 1923 volume (http — its certificate is self-signed; see feed.ts ARCHIVES).
check('face: avots is a plain link to one of the two archives on every segment', everyPage.every((d) => (d.match(/<a class="src-link" href="(?:https:\/\/periodika\.lndb\.lv|http:\/\/eraksti\.lv)\/[^"]*" target="_blank" rel="noopener">avots →<\/a>/g) ?? []).length === (d.match(/<div class="seg">/g) ?? []).length));

// --- P7: no dead internal link anywhere in the built site --------------------
const pages: string[] = [];
(function walk(dir: string) { for (const f of readdirSync(dir)) { const p = join(dir, f); statSync(p).isDirectory() ? walk(p) : f.endsWith('.html') && pages.push(p); } })(DIST);
const dead: string[] = [];
const ids = new Map<string, Set<string>>();
for (const p of pages) ids.set(p, new Set(attr(html(p), / id="([^"]+)"/g)));
for (const p of pages) {
  const doc = html(p);
  for (const ref of [...attr(doc, / href="([^"]+)"/g), ...attr(doc, / src="([^"]+)"/g)]) {
    if (/^(https?:|mailto:)/.test(ref)) continue;
    const [path, frag] = ref.split('#');
    let target = path ? resolve(dirname(p), path) : p;
    if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.html');
    if (!existsSync(target)) { dead.push(`${relative(DIST, p)} → ${ref}`); continue; }
    if (frag && !ids.get(target)?.has(frag)) dead.push(`${relative(DIST, p)} → ${ref} (no such id)`);
  }
}
check(`P7: no dead internal link or asset reference in ${DAYS.length + handles.length} pages`, dead.length === 0 && pages.length === DAYS.length + handles.length, dead.slice(0, 5).join('; ') || `${pages.length} pages`);
check('P7: every profile links back only with relative paths (no leading slash)', handles.every((h) => !/ href="\/[^/]/.test(html(page(h)))));

// --- P8: size per page, static build ----------------------------------------
// The feed's own stated budget is ≤ 1 MB first load; no tier file sets a
// smaller figure, so a profile is held to the same number, and its first load
// is the page plus feed.css + feed.js (no web font).
const shared = statSync(join(DIST, 'feed.css')).size + statSync(join(DIST, 'feed.js')).size;
const sizes = handles.map((h) => statSync(page(h)).size + shared);
check('P8: every profile first load ≤ 1 MB', sizes.every((s) => s <= 1_000_000), `largest ${Math.max(...sizes)} B`);
check('P8: no profile page carries a script other than feed.js', handles.every((h) => attr(html(page(h)), /<script[^>]*src="([^"]*)"/g).join() === '../feed.js'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
check('P8: still one dependency', Object.keys(pkg.dependencies).join() === 'astro' && !pkg.devDependencies);

// --- P9: focusable controls, visible focus ring ------------------------------
// Contrast of every token pair is proven in tests/run.ts; here: no control is
// taken out of the tab order, and the shared focus ring exists.
const css = html(join(DIST, 'feed.css'));
check('P9: the stylesheet has a visible :focus-visible ring', /:focus-visible\s*\{[^}]*outline:2px solid/.test(css));
check('P9: no tabindex="-1" and no interactive element without a real tag', pages.every((p) => { const d = html(p); return !d.includes('tabindex="-1"') && !/<(span|div)[^>]*onclick/.test(d); }));
// `<a` followed by whitespace or `>` — not `<article`.
check('P9: every link on a profile has an href', handles.every((h) => !/<a(?=[\s>])(?![^>]*\shref=)[^>]*>/.test(html(page(h)))));

// --- atmiņas: the writing year is on the face of EVERY segment of every such post,
// and on the header of a profile whose posts are all recollections. Counted
// against the data and printed, so a corpus with no recollection yet shows
// these rows passing on zero rather than vacuously.
// CHANGED 2026-11-10: the recollections are PARKED (his call) — 11 in the
// data, 0 rendered — so these two rows now run at zero on purpose, and the
// next row proves the park is real: the 11 are in the data and on no page.
check('atmiņas: 11 recollections parked — in the data, on no page', parked.length === 11 && parked.every((p) => p.type === 'atminas') && everyPage.every((d) => !d.includes('class="written"')), `${parked.length} parked`);
const recollections = feedPosts.filter((p) => p.type === 'atminas');
const expectedLines = recollections.flatMap((p) => Array(p.thread?.length ?? 1).fill(p.written));
const writtenLines = attr(feed, /<p class="written"[^>]*>atmiņas — rakstītas (\d{4})\. gadā<\/p>/g).map(Number);
check(`atmiņas: ${recollections.length} recollection(s), ${expectedLines.length} segment(s), each segment with its year on the face`,
  JSON.stringify(writtenLines) === JSON.stringify(expectedLines),
  recollections.length ? `years ${writtenLines.join()}` : 'none rendered — parked');
const memoirists = handles.filter((h) => feedPosts.some((p) => p.handle === h) && feedPosts.filter((p) => p.handle === h).every((p) => p.type === 'atminas'));
check(`atmiņas: ${memoirists.length} account(s) whose every post is a recollection say so in the profile header`,
  memoirists.every((h) => /<p class="written">Visi ieraksti ir atmiņas, rakstītas /.test(html(page(h))))
  && handles.filter((h) => !memoirists.includes(h)).every((h) => !html(page(h)).includes('Visi ieraksti ir atmiņas')),
  memoirists.length ? memoirists.join() : 'none rendered — parked');

// --- lazy reveal: each day page opens on five posts, the rest are in the HTML -
// | case                       | expected                                             |
// | each built day page        | exactly 5 .post without `later`, the other n-5 with it |
// | each built day page        | all n posts in the HTML — nothing is fetched          |
// | feed.css                   | hides .post.later (CSS, not script: no flash, no CSP hash) |
// | nojs.css                   | un-hides .post.later                                  |
// | every profile              | zero posts carry `later` (profiles are short)         |
// | feed.js filterTopic        | calls revealAll() before it touches .hidden           |
// | #more sentinel             | on the feed, on no profile                            |
// | feed.js, Back without bfcache | reveals all before the browser restores scroll (no IO staging) |
const EAGER = 5;  // mirrors src/pages/[...day]/index.astro; a change there must change this row
for (const [d, doc] of dayDocs) {
  const n = byDay.get(d.key)!.length;
  const eager = attr(doc, /<article class="(post)" /g).length;
  const later = attr(doc, /<article class="post (later)" /g).length;
  check(`lazy: ${d.key} — exactly ${EAGER} eager posts and ${n - EAGER} later ones`, eager === EAGER && later === n - EAGER, `${eager} eager, ${later} later`);
  check(`lazy: ${d.key} — every post is in the HTML regardless of later`, eager + later === n && attr(doc, /<article class="post[^"]*" id="p-(\d+)"/g).length === n);
}
check('lazy: feed.css hides .post.later', /\.post\.later\s*\{\s*display:\s*none/.test(css));
check('lazy: nojs.css shows .post.later', /\.post\.later\s*\{\s*display:\s*block/.test(html(join(DIST, 'nojs.css'))));
check('lazy: no profile post carries later', handles.every((h) => !html(page(h)).includes('class="post later"')));
const filterFn = html(join(DIST, 'feed.js')).match(/function filterTopic[\s\S]*?\n\}/)?.[0] ?? '';
check('lazy: filterTopic reveals all before it filters', filterFn.includes('revealAll()') && filterFn.includes('.hidden =') && filterFn.indexOf('revealAll()') < filterFn.indexOf('.hidden ='),
  filterFn ? '' : 'filterTopic not found in feed.js');
const feedJs = html(join(DIST, 'feed.js'));
check('lazy: a back_forward arrival skips the staged reveal', feedJs.includes("type === 'back_forward'") && /if \(sentinel && !returning && /.test(feedJs),
  'without this, Back (no bfcache) restores scroll into a five-post document — see the 2026-11-10 report');
check('lazy: #more sentinel on every day page and on no profile', dayDocs.every(([, doc]) => doc.includes('<div id="more"')) && handles.every((h) => !html(page(h)).includes('id="more"')));

// --- days: the day strip ----------------------------------------------------
// CHANGED 2026-11-10 — behaviour changed, so the row did. The ‹ date › cluster
// is gone: every day page now carries all four days side by side, so these
// rows assert the whole strip, not a pair of chevrons. What they hold to:
// | page       | the four hrefs, in order                              |
// | 17.11.1918 | ./ · ../ · ../19-11-1918/ · ../20-11-1918/            |
// | 18.11.1918 | 17-11-1918/ · ./ · 19-11-1918/ · 20-11-1918/           |
// | every page | exactly one aria-current="page", on the day you are on |
// | every page | each cell's accessible name = dayStripLabel (the bar is aria-hidden) |
// | a profile  | no strip, and its posts grouped under day headings linking to those days |
const weights = dayWeights(byDay);
for (const [d, doc] of dayDocs) {
  const base = d.path ? '../' : '';
  const strip = /<nav class="daystrip"[\s\S]*?<\/nav>/.exec(doc)?.[0] ?? '';
  const want = DAYS.map((n) => n.key === d.key ? './' : `${base}${n.path}`);
  const got = attr(strip, /<a class="day" href="([^"]*)"/g);
  check(`days: ${d.key} — all four days in the strip, the current one self-linked`,
    JSON.stringify(got) === JSON.stringify(want)
    && (strip.match(/aria-current="page"/g) ?? []).length === 1
    && new RegExp(`href="\\./" aria-current="page"`).test(strip), `got ${JSON.stringify(got)}`);
  check(`days: ${d.key} — every cell says its count in words, and the bar is hidden from the reader who cannot see it`,
    JSON.stringify(attr(strip, /<a class="day"[^>]*aria-label="([^"]*)"/g)) === JSON.stringify(DAYS.map((n) => dayStripLabel(n, weights.get(n.key)!)))
    && (strip.match(/<svg class="w" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">/g) ?? []).length === DAYS.length);
}
check('days: a profile has no day strip (its header is the way back)', handles.every((h) => !html(page(h)).includes('class="daystrip"')));
check('days: a profile heads each run of posts with its day, linking to that day\'s page', handles.filter((h) => feedPosts.some((p) => p.handle === h)).every((h) => {
  const doc = html(page(h));
  const want = DAYS.filter((d) => feedPosts.some((p) => p.handle === h && publishedOn(p) === d.key)).map((d) => `../${d.path}`);
  return JSON.stringify(attr(doc, /<h2 class="pday"><a href="([^"]*)">/g)) === JSON.stringify(want);
}));
check('days: „Kur viņš pieminēts“ links into the day page that holds the naming post', handles.every((h) => attr(html(page(h)), /<section class="named">[\s\S]*?<\/section>/g).join('').split('<a href="').slice(1).every((s) => {
  const href = s.slice(0, s.indexOf('"'));
  const seq = Number(href.split('#p-')[1]);
  const p = feedPosts.find((x) => x.seq === seq);
  return !!p && href === `../${DAYS.find((d) => d.key === publishedOn(p))!.path}#p-${seq}`;
})));

// --- P1 over HTTP, when a server is given ---------------------------------
const origin = process.argv[2];
if (origin) {
  const codes = await Promise.all([...DAYS.map((d) => d.path), ...handles.map((h) => `${h}/`)].map(async (p) => {
    try { return (await fetch(`${origin}/${p}`)).status; } catch { return 0; }
  }));
  check(`P1: all ${codes.length} pages return 200 from ${origin}`, codes.every((c) => c === 200), `codes ${[...new Set(codes)].join()}`);
} else {
  console.log('note  P1 over HTTP not run (pass a server origin as the argument)');
}

console.log(failed ? `\n${failed} FAILED` : '\nprofiles: all green');
process.exit(failed ? 1 : 0);
