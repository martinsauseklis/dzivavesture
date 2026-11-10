// Render the link-preview card of each day page — public/og.png for the front
// day (the 18th, whose address nothing else moves) and public/og/DD-11-1918.png
// for the others — at 1200×630.
//
//   node tools/og-days.mjs              — all four
//   node tools/og-days.mjs 19.11.1918   — one
//
// One real post of that day, shown the way the page shows it: the product in a
// single frame, not a poster about it. Which post: DAY_CARD_SEQ in feed.ts —
// the same table the page reads for og:image:alt, so card and alt cannot drift,
// and the post must be ON that day or this throws. Rendered in Chrome with the
// page's own tokens, hues and initials (the pattern of og-profiles.mjs; this
// replaced the hand-written og-card.html when the site gained days).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { avatarHue, DAY_CARD_SEQ, DAYS, dayHeading, escapeHtml, initials, renderedPosts } from '../src/lib/feed.ts';

const root = new URL('..', import.meta.url).pathname;
const data = JSON.parse(readFileSync(join(root, 'src/data/18-11-1918.json'), 'utf8'));
const css = readFileSync(join(root, 'public/feed.css'), 'utf8');
// The hues come from the stylesheet, not a copy of it.
const hues = Object.fromEntries([...css.matchAll(/\.avatar\.h-(\d+)\s*\{\s*background:(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
const { byDay } = renderedPosts(data);

const only = process.argv[2];
mkdirSync(join(root, 'public/og'), { recursive: true });
const work = join(tmpdir(), 'dzivavesture-og');
mkdirSync(work, { recursive: true });

for (const day of DAYS.filter((d) => !only || d.key === only)) {
  const post = byDay.get(day.key).find((p) => p.seq === DAY_CARD_SEQ[day.key]);
  if (!post) throw new Error(`${day.key}: seq ${DAY_CARD_SEQ[day.key]} is not on this day`);
  const a = data.accounts[post.handle];
  const doc = `<!doctype html><meta charset="utf-8"><style>
  :root { --bg:#ffffff; --ink:#15181c; --soft:#5d646c; --line:#e5e7ea; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1200px; height:630px; background:var(--bg); color:var(--ink); padding:44px 80px 0;
         font-family:system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; display:flex; flex-direction:column; }
  /* 1200 px shrinks to 360 px in a phone's share sheet, a factor of 3.33 — so
     40 px here is 12 px there, the smallest size still readable; the quote at
     58 px is 17 px there, the size of the page's own text. */
  .top { display:flex; justify-content:space-between; align-items:baseline; font-size:34px; color:var(--soft);
         padding-bottom:20px; border-bottom:2px solid var(--line); }
  .top b { color:var(--ink); font-weight:600; }
  .who { display:flex; gap:22px; align-items:center; margin-top:26px; }
  .avatar { width:84px; height:84px; border-radius:${a.kind === 'person' ? '50%' : '20px'}; background:${hues[avatarHue(post.handle)]};
            color:#fff; font-weight:600; font-size:32px; display:grid; place-items:center; flex:none; }
  .name { font-size:40px; font-weight:600; line-height:1.15; }
  .line { font-size:30px; color:var(--soft); margin-top:4px; }
  /* Room under the name block is ~380 px: five lines at 58 px × 1.25. A longer post is cut with an ellipsis — it is a preview. */
  .lv { font-size:58px; line-height:1.25; margin-top:40px; letter-spacing:-.01em;
        display:-webkit-box; -webkit-line-clamp:5; -webkit-box-orient:vertical; overflow:hidden; }
  </style>
  <div class="top"><b>dzīvā vēsture</b><span>${escapeHtml(dayHeading(day))} · Rīga</span></div>
  <div class="who"><span class="avatar">${escapeHtml(initials(a.name))}</span>
    <div><div class="name">${escapeHtml(a.name)}</div><div class="line">${escapeHtml(post.handle)} · ${post.at}</div></div></div>
  <p class="lv">${escapeHtml(post.lv)}</p>`;
  const file = join(work, `day-${day.key}.html`);
  writeFileSync(file, doc);
  const out = join(root, 'public', day.path ? `og/${day.path.slice(0, -1)}.png` : 'og.png');
  // --virtual-time-budget lets layout settle before the shot.
  execFileSync('google-chrome', ['--headless', '--disable-gpu', '--no-sandbox', `--screenshot=${out}`,
    '--window-size=1200,630', '--force-device-scale-factor=1', '--hide-scrollbars', '--virtual-time-budget=2000', `file://${file}`],
    { stdio: 'ignore' });
  const raw = readFileSync(out);
  const [w, h] = [raw.readUInt32BE(16), raw.readUInt32BE(20)]; // PNG IHDR
  if (w !== 1200 || h !== 630) throw new Error(`${day.key}: wrong size ${w}x${h}`);
  console.log(`${day.key}  seq ${String(post.seq).padEnd(4)} ${(raw.length / 1024).toFixed(0).padStart(3)} KB  ${out.replace(root, '')}`);
}
