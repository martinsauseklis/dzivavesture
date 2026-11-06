// Table-driven, no framework. Run: `pnpm test` (= node tests/run.ts).
import { readFileSync } from 'node:fs';
import {
  refusalReason, isClock, escapeHtml, bodyHtml, trends, invariantLine, initials, plural,
  avatarHue, HUE_COUNT, reportedBy, viaText, profilePath, mentionsOf, EMPTY_COPY, descriptionLines, readIdentities, lead, type Post, type Account,
} from '../src/lib/feed.ts';

let failed = 0;
function check(name: string, ok: boolean, note = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`);
}

const accounts: Record<string, Account> = {
  '@lidums': { name: 'Līdums', kind: 'publication', what: '', bio: '' },
  '@k_ulmanis': { name: 'Kārlis Ulmanis', kind: 'person', what: '', bio: '' },
  '@POTUS': { name: 'ASV prezidents', kind: 'person', what: '', bio: '' },
};
const base: Post = {
  handle: '@lidums', type: 'citats', at: '16.30', seq: 1, lv: 'Teksts.', ocr: 'Tekſts.',
  via: 'Līdums', url: 'https://periodika.lv/x', topics: ['A'], atNote: '',
};
const post = (over: Partial<Post>): Post => ({ ...base, ...over });

// --- refusalReason: the structural guards -------------------------------
// | case                         | post                                   | expected                      |
// | sourced publication quote    | lidums, citats, periodika url          | null                          |
// | person account quoting       | k_ulmanis, citats                      | personas kontam …             |
// | person account reported      | k_ulmanis, atstastits                  | null                          |
// | no url                       | url ''                                 | nav avota saites              |
// | javascript: url              | url 'javascript:alert(1)'              | nav avota saites              |
// | foreign host                 | url 'https://evil.example/periodika.lv'| nav avota saites              |
// | path traversal in url        | url 'https://periodika.lv/../../etc'   | null (archive host, path is theirs) |
// | unknown handle               | handle '@nobody'                       | nezināms konts                |
// | type outside the four        | type 'tvīts'                           | nezināms tips                 |
// | meta post                    | type 'nezinamais'                      | meta-ieraksts nav plūsmā      |
// | comment without archive url  | comments:[{url:''}]                    | komentārs bez avota saites    |
const refusals: [string, Post, string | null][] = [
  ['sourced publication quote', post({}), null],
  ['person account quoting', post({ handle: '@k_ulmanis', type: 'citats' }), 'personas kontam nevar būt tiešs citāts'],
  ['person account reported', post({ handle: '@k_ulmanis', type: 'atstastits' }), null],
  ['no url', post({ url: '' }), 'nav avota saites'],
  ['javascript: url', post({ url: 'javascript:alert(1)' }), 'nav avota saites'],
  ['foreign host', post({ url: 'https://evil.example/periodika.lv' }), 'nav avota saites'],
  ['path traversal in url', post({ url: 'https://periodika.lv/../../etc' }), null],
  ['unknown handle', post({ handle: '@nobody' }), 'nezināms konts'],
  ['type outside the four', post({ type: 'tvīts' as Post['type'] }), 'nezināms tips'],
  ['meta post refused from the feed', post({ type: 'nezinamais' }), 'meta-ieraksts nav plūsmā'],
  ['comment without archive url', post({ comments: [{ name: 'x', handle: '@lidums', text: 't', via: 'v', url: '' }] }), 'komentārs bez avota saites'],
];
for (const [name, p, want] of refusals)
  check(`refusal: ${name}`, refusalReason(p, accounts[p.handle]) === want, `want ${want}`);

// --- isClock: one timestamp format -----------------------------------------
// | input   | expected |
// | 16.30   | true     |
// | 06.05   | true     |
// | 24.00   | false    |
// | 16:30   | false    |
// | 7.30    | false    |
const clocks: [string, boolean][] = [['16.30', true], ['06.05', true], ['24.00', false], ['16:30', false], ['7.30', false]];
for (const [at, want] of clocks) check(`isClock ${at}`, isClock(at) === want);

// --- bodyHtml: escaping, recon, mentions, gaps --------------------------------
const gap = 'cipars, ko OCR nedod';
const plain = bodyHtml('Pateicību Vilsonam, ka valsts.', { mentions: { Vilsonam: '@POTUS' } }, accounts, gap);
check('mention keeps printed wording, handle in parentheses linking to its page, the group unbreakable',
  plain.html.includes('Vilsonam <span class="m">(<a class="mention" href="@POTUS/">@POTUS</a>)</span>'));
check('mention link is relative to the linking page',
  bodyHtml('Vilsonam', { mentions: { Vilsonam: '@POTUS' } }, accounts, gap, '../').html.includes('href="../@POTUS/"'));
check('mention: nothing unmatched', plain.unmatched.length === 0);

const hostile = bodyHtml('<script>alert("x")</script> Vilsonam', { mentions: { Vilsonam: '@POTUS' } }, accounts, gap);
check('text is escaped before any markup', !hostile.html.includes('<script>') && hostile.html.includes('&lt;script&gt;'));

const injectedKey = bodyHtml('a <b> c', { mentions: { '<b>': '@POTUS' } }, accounts, gap);
check('mention key containing markup is matched escaped, not raw', injectedKey.html.includes('&lt;b&gt; <span class="m">(<a'));

const unknownHandle = bodyHtml('Vilsonam', { mentions: { Vilsonam: '@ghost' } }, accounts, gap);
check('mention to a handle with no account is not linked', !unknownHandle.html.includes('mention') && unknownHandle.unmatched[0] === 'Vilsonam');

const notPrinted = bodyHtml('Teksts.', { mentions: { 'romāna autors': '@POTUS' } }, accounts, gap);
check('mention whose key is not printed is reported, not rendered', notPrinted.unmatched[0] === 'romāna autors');

const recon = bodyHtml('kļuvis par', { recon: { kļuvis: 'ļļņ"miS' } }, accounts, gap);
check('recon: dotted span with escaped raw tooltip',
  recon.html.includes('<span class="recon" title="Rekonstruēts no bojāta OCR: „ļļņ&quot;miS“">kļuvis</span>'));

// A gap mark is a span (there is no panel to open) whose title is the post's
// own warn — the explanation the fold used to hold — or the convention when
// the post has no warn.
const gaps = bodyHtml('ap [?] procentu un [?] bērnu', { warn: 'OCR: „7<“' }, accounts, gap);
check('every [?] becomes a marked span with the warn as its title', (gaps.html.match(/<span class="gap" title="OCR: „7&lt;“">\[\?\]<\/span>/g) ?? []).length === 2);
check('[?] without a warn falls back to the convention', bodyHtml('[?]', {}, accounts, gap).html.includes(`<span class="gap" title="${gap}">[?]</span>`));

const ident = bodyHtml('Raiņa „Spēlēju, dancoju“ (turpinājums)', { ident: [{ rendered: 'Spēlēju, dancoju', ocr: '.Äpehlciu "Sanža', evidence: 'glyphs', candidate_source: 's', glyph_match: 'g' }] }, accounts, gap);
check('ident: wavy span with escaped OCR, followed by a [≈] mark naming source, evidence kind and match',
  ident.html.includes('<span class="ident" title="Identificēts pēc ārēja reģistra, nevis nolasīts. OCR: „.Äpehlciu &quot;Sanža“">Spēlēju, dancoju</span><span class="gap" title="Identificēts pēc s — burtu atbilstība: g">[≈]</span>'));
check('ident whose rendered string is not in the text is reported', bodyHtml('x', { ident: [{ rendered: 'y', ocr: '', evidence: 'glyphs', candidate_source: '', glyph_match: '' }] }, accounts, gap).unmatched[0] === 'y');

check('escapeHtml covers quotes', escapeHtml(`"'<>&`) === '&quot;&#39;&lt;&gt;&amp;');

// --- trends -----------------------------------------------------------------
// | posts topics                    | expected order            |
// | [A,B] [A] [C]                   | A:2, B:1, C:1 (ties by lv alphabet) |
const t = trends([post({ topics: ['A', 'B'] }), post({ topics: ['A'] }), post({ topics: ['C'] })]);
check('trends ranked by count then alphabet', JSON.stringify(t) === JSON.stringify([{ topic: 'A', n: 2 }, { topic: 'B', n: 1 }, { topic: 'C', n: 1 }]));
check('trends: ties sort with Latvian collation (Č after C)',
  trends([post({ topics: ['Čakste'] }), post({ topics: ['Cenas'] })]).map((x) => x.topic).join() === 'Cenas,Čakste');

// --- invariant line ships at zero -------------------------------------------
check('invariant line at zero still names the counter', invariantLine(80, 0, 0) === '80 ieraksti · bez avota vai ar nepareizu tipu: 0 · gaida pārbaudi pret skenējumu: 0');

// | n  | expected |
// | 1  | ieraksts | 2 ieraksti | 11 ieraksti | 21 ieraksts | 111 ieraksti |
const plurals: [number, string][] = [[1, 'ieraksts'], [2, 'ieraksti'], [11, 'ieraksti'], [21, 'ieraksts'], [111, 'ieraksti']];
for (const [n, want] of plurals) check(`plural ${n}`, plural(n) === want);

check('initials', initials('Kārlis Ulmanis') === 'KU' && initials('Līdums') === 'L');

// --- reportedBy: the face says who rendered a person's words -----------------
// | via                                                              | expected       |
// | Atstāstīts: Līdums Nr.219, 20.11.1918                            | Līdums         |
// | Atstāstīts: Baltijas Ziņas Nr.168, 18.11.1918, „Stāvoklis …“     | Baltijas Ziņas |
// | Atstāstīts: Latvijas Tautas Padomes sēdes Nr.1, 18.11.1918, stenogramma | stenogramma |
// | Līdums Nr.219, 20.11.1918 (no prefix: not a rendering)           | null           |
// | Atstāstīts: <script> (hostile, wrong shape)                      | null           |
// | '' (empty)                                                       | null           |
const reported: [string, string | null][] = [
  ['Atstāstīts: Līdums Nr.219, 20.11.1918', 'Līdums'],
  ['Atstāstīts: Baltijas Ziņas Nr.168, 18.11.1918, „Stāvoklis Austro-Ungārijā“', 'Baltijas Ziņas'],
  ['Atstāstīts: Latvijas Tautas Padomes sēdes Nr.1, 18.11.1918, stenogramma', 'stenogramma'],
  ['Līdums Nr.219, 20.11.1918', null],
  ['Atstāstīts: <script>', null],
  ['', null],
];
for (const [via, want] of reported) check(`reportedBy ${JSON.stringify(via).slice(0, 40)}`, reportedBy(via) === want, `want ${want}`);
check('viaText drops only the leading prefix', viaText('Atstāstīts: Līdums Nr.219') === 'Līdums Nr.219' && viaText('Līdums Nr.219') === 'Līdums Nr.219');

// --- profile pages: the address, the mentions list, the empty-state copy ----
// | input                               | expected                         |
// | profilePath('@k_ulmanis')           | '@k_ulmanis/'                    |
// | profilePath('@k_ulmanis', '../')    | '../@k_ulmanis/'                 |
// | mentionsOf: two posts name @POTUS, one does not, out of order | the two, by seq |
check('profilePath from the feed', profilePath('@k_ulmanis') === '@k_ulmanis/');
check('profilePath from a profile', profilePath('@k_ulmanis', '../') === '../@k_ulmanis/');
const named = mentionsOf('@POTUS', [post({ seq: 9, mentions: { x: '@POTUS' } }), post({ seq: 2 }), post({ seq: 3, mentions: { y: '@POTUS', z: '@lidums' } })]);
check('mentionsOf: only the posts that name the handle, in seq order', named.map((p) => p.seq).join() === '3,9');

// --- readIdentities: the file's shape, read strictly --------------------------
// | input                                             | expected                      |
// | { accounts: [ {handle:'@a', identity:'X'}, {handle:'@b', identity:null} ] } | Map of 2 |
// | { '@a': {identity:'X'} }  (a map, the old guess)  | throws "an array, not a map"  |
// | accounts: [ {handle:'@a', identity:'X'} ], handles ['@a','@b'] | throws "no entry for @b" |
// | accounts: [ …, {handle:'@zz', identity:'X'} ]     | throws "not an account"        |
// | accounts: [ {handle:'@a'}, {handle:'@a'} ]        | throws "appears twice"         |
// | identity: 5                                       | throws "string or null"       |
// | identity: {}  (hostile: object where text belongs)| throws "string or null"       |
const throws = (fn: () => unknown, msg: string) => { try { fn(); return false; } catch (e) { return String(e).includes(msg); } };
const good = readIdentities({ accounts: [{ handle: '@a', identity: 'X', bio: 'b' }, { handle: '@b', identity: null, bio: null }] }, ['@a', '@b']);
check('readIdentities: the array shape reads to a map of every handle', good.size === 2 && good.get('@a')!.identity === 'X' && good.get('@b')!.identity === null);
check('readIdentities: a handle-keyed map fails loudly', throws(() => readIdentities({ '@a': { identity: 'X' } }, ['@a']), 'an array, not a map'));
check('readIdentities: a handle missing from the file fails loudly', throws(() => readIdentities({ accounts: [{ handle: '@a', identity: 'X', bio: 'b' }] }, ['@a', '@b']), 'no entry for @b'));
check('readIdentities: a handle unknown to the data fails loudly', throws(() => readIdentities({ accounts: [{ handle: '@a', identity: 'X', bio: 'b' }, { handle: '@zz', identity: 'X', bio: 'b' }] }, ['@a']), 'not an account'));
check('readIdentities: a duplicate handle fails loudly', throws(() => readIdentities({ accounts: [{ handle: '@a', identity: 'X', bio: 'b' }, { handle: '@a', identity: 'Y', bio: 'b' }] }, ['@a']), 'appears twice'));
// | bio: 5                                            | throws "string or null"       |
// | bio set, identity null                            | throws "bio without identity" |
// | bio of 281 chars                                  | throws "over 280"             |
check('readIdentities: a numeric bio fails loudly', throws(() => readIdentities({ accounts: [{ handle: '@a', identity: 'X', bio: 5 }] }, ['@a']), 'string or null'));
check('readIdentities: a bio without an identity fails loudly', throws(() => readIdentities({ accounts: [{ handle: '@a', identity: null, bio: 'b' }] }, ['@a']), 'bio without identity'));
check('readIdentities: an over-long bio fails loudly', throws(() => readIdentities({ accounts: [{ handle: '@a', identity: 'X', bio: 'x'.repeat(281) }] }, ['@a']), 'over 280'));
check('readIdentities: a numeric identity fails loudly', throws(() => readIdentities({ accounts: [{ handle: '@a', identity: 5, bio: null }] }, ['@a']), 'string or null'));
check('readIdentities: an object identity fails loudly', throws(() => readIdentities({ accounts: [{ handle: '@a', identity: {}, bio: null }] }, ['@a']), 'string or null'));

// --- descriptionLines: the identity alone; null is two different things ------
// | handle           | identity      | expected       |
// | @x               | 'Laikraksts'  | ['Laikraksts'] |
// | @f_brodermanis   | null          | []             |
// | @zemes_sargi     | null          | [what, bio]    |
// | @x (any other)   | null          | []             |
// | bio set          | [bio]  — the long `identity` never reaches the page |
const acc: Account = { name: 'X', kind: 'org', what: 'W', bio: 'B' };
check('descriptionLines: the bio alone — never the long identity, never what/bio beside it',
  JSON.stringify(descriptionLines(acc, { handle: '@x', identity: 'A 700-character encyclopedia entry…', bio: 'Laikraksts' })) === '["Laikraksts"]');
check('descriptionLines: @f_brodermanis null → no description at all', descriptionLines(acc, { handle: '@f_brodermanis', identity: null, bio: null }).length === 0);
check('descriptionLines: @zemes_sargi null → the paper-sourced what and bio stand', JSON.stringify(descriptionLines(acc, { handle: '@zemes_sargi', identity: null, bio: null })) === '["W","B"]');
check('descriptionLines: any other null → nothing', descriptionLines(acc, { handle: '@x', identity: null, bio: null }).length === 0);

// --- lead: the first sentence for a preview, no full stop ---------------------
// | input                                                   | expected                               |
// | 'Agronoms un politiķis (dz. 1877. gada 4. septembrī). 1897. gadā beidza.' | 'Agronoms un politiķis (dz. 1877. gada 4. septembrī)' |
// | 'Laikraksts, Nr. 59 iznāca. Vēl kas.'                   | 'Laikraksts, Nr. 59 iznāca'            |
// | 'Rīgas pašaizsardzības vienība · dibināta 16. novembrī' | unchanged (no sentence end)            |
// | 'Pirmais. „Otrais“.'                                    | 'Pirmais'                              |
// | 'Rīgā, 1861—1922. Bretkopfa izdevumos.'                 | 'Rīgā, 1861—1922'                      |
// | 'Ķeizars no 1888. gada (dz. 1859). Tronī kāpa.'         | 'Ķeizars no 1888. gada (dz. 1859)'     |
check('lead: a birth date inside the sentence does not split it', lead('Agronoms un politiķis (dz. 1877. gada 4. septembrī). 1897. gadā beidza.') === 'Agronoms un politiķis (dz. 1877. gada 4. septembrī)');
check('lead: "Nr. 59" does not split', lead('Laikraksts, Nr. 59 iznāca. Vēl kas.') === 'Laikraksts, Nr. 59 iznāca');
check('lead: a line without a sentence end is unchanged', lead('Rīgas pašaizsardzības vienība · dibināta 16. novembrī') === 'Rīgas pašaizsardzības vienība · dibināta 16. novembrī');
check('lead: an opening quote starts the next sentence', lead('Pirmais. „Otrais“.') === 'Pirmais');
check('lead: a year range closing a sentence ends it', lead('Rīgā, 1861—1922. Bretkopfa izdevumos.') === 'Rīgā, 1861—1922');
check('lead: "1888. gada" inside a sentence does not split', lead('Ķeizars no 1888. gada (dz. 1859). Tronī kāpa.') === 'Ķeizars no 1888. gada (dz. 1859)');

// --- contrast: the floor is 4.5:1 (WCAG AA), computed, not eyeballed -------
// Relative luminance per WCAG 2.x; sRGB channel linearised at the 0.03928 knee.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
check('contrast: the formula agrees with the known black-on-white 21:1', Math.abs(contrast('#000000', '#ffffff') - 21) < 0.01);

// --- avatar hue: stable, in range, readable under white initials ----------
// | input                      | expected                                   |
// | same handle twice          | same index                                 |
// | '' (hostile: empty)        | an integer in [0, HUE_COUNT)               |
// | '@rīgas_ž' (non-ASCII)     | an integer in [0, HUE_COUNT)               |
// | feed.css .avatar.h-N rules | exactly HUE_COUNT, each ≥ 4.5:1 vs #ffffff |
const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < HUE_COUNT;
check('avatarHue is stable', avatarHue('@k_ulmanis') === avatarHue('@k_ulmanis'));
check('avatarHue: empty and non-ASCII handles still land in range', inRange(avatarHue('')) && inRange(avatarHue('@rīgas_ž')));
const css = readFileSync(new URL('../public/feed.css', import.meta.url), 'utf8');
const hues = [...css.matchAll(/\.avatar\.h-(\d+)\s*\{\s*background:(#[0-9a-f]{6})/g)].map((m) => [Number(m[1]), m[2]] as const);
check('css: exactly HUE_COUNT avatar hues, numbered 0…n-1', hues.length === HUE_COUNT && hues.every(([i]) => inRange(i)), `${hues.length} found`);
check('css: every avatar hue carries white initials at ≥ 4.5:1', hues.every(([, h]) => contrast(h, '#ffffff') >= 4.5),
  hues.map(([i, h]) => `h-${i} ${contrast(h, '#ffffff').toFixed(2)}`).join(' '));

// --- the stylesheet's tokens meet the same floor, light and dark -----------
// | pair (fg on bg)                               | expected |
// | ink, soft, accent, quote, rep, doc on bg      | ≥ 4.5    |
// | ink, soft, accent on panel                    | ≥ 4.5    |
// | ink on accent-tint (the reveal)               | ≥ 4.5    |
const tokens = (block: string) => Object.fromEntries([...block.matchAll(/--([\w-]+):(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
const light = tokens(css.slice(0, css.indexOf('@media (prefers-color-scheme: dark)')));
const dark = tokens(css.slice(css.indexOf('@media (prefers-color-scheme: dark)')));
const pairs: [string, string][] = [['ink', 'bg'], ['soft', 'bg'], ['accent', 'bg'],
  ['ink', 'panel'], ['soft', 'panel'], ['accent', 'panel'], ['ink', 'accent-tint']];
for (const [name, t] of [['light', light], ['dark', dark]] as const) {
  check(`css ${name}: all ${Object.keys(t).length ? '' : 'MISSING '}tokens parsed`, Object.keys(t).length >= 7);
  for (const [fg, bg] of pairs)
    check(`css ${name}: ${fg} on ${bg} ≥ 4.5:1`, !!t[fg] && !!t[bg] && contrast(t[fg], t[bg]) >= 4.5, t[fg] && t[bg] ? contrast(t[fg], t[bg]).toFixed(2) : 'token missing');
}

// --- the pure layer imports no framework ------------------------------------
const src = readFileSync(new URL('../src/lib/feed.ts', import.meta.url), 'utf8');
check('feed.ts has no imports at all', !/^\s*import\s/m.test(src), 'a framework import here would make the logic untestable without a browser');

// --- the real corpus goes through the same guards, and both sides were seen --
const data = JSON.parse(readFileSync(new URL('../src/data/18-11-1918.json', import.meta.url), 'utf8'));
const corpus: Post[] = data.posts;
const reasons = corpus.map((p) => refusalReason(p, data.accounts[p.handle]));
check('corpus: every post passes the guards', reasons.every((r) => r === null), reasons.filter(Boolean).join('; '));
check('corpus: every `at` is HH.MM', corpus.every((p) => isClock(p.at)));
check('corpus: no meta post in the data', corpus.every((p) => p.type !== 'nezinamais'));
check('corpus: every ident renders inside its post and names its evidence kind', corpus.every((p) => (p.ident ?? []).every((i) =>
  p.lv.includes(i.rendered) && i.candidate_source && i.glyph_match && (i.evidence === 'glyphs' || (i.evidence === 'corroboration' && i.corroboration)))));
check('corpus: no ident record argues from word length or shape', corpus.every((p) => (p.ident ?? []).every((i) => !/zīm(es|ēm)|garum|form/.test(i.glyph_match))));
const reachable = new Set([...corpus.map((p) => p.handle), ...corpus.flatMap((p) => Object.values(p.mentions ?? {}))]);
check('corpus: every account is reachable from a post or a printed mention', Object.keys(data.accounts).every((h) => reachable.has(h)), Object.keys(data.accounts).filter((h) => !reachable.has(h)).join());
check('corpus: sampler saw both sides', reasons.length > 0 && refusals.some(([, , w]) => w !== null), 'guards rejected hostile fixtures above AND accepted the corpus');
const personRendered = corpus.filter((p) => p.type === 'atstastits' && data.accounts[p.handle].kind === 'person');
check('corpus: every person-account rendering names its reporter on the face', personRendered.length > 0 && personRendered.every((p) => reportedBy(p.via)),
  personRendered.filter((p) => !reportedBy(p.via)).map((p) => p.seq).join());
// The post-less accounts without `silent` text in the data are exactly the
// ones with page copy — no default empty state, and no copy shadowing data.
const postless = Object.keys(data.accounts).filter((h) => !corpus.some((p) => p.handle === h));
const needCopy = postless.filter((h) => !data.accounts[h].silent).sort();
check('profiles: 8 accounts have no post', postless.length === 8, postless.join());
check('profiles: EMPTY_COPY covers exactly the post-less accounts without silent text', JSON.stringify(Object.keys(EMPTY_COPY).sort()) === JSON.stringify(needCopy), `need ${needCopy.join()}`);
check('profiles: every post-less account has a mention to show', postless.every((h) => mentionsOf(h, corpus).length > 0), postless.filter((h) => !mentionsOf(h, corpus).length).join());
const gapped = corpus.filter((p) => p.lv.includes('[?]'));
check('corpus: every [?] post carries a warn that explains it', gapped.length > 0 && gapped.every((p) => p.warn), gapped.filter((p) => !p.warn).map((p) => p.seq).join());

// --- threads: one printed item split at sentence boundaries, nothing else ---
// | rule                                                      |
// | >= 2 segments; segments re-join to exactly lv and ocr     |
// | every segment opens clean and ends on terminal punctuation|
// | a segment with [?] carries a warn                         |
// | recon/ident of the post are partitioned into the segments |
const threaded = corpus.filter((p) => p.thread);
check('threads: at least one post is threaded', threaded.length > 0);
const terminal = /[.!?“…)]$/;
const opens = /^[„\[0-9A-ZĀČĒĢĪĶĻŅŠŪŽ]/;
for (const p of threaded) {
  const t = p.thread!;
  check(`thread ${p.seq}: >=2 segments that re-join to lv and ocr`, t.length >= 2 && t.map((s) => s.lv).join(' ') === p.lv && t.map((s) => s.ocr).join(' ') === p.ocr);
  check(`thread ${p.seq}: every segment opens clean and ends on punctuation`, t.every((s) => opens.test(s.lv) && terminal.test(s.lv.trim())), t.map((s) => s.lv.slice(0, 12) + '…' + s.lv.slice(-3)).join(' | '));
  check(`thread ${p.seq}: a segment with [?] carries a warn`, t.every((s) => !s.lv.includes('[?]') || s.warn));
  const sortedEntries = (r: Record<string, string> | undefined) => JSON.stringify(Object.entries(r ?? {}).sort());
  check(`thread ${p.seq}: recon partitioned into segments`, sortedEntries(Object.assign({}, ...t.map((s) => s.recon ?? {}))) === sortedEntries(p.recon)
    && t.every((s) => Object.entries(s.recon ?? {}).every(([k, v]) => s.lv.includes(k) && s.ocr.includes(v))));
  check(`thread ${p.seq}: ident partitioned into segments`, t.flatMap((s) => s.ident ?? []).length === (p.ident ?? []).length && t.every((s) => (s.ident ?? []).every((i) => s.lv.includes(i.rendered))));
}

console.log(failed ? `\n${failed} FAILED` : '\nall green');
process.exit(failed ? 1 : 0);
