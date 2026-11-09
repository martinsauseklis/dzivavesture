// Table-driven, no framework. Run: `pnpm test` (= node tests/run.ts).
import { readFileSync } from 'node:fs';
import {
  refusalReason, isClock, escapeHtml, bodyHtml, trends, invariantLine, initials, plural,
  avatarHue, HUE_COUNT, reportedBy, viaText, profilePath, mentionsOf, EMPTY_COPY, descriptionLines, readIdentities, lead,
  isWrittenYear, recollectionLine, recollectionHeader, holdsLine, type Post, type Account,
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
  via: 'Līdums', url: 'https://periodika.lndb.lv/x', topics: ['A'], atNote: '',
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
// | path traversal in url        | url 'https://periodika.lndb.lv/../../etc'   | null (archive host, path is theirs) |
// | the book archive             | url 'http://eraksti.lv/fetchbook.php…' | null (second archive in the closed set) |
// | host that only starts alike  | url 'http://eraksti.lv.evil.example/x' | nav avota saites              |
// | the book archive over https  | url 'https://eraksti.lv/x'             | nav avota saites — the set is closed, and that origin's certificate is self-signed |
// | unknown handle               | handle '@nobody'                       | nezināms konts                |
// | type outside the four        | type 'tvīts'                           | nezināms tips                 |
// | meta post                    | type 'nezinamais'                      | meta-ieraksts nav plūsmā      |
// | comment without archive url  | comments:[{url:''}]                    | komentārs bez avota saites    |
// | recollection with its year   | k_ulmanis, atminas, written 1923       | null                          |
// | recollection, no year        | k_ulmanis, atminas                     | atmiņām nav derīga …          |
// | recollection, year a string  | atminas, written '1923'                | atmiņām nav derīga …          |
// | recollection "written" 1918  | atminas, written 1918 (not later)      | atmiņām nav derīga …          |
const refusals: [string, Post, string | null][] = [
  ['sourced publication quote', post({}), null],
  ['person account quoting', post({ handle: '@k_ulmanis', type: 'citats' }), 'personas kontam nevar būt tiešs citāts'],
  ['person account reported', post({ handle: '@k_ulmanis', type: 'atstastits' }), null],
  ['no url', post({ url: '' }), 'nav avota saites'],
  ['javascript: url', post({ url: 'javascript:alert(1)' }), 'nav avota saites'],
  ['foreign host', post({ url: 'https://evil.example/periodika.lv' }), 'nav avota saites'],
  ['path traversal in url', post({ url: 'https://periodika.lndb.lv/../../etc' }), null],
  ['the book archive', post({ url: 'http://eraksti.lv/fetchbook.php?urlkey=2485426' }), null],
  ['host that only starts like the book archive', post({ url: 'http://eraksti.lv.evil.example/x' }), 'nav avota saites'],
  ['the book archive over https', post({ url: 'https://eraksti.lv/x' }), 'nav avota saites'],
  ['unknown handle', post({ handle: '@nobody' }), 'nezināms konts'],
  ['type outside the four', post({ type: 'tvīts' as Post['type'] }), 'nezināms tips'],
  ['meta post refused from the feed', post({ type: 'nezinamais' }), 'meta-ieraksts nav plūsmā'],
  ['comment without archive url', post({ comments: [{ name: 'x', handle: '@lidums', text: 't', via: 'v', url: '' }] }), 'komentārs bez avota saites'],
  ['recollection with its year', post({ handle: '@k_ulmanis', type: 'atminas', written: 1923 }), null],
  ['recollection without a year', post({ handle: '@k_ulmanis', type: 'atminas' }), 'atmiņām nav derīga rakstīšanas gada'],
  ['recollection with the year as a string', post({ handle: '@k_ulmanis', type: 'atminas', written: '1923' as unknown as number }), 'atmiņām nav derīga rakstīšanas gada'],
  ['recollection "written" in 1918', post({ handle: '@k_ulmanis', type: 'atminas', written: 1918 }), 'atmiņām nav derīga rakstīšanas gada'],
];

// --- the recollection line on the face ----------------------------------------
// | input                              | expected                           |
// | atminas, written 1923              | 'atmiņas — rakstītas 1923. gadā'   |
// | citats                             | null                               |
// | atminas, no year (refused anyway)  | null                               |
check('recollectionLine names the year on the face', recollectionLine({ type: 'atminas', written: 1923 }) === 'atmiņas — rakstītas 1923. gadā');
check('recollectionLine is null for a contemporary type', recollectionLine({ type: 'citats' }) === null);
check('recollectionLine is null without a valid year', recollectionLine({ type: 'atminas' }) === null);
// --- the profile header when every post is a recollection -------------------
// | posts                                   | expected                                            |
// | [atminas 1923, atminas 1923]            | 'Visi ieraksti ir atmiņas, rakstītas 1923. gadā'   |
// | [atminas 1923, atminas 1925]            | '… rakstītas 1923., 1925. gadā'                    |
// | [atminas 1923, citats]                  | null                                               |
// | []                                      | null                                               |
check('recollectionHeader: all recollections, one year', recollectionHeader([{ type: 'atminas', written: 1923 }, { type: 'atminas', written: 1923 }]) === 'Visi ieraksti ir atmiņas, rakstītas 1923. gadā');
check('recollectionHeader: two years, both named', recollectionHeader([{ type: 'atminas', written: 1925 }, { type: 'atminas', written: 1923 }]) === 'Visi ieraksti ir atmiņas, rakstītas 1923., 1925. gadā');
check('recollectionHeader: one contemporary post → null', recollectionHeader([{ type: 'atminas', written: 1923 }, { type: 'citats' }]) === null);
check('recollectionHeader: no posts → null', recollectionHeader([]) === null);
// --- holdsLine: the preview line may not call a recollection a newspaper ----
// | input                                   | expected                                      |
// | [citats, citats]                        | '2 ieraksti tās dienas Rīgas avīzēs'          |
// | [atminas 1923] × 8                      | '8 ieraksti — atmiņas, rakstītas 1923. gadā'   |
// | [atminas 1923, atminas 1925]            | '2 ieraksti — atmiņas, rakstītas 1923., 1925. gadā' |
// | [atminas 1923, citats] (mixed)          | '2 ieraksti tās dienas Rīgas avīzēs'          |
// | [atminas, written missing]              | '1 ieraksts tās dienas Rīgas avīzēs' (refused anyway) |
// | []                                      | 'Tajā dienā neko nesaka — avīzes min'         |
check('holdsLine: contemporary posts name the papers', holdsLine([{ type: 'citats' }, { type: 'citats' }]) === '2 ieraksti tās dienas Rīgas avīzēs');
check('holdsLine: all recollections name the writing year, not the papers',
  holdsLine(Array(8).fill({ type: 'atminas', written: 1923 })) === '8 ieraksti — atmiņas, rakstītas 1923. gadā');
check('holdsLine: two writing years, both named', holdsLine([{ type: 'atminas', written: 1925 }, { type: 'atminas', written: 1923 }]) === '2 ieraksti — atmiņas, rakstītas 1923., 1925. gadā');
check('holdsLine: one contemporary post among them → the papers', holdsLine([{ type: 'atminas', written: 1923 }, { type: 'citats' }]) === '2 ieraksti tās dienas Rīgas avīzēs');
check('holdsLine: no posts → the account said nothing, never a zero', holdsLine([]) === 'Tajā dienā neko nesaka — avīzes min');
check('isWrittenYear: 1919 and 2099 yes; 1918, 2100, 1923.5, "1923" no',
  isWrittenYear(1919) && isWrittenYear(2099) && !isWrittenYear(1918) && !isWrittenYear(2100) && !isWrittenYear(1923.5) && !isWrittenYear('1923'));
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
// | accounts: [ {handle:'@a', identity:'X'} ], handles ['@a','@b'] | map of 1: @b absent, no throw (not researched yet) |
// | accounts: [ …, {handle:'@zz', identity:'X'} ]     | throws "not an account"        |
// | accounts: [ {handle:'@a'}, {handle:'@a'} ]        | throws "appears twice"         |
// | identity: 5                                       | throws "string or null"       |
// | identity: {}  (hostile: object where text belongs)| throws "string or null"       |
const throws = (fn: () => unknown, msg: string) => { try { fn(); return false; } catch (e) { return String(e).includes(msg); } };
const good = readIdentities({ accounts: [{ handle: '@a', identity: 'X', bio: 'b' }, { handle: '@b', identity: null, bio: null }] }, ['@a', '@b']);
check('readIdentities: the array shape reads to a map of every handle', good.size === 2 && good.get('@a')!.identity === 'X' && good.get('@b')!.identity === null);
check('readIdentities: a handle-keyed map fails loudly', throws(() => readIdentities({ '@a': { identity: 'X' } }, ['@a']), 'an array, not a map'));
const partial = readIdentities({ accounts: [{ handle: '@a', identity: 'X', bio: 'b' }] }, ['@a', '@b']);
check('readIdentities: a handle not in the file yet is absent from the map, never a throw', partial.size === 1 && !partial.has('@b'));
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
// | undefined (not researched yet) | [what, bio] — never silence       |
const acc: Account = { name: 'X', kind: 'org', what: 'W', bio: 'B' };
check('descriptionLines: the bio alone — never the long identity, never what/bio beside it',
  JSON.stringify(descriptionLines(acc, { handle: '@x', identity: 'A 700-character encyclopedia entry…', bio: 'Laikraksts' })) === '["Laikraksts"]');
check('descriptionLines: @f_brodermanis null → no description at all', descriptionLines(acc, { handle: '@f_brodermanis', identity: null, bio: null }).length === 0);
check('descriptionLines: @zemes_sargi null → the paper-sourced what and bio stand', JSON.stringify(descriptionLines(acc, { handle: '@zemes_sargi', identity: null, bio: null })) === '["W","B"]');
check('descriptionLines: any other null → nothing', descriptionLines(acc, { handle: '@x', identity: null, bio: null }).length === 0);
check('descriptionLines: not researched yet → the data\'s own what and bio', JSON.stringify(descriptionLines(acc, undefined)) === '["W","B"]');

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

// --- the recollections in the real corpus ------------------------------------
// A recollection is located by volume + page, not by an article permalink, and
// it is the only type whose `ocr` is empty — the 1923 volume's text layer is
// clean, so `lv` IS that text and a second "raw" string would be invented.
// Counted and printed, so these rows show zero rather than pass vacuously.
const recollected = corpus.filter((p) => p.type === 'atminas');
check(`corpus: ${recollected.length} recollection(s), each with an integer writing year after 1918`,
  recollected.length > 0 && recollected.every((p) => isWrittenYear(p.written)),
  recollected.length ? `written ${[...new Set(recollected.map((p) => p.written))].join()}` : 'none yet');
check('corpus: every recollection carries via, an archive url and a page number',
  recollected.every((p) => p.via && refusalReason(p, data.accounts[p.handle]) === null && Number.isInteger(p.page)),
  recollected.filter((p) => !Number.isInteger(p.page)).map((p) => p.seq).join());
check('corpus: a recollection has no ocr, every scanned post has one',
  corpus.every((p) => (p.type === 'atminas') === (p.ocr === null || p.ocr === undefined)),
  corpus.filter((p) => (p.type === 'atminas') !== (p.ocr === null || p.ocr === undefined)).map((p) => p.seq).join());
// The three 1918-11-17 recollections were parked, not merged: a recollection of
// the previous day dissolves a one-day feed. They stay in rereading/atminas.json.
check('corpus: no post is dated to another day', corpus.every((p) => !(p as { date?: string }).date),
  corpus.filter((p) => (p as { date?: string }).date).map((p) => p.seq).join());

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
