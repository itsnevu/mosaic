import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";

/**
 * Markdown-backed pages — docs, blog posts, the whitepaper.
 *
 * Content lives as plain files under `content/` (and, for the security notes, under `docs/`)
 * so that the words are reviewable in a diff rather than buried in JSX. Everything here runs
 * on the server at build time; nothing reaches the browser but rendered HTML.
 */

const ROOT = process.cwd();

export type Frontmatter = {
  title: string;
  summary?: string;
  date?: string;
  order?: number;
  /** Shown under the title, e.g. "8 min read". Derived when absent. */
  readingTime?: string;
};

export type Doc = Frontmatter & {
  slug: string;
  html: string;
  headings: Heading[];
};

export type Heading = { id: string; text: string; level: number };

/**
 * Minimal frontmatter reader: a leading `---` block of `key: value` lines.
 * Deliberately not a YAML parser — the content is ours, and the grammar it needs is this small.
 */
function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  if (!raw.startsWith("---")) return { data: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: raw };
  const block = raw.slice(3, end);
  const body = raw.slice(end + 4).replace(/^\r?\n/, "");
  const data: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    if (!key) continue;
    data[key] = line
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return { data, body };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** ~220 wpm, rounded up — close enough to be useful and honest about being an estimate. */
function readingTime(body: string): string {
  const words = body.trim().split(/\s+/).length;
  return `${Math.max(1, Math.ceil(words / 220))} min read`;
}

/**
 * Render markdown, giving every heading a stable id so the table of contents can link to it.
 * The content is authored in this repository, so raw HTML in it is trusted by construction.
 */
function render(body: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const used = new Set<string>();

  const renderer = new marked.Renderer();
  renderer.heading = function ({ tokens, depth }) {
    const text = this.parser.parseInline(tokens);
    const plain = text.replace(/<[^>]+>/g, "");
    let id = slugify(plain);
    if (!id) id = `section-${headings.length + 1}`;
    // ids must be unique for anchors to work; repeats get a suffix
    let unique = id;
    let n = 2;
    while (used.has(unique)) unique = `${id}-${n++}`;
    used.add(unique);
    if (depth <= 3) headings.push({ id: unique, text: plain, level: depth });
    return `<h${depth} id="${unique}">${text}</h${depth}>\n`;
  };

  const html = marked.parse(body, { renderer, async: false, gfm: true }) as string;
  return { html, headings };
}

function readDoc(file: string, slug: string): Doc {
  const raw = fs.readFileSync(file, "utf8");
  const { data, body } = parseFrontmatter(raw);
  const { html, headings } = render(body);
  return {
    slug,
    title: data.title ?? slug,
    summary: data.summary,
    date: data.date,
    order: data.order ? Number(data.order) : undefined,
    readingTime: data.readingTime ?? readingTime(body),
    html,
    headings,
  };
}

function listDir(dir: string): string[] {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

/** Strips a leading `01-` ordering prefix from a filename. */
function slugOf(file: string): string {
  return file.replace(/\.md$/, "").replace(/^\d+-/, "");
}

export function getDocs(): Doc[] {
  const pages = listDir("content/docs").map((f, i) => {
    const d = readDoc(path.join(ROOT, "content/docs", f), slugOf(f));
    return { ...d, order: d.order ?? i };
  });
  // The security page is the engineering notes themselves, not a retelling of them, so the
  // auditors and the site can never drift apart.
  const security = readDoc(path.join(ROOT, "docs/SECURITY.md"), "security");
  pages.push({
    ...security,
    title: "Security",
    summary: "Trust model, invariants, deliberate design choices, known gaps and the deployment checklist.",
    order: 99,
  });
  return pages.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function getDoc(slug: string): Doc | undefined {
  return getDocs().find((d) => d.slug === slug);
}

export function getPosts(): Doc[] {
  return listDir("content/blog")
    .map((f) => readDoc(path.join(ROOT, "content/blog", f), slugOf(f)))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

export function getPost(slug: string): Doc | undefined {
  return getPosts().find((p) => p.slug === slug);
}

export function getWhitepaper(): Doc {
  return readDoc(path.join(ROOT, "content/whitepaper.md"), "whitepaper");
}

export function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export function getChangelog(): Doc {
  return readDoc(path.join(ROOT, "content/changelog.md"), "changelog");
}
