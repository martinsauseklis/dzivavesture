// Pure logic for the feed: the structural guards, the body markup and the
// trend ranking. No Astro, no DOM, no Node imports — tests/run.ts asserts that,
// so this file stays runnable by `node` alone.

export type Account = {
  name: string;
  kind: 'person' | 'org' | 'publication' | 'meta';
  what: string;
  bio: string;
  warn?: string;
  silent?: string;
  // An X handle that exists today and continues this 1918 account (Saeima).
  today?: string;
  todayWhat?: string;
  // The account is a live office, not a person — only @POTUS.
  live?: string;
};

export type Comment = { name: string; handle: string; text: string; via: string; url: string };

export type Post = {
  handle: string;
  // citats / atstastits / dokuments are printed that week. atminas is a
  // recollection written years later — a different class of evidence, so the
  // year it was written is required (guard 6) and goes on the card's face.
  type: 'citats' | 'atstastits' | 'dokuments' | 'nezinamais' | 'atminas';
  // The year a recollection was written. Required when type is 'atminas';
  // `at` stays the 1918 clock time of the moment it describes.
  written?: number;
  // The date printed ON a document itself, 'DD.MM.YYYY'. His rule, 2026-11-10:
  // a document DATED and ISSUED on a day belongs to that day even when the
  // paper that printed it came out later — „Latvijas pilsoņiem“, dated „Rīgā,
  // 18. novembrī 1918. gadā“ and printed on the 19th, sits on the 18th. A
  // newspaper's REPORT about a day carries no `dated` and belongs to the day it
  // was printed. To reverse the rule, drop the `dated` line in publishedOn.
  dated?: string;
  at: string;
  seq: number;
  lv: string;
  ocr: string | null;
  via: string;
  url: string;
  // The page in a printed volume. A newspaper item is located by its archive
  // permalink; a book's permalink is the whole book, so the page is the locator.
  page?: number;
  topics: string[];
  atNote: string;
  // The record's own commentary: where a memoirist goes beyond what he could
  // have seen, and where he contradicts the papers. Kept, never rendered.
  note?: string;
  warn?: string;
  // Modern word → the raw OCR string it was read from.
  recon?: Record<string, string>;
  // Exact printed string → handle. Explicit, never guessed off a name.
  mentions?: Record<string, string>;
  context?: string;
  later?: string;
  comments?: Comment[];
  // A title, name or place that damaged OCR could not yield and that was
  // IDENTIFIED against an external register — never ordinary prose. The
  // record carries the candidate's source and the glyph match, and the page
  // marks it apart from both a plain reading and a recon.
  ident?: Ident[];
};

// Exactly one admissible kind of evidence, named: 'glyphs' (a position-by-position
// match against this corpus's own damage patterns) or 'corroboration' (another
// item in the same source naming the same thing, with its locator). A length or
// shape comparison is neither and never counts.
export type Ident = {
  rendered: string;
  ocr: string;
  evidence: 'glyphs' | 'corroboration';
  candidate_source: string;
  glyph_match: string;
  corroboration?: string;
};

export const TYPE_LABEL: Record<Post['type'], string> = {
  citats: 'citāts',
  atstastits: 'atstāstīts',
  dokuments: 'dokuments',
  nezinamais: 'nezināmais',
  atminas: 'atmiņas',
};

// A recollection's writing year: a whole year after the day itself, not past
// the archive. Anything else is a typo, not a date. Breaks when: the site
// gains a day after 2099, or a memoir genuinely written in 1918.
export const isWrittenYear = (y: unknown): y is number => Number.isInteger(y) && (y as number) > 1918 && (y as number) <= 2099;

// What the face says above a recollection, so the writing date cannot be
// missed — the one thing a reader cannot infer from the account. Null for
// every other type.
export const recollectionLine = (post: Pick<Post, 'type' | 'written'>) =>
  post.type === 'atminas' && isWrittenYear(post.written) ? `atmiņas — rakstītas ${post.written}. gadā` : null;

// A profile whose every post is a recollection says so in its header, in its
// own right — structurally, not by the wording of a researched bio that a
// later edit could lose. Null when there is nothing, or anything contemporary.
// Years are listed when they differ („1923., 1925. gadā“).
export function recollectionHeader(posts: Pick<Post, 'type' | 'written'>[]): string | null {
  const years = writtenYears(posts);
  return years && `Visi ieraksti ir atmiņas, rakstītas ${years} gadā`;
}

