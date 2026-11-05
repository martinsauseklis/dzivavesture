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
  type: 'citats' | 'atstastits' | 'dokuments' | 'nezinamais';
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
};

export const TYPE_LABEL: Record<Post['type'], string> = {
  citats: 'citāts',
  atstastits: 'atstāstīts',
  dokuments: 'dokuments',
  nezinamais: 'nezināmais',
};

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
export function refusalReason(post: Post, account: Account | undefined): string | null {
  if (!account) return 'nezināms konts';
  if (!(post.type in TYPE_LABEL)) return 'nezināms tips';
  if (!isArchiveUrl(post.url)) return 'nav avota saites';
  if (account.kind === 'person' && post.type === 'citats') return 'personas kontam nevar būt tiešs citāts';
  for (const c of post.comments ?? []) if (!isArchiveUrl(c.url)) return 'komentārs bez avota saites';
  return null;
}

// `at` is the one timestamp format the whole feed uses: HH.MM, 24-hour.
export const isClock = (at: string) => /^([01]\d|2[0-3])\.[0-5]\d$/.test(at);

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

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
//     mean "the publisher inserted this"
//   - [?]: a button, so the gap reaches its explanation (the source fold) in one tap
export function bodyHtml(
  text: string,
  post: Pick<Post, 'recon' | 'mentions'>,
  accounts: Record<string, Account>,
  gapNote: string,
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
      `${needle} (<button type="button" class="mention" data-handle="${escapeHtml(handle)}">${escapeHtml(handle)}</button>)`);
  }

  out = out.replaceAll('[?]',
    `<button type="button" class="gap" title="${escapeHtml(gapNote)}">[?]</button>`);

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

// Two initials for the avatar — a feed shows a face, we show letters.
export const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
