// Table-driven, no framework. Run: `pnpm test` (= node tests/run.ts).
import { readFileSync } from 'node:fs';
import {
  refusalReason, isClock, escapeHtml, bodyHtml, trends, invariantLine, initials, plural,
  avatarHue, HUE_COUNT, reportedBy, viaText, profilePath, mentionsOf, EMPTY_COPY, descriptionLines, readIdentities, lead,
  isWrittenYear, recollectionLine, recollectionHeader, holdsLine, publishedOn, partitionByDay, reachableHandles, renderedPosts,
  DAYS, DAYS_SPAN, DAY_CARD_SEQ, cardAlt, dayCounts, dayStripLabel, proclamationLine, PROCLAMATION_TOPIC, excerpt, shareHref, SHARE_TEXT_MAX, type Post, type Account,
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
// CHANGED 2026-11-10: „tās dienas“ → „to dienu“, „Tajā dienā“ → „Tajās dienās“.
// The site now spans 17–20 November, so a profile holds several days' papers;
// the singular would say the wrong thing. Behaviour changed, so the rows did.
// | input                                   | expected                                      |
// | [citats, citats]                        | '2 ieraksti to dienu Rīgas avīzēs'            |
// | [atminas 1923] × 8                      | '8 ieraksti — atmiņas, rakstītas 1923. gadā'   |
// | [atminas 1923, atminas 1925]            | '2 ieraksti — atmiņas, rakstītas 1923., 1925. gadā' |
// | [atminas 1923, citats] (mixed)          | '2 ieraksti to dienu Rīgas avīzēs'            |
// | [atminas, written missing]              | '1 ieraksts to dienu Rīgas avīzēs' (refused anyway) |
// | []                                      | 'Tajās dienās neko nesaka — avīzes min'       |
check('holdsLine: contemporary posts name the papers', holdsLine([{ type: 'citats' }, { type: 'citats' }]) === '2 ieraksti to dienu Rīgas avīzēs');
check('holdsLine: all recollections name the writing year, not the papers',
  holdsLine(Array(8).fill({ type: 'atminas', written: 1923 })) === '8 ieraksti — atmiņas, rakstītas 1923. gadā');
check('holdsLine: two writing years, both named', holdsLine([{ type: 'atminas', written: 1925 }, { type: 'atminas', written: 1923 }]) === '2 ieraksti — atmiņas, rakstītas 1923., 1925. gadā');
check('holdsLine: one contemporary post among them → the papers', holdsLine([{ type: 'atminas', written: 1923 }, { type: 'citats' }]) === '2 ieraksti to dienu Rīgas avīzēs');
check('holdsLine: no posts → the account said nothing, never a zero', holdsLine([]) === 'Tajās dienās neko nesaka — avīzes min');
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
  recon.html.includes('<span class="recon" title="Atjaunots pēc bojāta OCR teksta: „ļļņ&quot;miS“">kļuvis</span>'));

// A gap mark is a span (there is no panel to open) whose title is the post's
// own warn — the explanation the fold used to hold — or the convention when
// the post has no warn.
const gaps = bodyHtml('ap [?] procentu un [?] bērnu', { warn: 'OCR: „7<“' }, accounts, gap);
check('every [?] becomes a marked span with the warn as its title', (gaps.html.match(/<span class="gap" title="OCR: „7&lt;“">\[\?\]<\/span>/g) ?? []).length === 2);
check('[?] without a warn falls back to the convention', bodyHtml('[?]', {}, accounts, gap).html.includes(`<span class="gap" title="${gap}">[?]</span>`));

const ident = bodyHtml('Raiņa „Spēlēju, dancoju“ (turpinājums)', { ident: [{ rendered: 'Spēlēju, dancoju', ocr: '.Äpehlciu "Sanža', evidence: 'glyphs', candidate_source: 's', glyph_match: 'g' }] }, accounts, gap);
check('ident: wavy span with escaped OCR, followed by a [≈] mark naming source, evidence kind and match',
  ident.html.includes('<span class="ident" title="Vārds noteikts pēc ārēja reģistra, nevis nolasīts no avota. OCR: „.Äpehlciu &quot;Sanža“">Spēlēju, dancoju</span><span class="gap" title="Identificēts pēc s — burtu atbilstība: g">[≈]</span>'));
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

