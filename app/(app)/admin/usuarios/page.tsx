"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  active: boolean;
  location_id: string | null;
  location_name: string | null;
};

type Location = { id: string; name: string };

const ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "almacenero", label: "Almacenero" },
  { value: "vendedor", label: "Vendedor" },
  { value: "cajero", label: "Cajero" },
];

export default function UsuariosPage() {
  const supabase = createClient();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "vendedor", location_id: "" });

  async function load() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/users");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error);
    } else {
      setUsers(json.users);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    supabase
      .from("locations")
      .select("id, name")
      .eq("active", true)
      .then(({ data }) => setLocations(data ?? []));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(json.error);
      return;
    }
    setForm({ email: "", password: "", full_name: "", role: "vendedor", location_id: "" });
    load();
  }

  async function updateUser(id: string, patch: Record<string, any>) {
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error);
      return;
    }
    load();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-xl font-semibold">Usuarios y roles</h1>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <form onSubmit={handleCreate} className="bg-white border rounded-xl p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
        <div className="col-span-2 md:col-span-1">
          <label className="block text-xs text-gray-500 mb-1">Correo</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Contraseña inicial</label>
          <input
            type="text"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Nombre completo</label>
          <input
            required
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Rol</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Ubicación</label>
          <select
            value={form.location_id}
            onChange={(e) => setForm({ ...form, location_id: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">— Sin asignar —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 md:col-span-5">
          <button disabled={creating} className="bg-brand text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
            {creating ? "Creando..." : "Crear usuario"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-gray-400">Cargando usuarios...</p>
      ) : (
        <table className="w-full text-sm bg-white border rounded-xl overflow-hidden">
          <thead>
            <tr className="text-left text-gray-500 border-b bg-gray-50">
              <th className="py-2 px-3">Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Ubicación</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRowItem key={u.id} user={u} locations={locations} onUpdate={(patch) => updateUser(u.id, patch)} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function UserRowItem({
  user,
  locations,
  onUpdate,
}: {
  user: UserRow;
  locations: Location[];
  onUpdate: (patch: Record<string, any>) => void;
}) {
  const [newPassword, setNewPassword] = useState("");

  return (
    <tr className="border-b last:border-0 align-top">
      <td className="py-2 px-3">{user.full_name}</td>
      <td className="text-gray-500">{user.email}</td>
      <td>
        <select value={user.role} onChange={(e) => onUpdate({ role: e.target.value })} className="border rounded px-2 py-1 text-xs">
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select
          value={user.location_id ?? ""}
          onChange={(e) => onUpdate({ location_id: e.target.value })}
          className="border rounded px-2 py-1 text-xs"
        >
          <option value="">— Sin asignar —</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <button
          onClick={() => onUpdate({ active: !user.active })}
          className={`px-2 py-0.5 rounded-full text-xs ${user.active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}
        >
          {user.active ? "Activo" : "Inactivo"}
        </button>
      </td>
      <td className="py-2 pr-3">
        <div className="flex gap-1 items-center">
          <input
            placeholder="Nueva contraseña"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="border rounded px-2 py-1 text-xs w-28"
          />
          <button
            onClick={() => {
              if (newPassword.length >= 6) {
                onUpdate({ new_password: newPassword });
                setNewPassword("");
              }
            }}
            className="text-xs text-brand underline"
          >
            Cambiar
          </button>
        </div>
      </td>
    </tr>
  );
}
