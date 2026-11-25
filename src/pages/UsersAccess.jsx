import { useState } from 'react';
import { Plus, Edit2, Trash2, Search, Shield, X } from 'lucide-react';
import { useCinema } from '../context/CinemaContext';
import { users as initialUsers } from '../data/store';

const roleConfig = {
  admin:    { cls: 'badge-red',    label: 'Administrador' },
  manager:  { cls: 'badge-gold',   label: 'Gerente' },
  cashier:  { cls: 'badge-blue',   label: 'Cajero' },
  support:  { cls: 'badge-purple', label: 'Soporte' },
  operator: { cls: 'badge-muted',  label: 'Operador' },
};

const permissions = {
  admin:    ['Crear funciones', 'Editar películas', 'Cancelar ventas', 'Ver reportes', 'Gestionar usuarios', 'Configuración del sistema'],
  manager:  ['Crear funciones', 'Editar películas', 'Cancelar ventas', 'Ver reportes'],
  cashier:  ['Ver funciones', 'Procesar ventas', 'Ver reportes'],
  support:  ['Ver pedidos', 'Procesar reembolsos', 'Ver reportes'],
  operator: ['Ver funciones', 'Validar boletos'],
};

const tabs = ['Personal', 'Roles y Permisos', 'Registros de Actividad'];

const EMPTY_USER = { name: '', email: '', role: 'cashier', status: 'active', avatar: '', branchId: 1 };

export default function UsersAccess() {
  const { branches } = useCinema();
  const [activeTab, setActiveTab] = useState('Personal');
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_USER);
  const [editing, setEditing] = useState(null);

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const openEdit = (u) => { setEditing(u.id); setForm({ ...u }); setShowModal(true); };
  const openCreate = () => { setEditing(null); setForm(EMPTY_USER); setShowModal(true); };
  const saveUser = () => {
    const avatar = form.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const branchId = form.role === 'admin' ? null : Number(form.branchId);
    if (editing) {
      setUsers(p => p.map(u => u.id === editing ? { ...u, ...form, branchId, avatar } : u));
    } else {
      setUsers(p => [...p, { ...form, id: Date.now(), branchId, avatar, lastLogin: '—' }]);
    }
    setShowModal(false);
  };
  const deleteUser = (id) => setUsers(p => p.filter(u => u.id !== id));
  const toggleStatus = (id) => setUsers(p => p.map(u => u.id === id ? { ...u, status: u.status === 'active' ? 'inactive' : 'active' } : u));

  const activityLogs = [
    { user: 'John Anderson', action: 'Función creada: Dune Pt3 — Sala 1', time: 'hace 2 min', role: 'admin' },
    { user: 'Sarah Mitchell', action: 'Película actualizada: Avatar Way of Fire → Preventa', time: 'hace 18 min', role: 'manager' },
    { user: 'Michael Chen', action: 'Venta procesada: TXN-001250 — $54', time: 'hace 1 hora', role: 'cashier' },
    { user: 'Emily Rodriguez', action: 'Función cancelada: Sala 4 — 20:00', time: 'hace 2 horas', role: 'manager' },
    { user: 'Anna Martinez', action: 'Usuario agregado: Lisa Brown (Cajero)', time: 'hace 3 horas', role: 'admin' },
    { user: 'James Wilson', action: 'Reembolso procesado: TXN-001249 — $36', time: 'hace 4 horas', role: 'support' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Usuarios y Accesos</h1>
          <p className="page-subtitle">Gestiona el personal, roles y permisos del sistema</p>
        </div>
        {activeTab === 'Personal' && (
          <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Agregar Usuario</button>
        )}
      </div>

      <div className="tabs mb-6">
        {tabs.map(t => <button key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>{t}</button>)}
      </div>

      {/* PERSONAL */}
      {activeTab === 'Personal' && (
        <>
          <div className="search-bar mb-4" style={{ maxWidth: 360 }}>
            <Search size={15} color="var(--text-muted)" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar usuarios..." />
          </div>
          <div className="table-wrapper card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr><th>Usuario</th><th>Email</th><th>Rol</th><th>Estado</th><th>Último Acceso</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const role = roleConfig[u.role] || roleConfig.operator;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="flex gap-8">
                          <div className="avatar avatar-sm">{u.avatar}</div>
                          <span style={{ fontWeight: 600 }}>{u.name}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: 13 }}>{u.email}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span className={`badge ${role.cls}`} style={{ alignSelf: 'flex-start' }}>{role.label}</span>
                          {u.role !== 'admin' && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              🏢 {branches.find(b => b.id === u.branchId)?.name || 'Sin asignar'}
                            </span>
                          )}
                          {u.role === 'admin' && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>🌍 Acceso Global</span>}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${u.status === 'active' ? 'badge-green' : 'badge-muted'}`}
                          style={{ cursor: 'pointer' }} onClick={() => toggleStatus(u.id)}>
                          {u.status === 'active' ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.lastLogin}</td>
                      <td>
                        <div className="flex gap-6">
                          <button className="icon-btn" onClick={() => openEdit(u)} title="Editar"><Edit2 size={14} /></button>
                          <button className="icon-btn danger" onClick={() => deleteUser(u.id)} title="Eliminar"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ROLES Y PERMISOS */}
      {activeTab === 'Roles y Permisos' && (
        <div className="grid-2">
          {Object.entries(permissions).map(([role, perms]) => {
            const cfg = roleConfig[role];
            return (
              <div key={role} className="card">
                <div className="flex gap-12 mb-4">
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Shield size={18} color="var(--action-red)" />
                  </div>
                  <div>
                    <span className={`badge ${cfg.cls}`}>{cfg.label}</span>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      {users.filter(u => u.role === role).length} usuarios
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {perms.map(p => (
                    <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--emerald)', flexShrink: 0 }} />
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* REGISTROS DE ACTIVIDAD */}
      {activeTab === 'Registros de Actividad' && (
        <div className="card">
          <div className="section-title mb-4">Actividad del Sistema</div>
          {activityLogs.map((log, i) => {
            const role = roleConfig[log.role];
            return (
              <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="avatar avatar-sm">{log.user.split(' ').map(n => n[0]).join('').slice(0,2)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{log.user}</span>
                    <span className={`badge ${role?.cls}`} style={{ fontSize: 10 }}>{role?.label}</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{log.action}</p>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{log.time}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{editing ? 'Editar Usuario' : 'Agregar Usuario'}</div>
              <button className="icon-btn" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group"><label className="form-label">Nombre Completo</label><input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Juan Pérez" /></div>
              <div className="form-group"><label className="form-label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="juan@cinerama.com" /></div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Rol</label>
                  <select className="select" style={{ width: '100%' }} value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                    {Object.entries(roleConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Estado</label>
                  <select className="select" style={{ width: '100%' }} value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </div>
              </div>
              {form.role !== 'admin' && (
                <div className="form-group"><label className="form-label">Cine Asignado</label>
                  <select className="select" style={{ width: '100%' }} value={form.branchId || ''} onChange={e => setForm(p => ({ ...p, branchId: Number(e.target.value) }))}>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveUser}>Guardar Usuario</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