// --- publishedOn: a post belongs to the day its source was PUBLISHED ---------
// | case                              | input                                            | expected      |
// | newspaper citation                | via 'Baltijas Ziņas Nr.168, 18.11.1918, „Rīga“'  | '18.11.1918'  |
// | reported citation                 | via 'Atstāstīts: Līdums Nr.219, 20.11.1918'      | '20.11.1918'  |
// | document carrying its own date    | via '… 19.11.1918 …', dated '18.11.1918'         | '18.11.1918'  |
// | recollection                      | atminas, via 'Valsts pieci gadi, Rīga 1923'      | null (parked) |
// | recollection with a date in via   | atminas, via '…, 18.11.1918'                     | null          |
// | citation without a date           | via 'Līdums'                                     | null          |
// | ISO-shaped date                   | via '1918-11-18'                                 | null          |
const days: [string, Pick<Post, 'type' | 'via' | 'dated'>, string | null][] = [
  ['newspaper citation', { type: 'citats', via: 'Baltijas Ziņas Nr.168, 18.11.1918, „Rīga“' }, '18.11.1918'],
  ['reported citation', { type: 'atstastits', via: 'Atstāstīts: Līdums Nr.219, 20.11.1918' }, '20.11.1918'],
  ['document carrying its own date', { type: 'dokuments', via: 'Jaunākās Ziņas Nr.4, 19.11.1918, „Vietējās ziņas“', dated: '18.11.1918' }, '18.11.1918'],
  ['recollection', { type: 'atminas', via: 'Valsts pieci gadi, Rīga 1923, 12. lpp.' }, null],
  ['recollection with a date in via', { type: 'atminas', via: 'Valsts pieci gadi, 18.11.1918' }, null],
  ['citation without a date', { type: 'citats', via: 'Līdums' }, null],
  ['ISO-shaped date', { type: 'citats', via: '1918-11-18' }, null],
];
for (const [name, p, want] of days) check(`publishedOn: ${name}`, publishedOn(p) === want, `want ${want}`);

// --- partitionByDay: every post on exactly one day page, or parked -----------
// | case                                  | expected                                   |
// | 2×18th, 1×20th, 1 atminas             | 18:[1,3] 20:[2] 17:[] 19:[] parked:[4]     |
// | a day the site has no page for        | throws 'tādas dienas lapas nav'            |
// | hostile dated                         | throws (not in the closed set)             |
// | newspaper post without a date         | throws 'nenosauc izdošanas dienu'          |
const part = partitionByDay([
  post({ seq: 1, via: 'Baltijas Ziņas Nr.168, 18.11.1918' }), post({ seq: 2, via: 'Līdums Nr.219, 20.11.1918' }),
  post({ seq: 3, via: 'Rigasche Zeitung Nr.267, 18.11.1918' }), post({ seq: 4, handle: '@k_ulmanis', type: 'atminas', written: 1923, via: 'Valsts pieci gadi, Rīga 1923' }),
]);
check('partitionByDay: posts land on their day in the order given, recollections parked',
  [...part.byDay].map(([k, v]) => `${k}:${v.map((p) => p.seq)}`).join(' ') === '17.11.1918: 18.11.1918:1,3 19.11.1918: 20.11.1918:2' && part.parked.map((p) => p.seq).join() === '4');
check('partitionByDay: a day the site does not render fails loudly', throws(() => partitionByDay([post({ via: 'Līdums Nr.220, 21.11.1918' })]), 'tādas dienas lapas nav'));
check('partitionByDay: a hostile dated fails loudly', throws(() => partitionByDay([post({ dated: 'javascript:alert(1)' })]), 'tādas dienas lapas nav'));
check('partitionByDay: a newspaper post without a date fails loudly', throws(() => partitionByDay([post({ via: 'Līdums' })]), 'nenosauc izdošanas dienu'));

