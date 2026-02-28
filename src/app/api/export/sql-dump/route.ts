import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!serviceRoleKey) {
    return NextResponse.json({ error: "Missing server configuration" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Verify the user is authenticated via the Authorization header (Bearer token)
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);

  // Verify the token and get the user
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch user's weeks
  const { data: rows, error: dbError } = await supabase
    .from("weeks")
    .select("id, user_id, week_of, data, archived, created_at, updated_at")
    .eq("user_id", user.id)
    .order("week_of");

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "No data to export" }, { status: 404 });
  }

  const esc = (s: string) => s.replace(/'/g, "''");
  const now = new Date().toISOString().slice(0, 10);

  const lines: string[] = [
    `-- COIL data dump — ${now} — ${user.email}`,
    ``,
    `CREATE TABLE IF NOT EXISTS public.weeks (`,
    `  id uuid PRIMARY KEY,`,
    `  user_id uuid NOT NULL,`,
    `  week_of date NOT NULL,`,
    `  data jsonb NOT NULL DEFAULT '{}'::jsonb,`,
    `  archived boolean NOT NULL DEFAULT false,`,
    `  created_at timestamptz NOT NULL DEFAULT now(),`,
    `  updated_at timestamptz NOT NULL DEFAULT now(),`,
    `  UNIQUE (user_id, week_of)`,
    `);`,
    ``,
  ];

  const cols = "id, user_id, week_of, data, archived, created_at, updated_at";
  const valueRows = rows.map((r) => {
    const data = JSON.stringify(r.data).replace(/'/g, "''");
    return `  ('${esc(r.id)}', '${esc(r.user_id)}', '${r.week_of}', '${data}'::jsonb, ${r.archived}, '${r.created_at}', '${r.updated_at}')`;
  });

  lines.push(`INSERT INTO public.weeks (${cols}) VALUES`);
  lines.push(valueRows.join(",\n") + ";");

  const sql = lines.join("\n");

  return new NextResponse(sql, {
    status: 200,
    headers: {
      "Content-Type": "application/sql",
      "Content-Disposition": `attachment; filename="coil-dump-${now}.sql"`,
    },
  });
}
