import Airtable from 'airtable';
import NodeCache from 'node-cache';
import type { Lead, LeadFields, LeadSource, RentalType, LeadStatus, UserFields, UserRole } from '../types/index.js';

const base = new Airtable({ apiKey: process.env.AIRTABLE_PAT }).base(process.env.AIRTABLE_BASE_ID!);
const leadsTable = base(process.env.AIRTABLE_LEADS_TABLE_ID!);
const agenciasBaseTable = base(process.env.AIRTABLE_AGENCIAS_BASE_TABLE_ID || 'Agencias Base');
const agenciasTable = base(process.env.AIRTABLE_AGENCIAS_TABLE_ID || 'Agencias');

// Try to find USUARIOS table â€” will be created by admin
let usersTable: Airtable.Table<Airtable.FieldSet>;
try {
  usersTable = base('USUARIOS');
} catch {
  usersTable = base('USUARIOS');
}

const cache = new NodeCache({ stdTTL: 15, checkperiod: 20 });

// Field mapping: camelCase <-> Airtable Spanish names
const FIELD_TO_AIRTABLE: Record<string, string> = {
  nombre: 'Nombre agencia',
  provincia: 'Provincia',
  zona: 'Zona',
  fuente: 'Fuente',
  tipoAlquiler: 'Tipo alquiler',
  numAnuncios: 'Nº anuncios activos',
  nivelVolumen: 'Nivel volumen',
  email: 'Email',
  telefono: 'Teléfono',
  web: 'Web',
  perfilIdealista: 'Perfil Idealista',
  validado: 'Validado',
  prioridad: 'Prioridad',
  notas: 'Notas',
  estado: 'Estado',
  agencias: 'Agencias',
  ultimoContacto: 'Último Contacto',
  proximoContactoPrevisto: 'Próximo Contacto Previsto',
  resultadoOutreach: 'Resultado Outreach',
  actividades: 'Historial Actividades',
};

function mapRecordToLead(record: Airtable.Record<Airtable.FieldSet>): Lead {
  const f = record.fields as unknown as LeadFields;

  // Parse JSON fields safely
  let resultadoOutreach;
  let actividades;
  try {
    const resultadoStr = f['Resultado Outreach'];
    if (resultadoStr) {
      resultadoOutreach = typeof resultadoStr === 'string' ? JSON.parse(resultadoStr) : resultadoStr;
    }
  } catch (e) {
    console.warn('Error parsing Resultado Outreach:', e);
  }

  try {
    const actividadesStr = f['Historial Actividades'];
    if (actividadesStr) {
      actividades = typeof actividadesStr === 'string' ? JSON.parse(actividadesStr) : actividadesStr;
    }
  } catch (e) {
    console.warn('Error parsing Historial Actividades:', e);
  }

  return {
    id: record.id,
    autoId: (f['ID'] as number) ?? 0,
    nombre: f['Nombre agencia'] ?? '',
    provincia: f['Provincia'] ?? '',
    zona: f['Zona'] ?? '',
    fuente: (f['Fuente'] ?? 'Otro') as LeadSource,
    tipoAlquiler: (f['Tipo alquiler'] ?? []) as RentalType[],
    numAnuncios: f['Nº anuncios activos'] ?? '',
    nivelVolumen: f['Nivel volumen'] ?? '',
    email: f['Email'] ?? '',
    telefono: f['Teléfono'] ?? '',
    web: f['Web'] ?? '',
    perfilIdealista: f['Perfil Idealista'] ?? '',
    validado: f['Validado'] ?? null,
    prioridad: f['Prioridad'] ?? 0,
    notas: f['Notas'] ?? '',
    estado: (f['Estado'] ?? 'Sin iniciar') as LeadStatus,
    agencias: f['Agencias'] ?? '',
    ultimoContacto: f['Último Contacto'] as string | undefined,
    proximoContactoPrevisto: f['Próximo Contacto Previsto'] as string | undefined,
    resultadoOutreach,
    actividades,
  };
}

function camelToAirtable(updates: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    const airtableKey = FIELD_TO_AIRTABLE[key];
    if (airtableKey) {
      mapped[airtableKey] = value;
    }
  }
  return mapped;
}