// --- DAYS: the closed set of pages ------------------------------------------
// | rule                                                        |
// | 4 days, keys ascending, exactly one with path '' — the 18th |
// | every other path is DD-11-1918/ and matches its key         |
// | DAYS_SPAN reads „17.–20. novembris 1918“                    |
check('DAYS: four days in order, the 18th at the root', DAYS.length === 4 && DAYS.map((d) => d.key).join() === '17.11.1918,18.11.1918,19.11.1918,20.11.1918'
  && DAYS.filter((d) => d.path === '').map((d) => d.key).join() === '18.11.1918');
check('DAYS: every other path is DD-11-1918/ and names its own key', DAYS.filter((d) => d.path).every((d) => d.path === `${d.n}-11-1918/` && d.key === `${d.n}.11.1918`));
check('DAYS_SPAN', DAYS_SPAN === '17.–20. novembris 1918');

// --- dayCounts / dayStripLabel / proclamationLine ---------------------------
// The two numbers a day page knows about itself, and the two strings made from
// them. CHANGED 2026-11-10, same day: the strip drew these as a bar to scale
// and he could not read it („just black blotches“), so `share` is gone and the
// numbers are printed as numbers. The counting is unchanged; the rendering is.
// | case                                 | input                  | expected                        |
// | a day with posts, one proclaiming    | 4 posts, 1 proclaiming | n 4, proclaimed 1               |
// | a day absent from the map            | —                      | n 0, proclaimed 0               |
// | no corpus at all (hostile: no posts) | —                      | every day 0, all four days keyed |
// | strip label                          | 17th, n 6              | „17. novembris — 6 ieraksti“    |
// | strip label, one post (LV singular)  | 17th, n 1              | „… — 1 ieraksts“                |
// | the line under the headline          | proclaimed 12          | „12 ieraksti par valsts pasludināšanu“ |
// | … one of them (LV singular)          | proclaimed 1           | „1 ieraksts par …“              |
// | … none: the day says nothing of it   | proclaimed 0           | null — never „0 ieraksti“       |
const pro = { topics: [PROCLAMATION_TOPIC] };
const other = { topics: ['Rīgas dzīve'] };
const c = dayCounts(new Map([['18.11.1918', [pro, other, other, other]]]));
check('dayCounts: a day\'s posts and how many of them report the proclamation',
  JSON.stringify(c.get('18.11.1918')) === JSON.stringify({ n: 4, proclaimed: 1 }), JSON.stringify(c.get('18.11.1918')));
check('dayCounts: a day missing from the map counts zero, never crashes',
  JSON.stringify(c.get('17.11.1918')) === JSON.stringify({ n: 0, proclaimed: 0 }));
const none = dayCounts(new Map());
check('dayCounts: no corpus at all — all four days keyed, every count 0',
  none.size === DAYS.length && DAYS.every((d) => none.get(d.key)!.n === 0 && none.get(d.key)!.proclaimed === 0));
check('dayStripLabel: the sentence behind the two bare numbers in a cell',
  dayStripLabel(DAYS[0], { n: 6, proclaimed: 0 }) === '17. novembris — 6 ieraksti');
check('dayStripLabel: one post takes the Latvian singular',
  dayStripLabel(DAYS[0], { n: 1, proclaimed: 0 }) === '17. novembris — 1 ieraksts');
check('proclamationLine: said in words and whole numbers, not encoded',
  proclamationLine({ n: 18, proclaimed: 12 }) === '12 ieraksti par valsts pasludināšanu');
check('proclamationLine: one post takes the Latvian singular',
  proclamationLine({ n: 18, proclaimed: 1 }) === '1 ieraksts par valsts pasludināšanu');
check('proclamationLine: a day that says nothing about it prints no line, never „0 ieraksti“',
  proclamationLine({ n: 6, proclaimed: 0 }) === null);

// --- reachableHandles: which accounts get a page -----------------------------
// | input                                             | expected        |
// | @lidums posts; @POTUS mentioned; @k_ulmanis neither | lidums, POTUS  |
// | a mention to a handle with no account              | ignored         |
check('reachableHandles: a post or a mention reaches an account, nothing else does',
  reachableHandles(accounts, [post({ mentions: { x: '@POTUS', y: '@ghost' } })]).join() === '@lidums,@POTUS');

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

