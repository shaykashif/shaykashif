// Turns a Markdown draft into a finished article page, and (unless told not
// to) adds it to the Writing list on the homepage and to sitemap.xml.
//
//   npm run article -- ../drafts/my-essay.md
//   npm run article -- ../drafts/my-essay.md --no-register   (page only)
//
// Front matter: title, description, date, kind, image, image_alt, caption,
// and optionally slug, byline, subtitle_style (italic), subtitle_2 (a second,
// upright subtitle line), og_image (a wide ~1200x630 crop for link previews).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import sup from "markdown-it-sup";
import attrs from "markdown-it-attrs";
import anchor from "markdown-it-anchor";
import { imageSize } from "image-size";
import YAML from "yaml";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://shaykas.com";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const slugify = (s) =>
  s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function imageDims(src, warnings) {
  if (!src || /^https?:/.test(src)) return null;
  const file = path.join(ROOT, decodeURI(src.split(/[?#]/)[0]).replace(/^\//, ""));
  try {
    const { width, height } = imageSize(fs.readFileSync(file));
    return { width, height };
  } catch {
    warnings.push(`image not found: ${src}`);
    return null;
  }
}

function makeMarkdown() {
  const md = new MarkdownIt({ html: true, typographer: true })
    .use(attrs)
    .use(anchor, { level: [2, 3] })
    .use(sup)
    .use(footnote);

  // Footnotes render in the site's existing style: <sup>N</sup> in the text,
  // a "Footnotes" block at the end. data-fn marks the refs footnotes.js hovers.
  const r = md.renderer.rules;
  r.footnote_ref = (t, i) => `<sup data-fn>${t[i].meta.id + 1}</sup>`;
  r.footnote_block_open = () => '<div class="footnotes">\n<div class="footnotes-title">Footnotes</div>\n';
  r.footnote_block_close = () => "</div>\n";
  r.footnote_open = (t, i) => `<p class="footnote"><sup>${t[i].meta.id + 1}</sup> `;
  r.footnote_close = () => "</p>\n";
  r.footnote_anchor = () => "";

  md.core.ruler.push("footnote_paragraphs", (state) => {
    let inside = false;
    for (const tk of state.tokens) {
      if (tk.type === "footnote_open") inside = true;
      else if (tk.type === "footnote_close") inside = false;
      else if (inside && (tk.type === "paragraph_open" || tk.type === "paragraph_close")) tk.hidden = true;
    }
  });

  md.core.ruler.push("article_structure", (state) => {
    const t = state.tokens;

    // Blockquotes at the very top are epigraphs; any later one is a pull quote.
    const closeOf = (open) => {
      let depth = 0;
      for (let j = open; j < t.length; j++) {
        if (t[j].type === "blockquote_open") depth++;
        if (t[j].type === "blockquote_close" && --depth === 0) return j;
      }
      return t.length - 1;
    };
    let i = 0;
    while (i < t.length && t[i].type === "blockquote_open") {
      const j = closeOf(i);
      t[i].hidden = t[j].hidden = true;
      for (let k = i + 1; k < j; k++) if (t[k].type === "paragraph_open") t[k].attrJoin("class", "article-epigraph");
      i = j + 1;
    }
    for (; i < t.length; i++) if (t[i].type === "blockquote_open") t[i].attrJoin("class", "pull-quote");

    // A paragraph that is an image, optionally followed by an *italic line*,
    // becomes a <figure> with a caption.
    for (let k = 0; k < t.length - 2; k++) {
      if (t[k].type !== "paragraph_open" || t[k + 1].type !== "inline") continue;
      const kids = t[k + 1].children;
      if (!kids.length || kids[0].type !== "image") continue;
      let rest = kids.slice(1);
      while (rest.length && (rest[0].type === "softbreak" || rest[0].type === "hardbreak")) rest = rest.slice(1);
      const isCaption =
        rest.length > 2 &&
        rest[0].type === "em_open" &&
        rest[rest.length - 1].type === "em_close" &&
        rest.filter((x) => x.type === "em_open").length === 1;
      if (rest.length && !isCaption) continue;

      const img = kids[0];
      const cls = img.attrGet("class");
      img.attrs = img.attrs.filter((a) => a[0] !== "class");
      t[k].tag = t[k + 2].tag = "figure";
      if (cls) t[k].attrJoin("class", cls);

      const html = (content) => {
        const tk = new state.Token("html_inline", "", 0);
        tk.content = content;
        return tk;
      };
      t[k + 1].children = isCaption
        ? [img, html("<figcaption>"), ...rest.slice(1, -1), html("</figcaption>")]
        : [img];
    }
  });

  r.image = (t, i, options, env) => {
    const tk = t[i];
    const src = tk.attrGet("src");
    const alt = md.renderer.renderInlineAsText(tk.children, options, env);
    const d = imageDims(src, env.warnings);
    return `<img src="${esc(src)}"${d ? ` width="${d.width}" height="${d.height}"` : ""} alt="${esc(alt)}" loading="lazy" decoding="async" />`;
  };

  const linkOpen = r.link_open || ((t, i, o, e, self) => self.renderToken(t, i, o));
  r.link_open = (t, i, o, e, self) => {
    if (/^https?:/.test(t[i].attrGet("href") || "")) {
      t[i].attrSet("target", "_blank");
      t[i].attrSet("rel", "noopener");
    }
    return linkOpen(t, i, o, e, self);
  };

  return md;
}

function parseDraft(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) throw new Error("No front matter: the file must start with a --- block.");
  const fm = YAML.parse(m[1]) || {};
  for (const key of ["title", "description", "date"]) {
    if (fm[key] == null || fm[key] === "") throw new Error(`Front matter is missing "${key}".`);
  }
  return { fm, body: text.slice(m[0].length) };
}

function pageHtml({ fm, slug, body, hasFootnotes, hero, cssVersion }) {
  const title = esc(fm.title);
  const desc = esc(fm.description);
  const url = `${SITE}/article-${slug}`;
  const social = fm.og_image || fm.image;
  const image = social ? `${SITE}/${String(social).replace(/^\//, "")}` : `${SITE}/Headshot/Headshot.jpg`;
  const ld = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: fm.title,
    description: fm.description,
    image,
    author: {
      "@type": "Person",
      "@id": `${SITE}/#person`,
      name: "Shay Kashif",
      alternateName: "Shayaan Kashif",
      url: `${SITE}/`,
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: String(fm.date),
    inLanguage: "en",
  }).replace(/</g, "\\u003c");

  const italic = String(fm.subtitle_style || "").toLowerCase() === "italic" ? " italic" : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${desc}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${url}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${url}" />
  <meta property="og:site_name" content="Shay Kashif" />
  <meta property="og:image" content="${image}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${desc}" />
  <meta name="twitter:image" content="${image}" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=3" />
  <meta name="color-scheme" content="light dark" />
  <meta name="theme-color" content="#f6f2e6" />
  <script>try{var t=localStorage.getItem("theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t;if(t==="dark")document.querySelector('meta[name="theme-color"]').content="#151412"}catch(e){}</script>
  <link rel="preload" href="/fonts/aktiv-grotesk-regular.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="/fonts/aktiv-grotesk-semibold.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="/site.css?v=${cssVersion}" />
  <script type="speculationrules">{"prefetch":[{"where":{"and":[{"href_matches":"/*"},{"not":{"href_matches":"/*.webp"}}]},"eagerness":"moderate"}]}</script>
  <script type="application/ld+json">${ld}</script>
</head>
<body>
  <main>
    <header class="top">
      <a href="/">&larr; Shay Kashif</a>
    </header>

${hero.banner}
    <div class="article-meta">
      <p class="article-pub">${esc(fm.kind || "Essay")}</p>
      <h1 class="article-title">${title}</h1>
      <p class="subtitle${italic}">${desc}</p>
${fm.subtitle_2 ? `      <p class="subtitle">${esc(fm.subtitle_2)}</p>
` : ""}      <p class="article-byline">${esc(fm.byline || "Shay Kashif")}</p>
    </div>

    <article class="article-body">
${hero.portrait}${body}
    </article>
  </main>
  <script src="/chrome.js" defer></script>
${hasFootnotes ? '  <script src="/footnotes.js" defer></script>\n' : ""}</body>
</html>
`;
}

function heroHtml(fm, warnings) {
  const none = { banner: "", portrait: "" };
  if (!fm.image) return none;
  const src = "/" + String(fm.image).replace(/^\//, "");
  const d = imageDims(src, warnings);
  const alt = esc(fm.image_alt || fm.title);
  const caption = fm.caption ? esc(fm.caption) : "";
  const dims = d ? ` width="${d.width}" height="${d.height}"` : "";

  // Tall photos get the narrow centered treatment used on In the Alpine; wide
  // ones become the full-width banner.
  if (d && d.height > d.width * 1.05) {
    return {
      banner: "",
      portrait:
        `    <figure class="narrow">\n      <img src="${src}"${dims} alt="${alt}" fetchpriority="high" />\n` +
        (caption ? `      <figcaption>${caption}</figcaption>\n` : "") +
        `    </figure>\n\n`,
    };
  }
  return {
    portrait: "",
    banner:
      `    <figure class="article-hero">\n      <img src="${src}"${dims} alt="${alt}" fetchpriority="high" />\n` +
      (caption ? `      <figcaption class="hero-caption">${caption}</figcaption>\n` : "") +
      `    </figure>\n\n`,
  };
}

const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function register({ fm, slug }) {
  const done = [];
  const href = `/article-${slug}`;

  const indexFile = path.join(ROOT, "index.html");
  let index = fs.readFileSync(indexFile, "utf8");
  if (index.includes(`href="${href}"`)) {
    done.push("index.html: already listed");
  } else {
    const eol = index.includes("\r\n") ? "\r\n" : "\n";
    const li = `      <li><a href="${href}"><span class="t">${esc(fm.title)} <span class="d">${esc(fm.date)}</span></span></a></li>`;
    const re = /(<h2 class="label">Writing<\/h2>\s*<ul class="list">\r?\n)/;
    if (!re.test(index)) throw new Error('Could not find the Writing list in index.html.');
    index = index.replace(re, (m) => m + li + eol);
    fs.writeFileSync(indexFile, index);
    done.push("index.html: added to the top of Writing");
  }

  const mapFile = path.join(ROOT, "sitemap.xml");
  let map = fs.readFileSync(mapFile, "utf8");
  if (map.includes(`<loc>${SITE}${href}</loc>`)) {
    done.push("sitemap.xml: already listed");
  } else {
    const eol = map.includes("\r\n") ? "\r\n" : "\n";
    const entry = [
      "  <url>",
      `    <loc>${SITE}${href}</loc>`,
      `    <lastmod>${today()}</lastmod>`,
      "    <changefreq>monthly</changefreq>",
      "    <priority>0.8</priority>",
      "  </url>",
    ].join(eol);
    map = map.replace(/\s*<\/urlset>/, `${eol}${entry}${eol}${eol}</urlset>`);
    fs.writeFileSync(mapFile, map);
    done.push("sitemap.xml: added");
  }
  return done;
}

export function build(draftPath, { register: doRegister = true } = {}) {
  const { fm, body } = parseDraft(fs.readFileSync(draftPath, "utf8"));
  const slug = fm.slug ? slugify(String(fm.slug)) : slugify(String(fm.title));
  const warnings = [];

  const md = makeMarkdown();
  const bodyHtml = md
    .render(body, { warnings })
    .trim()
    .split("\n")
    .map((l) => (l ? "    " + l : l))
    .join("\n");
  const hasFootnotes = bodyHtml.includes('class="footnotes"');
  const hero = heroHtml(fm, warnings);

  const css = fs.statSync(path.join(ROOT, "site.css")).mtime;
  const p = (n) => String(n).padStart(2, "0");
  const cssVersion = `${css.getFullYear()}${p(css.getMonth() + 1)}${p(css.getDate())}${p(css.getHours())}${p(css.getMinutes())}`;

  const html = pageHtml({ fm, slug, body: bodyHtml, hasFootnotes, hero, cssVersion });
  const outFile = path.join(ROOT, `article-${slug}.html`);
  fs.writeFileSync(outFile, html);

  const registered = doRegister ? register({ fm, slug }) : [];
  return { outFile, slug, warnings: [...new Set(warnings)], registered };
}

// ── CLI ───────────────────────────────────────────────────────────────────
export function resolveDraft(arg) {
  const bases = [process.env.INIT_CWD, process.cwd(), ROOT].filter(Boolean);
  for (const b of bases) {
    const p = path.resolve(b, arg);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Draft not found: ${arg}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Usage: npm run article -- <draft.md> [--no-register]");
    process.exit(1);
  }
  try {
    const res = build(resolveDraft(file), { register: !args.includes("--no-register") });
    console.log(`Wrote ${path.relative(ROOT, res.outFile)}  ->  ${SITE}/article-${res.slug}`);
    res.registered.forEach((l) => console.log("  " + l));
    res.warnings.forEach((w) => console.warn("  warning: " + w));
  } catch (e) {
    console.error("Error: " + e.message);
    process.exit(1);
  }
}
