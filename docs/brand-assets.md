# Three-person brand assets

The logo now follows the supplied three-person crest: a raised center person,
two supporting people, and symmetric rising ribbons. The supplied source is preserved as `docs/brand-mark-reference.png`. It has a
black background and gray gradients. For interface use, the mark is drawn with
solid shapes so it stays crisp at header and favicon sizes.

`scripts/build-brand.mjs` produces the variants from the same three-person motif:

| Asset                                                                              | Use                            |
| ---------------------------------------------------------------------------------- | ------------------------------ |
| `public/brand/ilead-wordmark-ink.svg`                                              | Header on light surfaces       |
| `public/brand/ilead-wordmark-white.svg`                                            | Header on dark surfaces        |
| `public/brand/ilead-mark-ink.svg`, `ilead-mark-white.svg`, `ilead-symbol-cyan.svg` | Standalone mark variants       |
| `src/app/icon.svg`, `src/app/favicon.ico`                                          | Browser tab and bookmark icons |
| `public/brand/push-192.png`, `push-512.png`                                        | Installable app and push icons |

The browser icon uses a simplified, larger silhouette on the approved cyan
color. Its `.ico` file includes 16, 32 and 48px sizes; the SVG is used by
modern browsers. Larger install and push icons retain the full crest.

The shared `Brand` component switches wordmarks with the site's theme. Next.js
serves the tab icon through its file conventions. The manifest and push worker
point to the two push PNGs. Rebuild the assets with `node scripts/build-brand.mjs`
after editing the motif or tab variant.
