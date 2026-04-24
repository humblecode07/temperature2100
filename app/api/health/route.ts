import { NextResponse } from "next/server";

function resolveBackendBase() {
  const value =
    process.env.SCENARIO_API_BASE ?? process.env.NEXT_PUBLIC_SCENARIO_API_BASE ?? "";
  return value.trim().replace(/\/$/, "");
}

export async function GET() {
  const backendBase = resolveBackendBase();
  if (!backendBase) {
    return NextResponse.json(
      {
        detail:
          "Scenario API base URL is not configured. Set SCENARIO_API_BASE in the frontend Vercel project.",
      },
      { status: 500 },
    );
  }

  const upstream = await fetch(`${backendBase}/health`, {
    method: "GET",
    cache: "no-store",
  });

  const body = await upstream.text();

  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}
