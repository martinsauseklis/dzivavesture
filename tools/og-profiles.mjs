// Render one link-preview card per account to public/og/@handle.png (1200×630).
//
//   node tools/og-profiles.mjs            — all 30
//   node tools/og-profiles.mjs @k_ulmanis — one
//
// Same idea as tools/og-card.sh: the card is HTML rendered in Chrome, so it
// uses the very same tokens, hues and initials as the page and cannot drift.
// Each card says who this is and that it is 18 November 1918 — a profile link
// shared on its own must be comprehensible from the preview alone.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { avatarHue, descriptionLines, escapeHtml, initials, plural, readIdentities, refusalReason } from '../src/lib/feed.ts';

const root = new URL('..', import.meta.url).pathname;
const data = JSON.parse(readFileSync(join(root, 'src/data/18-11-1918.json'), 'utf8'));
const css = readFileSync(join(root, 'public/feed.css'), 'utf8');
// The hues come from the stylesheet, not a copy of it.
const hues = Object.fromEntries([...css.matchAll(/\.avatar\.h-(\d+)\s*\{\s*background:(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
const posts = data.posts.filter((p) => !refusalReason(p, data.accounts[p.handle]));
// The same description the page renders, read with the same strict check.
const identities = readIdentities(JSON.parse(readFileSync(join(root, 'rereading/identities.json'), 'utf8')), Object.keys(data.accounts));

const only = process.argv[2];
const handles = Object.keys(data.accounts).filter((h) => !only || h === only);
mkdirSync(join(root, 'public/og'), { recursive: true });
const work = join(tmpdir(), 'dzivavesture-og');
mkdirSync(work, { recursive: true });

for (const handle of handles) {
  const a = data.accounts[handle];
  const n = posts.filter((p) => p.handle === handle).length;
  const square = a.kind !== 'person';
  const lines = descriptionLines(a, identities.get(handle));
  // Room under the name block is ~270 px: 6 lines at 32 px × 1.35. A single
  // identity paragraph gets 5; with a `what` line above it (49 px + margins) 3.
  const clamp = lines.length > 1 ? 3 : 5;
  const doc = `<!doctype html><meta charset="utf-8"><style>
  :root { --bg:#ffffff; --ink:#15181c; --soft:#5d646c; --line:#e5e7ea; --accent:#b01f2e; --panel:#f4f5f7; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1200px; height:630px; background:var(--bg); color:var(--ink); padding:44px 80px 0;
         font-family:system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; display:flex; flex-direction:column; }
  /* 1200 px shrinks to 360 px in a share sheet (÷3.33): 40 px here is 12 px there. */
  .top { display:flex; justify-content:space-between; align-items:baseline; font-size:34px; color:var(--soft);
         padding-bottom:20px; border-bottom:2px solid var(--line); }
  .top b { color:var(--ink); font-weight:600; }
  .who { display:flex; gap:28px; align-items:center; margin-top:40px; }
  .avatar { width:120px; height:120px; border-radius:${square ? '28px' : '50%'}; background:${hues[avatarHue(handle)]};
            color:#fff; font-weight:600; font-size:44px; display:grid; place-items:center; flex:none; }
  .name { font-size:60px; font-weight:600; line-height:1.1; letter-spacing:-.01em; }
  .handle { font-size:36px; color:var(--soft); margin-top:6px; }
  .what { font-size:38px; line-height:1.3; margin-top:34px; color:var(--ink); }
  .bio { font-size:32px; line-height:1.35; margin-top:16px; color:var(--soft);
         display:-webkit-box; -webkit-line-clamp:${clamp}; -webkit-box-orient:vertical; overflow:hidden; }
  .n { margin-top:auto; padding:18px 0 28px; font-size:30px; color:var(--soft); border-top:2px solid var(--line); }
  </style>
  <div class="top"><b>dzīvā vēsture</b><span>Pirmdiena, 18. novembris 1918 · Rīga</span></div>
  <div class="who"><span class="avatar">${escapeHtml(initials(a.name))}</span>
    <div><div class="name">${escapeHtml(a.name)}</div><div class="handle">${escapeHtml(handle)}</div></div></div>
  ${lines.map((line, i) => `<p class="${i === 0 && lines.length > 1 ? 'what' : 'bio'}">${escapeHtml(line)}</p>`).join('\n  ')}
  <div class="n">${n ? `${n} ${plural(n)} tās dienas Rīgas avīzēs` : 'Tajā dienā neko nesaka — avīzes min'}</div>`;
  const file = join(work, `${handle}.html`);
  writeFileSync(file, doc);
  const out = join(root, 'public/og', `${handle}.png`);
  // --virtual-time-budget lets layout settle before the shot.
  execFileSync('google-chrome', ['--headless', '--disable-gpu', '--no-sandbox', `--screenshot=${out}`,
    '--window-size=1200,630', '--force-device-scale-factor=1', '--hide-scrollbars', '--virtual-time-budget=2000', `file://${file}`],
    { stdio: 'ignore' });
  const raw = readFileSync(out);
  const [w, h] = [raw.readUInt32BE(16), raw.readUInt32BE(20)]; // PNG IHDR
  if (w !== 1200 || h !== 630) throw new Error(`${handle}: wrong size ${w}x${h}`);
  console.log(`${handle.padEnd(22)} ${(raw.length / 1024).toFixed(0).padStart(3)} KB`);
}
