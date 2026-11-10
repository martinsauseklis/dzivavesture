// The only place the deployment host is written. Change it here when the domain
// is decided; nothing else in the build depends on it. It feeds exactly two
// things that cannot be relative — the canonical URL and the link-preview
// (og:*) tags, which crawlers fetch without a page to resolve against.
export const ORIGIN = 'https://dzivavesture.mai.lv';

// GoatCounter site code (the part before .goatcounter.com). Empty means no
// analytics script is emitted at all — the page then makes zero third-party
// requests. GoatCounter was chosen because it sets no cookies and keeps no
// personal data, so there is nothing to ask consent for.
export const GOATCOUNTER_CODE = 'dzivavesture';
