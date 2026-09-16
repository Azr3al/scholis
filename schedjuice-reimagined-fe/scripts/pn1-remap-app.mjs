#!/usr/bin/env node
/**
 * PN1 mechanical remapper for src/app/** — ui + lucide → primitives / _chrome / iconoir.
 * Run from FE worktree root: node scripts/pn1-remap-app.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("src/app");

const LUCIDE_TO_ICONOIR = {
  Loader2: "Refresh",
  RefreshCw: "Refresh",
  Terminal: "Terminal",
  Wrench: "Wrench",
  Play: "Play",
  KeyRound: "Key",
  FileStack: "Page",
  ExternalLink: "OpenNewWindow",
  Copy: "Copy",
  ChevronRight: "NavArrowRight",
  ChevronDown: "NavArrowDown",
  Check: "Check",
  Bug: "Bug",
  ArrowLeft: "ArrowLeft",
  AlertTriangle: "WarningTriangle",
  Activity: "Activity",
};

const SIMPLE_IMPORT_MAP = {
  "@/components/ui/button": "@/components/primitives",
  "@/components/ui/input": "@/components/primitives",
  "@/components/ui/textarea": "@/components/primitives",
  "@/components/ui/checkbox": "@/components/primitives",
  "@/components/ui/skeleton": "@/components/primitives",
  "@/components/ui/use-toast": "@/components/primitives",
  "@/components/ui/toaster": "@/components/primitives",
  "@/components/ui/tooltip": "@/components/primitives",
  "@/components/ui/radio-group": "@/components/primitives",
  "@/components/ui/card": "@/app/_chrome/card",
  "@/components/ui/badge": "@/app/_chrome/badge",
  "@/components/ui/table": "@/app/_chrome/table",
  "@/components/ui/chart": "@/app/_chrome/chart",
  "@/components/ui/date-picker": "@/app/_chrome/date-picker",
  "@/components/ui/date-time-picker": "@/app/_chrome/date-time-picker",
  "@/components/ui/checkin-controls": "@/app/_chrome/checkin-controls",
  "@/components/ui/form": "@/app/_chrome/form",
  "@/components/ui/label": "@/app/_chrome/label",
  "@/components/ui/scroll-area": "@/app/_chrome/scroll-area",
  "@/components/ui/toggle-group": "@/app/_chrome/toggle-group",
};

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|jsx|js)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function rewriteLucideImport(src) {
  return src.replace(
    /import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']\s*;?/g,
    (_m, names) => {
      const parts = names.split(",").map((s) => s.trim()).filter(Boolean);
      const mapped = parts.map((p) => {
        const [orig, alias] = p.split(/\s+as\s+/).map((x) => x.trim());
        const target = LUCIDE_TO_ICONOIR[orig];
        if (!target) {
          console.warn(`  WARN: no iconoir map for ${orig}`);
          return null;
        }
        if (alias) return `${target} as ${alias}`;
        if (target !== orig) return `${target} as ${orig}`;
        return target;
      });
      const ok = mapped.filter(Boolean);
      if (!ok.length) return "";
      return `import { ${ok.join(", ")} } from "iconoir-react";`;
    },
  );
}

function rewriteToastUsage(src) {
  // const { toast } = useToast(); → const toast = useToast();
  let out = src.replace(
    /const\s*\{\s*toast\s*\}\s*=\s*useToast\(\)/g,
    "const toast = useToast()",
  );
  // toast({ ... }) → toast.add({ ... }) when not already toast.add
  // Avoid double-wrapping toast.add
  out = out.replace(
    /(?<![\w.])toast\(\s*\{/g,
    "toast.add({",
  );
  // Drop variant: "destructive" inside toast.add (primitive has no variant)
  out = out.replace(
    /toast\.add\(\{\s*variant:\s*["']destructive["']\s*,?/g,
    "toast.add({",
  );
  out = out.replace(
    /,\s*variant:\s*["']destructive["']/g,
    "",
  );
  return out;
}

function rewriteButtonVariants(src) {
  let out = src;
  // Only rewrite buttonVariants({ ... }) and <Button variant=...> — not Badge
  out = out.replace(
    /buttonVariants\(\s*\{\s*([^}]*)\}\s*\)/g,
    (_m, inner) => {
      const next = inner
        .replace(/variant:\s*["']default["']/, 'variant: "primary"')
        .replace(/variant:\s*["']destructive["']/, 'variant: "danger"')
        .replace(/variant:\s*["']outline["']/, 'variant: "secondary"');
      return `buttonVariants({ ${next} })`;
    },
  );
  out = out.replace(
    /<Button([^>]*)\bvariant=["']default["']/g,
    '<Button$1variant="primary"',
  );
  out = out.replace(
    /<Button([^>]*)\bvariant=["']destructive["']/g,
    '<Button$1variant="danger"',
  );
  out = out.replace(
    /<Button([^>]*)\bvariant=["']outline["']/g,
    '<Button$1variant="secondary"',
  );
  return out;
}

function rewriteToasterImport(src) {
  // Toaster → ToastProvider
  return src
    .replace(
      /import\s*\{\s*Toaster\s*\}\s*from\s*["']@\/components\/primitives["']/,
      'import { ToastProvider } from "@/components/primitives"',
    )
    .replace(/<Toaster\s*\/?>/g, "<ToastProvider />")
    .replace(/<\/Toaster>/g, "");
}

function rewriteRadioGroup(src) {
  // RadioGroupItem → Radio (primitives)
  let out = src.replace(/\bRadioGroupItem\b/g, "Radio");
  // Fix import if it still says RadioGroupItem
  out = out.replace(
    /import\s*\{([^}]+)\}\s*from\s*["']@\/components\/primitives["']/g,
    (m, names) => {
      if (!names.includes("Radio") && !names.includes("RadioGroup")) return m;
      const parts = names
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((p) => (p === "RadioGroupItem" ? "Radio" : p));
      const uniq = [...new Set(parts)];
      return `import { ${uniq.join(", ")} } from "@/components/primitives"`;
    },
  );
  return out;
}

function rewriteImports(src) {
  let out = src;
  for (const [from, to] of Object.entries(SIMPLE_IMPORT_MAP)) {
    out = out.split(from).join(to);
  }
  // Toaster named import from toaster path already remapped to primitives
  out = rewriteToasterImport(out);
  return out;
}

function processFile(file) {
  const rel = path.relative(process.cwd(), file);
  let src = fs.readFileSync(file, "utf8");
  const before = src;

  src = rewriteImports(src);
  src = rewriteLucideImport(src);
  src = rewriteToastUsage(src);
  src = rewriteButtonVariants(src);
  src = rewriteRadioGroup(src);

  // TooltipProvider props: drop radix-only props
  src = src.replace(
    /<TooltipProvider([^>]*)>/g,
    (_m, attrs) => {
      let a = attrs
        .replace(/\s*disableHoverableContent\b/g, "")
        .replace(/\s*delayDuration=\{(\d+)\}/g, " delay={$1}")
        .replace(/\s*skipDelayDuration=\{[^}]+\}/g, "");
      return `<TooltipProvider${a}>`;
    },
  );

  if (src !== before) {
    fs.writeFileSync(file, src);
    return true;
  }
  return false;
}

const files = walk(ROOT);
let changed = 0;
for (const f of files) {
  if (processFile(f)) {
    changed++;
    console.log("updated", path.relative(process.cwd(), f));
  }
}
console.log(`\nDone. ${changed}/${files.length} files changed.`);