// „1923.“ or „1923., 1925.“ when every post given is a dated recollection;
// null the moment one of them is contemporary. One place, so the profile
// header and the link-preview line can never disagree about the year.
function writtenYears(posts: Pick<Post, 'type' | 'written'>[]): string | null {
  if (!posts.length || !posts.every((p) => p.type === 'atminas' && isWrittenYear(p.written))) return null;
  return [...new Set(posts.map((p) => p.written as number))].sort().map((y) => `${y}.`).join(', ');
}

// What a profile holds, in one phrase — the line on its link-preview card and
// in its meta description, which is where most readers meet the page first.
// A recollection was NOT in that day's Rīga papers, so an account whose posts
// are all recollections may not be described as if it were: „8 ieraksti tās
// dienas Rīgas avīzēs“ under Cālītis would be exactly the lie the atmiņas type
// exists to prevent, told in the one place the type's red line never reaches.
// No full stop — the caller punctuates.
export function holdsLine(posts: Pick<Post, 'type' | 'written'>[]): string {
  const n = posts.length;
  if (!n) return 'Tajās dienās neko nesaka — avīzes min';
  const years = writtenYears(posts);
  return `${n} ${plural(n)} ${years ? `— atmiņas, rakstītas ${years} gadā` : 'to dienu Rīgas avīzēs'}`;
}

// Every source permalink must point into an archive — a CLOSED set of origins,
// prefix-matched. A bare "truthy url" check would let `javascript:` or a foreign
// host through the one guard the whole site rests on, and a substring check
// would admit https://evil.example/periodika.lv.
//   periodika.lndb.lv — the National Library's newspaper scans (the viewer host;
//   periodika.lv redirects a human but its deep links open an empty viewer).
//   eraksti.lv   — the 1923 memoir volume „Valsts pieci gadi“, whose only
//                  public copy is there. It is listed over plain http because
//                  its TLS certificate is self-signed, so https does not
//                  answer; an outbound link downgrades, and that is stated
//                  here rather than hidden behind an https address that 404s.
// Breaks when: either archive changes host, or eraksti.lv fixes its certificate
// (then its https origin has to be added — the set is closed on purpose).
const ARCHIVES = ['https://periodika.lndb.lv/', 'http://eraksti.lv/'];
const isArchiveUrl = (url: unknown) => typeof url === 'string' && ARCHIVES.some((a) => url.startsWith(a));

// The structural guards. They make the failure mode unrepresentable rather
// than discouraged:
//   1. No archive permalink → the post cannot render.
//   2. A person account can never carry `citats`. The closest the system can
//      say is "Līdums reported that Ulmanis said" — which is the truth: every
//      speech here is a journalist's rendering, not a transcript.
//   3. A comment is held to the same rule as a post.
//   4. A handle with no account, or a type outside the four, is refused —
//      never rendered half-empty.
//   5. A `nezinamais` post is a note about the sources, not a post; it is
//      refused from the feed and counted, so a meta-device can never sit in
//      the timeline again. Gaps are stated in the page's own note instead.
//   6. An `atminas` post without a valid writing year cannot render: the year
//      is the whole point of the type, and a recollection passing as a
//      contemporary report is the lie this site exists not to tell.
export function refusalReason(post: Post, account: Account | undefined): string | null {
  if (!account) return 'nezināms konts';
  if (!(post.type in TYPE_LABEL)) return 'nezināms tips';
  if (post.type === 'nezinamais') return 'meta-ieraksts nav plūsmā';
  if (!isArchiveUrl(post.url)) return 'nav avota saites';
  if (account.kind === 'person' && post.type === 'citats') return 'personas kontam nevar būt tiešs citāts';
  if (post.type === 'atminas' && !isWrittenYear(post.written)) return 'atmiņām nav derīga rakstīšanas gada';
  for (const c of post.comments ?? []) if (!isArchiveUrl(c.url)) return 'komentārs bez avota saites';
  return null;
}

