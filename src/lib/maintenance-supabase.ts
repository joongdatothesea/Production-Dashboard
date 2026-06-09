import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vwrfuznlfmzqiupyzhqd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GUFo9j3iMrsK3uTW49a3iA_Vlbc16AY';

let _client: ReturnType<typeof createClient> | null = null;

export const getClient = () => {
  if (!_client) _client = createClient(SUPABASE_URL, SUPABASE_KEY);
  return _client;
};

// ─── Types (matching Pro-Maintenance schema) ───────────────────────────────

export interface MaintRecord {
  id: string;
  date: string;
  machineName: string;
  shift: string;
  faultArea: string;
  faultReason: string;
  faultDescription: string;
  faultPhoto?: string;
  repairResult: string;         // Fixed / Temporary / Not Fixed / Observation
  machineStatusAfter: string;   // Running / Restricted / Down
  totalDowntime: number;        // hours
  repairTime: number;
  repairCost: number;
  technician: string;
  isProductionDelayed: boolean;
  isRecurring: boolean;
  maintenanceType?: string;
  jobStatus?: string;           // Pending / In Progress / Completed
  difficulty?: number;          // 1-5
  remarks?: string;
}

export interface PMLog {
  id: string;
  machineName: string;
  category: string;
  item: string;
  serviceDate: string;
  fitterName: string;
  checked: boolean;
  comments: string;
}

export interface MachineInfo {
  name: string;
  model?: string;
  serialNumber?: string;
  section?: string;   // e.g. 'production','logistics','crane','other'
  imageUrl?: string;
}

// ─── Fetch functions ───────────────────────────────────────────────────────

/** Recent maintenance records (last N days, or current month) */
export const fetchMaintenanceRecords = async (fromDate?: string): Promise<MaintRecord[]> => {
  const client = getClient();
  let query = client
    .from('maintenance_records')
    .select('id,date,machine_name,shift,fault_area,fault_reason,fault_description,fault_photo,repair_result,machine_status_after,total_downtime,repair_time,repair_cost,technician,is_production_delayed,is_recurring,maintenance_type,job_status,difficulty,remarks')
    .order('date', { ascending: false })
    .limit(500);

  if (fromDate) query = query.gte('date', fromDate);

  const { data, error } = await query;
  if (error) { console.error('fetchMaintenanceRecords:', error.message); return []; }

  return (data ?? []).map(r => ({
    id: r.id,
    date: r.date,
    machineName: r.machine_name,
    shift: r.shift,
    faultArea: r.fault_area,
    faultReason: r.fault_reason,
    faultDescription: r.fault_description,
    faultPhoto: r.fault_photo,
    repairResult: r.repair_result,
    machineStatusAfter: r.machine_status_after,
    totalDowntime: r.total_downtime ?? 0,
    repairTime: r.repair_time ?? 0,
    technician: r.technician,
    repairCost: r.repair_cost ?? 0,
    isProductionDelayed: r.is_production_delayed ?? false,
    isRecurring: r.is_recurring ?? false,
    maintenanceType: r.maintenance_type,
    jobStatus: r.job_status,
    difficulty: r.difficulty,
    remarks: r.remarks,
  }));
};

/** Push a new downtime record (from Production Dashboard) to Supabase */
export const pushMaintenanceRecord = async (rec: {
  machineName: string;
  shift: 'AM' | 'PM';
  type: string;          // 'breakdown' | 'changeover' | 'maintenance' | 'no_plan'
  duration: number;      // minutes
  reason?: string;
  date: string;
}): Promise<boolean> => {
  const client = getClient();
  const typeMap: Record<string, string> = {
    breakdown: 'Corrective',
    maintenance: 'Preventive',
    changeover: 'Corrective',
    no_plan: 'Corrective',
  };
  const now = new Date();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client as any).from('maintenance_records').insert({
    id: `prod-${Date.now()}`,
    date: rec.date,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    week_day: now.toLocaleDateString('en-US', { weekday: 'long' }),
    shift: rec.shift as string,
    machine_name: rec.machineName,
    fault_area: '生产记录',
    fault_reason: rec.reason || rec.type,
    fault_description: rec.reason || `由 Production Dashboard 记录 — ${rec.type}`,
    repair_result: 'In Progress',
    machine_status_after: 'Under Repair',
    total_downtime: rec.duration,
    repair_time: 0,
    technician: 'Production',
    is_production_delayed: true,
    is_recurring: false,
    maintenance_type: typeMap[rec.type] ?? 'Corrective',
  });
  if (error) { console.error('pushMaintenanceRecord:', error.message); return false; }
  return true;
};

/** Get PM logs for a specific machine */
export const fetchPMLogs = async (machineName: string): Promise<PMLog[]> => {
  const client = getClient();
  const { data, error } = await client
    .from('pm_logs')
    .select('id,machine_name,category,item,service_date,fitter_name,checked,comments')
    .eq('machine_name', machineName)
    .order('service_date', { ascending: false })
    .limit(20);
  if (error) { console.error('fetchPMLogs:', error.message); return []; }
  return (data ?? []).map(l => ({
    id: l.id,
    machineName: l.machine_name,
    category: l.category,
    item: l.item,
    serviceDate: l.service_date,
    fitterName: l.fitter_name,
    checked: l.checked,
    comments: l.comments,
  }));
};

/** Fetch systemConfig (machine subsystem definitions) from app_configs table */
export const fetchSystemConfig = async (): Promise<Record<string, Record<string, string[]>>> => {
  const client = getClient();
  const { data, error } = await (client as any).from('app_configs').select('key,value').eq('key', 'systemConfig').limit(1);
  if (error) { console.error('fetchSystemConfig:', error.message); return {}; }
  if (!data?.length) return {};
  try { return JSON.parse(data[0].value); } catch { return {}; }
};

/** Get all machines from Pro-Maintenance */
export const fetchMachines = async (): Promise<MachineInfo[]> => {
  const client = getClient();
  const { data, error } = await (client as any).from('machines').select('name,model,serial_number,section,image_url');
  if (error) { console.error('fetchMachines:', error.message); return []; }
  return (data ?? []).map(m => ({ name: m.name, model: m.model, serialNumber: m.serial_number, section: m.section, imageUrl: m.image_url }));
};
