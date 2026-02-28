import { NextResponse } from "next/server";

export async function GET() {
  const res = NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_SUPABASE_URL || "https://coil.5am.team"));
  res.cookies.set("coil_demo", "1", { path: "/", maxAge: 60 * 60 * 24 * 30 }); // 30 days
  return res;
}