// The days the site renders, one page each, in order. The 18th is the front
// page (path ''); every other day lives at /DD-11-1918/. The set is closed on
// purpose: a post whose source was published on a day not listed here fails
// the build (partitionByDay) instead of quietly landing on no page. Breaks
// when a day outside November 1918 is added — then month and year join the
// record and the three helpers below.
export type Day = { key: string; path: string; weekday: string; n: number };
export const DAYS: Day[] = [
  { key: '17.11.1918', path: '17-11-1918/', weekday: 'Svētdiena', n: 17 },
  { key: '18.11.1918', path: '',            weekday: 'Pirmdiena', n: 18 },
  { key: '19.11.1918', path: '19-11-1918/', weekday: 'Otrdiena',  n: 19 },
  { key: '20.11.1918', path: '20-11-1918/', weekday: 'Trešdiena', n: 20 },
];
// „Pirmdiena, 1918. gada 18. novembris“ — the headline of a day page.
export const dayHeading = (d: Day) => `${d.weekday}, 1918. gada ${d.n}. novembris`;
// „1918. gada 18. novembrī“ — the day in the locative, over „kas notiek“.
export const dayOn = (d: Day) => `1918. gada ${d.n}. novembrī`;
// „17.–20. novembris 1918“ — the span a profile covers.
export const DAYS_SPAN = `${DAYS[0].n}.–${DAYS[DAYS.length - 1].n}. novembris 1918`;

// The topic a post carries when it proclaims the state or reports it. It is a
// value the corpus already uses, not a judgement made here, and its counts are
// the only narrative device on the page: 0 of 6 on the 17th, 3 of 55 on the
// 18th (the act itself — the Tautas Padome's own session record and the
// document dated that day), then 12 of 18 and 13 of 17 once the papers catch
// up. Breaks when: the corpus renames this topic; the test row that counts it
// per day then fails loudly rather than quietly printing nothing.
export const PROCLAMATION_TOPIC = 'Valsts pasludināšana';

// The two numbers a day page knows about itself: how many posts it holds, and
// how many of those report the proclamation.
export type DayCount = { n: number; proclaimed: number };
export function dayCounts(byDay: Map<string, Pick<Post, 'topics'>[]>): Map<string, DayCount> {
  return new Map(DAYS.map((d) => {
    const posts = byDay.get(d.key) ?? [];
    return [d.key, { n: posts.length, proclaimed: posts.filter((p) => p.topics.includes(PROCLAMATION_TOPIC)).length }];
  }));
}

// A day cell in the strip shows „18.“ over „55“ — two bare numbers, which read
// as a date and a count only in context. This is the sentence a screen reader
// gets in their place.
export const dayStripLabel = (d: Day, c: DayCount) => `${d.n}. novembris — ${c.n} ${plural(c.n)}`;

// The one line under a day's headline, when that day's papers carry the
// proclamation at all — said in words and whole numbers, because the share is
// the story (3 of 55 on the 18th against 12 of 18 on the 19th) and a reader
// should not have to decode it. Null on a day that says nothing about it: an
// absence states itself better than „nekā par pasludināšanu“ would.
export const proclamationLine = (c: DayCount) =>
  c.proclaimed ? `${c.proclaimed} ${plural(c.proclaimed)} par valsts pasludināšanu` : null;

// The day a post belongs to: the day its source was PUBLISHED, read off the
// `via` citation („Baltijas Ziņas Nr.168, 18.11.1918, …“) — never the day the
// events it describes happened. That is what keeps every post traceable: the
// page it sits on is the issue it came from. Two departures, both deliberate:
//   - a document carrying its own date (`dated`, see the Post type) belongs
//     to that day;
//   - a recollection (`atminas`) belongs to no day — parked, his call of
//     2026-11-10 („for now dismiss the memories from 1923“). The data and the
//     type machinery stay; to bring them back, give them a day here.
// Null means "on no page". A newspaper post whose via names no date is a
// broken citation, and partitionByDay refuses it.
export function publishedOn(post: Pick<Post, 'type' | 'via' | 'dated'>): string | null {
  if (post.type === 'atminas') return null;
  if (post.dated) return post.dated;
  return /\b(\d\d\.\d\d\.\d{4})\b/.exec(post.via)?.[1] ?? null;
}

export type Partition = { byDay: Map<string, Post[]>; parked: Post[] };

