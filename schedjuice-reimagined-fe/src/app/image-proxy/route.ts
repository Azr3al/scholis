import { NextRequest, NextResponse } from "next/server";
import { isAllowedImageUrl } from "@/lib/id-card/image-proxy";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Invalid protocol" }, { status: 400 });
  }

  if (!isAllowedImageUrl(parsed.href)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(parsed.href);
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: "Upstream fetch failed" },
      { status: response.status },
    );
  }

  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  headers.set("cache-control", "public, max-age=3600");

  return new NextResponse(response.body, {
    status: 200,
    headers,
  });
}
