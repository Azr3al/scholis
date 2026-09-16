import { NextRequest, NextResponse } from "next/server";

import {
  buildAppleAppSiteAssociation,
  resolveUniversalLinkHost,
} from "@/config/universal-link-registry";

export function GET(request: NextRequest) {
  const cfg = resolveUniversalLinkHost(request.headers.get("host"));
  if (!cfg) {
    return new NextResponse(null, { status: 404 });
  }

  const teamId = process.env.APPLE_TEAM_ID?.trim();
  if (!teamId) {
    return new NextResponse("APPLE_TEAM_ID is not configured", {
      status: 503,
    });
  }

  const body = buildAppleAppSiteAssociation(teamId, cfg.iosBundleId);

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
