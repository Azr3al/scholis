export function derivedStatus(args: {
  document: unknown;
  published_document: unknown;
}): "draft" | "published" {
  if (args.published_document == null) return "draft";
  return JSON.stringify(args.document) === JSON.stringify(args.published_document)
    ? "published"
    : "draft";
}
