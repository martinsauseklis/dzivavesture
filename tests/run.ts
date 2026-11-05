// Table-driven, no framework. Run: `pnpm test` (= node tests/run.ts).
import { readFileSync } from 'node:fs';
import {
  refusalReason, isClock, escapeHtml, bodyHtml, trends, invariantLine, initials, plural,
  type Post, type Account,
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
check('mention keeps printed wording, handle in parentheses',
  plain.html.includes('Vilsonam (<button type="button" class="mention" data-handle="@POTUS">@POTUS</button>)'));
check('mention: nothing unmatched', plain.unmatched.length === 0);

const hostile = bodyHtml('<script>alert("x")</script> Vilsonam', { mentions: { Vilsonam: '@POTUS' } }, accounts, gap);
check('text is escaped before any markup', !hostile.html.includes('<script>') && hostile.html.includes('&lt;script&gt;'));

const injectedKey = bodyHtml('a <b> c', { mentions: { '<b>': '@POTUS' } }, accounts, gap);
check('mention key containing markup is matched escaped, not raw', injectedKey.html.includes('&lt;b&gt; (<button'));

const unknownHandle = bodyHtml('Vilsonam', { mentions: { Vilsonam: '@ghost' } }, accounts, gap);
check('mention to a handle with no account is not linked', !unknownHandle.html.includes('mention') && unknownHandle.unmatched[0] === 'Vilsonam');

const notPrinted = bodyHtml('Teksts.', { mentions: { 'romāna autors': '@POTUS' } }, accounts, gap);
check('mention whose key is not printed is reported, not rendered', notPrinted.unmatched[0] === 'romāna autors');

const recon = bodyHtml('kļuvis par', { recon: { kļuvis: 'ļļņ"miS' } }, accounts, gap);
check('recon: dotted span with escaped raw tooltip',
  recon.html.includes('<span class="recon" title="Rekonstruēts no bojāta OCR: „ļļņ&quot;miS“">kļuvis</span>'));

const gaps = bodyHtml('ap [?] procentu un [?] bērnu', {}, accounts, gap);
check('every [?] becomes a tappable gap with the convention as title', (gaps.html.match(/class="gap"/g) ?? []).length === 2 && gaps.html.includes(`title="${gap}"`));

const ident = bodyHtml('Raiņa „Spēlēju, dancoju“ (turpinājums)', { ident: [{ rendered: 'Spēlēju, dancoju', ocr: '.Äpehlciu "Sanža', evidence: 'glyphs', candidate_source: 's', glyph_match: 'g' }] }, accounts, gap);
check('ident: wavy span with escaped OCR, followed by a [≈] button',
  ident.html.includes('<span class="ident" title="Identificēts pēc ārēja reģistra, nevis nolasīts. OCR: „.Äpehlciu &quot;Sanža“">Spēlēju, dancoju</span><button type="button" class="gap" title="Identificēts — avots un burtu atbilstība zem „avots“">[≈]</button>'));
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
const gapped = corpus.filter((p) => p.lv.includes('[?]'));
check('corpus: every [?] post carries a warn that explains it', gapped.length > 0 && gapped.every((p) => p.warn), gapped.filter((p) => !p.warn).map((p) => p.seq).join());

console.log(failed ? `\n${failed} FAILED` : '\nall green');
process.exit(failed ? 1 : 0);