// --- share to X: the excerpt ----------------------------------------------------
// | case                           | input                                  | expected                                   |
// | fits                           | 'Teksts.'                              | 'Teksts.' — whole, no ellipsis             |
// | cut on a space                 | 'aaaa bbbb cccc' max 9                 | 'aaaa bbbb…' never mid-word                |
// | limit falls inside a word      | 'aaaa bbbb cccc' max 11                | 'aaaa bbbb…'                               |
// | limit falls inside [?]         | 'aaaa [?] cccc' max 6                  | 'aaaa…' — the marker is whole or gone      |
// | macrons count as one           | 'ā'×9 + ' b' max 9                     | 'āāāāāāāāā…' (9 code points kept)          |
// | trailing comma dropped         | 'aaaa, bbbb' max 6                     | 'aaaa…'                                    |
// | one run longer than the cap    | 'aaaaaaaaaa' max 4                     | 'aaaa…' — cut hard, never empty            |
check('excerpt: text that fits is returned whole', excerpt('Teksts.') === 'Teksts.');
check('excerpt: cuts on a space', excerpt('aaaa bbbb cccc', 9) === 'aaaa bbbb…');
check('excerpt: never mid-word', excerpt('aaaa bbbb cccc', 11) === 'aaaa bbbb…', excerpt('aaaa bbbb cccc', 11));
check('excerpt: never inside a [?] marker', excerpt('aaaa [?] cccc', 6) === 'aaaa…', excerpt('aaaa [?] cccc', 6));
check('excerpt: a macron is one code point', excerpt('ā'.repeat(9) + ' b', 9) === 'ā'.repeat(9) + '…');
check('excerpt: trailing punctuation dropped before the ellipsis', excerpt('aaaa, bbbb', 6) === 'aaaa…', excerpt('aaaa, bbbb', 6));
check('excerpt: one run longer than the cap is cut hard, never empty', excerpt('aaaaaaaaaa', 4) === 'aaaa…');

