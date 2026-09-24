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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json();
  const supabaseAdmin = createAdminClient();

  // Un admin no puede quitarse su propio rol de admin por accidente y quedar
  // el sistema sin administrador.
  if (params.id === admin.id && body.role && body.role !== "admin") {
    return NextResponse.json({ error: "No puedes cambiar tu propio rol de administrador." }, { status: 400 });
  }

  if (body.new_password) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(params.id, { password: body.new_password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const profileUpdate: Record<string, any> = {};
  if (body.role) profileUpdate.role = body.role;
  if ("location_id" in body) profileUpdate.location_id = body.location_id || null;
  if ("active" in body) profileUpdate.active = body.active;
  if (body.full_name) profileUpdate.full_name = body.full_name;

  if (Object.keys(profileUpdate).length > 0) {
    const { error } = await supabaseAdmin.from("profiles").update(profileUpdate).eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