// Every post onto exactly one day page, or parked — in the order given. Throws
// on a day the site does not render and on a dated source with no date, so a
// post can never fall through unrendered (a hostile `dated` lands here too).
export function partitionByDay(posts: Post[]): Partition {
  const byDay = new Map(DAYS.map((d) => [d.key, [] as Post[]]));
  const parked: Post[] = [];
  for (const p of posts) {
    const day = publishedOn(p);
    if (day === null && p.type === 'atminas') { parked.push(p); continue; }
    if (day === null) throw new Error(`seq ${p.seq}: via „${p.via}“ nenosauc izdošanas dienu`);
    const list = byDay.get(day);
    if (!list) throw new Error(`seq ${p.seq}: izdots ${day} — tādas dienas lapas nav (feed.ts DAYS)`);
    list.push(p);
  }
  return { byDay, parked };
}

// What the site renders, from the data in one pass: the structural guards
// first (refused posts are returned, so the build can name them), then the
// partition. `shown` is in site order — day by day, seq within a day. One
// function, so the day pages, the profiles and the card tools can never
// disagree about what is on the site.
export type Rendered = { shown: Post[]; byDay: Map<string, Post[]>; refused: Post[]; parked: Post[] };
export function renderedPosts(data: { posts: Post[]; accounts: Record<string, Account> }): Rendered {
  const sorted = data.posts.slice().sort((a, b) => a.seq - b.seq);
  const refused = sorted.filter((p) => refusalReason(p, data.accounts[p.handle]) !== null);
  const { byDay, parked } = partitionByDay(sorted.filter((p) => !refused.includes(p)));
  return { shown: DAYS.flatMap((d) => byDay.get(d.key)!), byDay, refused, parked };
}

// Which accounts get a page: those with a rendered post, or named by one. A
// parked account (the memoirists, while their recollections are parked) has
// neither, so its page is not built — it comes back with its posts.
export function reachableHandles(accounts: Record<string, Account>, shown: Post[]): string[] {
  const seen = new Set([...shown.map((p) => p.handle), ...shown.flatMap((p) => Object.values(p.mentions ?? {}))]);
  return Object.keys(accounts).filter((h) => seen.has(h));
}

// The link-preview card of a day page shows one real post from THAT day, so
// the card cannot show words the page does not hold (tests/profiles.ts asserts
// the post is published on its day). tools/og-days.mjs renders them.
export const DAY_CARD_SEQ: Record<string, number> = { '17.11.1918': 940, '18.11.1918': 20, '19.11.1918': 618, '20.11.1918': 610 };
// What the card shows, for og:image:alt — the day, the account, the words.
export const cardAlt = (day: Day, post: Pick<Post, 'handle' | 'at' | 'lv'>) =>
  `dzīvā vēsture, ${day.n}. novembris 1918 — ieraksts (${post.handle}, ${post.at}): „${post.lv}“`;

// --- share to X -------------------------------------------------------------
// X counts every URL as 23 characters (t.co), whatever its length, and a post
// is 280 — so the text may hold at most 257 code points. The excerpt is capped
// well under that so the attribution always fits: 120 + „…“ + a 35-character
// name (the longest in the data) + the date comes to under 200. Breaks when:
// X changes the t.co length or the post limit, or an account name past ~60
// characters is added — the corpus row in tests/run.ts counts every post.
export const SHARE_TEXT_MAX = 280 - 23;
export const SHARE_EXCERPT = 120;

// The first words of a post: cut on a space at or before `max` code points —
// never inside a word, a macron'd letter (one code point here; the corpus has
// no combining marks) or a [?] gap marker (which holds no space) — trailing
// punctuation dropped, and closed with an ellipsis. Text that fits is whole.
export function excerpt(text: string, max = SHARE_EXCERPT): string {
  const cps = [...text];
  if (cps.length <= max) return text;
  const head = cps.slice(0, max + 1).join('');
  const cut = head.lastIndexOf(' ');
  // No space in the first `max` code points — one run longer than the cap,
  // which this corpus never has. Cut hard rather than return nothing.
  const kept = cut > 0 ? head.slice(0, cut) : cps.slice(0, max).join('');
  return kept.replace(/[\s,;:—–-]+$/u, '') + '…';
}

