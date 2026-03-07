import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { v: process.env.NEXT_PUBLIC_BUILD_VERSION || "dev" },
    {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    }
  );
}