// --- share to X: the href ---------------------------------------------------------
// | case                      | post                                  | expected                                                   |
// | front day                 | seq 20, via 18.11.1918                | url = ORIGIN/#p-20                                         |
// | another day               | seq 12, via 19.11.1918                | url = ORIGIN/19-11-1918/#p-12                              |
// | dated document            | dated 18.11.1918, via 19.11.1918      | url = ORIGIN/#p-N — the day the rule puts it on            |
// | text names the account    | name 'Līdums', handle '@lidums'       | text holds „…“ — Līdums, 1918. gada 19. novembris; no '@'  |
// | hostile words             | lv '&url=https://evil.example #x @y'  | all inside text=, encoded; url= still ours                 |
// | parked recollection       | atminas                               | throws                                                     |
const O = 'https://dzivavesture.mai.lv';
const params = (href: string) => { const u = new URL(href); return { host: u.origin + u.pathname, text: u.searchParams.get('text') ?? '', url: u.searchParams.get('url') ?? '' }; };
check('shareHref: front day → ORIGIN/#p-seq', params(shareHref(O, post({ seq: 20, via: 'Līdums Nr.1, 18.11.1918' }), { name: 'Līdums' })).url === `${O}/#p-20`);
check('shareHref: another day → ORIGIN/DD-11-1918/#p-seq', params(shareHref(O, post({ seq: 12, via: 'Līdums Nr.1, 19.11.1918' }), { name: 'Līdums' })).url === `${O}/19-11-1918/#p-12`);
check('shareHref: a dated document shares on its own day', params(shareHref(O, post({ seq: 7, dated: '18.11.1918', via: 'Līdums Nr.1, 19.11.1918' }), { name: 'Līdums' })).url === `${O}/#p-7`);
const shared = params(shareHref(O, post({ via: 'Līdums Nr.1, 19.11.1918' }), { name: 'Līdums' }));
check('shareHref: text is „words“ — Name, date, and never a handle', shared.text === '„Teksts.“ — Līdums, 1918. gada 19. novembris' && !shared.text.includes('@'), shared.text);
check('shareHref: goes to x.com/intent/post', shared.host === 'https://x.com/intent/post');
const hostileShare = shareHref(O, post({ lv: '&url=https://evil.example #x @y', via: 'Līdums Nr.1, 19.11.1918' }), { name: 'L' });
// The words round-trip intact, the raw href holds exactly one `&url=` (the
// hostile one is encoded, so it cannot open a second parameter), and url= is ours.
check('shareHref: hostile words stay inside text=, the url= is ours', params(hostileShare).url === `${O}/19-11-1918/#p-1` && params(hostileShare).text.includes('&url=https://evil.example #x @y') && hostileShare.split('&url=').length === 2);
check('shareHref: a parked recollection throws', (() => { try { shareHref(O, post({ type: 'atminas', written: 1923 }), { name: 'x' }); return false; } catch { return true; } })());

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
// An account `warn` is PRINTED on that account's public profile. Six of them
// were working notes — publication to-dos and copyright arithmetic — and they
// shipped onto the page. Internal notes belong in `note`, which nothing
// renders. This fails on the words such a note is written with.
const INTERNAL_WORDS = /pirms publicēšanas|jāiegūst|jāsalasa|jāsalīdzina|jāpārbauda|Autortiesības|mūžs\+70|ŠIS APRAKSTS/i;
const leaked = Object.entries(data.accounts).filter(([, a]: [string, any]) => a.warn && INTERNAL_WORDS.test(a.warn)).map(([h]) => h);
check('accounts: no internal working note in a rendered `warn`', leaked.length === 0, leaked.join(', ') || 'checked ' + Object.keys(data.accounts).length + ' accounts');
const notesHeld = Object.values(data.accounts).filter((a: any) => a.note).length;
check('accounts: the internal notes were kept, not deleted', notesHeld === 6, `${notesHeld} accounts carry \`note\``);

const reachable = new Set([...corpus.map((p) => p.handle), ...corpus.flatMap((p) => Object.values(p.mentions ?? {}))]);
check('corpus: every account is reachable from a post or a printed mention', Object.keys(data.accounts).every((h) => reachable.has(h)), Object.keys(data.accounts).filter((h) => !reachable.has(h)).join());
check('corpus: sampler saw both sides', reasons.length > 0 && refusals.some(([, , w]) => w !== null), 'guards rejected hostile fixtures above AND accepted the corpus');
const personRendered = corpus.filter((p) => p.type === 'atstastits' && data.accounts[p.handle].kind === 'person');
check('corpus: every person-account rendering names its reporter on the face', personRendered.length > 0 && personRendered.every((p) => reportedBy(p.via)),
  personRendered.filter((p) => !reportedBy(p.via)).map((p) => p.seq).join());