// The share link of one post: X's web intent with the words and the post's
// address. No script, no API, no key — a string in an href.
//   url  — the post's DAY page plus its fragment, so X picks up that day's
//          link-preview card (crawlers ignore the fragment) and the reader
//          lands on the post itself.
//   text — „the first words…“ — Name, 1918. gada 19. novembris. The account's
//          NAME, never its @handle: in X's own text a handle tags whoever owns
//          that name on X today, and @lidums is not ours to tag.
// A post on no day (a parked recollection) has no address and throws: it never
// renders, so this is the build refusing, not a reader seeing it.
export function shareHref(origin: string, post: Pick<Post, 'seq' | 'lv' | 'type' | 'via' | 'dated'>, account: Pick<Account, 'name'>): string {
  const key = publishedOn(post);
  const day = DAYS.find((d) => d.key === key);
  if (!day) throw new Error(`seq ${post.seq}: nav dienas lapas — nav adreses, ko dalīt`);
  const text = `„${excerpt(post.lv)}“ — ${account.name}, 1918. gada ${day.n}. novembris`;
  const url = `${origin}/${day.path}#p-${post.seq}`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

// `at` is the one timestamp format the whole feed uses: HH.MM, 24-hour.
export const isClock = (at: string) => /^([01]\d|2[0-3])\.[0-5]\d$/.test(at);

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// The one place a profile URL is spelled: `/@handle/` — the handle is already
// the account's identity, so the address is the handle. Pages are static
// directories, so the trailing slash is the canonical form. `base` is the
// relative path back to the site root from the page that links ('' on the
// feed, '../' on a profile), because the build carries no absolute `base`.
export const profilePath = (handle: string, base = '') => `${base}${handle}/`;

// Posts in which the paper printed this account's name, in feed order — what
// a profile can show when the account itself said nothing that day.
export function mentionsOf(handle: string, posts: Post[]): Post[] {
  return posts.filter((p) => Object.values(p.mentions ?? {}).includes(handle)).sort((a, b) => a.seq - b.seq);
}

// What a post-less profile says, in the page's own voice, where the data has
// no `silent` text. Written per account from its bio and the posts that name
// it — never a default, because an empty page that looks like a bug would undo
// the point: a profile with nothing to show states a fact of the day.
// tests/run.ts asserts this covers exactly the post-less accounts without `silent`.
export const EMPTY_COPY: Record<string, string> = {
  '@erasts_bite': '18. novembrī viņš runāja — Operas namā nolasīja 17. novembra sēdes protokolu —, bet viņa paša vārdus neviena avīze nepierakstīja. Zināms tikai, ka viņš to darīja.',
  '@h_j_seraphim': 'Viņa vārdi 18. novembra Rigasche Zeitung ir 11. turpinājums, bet tie ir vēstule tēvam par janvāri. Par 18. novembri viņš nesaka nekā; avīze viņu iespiež.',
  '@w_j_locke': 'Viņa romāns „Jūras zvaigzne“ 18. novembra Baltijas Ziņās turpinās, tulkots. Pats viņš par Rīgu neko nav teicis.',
  '@l_laicens': 'Par viņu raksta divas avīzes — 17. novembra Līdums grāmatu galdā min „Ieslēgtos“, 18. novembra Baltijas Ziņas nosauc viņu „Taurētāja“ dzejnieku vidū —, bet neviena neiespiež viņa paša vārdus.',
};

export type BodyMarkup = {
  html: string;
  // Keys that do not occur in the text. They cannot be rendered under this
  // grammar (a mention sits beside the printed words), so the build reports
  // them instead of silently dropping them.
  unmatched: string[];
};

// Turn the text a post declares into markup. Escaping happens first, so the
// historical text is never treated as HTML.
//   - reconstructed words: dotted underline + the raw string as tooltip
//   - mentions: printed wording intact, handle in parentheses — parentheses
//     mean "the publisher inserted this"; the handle links to that account's
//     page (relative to `base`); the group is one unbreakable span, so a line
//     never ends on the opening „(“
//   - identified items: wavy underline + a [≈] mark beside them, so a reader
//     can tell "what the paper printed" from "what we identified it as"
//   - [?]: a word the archive does not yield and we refuse to guess
//   There is no panel any more: each mark carries its explanation in a title
//   — the post's own `warn` for a gap, the OCR string for a recon or an ident.
export function bodyHtml(
  text: string,
  post: Pick<Post, 'recon' | 'mentions' | 'ident' | 'warn'>,
  accounts: Record<string, Account>,
  gapNote: string,
  base = '',
): BodyMarkup {
  let out = escapeHtml(text);
  const unmatched: string[] = [];

  for (const [word, raw] of Object.entries(post.recon ?? {})) {
    const needle = escapeHtml(word);
    if (!out.includes(needle)) { unmatched.push(word); continue; }
    out = out.replace(needle,
      `<span class="recon" title="Atjaunots pēc bojāta OCR teksta: „${escapeHtml(raw)}“">${needle}</span>`);
  }

  for (const [printed, handle] of Object.entries(post.mentions ?? {})) {
    const needle = escapeHtml(printed);
    // Never link a profile that does not exist, and never a string that is not printed.
    if (!accounts[handle] || !out.includes(needle)) { unmatched.push(printed); continue; }
    out = out.replace(needle,
      `${needle} <span class="m">(<a class="mention" href="${escapeHtml(profilePath(handle, base))}">${escapeHtml(handle)}</a>)</span>`);
  }

  for (const i of post.ident ?? []) {
    const needle = escapeHtml(i.rendered);
    if (!out.includes(needle)) { unmatched.push(i.rendered); continue; }
    out = out.replace(needle,
      `<span class="ident" title="Vārds noteikts pēc ārēja reģistra, nevis nolasīts no avota. OCR: „${escapeHtml(i.ocr)}“">${needle}</span><span class="gap" title="Identificēts pēc ${escapeHtml(i.candidate_source)} — ${escapeHtml(i.evidence === 'glyphs' ? 'burtu atbilstība' : 'dokumentārs apliecinājums')}: ${escapeHtml(i.glyph_match)}">[≈]</span>`);
  }

  out = out.replaceAll('[?]',
    `<span class="gap" title="${escapeHtml(post.warn ?? gapNote)}">[?]</span>`);

  return { html: out, unmatched };
}

export type Trend = { topic: string; n: number };

// A trend is simply how many sourced posts carry the topic — a real number
// from the corpus, never a decorated one. Six papers on the proclamation is six.
export function trends(posts: Post[]): Trend[] {
  const counts = new Map<string, number>();
  for (const p of posts) for (const t of p.topics) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .map(([topic, n]) => ({ topic, n }))
    .sort((a, b) => b.n - a.n || a.topic.localeCompare(b.topic, 'lv'));
}

// Shipped even when every count is zero, so "no refusals" stays
// distinguishable from "the check never ran".
export function invariantLine(shown: number, refused: number, warned: number): string {
  return `${shown} ieraksti · bez avota vai ar nepareizu tipu: ${refused} · gaida pārbaudi pret skenējumu: ${warned}`;
}

// Latvian: 1, 21, 31 … take the singular, except 11 (and 111 …).
export const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'ieraksts' : 'ieraksti');

