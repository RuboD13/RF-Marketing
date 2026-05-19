import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Phone, Mail, Globe, ExternalLink, Edit3, Save, X,
  MapPin, Building2, Calendar, FileText,
} from 'lucide-react';
import { useLead, useUpdateLead } from '../../api/leads';
import { useRoleGuard } from '../../hooks/useRoleGuard';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Rating } from '../ui/Rating';
import { Spinner } from '../ui/Spinner';
import { Card } from '../ui/Card';
import { STATUS_COLORS, LEAD_STATUSES, LEAD_SOURCES, RENTAL_TYPES } from '../../lib/constants';
import { formatDate } from '../../lib/utils';
import type { Lead, LeadSource, LeadStatus, RentalType } from '../../types';

type EditableFields = {
  nombre: string;
  provincia: string;
  zona: string;
  email: string;
  telefono: string;
  web: string;
  perfilIdealista: string;
  fuente: LeadSource | '';
  numAnuncios: string;
  nivelVolumen: string;
  tipoAlquiler: RentalType[];
};

function leadToEditable(lead: Lead): EditableFields {
  return {
    nombre: lead.nombre ?? '',
    provincia: lead.provincia ?? '',
    zona: lead.zona ?? '',
    email: lead.email ?? '',
    telefono: lead.telefono ?? '',
    web: lead.web ?? '',
    perfilIdealista: lead.perfilIdealista ?? '',
    fuente: (lead.fuente as LeadSource) ?? '',
    numAnuncios: lead.numAnuncios ?? '',
    nivelVolumen: lead.nivelVolumen ?? '',
    tipoAlquiler: lead.tipoAlquiler ?? [],
  };
}

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: lead, isLoading } = useLead(id);
  const updateLead = useUpdateLead();
  const { canEditLead, canTransitionTo } = useRoleGuard();

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');

  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState<EditableFields | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size={32} />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-16 text-muted">
        <p>Lead no encontrado</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate('/leads')}>
          <ArrowLeft size={16} /> Volver
        </Button>
      </div>
    );
  }

  const canEdit = canEditLead(lead.estado);

  const handleStatusChange = (newStatus: LeadStatus) => {
    if (!canTransitionTo(newStatus)) return;
    updateLead.mutate({ id: lead.id, updates: { estado: newStatus } });
  };

  const handleSaveNotes = () => {
    updateLead.mutate({ id: lead.id, updates: { notas: notesValue } });
    setEditingNotes(false);
  };

  const handlePriority = (v: number) => {
    if (canEdit) updateLead.mutate({ id: lead.id, updates: { prioridad: v } });
  };

  const startEditInfo = () => {
    setInfoForm(leadToEditable(lead));
    setSaveError(null);
    setEditingInfo(true);
  };

  const cancelEditInfo = () => {
    setEditingInfo(false);
    setInfoForm(null);
    setSaveError(null);
  };

  const handleSaveInfo = async () => {
    if (!infoForm) return;
    // Build a diff so we only send fields that actually changed.
    const original = leadToEditable(lead);
    const updates: Record<string, unknown> = {};
    (Object.keys(infoForm) as Array<keyof EditableFields>).forEach((key) => {
      const a = infoForm[key];
      const b = original[key];
      const changed = Array.isArray(a) || Array.isArray(b)
        ? JSON.stringify(a) !== JSON.stringify(b)
        : a !== b;
      if (changed) {
        updates[key] = key === 'fuente' && a === '' ? null : a;
      }
    });

    if (Object.keys(updates).length === 0) {
      setEditingInfo(false);
      return;
    }

    try {
      setSaveError(null);
      await updateLead.mutateAsync({ id: lead.id, updates });
      setEditingInfo(false);
      setInfoForm(null);
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error
        || (err as { message?: string })?.message
        || 'No se pudo guardar';
      setSaveError(message);
    }
  };

  const toggleTipoAlquiler = (type: RentalType) => {
    if (!infoForm) return;
    const current = infoForm.tipoAlquiler;
    setInfoForm({
      ...infoForm,
      tipoAlquiler: current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type],
    });
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      {/* Back + title */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/leads')}>
          <ArrowLeft size={16} />
        </Button>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-white">{lead.nombre || 'Sin nombre'}</h2>
          <div className="flex items-center gap-2 mt-1">
            <MapPin size={13} className="text-muted" />
            <span className="text-sm text-muted">{lead.provincia}{lead.zona ? ` · ${lead.zona}` : ''}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Rating value={lead.prioridad} onChange={canEdit ? handlePriority : undefined} size={18} />
          <Badge color={STATUS_COLORS[lead.estado]}>{lead.estado}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-4">
          {/* Info grid */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Building2 size={16} className="text-primary" /> Información
              </h3>
              {canEdit && !editingInfo && (
                <Button variant="ghost" size="sm" onClick={startEditInfo}>
                  <Edit3 size={14} /> Editar
                </Button>
              )}
            </div>

            {editingInfo && infoForm ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <EditableField
                    label="Nombre agencia"
                    value={infoForm.nombre}
                    onChange={(v) => setInfoForm({ ...infoForm, nombre: v })}
                    span={2}
                  />
                  <EditableField
                    label="Provincia"
                    value={infoForm.provincia}
                    onChange={(v) => setInfoForm({ ...infoForm, provincia: v })}
                  />
                  <EditableField
                    label="Zona"
                    value={infoForm.zona}
                    onChange={(v) => setInfoForm({ ...infoForm, zona: v })}
                  />
                  <EditableField
                    label="Email"
                    type="email"
                    value={infoForm.email}
                    onChange={(v) => setInfoForm({ ...infoForm, email: v })}
                  />
                  <EditableField
                    label="Teléfono"
                    value={infoForm.telefono}
                    onChange={(v) => setInfoForm({ ...infoForm, telefono: v })}
                  />
                  <EditableField
                    label="Web"
                    value={infoForm.web}
                    onChange={(v) => setInfoForm({ ...infoForm, web: v })}
                  />
                  <EditableField
                    label="Perfil Idealista"
                    value={infoForm.perfilIdealista}
                    onChange={(v) => setInfoForm({ ...infoForm, perfilIdealista: v })}
                  />
                  <div>
                    <p className="text-xs text-muted mb-1">Fuente</p>
                    <select
                      value={infoForm.fuente}
                      onChange={(e) => setInfoForm({ ...infoForm, fuente: e.target.value as LeadSource | '' })}
                      className="w-full bg-surface-700 border border-border rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                    >
                      <option value="">—</option>
                      {LEAD_SOURCES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <EditableField
                    label="Nº anuncios activos"
                    value={infoForm.numAnuncios}
                    onChange={(v) => setInfoForm({ ...infoForm, numAnuncios: v })}
                  />
                  <EditableField
                    label="Nivel volumen"
                    value={infoForm.nivelVolumen}
                    onChange={(v) => setInfoForm({ ...infoForm, nivelVolumen: v })}
                  />
                  <div className="col-span-2">
                    <p className="text-xs text-muted mb-2">Tipo de alquiler</p>
                    <div className="flex flex-wrap gap-2">
                      {RENTAL_TYPES.map((type) => {
                        const active = infoForm.tipoAlquiler.includes(type);
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => toggleTipoAlquiler(type)}
                            className={`px-3 py-1.5 rounded-xl text-xs transition-all cursor-pointer ${
                              active
                                ? 'bg-primary/20 text-white border border-primary/50'
                                : 'bg-surface-700 text-muted border border-border hover:text-white'
                            }`}
                          >
                            {type}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {saveError && (
                  <p className="text-xs text-alert">{saveError}</p>
                )}

                <div className="flex gap-2 pt-2 border-t border-border/40">
                  <Button size="sm" onClick={handleSaveInfo} disabled={updateLead.isPending}>
                    <Save size={14} /> Guardar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelEditInfo} disabled={updateLead.isPending}>
                    <X size={14} /> Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <InfoField label="Email" value={lead.email} href={lead.email ? `mailto:${lead.email}` : undefined} icon={<Mail size={14} />} />
                <InfoField label="Teléfono" value={lead.telefono} href={lead.telefono ? `tel:${lead.telefono}` : undefined} icon={<Phone size={14} />} />
                <InfoField label="Web" value={lead.web} href={lead.web} external icon={<Globe size={14} />} />
                <InfoField label="Perfil Idealista" value={lead.perfilIdealista ? 'Ver perfil' : undefined} href={lead.perfilIdealista} external icon={<ExternalLink size={14} />} />
                <InfoField label="Fuente" value={lead.fuente} />
                <InfoField label="Validado" value={formatDate(lead.validado)} icon={<Calendar size={14} />} />
                <InfoField label="Nº Anuncios" value={lead.numAnuncios} />
                <InfoField label="Nivel volumen" value={lead.nivelVolumen} />
                {lead.tipoAlquiler?.length > 0 && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted mb-2">Tipo alquiler</p>
                    <div className="flex flex-wrap gap-1">
                      {lead.tipoAlquiler.map((t) => (
                        <Badge key={t} color="#7c3aed">{t}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Notes */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <FileText size={16} className="text-muted" /> Notas
              </h3>
              {canEdit && !editingNotes && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setNotesValue(lead.notas); setEditingNotes(true); }}
                >
                  <Edit3 size={14} /> Editar
                </Button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-3">
                <textarea
                  className="w-full bg-surface-700 border border-border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 resize-none"
                  rows={5}
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveNotes} disabled={updateLead.isPending}>
                    <Save size={14} /> Guardar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingNotes(false)}>
                    <X size={14} /> Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted whitespace-pre-wrap">
                {lead.notas || 'Sin notas.'}
              </p>
            )}
          </Card>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {/* Status changer */}
          <Card>
            <h3 className="text-sm font-semibold text-white mb-4">Estado del lead</h3>
            <div className="space-y-1.5">
              {LEAD_STATUSES.map((status) => {
                const isCurrent = lead.estado === status;
                const canGoTo = canTransitionTo(status);
                return (
                  <button
                    key={status}
                    disabled={!canGoTo || isCurrent || updateLead.isPending}
                    onClick={() => handleStatusChange(status)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all cursor-pointer ${
                      isCurrent
                        ? 'text-white font-semibold'
                        : canGoTo
                        ? 'text-muted hover:text-white hover:bg-white/5'
                        : 'text-muted/40 cursor-not-allowed'
                    }`}
                    style={isCurrent ? {
                      backgroundColor: `${STATUS_COLORS[status]}18`,
                      border: `1px solid ${STATUS_COLORS[status]}40`,
                    } : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: STATUS_COLORS[status] }}
                      />
                      {status}
                      {isCurrent && <span className="ml-auto text-[10px] opacity-70">Actual</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Quick actions */}
          <Card>
            <h3 className="text-sm font-semibold text-white mb-3">Acciones rápidas</h3>
            <div className="space-y-2">
              {lead.telefono && (
                <a
                  href={`tel:${lead.telefono}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-secondary/10 hover:bg-secondary/20 transition-colors"
                >
                  <Phone size={16} className="text-secondary" />
                  <span className="text-sm text-secondary">Llamar</span>
                </a>
              )}
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors"
                >
                  <Mail size={16} className="text-primary" />
                  <span className="text-sm text-primary">Enviar email</span>
                </a>
              )}
              {lead.web && (
                <a
                  href={lead.web.startsWith('http') ? lead.web : `https://${lead.web}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/8 transition-colors"
                >
                  <Globe size={16} className="text-muted" />
                  <span className="text-sm text-muted">Ver web</span>
                </a>
              )}
            </div>
          </Card>

          {/* Metadata */}
          <Card>
            <h3 className="text-sm font-semibold text-white mb-3">Detalles</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">ID</span>
                <span className="font-mono text-white">#{lead.autoId}</span>
              </div>
              {lead.agencias && (
                <div className="flex justify-between">
                  <span className="text-muted">Agencias</span>
                  <span className="text-white">{lead.agencias}</span>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  type = 'text',
  span = 1,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  span?: 1 | 2;
}) {
  return (
    <div className={span === 2 ? 'col-span-2' : undefined}>
      <p className="text-xs text-muted mb-1">{label}</p>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface-700 border border-border rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
      />
    </div>
  );
}

function InfoField({
  label, value, href, external, icon
}: {
  label: string;
  value?: string;
  href?: string;
  external?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted mb-1">{label}</p>
      {href && value ? (
        <a
          href={href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') ? href : `https://${href}`}
          target={external ? '_blank' : undefined}
          rel={external ? 'noopener noreferrer' : undefined}
          className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover transition-colors"
        >
          {icon}
          <span className="truncate">{value}</span>
          {external && <ExternalLink size={11} />}
        </a>
      ) : (
        <p className="text-sm text-white flex items-center gap-1.5">
          {icon && <span className="text-muted">{icon}</span>}
          {value || <span className="text-muted">—</span>}
        </p>
      )}
    </div>
  );
}
