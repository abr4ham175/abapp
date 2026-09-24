import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return null;
  return user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const supabaseAdmin = createAdminClient();

  // auth.users no se puede leer con RLS normal; se usa el cliente con
  // service_role SOLO en esta ruta de servidor, nunca en el navegador.
  const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 });

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, role, active, location_id, locations(name)");
  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 });

  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  const users = authUsers.users.map((u) => {
    const p = profileById.get(u.id);
    return {
      id: u.id,
      email: u.email,
      full_name: p?.full_name ?? u.email,
      role: p?.role ?? "vendedor",
      active: p?.active ?? true,
      location_id: p?.location_id ?? null,
      location_name: p?.locations?.name ?? null,
      created_at: u.created_at,
    };
  });

  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { email, password, full_name, role, location_id } = await req.json();
  if (!email || !password || !full_name || !role) {
    return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 });
  }

  const supabaseAdmin = createAdminClient();

  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (created.error) return NextResponse.json({ error: created.error.message }, { status: 400 });

  // El trigger on_auth_user_created ya insertó la fila en profiles con rol
  // 'vendedor' por defecto; aquí la actualizamos con el rol/ubicación reales.
  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({ role, location_id: location_id || null, full_name })
    .eq("id", created.data.user.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: created.data.user.id });
}