function leadToAirtableFields(lead: Lead): Airtable.FieldSet {
  const fields: Airtable.FieldSet = {
    'Nombre agencia': lead.nombre,
    'Provincia': lead.provincia,
    'Zona': lead.zona,
    'Fuente': lead.fuente,
    'Tipo alquiler': lead.tipoAlquiler,
    'Nº anuncios activos': lead.numAnuncios,
    'Nivel volumen': lead.nivelVolumen,
    'Email': lead.email,
    'Teléfono': lead.telefono,
    'Web': lead.web,
    'Perfil Idealista': lead.perfilIdealista,
    // 'Validado' is a computed field in Airtable - cannot write to it
    'Notas': lead.notas,
    'Estado': lead.estado,
    // 'Agencias' is a linked record field in Agencias Base - not in Agencias table
  };
  // Only include Prioridad if it's a valid value (1-3)
  if (lead.prioridad && lead.prioridad >= 1 && lead.prioridad <= 3) {
    fields['Prioridad'] = lead.prioridad;
  }
  return fields;
}

export async function getLeads(filters?: {
  status?: string;
  fuente?: string;
  provincia?: string;
  search?: string;
}): Promise<Lead[]> {
  const cacheKey = `leads:${JSON.stringify(filters ?? {})}`;
  const cached = cache.get<Lead[]>(cacheKey);
  if (cached) return cached;

  const formulaParts: string[] = [];

  if (filters?.status) {
    formulaParts.push(`{Estado} = '${filters.status}'`);
  }
  if (filters?.fuente) {
    formulaParts.push(`{Fuente} = '${filters.fuente}'`);
  }
  if (filters?.provincia) {
    formulaParts.push(`FIND('${filters.provincia}', {Provincia})`);
  }
  if (filters?.search) {
    const s = filters.search.replace(/'/g, "\\'");
    formulaParts.push(
      `OR(FIND(LOWER('${s}'), LOWER({Nombre agencia})), FIND(LOWER('${s}'), LOWER({Email})), FIND(LOWER('${s}'), LOWER({Provincia})))`
    );
  }

  const filterFormula = formulaParts.length > 0
    ? formulaParts.length === 1
      ? formulaParts[0]
      : `AND(${formulaParts.join(', ')})`
    : '';

  const records = await leadsTable
    .select({
      ...(filterFormula ? { filterByFormula: filterFormula } : {}),
    })
    .all();

  const leads = records.map(mapRecordToLead);
  cache.set(cacheKey, leads);
  return leads;
}

export async function getLead(recordId: string): Promise<Lead | null> {
  // Try the main AGENCIAS table first, then fall back to AGENCIAS BASE
  try {
    const record = await leadsTable.find(recordId);
    return mapRecordToLead(record);
  } catch {
    // Not in AGENCIAS, try AGENCIAS BASE
    try {
      const record = await agenciasBaseTable.find(recordId);
      return mapRecordToLead(record);
    } catch {
      return null;
    }
  }
}

async function findLeadTable(
  recordId: string
): Promise<Airtable.Table<Airtable.FieldSet> | null> {
  try {
    await leadsTable.find(recordId);
    return leadsTable;
  } catch {
    try {
      await agenciasBaseTable.find(recordId);
      return agenciasBaseTable;
    } catch {
      return null;
    }
  }
}

export async function getAgenciasBase(search?: string): Promise<Lead[]> {
  const cacheKey = `agencias-base:${search ?? ''}`;
  const cached = cache.get<Lead[]>(cacheKey);
  if (cached) return cached;

  let filterByFormula: string | undefined;
  if (search) {
    const s = search.replace(/'/g, "\\'");
    filterByFormula = `OR(FIND(LOWER('${s}'), LOWER({Nombre agencia})), FIND(LOWER('${s}'), LOWER({Email})), FIND(LOWER('${s}'), LOWER({Provincia})))`;
  }

  const records = await agenciasBaseTable
    .select({
      ...(filterByFormula ? { filterByFormula } : {}),
    })
    .all();

  const agenciasBase = records.map(mapRecordToLead);
  cache.set(cacheKey, agenciasBase);
  return agenciasBase;
}

export async function exportAgenciasFromBase(
  sourceRecordIds: string[]
): Promise<{ created: number; failed: Array<{ id: string; error: string }> }> {
  const failed: Array<{ id: string; error: string }> = [];
  let created = 0;

  for (const sourceRecordId of sourceRecordIds) {
    try {
      const sourceRecord = await agenciasBaseTable.find(sourceRecordId);
      console.log(`📤 Exporting agencia: ${sourceRecordId}`);

      try {
        await agenciasTable.create(sourceRecord.fields as Airtable.FieldSet);
        console.log(`✓ Created in Agencias table: ${sourceRecordId}`);
      } catch (createError) {
        console.log(`ℹ First attempt failed, trying mapped fields: ${createError}`);
        const mappedLead = mapRecordToLead(sourceRecord);
        const mappedFields = leadToAirtableFields(mappedLead);
        console.log(`📋 Mapped fields being sent:`, Object.keys(mappedFields));
        console.log(`📋 Field values:`, {
          prioridad: mappedFields['Prioridad'],
          estado: mappedFields['Estado'],
          fuente: mappedFields['Fuente'],
          tipoAlquiler: mappedFields['Tipo alquiler'],
        });
        try {
          await agenciasTable.create(mappedFields);
          console.log(`✓ Created in Agencias table (mapped): ${sourceRecordId}`);
        } catch (mappedError) {
          console.error(`❌ Mapped attempt also failed: ${mappedError}`);
          throw mappedError;
        }
      }

      // Delete from Agencias Base after successful creation
      await agenciasBaseTable.destroy(sourceRecordId);
      console.log(`🗑️ Deleted from Agencias Base: ${sourceRecordId}`);

      created += 1;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
      console.error(`❌ Error exporting ${sourceRecordId}:`, errorMsg);
      failed.push({
        id: sourceRecordId,
        error: errorMsg,
      });
    }
  }

  cache.flushAll();
  return { created, failed };
}

export async function updateLead(
  recordId: string,
  updates: Record<string, unknown>
): Promise<Lead> {
  const airtableFields = camelToAirtable(updates) as Partial<Airtable.FieldSet>;
  // The record might live in AGENCIAS or in AGENCIAS BASE — try both.
  const table = await findLeadTable(recordId);
  if (!table) {
    throw new Error(`Lead ${recordId} no encontrado en AGENCIAS ni en AGENCIAS BASE`);
  }
  const record = await table.update(recordId, airtableFields);
  // Invalidate cache
  cache.flushAll();
  return mapRecordToLead(record as Airtable.Record<Airtable.FieldSet>);
}

// ===== Users (USUARIOS table) =====

interface UserRecord {
  id: string;
  email: string;
  nombre: string;
  role: UserRole;
  passwordHash: string;
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  try {
    const records = await usersTable
      .select({
        filterByFormula: `{Email} = '${email.replace(/'/g, "\\'")}'`,
        maxRecords: 1,
      })
      .all();

    if (records.length === 0) return null;

    const r = records[0];
    const f = r.fields as unknown as UserFields;
    return {
      id: r.id,
      email: f.Email,
      nombre: f.Nombre,
      role: f.Role,
      passwordHash: f.PasswordHash,
    };
  } catch (err) {
    console.error('❌ Error getting user by email:', err);
    return null;
  }
}

export async function getUsers(): Promise<Array<{ id: string; email: string; nombre: string; role: UserRole }>> {
  const records = await usersTable.select().all();
  return records.map((r) => {
    const f = r.fields as unknown as UserFields;
    return {
      id: r.id,
      email: f.Email,
      nombre: f.Nombre,
      role: f.Role,
    };
  });
}

export async function createUser(data: {
  email: string;
  passwordHash: string;
  nombre: string;
  role: UserRole;
}): Promise<{ id: string; email: string; nombre: string; role: UserRole }> {
  try {
    console.log('Creating user with data:', {
      email: data.email,
      nombre: data.nombre,
      role: data.role,
      passwordHashLength: data.passwordHash.length
    });

    const record = await usersTable.create({
      Email: data.email,
      PasswordHash: data.passwordHash,
      Nombre: data.nombre,
      Role: data.role,
    } as unknown as Airtable.FieldSet);

    console.log('User created successfully:', record.id);

    return {
      id: record.id,
      email: data.email,
      nombre: data.nombre,
      role: data.role,
    };
  } catch (err) {
    console.error('Error creating user:', err);
    throw err;
  }
}

export async function deleteUser(recordId: string): Promise<void> {
  await usersTable.destroy(recordId);
}

export async function updateUser(
  recordId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const fieldMap: Record<string, string> = {
    email: 'Email',
    nombre: 'Nombre',
    role: 'Role',
    passwordHash: 'PasswordHash',
  };

  const airtableFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    const f = fieldMap[key];
    if (f) airtableFields[f] = value;
  }

  await usersTable.update(recordId, airtableFields as unknown as Airtable.FieldSet);
}

export function clearCache(): void {
  cache.flushAll();
}


