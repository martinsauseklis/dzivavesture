# dzīvā vēsture

18.–20. novembris 1918 as a feed — what the Rīga papers printed that week, post by post, each linking to its scan at periodika.lndb.lv. Live at https://dzivavesture.mai.lv.

```
pnpm install --frozen-lockfile
pnpm test          # astro build + the two test tables (CI runs exactly this)
pnpm dev --host    # local, over the LAN
```

`src/data/18-11-1918.json` is the corpus, `src/data/identities.json` the researched line per account. `tools/og-*.mjs` regenerate the link-preview cards in `public/og/` when the corpus changes.

The research behind the corpus — the gap re-readings, candidate sets, Latvian proofing, the source texts — lives outside this repo, in the sibling directory `../dzivavesture-research/` on the author's machine. It is the evidence trail, not part of the site.
