# Kongxin Wang Personal Website

Static bilingual personal website for Kongxin Wang, deployed through GitHub Pages with the custom domain <https://kongxinwang.com>.

## Content and design principles

- Chinese characters use a Songti-first local font stack; English and numerals use Times New Roman first, with safe system fallbacks.
- English and Chinese are parallel, but translations are edited for meaning rather than mechanically mirrored word by word.
- Only public, confirmed professional responsibilities and outcomes belong in the website. Do not add internal commercial data, account information, store identities, SKU-level data, inventory, sales figures, rankings, enforcement outcomes, passwords, tokens or API keys.
- The résumé PDF assets are kept at `assets/cv/Kongxin_Wang_Resume_EN.pdf` and `assets/cv/Kongxin_Wang_Resume_ZH.pdf`; `Kongxin_Wang_Resume.pdf` is maintained as a compatibility copy of the current English résumé.
- The site deliberately contains no analytics script, cookie banner or third-party tracking pixel.

## Discoverability and sharing

- `robots.txt` permits public crawling and declares the canonical sitemap.
- `sitemap.xml` lists the five canonical public pages.
- The homepage carries minimal `Person` JSON-LD: public name, public profile links, university, website image and professional topics only.
- Every public page uses the dedicated `assets/og-kongxin-wang.jpg` social preview image (1200 × 630) with Open Graph and Twitter image metadata.
- The PDF templates and the reproducible sharing-image script are kept in `tools/p2/`; they contain only information already approved for publication.

## Local preview

```bash
python3 -m http.server 4173
```

Then open <http://127.0.0.1:4173>.

## Publishing workflow

1. Create a feature branch from current `main`.
2. Validate HTML structure, JavaScript syntax, internal assets, desktop/mobile layouts and bilingual toggle locally.
3. Commit the reviewed change; push and merge only after checks pass.
4. Verify the published `https://kongxinwang.com` pages, canonical URLs and key assets after GitHub Pages deployment.