// The face of a person-account post whose words a paper rendered says so in
// language — „kā ziņo Līdums“ — instead of a classification beside the name.
// The source is read off the `via` line, whose shape for these posts is
// "Atstāstīts: <source> Nr.<n>, <date>[, <where>]". Anything else returns
// null and the face shows nothing: the fold still carries the whole line.
// One closed mapping: when <where> is the word „stenogramma“, the honest
// reporter is the stenogram, not the session it records.
export function reportedBy(via: string): string | null {
  const m = /^Atstāstīts: (.+?) Nr\.\d+, \d\d\.\d\d\.\d{4}(?:, (.+))?$/.exec(via);
  if (!m) return null;
  return m[2] === 'stenogramma' ? 'stenogramma' : m[1];
}

// In the fold the type is printed as its own word, so the `via` line drops
// the "Atstāstīts: " prefix it carries in the data rather than say it twice.
export const viaText = (via: string) => via.replace(/^Atstāstīts: /, '');

// rereading/identities.json — the researched identity line per account ("what
// this newspaper, organisation or person IS"), an ARRAY under `accounts`, not a
// handle-keyed map. Read strictly: a wrong shape, an unknown handle or a
// duplicate throws, so the build fails instead of a profile quietly losing its
// bio because a key moved. An account the file does not list yet is NOT an
// error: it is simply absent from the map, the page shows the data's own
// what/bio and names the handle in the build log — so a new account (the
// memoirists) neither breaks the build nor renders nothing until researched.
// Everything else in the file (identity_en, sources, note, confidence) is for
// us, never for the page.
export type Identity = { handle: string; identity: string | null; bio: string | null };
export function readIdentities(raw: unknown, handles: string[]): Map<string, Identity> {
  const file = 'rereading/identities.json';
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { accounts?: unknown }).accounts)) {
    throw new Error(`${file}: expected { accounts: [ … ] } — an array, not a map`);
  }
  const out = new Map<string, Identity>();
  for (const e of (raw as { accounts: unknown[] }).accounts) {
    const entry = e as Partial<Identity> | null;
    if (!entry || typeof entry.handle !== 'string') throw new Error(`${file}: an account entry has no string handle`);
    if (!(typeof entry.identity === 'string' || entry.identity === null)) throw new Error(`${file}: ${entry.handle}: identity must be a string or null`);
    if (!(typeof entry.bio === 'string' || entry.bio === null)) throw new Error(`${file}: ${entry.handle}: bio must be a string or null`);
    if (entry.identity === null && entry.bio !== null) throw new Error(`${file}: ${entry.handle}: bio without identity`);
    if (typeof entry.bio === 'string' && entry.bio.length > 280) throw new Error(`${file}: ${entry.handle}: bio is ${entry.bio.length} chars, over 280`);
    if (!handles.includes(entry.handle)) throw new Error(`${file}: ${entry.handle} is not an account in the data`);
    if (out.has(entry.handle)) throw new Error(`${file}: ${entry.handle} appears twice`);
    out.set(entry.handle, { handle: entry.handle, identity: entry.identity, bio: entry.bio ?? null });
  }
  return out;
}

