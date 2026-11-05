// @ts-check
import { defineConfig } from 'astro/config';

/**
 * No `site` and no `base` on purpose: the host is not decided yet. Every link
 * and asset the page references is relative, so the same `dist/` works at a
 * root, on a subdomain or under a sub-path. The one absolute origin that link
 * previews and the canonical tag need lives in src/lib/site.ts.
 *
 * Styles and scripts are plain files in public/, not run through the bundler,
 * so nothing is inlined and the Content-Security-Policy can stay `'self'`
 * with no hashes. The dev toolbar injects inline scripts that policy would
 * block, so it is off.
 */
export default defineConfig({
  output: 'static',
  devToolbar: { enabled: false },
});