// The post-less accounts WITH A PAGE and without `silent` text in the data are
// exactly the ones with page copy — no default empty state, and no copy
// shadowing data. Counted over the rendered posts: a parked memoirist has no
// page, so needs no copy.
const rendered = renderedPosts(data);
const withPage = reachableHandles(data.accounts, rendered.shown);
const postless = withPage.filter((h) => !rendered.shown.some((p) => p.handle === h));
const needCopy = postless.filter((h) => !data.accounts[h].silent).sort();
check('profiles: 8 accounts with a page have no post', postless.length === 8, postless.join());
check('profiles: EMPTY_COPY covers exactly the post-less accounts without silent text', JSON.stringify(Object.keys(EMPTY_COPY).sort()) === JSON.stringify(needCopy), `need ${needCopy.join()}`);
check('profiles: every post-less account has a mention to show', postless.every((h) => mentionsOf(h, rendered.shown).length > 0), postless.filter((h) => !mentionsOf(h, rendered.shown).length).join());
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
// CHANGED 2026-11-10 — behaviour changed, so the row did. This row used to
// assert that no post carried a `date`: the site was one day. It now renders
// four days, and a post's day is read off the PUBLICATION date in its `via`
// (publishedOn), so the row became the partition: every post on exactly one
// day or parked, with the counts he decided — 18 Nov keeps the two papers that
// came out that day plus the two documents dated that day (the proceedings and
// „Latvijas pilsoņiem“); the 1923 recollections are parked, all eleven.
// | day        | posts |
// | 17.11.1918 |     6 |   Līdums Nr.217
// | 18.11.1918 |    55 |   Baltijas Ziņas Nr.168 (35) + Rigasche Zeitung Nr.267 (16) + sēdes Nr.1 (3) + seq 744
// | 19.11.1918 |    18 |   Rigasche Zeitung Nr.268 (8) + Baltijas Ziņas Nr.169 (10)
// | 20.11.1918 |    17 |   Līdums Nr.219
// | parked     |    11 |   atminas, 1923
const counts = [...rendered.byDay].map(([k, v]) => `${k}:${v.length}`).join(' ');
check('corpus: every post sits on one of the four days or is parked, with the decided counts',
  counts === '17.11.1918:6 18.11.1918:55 19.11.1918:18 20.11.1918:17' && rendered.parked.length === 11 && rendered.shown.length + rendered.parked.length + rendered.refused.length === corpus.length,
  `${counts} parked:${rendered.parked.length} refused:${rendered.refused.length}`);
// The day strip and the line under each headline, against the real corpus.
// The sampler saw both sides: a day that says nothing about the proclamation
// (the 17th, which prints no line) and days that are mostly it (the 19th,
// 20th) — with the 18th between them, where the act is in the Tautas Padome's
// own record while the papers have not caught up. If the corpus renames the
// topic, every count goes to 0 and this fails rather than printing nothing.
const strip = dayCounts(rendered.byDay);
const stripCounts = DAYS.map((d) => `${d.n}:${strip.get(d.key)!.n}/${strip.get(d.key)!.proclaimed}`).join(' ');
check('corpus: the strip counts 6/0 · 55/3 · 18/12 · 17/13, so a silent day and a loud one are both seen',
  stripCounts === '17:6/0 18:55/3 19:18/12 20:17/13'
  && proclamationLine(strip.get('17.11.1918')!) === null
  && DAYS.some((d) => strip.get(d.key)!.proclaimed > strip.get(d.key)!.n / 2), stripCounts);
check('corpus: the parked posts are exactly the recollections', rendered.parked.every((p) => p.type === 'atminas') && rendered.parked.length === corpus.filter((p) => p.type === 'atminas').length);
check('corpus: exactly one post carries its own date — „Latvijas pilsoņiem“, printed on the 19th, dated the 18th',
  corpus.filter((p) => p.dated).map((p) => `${p.seq}:${p.dated}`).join() === '744:18.11.1918' && publishedOn(corpus.find((p) => p.seq === 744)!) === '18.11.1918');
check('corpus: the three memoirists have no page while parked; every other account does',
  Object.keys(data.accounts).filter((h) => !withPage.includes(h)).sort().join() === '@a_brigadere,@ed_calitis,@j_ampermanis');
check('corpus: each day card shows a post of that day', DAYS.every((d) => rendered.byDay.get(d.key)!.some((p) => p.seq === DAY_CARD_SEQ[d.key])));
// | every shown post | share text ≤ 257 code points, no partial '[?', and a day url | counted, so zero posts would show as zero |
const shareTexts = rendered.shown.map((p) => params(shareHref(O, p, data.accounts[p.handle])).text);
const longest = Math.max(...shareTexts.map((t) => [...t].length));
check(`corpus: ${shareTexts.length} share texts, longest ${longest} ≤ ${SHARE_TEXT_MAX} code points`, shareTexts.length === rendered.shown.length && longest <= SHARE_TEXT_MAX);
// An editorial bracket („Latvju [valsti]“, seq 690) is the paper's; only a split gap marker is ours to forbid.
check('corpus: no share text holds a split [?] marker or an @handle', shareTexts.every((t) => { const s = t.replace(/\[\?\]/g, ''); return !s.includes('[?') && !s.includes('?]') && !s.includes('@'); }));

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
