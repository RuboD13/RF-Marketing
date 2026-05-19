import { useState } from 'react';
import { Plus, Edit3, Trash2, UserCog } from 'lucide-react';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../../api/users';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Spinner } from '../ui/Spinner';
import { Badge } from '../ui/Badge';
import { ROLE_LABELS } from '../../lib/constants';
import type { User, UserRole } from '../../types';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrador' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'demo', label: 'Demo' },
  { value: 'onboarding', label: 'Onboarding' },
];

const ROLE_COLORS: Record<UserRole, string> = {
  admin: '#7c3aed',
  comercial: '#3b82f6',
  demo: '#10b981',
  onboarding: '#dcfc03',
};

interface FormState {
  email: string;
  password: string;
  nombre: string;
  role: UserRole;
}

const EMPTY_FORM: FormState = { email: '', password: '', nombre: '', role: 'comercial' };

export function UserManagementPage() {
  const { data: users, isLoading, error, refetch } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (user: User) => {
    setEditing(user);
    setForm({ email: user.email, password: '', nombre: user.nombre, role: user.role });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      const updates: Record<string, unknown> = {
        nombre: form.nombre,
        role: form.role,
        email: form.email,
      };
      if (form.password) updates.password = form.password;
      await updateUser.mutateAsync({ id: editing.id, updates });
    } else {
      await createUser.mutateAsync(form);
    }
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    await deleteUser.mutateAsync(id);
    setConfirmDelete(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size={28} />
      </div>
    );
  }

  if (error) {
    const message = (error as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
      || (error as { message?: string })?.message
      || 'Error desconocido';
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm text-alert">No se pudieron cargar los usuarios</p>
        <p className="text-xs text-muted max-w-md text-center">{message}</p>
        <Button size="sm" variant="ghost" onClick={() => refetch()}>Reintentar</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{users?.length ?? 0} usuario{users?.length !== 1 ? 's' : ''}</p>
        <Button onClick={openCreate} size="sm">
          <Plus size={16} /> Nuevo usuario
        </Button>
      </div>

      {/* User form */}
      {showForm && (
        <Card className="border border-primary/20">
          <h3 className="text-sm font-semibold text-white mb-4">
            {editing ? 'Editar usuario' : 'Crear usuario'}
          </h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <Input
              label="Nombre"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              required
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <Input
              label={editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required={!editing}
            />
            <Select
              label="Rol"
              options={ROLE_OPTIONS}
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            />
            <div className="col-span-2 flex gap-2">
              <Button type="submit" disabled={createUser.isPending || updateUser.isPending}>
                {editing ? 'Guardar cambios' : 'Crear usuario'}
              </Button>
              <Button variant="ghost" type="button" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Users table */}
      <Card className="p-0 overflow-hidden">
        {!users?.length ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted">
            <UserCog size={32} className="mb-2 opacity-40" />
            <p className="text-sm">No hay usuarios creados</p>
            <p className="text-xs mt-1">Crea el primer usuario para empezar</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-xs text-muted font-medium">Nombre</th>
                <th className="text-left px-5 py-3 text-xs text-muted font-medium">Email</th>
                <th className="text-left px-5 py-3 text-xs text-muted font-medium">Rol</th>
                <th className="px-5 py-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border/50 hover:bg-white/2 transition-colors">
                  <td className="px-5 py-3 font-medium text-white">{user.nombre}</td>
                  <td className="px-5 py-3 text-muted">{user.email}</td>
                  <td className="px-5 py-3">
                    <Badge color={ROLE_COLORS[user.role]}>{ROLE_LABELS[user.role]}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(user)}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-muted hover:text-white transition-colors cursor-pointer"
                      >
                        <Edit3 size={14} />
                      </button>
                      {confirmDelete === user.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="px-2 py-1 rounded-lg bg-alert/10 hover:bg-alert/20 text-alert text-xs cursor-pointer"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="px-2 py-1 rounded-lg hover:bg-white/5 text-muted text-xs cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(user.id)}
                          className="p-1.5 rounded-lg hover:bg-alert/10 text-muted hover:text-alert transition-colors cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
