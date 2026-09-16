import { NextRequest, NextResponse } from "next/server";

import {
  buildAssetLinks,
  resolveUniversalLinkHost,
} from "@/config/universal-link-registry";

export function GET(request: NextRequest) {
  const cfg = resolveUniversalLinkHost(request.headers.get("host"));
  if (!cfg) {
    return new NextResponse(null, { status: 404 });
  }

  const body = buildAssetLinks();

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
