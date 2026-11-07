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
  at: string;
  seq: number;
  lv: string;
  ocr: string | null;
  via: string;
  url: string;
  topics: string[];
  atNote: string;
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
  if (!posts.length || !posts.every((p) => p.type === 'atminas' && isWrittenYear(p.written))) return null;
  const years = [...new Set(posts.map((p) => p.written as number))].sort();
  return `Visi ieraksti ir atmiņas, rakstītas ${years.map((y) => `${y}.`).join(', ')} gadā`;
}

// Every source permalink must point into the archive. A bare "truthy url" check
// would let `javascript:` or a foreign host through the one guard the whole
// site rests on.
const ARCHIVE = 'https://periodika.lv/';
const isArchiveUrl = (url: unknown) => typeof url === 'string' && url.startsWith(ARCHIVE);

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
  '@erasts_bite': 'Tajā dienā viņš runāja — Operas namā nolasīja vakardienas sēdes protokolu —, bet viņa paša vārdus neviena avīze nepierakstīja. Zināms tikai, ka viņš to darīja.',
  '@h_j_seraphim': 'Viņa vārdi šodien ir Rigasche Zeitung — 11. turpinājums —, bet tie ir vēstule tēvam par janvāri. Par 18. novembri viņš nesaka nekā; avīze viņu iespiež.',
  '@w_j_locke': 'Viņa romāns „Jūras zvaigzne“ šodien turpinās Baltijas Ziņās, tulkots. Pats viņš par šo dienu Rīgā neko nav teicis.',
  '@l_laicens': 'Šodien par viņu raksta divas avīzes — Līdums recenzē „Ieslēgtos“, Baltijas Ziņas nosauc viņu „Taurētāja“ dzejnieku vidū —, bet neviena neiespiež viņa paša vārdus.',
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
      `<span class="recon" title="Rekonstruēts no bojāta OCR: „${escapeHtml(raw)}“">${needle}</span>`);
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
      `<span class="ident" title="Identificēts pēc ārēja reģistra, nevis nolasīts. OCR: „${escapeHtml(i.ocr)}“">${needle}</span><span class="gap" title="Identificēts pēc ${escapeHtml(i.candidate_source)} — ${escapeHtml(i.evidence === 'glyphs' ? 'burtu atbilstība' : 'dokumentārs apliecinājums')}: ${escapeHtml(i.glyph_match)}">[≈]</span>`);
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
