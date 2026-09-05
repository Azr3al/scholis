import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const JUICEBOX_ORIGIN = (
  process.env.NEXT_PUBLIC_JUICEBOX_ORIGIN || "http://localhost:8800"
).replace(/\/$/, "");

const FORWARD_REQUEST_HEADERS = [
  "authorization",
  "x-schema",
  "content-type",
  "accept",
] as const;

const FORWARD_RESPONSE_HEADERS = ["content-type", "cache-control"] as const;

async function proxyToJuiceBox(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const targetUrl = `${JUICEBOX_ORIGIN}/attachments/${path.join("/")}${request.nextUrl.search}`;

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  let response: Response;
  try {
    response = await fetch(targetUrl, init);
  } catch {
    return NextResponse.json(
      { error: "Juice Box service unavailable" },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = response.headers.get(name);
    if (value) {
      responseHeaders.set(name, value);
    }
  }

  return new NextResponse(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

export const GET = proxyToJuiceBox;
export const POST = proxyToJuiceBox;
export const PUT = proxyToJuiceBox;
export const PATCH = proxyToJuiceBox;
export const DELETE = proxyToJuiceBox;
export const HEAD = proxyToJuiceBox;
