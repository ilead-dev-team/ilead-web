# Three-person brand assets

The logo now follows the supplied three-person crest: a raised center person,
two supporting people, and symmetric rising ribbons. The supplied source is preserved as `docs/brand-mark-reference.png`. It has a
black background and gray gradients. For interface use, the mark is drawn with
solid shapes so it stays crisp at header and favicon sizes.

`scripts/build-brand.mjs` produces the variants from one SVG motif:

| Asset                                                                              | Use                            |
| ---------------------------------------------------------------------------------- | ------------------------------ |
| `public/brand/ilead-wordmark-ink.svg`                                              | Header on light surfaces       |
| `public/brand/ilead-wordmark-white.svg`                                            | Header on dark surfaces        |
| `public/brand/ilead-mark-ink.svg`, `ilead-mark-white.svg`, `ilead-symbol-cyan.svg` | Standalone mark variants       |
| `src/app/icon.svg`, `src/app/favicon.ico`                                          | Browser tab and bookmark icons |
| `public/brand/push-192.png`, `push-512.png`                                        | Installable app and push icons |

The shared `Brand` component switches wordmarks with the site's theme. Next.js
serves the app icon and favicon through its file conventions. The manifest and
push worker already point to the two push PNGs, so replacing those files keeps
all icon surfaces in step. Rebuild the assets with `node scripts/build-brand.mjs`
after editing the motif.