// A null identity means "no encyclopedic entry", not "no information". For
// @zemes_sargi the data's own what/bio stand because they are sourced to the
// newspaper's own announcement (the only record of this unit) — and NOT to the
// Baltische Landeswehr, which took the name "Latvijas zemes sargi" on 7 December:
// a different body, so never look it up to "improve" this. For @f_brodermanis
// nothing exists anywhere, and no description is the correct outcome.
// An account not in the file yet (undefined) keeps the data's own what/bio.
export const PAPER_ON_NULL = new Set(['@zemes_sargi']);
export function descriptionLines(a: Account, ident: Identity | undefined): string[] {
  if (!ident) return [a.what, a.bio];
  if (ident.bio) return [ident.bio];
  return PAPER_ON_NULL.has(ident.handle) ? [a.what, a.bio] : [];
}

// The first sentence of a description, without its full stop — what a link
// preview and the meta description carry, where a paragraph would be truncated
// by the platform anyway. A sentence ends at a "." that closes a word of three
// or more letters, a four-digit year or a bracket / closing quote, and is
// followed by a capital, a digit or an opening quote: so "dz. 1877", "Nr. 59",
// "A. Šaņavska" and "1888. gada" never split, while "…ģimenē). 1897. gadā" and
// "1861—1922. Bretkopfa" do. Breaks when a first sentence ends in a three-letter
// abbreviation before a capital.
export const lead = (text: string) => text.split(/(?<=(?:\p{L}{3,}|\d{4}|[)“”»])\.)\s+(?=[\p{Lu}\d„])/u)[0].replace(/\.$/, '');

// Two initials for the avatar — a feed shows a face, we show letters.
export const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('');

// One hue per account, so a voice stays recognisable while scrolling: the
// reader starts to know who is speaking before reading the name. Picked by a
// stable hash of the handle, never by hand, so adding an account cannot shift
// the others. The hues themselves live in feed.css as `.avatar.h-0` … `.h-7`
// (the page's CSP forbids inline styles); tests/run.ts asserts there are
// exactly HUE_COUNT of them and that white initials read on each at ≥ 4.5:1.
export const HUE_COUNT = 8;
export function avatarHue(handle: string): number {
  let h = 0;
  // 31 is the usual string-hash multiplier; the modulus keeps h a safe integer
  // for any handle length. '' hashes to 0, which is still a valid hue.
  for (const c of handle) h = (h * 31 + c.codePointAt(0)!) % 1_000_003;
  return h % HUE_COUNT;
}
