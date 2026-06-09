import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity,
  Settings,
  AlertCircle,
  CheckCircle2,
  Clock,
  Hammer,
  ShieldCheck,
  Award,
  Truck,
  Users,
  Cpu,
  RefreshCw,
  Lock,
  Unlock,
  AlertTriangle,
  History,
  Target,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  TrendingUp,
  ClipboardList,
  Plus,
  Trash2,
  X,
  ZoomIn,
  Camera,
  Play,
  Pause,
  Check,
  Pencil,
  Trophy,
  Star,
  CalendarDays,
  BarChart2,
  Upload,
  MessageCircle,
  Monitor,
  LayoutGrid,
  Cog,
  FolderPlus,
  Edit2,
  Save,
  Hourglass,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  Cell,
  PieChart,
  Pie
} from 'recharts';

// --- Types ---

type SectionType = 'S' | 'Q' | 'Prod' | 'D' | '5S' | 'P' | 'M' | 'Cap';

interface SafetyAlert {
  id: string;
  title: string;
  description: string;
  date: string;
  severity: 'low' | 'medium' | 'high';
  photo?: string;
}

interface SafetyWallItem {
  id: string;
  title: string;
  format: 'A4' | 'A3';
  orientation: 'portrait' | 'landscape';
  image: string;
  date: string;
  duration?: number; // ms — 5000 for PPTX slides, 10000 for images
}

interface KPILog {
  id: string;
  kpiLabel: string;
  date: string;        // formatted display date
  timestamp: number;
  person: string;      // operator / person involved
  description: string; // what happened / what was observed
  action?: string;     // corrective / follow-up action taken
}

// ---- IndexedDB key-value store ----
// Drop-in replacement for localStorage but without the 5 MB limit.
// Usage: await idbSet('myKey', anyValue)  /  await idbGet<MyType>('myKey')
const IDB_NAME = 'production-dashboard';
const IDB_STORE = 'kvstore';
let _idb: IDBDatabase | null = null;

const getDB = (): Promise<IDBDatabase> =>
  _idb
    ? Promise.resolve(_idb)
    : new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
        req.onsuccess = () => { _idb = req.result; resolve(_idb); };
        req.onerror = () => reject(req.error);
      });

const idbGet = async <T,>(key: string): Promise<T | null> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
};

const idbSet = async (key: string, value: unknown): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// Migrate a key from localStorage to IndexedDB once, then remove from localStorage.
const migrateFromLS = async (key: string) => {
  const raw = localStorage.getItem(key);
  if (!raw) return;
  try {
    await idbSet(key, JSON.parse(raw));
    localStorage.removeItem(key);
  } catch { /* ignore parse errors */ }
};

// ---- Quality Issue Tracker types ----
type IssueCause = 'operator' | 'packer' | 'loader' | 'other';
type IssueType  = 'internal' | 'customer';
type IssueShift = 'morning' | 'afternoon';

interface QualityIssue {
  id: string;
  date: string;        // YYYY-MM-DD local
  timestamp: number;
  cause: IssueCause;
  type: IssueType;
  description: string;
  qty: number;
  orderNo?: string;
  photos?: string[];
  reSchedule?: boolean;
  employee?: string;
  shift?: IssueShift;
}

const CAUSE_CFG: Record<IssueCause, { label: string; bg: string; text: string; dot: string }> = {
  operator: { label: '加工错误 Operator', bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  packer:   { label: '打包错误 Packer',   bg: 'bg-violet-100', text: 'text-violet-700', dot: 'bg-violet-500' },
  loader:   { label: '装车错误 Loader',   bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  other:    { label: '其他 Other',        bg: 'bg-slate-100',  text: 'text-slate-600',  dot: 'bg-slate-400'  },
};
const TYPE_CFG: Record<IssueType, { label: string; bg: string; text: string; border: string }> = {
  internal: { label: '内部解决 Internal Fix',  bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  customer: { label: '客户投诉 Customer NCR', bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200'    },
};
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const TODAY_YMD = toYMD(new Date());

// Mon-first calendar cells for a month; null = empty padding cell
const calendarCells = (year: number, month: number): (string | null)[] => {
  const first = new Date(year, month, 1).getDay();
  const offset = (first + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= days; d++)
    cells.push(`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
};

const uint8ToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
};

const extractPPTXSlides = async (
  file: File,
  format: 'A4' | 'A3',
  orientation: 'portrait' | 'landscape',
  baseTitle: string
): Promise<SafetyWallItem[]> => {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const slideFiles = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const n = (s: string) => parseInt(s.match(/(\d+)/)?.[1] || '0');
      return n(a) - n(b);
    });

  const results: SafetyWallItem[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const slideNum = slideFiles[i].match(/slide(\d+)\.xml/)?.[1];
    if (!slideNum) continue;

    const relsText = await zip.files[`ppt/slides/_rels/slide${slideNum}.xml.rels`]?.async('text') || '';
    const imgMatches = [...relsText.matchAll(/Target="([^"]+\.(png|jpg|jpeg|gif))"/gi)];

    for (const m of imgMatches) {
      const target = m[1];
      const path = target.startsWith('../') ? `ppt/${target.slice(3)}` : `ppt/slides/${target}`;
      const imgFile = zip.files[path];
      if (!imgFile) continue;
      const bytes = await imgFile.async('uint8array');
      const ext = target.split('.').pop()?.toLowerCase() || 'png';
      const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png';
      results.push({
        id: `${Date.now()}-${i}`,
        title: `${baseTitle} · Slide ${i + 1}/${slideFiles.length}`,
        format, orientation, date, duration: 5000,
        image: `data:${mime};base64,${uint8ToBase64(bytes)}`,
      });
      break;
    }
  }
  return results;
};

const renderPDFToImages = async (
  pdfData: Uint8Array,
  format: 'A4' | 'A3',
  orientation: 'portrait' | 'landscape',
  baseTitle: string
): Promise<SafetyWallItem[]> => {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const results: SafetyWallItem[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const pg = await pdf.getPage(i);
    const vp = pg.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    await pg.render({ canvasContext: canvas.getContext('2d')!, viewport: vp, canvas }).promise;
    results.push({
      id: `${Date.now()}-pdf-${i}`,
      title: `${baseTitle} · Page ${i}/${pdf.numPages}`,
      format, orientation, date, duration: 5000,
      image: canvas.toDataURL('image/jpeg', 0.85),
    });
  }
  return results;
};

const extractKeynoteSlides = async (
  file: File,
  format: 'A4' | 'A3',
  orientation: 'portrait' | 'landscape',
  baseTitle: string
): Promise<SafetyWallItem[]> => {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);
  const pdfEntry = zip.files['QuickLook/Preview.pdf'];
  if (!pdfEntry) throw new Error('No PDF preview found inside Keynote file');
  const pdfBytes = await pdfEntry.async('uint8array');
  return renderPDFToImages(pdfBytes, format, orientation, baseTitle);
};

const PAPER_RATIO: Record<string, string> = {
  'A4-portrait':  '210/297',
  'A4-landscape': '297/210',
  'A3-portrait':  '297/420',
  'A3-landscape': '420/297',
};

// Resize image to max 1400px and compress to keep localStorage usage low
const resizeImage = (file: File): Promise<string> =>
  new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const maxPx = 1400;
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });

const fileToBase64 = (file: File): Promise<string> =>
  new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const result = e.target!.result as string;
      resolve(result.split(',')[1]);
    };
    reader.readAsDataURL(file);
  });

interface SectionConfig {
  id: SectionType;
  label: string;
  fullName: string;
  color: string;
  icon: React.ElementType;
}

const SECTIONS: SectionConfig[] = [
  { id: 'S', label: 'S', fullName: 'Safety', color: 'bg-emerald-600', icon: ShieldCheck },
  { id: 'Q', label: 'Q', fullName: 'Quality', color: 'bg-blue-600', icon: CheckCircle2 },
  { id: 'Prod', label: 'Prod', fullName: 'Productivity', color: 'bg-cyan-600', icon: TrendingUp },
  { id: 'D', label: 'D', fullName: 'Delivery', color: 'bg-amber-600', icon: Truck },
  { id: '5S', label: '5S', fullName: '5S', color: 'bg-orange-600', icon: ClipboardList },
  { id: 'M', label: 'M', fullName: 'Machine', color: 'bg-slate-700', icon: Cpu },
  { id: 'Cap', label: 'People', fullName: 'People & Cap', color: 'bg-teal-600', icon: Users },
];

const getCurrentShift = (date: Date) => {
  const hour = date.getHours();
  if (hour >= 6 && hour < 14) return { name: 'Morning Shift', time: '06:00 - 14:00' };
  if (hour >= 14 && hour < 22) return { name: 'Afternoon Shift', time: '14:00 - 22:00' };
  return { name: 'Maintenance Window', time: '22:00 - 06:00' };
};

// --- Mock Data Helpers ---
const generateWeeklyData = (base: number, variance: number) => 
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
    name: day,
    value: Math.floor(base + (Math.random() * variance * 2 - variance))
  }));

// --- Controls Context ---
const ControlsContext = React.createContext<React.ReactNode>(null);

// --- Sub-components ---

const KPIBox = ({ label, value, unit, subtext, color, logCount, onOpenLog }: any) => (
  <div className="bg-white border-l-4 p-4 rounded shadow-sm relative" style={{ borderLeftColor: color }}>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pr-6">{label}</p>
    <div className="flex items-baseline gap-1 my-1">
      <h4 className="text-3xl font-black text-slate-800">{value}</h4>
      <span className="text-xs font-bold text-slate-400">{unit}</span>
    </div>
    <p className="text-[10px] font-medium text-slate-500">{subtext}</p>
    {onOpenLog && (
      <button
        onClick={onOpenLog}
        className="absolute top-2 right-2 flex items-center gap-0.5 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-md px-1.5 py-1 transition-all"
        title="View / add log records"
      >
        {logCount > 0
          ? <span className="text-xs font-black tabular-nums">{logCount}</span>
          : <Plus size={9} />}
      </button>
    )}
  </div>
);

const KPILogModal = ({
  label, logs, onClose, onAdd, onDelete, onExportAll,
}: {
  label: string;
  logs: KPILog[];
  onClose: () => void;
  onAdd: (log: KPILog) => void;
  onDelete: (id: string) => void;
  onExportAll: () => void;
}) => {
  const [fDate, setFDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [fPerson, setFPerson] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fAction, setFAction] = useState('');
  const [showForm, setShowForm] = useState(false);

  const myLogs = logs.filter(l => l.kpiLabel === label).sort((a, b) => b.timestamp - a.timestamp);

  const handleAdd = () => {
    if (!fPerson.trim() || !fDesc.trim()) return;
    onAdd({
      id: Date.now().toString(),
      kpiLabel: label,
      date: new Date(fDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      timestamp: new Date(fDate).getTime(),
      person: fPerson.trim(),
      description: fDesc.trim(),
      action: fAction.trim() || undefined,
    });
    setFPerson(''); setFDesc(''); setFAction('');
    setShowForm(false);
  };

  // accent colour per KPI type
  const accent = label === 'Near Miss Reports' ? 'bg-red-600' : label === 'Weekly Observations' ? 'bg-emerald-600' : 'bg-slate-700';
  const accentLight = label === 'Near Miss Reports' ? 'border-red-200 bg-red-50' : label === 'Weekly Observations' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50';
  const accentFocus = label === 'Near Miss Reports' ? 'focus:border-red-400' : 'focus:border-emerald-400';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[88vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <div className={cn("p-1.5 rounded-lg text-white shrink-0", accent)}>
            <ClipboardList size={13} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 leading-none">{label}</h3>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">{myLogs.length} record{myLogs.length !== 1 ? 's' : ''} total</p>
          </div>
          <button onClick={onExportAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all">
            <History size={11} /> Export CSV
          </button>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-all"><X size={14} /></button>
        </div>

        {/* Add button toggle */}
        <div className="px-5 pt-3 pb-2 shrink-0">
          <button
            onClick={() => setShowForm(v => !v)}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-[10px] font-black uppercase tracking-widest transition-all border",
              showForm ? "bg-slate-100 text-slate-500 border-slate-200" : cn(accent, "text-white border-transparent hover:opacity-90")
            )}
          >
            {showForm ? <X size={11} /> : <Plus size={11} />}
            {showForm ? 'Cancel' : 'Add New Record'}
          </button>
        </div>

        {/* Add form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden shrink-0"
            >
              <div className={cn("mx-5 mb-3 rounded-xl border p-4 flex flex-col gap-3", accentLight)}>
                {/* Date */}
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400 block mb-1">Date</label>
                  <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                    className={cn("w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none bg-white", accentFocus)} />
                </div>
                {/* Person */}
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400 block mb-1">Person / Operator *</label>
                  <input type="text" placeholder="Name, department, or team…" value={fPerson} onChange={e => setFPerson(e.target.value)}
                    className={cn("w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none bg-white", accentFocus)} />
                </div>
                {/* Description */}
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400 block mb-1">What happened / Observations *</label>
                  <textarea rows={3} placeholder="Describe the incident, unsafe act, or observation in detail…" value={fDesc} onChange={e => setFDesc(e.target.value)}
                    className={cn("w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none resize-none bg-white", accentFocus)} />
                </div>
                {/* Action */}
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400 block mb-1">Corrective Action <span className="normal-case text-slate-300">(optional)</span></label>
                  <input type="text" placeholder="Action taken or follow-up required…" value={fAction} onChange={e => setFAction(e.target.value)}
                    className={cn("w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 focus:outline-none bg-white", accentFocus)} />
                </div>
                <button onClick={handleAdd} disabled={!fPerson.trim() || !fDesc.trim()}
                  className={cn("w-full text-white rounded-xl py-2.5 text-[10px] font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5", accent)}>
                  <Plus size={11} /> Save Record
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Log list */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {myLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-200">
              <ClipboardList size={28} />
              <p className="text-[11px] font-black uppercase tracking-widest">No records yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {myLogs.map((log, idx) => (
                <div key={log.id} className="relative bg-slate-50 rounded-xl px-4 py-3 group border border-slate-100">
                  {/* Record number + date */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-black text-white bg-slate-400 rounded px-1.5 py-0.5 tabular-nums">
                      #{myLogs.length - idx}
                    </span>
                    <span className="text-[10px] font-black text-slate-400 uppercase">{log.date}</span>
                    <div className="flex-1" />
                    <button onClick={() => onDelete(log.id)}
                      className="text-slate-200 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100">
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {/* Person */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Users size={10} className="text-slate-400 shrink-0" />
                    <span className="text-xs font-black text-slate-700">{log.person}</span>
                  </div>
                  {/* Description */}
                  <p className="text-xs text-slate-600 leading-relaxed">{log.description}</p>
                  {/* Action */}
                  {log.action && (
                    <div className="mt-2 flex items-start gap-1.5 bg-white rounded-lg px-3 py-2 border border-slate-100">
                      <Target size={10} className="text-emerald-500 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-emerald-700 font-bold leading-snug">{log.action}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── Report Export Modal ──────────────────────────────────────────────────
const ReportExportModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const now = new Date();
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [reportType, setReportType] = useState<'monthly'|'quarterly'|'annual'>('monthly');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState('');

  // Editable data fields
  const [totalTonnage, setTotalTonnage] = useState('');
  const [dailyAvg, setDailyAvg]         = useState('');
  const [bestDay, setBestDay]           = useState('');
  const [amTotal, setAmTotal]           = useState('');
  const [pmTotal, setPmTotal]           = useState('');
  const [amEff, setAmEff]               = useState('');
  const [pmEff, setPmEff]               = useState('');
  const [amLoadTime, setAmLoadTime]     = useState('');
  const [pmLoadTime, setPmLoadTime]     = useState('');
  const [totalIssues, setTotalIssues]   = useState('');
  const [custComplaints, setCustComplaints] = useState('');
  const [internalFixed, setInternalFixed]   = useState('');
  const [loaderErrors, setLoaderErrors]     = useState('');
  const [opErrors, setOpErrors]         = useState('');
  const [safetyTotal, setSafetyTotal]   = useState('');
  const [safetySerious, setSafetySerious] = useState('');
  const [safetyMinor, setSafetyMinor]   = useState('');
  const [accidentFree, setAccidentFree] = useState('');
  const [woCompletion, setWoCompletion] = useState('');
  const [woCompleted, setWoCompleted]   = useState('');
  const [woPending, setWoPending]       = useState('');
  const [dtHours, setDtHours]           = useState('');
  const [actionItems, setActionItems]   = useState('');
  const [notes, setNotes]               = useState('');
  // Highlight boxes per section
  const [hlOverallIssues,  setHlOverallIssues]  = useState('');
  const [hlOverallDir,     setHlOverallDir]      = useState('');
  const [hlDeliveryIssues, setHlDeliveryIssues] = useState('');
  const [hlDeliveryDir,    setHlDeliveryDir]     = useState('');
  const [hlQualityIssues,  setHlQualityIssues]  = useState('');
  const [hlQualityDir,     setHlQualityDir]      = useState('');
  const [hlSafetyIssues,   setHlSafetyIssues]   = useState('');
  const [hlSafetyDir,      setHlSafetyDir]       = useState('');
  const [hlEquipIssues,    setHlEquipIssues]     = useState('');
  const [hlEquipDir,       setHlEquipDir]         = useState('');

  // Auto-load from localStorage/IDB on open
  useEffect(() => {
    // Safety
    const safetyStart = localStorage.getItem('safetyStartDate');
    if (safetyStart) {
      const days = Math.floor((Date.now() - new Date(safetyStart).getTime()) / 86400000);
      setAccidentFree(String(days));
    }
    // Machine downtime
    try {
      const logs = JSON.parse(localStorage.getItem('machineDowntimeLogs') || '[]');
      const thisMonth = now.getMonth(); const thisYear = now.getFullYear();
      const mLogs = logs.filter((l: any) => { const d = new Date(l.date); return d.getMonth()===thisMonth && d.getFullYear()===thisYear; });
      const totalH = Math.round(mLogs.reduce((s: number, l: any) => s + l.duration, 0) / 60 * 10) / 10;
      if (totalH > 0) setDtHours(String(totalH));
    } catch {}
    // Quality issues from IDB (async)
    idbGet<any[]>('qualityIssues').then(issues => {
      if (!issues?.length) return;
      const thisMonth = now.getMonth(); const thisYear = now.getFullYear();
      const mIssues = issues.filter((i: any) => { try { const d = new Date(i.date); return d.getMonth()===thisMonth && d.getFullYear()===thisYear; } catch { return false; } });
      if (mIssues.length > 0) {
        setTotalIssues(String(mIssues.length));
        setCustComplaints(String(mIssues.filter((i: any) => i.type === 'NCR').length));
      }
    });
    // Loader KPI periods
    idbGet<any[]>('loaderKpiPeriods').then(periods => {
      if (!periods?.length) return;
      const latest = periods[periods.length - 1];
      const validRows = latest.rows?.filter((r: any) => r.valid) ?? [];
      const total = Math.round(validRows.reduce((s: number, r: any) => s + r.weight / 1000, 0));
      const days = Math.max(1, new Set(validRows.map((r: any) => r.date)).size);
      if (total > 0) {
        setTotalTonnage(String(total));
        setDailyAvg((total / days).toFixed(1));
        const amR = validRows.filter((r: any) => r.shift === 'AM');
        const pmR = validRows.filter((r: any) => r.shift === 'PM');
        setAmTotal(String(Math.round(amR.reduce((s: number, r: any) => s + r.weight / 1000, 0))));
        setPmTotal(String(Math.round(pmR.reduce((s: number, r: any) => s + r.weight / 1000, 0))));
      }
    });
  }, []);

  // Capacity staffing loaded separately (used at export time)
  const loadCapacityStaffing = async () => {
    const emps = await idbGet<any[]>('operatorCapacity');
    if (!emps?.length) return null;
    const activeEmps = emps.filter((e: any) => e.active !== false);
    const staffing = activeEmps.map((e: any) => {
      const cost = e.rate * e.hours * (1 + (e.superPct ?? 11) / 100);
      return {
        name: e.name, machine: e.machine ?? '', role: e.role, shift: e.shift,
        efficiency: e.efficiency ?? 0, capacity: e.capacity ?? 0,
        hours: e.hours ?? 7, rate: e.rate ?? 0, superPct: e.superPct ?? 11,
        shiftCost: Math.round(cost * 100) / 100,
      };
    });
    const amOps = staffing.filter((r: any) => r.shift === 'morning' && r.role === 'operator');
    const pmOps = staffing.filter((r: any) => r.shift === 'afternoon' && r.role === 'operator');
    const amAll = staffing.filter((r: any) => r.shift === 'morning');
    const pmAll = staffing.filter((r: any) => r.shift === 'afternoon');
    const amCap  = Math.round(amOps.reduce((s: number, r: any) => s + r.capacity, 0) * 10) / 10;
    const pmCap  = Math.round(pmOps.reduce((s: number, r: any) => s + r.capacity, 0) * 10) / 10;
    const amCost = Math.round(amAll.reduce((s: number, r: any) => s + r.shiftCost, 0) * 100) / 100;
    const pmCost = Math.round(pmAll.reduce((s: number, r: any) => s + r.shiftCost, 0) * 100) / 100;
    const avgEff = staffing.filter((r: any) => r.role === 'operator' && r.efficiency > 0)
      .reduce((s: number, r: any, _: number, a: any[]) => s + r.efficiency / a.length, 0);
    return {
      staffing, amCap, pmCap, amCost, pmCost, avgEff,
      amCostPerTon: amCap > 0 ? Math.round(amCost / amCap * 100) / 100 : 0,
      pmCostPerTon: pmCap > 0 ? Math.round(pmCost / pmCap * 100) / 100 : 0,
      totalCostPerTon: (amCap + pmCap) > 0 ? Math.round((amCost + pmCost) / (amCap + pmCap) * 100) / 100 : 0,
    };
  };

  const getPeriodLabel = () => {
    if (reportType === 'monthly') return `${MONTH_NAMES[month]} ${year}`;
    if (reportType === 'quarterly') return `Q${quarter} ${year}`;
    return `${year} Annual`;
  };

  const handleExport = async () => {
    setGenerating(true);
    setStatus('正在生成图表...');
    try {
      const { renderBarChart, renderHBarChart } = await import('./lib/chartRenderer');
      const { generateReportDocx, buildEmptyReportData } = await import('./lib/reportGenerator');
      const data = buildEmptyReportData(getPeriodLabel(), reportType);

      // ── Load capacity staffing from IDB ──────────────────────────
      const capData = await loadCapacityStaffing();
      if (capData) {
        data.capacity.amCapacity    = capData.amCap;
        data.capacity.pmCapacity    = capData.pmCap;
        data.capacity.totalCapacity = capData.amCap + capData.pmCap;
        data.capacity.avgLoadEff    = Math.round(capData.avgEff * 100) / 100;
        data.capacity.costPerTon    = capData.totalCostPerTon;
        data.capacity.staffing      = capData.staffing;
        data.capacity.amTotalCost   = capData.amCost;
        data.capacity.pmTotalCost   = capData.pmCost;
        data.capacity.amCostPerTon  = capData.amCostPerTon;
        data.capacity.pmCostPerTon  = capData.pmCostPerTon;
        data.capacity.amHeadcount   = capData.staffing.filter((r: any) => r.shift === 'morning').length;
        data.capacity.pmHeadcount   = capData.staffing.filter((r: any) => r.shift === 'afternoon').length;
      }

      // Populate from form
      data.delivery.totalTonnage     = parseFloat(totalTonnage) || 0;
      data.delivery.dailyAvg         = parseFloat(dailyAvg) || 0;
      data.delivery.bestDay          = parseFloat(bestDay) || 0;
      data.delivery.amTotal          = parseFloat(amTotal) || 0;
      data.delivery.pmTotal          = parseFloat(pmTotal) || 0;
      data.delivery.amAvgEff         = parseFloat(amEff) || 0;
      data.delivery.pmAvgEff         = parseFloat(pmEff) || 0;
      data.delivery.avgLoadTimeMins  = { am: parseFloat(amLoadTime)||0, pm: parseFloat(pmLoadTime)||0 };
      data.quality.totalIssues       = parseInt(totalIssues) || 0;
      data.quality.customerComplaints= parseInt(custComplaints) || 0;
      data.quality.internalFixed     = parseInt(internalFixed) || 0;
      data.quality.loaderErrors      = parseInt(loaderErrors) || 0;
      data.quality.operatorErrors    = parseInt(opErrors) || 0;
      data.safety.totalIncidents     = parseInt(safetyTotal) || 0;
      data.safety.serious            = parseInt(safetySerious) || 0;
      data.safety.minor              = parseInt(safetyMinor) || 0;
      data.safety.accidentFreeDays   = parseInt(accidentFree) || 0;
      data.equipment.workOrderCompletion = parseInt(woCompletion) || 0;
      data.equipment.totalCompleted  = parseInt(woCompleted) || 0;
      data.equipment.totalPending    = parseInt(woPending) || 0;
      data.equipment.totalDowntimeHours = parseFloat(dtHours) || 0;
      data.other.actionItems         = actionItems.split('\n').map(s=>s.trim()).filter(Boolean);
      data.other.notes               = notes;
      data.highlights = {
        overall:   { issues: hlOverallIssues,  direction: hlOverallDir },
        delivery:  { issues: hlDeliveryIssues, direction: hlDeliveryDir },
        quality:   { issues: hlQualityIssues,  direction: hlQualityDir },
        safety:    { issues: hlSafetyIssues,   direction: hlSafetyDir },
        equipment: { issues: hlEquipIssues,    direction: hlEquipDir },
      };

      // ── Generate charts ────────────────────────────────────────────────
      setStatus('正在生成图表...');
      data.images = {};

      // Chart 1: Weekly delivery (AM vs PM stacked)
      if (data.delivery.weeklyBreakdown.length > 0 || (data.delivery.amTotal > 0)) {
        const wb = data.delivery.weeklyBreakdown;
        const labels = wb.length > 0 ? wb.map(w => w.week) : ['早班 AM', '下午班 PM'];
        data.images.deliveryChart = renderBarChart({
          title: '周次发货量 Weekly Tonnage', labels,
          datasets: wb.length > 0
            ? [{ label: '总发货量', data: wb.map(w => w.total), color: '#1a6b3a' }]
            : [
                { label: '早班 AM', data: [data.delivery.amTotal], color: '#3b82f6' },
                { label: '下午班 PM', data: [data.delivery.pmTotal], color: '#f97316' },
              ],
          unit: 't', stacked: wb.length > 0,
        });
      }

      // Chart 2: Shift efficiency comparison
      if (data.delivery.amAvgEff > 0 || data.delivery.pmAvgEff > 0) {
        data.images.shiftCompareChart = renderBarChart({
          title: '早班 / 下午班效率对比 Shift Efficiency',
          labels: ['早班 AM', '下午班 PM'],
          datasets: [{ label: '装载效率 t/h', data: [data.delivery.amAvgEff, data.delivery.pmAvgEff], color: '#1a6b3a' }],
          unit: ' t/h',
        });
      }

      // Chart 3: Quality issues breakdown
      if (data.quality.totalIssues > 0) {
        data.images.qualityChart = renderBarChart({
          title: '质量问题类型分布 Quality Issues Breakdown',
          labels: ['客户投诉', '内部解决', 'Loader失误', '操作员失误'],
          datasets: [{ label: '数量', data: [data.quality.customerComplaints, data.quality.internalFixed, data.quality.loaderErrors, data.quality.operatorErrors], color: '#ef4444' }],
        });
      }

      // Load detailed records from IDB
      setStatus('正在加载数据和照片...');
      const [qualityIssues, safetyAlerts, fiveSAudits, woData, dtLogs] = await Promise.all([
        idbGet<any[]>('qualityIssues'),
        idbGet<any[]>('safetyAlerts'),
        idbGet<any[]>('fiveSAudits'),
        idbGet<WorkOrder[]>('machineWorkOrders'),
        Promise.resolve(JSON.parse(localStorage.getItem('machineDowntimeLogs') || '[]')),
      ]);

      if (qualityIssues?.length) {
        data.quality.issues = qualityIssues.slice(0, 20).map((i: any) => ({
          date: i.date || '', order: i.title || '', cause: i.description || '',
          shift: '', type: i.type || '', result: i.status || '',
        }));
      }
      if (safetyAlerts?.length) {
        data.safety.incidents = safetyAlerts.slice(0, 10).map((a: any) => ({
          date: a.date || '', person: '', description: a.title || '',
          cause: a.description || '', action: '',
        }));
      }
      // Work order data → 4.3.3
      if (woData?.length) {
        const machineNames = ['FT-1','FT-2','MST','PL22','SL28','SL32','SL300','Robo'];
        data.equipment.workOrdersByMachine = machineNames.map(m => {
          const mWo = woData.filter((w: WorkOrder) => w.machine === m);
          return { machine: m, total: mWo.length, completed: mWo.filter((w: WorkOrder) => w.status==='completed').length, pending: mWo.filter((w: WorkOrder) => w.status!=='completed').length };
        }).filter(m => m.total > 0);
        const total = woData.length;
        const done  = woData.filter((w: WorkOrder) => w.status === 'completed').length;
        data.equipment.workOrderCompletion = total > 0 ? Math.round(done/total*100) : 0;
        data.equipment.totalCompleted = done;
        data.equipment.totalPending   = total - done;
        // Photos from work orders (up to 8)
        data.equipment.workOrderPhotos = woData
          .filter((w: WorkOrder) => w.photos?.length)
          .slice(0, 8)
          .flatMap((w: WorkOrder) => w.photos.slice(0,1).map((src: string) => ({ machine: w.machine, caption: `${w.machine} · ${w.date} · ${w.description.slice(0,30)}`, src })));
      }

      if (dtLogs?.length) {
        data.equipment.downtimeRecords = dtLogs.slice(0, 20).map((l: any) => ({
          date: l.date, machine: l.machine, description: l.notes || l.type,
          status: '已记录', hours: Math.round(l.duration / 60 * 10) / 10,
        }));
        // Chart 4: downtime by machine
        const machines = ['FT-1','FT-2','MST','PL22','SL28','SL32','SL300','Robo'];
        const dtByMachine = machines.map(m => ({
          name: m,
          h: Math.round(dtLogs.filter((l:any)=>l.machine===m).reduce((s:number,l:any)=>s+l.duration,0)/60*10)/10,
        })).filter(m => m.h > 0);
        if (dtByMachine.length > 0 && data.images) {
          data.images.downtimeChart = renderHBarChart({
            title: '各机器停机时长 Downtime by Machine',
            labels: dtByMachine.map(m => m.name),
            values: dtByMachine.map(m => m.h),
            color: '#ef4444', unit: 'h',
          });
        }
      }

      // ── Load photos ───────────────────────────────────────────────────
      // Safety photos
      if (safetyAlerts?.length && data.images) {
        data.images.safetyPhotos = safetyAlerts
          .filter((a:any) => a.photo)
          .slice(0, 6)
          .map((a:any) => ({ caption: `${a.title} (${a.date})`, src: a.photo }));
      }

      // 5S photos from latest audit
      if (fiveSAudits?.length && data.images) {
        const latestAudit = fiveSAudits[fiveSAudits.length - 1];
        const scores = latestAudit?.scores ?? {};
        const issuePhotos: {area:string;src:string}[] = [];
        const goodPhotos: {area:string;src:string}[] = [];
        for (const [areaId, sc] of Object.entries(scores as Record<string,any>)) {
          if (sc?.photo)     issuePhotos.push({ area: areaId, src: sc.photo });
          if (sc?.photoGood) goodPhotos.push({ area: areaId, src: sc.photoGood });
          if (sc?.photos?.length)     sc.photos.slice(0,2).forEach((p:string) => issuePhotos.push({ area: areaId, src: p }));
          if (sc?.photosGood?.length) sc.photosGood.slice(0,2).forEach((p:string) => goodPhotos.push({ area: areaId, src: p }));
        }
        data.images.fiveSIssuePhotos = issuePhotos.slice(0, 10);
        data.images.fiveSGoodPhotos  = goodPhotos.slice(0, 10);
      }

      setStatus('正在生成 Word 文档...');
      const blob = await generateReportDocx(data);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `Finesteel_${reportType === 'monthly' ? 'Monthly' : reportType === 'quarterly' ? 'Quarterly' : 'Annual'}_Report_${getPeriodLabel().replace(/\s/g,'_')}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('✓ 导出成功！');
      setTimeout(onClose, 1500);
    } catch (err) {
      console.error(err);
      setStatus('✗ 导出失败，请检查控制台');
    } finally {
      setGenerating(false);
    }
  };

  const Field = ({ label, value, onChange, placeholder='', type='text' }: { label:string; value:string; onChange:(v:string)=>void; placeholder?:string; type?:string }) => (
    <div className="flex flex-col gap-0.5">
      <label className="text-[8px] font-bold text-slate-400 uppercase">{label}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        className="text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-emerald-400 bg-white" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[680px] max-h-[90vh] overflow-hidden flex flex-col" onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-emerald-600 text-white rounded-t-2xl">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest opacity-80">Finesteel Production</p>
            <p className="text-[16px] font-black">导出报告 Export Report</p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X size={18}/></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 flex flex-col gap-4">
          {/* Report type + period */}
          <div className="grid grid-cols-3 gap-2">
            {(['monthly','quarterly','annual'] as const).map(t => (
              <button key={t} onClick={()=>setReportType(t)}
                className={cn('py-2 rounded-xl text-[10px] font-black border-2 transition-colors',
                  reportType===t ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-200 text-slate-500 hover:border-emerald-300')}>
                {t==='monthly'?'月度报告':t==='quarterly'?'季度报告':'年度报告'}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="flex flex-col gap-0.5 flex-1">
              <label className="text-[8px] font-bold text-slate-400 uppercase">年份</label>
              <select value={year} onChange={e=>setYear(+e.target.value)} className="text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none">
                {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
              </select>
            </div>
            {reportType==='monthly' && (
              <div className="flex flex-col gap-0.5 flex-1">
                <label className="text-[8px] font-bold text-slate-400 uppercase">月份</label>
                <select value={month} onChange={e=>setMonth(+e.target.value)} className="text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none">
                  {MONTH_NAMES.map((n,i)=><option key={i} value={i}>{n}</option>)}
                </select>
              </div>
            )}
            {reportType==='quarterly' && (
              <div className="flex flex-col gap-0.5 flex-1">
                <label className="text-[8px] font-bold text-slate-400 uppercase">季度</label>
                <select value={quarter} onChange={e=>setQuarter(+e.target.value)} className="text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none">
                  {[1,2,3,4].map(q=><option key={q} value={q}>Q{q}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="text-[9px] text-emerald-600 font-bold bg-emerald-50 rounded-lg px-3 py-2">
            📄 报告期间：{getPeriodLabel()} — 数据已从系统自动填充，可手动修改
          </div>

          {/* Section 1: Delivery */}
          <div className="border border-slate-100 rounded-xl p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">1. 发货量 Delivery</p>
            <div className="grid grid-cols-3 gap-2">
              <Field label="总发货量 (T)" value={totalTonnage} onChange={setTotalTonnage} placeholder="3147" />
              <Field label="日均 (T/天)" value={dailyAvg} onChange={setDailyAvg} placeholder="164.3" />
              <Field label="最高单日 (T)" value={bestDay} onChange={setBestDay} placeholder="205.6" />
              <Field label="早班总量 (T)" value={amTotal} onChange={setAmTotal} placeholder="1556" />
              <Field label="下午班总量 (T)" value={pmTotal} onChange={setPmTotal} placeholder="1292" />
              <Field label="早班效率 (t/h)" value={amEff} onChange={setAmEff} placeholder="14.9" />
              <Field label="下午班效率 (t/h)" value={pmEff} onChange={setPmEff} placeholder="13.0" />
              <Field label="早班均装车 (分)" value={amLoadTime} onChange={setAmLoadTime} placeholder="30.7" />
              <Field label="下午班均装车 (分)" value={pmLoadTime} onChange={setPmLoadTime} placeholder="40.6" />
            </div>
          </div>

          {/* Section 3: Quality */}
          <div className="border border-slate-100 rounded-xl p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">3. 质量问题 Quality</p>
            <div className="grid grid-cols-3 gap-2">
              <Field label="问题总数" value={totalIssues} onChange={setTotalIssues} placeholder="13" />
              <Field label="客户投诉" value={custComplaints} onChange={setCustComplaints} placeholder="8" />
              <Field label="内部解决" value={internalFixed} onChange={setInternalFixed} placeholder="5" />
              <Field label="Loader失误" value={loaderErrors} onChange={setLoaderErrors} placeholder="4" />
              <Field label="操作员失误" value={opErrors} onChange={setOpErrors} placeholder="5" />
            </div>
          </div>

          {/* Section 4: Safety */}
          <div className="border border-slate-100 rounded-xl p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">4. 安全 Safety</p>
            <div className="grid grid-cols-4 gap-2">
              <Field label="事故总数" value={safetyTotal} onChange={setSafetyTotal} placeholder="3" />
              <Field label="严重" value={safetySerious} onChange={setSafetySerious} placeholder="2" />
              <Field label="一般" value={safetyMinor} onChange={setSafetyMinor} placeholder="1" />
              <Field label="无事故天数" value={accidentFree} onChange={setAccidentFree} placeholder="42" />
            </div>
          </div>

          {/* Section 5: Equipment */}
          <div className="border border-slate-100 rounded-xl p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">5. 设备管理 Equipment</p>
            <div className="grid grid-cols-4 gap-2">
              <Field label="工单完成率 %" value={woCompletion} onChange={setWoCompletion} placeholder="72" />
              <Field label="已完成工单" value={woCompleted} onChange={setWoCompleted} placeholder="67" />
              <Field label="待完成工单" value={woPending} onChange={setWoPending} placeholder="25" />
              <Field label="停机总时间 (h)" value={dtHours} onChange={setDtHours} placeholder="89" />
            </div>
          </div>

          {/* Highlight boxes */}
          <div className="border-2 border-emerald-100 rounded-xl p-3 bg-emerald-50/40">
            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700 mb-3">🔴🟢 关键问题 + 下期方向（每个板块）</p>
            <p className="text-[8px] text-slate-400 mb-2">每行一条，将自动生成红色/绿色高亮框嵌入报告每个板块</p>
            {([
              { label: '封面总体', setI: setHlOverallIssues, setD: setHlOverallDir, vi: hlOverallIssues, vd: hlOverallDir },
              { label: '发货量', setI: setHlDeliveryIssues, setD: setHlDeliveryDir, vi: hlDeliveryIssues, vd: hlDeliveryDir },
              { label: '质量问题', setI: setHlQualityIssues, setD: setHlQualityDir, vi: hlQualityIssues, vd: hlQualityDir },
              { label: '安全事故', setI: setHlSafetyIssues, setD: setHlSafetyDir, vi: hlSafetyIssues, vd: hlSafetyDir },
              { label: '设备管理', setI: setHlEquipIssues, setD: setHlEquipDir, vi: hlEquipIssues, vd: hlEquipDir },
            ]).map(({ label, setI, setD, vi, vd }) => (
              <div key={label} className="mb-3 last:mb-0">
                <p className="text-[8px] font-black text-slate-600 uppercase mb-1">{label}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <textarea value={vi} onChange={e=>setI(e.target.value)}
                    placeholder="🔴 关键问题（每行一条）" rows={2}
                    className="text-[9px] border border-red-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-red-400 bg-red-50/30" />
                  <textarea value={vd} onChange={e=>setD(e.target.value)}
                    placeholder="🟢 下期工作方向（每行一条）" rows={2}
                    className="text-[9px] border border-emerald-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-emerald-400 bg-emerald-50/30" />
                </div>
              </div>
            ))}
          </div>

          {/* Section 6: Other */}
          <div className="border border-slate-100 rounded-xl p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">其他行动项 Other Action Items</p>
            <textarea value={actionItems} onChange={e=>setActionItems(e.target.value)}
              placeholder="每行一条行动项，例如：&#10;落实装车确认SOP&#10;强化测量制度" rows={3}
              className="w-full text-[10px] border border-slate-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-emerald-400" />
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="其他备注..." rows={2}
              className="w-full text-[10px] border border-slate-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-emerald-400 mt-2" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-3">
          {status && <span className={cn('text-[10px] font-bold', status.startsWith('✓')?'text-emerald-600':'text-red-500')}>{status}</span>}
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-[10px] font-bold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50">取消</button>
            <button onClick={handleExport} disabled={generating}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black rounded-xl transition-colors disabled:opacity-50">
              {generating ? <RefreshCw size={11} className="animate-spin"/> : <BarChart2 size={11}/>}
              {generating ? '生成中...' : '导出 Word (.docx)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [time, setTime] = useState(new Date());
  const [activeSection, setActiveSection] = useState<SectionType>('S');
  const [isAutoRotate, setIsAutoRotate] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const currentShift = getCurrentShift(time);

  const [safetyStartDate, setSafetyStartDate] = useState<string>(() =>
    localStorage.getItem('safetyStartDate') || '2025-01-01'
  );
  const [safetyBestRecord, setSafetyBestRecord] = useState<number>(() =>
    parseInt(localStorage.getItem('safetyBestRecord') || '0')
  );

  const accidentFreeDays = Math.max(0, Math.floor(
    (time.getTime() - new Date(safetyStartDate).getTime()) / 86400000
  ));

  const handleSetSafetyStartDate = (date: string) => {
    if (accidentFreeDays > safetyBestRecord) {
      setSafetyBestRecord(accidentFreeDays);
      localStorage.setItem('safetyBestRecord', String(accidentFreeDays));
    }
    setSafetyStartDate(date);
    localStorage.setItem('safetyStartDate', date);
  };

  const handleSetBestRecord = (days: number) => {
    setSafetyBestRecord(days);
    localStorage.setItem('safetyBestRecord', String(days));
  };

  const nextSection = useCallback(() => {
    setActiveSection(prev => {
      const currentIndex = SECTIONS.findIndex(s => s.id === prev);
      const nextIndex = (currentIndex + 1) % SECTIONS.length;
      return SECTIONS[nextIndex].id;
    });
  }, []);

  const prevSection = useCallback(() => {
    setActiveSection(prev => {
      const currentIndex = SECTIONS.findIndex(s => s.id === prev);
      const nextIndex = (currentIndex - 1 + SECTIONS.length) % SECTIONS.length;
      return SECTIONS[nextIndex].id;
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isAutoRotate) return;
    const interval = setInterval(nextSection, 10000);
    return () => clearInterval(interval);
  }, [isAutoRotate, nextSection]);

  const currentSectionConfig = SECTIONS.find(s => s.id === activeSection)!;

  const controlsNode = (
    <div className="flex items-center gap-4 shrink-0">
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
        <button onClick={prevSection} className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-slate-900 transition-all">
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={() => setIsAutoRotate(!isAutoRotate)}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all w-36",
            isAutoRotate ? "bg-blue-600 text-white shadow-md" : "bg-white text-slate-600 border border-slate-200"
          )}
        >
          <div className="flex items-center gap-2 mx-auto">
            {isAutoRotate ? <RefreshCw size={12} className="animate-spin" /> : <Lock size={12} />}
            {isAutoRotate ? "Loop (10s)" : "Fixed View"}
          </div>
        </button>
        <button onClick={nextSection} className="p-1.5 hover:bg-white rounded-lg text-slate-400 hover:text-slate-900 transition-all">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="h-6 w-px bg-slate-200" />
      <div className="text-right">
        <p className="text-sm font-black text-slate-500 uppercase tracking-widest">{currentShift.name}</p>
        <div className="flex items-center gap-2 justify-end">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-2xl font-mono font-black text-slate-800 leading-none">
            {time.toLocaleTimeString([], { hour12: false })}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <ControlsContext.Provider value={controlsNode}>
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900 select-none overflow-hidden">
      {/* Main Section Area */}
      <main className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {activeSection === 'S' && <SafetySection key="S" color={currentSectionConfig.color} accidentFreeDays={accidentFreeDays} bestRecord={safetyBestRecord} startDate={safetyStartDate} onSetStartDate={handleSetSafetyStartDate} onSetBestRecord={handleSetBestRecord} />}
          {activeSection === 'Q' && <QualitySection key="Q" color={currentSectionConfig.color} />}
          {activeSection === 'Prod' && <ProductivitySection key="Prod" color={currentSectionConfig.color} />}
          {activeSection === 'D' && <DeliverySection key="D" color={currentSectionConfig.color} />}
          {activeSection === '5S' && <FiveSSection key="5S" color={currentSectionConfig.color} />}
          {activeSection === 'M' && <MachineSection key="M" color={currentSectionConfig.color} />}
          {activeSection === 'Cap' && <CapacitySection key="Cap" color={currentSectionConfig.color} />}
        </AnimatePresence>
      </main>

      {/* Section Indicator Footer */}
      <footer className="bg-white border-t border-slate-200 p-2 flex justify-center gap-3">
        {SECTIONS.map(s => (
          <button 
            key={s.id}
            onClick={() => {
              setActiveSection(s.id);
              setIsAutoRotate(false);
            }}
            className={cn(
              "px-6 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
              activeSection === s.id 
                ? "bg-slate-800 text-white shadow-lg scale-110" 
                : "text-slate-400 hover:bg-slate-100"
            )}
          >
            {s.id}: {s.fullName}
          </button>
        ))}
      </footer>

      {/* ── Floating report export button ──────────────────────────── */}
      <button
        onClick={() => setShowReportModal(true)}
        className="fixed bottom-16 right-4 z-40 flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black rounded-xl shadow-lg transition-all hover:scale-105"
      >
        <BarChart2 size={13} /> 导出报告
      </button>

      {/* ── Report export modal ─────────────────────────────────────── */}
      {showReportModal && <ReportExportModal onClose={() => setShowReportModal(false)} />}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=JetBrains+Mono:wght@700&display=swap');
      `}</style>
    </div>
    </ControlsContext.Provider>
  );
}

// --- Specific Section Components ---

interface SectionProps {
  color: string;
}

interface SafetySectionProps extends SectionProps {
  accidentFreeDays: number;
  bestRecord: number;
  startDate: string;
  onSetStartDate: (date: string) => void;
  onSetBestRecord: (days: number) => void;
}

const SectionWrapper = ({ children, title, icon: Icon, color }: any) => {
  const controls = React.useContext(ControlsContext);
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.5 }}
      className="absolute inset-0 p-6 flex flex-col gap-6 overflow-y-auto"
    >
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-lg text-white", color)}>
          <Icon size={20} />
        </div>
        <h2 className="text-xl font-black uppercase tracking-widest text-slate-800">{title}</h2>
        <div className="flex-1 h-px bg-slate-200 ml-4" />
        {controls}
      </div>
      {children}
    </motion.div>
  );
};

const SafetySection: React.FC<SafetySectionProps> = ({ color, accidentFreeDays, bestRecord, startDate, onSetStartDate, onSetBestRecord }) => {
  const [editing, setEditing] = useState(false);
  const [inputDate, setInputDate] = useState(startDate);
  const [editingRecord, setEditingRecord] = useState(false);
  const [inputRecord, setInputRecord] = useState(String(bestRecord));
  const [lastMeeting, setLastMeeting] = useState(() => localStorage.getItem('safetyLastMeeting') || '');
  const [nextMeeting, setNextMeeting] = useState(() => localStorage.getItem('safetyNextMeeting') || '');
  const isNewRecord = accidentFreeDays > 0 && accidentFreeDays >= bestRecord;

  // KPI Logs state
  const [kpiLogs, setKpiLogs] = useState<KPILog[]>(() => {
    try { return JSON.parse(localStorage.getItem('safetyKPILogs') || '[]'); } catch { return []; }
  });
  const [logModalKpi, setLogModalKpi] = useState<string | null>(null);

  const saveKpiLogs = (updated: KPILog[]) => {
    setKpiLogs(updated);
    localStorage.setItem('safetyKPILogs', JSON.stringify(updated));
  };

  const exportAllKpiLogs = () => {
    const headers = ['Date', 'KPI', 'Person', 'Description', 'Corrective Action'];
    const rows = [...kpiLogs]
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(l => [l.date, l.kpiLabel, l.person, l.description, l.action ?? '']);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `safety-kpi-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // Safety Alerts state — stored in IndexedDB
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  useEffect(() => {
    migrateFromLS('safetyAlerts');
    idbGet<SafetyAlert[]>('safetyAlerts').then(data => { if (data?.length) setAlerts(data); });
  }, []);
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formSeverity, setFormSeverity] = useState<'low' | 'medium' | 'high'>('medium');
  const [formPhoto, setFormPhoto] = useState<string | undefined>();
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  // Alert slideshow state
  const [alertPage, setAlertPage] = useState(0);
  const [alertPlaying, setAlertPlaying] = useState(true);
  const [alertProgress, setAlertProgress] = useState(0);

  const alertTotal = alerts.length;
  const currentAlert = alerts[alertPage % Math.max(1, alertTotal)] || null;

  useEffect(() => {
    if (!alertPlaying || alertTotal <= 1) return;
    const t = setTimeout(() => setAlertPage(p => (p + 1) % alertTotal), 10000);
    return () => clearTimeout(t);
  }, [alertPlaying, alertPage, alertTotal]);

  useEffect(() => {
    if (!alertPlaying || alertTotal <= 1) { setAlertProgress(0); return; }
    setAlertProgress(0);
    const start = Date.now();
    const iv = setInterval(() => setAlertProgress(Math.min(100, ((Date.now() - start) / 10000) * 100)), 80);
    return () => clearInterval(iv);
  }, [alertPlaying, alertPage, alertTotal]);

  const saveAlerts = (updated: SafetyAlert[]) => {
    setAlerts(updated);
    idbSet('safetyAlerts', updated);
  };

  const handleAddAlert = () => {
    if (!formTitle.trim()) return;
    saveAlerts([{
      id: Date.now().toString(),
      title: formTitle.trim(),
      description: formDesc.trim(),
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      severity: formSeverity,
      photo: formPhoto,
    }, ...alerts]);
    setShowForm(false);
    setFormTitle(''); setFormDesc(''); setFormSeverity('medium'); setFormPhoto(undefined);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setFormPhoto(await resizeImage(file));
  };

  const severityStyle = (s: SafetyAlert['severity']) =>
    s === 'high' ? 'bg-red-100 text-red-700' :
    s === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-yellow-100 text-yellow-700';

  const handleConfirm = () => {
    if (inputDate) { onSetStartDate(inputDate); setEditing(false); }
  };

  return (
    <SectionWrapper title="Safety - No.1 Priority" icon={ShieldCheck} color={color}>
      {/* Lightbox */}
      <AnimatePresence>
        {lightboxPhoto && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6"
            onClick={() => setLightboxPhoto(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="relative bg-white shadow-2xl overflow-hidden"
              style={{ maxHeight: '90vh', aspectRatio: '210/297', maxWidth: '60vw' }}
              onClick={e => e.stopPropagation()}
            >
              <img src={lightboxPhoto} alt="Safety Alert" className="w-full h-full object-contain" />
              <button
                onClick={() => setLightboxPhoto(null)}
                className="absolute top-3 right-3 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80 transition-all"
              >
                <X size={16} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI Log Modal */}
      <AnimatePresence>
        {logModalKpi && (
          <KPILogModal
            label={logModalKpi}
            logs={kpiLogs}
            onClose={() => setLogModalKpi(null)}
            onAdd={log => saveKpiLogs([log, ...kpiLogs])}
            onDelete={id => saveKpiLogs(kpiLogs.filter(l => l.id !== id))}
            onExportAll={exportAllKpiLogs}
          />
        )}
      </AnimatePresence>

      {/* ── Quality-style KPI strip ───────────────────────────────── */}
      {(() => {
        const now = new Date();
        const thisYear = now.getFullYear();
        const thisMonth = now.getMonth();
        const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1)); d.setHours(0,0,0,0); return d.getTime(); })();
        const weeklyCount  = kpiLogs.filter(l => l.kpiLabel === 'Weekly Observations' && l.timestamp >= weekStart).length;
        const nearMissCount = kpiLogs.filter(l => l.kpiLabel === 'Near Miss Reports').length;
        const ppeCount     = kpiLogs.filter(l => l.kpiLabel === 'PPE Compliance').length;
        const mechCount    = kpiLogs.filter(l => l.kpiLabel === 'Mechanical Incident').length;
        const injuryCount  = kpiLogs.filter(l => l.kpiLabel === 'Personal Injury').length;
        const amCount      = kpiLogs.filter(l => l.kpiLabel === 'AM Incident').length;
        const pmCount      = kpiLogs.filter(l => l.kpiLabel === 'PM Incident').length;
        const yearTotal    = kpiLogs.filter(l => ['Near Miss Reports','Mechanical Incident','Personal Injury'].includes(l.kpiLabel) && new Date(l.timestamp).getFullYear() === thisYear).length;
        const monthTotal   = kpiLogs.filter(l => ['Near Miss Reports','Mechanical Incident','Personal Injury'].includes(l.kpiLabel) && new Date(l.timestamp).getMonth() === thisMonth && new Date(l.timestamp).getFullYear() === thisYear).length;
        const nextDays     = nextMeeting ? Math.ceil((new Date(nextMeeting).getTime() - Date.now()) / 86400000) : null;
        const lastDaysAgo  = lastMeeting ? Math.floor((Date.now() - new Date(lastMeeting).getTime()) / 86400000) : null;

        return (
          <div className="grid gap-3 shrink-0" style={{ gridTemplateColumns: '1fr 1fr 1.6fr 1.6fr 2fr' }}>
            {/* 2 stat cards */}
            {([
              { label:'年度安全事件', sublabel:`${thisYear} Year-to-Date`, value: yearTotal,  accent: yearTotal > 0 ? '#DC2626' : '#059669', bg: yearTotal > 0 ? 'bg-red-50' : 'bg-green-50' },
              { label:'本月安全记录', sublabel:`${MONTH_NAMES[thisMonth]} Total`, value: monthTotal, accent: monthTotal > 0 ? '#D97706' : '#059669', bg: monthTotal > 0 ? 'bg-amber-50' : 'bg-green-50' },
            ] as { label:string; sublabel:string; value:string|number; accent:string; bg:string }[]).map(({ label, sublabel, value, accent, bg }) => (
              <div key={label} className={cn('rounded-xl px-3 py-3 flex items-center gap-3 border-2', bg)} style={{ borderColor: accent+'33' }}>
                <button onClick={() => setLogModalKpi(label)}
                  className="flex flex-col items-center justify-center rounded-lg w-14 h-14 shrink-0 hover:brightness-95 transition-all"
                  style={{ backgroundColor: accent+'22' }}>
                  <span className="text-2xl font-black tabular-nums leading-none" style={{ color: accent }}>{value}</span>
                </button>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <p className="text-xs font-black text-slate-800 leading-tight">{label}</p>
                  <p className="text-[10px] font-bold text-slate-400 leading-tight">{sublabel}</p>
                </div>
              </div>
            ))}

            {/* 事件类型 CAUSE */}
            <div className="rounded-xl p-3 border-2 bg-red-50 flex flex-col gap-2" style={{ borderColor: '#EF444433' }}>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">事件类型 Cause</p>
              <div className="flex gap-1.5 flex-1 items-center">
                {[
                  { label:'机械事故', sub:'Mechanical', count: mechCount,     color:'#2563EB', kpi:'Mechanical Incident' },
                  { label:'人员受伤', sub:'Injury',      count: injuryCount,   color:'#7C3AED', kpi:'Personal Injury' },
                  { label:'险兆事件', sub:'Near Miss',   count: nearMissCount, color:'#D97706', kpi:'Near Miss Reports' },
                ].map(({ label, sub, count, color, kpi }) => (
                  <button key={label} onClick={() => setLogModalKpi(kpi)}
                    className="flex-1 flex flex-col items-center justify-center rounded-lg py-2 hover:brightness-95 transition-all"
                    style={{ backgroundColor: color+'22' }}>
                    <span className="text-2xl font-black tabular-nums leading-none" style={{ color }}>{count}</span>
                    <span className="text-[10px] font-black mt-1" style={{ color }}>{label}</span>
                    <span className="text-[9px] font-bold" style={{ color: color+'99' }}>{sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 班次 SHIFT */}
            <div className="rounded-xl p-3 border-2 bg-indigo-50 flex flex-col gap-2" style={{ borderColor: '#6366F133' }}>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">班次 Shift</p>
              <div className="flex gap-1.5 flex-1 items-center">
                <button onClick={() => setLogModalKpi('AM Incident')}
                  className="flex-1 flex flex-col items-center justify-center rounded-lg py-2 hover:brightness-95 transition-all"
                  style={{ backgroundColor: '#6366F122' }}>
                  <span className="text-2xl font-black tabular-nums leading-none text-indigo-600">{amCount}</span>
                  <span className="text-[10px] font-black text-indigo-500 mt-1">早班</span>
                  <span className="text-[9px] font-bold text-indigo-300">Morning AM</span>
                </button>
                <button onClick={() => setLogModalKpi('PM Incident')}
                  className="flex-1 flex flex-col items-center justify-center rounded-lg py-2 hover:brightness-95 transition-all"
                  style={{ backgroundColor: '#EC489922' }}>
                  <span className="text-2xl font-black tabular-nums leading-none text-pink-600">{pmCount}</span>
                  <span className="text-[10px] font-black text-pink-500 mt-1">下午班</span>
                  <span className="text-[9px] font-bold text-pink-300">Afternoon PM</span>
                </button>
              </div>
            </div>

            {/* Safety Meeting */}
            <div className="rounded-xl p-3 border-2 bg-purple-50 flex flex-col gap-2" style={{ borderColor: '#7C3AED33' }}>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Safety Meeting</p>
              <div className="flex flex-col gap-2 flex-1 justify-center">
                <div className="flex items-center gap-2">
                  <span className="text-[8px] text-slate-500 font-bold w-10 shrink-0">上次</span>
                  <input type="date" value={lastMeeting}
                    onChange={e => { setLastMeeting(e.target.value); localStorage.setItem('safetyLastMeeting', e.target.value); }}
                    className="flex-1 text-[9px] border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-purple-400 bg-white" />
                  {lastDaysAgo != null && <span className="text-[8px] text-slate-400 shrink-0 whitespace-nowrap">{lastDaysAgo}天前</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] text-slate-500 font-bold w-10 shrink-0">下次</span>
                  <input type="date" value={nextMeeting}
                    onChange={e => { setNextMeeting(e.target.value); localStorage.setItem('safetyNextMeeting', e.target.value); }}
                    className={cn('flex-1 text-[9px] border rounded-lg px-2 py-1 focus:outline-none bg-white',
                      nextDays != null && nextDays < 0 ? 'border-red-300 focus:border-red-400' :
                      nextDays != null && nextDays <= 7 ? 'border-amber-300 focus:border-amber-400' : 'border-slate-200 focus:border-purple-400')} />
                  {nextDays != null && (
                    <span className={cn('text-[8px] font-bold shrink-0 whitespace-nowrap',
                      nextDays < 0 ? 'text-red-500' : nextDays <= 7 ? 'text-amber-500' : 'text-emerald-600')}>
                      {nextDays < 0 ? `逾期${Math.abs(nextDays)}天` : nextDays === 0 ? '今天' : `${nextDays}天后`}
                    </span>
                  )}
                </div>
                {weeklyCount > 0 && (
                  <div className="text-[8px] text-slate-400 text-center">本周观察记录 {weeklyCount} 条</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(220px,320px)_1fr] gap-6 flex-1 min-h-0">

        {/* Safety Wall */}
        <SafetyWall />

        {/* Safety Alerts — A4 portrait ratio */}
        <div className="bg-white border-2 border-slate-100 rounded-2xl px-3 py-2 shadow-sm flex flex-col overflow-hidden" style={{ aspectRatio: '210/297', height: '100%', width: 'auto' }}>
          <div className="flex items-center justify-between mb-2 shrink-0">
            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Safety Alerts</h3>
            <button
              onClick={() => setShowForm(v => !v)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                showForm ? "bg-slate-200 text-slate-600" : "bg-red-600 text-white hover:bg-red-700"
              )}
            >
              {showForm ? <X size={10} /> : <Plus size={10} />}
              {showForm ? 'Cancel' : 'Add'}
            </button>
          </div>

          {/* Add Alert Form */}
          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden shrink-0"
              >
                <div className="border border-red-200 bg-red-50 rounded-xl p-4 mb-4 flex flex-col gap-3 overflow-y-auto max-h-72">
                  <input
                    type="text"
                    placeholder="Alert title *"
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-red-400"
                  />
                  <textarea
                    placeholder="Description (optional)"
                    value={formDesc}
                    onChange={e => setFormDesc(e.target.value)}
                    rows={2}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-red-400 resize-none"
                  />
                  <div className="flex gap-2">
                    {(['high', 'medium', 'low'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => setFormSeverity(s)}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all border",
                          formSeverity === s
                            ? s === 'high' ? 'bg-red-600 text-white border-red-600'
                              : s === 'medium' ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-yellow-400 text-yellow-900 border-yellow-400'
                            : 'bg-white text-slate-400 border-slate-200'
                        )}
                      >{s}</button>
                    ))}
                  </div>

                  {/* Photo upload */}
                  <label className="flex items-center gap-2 cursor-pointer border border-dashed border-slate-300 rounded-lg p-2 hover:border-red-400 transition-all">
                    <Camera size={14} className="text-slate-400 shrink-0" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                      {formPhoto ? 'Photo attached ✓' : 'Upload photo (A4 portrait)'}
                    </span>
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                  </label>
                  {formPhoto && (
                    <div className="relative bg-slate-100 rounded-lg overflow-hidden flex items-center gap-3 p-2">
                      <div className="relative shrink-0 rounded overflow-hidden" style={{ width: 48, height: 68 }}>
                        <img src={formPhoto} alt="preview" className="w-full h-full object-cover" />
                      </div>
                      <p className="text-[10px] font-bold text-slate-500 flex-1">Photo ready — full A4 view available after submitting.</p>
                      <button
                        onClick={() => setFormPhoto(undefined)}
                        className="shrink-0 bg-slate-200 hover:bg-red-100 text-slate-500 hover:text-red-600 rounded-full p-1 transition-all"
                      ><X size={10} /></button>
                    </div>
                  )}

                  <button
                    onClick={handleAddAlert}
                    disabled={!formTitle.trim()}
                    className="w-full bg-red-600 text-white rounded-lg py-2 text-[10px] font-black uppercase tracking-widest hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Submit Alert
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Slideshow controls */}
          {alertTotal > 0 && (
            <div className="flex items-center gap-1 mb-2 shrink-0">
              <button onClick={() => setAlertPage(p => (p - 1 + alertTotal) % alertTotal)} className="p-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-500 transition-all"><ChevronLeft size={11} /></button>
              <button onClick={() => setAlertPlaying(v => !v)} className={cn("p-1 rounded transition-all", alertPlaying ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-500 hover:bg-slate-200")}>
                {alertPlaying ? <Pause size={11} /> : <Play size={11} />}
              </button>
              <button onClick={() => setAlertPage(p => (p + 1) % alertTotal)} className="p-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-500 transition-all"><ChevronRight size={11} /></button>
              <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden mx-1">
                <div className="h-full bg-red-500 rounded-full" style={{ width: `${alertProgress}%` }} />
              </div>
              <span className="text-[10px] font-black text-slate-400 tabular-nums">{alertPage + 1}/{alertTotal}</span>
            </div>
          )}

          {/* Alert Slideshow */}
          <div className="flex-1 min-h-0 relative overflow-hidden rounded-xl">
            {alertTotal === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-2">
                <ShieldCheck size={32} />
                <p className="text-[10px] font-black uppercase tracking-widest">No active alerts</p>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div key={alertPage}
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0"
                >
                  {currentAlert && (
                    <div className="w-full h-full rounded-xl overflow-hidden border border-slate-100 relative group">
                      {currentAlert.photo ? (
                        <>
                          <img src={currentAlert.photo} alt={currentAlert.title} className="w-full h-full object-contain bg-white cursor-pointer"
                            onClick={() => setLightboxPhoto(currentAlert.photo!)} />
                          <button onClick={() => saveAlerts(alerts.filter(a => a.id !== currentAlert.id))}
                            className="absolute top-2 right-2 bg-black/50 hover:bg-red-600 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-all">
                            <Trash2 size={11} />
                          </button>
                        </>
                      ) : (
                        <div className="w-full h-full bg-slate-50 flex flex-col items-center justify-center gap-3 p-4">
                          <span className={cn("px-2 py-1 rounded text-[10px] font-black uppercase", severityStyle(currentAlert.severity))}>{currentAlert.severity}</span>
                          <p className="text-sm font-black text-slate-800 text-center">{currentAlert.title}</p>
                          {currentAlert.description && <p className="text-xs text-slate-500 text-center">{currentAlert.description}</p>}
                          <p className="text-xs text-slate-400 font-bold uppercase">{currentAlert.date}</p>
                          <button onClick={() => saveAlerts(alerts.filter(a => a.id !== currentAlert.id))}
                            className="mt-2 text-slate-300 hover:text-red-500 transition-all"><Trash2 size={14} /></button>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* Safe Days Counter + Best Record */}
        <div className="bg-emerald-600 rounded-2xl p-6 text-white relative overflow-hidden shadow-xl shadow-emerald-600/20 flex flex-col justify-between" style={{ height: '100%' }}>
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <ShieldCheck size={200} />
          </div>

          <div>
            <h1 className="font-black leading-tight mb-2" style={{ fontSize: 'clamp(1rem, 1.8vw, 2.2rem)' }}>
              WE HAVE WORKED
              <br />
              <motion.span
                key={accidentFreeDays}
                initial={{ scale: 1.2, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-emerald-300 block"
                style={{ fontSize: 'clamp(4rem, 7vw, 10rem)', lineHeight: 1 }}
              >
                {accidentFreeDays}
              </motion.span>
              SAFE DAYS
            </h1>
            <p className="font-bold text-emerald-200 uppercase tracking-widest mt-1" style={{ fontSize: 'clamp(0.6rem, 0.9vw, 1.2rem)' }}>
              Since {new Date(startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>

          {/* Best Record */}
          <div className="border-t border-white/20 pt-4 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <Award size={16} className="text-yellow-300" />
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Best Record</span>
              {isNewRecord && (
                <span className="px-2 py-0.5 bg-yellow-400 text-yellow-900 rounded text-[10px] font-black uppercase tracking-wider">New!</span>
              )}
            </div>
            {editingRecord ? (
              <div className="flex items-center gap-2">
                <input
                  type="number" min="0" value={inputRecord}
                  onChange={e => setInputRecord(e.target.value)}
                  className="w-24 bg-white/10 border border-white/30 rounded-lg px-3 py-1.5 text-xl font-black text-white focus:outline-none focus:border-white"
                />
                <span className="text-emerald-300 font-bold text-sm">days</span>
                <button onClick={() => { onSetBestRecord(Math.max(0, parseInt(inputRecord) || 0)); setEditingRecord(false); }} className="p-1.5 bg-white text-emerald-700 rounded-lg hover:bg-emerald-100 transition-all"><CheckCircle2 size={14} /></button>
                <button onClick={() => { setEditingRecord(false); setInputRecord(String(Math.max(bestRecord, accidentFreeDays))); }} className="p-1.5 bg-white/10 rounded-lg hover:bg-white/20 transition-all"><AlertCircle size={14} /></button>
              </div>
            ) : (
              <div className="flex items-baseline gap-3">
                <span className="font-black text-white leading-none" style={{ fontSize: 'clamp(2rem, 3vw, 4.5rem)', lineHeight: 1 }}>
                  {Math.max(bestRecord, accidentFreeDays)}
                </span>
                <span className="font-bold text-emerald-300" style={{ fontSize: 'clamp(0.75rem, 1.2vw, 2rem)' }}>days</span>
                <button onClick={() => { setInputRecord(String(Math.max(bestRecord, accidentFreeDays))); setEditingRecord(true); }} className="p-1.5 bg-white/10 rounded-lg hover:bg-white/20 transition-all"><Settings size={12} /></button>
              </div>
            )}
          </div>

          {/* Set Start Date */}
          <div className="mt-4 border-t border-white/20 pt-4">
            {editing ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-black uppercase text-emerald-200 tracking-widest">Set accident-free start date</p>
                <input
                  type="date" value={inputDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={e => setInputDate(e.target.value)}
                  className="w-full bg-white/10 border border-white/30 rounded-lg px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-white"
                />
                <div className="flex gap-2">
                  <button onClick={handleConfirm} className="flex-1 bg-white text-emerald-700 rounded-lg py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all">Confirm</button>
                  <button onClick={() => { setEditing(false); setInputDate(startDate); }} className="flex-1 bg-white/10 rounded-lg py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setEditing(true)} className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 rounded-lg py-2 text-[10px] font-black uppercase tracking-widest transition-all">
                <Settings size={12} /> Reset Counter / Set Date
              </button>
            )}
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
};

const SafetyWall: React.FC = () => {
  const [items, setItems] = useState<SafetyWallItem[]>([]);
  useEffect(() => {
    migrateFromLS('safetyWall');
    idbGet<SafetyWallItem[]>('safetyWall').then(data => { if (data?.length) setItems(data); });
  }, []);
  const [layout, setLayout] = useState<'4A4' | '2A3' | '1'>('1');
  const [page, setPage] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [upTitle, setUpTitle] = useState('');
  const [upFormat, setUpFormat] = useState<'A4' | 'A3'>('A4');
  const [upOrientation, setUpOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [upImage, setUpImage] = useState<string | undefined>();
  const [upLoading, setUpLoading] = useState(false);
  const [lightbox, setLightbox] = useState<SafetyWallItem | null>(null);
  const fileRef = useRef<File | null>(null);

  const slots = layout === '4A4' ? 4 : layout === '2A3' ? 2 : 1;
  const totalPages = Math.max(1, Math.ceil(items.length / slots));
  const currentItems = Array.from({ length: slots }, (_, i) =>
    items[(page % totalPages) * slots + i] || null
  );
  const currentDuration = currentItems.find(Boolean)?.duration ?? 10000;

  const save = (updated: SafetyWallItem[]) => {
    setItems(updated);
    idbSet('safetyWall', updated);
  };

  // Auto-advance (respects per-item duration)
  useEffect(() => {
    if (!playing || totalPages <= 1) return;
    const t = setTimeout(() => setPage(p => (p + 1) % totalPages), currentDuration);
    return () => clearTimeout(t);
  }, [playing, page, totalPages, currentDuration]);

  // Progress bar (uses currentDuration)
  useEffect(() => {
    if (!playing || totalPages <= 1) { setProgress(0); return; }
    setProgress(0);
    const start = Date.now();
    const iv = setInterval(() => setProgress(Math.min(100, ((Date.now() - start) / currentDuration) * 100)), 80);
    return () => clearInterval(iv);
  }, [playing, page, totalPages, currentDuration]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith('.pptx') || name.endsWith('.ppt')) {
      fileRef.current = file;
      setUpImage('__pptx__');
    } else if (name.endsWith('.pdf')) {
      fileRef.current = file;
      setUpImage('__pdf__');
    } else if (name.endsWith('.key')) {
      fileRef.current = file;
      setUpImage('__key__');
    } else {
      fileRef.current = null;
      setUpImage(await resizeImage(file));
    }
  };

  const handleAdd = async () => {
    if (!upImage) return;
    const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const file = fileRef.current;

    if (upImage === '__pptx__') {
      if (!file) return;
      setUpLoading(true);
      const slides = await extractPPTXSlides(file, upFormat, upOrientation, upTitle.trim() || file.name.replace(/\.pptx?$/i, ''));
      setUpLoading(false);
      if (slides.length === 0) {
        alert('No image slides found in this PPTX. Export slides as images and upload individually, or embed images in the slides.');
        return;
      }
      save([...slides, ...items]);
    } else if (upImage === '__pdf__') {
      if (!file) return;
      setUpLoading(true);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const pages = await renderPDFToImages(bytes, upFormat, upOrientation, upTitle.trim() || file.name.replace(/\.pdf$/i, ''));
        setUpLoading(false);
        if (pages.length === 0) { alert('Could not render PDF pages.'); return; }
        save([...pages, ...items]);
      } catch (err) {
        setUpLoading(false);
        alert('PDF error: ' + (err as Error).message);
        return;
      }
    } else if (upImage === '__key__') {
      if (!file) return;
      setUpLoading(true);
      try {
        const pages = await extractKeynoteSlides(file, upFormat, upOrientation, upTitle.trim() || file.name.replace(/\.key$/i, ''));
        setUpLoading(false);
        if (pages.length === 0) { alert('Could not extract Keynote slides. Make sure the file includes a PDF preview.'); return; }
        save([...pages, ...items]);
      } catch (err) {
        setUpLoading(false);
        alert('Keynote error: ' + (err as Error).message);
        return;
      }
    } else {
      save([{
        id: Date.now().toString(),
        title: upTitle.trim(),
        format: upFormat,
        orientation: upOrientation,
        image: upImage,
        date,
      }, ...items]);
    }
    setShowUpload(false);
    setUpTitle(''); setUpImage(undefined); setUpFormat('A4'); setUpOrientation('portrait');
    fileRef.current = null;
  };


  return (
    <div className="bg-white border-2 border-slate-100 rounded-2xl p-3 shadow-sm flex flex-col min-h-0 h-full">

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-6"
            onClick={() => setLightbox(null)}
          >
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="relative bg-white shadow-2xl overflow-hidden"
              style={{ aspectRatio: PAPER_RATIO[`${lightbox.format}-${lightbox.orientation}`], maxHeight: '92vh', maxWidth: '92vw' }}
              onClick={e => e.stopPropagation()}
            >
              <img src={lightbox.image} alt={lightbox.title} className="w-full h-full object-contain" />
              {lightbox.title && <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-4 py-2"><p className="text-white text-xs font-bold">{lightbox.title}</p></div>}
              <button onClick={() => setLightbox(null)} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5"><X size={14} /></button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls bar */}
      <div className="flex items-center gap-1.5 mb-2 shrink-0">
        <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex-1">Safety Wall</h3>

        {/* Layout toggle */}
        <div className="flex gap-0.5 bg-slate-100 p-0.5 rounded-lg">
          {(['4A4', '2A3', '1'] as const).map(l => (
            <button key={l} onClick={() => { setLayout(l); setPage(0); }}
              className={cn("px-2 py-1 rounded text-[10px] font-black uppercase transition-all",
                layout === l ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}>{l === '4A4' ? '4×A4' : l === '2A3' ? '2×A3' : '1×Full'}</button>
          ))}
        </div>

        {/* Playback controls */}
        <button onClick={() => setPage(p => (p - 1 + totalPages) % totalPages)} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-500 transition-all"><ChevronLeft size={11} /></button>
        <button onClick={() => setPlaying(v => !v)} className={cn("p-1.5 rounded-lg transition-all", playing ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200")}>
          {playing ? <Pause size={11} /> : <Play size={11} />}
        </button>
        <button onClick={() => setPage(p => (p + 1) % totalPages)} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-500 transition-all"><ChevronRight size={11} /></button>

        {/* Upload */}
        <button onClick={() => setShowUpload(v => !v)}
          className={cn("flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
            showUpload ? "bg-slate-200 text-slate-600" : "bg-emerald-600 text-white hover:bg-emerald-700"
          )}>
          {showUpload ? <X size={10} /> : <Plus size={10} />}
        </button>
      </div>

      {/* Upload form */}
      <AnimatePresence>
        {showUpload && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden shrink-0">
            <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-3 mb-2 flex flex-col gap-2">
              <input type="text" placeholder="Title (optional)" value={upTitle} onChange={e => setUpTitle(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-emerald-400" />
              <div className="flex gap-1">
                {(['A4', 'A3'] as const).map(f => (
                  <button key={f} onClick={() => setUpFormat(f)}
                    className={cn("flex-1 py-1 rounded text-xs font-black uppercase border transition-all",
                      upFormat === f ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-400 border-slate-200"
                    )}>{f}</button>
                ))}
                {(['portrait', 'landscape'] as const).map(o => (
                  <button key={o} onClick={() => setUpOrientation(o)}
                    className={cn("flex-1 py-1 rounded text-xs font-black uppercase border transition-all",
                      upOrientation === o ? "bg-slate-700 text-white border-slate-700" : "bg-white text-slate-400 border-slate-200"
                    )}>{o === 'portrait' ? 'P' : 'L'}</button>
                ))}
              </div>
              <label className="flex items-center gap-2 cursor-pointer border border-dashed border-slate-300 rounded-lg p-2 hover:border-emerald-400">
                <Camera size={12} className="text-slate-400 shrink-0" />
                <span className="text-xs font-bold text-slate-400 uppercase">
                  {upImage === '__pptx__' ? '✓ PPTX ready'
                    : upImage === '__pdf__' ? '✓ PDF ready'
                    : upImage === '__key__' ? '✓ Keynote ready'
                    : upImage ? '✓ Image ready'
                    : 'Image / PPTX / PDF / Keynote'}
                </span>
                <input type="file" accept="image/*,.pptx,.ppt,.pdf,.key" className="hidden" onChange={handleUpload} />
              </label>
              {(upImage === '__pptx__' || upImage === '__pdf__' || upImage === '__key__') && (
                <p className="text-[10px] text-emerald-700 font-bold bg-emerald-50 rounded px-2 py-1">
                  {upImage === '__pptx__' ? 'PPTX — slides with images extracted (5s/slide)'
                    : upImage === '__pdf__' ? 'PDF — each page rendered as a slide (5s/page)'
                    : 'Keynote — PDF preview extracted (5s/slide)'}
                </p>
              )}
              <button onClick={handleAdd} disabled={!upImage || upLoading}
                className="bg-emerald-600 text-white rounded-lg py-1.5 text-xs font-black uppercase disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1">
                {upLoading ? <><RefreshCw size={10} className="animate-spin" /> Processing...</> : 'Add to Wall'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slide display */}
      <div className="flex-1 min-h-0 relative overflow-hidden rounded-xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${page}-${layout}`}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.35 }}
            className={cn(
              "absolute inset-0 grid gap-2",
              layout === '4A4' ? 'grid-cols-2 grid-rows-2' : layout === '2A3' ? 'grid-cols-1 grid-rows-2' : 'grid-cols-1 grid-rows-1'
            )}
          >
            {currentItems.map((item, i) => (
              <div key={i}
                className="rounded-lg overflow-hidden bg-slate-50 border border-slate-100 relative group cursor-pointer flex items-center justify-center"
                onClick={() => item && setLightbox(item)}
              >
                {item ? (
                  <>
                    <img src={item.image} alt={item.title} className="w-full h-full object-contain bg-white" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
                      <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 transition-all" />
                    </div>
                    <button onClick={e => { e.stopPropagation(); save(items.filter(it => it.id !== item.id)); }}
                      className="absolute top-1.5 right-1.5 bg-black/50 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 size={9} />
                    </button>
                    {item.duration === 5000 && (
                      <div className="absolute top-1.5 left-1.5 bg-blue-600/80 text-white text-[7px] font-black px-1.5 py-0.5 rounded uppercase">PPT</div>
                    )}
                    {item.title && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1 opacity-0 group-hover:opacity-100 transition-all">
                        <p className="text-white text-xs font-bold truncate">{item.title}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-slate-200 flex flex-col items-center gap-1 select-none">
                    <Camera size={18} />
                    <p className="text-[10px] font-black uppercase">{layout === '1' ? 'Full' : layout === '4A4' ? 'A4' : 'A3'} Slot {i + 1}</p>
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress bar + page indicator */}
      <div className="shrink-0 mt-2 flex items-center gap-2">
        <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-none" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-[10px] font-black text-slate-400 uppercase shrink-0 tabular-nums">
          {page + 1} / {totalPages}
        </p>
      </div>
    </div>
  );
};

// ---- Quality section extra interfaces ----
interface QualityAlert {
  id: string; title: string; description: string;
  date: string; severity: 'low' | 'medium' | 'high'; photo?: string;
}
interface ProcessDoc {
  id: string; title: string; image: string; date: string; duration?: number;
}

// ---- Calendar: Issue Tracker (month view + compact year stats) ----
interface QualityIssueTrackerProps {
  issues: QualityIssue[];
  onSave: (u: QualityIssue[]) => void;
}
const QualityIssueTracker: React.FC<QualityIssueTrackerProps> = ({ issues, onSave }) => {
  const [selYear, setSelYear] = useState(new Date().getFullYear());
  const [selMonth, setSelMonth] = useState(new Date().getMonth());
  const [selDay, setSelDay] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [fDate, setFDate]       = useState(TODAY_YMD);
  const [fCause, setFCause]     = useState<IssueCause>('operator');
  const [fType, setFType]       = useState<IssueType>('internal');
  const [fDesc, setFDesc]       = useState('');
  const [fQty, setFQty]         = useState('1');
  const [fOrderNo, setFOrderNo]       = useState('');
  const [fPhotos, setFPhotos]         = useState<string[]>([]);
  const [fReSchedule, setFReSchedule] = useState(false);
  const [fEmployee, setFEmployee]     = useState('');
  const [fShift, setFShift]           = useState<IssueShift>('morning');
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [photoLightbox, setPhotoLightbox] = useState<string | null>(null);

  const save = onSave;

  const openAdd = () => {
    setEditingId(null);
    setFDate(selDay||TODAY_YMD); setFCause('operator'); setFType('internal');
    setFDesc(''); setFQty('1'); setFOrderNo(''); setFPhotos([]); setFReSchedule(false); setFEmployee(''); setFShift('morning');
    setShowForm(true);
  };

  const openEdit = (issue: QualityIssue) => {
    setEditingId(issue.id);
    setFDate(issue.date); setFCause(issue.cause); setFType(issue.type);
    setFDesc(issue.description); setFQty(String(issue.qty));
    setFOrderNo(issue.orderNo||''); setFPhotos(issue.photos||[]);
    setFReSchedule(issue.reSchedule||false); setFEmployee(issue.employee||'');
    setFShift(issue.shift||'morning');
    setShowForm(true);
  };

  const addIssue = () => {
    if (!fDate || !fDesc.trim()) return;
    const record: QualityIssue = { id: editingId||Date.now().toString(), date: fDate, timestamp: new Date(fDate+'T00:00:00').getTime(), cause: fCause, type: fType, description: fDesc.trim(), qty: Math.max(1, parseInt(fQty)||1), orderNo: fOrderNo.trim()||undefined, photos: fPhotos.length?fPhotos:undefined, reSchedule: fReSchedule||undefined, employee: fEmployee.trim()||undefined, shift: fShift };
    save(editingId ? issues.map(i=>i.id===editingId?record:i) : [record, ...issues]);
    setFDesc(''); setFQty('1'); setFOrderNo(''); setFPhotos([]); setFReSchedule(false); setFEmployee(''); setFShift('morning'); setEditingId(null); setShowForm(false);
    const d = new Date(fDate+'T00:00:00');
    setSelYear(d.getFullYear()); setSelMonth(d.getMonth()); setSelDay(fDate);
  };

  const addPhotos = async (files: FileList) => {
    const results: string[] = [];
    for (const f of Array.from(files)) results.push(await resizeImage(f));
    setFPhotos(p => [...p, ...results]);
  };

  const forDay  = (date: string) => issues.filter(i => i.date === date);
  const forYear = (y: number) => issues.filter(i => new Date(i.date+'T00:00:00').getFullYear() === y);
  const goMonth = (delta: number) => { const d = new Date(selYear, selMonth+delta); setSelYear(d.getFullYear()); setSelMonth(d.getMonth()); setSelDay(null); };

  const exportCSV = () => {
    const hdr = ['Date','Type','Cause','Qty','Description'];
    const rows = [...issues].sort((a,b)=>b.timestamp-a.timestamp).map(i=>[i.date,TYPE_CFG[i.type].label,CAUSE_CFG[i.cause].label,String(i.qty),i.description]);
    const csv = [hdr,...rows].map(r=>r.map(c=>`"${c.replace(/"/g,'""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8;'}));
    a.download=`quality-issues-${selYear}.csv`; a.click();
  };

  const yi = forYear(selYear);
  const cells = calendarCells(selYear, selMonth);
  const dayIssues = selDay ? forDay(selDay) : [];

  const cellStatus = (date: string) => {
    if (date > TODAY_YMD) return 'future';
    const di = forDay(date);
    if (di.some(i=>i.type==='customer')) return 'ncr';
    if (di.length) return 'internal';
    return 'ok';
  };

  const cellStyle = (date: string) => {
    const sel = date===selDay;
    if (sel) return 'border-blue-500 bg-blue-50';
    const st = cellStatus(date);
    if (st==='future')   return 'border-transparent bg-slate-50 text-slate-200 cursor-default';
    if (st==='ncr')      return 'border-red-300 bg-red-50 hover:border-red-400';
    if (st==='internal') return 'border-amber-300 bg-amber-50 hover:border-amber-400';
    if (date===TODAY_YMD) return 'border-blue-200 bg-blue-50 hover:border-blue-300';
    return 'border-green-200 bg-green-50 hover:border-green-300';
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-100 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="px-4 pt-3 pb-0 shrink-0">
        <h3 className="text-sm font-black text-slate-700 tracking-wide">生产质量记录日历</h3>
      </div>
      {/* Year stats strip */}
      <div className="px-4 py-2.5 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2 mb-1.5">
          <button onClick={()=>setSelYear(y=>y-1)} className="p-0.5 hover:bg-slate-100 rounded text-slate-400"><ChevronLeft size={12}/></button>
          <span className="text-sm font-black text-slate-800 tabular-nums">{selYear}</span>
          <button onClick={()=>setSelYear(y=>y+1)} className="p-0.5 hover:bg-slate-100 rounded text-slate-400"><ChevronRight size={12}/></button>
          <span className="flex-1"/>
          <button onClick={exportCSV} className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all"><History size={9}/>Export</button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
          <span className="text-[10px] font-black text-slate-600">总计 Total: <span className="text-slate-800">{yi.length}</span></span>
          <span className="text-[10px] font-black text-amber-600">内部 Internal: {yi.filter(i=>i.type==='internal').length}</span>
          <span className="text-[10px] font-black text-red-600">客诉 NCR: {yi.filter(i=>i.type==='customer').length}</span>
          {(['operator','packer','loader'] as IssueCause[]).map(c => (
            <span key={c} className={cn("text-[10px] font-black", CAUSE_CFG[c].text)}>{CAUSE_CFG[c].label}: {yi.filter(i=>i.cause===c).length}</span>
          ))}
        </div>
      </div>

      {/* Month nav */}
      <div className="flex items-center px-3 py-1.5 border-b border-slate-100 shrink-0">
        <button onClick={()=>goMonth(-1)} className="p-1 hover:bg-slate-100 rounded text-slate-400"><ChevronLeft size={13}/></button>
        <span className="flex-1 text-xs font-black text-slate-700 text-center">{MONTH_NAMES[selMonth]} {selYear}</span>
        <button onClick={()=>goMonth(1)} className="p-1 hover:bg-slate-100 rounded text-slate-400"><ChevronRight size={13}/></button>
      </div>

      {/* Calendar */}
      <div className="flex-1 min-h-0 flex flex-col p-2 gap-1 overflow-hidden">
        <div className="grid grid-cols-7 gap-1">
          {DAY_LABELS.map(d => <div key={d} className="text-center text-[10px] font-black text-slate-400 uppercase">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1 flex-1">
          {cells.map((date,i) => {
            if (!date) return <div key={i}/>;
            const di = forDay(date);
            return (
              <button key={i} disabled={date>TODAY_YMD}
                onClick={()=>{setSelDay(date===selDay?null:date);setFDate(date);}}
                className={cn("rounded-xl border-2 p-1 flex flex-col items-center justify-between transition-all min-h-0 overflow-hidden", cellStyle(date))}>
                {/* Date number */}
                <span className={cn("text-xs font-black leading-none self-start",
                  cellStatus(date)==='future'   ? 'text-slate-300' :
                  cellStatus(date)==='ncr'      ? 'text-red-600' :
                  cellStatus(date)==='internal' ? 'text-amber-600' :
                  date===selDay                 ? 'text-blue-700' : 'text-green-700'
                )}>{new Date(date+'T00:00:00').getDate()}</span>

                {/* Big status icon */}
                {cellStatus(date)==='ok' && date<=TODAY_YMD && (
                  <div className="flex-1 flex items-center justify-center">
                    <Check size={32} strokeWidth={3.5} className="text-green-500 drop-shadow-sm"/>
                  </div>
                )}
                {(cellStatus(date)==='internal' || cellStatus(date)==='ncr') && (() => {
                  const isNcr = cellStatus(date)==='ncr';
                  const grouped = (['operator','packer','loader','other'] as IssueCause[])
                    .map(c=>({ c, count: di.filter(i=>i.cause===c).length }))
                    .filter(g=>g.count>0);
                  const causeLabel = (c: IssueCause) => c==='operator'?'加工错误':c==='packer'?'打包错误':c==='loader'?'装车错误':'其他错误';
                  return (
                    <div className="flex-1 flex flex-col items-center justify-center gap-0.5 w-full">
                      {isNcr
                        ? <X size={36} strokeWidth={3.5} className="text-red-500 drop-shadow-sm shrink-0 -mt-1"/>
                        : <Check size={26} strokeWidth={3.5} className="text-amber-500 drop-shadow-sm shrink-0 -mt-1"/>
                      }
                      <div className="flex flex-col gap-px w-full px-0.5">
                        {grouped.map(({c, count})=>(
                          <span key={c} className={cn("text-[10px] font-black px-1 py-0.5 rounded leading-tight text-center truncate",CAUSE_CFG[c].bg,CAUSE_CFG[c].text)}>
                            {causeLabel(c)} ×{count}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </button>
            );
          })}
        </div>

        {/* Selected-day detail (inline) */}
        <AnimatePresence>
          {selDay && (
            <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} className="overflow-hidden shrink-0">
              <div className="border-t border-slate-100 pt-2 flex flex-col gap-1.5 max-h-44 overflow-y-auto">
                <div className="flex items-center gap-2 sticky top-0 bg-white pb-1">
                  <span className="text-xs font-black text-slate-500 uppercase flex-1">
                    {new Date(selDay+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'})}
                    {dayIssues.length>0?` · ${dayIssues.length} issue${dayIssues.length>1?'s':''}`:'  · No issues'}
                  </span>
                  <button onClick={openAdd}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase bg-blue-600 text-white">
                    <Plus size={9}/>Add
                  </button>
                </div>
                {dayIssues.map(issue=>(
                  <div key={issue.id} className={cn("rounded-lg px-2 py-1.5 border shrink-0 flex flex-col gap-1",TYPE_CFG[issue.type].bg,TYPE_CFG[issue.type].border)}>
                    <div className="flex items-start gap-1.5">
                      <span className={cn("text-xs font-black uppercase px-1.5 py-0.5 rounded-full shrink-0 mt-0.5",CAUSE_CFG[issue.cause].bg,CAUSE_CFG[issue.cause].text)}>{CAUSE_CFG[issue.cause].label}</span>
                      <p className="text-xs text-slate-700 flex-1 leading-snug">{issue.description}</p>
                      <span className="text-[10px] text-slate-400 tabular-nums shrink-0 font-black">×{issue.qty}</span>
                      <button onClick={()=>openEdit(issue)} className="flex items-center justify-center w-6 h-6 rounded-md bg-blue-100 hover:bg-blue-200 text-blue-500 transition-all shrink-0"><Pencil size={11}/></button>
                      <button onClick={()=>save(issues.filter(i=>i.id!==issue.id))} className="flex items-center justify-center w-6 h-6 rounded-md bg-red-100 hover:bg-red-200 text-red-400 hover:text-red-600 transition-all shrink-0"><Trash2 size={11}/></button>
                    </div>
                    {(issue.orderNo || issue.reSchedule || issue.employee || issue.shift) && (
                      <div className="flex items-center gap-1.5 flex-wrap pl-0.5">
                        {issue.employee && <span className="text-[10px] font-black text-slate-600 bg-white/80 px-1.5 py-0.5 rounded border border-slate-200">👤 {issue.employee}</span>}
                        {issue.shift && <span className={cn("text-[10px] font-black px-1.5 py-0.5 rounded",issue.shift==='morning'?'bg-indigo-100 text-indigo-700':'bg-orange-100 text-orange-700')}>{issue.shift==='morning'?'早班':'下午班'}</span>}
                        {issue.orderNo && <span className="text-[10px] font-black text-slate-500 bg-white/70 px-1.5 py-0.5 rounded border border-slate-200">#{issue.orderNo}</span>}
                        {issue.reSchedule && <span className="text-[10px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">重新排产</span>}
                      </div>
                    )}
                    {issue.photos && issue.photos.length>0 && (
                      <div className="flex gap-1 flex-wrap pl-0.5">
                        {issue.photos.map((p,i)=>(
                          <img key={i} src={p} className="w-8 h-8 rounded object-cover border border-white/80 cursor-pointer hover:scale-110 transition-transform" onClick={()=>setPhotoLightbox(p)}/>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Photo lightbox */}
        <AnimatePresence>
          {photoLightbox && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              className="fixed inset-0 bg-black/85 z-[60] flex items-center justify-center p-6"
              onClick={()=>setPhotoLightbox(null)}>
              <motion.img initial={{scale:0.9}} animate={{scale:1}} exit={{scale:0.9}}
                src={photoLightbox} className="max-h-[90vh] max-w-[90vw] rounded-xl shadow-2xl object-contain"
                onClick={e=>e.stopPropagation()}/>
              <button onClick={()=>setPhotoLightbox(null)} className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 text-white rounded-full p-2 transition-all"><X size={18}/></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add Issue Modal */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
              onClick={()=>setShowForm(false)}>
              <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.95,opacity:0}}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden"
                onClick={e=>e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
                  <div>
                    <h2 className="text-base font-black text-slate-800">{editingId ? '修改质量问题记录' : '添加质量问题记录'}</h2>
                    <p className="text-[11px] text-slate-400 font-bold mt-0.5">
                      {selDay ? new Date(selDay+'T00:00:00').toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'}) : ''}
                    </p>
                  </div>
                  <button onClick={()=>setShowForm(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-all"><X size={16}/></button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
                  {/* Date + Order No */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">日期 Date</label>
                      <input type="date" value={fDate} onChange={e=>setFDate(e.target.value)}
                        className="border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold bg-slate-50 focus:outline-none focus:border-blue-400"/>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">订单号 Order No.</label>
                      <input type="text" placeholder="e.g. PO-2024-001" value={fOrderNo} onChange={e=>setFOrderNo(e.target.value)}
                        className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:border-blue-400"/>
                    </div>
                  </div>

                  {/* Employee + Shift */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">员工姓名 Employee</label>
                      <input type="text" placeholder="请输入姓名" value={fEmployee} onChange={e=>setFEmployee(e.target.value)}
                        className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:border-blue-400"/>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">班次 Shift</label>
                      <div className="grid grid-cols-2 gap-1.5 h-full">
                        {([['morning','早班 AM'],['afternoon','下午班 PM']] as [IssueShift,string][]).map(([k,lbl])=>(
                          <button key={k} onClick={()=>setFShift(k)}
                            className={cn("rounded-xl text-[10px] font-black border-2 py-2 transition-all",
                              fShift===k?'bg-indigo-100 text-indigo-700 border-indigo-300':'bg-white text-slate-400 border-slate-200 hover:border-slate-300')}>
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Cause */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">错误来源 Cause</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.entries(CAUSE_CFG) as [IssueCause,any][]).map(([k,c])=>(
                        <button key={k} onClick={()=>setFCause(k)}
                          className={cn("py-2.5 px-1 rounded-xl text-[10px] font-black border-2 transition-all leading-tight text-center",
                            fCause===k?cn(c.bg,c.text,'border-current'):'bg-white text-slate-400 border-slate-200 hover:border-slate-300')}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Result */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">处理结果 Result</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.entries(TYPE_CFG) as [IssueType,any][]).map(([k,c])=>(
                        <button key={k} onClick={()=>setFType(k)}
                          className={cn("py-2.5 rounded-xl text-[11px] font-black border-2 transition-all",
                            fType===k?cn(c.bg,c.text,'border-current'):'bg-white text-slate-400 border-slate-200 hover:border-slate-300')}>
                          {k==='customer'?'客诉 NCR':'内部解决'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Description + Qty */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">问题描述 Description</label>
                    <div className="flex gap-2">
                      <textarea rows={3} placeholder="请描述问题详情..." value={fDesc} onChange={e=>setFDesc(e.target.value)}
                        className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none bg-slate-50 focus:outline-none focus:border-blue-400"/>
                      <div className="flex flex-col gap-1 items-center justify-center">
                        <label className="text-xs font-black text-slate-400 uppercase">数量</label>
                        <input type="number" min="1" value={fQty} onChange={e=>setFQty(e.target.value)}
                          className="w-14 border border-slate-200 rounded-xl px-1 py-2 text-lg font-black text-center bg-slate-50 focus:outline-none focus:border-blue-400"/>
                      </div>
                    </div>
                  </div>

                  {/* Re-schedule toggle */}
                  <button onClick={()=>setFReSchedule(v=>!v)}
                    className={cn("flex items-center gap-3 w-full rounded-xl border-2 px-4 py-3 transition-all text-left",
                      fReSchedule?'bg-amber-50 border-amber-400 text-amber-700':'bg-white border-slate-200 text-slate-500 hover:border-slate-300')}>
                    <div className={cn("w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
                      fReSchedule?'bg-amber-400 border-amber-400':'border-slate-300')}>
                      {fReSchedule && <span className="text-white text-[11px] font-black">✓</span>}
                    </div>
                    <div>
                      <p className="text-sm font-black">是否重新排产送货</p>
                      <p className="text-[10px] font-bold opacity-70">Re-schedule Production &amp; Delivery</p>
                    </div>
                  </button>

                  {/* Photos */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">照片 Photos</label>
                    <label className="flex items-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-3 hover:border-blue-400 cursor-pointer transition-all">
                      <Camera size={14} className="text-slate-400 shrink-0"/>
                      <span className="text-[11px] font-bold text-slate-400">点击上传照片（可多选）</span>
                      <input type="file" accept="image/*" multiple className="hidden"
                        onChange={async e=>{ if(e.target.files) await addPhotos(e.target.files); }}/>
                    </label>
                    {fPhotos.length>0 && (
                      <div className="grid grid-cols-4 gap-2">
                        {fPhotos.map((p,i)=>(
                          <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-100">
                            <img src={p} className="w-full h-full object-cover cursor-pointer" onClick={()=>setPhotoLightbox(p)}/>
                            <button onClick={()=>setFPhotos(ps=>ps.filter((_,j)=>j!==i))}
                              className="absolute top-0.5 right-0.5 bg-black/60 hover:bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-all">
                              <X size={8}/>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 pb-5 pt-3 border-t border-slate-100 shrink-0">
                  <button onClick={addIssue} disabled={!fDesc.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-black uppercase disabled:opacity-40 transition-all">
                    {editingId ? '保存修改 Update' : '保存记录 Save'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// ---- Error Alert Panel (A4 portrait, slideshow) ----
const QualityAlertPanel: React.FC = () => {
  const [alerts, setAlerts] = useState<QualityAlert[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [fTitle, setFTitle] = useState('');
  const [fDesc, setFDesc]   = useState('');
  const [fSev, setFSev]     = useState<'low'|'medium'|'high'>('medium');
  const [fPhoto, setFPhoto] = useState<string|undefined>();
  const [page, setPage]     = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [lightbox, setLightbox] = useState<string|null>(null);

  useEffect(() => { idbGet<QualityAlert[]>('qualityAlerts').then(d=>{if(d?.length)setAlerts(d);}); }, []);
  const save = (u: QualityAlert[]) => { setAlerts(u); idbSet('qualityAlerts', u); };
  const total = alerts.length;
  const cur   = alerts[page % Math.max(1,total)] || null;

  useEffect(() => {
    if (!playing||total<=1) return;
    const t = setTimeout(()=>setPage(p=>(p+1)%total),10000); return ()=>clearTimeout(t);
  }, [playing,page,total]);
  useEffect(() => {
    if (!playing||total<=1){setProgress(0);return;}
    setProgress(0); const s=Date.now();
    const iv=setInterval(()=>setProgress(Math.min(100,((Date.now()-s)/10000)*100)),80); return ()=>clearInterval(iv);
  }, [playing,page,total]);

  const handleAdd = () => {
    if (!fTitle.trim()) return;
    save([{id:Date.now().toString(),title:fTitle.trim(),description:fDesc.trim(),date:new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}),severity:fSev,photo:fPhoto},...alerts]);
    setShowForm(false);setFTitle('');setFDesc('');setFSev('medium');setFPhoto(undefined);
  };
  const sevStyle = (s:'low'|'medium'|'high') => s==='high'?'bg-red-100 text-red-700':s==='medium'?'bg-amber-100 text-amber-700':'bg-yellow-100 text-yellow-700';

  return (
    <div className="bg-white border-2 border-slate-100 rounded-2xl px-3 py-2 shadow-sm flex flex-col overflow-hidden" style={{aspectRatio:'210/297',height:'100%',width:'auto'}}>
      <AnimatePresence>
        {lightbox && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6" onClick={()=>setLightbox(null)}>
            <motion.div initial={{scale:0.9}} animate={{scale:1}} exit={{scale:0.9}} className="relative bg-white shadow-2xl overflow-hidden" style={{maxHeight:'90vh',aspectRatio:'210/297',maxWidth:'60vw'}} onClick={e=>e.stopPropagation()}>
              <img src={lightbox} className="w-full h-full object-contain"/>
              <button onClick={()=>setLightbox(null)} className="absolute top-3 right-3 bg-black/60 text-white rounded-full p-1.5"><X size={16}/></button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex items-center justify-between mb-2 shrink-0">
        <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Error Alerts</h3>
        <button onClick={()=>setShowForm(v=>!v)} className={cn("flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-black uppercase transition-all",showForm?"bg-slate-200 text-slate-600":"bg-blue-600 text-white hover:bg-blue-700")}>
          {showForm?<X size={10}/>:<Plus size={10}/>}{showForm?'Cancel':'Add'}
        </button>
      </div>
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} className="overflow-hidden shrink-0">
            <div className="border border-blue-200 bg-blue-50 rounded-xl p-3 mb-2 flex flex-col gap-2">
              <input type="text" placeholder="Title *" value={fTitle} onChange={e=>setFTitle(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold bg-white focus:outline-none focus:border-blue-400"/>
              <textarea placeholder="Description" value={fDesc} onChange={e=>setFDesc(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-blue-400 resize-none"/>
              <div className="flex gap-1">
                {(['high','medium','low'] as const).map(s=>(
                  <button key={s} onClick={()=>setFSev(s)} className={cn("flex-1 py-1 rounded text-xs font-black uppercase border transition-all",fSev===s?(s==='high'?'bg-red-600 text-white border-red-600':s==='medium'?'bg-amber-500 text-white border-amber-500':'bg-yellow-400 text-yellow-900 border-yellow-400'):'bg-white text-slate-400 border-slate-200')}>{s}</button>
                ))}
              </div>
              <label className="flex items-center gap-2 cursor-pointer border border-dashed border-slate-300 rounded-lg p-2 hover:border-blue-400">
                <Camera size={12} className="text-slate-400 shrink-0"/>
                <span className="text-xs font-bold text-slate-400 uppercase">{fPhoto?'✓ Photo attached':'Upload photo (A4)'}</span>
                <input type="file" accept="image/*" className="hidden" onChange={async e=>{const f=e.target.files?.[0];if(f)setFPhoto(await resizeImage(f));}}/>
              </label>
              <button onClick={handleAdd} disabled={!fTitle.trim()} className="w-full bg-blue-600 text-white rounded-lg py-1.5 text-xs font-black uppercase disabled:opacity-40 transition-all">Submit Alert</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {total>0 && (
        <div className="flex items-center gap-1 mb-2 shrink-0">
          <button onClick={()=>setPage(p=>(p-1+total)%total)} className="p-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-500"><ChevronLeft size={11}/></button>
          <button onClick={()=>setPlaying(v=>!v)} className={cn("p-1 rounded",playing?"bg-blue-100 text-blue-600":"bg-slate-100 text-slate-500")}>{playing?<Pause size={11}/>:<Play size={11}/>}</button>
          <button onClick={()=>setPage(p=>(p+1)%total)} className="p-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-500"><ChevronRight size={11}/></button>
          <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden mx-1"><div className="h-full bg-blue-500 rounded-full" style={{width:`${progress}%`}}/></div>
          <span className="text-[10px] font-black text-slate-400 tabular-nums">{page+1}/{total}</span>
        </div>
      )}
      <div className="flex-1 min-h-0 relative overflow-hidden rounded-xl">
        {total===0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-200 gap-2"><AlertTriangle size={28}/><p className="text-[10px] font-black uppercase tracking-widest">No alerts</p></div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={page} initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-20}} className="absolute inset-0">
              {cur && (
                <div className="w-full h-full rounded-xl overflow-hidden border border-slate-100 relative group">
                  {cur.photo ? (
                    <>
                      <img src={cur.photo} alt={cur.title} className="w-full h-full object-contain bg-white cursor-pointer" onClick={()=>setLightbox(cur.photo!)}/>
                      <div className="absolute top-2 left-2"><span className={cn("text-[10px] font-black uppercase px-1.5 py-0.5 rounded",sevStyle(cur.severity))}>{cur.severity}</span></div>
                    </>
                  ) : (
                    <div className="w-full h-full bg-slate-50 flex flex-col items-center justify-center gap-3 p-4">
                      <span className={cn("px-2 py-1 rounded text-[10px] font-black uppercase",sevStyle(cur.severity))}>{cur.severity}</span>
                      <p className="text-sm font-black text-slate-800 text-center">{cur.title}</p>
                      {cur.description && <p className="text-xs text-slate-500 text-center">{cur.description}</p>}
                      <p className="text-xs text-slate-400 font-bold uppercase">{cur.date}</p>
                    </div>
                  )}
                  <button onClick={()=>save(alerts.filter(a=>a.id!==cur.id))} className="absolute top-2 right-2 bg-black/50 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={10}/></button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

// ---- Standard Process Board ----
const ProcessDocBoard: React.FC = () => {
  const [docs, setDocs] = useState<ProcessDoc[]>([]);
  const [page, setPage] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [upTitle, setUpTitle] = useState('');
  const [upImage, setUpImage] = useState<string|undefined>();
  const [upLoading, setUpLoading] = useState(false);
  const [lightbox, setLightbox] = useState<ProcessDoc|null>(null);
  const fileRef = useRef<File|null>(null);

  useEffect(() => { idbGet<ProcessDoc[]>('processDocuments').then(d=>{if(d?.length)setDocs(d);}); }, []);
  const save = (u: ProcessDoc[]) => { setDocs(u); idbSet('processDocuments', u); };
  const total = docs.length;
  const cur   = docs[page % Math.max(1,total)] || null;
  const dur   = cur?.duration ?? 10000;

  useEffect(() => {
    if (!playing||total<=1) return;
    const t = setTimeout(()=>setPage(p=>(p+1)%total),dur); return ()=>clearTimeout(t);
  }, [playing,page,total,dur]);
  useEffect(() => {
    if (!playing||total<=1){setProgress(0);return;}
    setProgress(0); const s=Date.now();
    const iv=setInterval(()=>setProgress(Math.min(100,((Date.now()-s)/dur)*100)),80); return ()=>clearInterval(iv);
  }, [playing,page,total,dur]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const n = file.name.toLowerCase();
    if (n.endsWith('.pptx')||n.endsWith('.ppt')){fileRef.current=file;setUpImage('__pptx__');}
    else if (n.endsWith('.pdf')){fileRef.current=file;setUpImage('__pdf__');}
    else if (n.endsWith('.key')){fileRef.current=file;setUpImage('__key__');}
    else{fileRef.current=null;setUpImage(await resizeImage(file));}
  };

  const handleAdd = async () => {
    if (!upImage) return;
    const date = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
    const file = fileRef.current;
    const toDoc = (s: SafetyWallItem): ProcessDoc => ({id:s.id,title:s.title,image:s.image,date:s.date,duration:5000});
    if (upImage==='__pptx__'&&file) {
      setUpLoading(true);
      const slides = await extractPPTXSlides(file,'A4','portrait',upTitle.trim()||file.name.replace(/\.pptx?$/i,''));
      setUpLoading(false);
      if (!slides.length){alert('No image slides found.');return;}
      save([...slides.map(toDoc),...docs]);
    } else if (upImage==='__pdf__'&&file) {
      setUpLoading(true);
      try{const bytes=new Uint8Array(await file.arrayBuffer());const pages=await renderPDFToImages(bytes,'A4','portrait',upTitle.trim()||file.name.replace(/\.pdf$/i,''));setUpLoading(false);save([...pages.map(toDoc),...docs]);}
      catch(err){setUpLoading(false);alert('PDF error: '+(err as Error).message);return;}
    } else if (upImage==='__key__'&&file) {
      setUpLoading(true);
      try{const pages=await extractKeynoteSlides(file,'A4','portrait',upTitle.trim()||file.name.replace(/\.key$/i,''));setUpLoading(false);save([...pages.map(toDoc),...docs]);}
      catch(err){setUpLoading(false);alert('Error: '+(err as Error).message);return;}
    } else {
      save([{id:Date.now().toString(),title:upTitle.trim(),image:upImage,date},...docs]);
    }
    setShowUpload(false);setUpTitle('');setUpImage(undefined);fileRef.current=null;
  };

  return (
    <div className="bg-white border-2 border-slate-100 rounded-2xl p-3 shadow-sm flex flex-col min-h-0 h-full">
      <AnimatePresence>
        {lightbox && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-6" onClick={()=>setLightbox(null)}>
            <motion.div initial={{scale:0.9}} animate={{scale:1}} exit={{scale:0.9}} className="relative bg-white shadow-2xl overflow-hidden" style={{maxHeight:'92vh',maxWidth:'92vw'}} onClick={e=>e.stopPropagation()}>
              <img src={lightbox.image} alt={lightbox.title} className="w-full h-full object-contain"/>
              {lightbox.title&&<div className="absolute bottom-0 left-0 right-0 bg-black/50 px-4 py-2"><p className="text-white text-xs font-bold">{lightbox.title}</p></div>}
              <button onClick={()=>setLightbox(null)} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5"><X size={14}/></button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex items-center gap-1.5 mb-2 shrink-0">
        <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex-1">Standard Process</h3>
        <button onClick={()=>setPage(p=>(p-1+Math.max(1,total))%Math.max(1,total))} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-500"><ChevronLeft size={11}/></button>
        <button onClick={()=>setPlaying(v=>!v)} className={cn("p-1.5 rounded-lg",playing?"bg-blue-100 text-blue-600":"bg-slate-100 text-slate-500")}>{playing?<Pause size={11}/>:<Play size={11}/>}</button>
        <button onClick={()=>setPage(p=>(p+1)%Math.max(1,total))} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-500"><ChevronRight size={11}/></button>
        <button onClick={()=>setShowUpload(v=>!v)} className={cn("flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-black uppercase transition-all",showUpload?"bg-slate-200 text-slate-600":"bg-blue-600 text-white hover:bg-blue-700")}>
          {showUpload?<X size={10}/>:<Plus size={10}/>}
        </button>
      </div>
      <AnimatePresence>
        {showUpload && (
          <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} className="overflow-hidden shrink-0">
            <div className="border border-blue-200 bg-blue-50 rounded-xl p-2.5 mb-2 flex flex-col gap-1.5">
              <input type="text" placeholder="Title (optional)" value={upTitle} onChange={e=>setUpTitle(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold bg-white focus:outline-none focus:border-blue-400"/>
              <label className="flex items-center gap-2 cursor-pointer border border-dashed border-slate-300 rounded-lg p-2 hover:border-blue-400 bg-white">
                <Camera size={12} className="text-slate-400 shrink-0"/>
                <span className="text-xs font-bold text-slate-400 uppercase">{upImage==='__pptx__'?'✓ PPTX':upImage==='__pdf__'?'✓ PDF':upImage==='__key__'?'✓ Keynote':upImage?'✓ Image':'Image / PPTX / PDF / Keynote'}</span>
                <input type="file" accept="image/*,.pptx,.ppt,.pdf,.key" className="hidden" onChange={handleUpload}/>
              </label>
              <button onClick={handleAdd} disabled={!upImage||upLoading} className="bg-blue-600 text-white rounded-lg py-1.5 text-xs font-black uppercase disabled:opacity-40 flex items-center justify-center gap-1">
                {upLoading?<><RefreshCw size={10} className="animate-spin"/>Processing...</>:'Add Document'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex-1 min-h-0 relative overflow-hidden rounded-xl">
        {total===0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-200 gap-2"><ClipboardList size={28}/><p className="text-xs font-black uppercase tracking-widest text-center">Upload process<br/>documents</p></div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={page} initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-20}} transition={{duration:0.3}} className="absolute inset-0">
              {cur && (
                <div className="w-full h-full rounded-xl overflow-hidden bg-white border border-slate-100 relative group cursor-pointer" onClick={()=>setLightbox(cur)}>
                  <img src={cur.image} alt={cur.title} className="w-full h-full object-contain"/>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all flex items-center justify-center">
                    <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 transition-all"/>
                  </div>
                  <button onClick={e=>{e.stopPropagation();save(docs.filter(d=>d.id!==cur.id));}} className="absolute top-2 right-2 bg-black/50 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={10}/></button>
                  {cur.title && <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-3 py-1.5 opacity-0 group-hover:opacity-100 transition-all"><p className="text-white text-[10px] font-bold truncate">{cur.title}</p></div>}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
      <div className="shrink-0 mt-2 flex items-center gap-2">
        <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-none" style={{width:`${progress}%`}}/></div>
        <p className="text-[10px] font-black text-slate-400 tabular-nums">{Math.min(page+1,Math.max(1,total))}/{Math.max(1,total)}</p>
      </div>
    </div>
  );
};

const QualitySection: React.FC<SectionProps> = ({ color }) => {
  const [issues, setIssues] = useState<QualityIssue[]>([]);

  useEffect(() => {
    idbGet<QualityIssue[]>('qualityIssues').then(d => { if (d?.length) setIssues(d); });
  }, []);

  const saveIssues = (u: QualityIssue[]) => { setIssues(u); idbSet('qualityIssues', u); };

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();

  const yearTotal   = issues.filter(i => new Date(i.date+'T00:00:00').getFullYear() === thisYear).length;
  const monthIssues = issues.filter(i => { const d = new Date(i.date+'T00:00:00'); return d.getFullYear()===thisYear && d.getMonth()===thisMonth; });
  const monthTotal    = monthIssues.length;
  const monthNCR      = monthIssues.filter(i=>i.type==='customer').length;
  const monthInternal = monthIssues.filter(i=>i.type==='internal').length;
  const monthOperator  = monthIssues.filter(i=>i.cause==='operator').length;
  const monthPacker    = monthIssues.filter(i=>i.cause==='packer').length;
  const monthLoader    = monthIssues.filter(i=>i.cause==='loader').length;
  const monthMorning   = monthIssues.filter(i=>i.shift==='morning').length;
  const monthAfternoon = monthIssues.filter(i=>i.shift==='afternoon').length;

  return (
    <SectionWrapper title="Quality - Perfection Guaranteed" icon={CheckCircle2} color={color}>
      <div className="grid gap-3 shrink-0" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 1.6fr 1.6fr' }}>
        {/* Single-stat cards */}
        {([
          { label: '年度累计错误', sublabel: `${thisYear} Year-to-Date`, value: yearTotal, accent: '#2563EB', bg: 'bg-blue-50' },
          { label: '本月错误总计', sublabel: `${MONTH_NAMES[thisMonth]} Total`, value: monthTotal, accent: '#0891B2', bg: 'bg-cyan-50' },
          { label: '本月客户投诉', sublabel: 'Customer NCR', value: monthNCR, accent: monthNCR>0?'#DC2626':'#059669', bg: monthNCR>0?'bg-red-50':'bg-green-50' },
          { label: '本月内部解决', sublabel: 'Internal Fix', value: monthInternal, accent: '#D97706', bg: 'bg-amber-50' },
        ]).map(({ label, sublabel, value, accent, bg })=>(
          <div key={label} className={cn("rounded-xl px-3 py-3 flex items-center gap-3 border-2", bg)} style={{ borderColor: accent+'33' }}>
            <div className="flex flex-col items-center justify-center rounded-lg w-14 h-14 shrink-0" style={{ backgroundColor: accent+'22' }}>
              <span className="text-3xl font-black tabular-nums leading-none" style={{ color: accent }}>{value}</span>
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <p className="text-xs font-black text-slate-800 leading-tight">{label}</p>
              <p className="text-[10px] font-bold text-slate-400 leading-tight">{sublabel}</p>
            </div>
          </div>
        ))}

        {/* 加工 + 打包 + 装车 combined */}
        <div className="rounded-xl p-3 border-2 bg-blue-50 flex flex-col gap-2" style={{ borderColor: '#3B82F633' }}>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none">错误来源 Cause</p>
          <div className="flex gap-1.5 flex-1 items-center">
            <div className="flex-1 flex flex-col items-center justify-center rounded-lg py-2" style={{ backgroundColor: '#3B82F622' }}>
              <span className="text-3xl font-black tabular-nums leading-none text-blue-600">{monthOperator}</span>
              <span className="text-[11px] font-black text-blue-500 mt-1">加工错误</span>
              <span className="text-[10px] font-bold text-blue-300">Operator</span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center rounded-lg py-2" style={{ backgroundColor: '#7C3AED22' }}>
              <span className="text-3xl font-black tabular-nums leading-none text-violet-600">{monthPacker}</span>
              <span className="text-[11px] font-black text-violet-500 mt-1">打包错误</span>
              <span className="text-[10px] font-bold text-violet-300">Packer</span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center rounded-lg py-2" style={{ backgroundColor: '#F59E0B22' }}>
              <span className="text-3xl font-black tabular-nums leading-none text-amber-600">{monthLoader}</span>
              <span className="text-[11px] font-black text-amber-500 mt-1">装车错误</span>
              <span className="text-[10px] font-bold text-amber-300">Loading</span>
            </div>
          </div>
        </div>

        {/* 早班 + 下午班 combined */}
        <div className="rounded-xl p-3 border-2 bg-indigo-50 flex flex-col gap-2" style={{ borderColor: '#6366F133' }}>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none">班次 Shift</p>
          <div className="flex gap-2 flex-1 items-center">
            <div className="flex-1 flex flex-col items-center justify-center rounded-lg py-2" style={{ backgroundColor: '#6366F122' }}>
              <span className="text-3xl font-black tabular-nums leading-none text-indigo-600">{monthMorning}</span>
              <span className="text-[11px] font-black text-indigo-500 mt-1">早班</span>
              <span className="text-[10px] font-bold text-indigo-300">Morning AM</span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center rounded-lg py-2" style={{ backgroundColor: '#EC489922' }}>
              <span className="text-3xl font-black tabular-nums leading-none text-pink-600">{monthAfternoon}</span>
              <span className="text-[11px] font-black text-pink-500 mt-1">下午班</span>
              <span className="text-[10px] font-bold text-pink-300">Afternoon PM</span>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[33%_auto_1fr] gap-4 flex-1 min-h-0">
        <QualityIssueTracker issues={issues} onSave={saveIssues} />
        <QualityAlertPanel />
        <ProcessDocBoard />
      </div>
    </SectionWrapper>
  );
};

// ---- Machine Load Panel ----
const ML_MACHINES = ['FT-1', 'FT-2', 'MST', 'PL22', 'SL28', 'SL32', 'SL300', 'Robo'];

interface MLRow {
  machine: string;
  pl: number;       // Today PL
  open: number;     // Today Open
  day2_pl: number;  // Day 2 PL
  day2_open: number;// Day 2 Open
  shiftProd: number;// Current shift production entered by operator
}

// ---- Operator Capacity Panel ----
interface OpRow {
  machine: string;
  mOp: string;   // morning operator name
  mCap: number;  // morning full-shift capacity (tons)
  aOp: string;   // afternoon operator name
  aCap: number;  // afternoon full-shift capacity (tons)
}

const DEFAULT_OP_ROWS: OpRow[] = [
  { machine: 'SL300', mOp: 'Yichao',       mCap: 19.6,  aOp: 'Geo',        aCap: 21.6  },
  { machine: 'SL32',  mOp: 'Eric Chen Xi', mCap: 15.4,  aOp: 'Dean',       aCap: 15.12 },
  { machine: 'PL22',   mOp: 'Winston',      mCap: 11.13, aOp: 'John',       aCap: 13.32 },
  { machine: 'MST',   mOp: '老田 Tian',    mCap: 11.16, aOp: 'Christian',  aCap: 5.76  },
  { machine: 'Robo',  mOp: 'Simon',        mCap: 10.5,  aOp: 'Basanta',    aCap: 7.7   },
  { machine: 'SL28',  mOp: 'Kurtic',       mCap: 10.5,  aOp: 'Eric/老钟',  aCap: 11.88 },
  { machine: 'FT-2',  mOp: 'Tomson',       mCap: 5.4,   aOp: 'Kong',       aCap: 4.65  },
  { machine: 'FT-1',  mOp: 'Kai Yuan',     mCap: 4.725, aOp: 'Allen',      aCap: 4.2   },
];

// ---- Capacity & Cost types ----
interface CapEmp {
  id: string;
  profileId?: string; // links to OperatorProfile.id (name-based identity)
  name: string;
  role: 'operator' | 'loader' | 'packer' | 'cutter' | 'crane' | 'forklift' | 'supervisor' | 'fitter';
  machine: string;
  shift: 'morning' | 'afternoon';
  type: 'fulltime' | 'casual';
  rate: number;
  hours: number;
  capacity: number;
  efficiency: number;
  superPct: number;
  status: 'passed' | 'not_assessed' | 'failed';
  active: boolean;
}

interface CapLeave {
  id: string;
  empName: string;
  shift?: 'morning' | 'afternoon';
  date: string;     // start date YYYY-MM-DD
  endDate?: string; // end date YYYY-MM-DD (if range; omit for single day)
  reason?: string;
}

interface CostStaff {
  id: string;
  name: string;
  role: 'management' | 'teamleader';
  hours: number;
  rate: number;
}

// ---- People Panel types ----
type LoaderLevel = '' | 'L1' | 'L2' | 'L3' | 'L4';
type InterviewGrade = '' | 'D' | 'C' | 'C+' | 'B' | 'B+' | 'A' | 'A+';

interface IvValuesScores { passion: number; dedication: number; teamwork: number; customerFirst: number; }
interface IvWorkScores   { efficiency: number; quality: number; safety: number; fiveS: number; }
interface IvTLScores     { teamBuilding: number; behaviorMetrics: number; fiveS: number; }

interface QuarterlyAssessment {
  id: string;
  profileId: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  values: IvValuesScores;
  workScores: IvWorkScores;
  tlScores: IvTLScores;
  notes: string;
}

interface OperatorProfile {
  id: string;
  name: string;
  shift: 'AM' | 'PM';
  type: 'fulltime' | 'casual';
  role: string;
  loaderLevel: LoaderLevel;
  packerLevel?: LoaderLevel;
  machines: string[];
  active: boolean;
  stickers?: Record<string, string[]>; // 'packer' | 'loader' | 'operator'
  tlType?: 'production' | 'loader';   // Team Leader type (sets different responsibility dims)
  tlDimLabels?: Record<string, string>; // Custom labels for TL responsibility dims
  visaType?: string;   // e.g. "PR", "482", "Citizen", "WHV"
  visaExpiry?: string; // ISO date string, e.g. "2026-09-30"
}

interface BiWeeklyInterview {
  id: string;
  profileId: string;
  periodStart: string;         // YYYY-MM-DD
  periodEnd: string;           // YYYY-MM-DD
  supervisor: string;
  grade: InterviewGrade;
  values: IvValuesScores;
  workScores: IvWorkScores;    // kept for legacy / quarterly aggregation
  tlScores: IvTLScores;        // kept for TL
  notes: string;               // legacy
  lowScoreReason: string;      // legacy
  interviewSummary: string;    // 面谈摘要
  quarterlyAssessment: string; // legacy
  workNotes: Record<string, string>; // legacy per-dim notes
  bonus: number;               // 奖金金额
  workIssues: Record<string, string[]>; // negative issue records per dim
  workGood:  Record<string, string[]>;  // positive good records per dim
}

const PEOPLE_ROLE_LABELS: Record<string, string> = {
  operator: 'Machine Operator', loader: 'Loader', crane: 'Crane Operator',
  forklift: 'Forklift', supervisor: 'Supervisor', packer: 'Packer', cutter: 'Cutter',
};

const GRADE_OPTIONS: InterviewGrade[] = ['D', 'C', 'C+', 'B', 'B+', 'A', 'A+'];
const GRADE_COLOR: Record<string, string> = {
  '':   'bg-slate-100 text-slate-400',
  'D':  'bg-red-100 text-red-600',
  'C':  'bg-orange-100 text-orange-600',
  'C+': 'bg-amber-100 text-amber-700',
  'B':  'bg-blue-100 text-blue-700',
  'B+': 'bg-blue-200 text-blue-800',
  'A':  'bg-emerald-100 text-emerald-700',
  'A+': 'bg-emerald-200 text-emerald-800',
};

const IV_VALUES_DIMS: { key: keyof IvValuesScores; label: string }[] = [
  { key: 'passion',       label: '激情' },
  { key: 'dedication',    label: '敬业' },
  { key: 'teamwork',      label: '团队协作' },
  { key: 'customerFirst', label: '客户第一' },
];
const IV_WORK_DIMS: { key: keyof IvWorkScores; label: string }[] = [
  { key: 'efficiency', label: '奖金/效率' },
  { key: 'quality',    label: '生产质量' },
  { key: 'safety',     label: '安全' },
  { key: 'fiveS',      label: '5S整理' },
];
const IV_TL_DIMS: { key: keyof IvTLScores; label: string }[] = [
  { key: 'teamBuilding',    label: '团队建设' },
  { key: 'behaviorMetrics', label: '行为指标' },
  { key: 'fiveS',           label: '5S整理' },
];

// Production Team Leader dims (issue-tracked, auto-scored)
const IV_PROD_TL_DIMS: { key: string; label: string }[] = [
  { key: 'quality',         label: '生产质量' },
  { key: 'tlRole',          label: 'Team Leader职责' },
  { key: 'machineManage',   label: '机器维护' },
  { key: 'teamBuilding',    label: '团队建设' },
  { key: 'behaviorMetrics', label: '行为指标' },
  { key: 'fiveS',           label: '5S整理' },
];

// Loader Team Leader dims (issue-tracked, auto-scored)
const IV_LOADER_TL_DIMS: { key: string; label: string }[] = [
  { key: 'loadingQuality',    label: '装车质量' },
  { key: 'tlRole',            label: 'Team Leader职责' },
  { key: 'collaboration',     label: '协作/问题解决' },
  { key: 'equipmentManage',   label: '叉车吊车维护' },
  { key: 'behaviorMetrics',   label: '行为指标' },
  { key: 'fiveSImprovement',  label: '5S整理改善' },
];

const EMPTY_IV_ENTRY: Omit<BiWeeklyInterview, 'id' | 'profileId'> = {
  periodStart: new Date().toISOString().slice(0, 10),
  periodEnd:   new Date().toISOString().slice(0, 10),
  supervisor: '',
  grade: '',
  values:     { passion: 0, dedication: 0, teamwork: 0, customerFirst: 0 },
  workScores: { efficiency: 0, quality: 0, safety: 0, fiveS: 0 },
  tlScores:   { teamBuilding: 5, behaviorMetrics: 5, fiveS: 5 },
  notes: '',
  lowScoreReason: '',
  interviewSummary: '',
  quarterlyAssessment: '',
  workNotes: {},
  bonus: 0,
  workIssues: {},
  workGood: {},
};

const DEFAULT_OPERATOR_PROFILES: OperatorProfile[] = [
  // AM operators
  { id:'op-kaiyuan',        name:'Kai Yuan',             shift:'AM', type:'casual',   role:'operator',  loaderLevel:'',   machines:['FT-1'],  active:true },
  { id:'op-weidong',        name:'Weidong Tang',          shift:'AM', type:'casual',   role:'operator',  loaderLevel:'',   machines:['FT-2'],  active:true },
  { id:'op-baohe',          name:'Baohe Tian',            shift:'AM', type:'fulltime', role:'operator',  loaderLevel:'',   machines:['MST'],   active:true },
  { id:'op-yundeng',        name:'Yundeng Mai',           shift:'AM', type:'fulltime', role:'operator',  loaderLevel:'',   machines:['PL22'],  active:true },
  { id:'op-kurtic',         name:'Kurtic Pink',           shift:'AM', type:'casual',   role:'operator',  loaderLevel:'',   machines:['SL28'],  active:true },
  { id:'op-chenxi',         name:'Chenxi Li',             shift:'AM', type:'fulltime', role:'operator',  loaderLevel:'',   machines:['SL32'],  active:true },
  { id:'op-yichao',         name:'Yichao Ji',             shift:'AM', type:'casual',   role:'operator',  loaderLevel:'',   machines:['SL300'], active:true },
  { id:'op-huanfeng',       name:'Huanfeng CHEN',         shift:'AM', type:'fulltime', role:'operator',  loaderLevel:'',   machines:['Robo'],  active:true },
  { id:'op-sugeng',         name:'Sugeng Hariyadi',       shift:'AM', type:'casual',   role:'operator',  loaderLevel:'',   machines:['Robo'],  active:true },
  // PM operators
  { id:'op-christian-e',    name:'Christian Enrile',      shift:'PM', type:'casual',   role:'operator',  loaderLevel:'',   machines:['FT-1','MST'], active:true },
  { id:'op-dexing',         name:'Dexing Kong',           shift:'PM', type:'casual',   role:'operator',  loaderLevel:'',   machines:['FT-2'],  active:true },
  { id:'op-geo',            name:'Geo',                   shift:'PM', type:'casual',   role:'operator',  loaderLevel:'',   machines:['SL300'], active:true },
  { id:'op-dean',           name:'Dean Erbert',            shift:'PM', type:'casual',   role:'operator',  loaderLevel:'',   machines:['SL32'],  active:true },
  { id:'op-john',           name:'John',                  shift:'PM', type:'casual',   role:'operator',  loaderLevel:'',   machines:['PL22'],  active:true },
  { id:'op-basanta',        name:'Basanta',               shift:'PM', type:'casual',   role:'operator',  loaderLevel:'',   machines:['Robo'],  active:true },
  // AM loaders / crane
  { id:'op-tuan',           name:'Tuan Tran',             shift:'AM', type:'casual',   role:'loader',    loaderLevel:'L2', machines:[],        active:true },
  { id:'op-xingjiang',      name:'Xingjiang Xu',          shift:'AM', type:'casual',   role:'loader',    loaderLevel:'L2', machines:[],        active:true },
  { id:'op-shengchih',      name:'Shengchih Hung',        shift:'AM', type:'casual',   role:'loader',    loaderLevel:'L2', machines:[],        active:true },
  { id:'op-joe',            name:'Joe',                   shift:'AM', type:'fulltime', role:'crane',     loaderLevel:'',   machines:[],        active:true },
  { id:'op-laoxu',          name:'老许',                  shift:'AM', type:'fulltime', role:'crane',     loaderLevel:'',   machines:[],        active:true },
  { id:'op-sam',            name:'Sam',                   shift:'AM', type:'fulltime', role:'forklift',  loaderLevel:'',   machines:[],        active:true },
  // PM loaders / crane
  { id:'op-leanschel-david',name:'Leanschel Joseph David',shift:'PM', type:'casual',   role:'loader',    loaderLevel:'L2', machines:[],        active:true },
  { id:'op-tingyi',         name:'Tingyi Xie',            shift:'PM', type:'casual',   role:'loader',    loaderLevel:'L2', machines:[],        active:true },
  { id:'op-yubiao',         name:'Yubiao Wu',             shift:'PM', type:'casual',   role:'loader',    loaderLevel:'L2', machines:[],        active:true },
  { id:'op-geocasper',      name:'Geo Casper Chong',      shift:'PM', type:'casual',   role:'loader',    loaderLevel:'L2', machines:[],        active:true },
  { id:'op-leanschel-j',    name:'Leanschel Joseph',      shift:'PM', type:'casual',   role:'crane',     loaderLevel:'',   machines:[],        active:true },
];

const CAP_ROLE_LABEL: Record<string, string> = { forklift:'Forklift', loader:'Loader', packer:'Packer', cutter:'Cutter', supervisor:'Supervisor', crane:'Crane', fitter:'M.Fitter' };
const CAP_ROLE_COLOR: Record<string, string> = {
  forklift:'bg-amber-100 text-amber-800', loader:'bg-blue-100 text-blue-800',
  packer:'bg-purple-100 text-purple-800', cutter:'bg-red-100 text-red-800',
  supervisor:'bg-slate-200 text-slate-700', crane:'bg-cyan-100 text-cyan-800',
  fitter:'bg-orange-100 text-orange-800',
};

const DEFAULT_CAP_EMPLOYEES: CapEmp[] = [
  // Morning operators
  { id:'m-ft1',  name:'Kai Yuan',        role:'operator',   machine:'FT-1',  shift:'morning',   type:'casual',   rate:34,   hours:7, capacity:4.725, efficiency:0.675, superPct:11, status:'not_assessed', active:true },
  { id:'m-ft2',  name:'Weidong Tang',    role:'operator',   machine:'FT-2',  shift:'morning',   type:'casual',   rate:33,   hours:7, capacity:5.4,   efficiency:0.771, superPct:11, status:'not_assessed', active:true },
  { id:'m-mst',  name:'Baohe Tian',      role:'operator',   machine:'MST',   shift:'morning',   type:'fulltime', rate:35,   hours:7, capacity:11.16, efficiency:1.594, superPct:11, status:'not_assessed', active:true },
  { id:'m-p22',  name:'Yundeng Mai',     role:'operator',   machine:'PL22',  shift:'morning',   type:'fulltime', rate:35.5, hours:7, capacity:11.13, efficiency:1.590, superPct:11, status:'not_assessed', active:true },
  { id:'m-sl28', name:'Kurtic Pink',     role:'operator',   machine:'SL28',  shift:'morning',   type:'casual',   rate:34,   hours:7, capacity:10.5,  efficiency:1.500, superPct:11, status:'not_assessed', active:true },
  { id:'m-sl32', name:'Chenxi Li',       role:'operator',   machine:'SL32',  shift:'morning',   type:'fulltime', rate:34,   hours:7, capacity:15.4,  efficiency:2.200, superPct:11, status:'not_assessed', active:true },
  { id:'m-sl300',name:'Yichao Ji',       role:'operator',   machine:'SL300', shift:'morning',   type:'casual',   rate:35,   hours:7, capacity:19.6,  efficiency:2.800, superPct:11, status:'not_assessed', active:true },
  { id:'m-robo', name:'Huanfeng CHEN',   role:'operator',   machine:'Robo',  shift:'morning',   type:'fulltime', rate:35.5, hours:7, capacity:10.5,  efficiency:1.500, superPct:11, status:'not_assessed', active:true },
  { id:'m-robo2',name:'Sugeng Hariyadi',role:'operator',   machine:'Robo',  shift:'morning',   type:'casual',   rate:34,   hours:7, capacity:0,     efficiency:0,     superPct:11, status:'not_assessed', active:true },
  // Morning crane + loaders
  { id:'m-crn2', name:'Joe',             role:'crane',      machine:'',      shift:'morning',   type:'fulltime', rate:35.5, hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true },
  { id:'m-crn3', name:'老许',            role:'crane',      machine:'',      shift:'morning',   type:'fulltime', rate:33,   hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true },
  { id:'m-ld',   name:'Tuan Tran',       role:'loader',     machine:'',      shift:'morning',   type:'casual',   rate:35,   hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true },
  { id:'m-ld2',  name:'Xingjiang Xu',    role:'loader',     machine:'',      shift:'morning',   type:'casual',   rate:35,   hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true },
  { id:'m-ld3',  name:'Shengchih Hung',  role:'loader',     machine:'',      shift:'morning',   type:'casual',   rate:35,   hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true },
  // Morning support
  { id:'m-fit',  name:'(Machine Fitter)',role:'fitter',     machine:'',      shift:'morning',   type:'fulltime', rate:40,   hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true },
  { id:'m-fl',   name:'Sam',             role:'forklift',   machine:'',      shift:'morning',   type:'fulltime', rate:38.5, hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true },
  { id:'m-pk1',  name:'Sorin',           role:'packer',     machine:'SL28',  shift:'morning',   type:'casual',   rate:32,   hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true },
  { id:'m-pk2',  name:'Con',             role:'packer',     machine:'SL32',  shift:'morning',   type:'casual',   rate:32,   hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true },
  { id:'m-cut',  name:'Sugen',           role:'cutter',     machine:'',      shift:'morning',   type:'casual',   rate:36,   hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true },
  { id:'m-sv',   name:'Elvin',           role:'supervisor', machine:'',      shift:'morning',   type:'fulltime', rate:0,    hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true },
  // Afternoon operators
  { id:'a-ft1',  name:'Christian Enrile',role:'operator',   machine:'FT-1',  shift:'afternoon', type:'casual',   rate:37.3, hours:7, capacity:4.2,   efficiency:0.600, superPct:11, status:'not_assessed', active:true },
  { id:'a-ft2',  name:'Dexing Kong',     role:'operator',   machine:'FT-2',  shift:'afternoon', type:'casual',   rate:37.3, hours:7, capacity:4.68,  efficiency:0.669, superPct:11, status:'not_assessed', active:true },
  { id:'a-mst',  name:'Christian Enrile',role:'operator',   machine:'MST',   shift:'afternoon', type:'casual',   rate:37.3, hours:7, capacity:5.76,  efficiency:0.823, superPct:11, status:'not_assessed', active:true },
  { id:'a-p22',  name:'John',            role:'operator',   machine:'PL22',  shift:'afternoon', type:'casual',   rate:40.1, hours:7, capacity:13.32, efficiency:1.903, superPct:11, status:'not_assessed', active:true },
  { id:'a-sl28', name:'Eric(陪读)',      role:'operator',   machine:'SL28',  shift:'afternoon', type:'casual',   rate:38.3, hours:7, capacity:11.88, efficiency:1.697, superPct:11, status:'not_assessed', active:true },
  { id:'a-sl32', name:'Dean Erbert',      role:'operator',   machine:'SL32',  shift:'afternoon', type:'casual',   rate:39.6, hours:7, capacity:15.12, efficiency:2.160, superPct:11, status:'not_assessed', active:true },
  { id:'a-sl300',name:'Geo',             role:'operator',   machine:'SL300', shift:'afternoon', type:'fulltime', rate:40.8, hours:7, capacity:21.6,  efficiency:3.086, superPct:11, status:'not_assessed', active:true },
  { id:'a-robo', name:'Basanta',         role:'operator',   machine:'Robo',  shift:'afternoon', type:'casual',   rate:38.6, hours:7, capacity:7.7,   efficiency:1.100, superPct:11, status:'not_assessed', active:true },
  // Afternoon crane + loaders
  { id:'a-crn2', name:'老吴',            role:'crane',      machine:'',      shift:'afternoon', type:'fulltime', rate:44.8, hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true },
  { id:'a-crn3', name:'Leanschel Joseph',role:'crane',      machine:'',      shift:'afternoon', type:'casual',   rate:38.6, hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true },
  { id:'a-ld',   name:'Leanschel Joseph David', role:'loader', machine:'',   shift:'afternoon', type:'casual',   rate:35,   hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true },
  { id:'a-ld2',  name:'Tingyi Xie',      role:'loader',     machine:'',      shift:'afternoon', type:'casual',   rate:35,   hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true },
  { id:'a-ld3',  name:'Yubiao Wu',       role:'loader',     machine:'',      shift:'afternoon', type:'casual',   rate:35,   hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true },
  { id:'a-ld4',  name:'Geo Casper Chong',role:'loader',     machine:'',      shift:'afternoon', type:'casual',   rate:35,   hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true },
  // Afternoon support
  { id:'a-pk',   name:'Daniel',          role:'packer',     machine:'SL28',  shift:'afternoon', type:'casual',   rate:37.3, hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true },
  { id:'a-pk2',  name:'(空缺)',          role:'packer',     machine:'SL32',  shift:'afternoon', type:'casual',   rate:37.3, hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true },
  { id:'a-sv',   name:'James',           role:'supervisor', machine:'',      shift:'afternoon', type:'fulltime', rate:0,    hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true },
];

// Working time: 435 min per shift (7h15m)
// Morning segments (minutes since midnight): 06:00-09:00, 09:15-12:00, 12:30-14:00
// Afternoon segments: 14:00-15:30, 15:45-18:00, 18:30-22:00
const MORNING_SEGS = [[360, 540], [555, 720], [750, 840]] as const;
const AFTN_SEGS    = [[840, 930], [945, 1080], [1110, 1320]] as const;
const SHIFT_TOTAL_MINS = 435;

// ---- Production Records ----
interface ProdRecord { value: number; date: string; operator?: string; } // date: YYYY-MM-DD, value: Kg/H
interface MachineProdRecord {
  allTime: ProdRecord | null;
  allTimeRate: ProdRecord | null; // best Kg/H rate, manually editable
  quarters: Record<string, ProdRecord | null>; // e.g. {"2026-Q2": {...}}
}
type ProdRecordsMap = Record<string, MachineProdRecord>;

const getQuarterKey = (d: Date) => `${d.getFullYear()}-Q${Math.ceil((d.getMonth() + 1) / 3)}`;

// ---- Bi-Weekly Efficiency (PDF-sourced) ----
interface BiWeeklyOpEntry {
  operator: string;
  machineCode: string;   // e.g. 'SL28'
  machineName: string;   // raw name from PDF
  shift: 'AM' | 'PM';
  avgKgH: number;
  peakKgH: number;
  shiftsWorked: number;
  bonus?: number;        // 奖金金额 (from xlsx upload)
}
interface BiWeeklyPeriod {
  id: string;
  periodStart: string;   // YYYY-MM-DD
  periodEnd: string;
  uploadDate: string;
  label: string;         // e.g. "2026 Apr30–May13"
  entries: BiWeeklyOpEntry[];
}

// Machine name → ML_MACHINES code mapping
const PDF_MACHINE_MAP: Record<string, string> = {
  'syntax line 28': 'SL28', 'syntax line28': 'SL28', 'sl28': 'SL28',
  'syntax line 32': 'SL32', 'syntax line32': 'SL32', 'sl32': 'SL32',
  'syntax line 300': 'SL300', 'sl300': 'SL300',
  'format 16 hs': 'FT-1', 'format 16hs': 'FT-1', 'format16 hs': 'FT-1',
  'format 16 hs-2': 'FT-2', 'format 16hs-2': 'FT-2', 'format16 hs-2': 'FT-2',
  'mini syntax 16 hs': 'MST', 'mini syntax16 hs': 'MST',
  'robomaster 60 evo': 'Robo', 'robomaste 60 evo': 'Robo', 'robomaster60 evo': 'Robo',
  'gjw150b': 'SL300', 'gjw 150b': 'SL300',  // GJW150B = SL300
  'plant 22': 'PL22', 'plant22': 'PL22',      // Plant 22 = P22
  'planet 22': 'PL22', 'planet22': 'PL22', 'pl22': 'PL22',
};
const resolveMachineCode = (rawName: string): string => {
  const key = rawName.toLowerCase().trim().replace(/\s+/g, ' ');
  return PDF_MACHINE_MAP[key] ?? rawName;
};

const fmtShortDate = (s: string) => {
  const [, m, day] = s.split('-');
  return `${parseInt(m)}/${parseInt(day)}`;
};

const getElapsedWorkingMins = (shift: 'morning' | 'afternoon', now: Date): number => {
  const t = now.getHours() * 60 + now.getMinutes();
  const segs = shift === 'morning' ? MORNING_SEGS : AFTN_SEGS;
  const shiftStart = segs[0][0];
  const shiftEnd   = segs[segs.length - 1][1];
  if (t <= shiftStart) return 0;
  if (t >= shiftEnd) return SHIFT_TOTAL_MINS;
  let elapsed = 0;
  for (const [s, e] of segs) {
    if (t <= s) break;
    elapsed += Math.min(t, e) - s;
  }
  return Math.min(SHIFT_TOTAL_MINS, elapsed);
};

const fmtNum = (n: number) => n > 0 ? n.toLocaleString() : '—';
const fmtT   = (n: number) => n.toFixed(2) + ' T';
const pad2 = (n: number) => String(n).padStart(2, '0');

interface MLPanelProps {
  shift: 'morning' | 'afternoon';
  onShiftChange: (s: 'morning' | 'afternoon') => void;
  rows: MLRow[];
  onRowsChange: (u: MLRow[]) => void;
  opRows: OpRow[];
}
const MachineLoadPanel: React.FC<MLPanelProps> = ({ shift, onShiftChange, rows, onRowsChange, opRows }) => {
  const [now, setNow] = useState(new Date());
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('claude_api_key') || '');
  const [keyInput, setKeyInput] = useState(() => localStorage.getItem('claude_api_key') || '');
  const [showKey, setShowKey] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [extractError, setExtractError] = useState('');

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(iv);
  }, []);

  const save = (u: MLRow[]) => { onRowsChange(u); idbSet('machineLoad', u); };
  const updateRow = (i: number, patch: Partial<MLRow>) => {
    const u = rows.map((r, j) => j === i ? { ...r, ...patch } : r);
    save(u);
  };

  // Dual-shift time math
  const h = now.getHours();
  const morningDone = h >= 14;
  const isPlanningMode = h >= 22 || h < 6;
  const mElapsed   = isPlanningMode ? 0 : getElapsedWorkingMins('morning', now);
  const aElapsed   = getElapsedWorkingMins('afternoon', now);
  const mRemaining = Math.max(0, SHIFT_TOTAL_MINS - mElapsed);
  const aRemaining = Math.max(0, SHIFT_TOTAL_MINS - aElapsed);
  // Progress bar shows the currently selected shift
  const elapsedMins   = shift === 'morning' ? mElapsed : aElapsed;
  const remainingMins = shift === 'morning' ? mRemaining : aRemaining;
  const elapsedPct    = SHIFT_TOTAL_MINS > 0 ? elapsedMins / SHIFT_TOTAL_MINS : 0;

  // Targets (kg → T)
  const getMorningTargetT  = (row: MLRow) => (row.pl + row.open + row.day2_pl) / 1000;
  // Afternoon target = Day2 Open minus what morning already processes beyond its target.
  // If morning capacity > morning target, morning continues into Day2 Open.
  const getAfternoonTargetT = (row: MLRow) => {
    const op = opRows.find(r => r.machine === row.machine);
    const mTgt = getMorningTargetT(row);
    const mFullCap = op?.mCap ?? 0;
    const mSurplus = Math.max(0, mFullCap - mTgt); // morning eats this much of Day2 Open
    return Math.max(0, row.day2_open / 1000 - mSurplus);
  };

  // Projected remaining for each shift
  const mProjRem = (machine: string) => {
    const op = opRows.find(r => r.machine === machine);
    if (!op) return null;
    return (mRemaining / SHIFT_TOTAL_MINS) * op.mCap;
  };
  const aProjRem = (machine: string) => {
    const op = opRows.find(r => r.machine === machine);
    if (!op) return null;
    return (aRemaining / SHIFT_TOTAL_MINS) * op.aCap;
  };

  // Claude API extraction
  const extractPhoto = async (file: File) => {
    setExtractError('');
    if (!apiKey.trim()) { setShowKey(true); return; }
    setExtracting(true);
    setPhotoPreview(URL.createObjectURL(file));
    try {
      const base64 = await fileToBase64(file);
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true });
      const resp = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: file.type as 'image/jpeg'|'image/png'|'image/gif'|'image/webp', data: base64 }
            },
            {
              type: 'text',
              text: `This is a Production Machine Load table. The header row shows: Machine | W(kg) | Prod | PL | Open | W(kg) | Prod | PL | Open | W(kg) | Prod | PL | Open ...
The first group of 4 columns (W/Prod/PL/Open) = Today. The second group = Day 2. The third group = Day 3.
For each machine row, extract:
- machine: the machine name (FT-1, FT-2, MST, P22, SL28, SL32, SL300, or Robo)
- pl: PL value from the TODAY group (3rd column of today group)
- open: Open value from the TODAY group (4th column of today group)
- day2_pl: PL value from the DAY 2 group (3rd column of day2 group)
- day2_open: Open value from the DAY 2 group (4th column of day2 group)
Red highlighted cells contain the key values. Use 0 for empty/blank cells.
Return ONLY a JSON array like: [{"machine":"FT-1","pl":0,"open":0,"day2_pl":0,"day2_open":2461},...]`
            }
          ]
        }]
      });
      const text = resp.content[0].type === 'text' ? resp.content[0].text : '';
      console.log('[OCR raw]', text);
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const extracted: Partial<MLRow>[] = JSON.parse(match[0]);
        console.log('[OCR parsed]', JSON.stringify(extracted, null, 2));
        save(rows.map(r => {
          const found = extracted.find(e => e.machine === r.machine);
          return found ? { ...r, ...found } : r;
        }));
      } else {
        setExtractError('无法识别表格数据，请重试或手动输入');
      }
    } catch (e: any) {
      setExtractError(e?.message || '提取失败，请检查 API Key 是否正确');
    }
    setExtracting(false);
  };

  const totalRow = {
    pl:       rows.reduce((s, r) => s + r.pl, 0),
    open:     rows.reduce((s, r) => s + r.open, 0),
    day2_pl:  rows.reduce((s, r) => s + r.day2_pl, 0),
    day2_open:rows.reduce((s, r) => s + r.day2_open, 0),
  };
  const totalMorningTargetT   = rows.reduce((s, r) => s + getMorningTargetT(r), 0);
  const totalAfternoonTargetT = rows.reduce((s, r) => s + getAfternoonTargetT(r), 0);
  const totalMProjRem = opRows.reduce((s, op) => s + (mRemaining / SHIFT_TOTAL_MINS) * op.mCap, 0);
  const totalAProjRem = opRows.reduce((s, op) => s + (aRemaining / SHIFT_TOTAL_MINS) * op.aCap, 0);

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-100 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 py-1 border-b border-slate-100 shrink-0 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-black text-slate-700 flex-1">机器产量负荷 Machine Load</h3>
          {/* Shift selector */}
          <div className="flex rounded overflow-hidden border border-slate-200 text-[9px] font-black">
            {(['morning','afternoon'] as const).map(s => (
              <button key={s} onClick={()=>onShiftChange(s)}
                className={cn("px-2 py-0.5 transition-all", shift===s ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50')}>
                {s==='morning' ? '早班 06:00–14:00' : '下午班 14:00–22:00'}
              </button>
            ))}
          </div>
          {/* Clock */}
          <span className="text-xs font-black text-slate-500 tabular-nums">
            {pad2(now.getHours())}:{pad2(now.getMinutes())}
          </span>
          {/* Photo upload */}
          <label className={cn("flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase cursor-pointer transition-all",
            extracting ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700')}>
            <Camera size={10}/>{extracting ? '识别中…' : '上传照片提取'}
            <input type="file" accept="image/*" className="hidden" disabled={extracting}
              onChange={e=>{ const f=e.target.files?.[0]; if(f) extractPhoto(f); e.target.value=''; }}/>
          </label>
          {/* API key */}
          <button onClick={()=>setShowKey(v=>!v)} className="p-1 rounded hover:bg-slate-100 text-slate-400"><Settings size={11}/></button>
        </div>

        {/* API key input */}
        <AnimatePresence>
          {showKey && (
            <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
              <div className="flex gap-2 pt-1 items-center">
                <div className="relative flex-1">
                  <input type="password" placeholder="sk-ant-api03-..." value={keyInput}
                    onChange={e => {
                      setKeyInput(e.target.value);
                      setApiKey(e.target.value);
                      localStorage.setItem('claude_api_key', e.target.value);
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono bg-slate-50 focus:outline-none focus:border-blue-400 pr-24"/>
                  {apiKey && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-green-600">✓ 已保存</span>}
                </div>
                <button onClick={()=>setShowKey(false)}
                  className="px-3 py-1.5 bg-slate-700 text-white rounded-lg text-[10px] font-black shrink-0">完成</button>
              </div>
              <p className="text-xs text-slate-400 mt-1">Key 自动保存在本地浏览器，刷新后无需重新输入</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Shift progress bar / planning mode banner */}
        {isPlanningMode ? (
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-violet-50 rounded border border-violet-200">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse shrink-0"/>
            <span className="text-[9px] font-black text-violet-700">明日早班预判模式 — 上传 Load 图片自动识别明日目标，产能按满班计算</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-slate-400 uppercase shrink-0">班次进度</span>
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${elapsedPct*100}%`, backgroundColor: elapsedPct < 0.5 ? '#059669' : elapsedPct < 0.8 ? '#D97706' : '#DC2626' }}/>
            </div>
            <span className="text-[9px] font-black text-slate-500 tabular-nums shrink-0">
              已用 {Math.floor(elapsedMins/60)}h{pad2(Math.round(elapsedMins%60))}m · 剩余 {Math.floor(remainingMins/60)}h{pad2(Math.round(remainingMins%60))}m
            </span>
          </div>
        )}

        {extractError && <p className="text-[10px] font-bold text-red-500">{extractError}</p>}
      </div>

      {/* Table — styled like the production system: red cells for PL/Open, green for projected */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-xs table-fixed w-full" style={{minWidth:'650px'}}>
          <colgroup>
            {/* cols 0-6: 9 non-status cols share remaining width; cols 7,10: status = 90px each */}
            {Array.from({length:11}).map((_,i)=>(
              <col key={i} style={{width: (i===7||i===10) ? '120px' : 'calc((100% - 240px) / 9)'}}/>
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10">
            {/* Group headers */}
            <tr className="bg-slate-800 text-white">
              <th className="px-0 py-1.5 text-center font-bold text-xs uppercase">机器</th>
              <th colSpan={2} className="px-0 py-1.5 text-center font-bold text-xs uppercase border-l border-slate-600">Today</th>
              <th colSpan={2} className="px-0 py-1.5 text-center font-bold text-xs uppercase border-l border-slate-600">Day 2</th>
              <th colSpan={3} className="px-0 py-1.5 text-center font-bold text-xs uppercase border-l border-amber-500 bg-amber-700">早班</th>
              <th colSpan={3} className="px-0 py-1.5 text-center font-bold text-xs uppercase border-l border-indigo-500 bg-indigo-700">下午班</th>
            </tr>
            {/* Sub-headers */}
            <tr className="bg-slate-700 text-slate-300 text-xs">
              <th className="px-0 py-1 text-center"></th>
              <th className="px-0 py-1 text-center border-l border-slate-600">PL</th>
              <th className="px-0 py-1 text-center">Open</th>
              <th className="px-0 py-1 text-center border-l border-slate-600">PL</th>
              <th className="px-0 py-1 text-center">Open</th>
              <th className="px-0 py-1 text-center border-l border-amber-600">目标</th>
              <th className="px-0 py-1 text-center">预计</th>
              <th className="px-0 py-1 text-center">状态</th>
              <th className="px-0 py-1 text-center border-l border-indigo-600">目标</th>
              <th className="px-0 py-1 text-center">预计</th>
              <th className="px-0 py-1 text-center">状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const mRem  = mProjRem(row.machine);
              const aRem  = aProjRem(row.machine);
              const mTgt  = getMorningTargetT(row);
              const aTgt  = getAfternoonTargetT(row);
              const mGap  = mRem !== null && mTgt > 0 ? mRem - mTgt : 0;
              const aGap  = aRem !== null && aTgt > 0 ? aRem - aTgt : 0;
              const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-slate-50';
              const cb    = 'py-0 border-b border-slate-200 overflow-hidden';
              const inputCls = (hasVal: boolean) =>
                `w-full min-w-0 text-center bg-transparent focus:outline-none px-0 py-1.5 tabular-nums font-bold text-xs ${hasVal ? 'text-white placeholder-white/60' : 'text-slate-700'}`;
              const statusCell = (rem: number|null, tgt: number, gap: number, border: string, shiftDone = false) => {
                if (rem === null || tgt <= 0) return <td className={`${cb} ${border} text-center text-slate-300`}>—</td>;
                return (
                  <td className={`${cb} ${border} text-center py-1`}>
                    {gap >= 0
                      ? <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-green-100 text-green-800 text-xs font-black whitespace-nowrap">
                          <Check size={9} strokeWidth={3}/>+{gap.toFixed(2)}T
                        </span>
                      : shiftDone
                        ? <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-700 text-slate-100 text-xs font-black whitespace-nowrap">
                            <X size={9} strokeWidth={3}/>未完成{Math.abs(gap).toFixed(2)}T
                          </span>
                        : <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-xs font-black whitespace-nowrap">
                            <X size={9} strokeWidth={3}/>缺{Math.abs(gap).toFixed(2)}T
                          </span>
                    }
                  </td>
                );
              };
              return (
                <tr key={row.machine} className={cn(rowBg, "border-b border-slate-200 hover:brightness-95 transition-all")}>
                  <td className="py-1.5 text-center font-black text-slate-800 text-xs border-b border-slate-200 whitespace-nowrap overflow-hidden">{row.machine}</td>
                  <td className={cn(cb, "border-l border-slate-300", row.pl > 0 ? 'bg-red-600' : '')}>
                    <input type="number" value={row.pl||''} placeholder="—" onChange={e=>updateRow(i,{pl:parseFloat(e.target.value)||0})} className={inputCls(row.pl>0)}/>
                  </td>
                  <td className={cn(cb, row.open > 0 ? 'bg-red-600' : '')}>
                    <input type="number" value={row.open||''} placeholder="—" onChange={e=>updateRow(i,{open:parseFloat(e.target.value)||0})} className={inputCls(row.open>0)}/>
                  </td>
                  <td className={cn(cb, "border-l border-slate-300", row.day2_pl > 0 ? 'bg-red-600' : '')}>
                    <input type="number" value={row.day2_pl||''} placeholder="—" onChange={e=>updateRow(i,{day2_pl:parseFloat(e.target.value)||0})} className={inputCls(row.day2_pl>0)}/>
                  </td>
                  <td className={cn(cb, row.day2_open > 0 ? 'bg-red-600' : '')}>
                    <input type="number" value={row.day2_open||''} placeholder="—" onChange={e=>updateRow(i,{day2_open:parseFloat(e.target.value)||0})} className={inputCls(row.day2_open>0)}/>
                  </td>
                  {/* 早班 */}
                  <td className="py-1.5 text-center border-l border-amber-300 border-b border-slate-200 tabular-nums font-black text-xs text-slate-700">
                    {mTgt > 0 ? mTgt.toFixed(1) : '—'}
                  </td>
                  <td className={cn("py-1.5 text-center border-b border-slate-200 tabular-nums font-black text-xs",
                    mRem !== null && mTgt > 0 && mRem >= mTgt ? 'bg-green-600 text-white' :
                    mRem !== null && mTgt > 0 ? 'bg-red-100 text-red-700' : 'text-slate-400')}>
                    {mRem !== null ? mRem.toFixed(1) : '—'}
                  </td>
                  {statusCell(mRem, mTgt, mGap, 'border-b border-slate-200', morningDone)}
                  {/* 下午班 */}
                  <td className="py-1.5 text-center border-l border-indigo-300 border-b border-slate-200 tabular-nums font-black text-xs text-slate-700">
                    {aTgt > 0 ? aTgt.toFixed(1) : '—'}
                  </td>
                  <td className={cn("py-1.5 text-center border-b border-slate-200 tabular-nums font-black text-xs",
                    aRem !== null && aTgt > 0 && aRem >= aTgt ? 'bg-green-600 text-white' :
                    aRem !== null && aTgt > 0 ? 'bg-red-100 text-red-700' : 'text-slate-400')}>
                    {aRem !== null ? aRem.toFixed(1) : '—'}
                  </td>
                  {statusCell(aRem, aTgt, aGap, 'border-b border-slate-200')}
                </tr>
              );
            })}
            {/* Total row */}
            <tr className="bg-slate-800 text-white font-black text-xs">
              <td className="py-1.5 text-center uppercase tracking-widest">Total</td>
              <td className="py-1.5 text-center border-l border-slate-600 tabular-nums">{fmtNum(totalRow.pl)}</td>
              <td className="py-1.5 text-center tabular-nums">{fmtNum(totalRow.open)}</td>
              <td className="py-1.5 text-center border-l border-slate-600 tabular-nums">{fmtNum(totalRow.day2_pl)}</td>
              <td className="py-1.5 text-center tabular-nums">{fmtNum(totalRow.day2_open)}</td>
              <td className="py-1.5 text-center border-l border-amber-500 tabular-nums">{totalMorningTargetT.toFixed(1)}</td>
              <td className={cn("py-1.5 text-center tabular-nums", totalMProjRem >= totalMorningTargetT ? 'text-green-400' : 'text-red-400')}>
                {totalMProjRem.toFixed(1)}
              </td>
              <td className="py-1 text-center">
                {totalMorningTargetT > 0 ? (totalMProjRem >= totalMorningTargetT
                  ? <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-green-700 text-green-100 text-xs font-black whitespace-nowrap"><Check size={9} strokeWidth={3}/>+{(totalMProjRem-totalMorningTargetT).toFixed(2)}T</span>
                  : morningDone
                    ? <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-600 text-slate-100 text-xs font-black whitespace-nowrap"><X size={9} strokeWidth={3}/>未完成{(totalMorningTargetT-totalMProjRem).toFixed(2)}T</span>
                    : <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-700 text-red-100 text-xs font-black whitespace-nowrap"><X size={9} strokeWidth={3}/>缺{(totalMorningTargetT-totalMProjRem).toFixed(2)}T</span>
                ) : '—'}
              </td>
              <td className="py-1.5 text-center border-l border-indigo-500 tabular-nums">{totalAfternoonTargetT.toFixed(1)}</td>
              <td className={cn("py-1.5 text-center tabular-nums", totalAProjRem >= totalAfternoonTargetT ? 'text-green-400' : 'text-red-400')}>
                {totalAProjRem.toFixed(1)}
              </td>
              <td className="py-1 text-center">
                {totalAfternoonTargetT > 0 ? (totalAProjRem >= totalAfternoonTargetT
                  ? <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-green-700 text-green-100 text-xs font-black whitespace-nowrap"><Check size={9} strokeWidth={3}/>+{(totalAProjRem-totalAfternoonTargetT).toFixed(2)}T</span>
                  : <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-700 text-red-100 text-xs font-black whitespace-nowrap"><X size={9} strokeWidth={3}/>缺{(totalAfternoonTargetT-totalAProjRem).toFixed(2)}T</span>
                ) : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  );
};

interface OpPanelProps { mlRows: MLRow[]; rows: OpRow[]; onRowsChange: (u: OpRow[]) => void; }
const OperatorCapacityPanel: React.FC<OpPanelProps> = ({ mlRows, rows, onRowsChange }) => {
  const [editing, setEditing] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(iv);
  }, []);

  const save = (u: OpRow[]) => { onRowsChange(u); idbSet('operatorCapacity', u); };
  const updateRow = (i: number, patch: Partial<OpRow>) => save(rows.map((r, j) => j === i ? { ...r, ...patch } : r));

  const h = now.getHours();
  // After 22:00 → morning not started (planning for tomorrow), afternoon completed
  const mElapsed = (h >= 22 || h < 6) ? 0 : getElapsedWorkingMins('morning', now);
  const aElapsed = getElapsedWorkingMins('afternoon', now);
  const mRemaining = Math.max(0, SHIFT_TOTAL_MINS - mElapsed);
  const aRemaining = Math.max(0, SHIFT_TOTAL_MINS - aElapsed);

  const currentShift = h >= 6 && h < 14 ? 'morning' : h >= 14 && h < 22 ? 'afternoon' : null;
  const isPlanningMode = h >= 22 || h < 6;

  // PL in kg → ÷1000 → T; 早班: PL+Open+Day2PL; 下午班: PL+Open+Day2PL+Day2Open
  const mTargetT = (machine: string) => {
    const r = mlRows.find(r => r.machine === machine);
    if (!r) return null;
    const kg = r.pl + r.open + r.day2_pl;
    return kg > 0 ? kg / 1000 : null;
  };
  // Afternoon target = Day2 Open minus what morning already processes beyond its target
  const aTargetT = (machine: string) => {
    const r = mlRows.find(r => r.machine === machine);
    if (!r) return null;
    const op = rows.find(op => op.machine === machine);
    const mTgt = (r.pl + r.open + r.day2_pl) / 1000;
    const mSurplus = Math.max(0, (op?.mCap ?? 0) - mTgt);
    const aTgt = Math.max(0, r.day2_open / 1000 - mSurplus);
    return aTgt > 0 ? aTgt : null;
  };

  const statusBadge = (remCap: number, target: number | null) => {
    if (target === null || target <= 0) return <span className="text-slate-300 text-xs">无目标</span>;
    const gap = remCap - target;
    return gap >= 0
      ? <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-black whitespace-nowrap"><Check size={10} strokeWidth={3}/>+{gap.toFixed(2)}T</span>
      : <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-black whitespace-nowrap"><X size={10} strokeWidth={3}/>缺{Math.abs(gap).toFixed(2)}T</span>;
  };

  const shiftLabel = (s: 'morning' | 'afternoon') => s === 'morning'
    ? <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
        {currentShift==='morning' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block"/>}早班
      </span>
    : <span className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
        {currentShift==='afternoon' && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse inline-block"/>}下午班
      </span>;

  const remLabel = (rem: number, total: number) => {
    const pct = total > 0 ? rem / total : 0;
    return (
      <div className="flex items-center gap-1">
        <div className="w-8 h-1 bg-slate-100 rounded-full overflow-hidden shrink-0">
          <div className="h-full rounded-full" style={{ width:`${pct*100}%`, backgroundColor: pct>0.5?'#059669':pct>0.2?'#D97706':'#DC2626' }}/>
        </div>
        <span className="font-black text-xs tabular-nums">{rem.toFixed(2)}T</span>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-100 shadow-sm flex flex-col overflow-hidden" style={{minHeight:0}}>
      {/* Header */}
      <div className="px-3 py-1 border-b border-slate-100 shrink-0 flex items-center gap-2">
        <Users size={11} className="text-slate-400 shrink-0"/>
        <h3 className="text-xs font-black text-slate-700 flex-1">操作员产能 Operator Capacity</h3>
        {isPlanningMode && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[9px] font-black">
            <div className="w-1 h-1 rounded-full bg-violet-500 animate-pulse"/>明日早班预判
          </div>
        )}
        <div className="flex items-center gap-1 text-[9px] font-black text-slate-400">
          <Clock size={10}/>
          {pad2(now.getHours())}:{pad2(now.getMinutes())}
        </div>
        <button onClick={() => setEditing(v => !v)}
          className={cn("p-1 rounded transition-colors", editing ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100 text-slate-400')}>
          <Pencil size={11}/>
        </button>
      </div>

      {/* Transposed table: machines as columns, fields as rows */}
      <div className="overflow-x-auto">
        {(() => {
          const shiftHours = SHIFT_TOTAL_MINS / 60;
          const th = "px-1 py-0.5 text-[9px] font-black text-center uppercase tracking-wide border border-slate-200";
          const td = "px-1 py-0.5 text-[10px] text-center border border-slate-100";
          return (
            <table className="w-full border-collapse table-fixed">
              <colgroup>
                <col style={{width:'56px'}}/>
                {rows.map(r => <col key={r.machine} style={{width:`calc((100% - 56px) / ${rows.length})`}}/>)}
              </colgroup>
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className={th}></th>
                  {rows.map(r => <th key={r.machine} className={th}>{r.machine}</th>)}
                </tr>
              </thead>
              <tbody>
                {/* 早班 section */}
                <tr className={currentShift==='morning' ? 'bg-amber-50' : 'bg-slate-50'}>
                  <td className="px-1 py-0.5 text-[9px] font-black text-amber-700 border border-slate-200 text-center">早班<br/>操作员</td>
                  {rows.map((r, i) => (
                    <td key={r.machine} className={cn(td, "text-amber-800 font-semibold")}>
                      {editing
                        ? <input value={r.mOp} onChange={e => updateRow(i, {mOp: e.target.value})}
                            className="w-full bg-white border border-amber-200 rounded px-0.5 text-[10px] focus:outline-none text-center"/>
                        : r.mOp || '—'}
                    </td>
                  ))}
                </tr>
                <tr className={currentShift==='morning' ? 'bg-amber-50/60' : ''}>
                  <td className="px-1 py-0.5 text-[9px] font-black text-slate-500 border border-slate-200 text-center">早班<br/>产能</td>
                  {rows.map((r, i) => (
                    <td key={r.machine} className={cn(td, "font-black text-slate-700 tabular-nums")}>
                      {editing
                        ? <input type="number" step="0.01" value={r.mCap} onChange={e => updateRow(i, {mCap: parseFloat(e.target.value)||0})}
                            className="w-full bg-white border border-slate-200 rounded px-0.5 text-[10px] focus:outline-none text-center"/>
                        : r.mCap > 0 ? `${r.mCap.toFixed(1)}T` : '—'}
                    </td>
                  ))}
                </tr>
                <tr className={currentShift==='morning' ? 'bg-amber-50/40' : ''}>
                  <td className="px-1 py-0.5 text-[9px] font-black text-blue-500 border border-slate-200 text-center">早班<br/>效率</td>
                  {rows.map(r => (
                    <td key={r.machine} className={cn(td, "font-black text-blue-600 tabular-nums")}>
                      {r.mCap > 0 ? (r.mCap / shiftHours).toFixed(2) : '—'}
                    </td>
                  ))}
                </tr>
                {/* 下午班 section */}
                <tr className={currentShift==='afternoon' ? 'bg-indigo-50' : 'bg-slate-50'}>
                  <td className="px-1 py-0.5 text-[9px] font-black text-indigo-700 border border-slate-200 text-center">下午<br/>操作员</td>
                  {rows.map((r, i) => (
                    <td key={r.machine} className={cn(td, "text-indigo-800 font-semibold")}>
                      {editing
                        ? <input value={r.aOp} onChange={e => updateRow(i, {aOp: e.target.value})}
                            className="w-full bg-white border border-indigo-200 rounded px-0.5 text-[10px] focus:outline-none text-center"/>
                        : r.aOp || '—'}
                    </td>
                  ))}
                </tr>
                <tr className={currentShift==='afternoon' ? 'bg-indigo-50/60' : ''}>
                  <td className="px-1 py-0.5 text-[9px] font-black text-slate-500 border border-slate-200 text-center">下午<br/>产能</td>
                  {rows.map((r, i) => (
                    <td key={r.machine} className={cn(td, "font-black text-slate-700 tabular-nums")}>
                      {editing
                        ? <input type="number" step="0.01" value={r.aCap} onChange={e => updateRow(i, {aCap: parseFloat(e.target.value)||0})}
                            className="w-full bg-white border border-slate-200 rounded px-0.5 text-[10px] focus:outline-none text-center"/>
                        : r.aCap > 0 ? `${r.aCap.toFixed(1)}T` : '—'}
                    </td>
                  ))}
                </tr>
                <tr className={currentShift==='afternoon' ? 'bg-indigo-50/40' : ''}>
                  <td className="px-1 py-0.5 text-[9px] font-black text-blue-500 border border-slate-200 text-center">下午<br/>效率</td>
                  {rows.map(r => (
                    <td key={r.machine} className={cn(td, "font-black text-blue-600 tabular-nums")}>
                      {r.aCap > 0 ? (r.aCap / shiftHours).toFixed(2) : '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          );
        })()}
      </div>

      {editing && (
        <div className="px-4 py-2 border-t border-slate-100 bg-amber-50 shrink-0 flex items-center justify-between">
          <p className="text-xs text-amber-700 font-bold">✏️ 编辑模式 — 每两周更新一次操作员产能数据</p>
          <button onClick={() => setEditing(false)} className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-black">完成编辑</button>
        </div>
      )}
    </div>
  );
};

// ---- Bi-Weekly Efficiency Panel ----
// Shared BiWeekly data key
const BW_IDB_KEY = 'biWeeklyEfficiency';

// ---- Last 2 Weeks Panel (side panel) ----
interface Last2WeeksPanelProps {
  biWeeklyData: BiWeeklyPeriod[];
  onBiWeeklyChange: (d: BiWeeklyPeriod[]) => void;
}
const Last2WeeksPanel: React.FC<Last2WeeksPanelProps> = ({ biWeeklyData, onBiWeeklyChange }) => {
  const latest = biWeeklyData[biWeeklyData.length - 1] ?? null;
  const hasMultiplePeriods = biWeeklyData.length >= 2;

  const getTopForPeriod = (period: BiWeeklyPeriod, machineCode: string, shift: 'AM' | 'PM'): BiWeeklyOpEntry | null =>
    period.entries.filter(e => e.machineCode === machineCode && e.shift === shift)
      .sort((a, b) => b.avgKgH - a.avgKgH)[0] ?? null;

  const getTop = (machineCode: string, shift: 'AM' | 'PM'): BiWeeklyOpEntry | null =>
    latest ? getTopForPeriod(latest, machineCode, shift) : null;

  const getTrendData = (machineCode: string) =>
    biWeeklyData.map((p, i) => ({
      i,
      am: getTopForPeriod(p, machineCode, 'AM')?.avgKgH ?? 0,
      pm: getTopForPeriod(p, machineCode, 'PM')?.avgKgH ?? 0,
    }));

  const machinesWithData = latest
    ? ML_MACHINES.filter(m => latest.entries.some(e => e.machineCode === m))
    : ML_MACHINES;

  // ── Inline editing ──
  const [cellEdit, setCellEdit] = useState<Record<string, string>>({});
  const cKey = (m: string, shift: string, f: string) => `${m}:${shift}:${f}`;

  const commitCell = (m: string, shift: 'AM' | 'PM', f: 'op' | 'kgh', raw: string, original: BiWeeklyOpEntry) => {
    if (!latest) return;
    const updated = biWeeklyData.map(p => p.id !== latest.id ? p : {
      ...p,
      entries: p.entries.map(e => {
        if (e.machineCode !== m || e.shift !== shift || e.operator !== original.operator) return e;
        if (f === 'op') return { ...e, operator: raw.trim() || e.operator };
        const v = parseFloat(raw); return (isNaN(v) || v <= 0) ? e : { ...e, avgKgH: v };
      }),
    });
    onBiWeeklyChange(updated);
    setCellEdit(p => { const n = {...p}; delete n[cKey(m, shift, f)]; return n; });
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col rounded-2xl bg-white border border-slate-200 shadow-sm relative">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 shrink-0 flex items-center justify-between rounded-t-2xl">
        <div className="flex items-center gap-2">
          <Users size={11} className="text-amber-500"/>
          <span className="text-[11px] font-black text-slate-800 leading-tight">上两周操作员效率</span>
        </div>
        {latest
          ? <p className="text-[8px] text-slate-400">{latest.periodStart} ~ {latest.periodEnd}</p>
          : <p className="text-[8px] text-slate-300">上传后显示</p>}
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] px-2 pb-1 shrink-0 border-b border-slate-100">
        <div/>
        <div className="flex items-center gap-1 px-1">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"/>
          <span className="text-[7px] font-black text-amber-600 tracking-widest">早班 AM</span>
        </div>
        <div className="flex items-center gap-1 px-1">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0"/>
          <span className="text-[7px] font-black text-indigo-600 tracking-widest">下午班 PM</span>
        </div>
        <div className="flex items-center justify-center gap-1">
          <span className="text-[7px] font-black text-slate-400">{hasMultiplePeriods ? '趋势对比' : '效率对比'}</span>
        </div>
      </div>

      {!latest ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-[9px] text-slate-300 text-center">暂无数据<br/>点击右下角导入双周效率数据</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-50 rounded-b-2xl">
          {machinesWithData.map(m => {
            const am = getTop(m, 'AM');
            const pm = getTop(m, 'PM');
            const winner = am && pm ? (am.avgKgH >= pm.avgKgH ? 'AM' : 'PM') : null;
            const maxVal = Math.max(am?.avgKgH ?? 0, pm?.avgKgH ?? 0);
            const trendData = getTrendData(m);

            const renderCell = (entry: BiWeeklyOpEntry | null, shift: 'AM' | 'PM') => {
              const isAM = shift === 'AM';
              const isWinner = winner === shift;
              if (!entry) return <div className="flex items-center px-1 py-[9px]"><span className="text-[9px] text-slate-300">—</span></div>;
              const opK  = cKey(m, shift, 'op');
              const kghK = cKey(m, shift, 'kgh');
              const opV  = cellEdit[opK]  ?? entry.operator.split(' ')[0];
              const kghV = cellEdit[kghK] ?? entry.avgKgH.toFixed(0);
              return (
                <div className={cn('px-1 py-[9px] flex flex-col min-w-0', isWinner && (isAM ? 'bg-amber-50/60' : 'bg-indigo-50/40'))}>
                  <input
                    value={opV}
                    onChange={e => setCellEdit(p => ({...p, [opK]: e.target.value}))}
                    onFocus={() => setCellEdit(p => opK in p ? p : {...p, [opK]: entry.operator.split(' ')[0]})}
                    onBlur={() => commitCell(m, shift, 'op', cellEdit[opK] ?? '', entry)}
                    onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                    className="bg-transparent focus:outline-none w-full text-[10px] font-bold text-slate-700 leading-tight cursor-text hover:bg-black/[0.03] focus:bg-black/[0.04] rounded px-0.5 -mx-0.5"
                  />
                  <div className="flex items-baseline gap-0.5 mt-0.5">
                    <input
                      type="number" min="0" step="1"
                      value={kghV}
                      onChange={e => setCellEdit(p => ({...p, [kghK]: e.target.value}))}
                      onFocus={() => setCellEdit(p => kghK in p ? p : {...p, [kghK]: entry.avgKgH.toFixed(0)})}
                      onBlur={() => commitCell(m, shift, 'kgh', cellEdit[kghK] ?? '', entry)}
                      onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                      className={cn('bg-transparent focus:outline-none font-black tabular-nums leading-none cursor-text hover:bg-black/[0.03] focus:bg-black/[0.04] rounded px-0.5 -mx-0.5 w-full', isAM ? 'text-amber-600' : 'text-indigo-600', 'text-[13px]')}
                    />
                    <span className="text-[7px] text-slate-300 shrink-0">kg/H</span>
                    {isWinner && <span className={cn('text-[7px] font-black shrink-0', isAM ? 'text-amber-400' : 'text-indigo-400')}>↑</span>}
                  </div>
                </div>
              );
            };

            const renderComparison = () => {
              if (hasMultiplePeriods) {
                const allZero = trendData.every(d => d.am === 0 && d.pm === 0);
                if (allZero) return <span className="text-[7px] text-slate-300 text-center px-1">—</span>;
                return (
                  <ResponsiveContainer width="100%" height={46}>
                    <LineChart data={trendData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                      <Line type="monotone" dataKey="am" stroke="#f59e0b" dot={trendData.length <= 4} strokeWidth={1.5} isAnimationActive={false}/>
                      <Line type="monotone" dataKey="pm" stroke="#6366f1" dot={trendData.length <= 4} strokeWidth={1.5} isAnimationActive={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                );
              }
              if (!maxVal) return <span className="text-[7px] text-slate-300 text-center px-1">—</span>;
              const delta = am && pm ? Math.abs(am.avgKgH - pm.avgKgH) : null;
              return (
                <div className="flex flex-col gap-[3px] px-2 py-[9px] w-full">
                  <div className="flex items-center gap-1">
                    <div className="w-1 h-1 rounded-full bg-amber-400 shrink-0"/>
                    <div className="flex-1 h-[5px] bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${am ? (am.avgKgH / maxVal) * 100 : 0}%` }}/>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-1 h-1 rounded-full bg-indigo-400 shrink-0"/>
                    <div className="flex-1 h-[5px] bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pm ? (pm.avgKgH / maxVal) * 100 : 0}%` }}/>
                    </div>
                  </div>
                  {winner && delta !== null && (
                    <span className={cn('text-[6px] font-black text-center tabular-nums', winner === 'AM' ? 'text-amber-500' : 'text-indigo-500')}>
                      {winner === 'AM' ? '早' : '晚'}+{delta.toFixed(0)}
                    </span>
                  )}
                </div>
              );
            };

            return (
              <div key={m} className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] items-stretch hover:bg-slate-50/60 transition-colors">
                {/* Machine code — vertical */}
                <div className="flex items-center justify-center border-r border-slate-100 py-1">
                  <span className="text-[7px] font-black text-slate-400 tracking-widest uppercase leading-none"
                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{m}</span>
                </div>
                {/* AM */}
                <div className="border-r border-slate-100 min-w-0">{renderCell(am, 'AM')}</div>
                {/* PM */}
                <div className="border-r border-slate-100 min-w-0">{renderCell(pm, 'PM')}</div>
                {/* Comparison */}
                <div className="flex items-center justify-center">{renderComparison()}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Efficiency Data Button — floating bottom-right ── */}
      <div className="absolute bottom-2 right-2 z-20">
        <EfficiencyDataSection biWeeklyData={biWeeklyData} onBiWeeklyChange={onBiWeeklyChange} upward/>
      </div>
    </div>
  );
};

// ---- Efficiency Data Section (collapsible — PDF upload + data table + source of truth) ----
interface EfficiencyDataSectionProps {
  biWeeklyData: BiWeeklyPeriod[];
  onBiWeeklyChange: (d: BiWeeklyPeriod[]) => void;
  upward?: boolean;
}
const EfficiencyDataSection: React.FC<EfficiencyDataSectionProps> = ({ biWeeklyData: data, onBiWeeklyChange, upward }) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'table' | 'upload'>('upload');
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);

  const amInputRef = useRef<HTMLInputElement>(null);
  const pmInputRef = useRef<HTMLInputElement>(null);
  const [amFile, setAmFile] = useState<File | null>(null);
  const [pmFile, setPmFile] = useState<File | null>(null);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('bw_api_key') || '');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
  const [pageLog, setPageLog] = useState<Array<{ label: string; count: number; error?: string }>>([]);
  const [pendingEntries, setPendingEntries] = useState<BiWeeklyOpEntry[] | null>(null);
  const [pendingPeriod, setPendingPeriod] = useState<{ start: string; end: string } | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const apiKeySaved = !!localStorage.getItem('bw_api_key');

  const activePeriod = selectedPeriodId ? data.find(p => p.id === selectedPeriodId) : data[data.length - 1];

  const handleJsonImport = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      const ps: string = parsed.periodStart ?? new Date().toISOString().slice(0, 10);
      const pe: string = parsed.periodEnd   ?? new Date().toISOString().slice(0, 10);
      const entries: BiWeeklyOpEntry[] = (Array.isArray(parsed.entries) ? parsed.entries : []).map((e: any) => ({
        operator:     String(e.operator     ?? ''),
        machineCode:  String(e.machineCode  ?? ''),
        machineName:  String(e.machineName  ?? e.machineCode ?? ''),
        shift:        (e.shift === 'PM' ? 'PM' : 'AM') as 'AM' | 'PM',
        avgKgH:       Number(e.avgKgH)      || 0,
        peakKgH:      Number(e.peakKgH)     || Number(e.avgKgH) || 0,
        shiftsWorked: Number(e.shiftsWorked) || 0,
      })).filter((e: BiWeeklyOpEntry) => e.operator && e.machineCode);
      if (entries.length === 0) { setExtractError('JSON 中没有找到有效 entries'); return; }
      const startD = new Date(ps); const endD = new Date(pe);
      const label = `${startD.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}–${endD.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })} ${startD.getFullYear()}`;
      onBiWeeklyChange([...data, { id: Date.now().toString(), periodStart: ps, periodEnd: pe, uploadDate: new Date().toISOString().slice(0, 10), label, entries }]);
      setJsonInput(''); setExtractError(null); setTab('table');
    } catch (e: any) { setExtractError(`JSON 解析失败：${e.message}`); }
  };

  const renderPage = async (pdfDoc: any, pageNum: number): Promise<string> => {
    const page = await pdfDoc.getPage(pageNum);
    const vp = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
    return canvas.toDataURL('image/jpeg', 0.82);
  };

  const extractPage = async (imgBase64: string, key: string, shift: 'AM' | 'PM'): Promise<(BiWeeklyOpEntry & { periodStart?: string; periodEnd?: string })[]> => {
    const MACHINES = 'Syntax Line 28, Syntax Line 32, Format 16 HS, Format 16 HS-2, Mini Syntax 16 HS, RoboMaster 60 EVO, Plant 22, GJW150B';
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: 'claude-opus-4-5', max_tokens: 1200,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imgBase64.split(',')[1] } },
          { type: 'text', text:
`This is an individual worker payslip. Extract ALL workers — both machine operators AND loaders. Return ONLY raw JSON, no markdown.

There are two types of workers:

TYPE A — Machine Operator:
Works on one of: ${MACHINES}
Has a production table with kg/H values (typically 300–4000 kg/H).
Extract one entry per machine worked on.
Use machine name exactly as written on page.

TYPE B — Loader (装载员):
Has a "LOADING PERFORMANCE" / "负载装载性能" section showing average loading rate in t/H (e.g. "11.9 t/H").
Use machine = "Loader", avgKgH = the t/H value × 1000 (e.g. 11.9 t/H → 11900), peakKgH = same as avgKgH, shiftsWorked = number of shifts shown.

For ALL workers return:
{"entries":[{"operator":"Full Name","machine":"machine name or Loader","avgKgH":number,"peakKgH":number,"shiftsWorked":number,"periodStart":"YYYY-MM-DD","periodEnd":"YYYY-MM-DD"}]}

Rules:
- operator: full name at top of page
- periodStart/periodEnd: date range from page header (e.g. "2026-4-30 ~ 2026-5-13" → "2026-04-30", "2026-05-13")
- For operators with 2 machines, return 2 entries
- If nothing extractable: {"entries":[]}`
          }
        ]}]
      })
    });
    if (!resp.ok) throw new Error(`API ${resp.status}: ${await resp.text()}`);
    const json = await resp.json();
    const raw = (json.content?.[0]?.text ?? '').trim().replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
    const obj = JSON.parse(raw);
    if (!Array.isArray(obj?.entries)) return [];
    return obj.entries
      .filter((e: any) => e?.operator && e?.machine && Number(e?.avgKgH) > 0)
      .map((e: any) => ({
        operator: String(e.operator),
        machineCode: String(e.machine).toLowerCase() === 'loader' ? 'Loader' : resolveMachineCode(String(e.machine)),
        machineName: String(e.machine), shift,
        avgKgH: Number(e.avgKgH) || 0, peakKgH: Number(e.peakKgH) || Number(e.avgKgH) || 0,
        shiftsWorked: Number(e.shiftsWorked) || 0,
        periodStart: e.periodStart || undefined, periodEnd: e.periodEnd || undefined,
      }));
  };

  const loadPdf = async (file: File) => {
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
    if (!GlobalWorkerOptions.workerSrc) GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
    return getDocument({ data: await file.arrayBuffer() }).promise;
  };

  const handleExtract = async () => {
    if (!apiKey.trim()) { setExtractError('请输入 Anthropic API Key'); return; }
    if (!amFile && !pmFile) { setExtractError('请上传至少一个 PDF 文件'); return; }
    setExtractError(null); setExtracting(true); setPendingEntries(null); setPendingPeriod(null); setPageLog([]);
    localStorage.setItem('bw_api_key', apiKey);

    const results: (BiWeeklyOpEntry & { periodStart?: string; periodEnd?: string })[] = [];
    const log: Array<{ label: string; count: number; error?: string }> = [];
    const files = [{ file: amFile, shift: 'AM' as const }, { file: pmFile, shift: 'PM' as const }].filter(f => f.file);
    const pdfs: { pdf: any; shift: 'AM' | 'PM' }[] = [];
    let total = 0;

    for (const { file, shift } of files) {
      try { const pdf = await loadPdf(file!); pdfs.push({ pdf, shift }); total += pdf.numPages; }
      catch (e: any) { setExtractError(`PDF 加载失败：${e.message}`); setExtracting(false); return; }
    }
    setProgress({ current: 0, total, label: '加载中...' });

    let current = 0;
    for (const { pdf, shift } of pdfs) {
      for (let p = 1; p <= pdf.numPages; p++) {
        current++;
        const lbl = `${shift === 'AM' ? '早班' : '下午班'} 第${p}页`;
        setProgress({ current, total, label: lbl });
        try {
          const img = await renderPage(pdf, p);
          const entries = await extractPage(img, apiKey.trim(), shift);
          log.push({ label: lbl, count: entries.length });
          results.push(...entries);
        } catch (e: any) {
          log.push({ label: lbl, count: 0, error: e.message.slice(0, 80) });
        }
        setPageLog([...log]);
      }
    }

    const withDates = results.filter(r => r.periodStart && r.periodEnd);
    if (withDates[0]?.periodStart && withDates[0]?.periodEnd)
      setPendingPeriod({ start: withDates[0].periodStart!, end: withDates[0].periodEnd! });

    setExtracting(false);
    setPendingEntries(results.map(({ periodStart: _s, periodEnd: _e, ...rest }) => rest));
  };

  const handleSavePeriod = () => {
    if (!pendingEntries || pendingEntries.length === 0) return;
    const ps = pendingPeriod?.start ?? new Date().toISOString().slice(0, 10);
    const pe = pendingPeriod?.end   ?? new Date().toISOString().slice(0, 10);
    const startD = new Date(ps); const endD = new Date(pe);
    const label = `${startD.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}–${endD.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })} ${startD.getFullYear()}`;
    onBiWeeklyChange([...data, { id: Date.now().toString(), periodStart: ps, periodEnd: pe, uploadDate: new Date().toISOString().slice(0, 10), label, entries: pendingEntries }]);
    setPendingEntries(null); setPendingPeriod(null); setAmFile(null); setPmFile(null); setPageLog([]);
    setTab('table');
  };

  const handleDeletePeriod = (id: string) => {
    onBiWeeklyChange(data.filter(p => p.id !== id));
    if (selectedPeriodId === id) setSelectedPeriodId(null);
  };

  const pillBtn = (
    <button onClick={() => setOpen(o => !o)}
      className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[9px] font-black transition-all shadow-sm',
        open ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300 hover:text-amber-600')}>
      <BarChart2 size={9} className={open ? 'text-amber-500' : 'text-slate-400'}/>
      双周效率数据
      {data.length > 0
        ? <span className={cn('px-1.5 py-0.5 rounded-full text-[7px] font-black', open ? 'bg-amber-200/60 text-amber-700' : 'bg-amber-100 text-amber-600')}>
            {data.reduce((s, p) => s + p.entries.length, 0)} 条
          </span>
        : null}
      <ChevronDown size={8} className={cn('transition-transform duration-200', open && (upward ? '' : 'rotate-180'))}/>
    </button>
  );

  const expandedPanel = (
    <div className={cn('rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden',
      upward ? 'absolute bottom-full right-0 mb-2 w-[480px] max-h-[70vh] overflow-y-auto z-30' : 'mb-0.5')}>
    <div className="border-t border-slate-100">
          {/* ── Tab bar + period picker ── */}
          <div className="flex items-center gap-0 border-b border-slate-100 px-3">
            {(['table', 'upload'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('px-3 py-2 text-[10px] font-black border-b-2 -mb-px transition-all mr-1',
                  tab === t ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-400 hover:text-slate-600')}>
                {t === 'table' ? '数据表格' : '上传 PDF'}
              </button>
            ))}
            {data.length > 0 && (
              <div className="ml-auto flex items-center gap-1 py-1.5">
                {data.map(p => (
                  <button key={p.id} onClick={() => setSelectedPeriodId(p.id === activePeriod?.id ? null : p.id)}
                    className={cn('px-2 py-0.5 rounded-full text-[8px] font-black border transition-all',
                      p.id === activePeriod?.id ? 'bg-slate-100 text-slate-700 border-slate-300' : 'text-slate-400 border-slate-200 hover:border-slate-300')}>
                    {p.label}
                  </button>
                ))}
                {activePeriod && (
                  <button onClick={() => handleDeletePeriod(activePeriod.id)} className="ml-1 text-red-400/50 hover:text-red-500 transition-colors">
                    <Trash2 size={10}/>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Data Table tab ── */}
          {tab === 'table' && (
            <div className="overflow-auto max-h-72">
              {!activePeriod || activePeriod.entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Upload size={22} className="text-slate-200"/>
                  <p className="text-slate-400 text-xs font-bold text-center">暂无数据<br/>请切换至「上传 PDF」提取</p>
                  <button onClick={() => setTab('upload')} className="mt-1 px-3 py-1.5 bg-amber-50 text-amber-600 border border-amber-300 rounded-full text-[10px] font-black hover:bg-amber-100 transition-all">去上传</button>
                </div>
              ) : (
                <table className="w-full text-[11px] border-collapse">
                  <thead className="sticky top-0 bg-white border-b border-slate-200 z-10">
                    <tr>
                      {['班次','姓名','机器','平均 kg/H','峰值 kg/H','班次数','奖金'].map((h, i) => (
                        <th key={h} className={cn('px-3 py-2 text-[9px] font-black text-slate-500 whitespace-nowrap', i >= 3 ? 'text-right' : 'text-left')}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...activePeriod.entries]
                      .sort((a, b) => a.shift === b.shift ? a.machineCode.localeCompare(b.machineCode) : a.shift === 'AM' ? -1 : 1)
                      .map((e, i) => (
                        <tr key={i} className={cn('border-b border-slate-100', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40')}>
                          <td className="px-3 py-1.5">
                            <span className={cn('text-[9px] font-black px-1.5 py-0.5 rounded-full border',
                              e.shift === 'AM' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-indigo-50 text-indigo-600 border-indigo-200')}>
                              {e.shift === 'AM' ? '早班' : '下午班'}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 font-semibold text-slate-800 whitespace-nowrap">{e.operator}</td>
                          <td className="px-3 py-1.5 font-black text-slate-600 tracking-widest text-[9px] uppercase">{e.machineCode || '—'}</td>
                          <td className="px-3 py-1.5 text-right font-black text-slate-800 tabular-nums">{e.avgKgH > 0 ? e.avgKgH.toFixed(2) : '—'}</td>
                          <td className="px-3 py-1.5 text-right text-slate-500 tabular-nums">{e.peakKgH > 0 ? e.peakKgH.toFixed(2) : '—'}</td>
                          <td className="px-3 py-1.5 text-right text-slate-400 tabular-nums">{e.shiftsWorked || '—'}</td>
                          <td className="px-3 py-1.5 text-right font-black tabular-nums text-emerald-600">{e.bonus ? `$${e.bonus}` : '—'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Upload tab ── */}
          {tab === 'upload' && (
            <div className="p-4 space-y-3">
              {/* File pickers */}
              <div className="grid grid-cols-2 gap-2">
                {[{ label: '早班 PDF (AM)', file: amFile, setFile: setAmFile, ref: amInputRef },
                  { label: '下午班 PDF (PM)', file: pmFile, setFile: setPmFile, ref: pmInputRef }].map(({ label, file, setFile, ref }) => (
                  <div key={label}>
                    <input ref={ref} type="file" accept=".pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)}/>
                    <button onClick={() => ref.current?.click()}
                      className={cn('w-full flex flex-col items-center gap-1.5 rounded-xl border border-dashed py-4 transition-all',
                        file ? 'border-amber-300 bg-amber-50' : 'border-slate-200 hover:border-slate-300 bg-slate-50')}>
                      <Upload size={14} className={file ? 'text-amber-500' : 'text-slate-300'}/>
                      <span className={cn('text-[9px] font-black', file ? 'text-amber-600' : 'text-slate-400')}>{label}</span>
                      {file && <span className="text-[8px] text-amber-500 max-w-[130px] truncate">{file.name}</span>}
                    </button>
                  </div>
                ))}
              </div>

              {/* API Key */}
              <div className="flex items-center gap-2 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2">
                <Lock size={9} className="text-slate-400 shrink-0"/>
                <input type={apiKeyVisible ? 'text' : 'password'} placeholder="sk-ant-api... (Anthropic API Key)"
                  value={apiKey} onChange={e => setApiKey(e.target.value)}
                  className="flex-1 text-[10px] text-slate-600 bg-transparent focus:outline-none placeholder-slate-300 font-mono min-w-0"/>
                <button onClick={() => setApiKeyVisible(v => !v)} className="text-slate-400 hover:text-slate-600 shrink-0">
                  {apiKeyVisible ? <X size={9}/> : <span className="text-[8px] font-bold">显示</span>}
                </button>
                {apiKeySaved && !apiKeyVisible && <span className="text-[7px] text-emerald-500 font-black shrink-0">已保存</span>}
              </div>

              <div className="flex items-center gap-2 text-[8px] text-slate-400 px-1">
                <CalendarDays size={9} className="text-amber-400"/>
                <span>时间段从 PDF 自动识别 · 班次由上传文件决定（AM文件=早班，PM文件=下午班）</span>
              </div>

              {extractError && <div className="text-[9px] text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-bold">{extractError}</div>}

              {!extracting && !pendingEntries && (
                <button onClick={handleExtract} disabled={!apiKey.trim() || (!amFile && !pmFile)}
                  className="w-full py-2.5 bg-amber-50 text-amber-600 border border-amber-300 rounded-xl text-[10px] font-black hover:bg-amber-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                  <BarChart2 size={11}/>开始提取（含 Operator + Loader）
                </button>
              )}

              {/* Progress */}
              {extracting && (
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-amber-600 font-black">正在提取 {progress.current}/{progress.total}页</span>
                    <span className="text-[8px] text-slate-400">{progress.label}</span>
                  </div>
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}/>
                  </div>
                </div>
              )}

              {/* Per-page log — shows exactly what happened each page */}
              {pageLog.length > 0 && (
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 max-h-36 overflow-y-auto">
                  <p className="text-[8px] text-slate-500 font-black mb-1.5 uppercase tracking-widest">逐页提取日志</p>
                  <div className="space-y-0.5">
                    {pageLog.map((l, i) => (
                      <div key={i} className="flex items-center gap-2 text-[8px]">
                        <span className={cn('font-black w-3 text-center shrink-0', l.error ? 'text-red-400' : l.count > 0 ? 'text-emerald-500' : 'text-slate-300')}>
                          {l.error ? '✗' : l.count > 0 ? '✓' : '—'}
                        </span>
                        <span className="text-slate-500 flex-1">{l.label}</span>
                        {l.count > 0 && <span className="text-emerald-600 font-black shrink-0">+{l.count} 条</span>}
                        {l.count === 0 && !l.error && <span className="text-slate-300 shrink-0">Loader/跳过</span>}
                        {l.error && <span className="text-red-400 truncate max-w-[180px] shrink-0" title={l.error}>{l.error}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending entries preview */}
              {pendingEntries && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-700 font-black">提取到 {pendingEntries.length} 条操作员记录</span>
                      {pendingPeriod && <p className="text-[8px] text-amber-600 mt-0.5">📅 {pendingPeriod.start} ~ {pendingPeriod.end}</p>}
                    </div>
                    <button onClick={() => { setPendingEntries(null); setPageLog([]); }} className="text-[9px] text-slate-400 hover:text-slate-600">重新提取</button>
                  </div>
                  <div className="rounded-xl border border-slate-200 overflow-hidden max-h-44 overflow-y-auto">
                    <table className="w-full text-[9px]">
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                        <tr>
                          {['班', '姓名', '机器', 'kg/H'].map((h, i) => (
                            <th key={h} className={cn('px-2 py-1.5 text-slate-500 font-black', i >= 3 ? 'text-right' : 'text-left')}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pendingEntries.map((e, i) => (
                          <tr key={i} className="border-b border-slate-100 last:border-0">
                            <td className="px-2 py-1"><span className={cn('font-black', e.shift === 'AM' ? 'text-amber-500' : 'text-indigo-500')}>{e.shift === 'AM' ? '早' : '晚'}</span></td>
                            <td className="px-2 py-1 text-slate-700 font-medium truncate max-w-[110px]">{e.operator}</td>
                            <td className="px-2 py-1 text-slate-500 uppercase tracking-widest text-[8px]">{e.machineCode}</td>
                            <td className="px-2 py-1 text-right text-amber-600 font-black tabular-nums">{e.avgKgH.toFixed(0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {pendingEntries.length === 0 ? (
                    <div className="text-center text-[9px] text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2 font-bold">提取到 0 条数据，无法保存 · 请检查 PDF 格式或改用 JSON 导入</div>
                  ) : (
                    <button onClick={handleSavePeriod}
                      className="w-full py-2 bg-amber-500 text-white rounded-xl text-[10px] font-black hover:bg-amber-600 transition-all flex items-center justify-center gap-2">
                      <Check size={11} strokeWidth={3}/>确认保存双周记录（{pendingEntries.length} 条）
                    </button>
                  )}
                </div>
              )}

              {/* ── JSON 手动导入 ── */}
              {!pendingEntries && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-slate-200"/>
                    <span className="text-[8px] text-slate-400 font-bold shrink-0">或直接粘贴 JSON 导入</span>
                    <div className="flex-1 h-px bg-slate-200"/>
                  </div>
                  <textarea
                    value={jsonInput}
                    onChange={e => setJsonInput(e.target.value)}
                    placeholder={'{\n  "periodStart": "2026-04-30",\n  "periodEnd": "2026-05-13",\n  "entries": [...]\n}'}
                    className="w-full h-24 text-[9px] font-mono text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-amber-300 resize-none placeholder-slate-300"
                  />
                  <button onClick={handleJsonImport} disabled={!jsonInput.trim()}
                    className="w-full py-2 bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-[10px] font-black hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                    <Check size={10} strokeWidth={3}/>解析并导入 JSON
                  </button>
                </div>
              )}

              {/* History */}
              {data.length > 0 && !pendingEntries && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] text-slate-400 font-black uppercase tracking-widest">历史记录</span>
                    <button onClick={() => onBiWeeklyChange([])} className="text-[8px] text-red-400/60 hover:text-red-500 font-black flex items-center gap-1 transition-colors"><Trash2 size={9}/>全部清空</button>
                  </div>
                  {[...data].reverse().map(p => (
                    <div key={p.id} className={cn('flex items-center justify-between border rounded-lg px-3 py-2', p.entries.length === 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200')}>
                      <div>
                        <p className="text-[9px] text-slate-700 font-black">{p.label}</p>
                        <p className={cn('text-[8px]', p.entries.length === 0 ? 'text-red-400 font-bold' : 'text-slate-400')}>{p.entries.length === 0 ? '⚠ 空记录，建议删除' : `${p.entries.length} 条`} · {p.uploadDate}</p>
                      </div>
                      <button onClick={() => handleDeletePeriod(p.id)} className="text-red-400/60 hover:text-red-500 transition-colors"><Trash2 size={11}/></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        </div>
  );

  if (upward) {
    return (
      <div className="relative">
        {open && expandedPanel}
        {pillBtn}
      </div>
    );
  }

  return (
    <div className="shrink-0">
      <div className="flex items-center gap-2 mb-1.5">
        {pillBtn}
        {data.length > 0 && !open && (
          <span className="text-[8px] text-slate-400">{data[data.length-1]?.label}</span>
        )}
      </div>
      {open && expandedPanel}
    </div>
  );
};

// ---- Bi-Weekly Efficiency Panel (quarterly rankings) ----
interface BiWeeklyEfficiencyPanelProps {
  biWeeklyData: BiWeeklyPeriod[];
  onBiWeeklyChange: (d: BiWeeklyPeriod[]) => void;
}
const BiWeeklyEfficiencyPanel: React.FC<BiWeeklyEfficiencyPanelProps> = ({ biWeeklyData: data, onBiWeeklyChange }) => {
  const [mode, setMode] = useState<'rankings' | 'trends'>('rankings');
  const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null);
  const [podiumEdit, setPodiumEdit] = useState<Record<string, string>>({});

  const saveData = (d: BiWeeklyPeriod[]) => { onBiWeeklyChange(d); };

  // Quarter helpers — Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
  const toQKey = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m] = dateStr.split('-').map(Number);
    return `${y}-Q${Math.ceil(m / 3)}`;
  };
  const qLabel = (qk: string) => qk.replace(/(\d{4})-Q(\d)/, 'Q$2 $1');

  const allQuarters = [...new Set(data.map(p => toQKey(p.periodStart)))].filter((s): s is string => !!s).sort();
  const activeQuarter = selectedQuarter ?? allQuarters[allQuarters.length - 1] ?? null;

  // Merge all entries in the active quarter: best avgKgH per machine+operator+shift
  const quarterEntries: (BiWeeklyOpEntry & { _pid: string })[] = (() => {
    const periods = activeQuarter ? data.filter(p => toQKey(p.periodStart) === activeQuarter) : data.slice(-1);
    const map = new Map<string, BiWeeklyOpEntry & { _pid: string }>();
    for (const p of periods) {
      for (const e of p.entries) {
        const k = `${e.machineCode}:${e.operator}:${e.shift}`;
        const cur = map.get(k);
        if (!cur || e.avgKgH > cur.avgKgH) map.set(k, { ...e, _pid: p.id });
      }
    }
    return [...map.values()];
  })();

  const getTop3Q = (machineCode: string) =>
    quarterEntries.filter(e => e.machineCode === machineCode)
      .sort((a, b) => b.avgKgH - a.avgKgH).slice(0, 3);

  const pKey = (periodId: string, m: string, rank: number, f: string) => `${periodId}:${m}:${rank}:${f}`;

  const commitPodium = (periodId: string, m: string, rank: number, f: 'op' | 'kgh', raw: string, original: BiWeeklyOpEntry) => {
    const updated = data.map(p => p.id !== periodId ? p : {
      ...p,
      entries: p.entries.map(e => {
        if (e.machineCode !== m || e.operator !== original.operator || e.shift !== original.shift) return e;
        if (f === 'op') return { ...e, operator: raw.trim() || e.operator };
        const v = parseFloat(raw); return (isNaN(v) || v <= 0) ? e : { ...e, avgKgH: v };
      }),
    });
    saveData(updated);
    const k = pKey(periodId, m, rank, f);
    setPodiumEdit(p => { const n = {...p}; delete n[k]; return n; });
  };

  // Trends still use per-period data
  const getTop3 = (period: BiWeeklyPeriod, machineCode: string): BiWeeklyOpEntry[] =>
    period.entries.filter(e => e.machineCode === machineCode).sort((a,b) => b.avgKgH - a.avgKgH).slice(0, 3);

  const getTrend = (machineCode: string) =>
    data.map(period => {
      const top = getTop3(period, machineCode);
      return { label: period.label, top1: top[0]?.avgKgH ?? 0, top1Name: top[0]?.operator ?? '', top2: top[1]?.avgKgH ?? 0 };
    });

  const machinesWithData = ML_MACHINES.filter(m => data.some(p => p.entries.some(e => e.machineCode === m)));
  const hasQuarterData = quarterEntries.length > 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <BarChart2 size={13} className="text-amber-500"/>
          <span className="text-sm font-black text-slate-800">季度效率排名</span>
          <span className="text-[9px] text-slate-400 font-medium tracking-widest uppercase">Bi-Weekly · Kg/H · PDF Powered</span>
        </div>
        <div className="flex items-center gap-1.5">
          {(['rankings','trends'] as const).map(v => (
            <button key={v} onClick={() => setMode(v)}
              className={cn('px-2.5 py-1 rounded-full text-[9px] font-black transition-all border',
                mode === v ? 'bg-amber-50 text-amber-600 border-amber-300' : 'text-slate-400 border-slate-200 hover:border-slate-300')}>
              {v === 'rankings' ? '排名' : '趋势'}
            </button>
          ))}
        </div>
      </div>
      <div className="mx-5 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent shrink-0"/>

      {/* Rankings View */}
      {mode === 'rankings' && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Quarter tabs */}
          {allQuarters.length > 0 && (
            <div className="flex gap-1 px-4 pt-3 pb-1 shrink-0 overflow-x-auto">
              {allQuarters.map(qk => (
                <button key={qk} onClick={() => setSelectedQuarter(qk)}
                  className={cn('shrink-0 px-2.5 py-1 rounded-full text-[9px] font-black border transition-all',
                    qk === activeQuarter ? 'bg-amber-50 text-amber-600 border-amber-300' : 'text-slate-400 border-slate-200 hover:border-slate-300')}>
                  {qLabel(qk)}
                </button>
              ))}
            </div>
          )}
          {data.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
              <Upload size={28} className="text-slate-200"/>
              <p className="text-slate-400 text-xs font-bold text-center">暂无效率数据<br/>请在上方「双周效率数据」展开，使用 JSON 导入</p>
            </div>
          ) : !hasQuarterData ? (
            <div className="flex-1 flex items-center justify-center"><p className="text-slate-400 text-xs">此季度暂无记录</p></div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0 px-3 py-2.5 grid grid-cols-2 gap-2 content-start">
              {(machinesWithData.length > 0 ? machinesWithData : ML_MACHINES).map(m => {
                const top3 = getTop3Q(m);
                const hasData = top3.length > 0;
                // Podium order: 2nd (left) · 1st (center) · 3rd (right)
                const podium = [top3[1] ?? null, top3[0] ?? null, top3[2] ?? null];
                const podiumMeta = [
                  { label: '第二名', accent: 'text-sky-500',   bg: 'bg-sky-50/60',   border: 'border-t-2 border-sky-300',  nameCls: 'text-[8px] text-slate-700',  numCls: 'text-sky-600 text-[12px]' },
                  { label: '第一名', accent: 'text-amber-500', bg: 'bg-amber-50/70', border: 'border-t-2 border-amber-400', nameCls: 'text-[10px] text-slate-800', numCls: 'text-amber-600 text-[17px]' },
                  { label: '第三名', accent: 'text-slate-400', bg: 'bg-white',        border: '',                           nameCls: 'text-[8px] text-slate-500',  numCls: 'text-slate-400 text-[12px]' },
                ];
                return (
                  <div key={m} className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm flex flex-row">
                    {/* Machine name — left vertical strip */}
                    <div className="flex items-center justify-center bg-slate-50 border-r border-slate-100 px-1.5 shrink-0">
                      <span className="text-[8px] font-black tracking-[0.18em] uppercase text-slate-500 leading-none"
                        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                        {hasData ? m : <>{m}</>}
                      </span>
                    </div>
                    {/* Podium: left(2nd) · center(1st) · right(3rd) */}
                    <div className="flex-1 grid grid-cols-3 divide-x divide-slate-100">
                      {podium.map((entry, i) => {
                        const meta = podiumMeta[i];
                        const isCenter = i === 1;
                        // actual rank index in top3: podium[0]=top3[1], podium[1]=top3[0], podium[2]=top3[2]
                        const rankIdx = [1, 0, 2][i];
                        const srcPid = entry && '_pid' in entry ? (entry as BiWeeklyOpEntry & {_pid:string})._pid : '';
                        const opK  = srcPid ? pKey(srcPid, m, rankIdx, 'op')  : '';
                        const kghK = srcPid ? pKey(srcPid, m, rankIdx, 'kgh') : '';
                        return entry ? (
                          <div key={i} className={cn('flex flex-col items-center px-1.5 gap-0.5 min-w-0', meta.bg, meta.border, isCenter ? 'py-[8px]' : 'py-[6px] justify-center')}>
                            <span className={cn('text-[7px] font-black tracking-wide leading-none', meta.accent)}>{meta.label}</span>
                            <input
                              value={podiumEdit[opK] ?? entry.operator.split(' ')[0]}
                              onChange={e => setPodiumEdit(p => ({...p, [opK]: e.target.value}))}
                              onFocus={() => setPodiumEdit(p => opK in p ? p : {...p, [opK]: entry.operator.split(' ')[0]})}
                              onBlur={() => srcPid && commitPodium(srcPid, m, rankIdx, 'op', podiumEdit[opK] ?? '', entry)}
                              onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                              className={cn('bg-transparent focus:outline-none font-bold truncate w-full text-center leading-tight mt-0.5 cursor-text hover:bg-black/[0.04] focus:bg-black/[0.05] rounded', meta.nameCls)}
                            />
                            <div className="flex items-baseline gap-0.5 mt-0.5 w-full justify-center">
                              <input
                                type="number" min="0" step="1"
                                value={podiumEdit[kghK] ?? entry.avgKgH.toFixed(0)}
                                onChange={e => setPodiumEdit(p => ({...p, [kghK]: e.target.value}))}
                                onFocus={() => setPodiumEdit(p => kghK in p ? p : {...p, [kghK]: entry.avgKgH.toFixed(0)})}
                                onBlur={() => srcPid && commitPodium(srcPid, m, rankIdx, 'kgh', podiumEdit[kghK] ?? '', entry)}
                                onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                                className={cn('bg-transparent focus:outline-none font-black tabular-nums leading-none cursor-text hover:bg-black/[0.04] focus:bg-black/[0.05] rounded text-center w-12', meta.numCls)}
                              />
                              <span className="text-[6px] text-slate-300 font-bold shrink-0">kg/H</span>
                            </div>
                            <span className={cn('text-[6px] font-bold mt-0.5', entry.shift === 'AM' ? 'text-amber-400/60' : 'text-indigo-400/60')}>{entry.shift}</span>
                          </div>
                        ) : (
                          <div key={i} className={cn('flex flex-col items-center px-1.5 py-[6px] gap-0.5 opacity-20 justify-center', isCenter && 'border-t-2 border-amber-200')}>
                            <span className={cn('text-[7px] font-black tracking-wide', meta.accent)}>{meta.label}</span>
                            <span className="text-[8px] text-slate-300">—</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {data.length > 0 && (
            <div className="shrink-0 px-4 pb-3 flex items-center justify-between">
              <span className="text-[8px] text-slate-300">{data.length} 个双周记录 · {activeQuarter ? qLabel(activeQuarter) : ''}</span>
            </div>
          )}
        </div>
      )}

      {/* Trends View */}
      {mode === 'trends' && (
        <div className="flex-1 overflow-y-auto min-h-0 p-4">
          {data.length < 2 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <p className="text-slate-400 text-xs text-center">需要至少 2 个双周记录才能显示趋势</p>
            </div>
          ) : (
            <div className="space-y-4">
              {machinesWithData.map(m => {
                const trend = getTrend(m);
                if (trend.every(t => !t.top1)) return null;
                const maxVal = Math.max(...trend.map(t => Math.max(t.top1, t.top2)));
                const minVal = Math.min(...trend.filter(t => t.top1 > 0).map(t => t.top1)) * 0.85;
                return (
                  <div key={m} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                    <div className="px-3 py-2 border-b border-slate-100 bg-slate-50"><span className="text-[10px] font-black text-slate-500 tracking-widest uppercase">{m}</span></div>
                    <div className="p-3">
                      <ResponsiveContainer width="100%" height={80}>
                        <BarChart data={trend} barSize={14} barGap={2}>
                          <XAxis dataKey="label" tick={{ fill: 'rgba(100,116,139,0.6)', fontSize: 7 }} axisLine={false} tickLine={false}/>
                          <YAxis domain={[minVal, maxVal]} tick={{ fill: 'rgba(100,116,139,0.4)', fontSize: 7 }} axisLine={false} tickLine={false} width={32}/>
                          <Bar dataKey="top1" fill="rgba(245,158,11,0.7)" radius={[2,2,0,0]}/>
                          <Bar dataKey="top2" fill="rgba(148,163,184,0.4)" radius={[2,2,0,0]}/>
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="mt-1.5 space-y-0.5">
                        {trend.filter(t => t.top1 > 0).slice(-3).map((t, i) => (
                          <div key={i} className="flex items-center gap-2 text-[7px]">
                            <span className="text-slate-400 truncate w-16">{t.label}</span>
                            <span className="text-amber-600 font-black truncate flex-1">{t.top1Name}</span>
                            <span className="text-amber-600 font-black tabular-nums">{t.top1.toFixed(0)} kg/H</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="h-1 shrink-0"/>
    </div>
  );
};

// ---- Production Records Panel ----
interface ProdRecordsPanelProps {
  records: ProdRecordsMap;
  onRecordsChange: (r: ProdRecordsMap) => void;
  opRows: OpRow[];
  biWeeklyData: BiWeeklyPeriod[];
  onBiWeeklyChange: (d: BiWeeklyPeriod[]) => void;
}
const QUARTER_MEDALS = ['🥇','🥈','🥉'];
const MEDAL_COLORS = [
  { bg:'from-amber-900/60 to-yellow-900/40', border:'border-amber-600/40', text:'text-amber-300', dot:'bg-amber-400' },
  { bg:'from-slate-700/60 to-slate-800/40',  border:'border-slate-500/40', text:'text-slate-200', dot:'bg-slate-400' },
  { bg:'from-orange-900/60 to-amber-900/40', border:'border-orange-600/40',text:'text-orange-300',dot:'bg-orange-400' },
];

const ProductionRecordsPanel: React.FC<ProdRecordsPanelProps> = ({ records, onRecordsChange, opRows, biWeeklyData, onBiWeeklyChange }) => {
  const [adding, setAdding]     = useState(false);
  const [inputs, setInputs]     = useState<Record<string, { kgh: string; op: string }>>({});
  const [inputDate, setInputDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [flash, setFlash]       = useState<string | null>(null);
  const [rateEdits, setRateEdits] = useState<Record<string, { rate: string; op: string; date: string }>>({});

  const now   = new Date();
  const qKey  = getQuarterKey(now);
  const qLabel = `Q${qKey.split('-Q')[1]} ${qKey.split('-Q')[0]}`;

  const save = (r: ProdRecordsMap) => { onRecordsChange(r); idbSet('prodRecords', r); };

  const saveRate = (machine: string, rateStr: string, op: string, date: string) => {
    // Save as long as at least one field is filled in
    const val = parseFloat(rateStr);
    const hasVal = !isNaN(val) && val > 0;
    if (!op.trim() && !hasVal) return;
    const cur = records[machine] ?? { allTime: null, allTimeRate: null, quarters: {} };
    // Keep existing value if new one is empty
    const existingVal = cur.allTimeRate?.value ?? 0;
    save({ ...records, [machine]: { ...cur, allTimeRate: { value: hasVal ? val : existingVal, date, operator: op } } });
  };

  const submitEntry = () => {
    const next: ProdRecordsMap = { ...records };
    const newRecords: string[] = [];
    ML_MACHINES.forEach(m => {
      const inp = inputs[m];
      const val = parseFloat(inp?.kgh || '');
      if (isNaN(val) || val <= 0) return;
      const cur  = next[m] ?? { allTime: null, allTimeRate: null, quarters: {} };
      const qCur = cur.quarters?.[qKey] ?? null;
      if (qCur === null || val > qCur.value) newRecords.push(m);
      next[m] = {
        ...cur,
        quarters: {
          ...(cur.quarters ?? {}),
          [qKey]: (qCur === null || val > qCur.value)
            ? { value: val, date: inputDate, operator: inp?.op || '' }
            : qCur,
        },
      };
    });
    save(next);
    if (newRecords.length > 0) {
      setFlash(newRecords.join(', ') + ' 新纪录！');
      setTimeout(() => setFlash(null), 4000);
    }
    setAdding(false);
    setInputs({});
  };

  return (
    <div className="flex flex-col gap-3 h-full">

      {/* ── TOP: All-time best — individual machine cards ── */}
      <div className="shrink-0">
        {/* Section header */}
        <div className="flex items-center gap-2 px-0.5 mb-2">
          <Trophy size={13} className="text-amber-500"/>
          <span className="text-sm font-black text-slate-800">最佳纪录保持者</span>
          <span className="text-[8px] text-slate-400 tracking-widest uppercase font-medium">All-Time Record · Kg/H</span>
          <span className="text-[7px] text-slate-300 italic ml-auto">click to edit</span>
        </div>

        {/* 8 individual cards */}
        <div className="flex gap-2">
          {[...ML_MACHINES].sort((a, b) => {
            const da = records[a]?.allTimeRate?.date ?? '';
            const db = records[b]?.allTimeRate?.date ?? '';
            if (!da && !db) return ML_MACHINES.indexOf(a) - ML_MACHINES.indexOf(b);
            if (!da) return 1;
            if (!db) return -1;
            return db.localeCompare(da);
          }).map(m => {
            const saved   = records[m]?.allTimeRate ?? null;
            const editing = rateEdits[m];
            const dRate = editing?.rate ?? (saved ? String(saved.value) : '');
            const dOp   = editing?.op   ?? (saved?.operator ?? '');
            const dDate = editing?.date ?? (saved?.date ?? new Date().toISOString().slice(0,10));

            const onFocus = () => {
              if (!editing) setRateEdits(p => ({ ...p, [m]: { rate: dRate, op: dOp, date: dDate } }));
            };
            const onBlur = () => {
              if (editing) {
                saveRate(m, editing.rate, editing.op, editing.date);
                setRateEdits(p => { const n = {...p}; delete n[m]; return n; });
              }
            };

            const cardStyle: React.CSSProperties = saved ? {
              background: 'linear-gradient(160deg, #3d2a00 0%, #261a00 55%, #3d2a00 100%)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 18px rgba(212,160,20,0.18), inset 0 1px 0 rgba(255,220,60,0.35)',
              borderColor: '#9a7010',
            } : {
              borderColor: '#e2e8f0',
            };

            const goldNumStyle: React.CSSProperties = {
              background: 'linear-gradient(180deg, #ffe066 0%, #ffd700 45%, #c8960c 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            };

            return (
              <div key={m}
                className={cn(
                  'relative flex-1 flex flex-col rounded-2xl overflow-hidden border transition-all group',
                  saved ? '' : 'bg-slate-50/80 hover:border-amber-200'
                )}
                style={cardStyle}
              >
                {/* Gold top bar */}
                {saved
                  ? <div style={{ background: 'linear-gradient(90deg, transparent, #ffd700 40%, #ffd700 60%, transparent)', height: '2px' }} className="shrink-0"/>
                  : <div className="h-[2px] bg-slate-100 shrink-0"/>}

                {/* Spotlight — soft light from top center */}
                {saved && <div className="absolute inset-0 pointer-events-none" style={{
                  background: 'radial-gradient(ellipse 75% 55% at 50% -5%, rgba(255,220,80,0.22) 0%, rgba(255,180,30,0.06) 50%, transparent 75%)',
                }}/>}
                {/* Subtle bottom rim light */}
                {saved && <div className="absolute inset-0 pointer-events-none" style={{
                  background: 'radial-gradient(ellipse 60% 30% at 50% 108%, rgba(255,200,40,0.10) 0%, transparent 70%)',
                }}/>}

                <div className="relative flex flex-col items-center px-2.5 py-3 flex-1">
                  {/* Machine code */}
                  <span className="text-[9px] font-black tracking-[0.22em] uppercase leading-none mb-2"
                    style={{ color: saved ? '#c9950c' : '#cbd5e1' }}>{m}</span>

                  {/* Operator name */}
                  <input
                    value={dOp}
                    placeholder="—"
                    onFocus={onFocus}
                    onChange={e => setRateEdits(p => ({ ...p, [m]: { ...p[m], op: e.target.value } }))}
                    onBlur={onBlur}
                    className="bg-transparent focus:outline-none w-full font-black leading-tight truncate text-center text-[14px]"
                    style={{ color: saved ? '#fff8e8' : '#94a3b8' }}
                  />

                  {/* Kg/H — large gold gradient number */}
                  <div className="flex items-baseline justify-center gap-0.5 mt-1.5 mb-0.5">
                    {saved ? (
                      <input
                        type="number" min="0" step="1"
                        value={dRate}
                        placeholder="—"
                        onFocus={onFocus}
                        onChange={e => setRateEdits(p => ({ ...p, [m]: { ...p[m], rate: e.target.value } }))}
                        onBlur={onBlur}
                        className="tabular-nums bg-transparent focus:outline-none font-black text-center text-[28px] w-20"
                        style={goldNumStyle}
                      />
                    ) : (
                      <input
                        type="number" min="0" step="1"
                        value={dRate}
                        placeholder="—"
                        onFocus={onFocus}
                        onChange={e => setRateEdits(p => ({ ...p, [m]: { ...p[m], rate: e.target.value } }))}
                        onBlur={onBlur}
                        className="tabular-nums bg-transparent focus:outline-none font-black text-center text-[15px] w-8 text-slate-300"
                      />
                    )}
                    {saved && <span className="text-[8px] font-bold self-end mb-1.5" style={{ color: '#c9950c' }}>kg/H</span>}
                  </div>

                  {/* Date */}
                  <div className="flex items-center justify-center gap-0.5 mt-auto pt-1.5 w-full"
                    style={{ borderTop: saved ? '1px solid rgba(201,149,12,0.2)' : '1px solid #f1f5f9' }}>
                    {saved && <span className="text-[6px] font-black tracking-widest shrink-0" style={{ color: 'rgba(201,149,12,0.5)' }}>SINCE</span>}
                    <input type="date" value={dDate}
                      onFocus={onFocus}
                      onChange={e => setRateEdits(p => ({ ...p, [m]: { ...p[m], date: e.target.value } }))}
                      onBlur={onBlur}
                      className="bg-transparent focus:outline-none tabular-nums text-center w-full text-[6px] font-medium"
                      style={{ color: saved ? 'rgba(201,149,12,0.45)' : '#cbd5e1' }}
                    />
                  </div>
                </div>

                {/* Clear button on hover */}
                {saved && (
                  <button onClick={() => {
                    const cur = records[m] ?? { allTime: null, allTimeRate: null, quarters: {} };
                    save({ ...records, [m]: { ...cur, allTimeRate: null } });
                    setRateEdits(p => { const n = {...p}; delete n[m]; return n; });
                  }} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-colors hover:text-red-500"
                    style={{ color: 'rgba(201,149,12,0.3)' }}>
                    <X size={9}/>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Efficiency Data Section (collapsible — upload + table) ── */}
      {/* ── Quarterly Rankings + Last 2 Weeks (side by side) ── */}
      <div className="flex-1 min-h-0 flex gap-3">
        <BiWeeklyEfficiencyPanel biWeeklyData={biWeeklyData} onBiWeeklyChange={onBiWeeklyChange}/>
        <Last2WeeksPanel biWeeklyData={biWeeklyData} onBiWeeklyChange={onBiWeeklyChange}/>
      </div>

    </div>
  );
};

const ProductivitySection: React.FC<SectionProps> = ({ color }) => {
  const [shift, setShift] = useState<'morning' | 'afternoon'>(() => {
    const h = new Date().getHours();
    // After 22:00: afternoon shift ended, switch to morning for next-day planning
    if (h >= 6 && h < 14) return 'morning';
    if (h >= 14 && h < 22) return 'afternoon';
    return 'morning';
  });
  const [mlRows, setMlRows] = useState<MLRow[]>(() =>
    ML_MACHINES.map(m => ({ machine: m, pl: 0, open: 0, day2_pl: 0, day2_open: 0, shiftProd: 0 }))
  );
  const [opRows, setOpRows] = useState<OpRow[]>(DEFAULT_OP_ROWS);
  const [prodRecords, setProdRecords] = useState<ProdRecordsMap>({});
  const [mlCollapsed, setMlCollapsed] = useState(false);
  // Shared bi-weekly efficiency data — used by rankings, last-2-weeks, and capacity panels
  const [biWeeklyData, setBiWeeklyData] = useState<BiWeeklyPeriod[]>([]);

  useEffect(() => {
    idbGet<MLRow[]>('machineLoad').then(d => { if (d?.length) setMlRows(d); });
    idbGet<OpRow[]>('operatorCapacity').then(d => { if (d?.length) setOpRows(d); });
    idbGet<ProdRecordsMap>('prodRecords').then(d => { if (d) setProdRecords(d); });
    idbGet<BiWeeklyPeriod[]>(BW_IDB_KEY).then(d => { if (d?.length) setBiWeeklyData(d); });
  }, []);

  const handleBiWeeklyChange = (d: BiWeeklyPeriod[]) => {
    setBiWeeklyData(d);
    idbSet(BW_IDB_KEY, d);
  };

  return (
  <SectionWrapper title="Productivity - Efficient Output" icon={TrendingUp} color={color}>
    {/* Scrollable body — records + machine load */}
    <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-6 pr-1">

      {/* Production Records — taller to accommodate side-by-side quarterly + last-2-weeks */}
      <div className="h-[700px] shrink-0">
        <ProductionRecordsPanel records={prodRecords} onRecordsChange={setProdRecords} opRows={opRows}
          biWeeklyData={biWeeklyData} onBiWeeklyChange={handleBiWeeklyChange}/>
      </div>

      {/* Machine Load — collapsible, at very bottom */}
      <div className="shrink-0 border border-slate-200 rounded-2xl overflow-hidden">
        <button
          onClick={() => setMlCollapsed(v => !v)}
          className="w-full flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 transition-colors text-left">
          <BarChart2 size={13} className="text-slate-400 shrink-0"/>
          <span className="text-xs font-black text-white flex-1 tracking-wide">机器产量负荷</span>
          <span className="text-[9px] text-slate-400 font-bold mr-2">Machine Load Board</span>
          {mlCollapsed ? <ChevronDown size={14} className="text-slate-400"/> : <ChevronUp size={14} className="text-slate-400"/>}
        </button>
        <AnimatePresence initial={false}>
          {!mlCollapsed && (
            <motion.div
              key="ml-panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden">
              <MachineLoadPanel shift={shift} onShiftChange={setShift} rows={mlRows} onRowsChange={r => { setMlRows(r); idbSet('machineLoad', r); }} opRows={opRows} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  </SectionWrapper>
  );
};

// ─── Loader KPI Types ─────────────────────────────────────────────────────
interface LKRow {
  date: string;
  shift: 'AM' | 'PM' | 'OTHER';
  weight: number;
  numL: number;
  valid: boolean;
  loaders: string[];
  minutes: number | null;
  truck: string;
  startR: number | null;
  finishR: number | null;
}
interface LKPeriod {
  id: string;
  dateFrom: string;
  dateTo: string;
  rows: LKRow[];
  uploadedAt: string;
}
interface BestShift {
  shift: 'AM' | 'PM';
  names: string[];
  totalWeightT: number;
  effTph: number;
  avgMinutes: number;
  truckCount: number;
  date: string;       // period label e.g. "2026-04-28 ~ 2026-05-11"
  periodLabel: string;
}
interface BestTonnage {
  shift: 'AM' | 'PM';
  date: string;          // single date YYYY-MM-DD
  totalWeightT: number;
  truckCount: number;
  names: string[];
  periodLabel: string;
}

const DeliverySection: React.FC<SectionProps> = ({ color }) => {
  const [lkPeriods, setLkPeriods] = useState<LKPeriod[]>([]);
  const [bestAM, setBestAM] = useState<BestShift | null>(null);
  const [bestPM, setBestPM] = useState<BestShift | null>(null);
  const [bestTonnage, setBestTonnage] = useState<BestTonnage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [bonusToolOpen,     setBonusToolOpen]     = useState(false);
  const [bonusToolUnlocked, setBonusToolUnlocked] = useState(false);
  const [bonusPwInput,      setBonusPwInput]      = useState('');
  const [bonusPwError,      setBonusPwError]      = useState(false);

  useEffect(() => {
    idbGet<LKPeriod[]>('loaderKpiPeriods').then(d => { if (d?.length) setLkPeriods(d); });
    idbGet<BestShift>('loaderBestAM').then(d => { if (d) setBestAM(d); });
    idbGet<BestShift>('loaderBestPM').then(d => { if (d) setBestPM(d); });
    idbGet<BestTonnage>('loaderBestTonnage').then(d => { if (d) setBestTonnage(d); });
  }, []);

  const KNOWN_LOADERS = [
    'Geo Casper Chong','Shengchih Hung','Tuan Tran','Xingjiang Xu','Yubiao Wu',
    'ZhiGang Deng','Tingyi Xie','Leanschel Joseph David','Leanschel Joseph',
  ];

  const parseLoaderList = (raw: string): string[] => {
    if (!raw || raw === 'nan') return [];
    const found: string[] = [];
    let rem = raw;
    for (const n of KNOWN_LOADERS) {
      if (rem.includes(n)) { found.push(n); rem = rem.split(n).join(' '); }
    }
    for (const p of rem.replace(/\n/g, '  ').split('  ')) {
      const t = p.trim();
      if (t && !found.includes(t)) found.push(t);
    }
    return found;
  };

  const excelSerialToDate = (v: number | string): string | null => {
    let d: Date;
    if (typeof v === 'number') {
      d = new Date((v - 25569) * 86400 * 1000);
    } else {
      d = new Date(v as string);
    }
    if (!d || isNaN(d.getTime())) return null;
    const yy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };

  const getShiftFromSerial = (v: number): 'AM' | 'PM' | 'OTHER' => {
    const mins = Math.round(((v % 1) + 1) % 1 * 1440);
    if (mins >= 360 && mins < 840) return 'AM';
    if (mins >= 840 && mins < 1320) return 'PM';
    return 'OTHER';
  };

  const colLetterToIndex = (col: string): number => {
    let n = 0;
    for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  };

  const serialToHHMM = (v: number): string => {
    const mins = Math.round(((v % 1) + 1) % 1 * 1440);
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  };

  const handleLKUpload = async (file: File) => {
    setUploading(true);
    setUploadMsg('解析中...');
    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(file);

      const ssXml = await zip.file('xl/sharedStrings.xml')?.async('text') ?? '';
      const ssDoc = new DOMParser().parseFromString(ssXml, 'application/xml');
      const strs = Array.from(ssDoc.querySelectorAll('si')).map(si => si.textContent ?? '');

      const getCellStr = (c: Element): string => {
        const v = c.querySelector('v')?.textContent ?? '';
        return c.getAttribute('t') === 's' ? (strs[parseInt(v)] ?? '') : v;
      };

      const sheetFiles = Object.keys(zip.files)
        .filter(k => /xl\/worksheets\/sheet\d+\.xml/.test(k)).sort();
      const sheetXml = sheetFiles.length ? (await zip.file(sheetFiles[0])?.async('text') ?? '') : '';
      if (!sheetXml) throw new Error('No worksheet');

      const doc = new DOMParser().parseFromString(sheetXml, 'application/xml');
      const rowEls = Array.from(doc.querySelectorAll('row'));

      // Find header row
      const colIdx: Record<string, number> = {};
      let headerRi = -1;
      for (let ri = 0; ri < Math.min(15, rowEls.length); ri++) {
        const cells = Array.from(rowEls[ri].querySelectorAll('c'));
        const vals = cells.map(c => getCellStr(c).trim());
        if (vals.some(v => v === 'Date_' || v === 'TotalWeight')) {
          cells.forEach((c) => {
            const ref = c.getAttribute('r') ?? '';
            const colLetter = ref.replace(/[0-9]/g, '');
            const val = getCellStr(c).trim();
            if (val) colIdx[val] = colLetterToIndex(colLetter);
          });
          headerRi = ri;
          break;
        }
      }
      if (headerRi < 0) throw new Error('Header row not found — expected columns: Date_, TotalWeight, Is_Valid');

      const getCol = (rowCells: Element[], name: string, raw = false): string => {
        const ci = colIdx[name];
        if (ci === undefined) return '';
        const cell = rowCells.find(c => {
          const ref = c.getAttribute('r') ?? '';
          return colLetterToIndex(ref.replace(/[0-9]/g, '')) === ci;
        });
        if (!cell) return '';
        if (raw) return cell.querySelector('v')?.textContent ?? '';
        return getCellStr(cell);
      };

      const rows: LKRow[] = [];
      for (let ri = headerRi + 1; ri < rowEls.length; ri++) {
        const cells = Array.from(rowEls[ri].querySelectorAll('c'));

        const dateRaw = getCol(cells, 'Date_', true);
        if (!dateRaw) continue;
        const dateStr = isNaN(Number(dateRaw))
          ? excelSerialToDate(dateRaw)
          : excelSerialToDate(Number(dateRaw));
        if (!dateStr) continue;

        const weightRaw = getCol(cells, 'TotalWeight', true);
        const weight = parseFloat(weightRaw) || 0;
        if (!weight) continue;

        const valid = parseInt(getCol(cells, 'Is_Valid', true) || '0') === 1;
        const numL  = parseInt(getCol(cells, 'Numof_Loaders', true) || '2') || 2;
        const loaders = parseLoaderList(getCol(cells, 'LoaderList'));
        const truck = getCol(cells, 'TruckName');

        const startRaw  = getCol(cells, 'LoadingStart', true);
        const finishRaw = getCol(cells, 'LoadingFinish', true);
        const startR  = startRaw  ? parseFloat(startRaw)  : null;
        const finishR = finishRaw ? parseFloat(finishRaw) : null;

        const shift: 'AM' | 'PM' | 'OTHER' = (startR && !isNaN(startR)) ? getShiftFromSerial(startR) : 'OTHER';

        const tsRaw = getCol(cells, 'TimeSpent', true);
        let minutes: number | null = null;
        if (tsRaw) {
          const tsNum = parseFloat(tsRaw);
          if (!isNaN(tsNum) && tsNum >= 0 && tsNum < 1) minutes = Math.round(tsNum * 1440);
        }
        if (minutes === null && startR && finishR && finishR > startR) {
          minutes = Math.round((finishR - startR) * 1440);
        }
        if (minutes !== null && minutes > 300) minutes = null;

        rows.push({ date: dateStr, shift, weight, numL, valid, loaders, minutes, truck, startR: startR ?? null, finishR: finishR ?? null });
      }

      if (!rows.length) throw new Error('No data rows parsed');

      const dates = rows.map(r => r.date).sort();
      const dateFrom = dates[0];
      const dateTo   = dates[dates.length - 1];

      const period: LKPeriod = { id: `lk-${Date.now()}`, dateFrom, dateTo, rows, uploadedAt: new Date().toISOString() };
      const newPeriods = [...lkPeriods.filter(p => !(p.dateFrom === dateFrom && p.dateTo === dateTo)), period].slice(-10);
      setLkPeriods(newPeriods);
      idbSet('loaderKpiPeriods', newPeriods);

      // Update best shift records
      updateBestTeam(rows, dateFrom, dateTo);

      const valid = rows.filter(r => r.valid).length;
      setUploadMsg(`✓ ${rows.length} 条记录 · 有效 ${valid} · ${dateFrom} ~ ${dateTo}`);
    } catch (err) {
      setUploadMsg(`✗ 解析失败：${(err as Error).message}`);
      console.error('Loader KPI parse error', err);
    } finally {
      setUploading(false);
    }
  };

  // Helper: compute period efficiency for one shift (total tonnage / sum of daily spans)
  const periodShiftEff = (rows: LKRow[], shift: 'AM' | 'PM'): { effTph: number; totalWeightT: number; totalSpanH: number; truckCount: number; avgMinutes: number; names: string[] } | null => {
    const sr = rows.filter(r => r.valid && r.shift === shift);
    if (!sr.length) return null;
    const totalWeightT = sr.reduce((s, r) => s + r.weight / 1000, 0);
    const dates = [...new Set<string>(sr.map(r => r.date))];
    let totalSpanH = 0;
    for (const date of dates) {
      const dr = sr.filter(r => r.date === date);
      const ss = dr.map(r => r.startR).filter((v): v is number => v != null && v > 0);
      const es = dr.map(r => r.finishR).filter((v): v is number => v != null && v > 0);
      if (!ss.length || !es.length) continue;
      const spanH = (Math.max(...es) - Math.min(...ss)) * 24;
      if (spanH > 0 && spanH < 14) totalSpanH += spanH;
    }
    if (totalSpanH <= 0) return null;
    const times = sr.map(r => r.minutes).filter((m): m is number => m !== null && m > 0 && m <= 300);
    return {
      effTph: totalWeightT / totalSpanH,
      totalWeightT,
      totalSpanH,
      truckCount: sr.length,
      avgMinutes: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0,
      // Top 3 by truck-count frequency = the actual core team for this shift
      names: (() => {
        const freq = new Map<string, number>();
        for (const r of sr) for (const n of r.loaders) freq.set(n, (freq.get(n) ?? 0) + 1);
        return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
      })(),
    };
  };

  const updateBestTeam = (rows: LKRow[], dateFrom: string, dateTo: string) => {
    const periodLabel = `${dateFrom} ~ ${dateTo}`;
    let newBestAM = bestAM;
    let newBestPM = bestPM;
    let newBestTon = bestTonnage;

    // Period-level efficiency per shift
    for (const shift of ['AM', 'PM'] as const) {
      const r = periodShiftEff(rows, shift);
      if (!r) continue;
      const rec: BestShift = {
        shift, names: r.names,
        totalWeightT: Math.round(r.totalWeightT * 10) / 10,
        effTph: Math.round(r.effTph * 10) / 10,
        avgMinutes: r.avgMinutes,
        truckCount: r.truckCount,
        date: periodLabel,
        periodLabel,
      };
      if (shift === 'AM' && (!newBestAM || r.effTph > newBestAM.effTph)) newBestAM = rec;
      if (shift === 'PM' && (!newBestPM || r.effTph > newBestPM.effTph)) newBestPM = rec;
    }

    // Best single-day tonnage (AM or PM)
    const byDateShift = new Map<string, LKRow[]>();
    for (const r of rows) {
      if (!r.valid || r.shift === 'OTHER') continue;
      const key = `${r.date}|${r.shift}`;
      if (!byDateShift.has(key)) byDateShift.set(key, []);
      byDateShift.get(key)!.push(r);
    }
    for (const [key, rg] of byDateShift) {
      const [date, shift] = key.split('|') as [string, 'AM' | 'PM'];
      const ton = Math.round(rg.reduce((s, r) => s + r.weight / 1000, 0) * 10) / 10;
      if (!newBestTon || ton > newBestTon.totalWeightT) {
        const freq = new Map<string, number>();
        for (const r of rg) for (const n of r.loaders) freq.set(n, (freq.get(n) ?? 0) + 1);
        const topNames = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
        newBestTon = { shift, date, totalWeightT: ton, truckCount: rg.length, names: topNames, periodLabel };
      }
    }

    if (newBestAM !== bestAM) { setBestAM(newBestAM); idbSet('loaderBestAM', newBestAM); }
    if (newBestPM !== bestPM) { setBestPM(newBestPM); idbSet('loaderBestPM', newBestPM); }
    if (newBestTon !== bestTonnage) { setBestTonnage(newBestTon); idbSet('loaderBestTonnage', newBestTon); }
  };

  // ─── Derived stats ──────────────────────────────────────────────────────
  const latestPeriod = lkPeriods.length ? lkPeriods[lkPeriods.length - 1] : null;
  const allRows = latestPeriod?.rows ?? [];
  const validRows = allRows.filter(r => r.valid);
  const amRows = validRows.filter(r => r.shift === 'AM');
  const pmRows = validRows.filter(r => r.shift === 'PM');

  const totalWeightT = validRows.reduce((s, r) => s + r.weight / 1000, 0);
  const amWeightT    = amRows.reduce((s, r) => s + r.weight / 1000, 0);
  const pmWeightT    = pmRows.reduce((s, r) => s + r.weight / 1000, 0);
  const allDatesSet  = new Set(validRows.map(r => r.date));
  const amDatesSet   = new Set(amRows.map(r => r.date));
  const pmDatesSet   = new Set(pmRows.map(r => r.date));
  const days         = Math.max(1, allDatesSet.size);

  const calcAvgMin = (rws: LKRow[]) => {
    const ts = rws.map(r => r.minutes).filter((m): m is number => m !== null && m > 0 && m <= 300);
    return ts.length ? ts.reduce((a, b) => a + b, 0) / ts.length : null;
  };
  const amAvgMin = calcAvgMin(amRows);
  const pmAvgMin = calcAvgMin(pmRows);

  // t/h per date-shift
  const tphMap = new Map<string, number>();
  for (const shift of ['AM', 'PM'] as const) {
    const dates = [...new Set(validRows.filter(r => r.shift === shift).map(r => r.date))];
    for (const date of dates) {
      const dr = validRows.filter(r => r.date === date && r.shift === shift);
      const ss = dr.map(r => r.startR).filter((v): v is number => v != null && v > 0);
      const es = dr.map(r => r.finishR).filter((v): v is number => v != null && v > 0);
      if (!ss.length || !es.length) continue;
      const spanH = (Math.max(...es) - Math.min(...ss)) * 24;
      if (spanH <= 0 || spanH > 14) continue;
      const ton = dr.reduce((s, r) => s + r.weight / 1000, 0);
      tphMap.set(`${date}|${shift}`, Math.round(ton / spanH * 10) / 10);
    }
  }
  const amTphs = [...tphMap.entries()].filter(([k]) => k.endsWith('|AM')).map(([, v]) => v);
  const pmTphs = [...tphMap.entries()].filter(([k]) => k.endsWith('|PM')).map(([, v]) => v);
  const amAvgTph = amTphs.length ? amTphs.reduce((a, b) => a + b, 0) / amTphs.length : null;
  const pmAvgTph = pmTphs.length ? pmTphs.reduce((a, b) => a + b, 0) / pmTphs.length : null;

  // Chart data
  const chartDates = [...new Set<string>(validRows.map(r => r.date))].sort();
  const chartData = chartDates.map(date => ({
    date: date.slice(5),
    am: Math.round(amRows.filter(r => r.date === date).reduce((s, r) => s + r.weight / 1000, 0) * 10) / 10,
    pm: Math.round(pmRows.filter(r => r.date === date).reduce((s, r) => s + r.weight / 1000, 0) * 10) / 10,
  }));

  // Period summary helper
  const getShiftSummary = (shift: 'AM' | 'PM') => {
    const rws = validRows.filter(r => r.shift === shift);
    const dates = [...new Set(rws.map(r => r.date))];
    const dayStats = dates.flatMap(date => {
      const dr = rws.filter(r => r.date === date);
      const ss = dr.map(r => r.startR).filter((v): v is number => v != null && v > 0);
      const es = dr.map(r => r.finishR).filter((v): v is number => v != null && v > 0);
      if (!ss.length || !es.length) return [];
      const spanMins = Math.round((Math.max(...es) - Math.min(...ss)) * 1440);
      return [{ startT: serialToHHMM(Math.min(...ss)), endT: serialToHHMM(Math.max(...es)), spanMins }];
    });
    if (!dayStats.length) return null;
    const t2m = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const m2t = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
    const avgStart   = m2t(dayStats.map(d => t2m(d.startT)).reduce((a, b) => a + b, 0) / dayStats.length);
    const avgEnd     = m2t(dayStats.map(d => t2m(d.endT)).reduce((a, b) => a + b, 0)   / dayStats.length);
    const avgSpan    = Math.round(dayStats.map(d => d.spanMins).reduce((a, b) => a + b, 0) / dayStats.length);
    const avgSpanStr = `${Math.floor(avgSpan / 60)}h${String(avgSpan % 60).padStart(2, '0')}m`;
    const utilPct    = Math.round(avgSpan / 480 * 100);
    const avgMin     = calcAvgMin(rws);
    const dailyAvgT  = shift === 'AM' ? (amDatesSet.size > 0 ? amWeightT / amDatesSet.size : 0) : (pmDatesSet.size > 0 ? pmWeightT / pmDatesSet.size : 0);
    return { avgStart, avgEnd, avgSpanStr, utilPct, avgMin, dailyAvgT };
  };
  const amSum = getShiftSummary('AM');
  const pmSum = getShiftSummary('PM');

  // Current quarter
  const now = new Date();
  const currentQ = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
  // Quarterly best: per-period efficiency, pick the single best across AM+PM
  const quarterlyBestAM = (() => {
    let best: BestShift | null = null;
    for (const p of lkPeriods) {
      const pDate = new Date(p.dateFrom);
      const pQ = `${pDate.getFullYear()}-Q${Math.floor(pDate.getMonth() / 3) + 1}`;
      if (pQ !== currentQ) continue;
      const r = periodShiftEff(p.rows, 'AM');
      if (!r) continue;
      if (!best || r.effTph > best.effTph) {
        const pl = `${p.dateFrom} ~ ${p.dateTo}`;
        best = { shift: 'AM', names: r.names, totalWeightT: Math.round(r.totalWeightT * 10) / 10, effTph: Math.round(r.effTph * 10) / 10, avgMinutes: r.avgMinutes, truckCount: r.truckCount, date: pl, periodLabel: pl };
      }
    }
    return best;
  })();
  const quarterlyBestPM = (() => {
    let best: BestShift | null = null;
    for (const p of lkPeriods) {
      const pDate = new Date(p.dateFrom);
      const pQ = `${pDate.getFullYear()}-Q${Math.floor(pDate.getMonth() / 3) + 1}`;
      if (pQ !== currentQ) continue;
      const r = periodShiftEff(p.rows, 'PM');
      if (!r) continue;
      if (!best || r.effTph > best.effTph) {
        const pl = `${p.dateFrom} ~ ${p.dateTo}`;
        best = { shift: 'PM', names: r.names, totalWeightT: Math.round(r.totalWeightT * 10) / 10, effTph: Math.round(r.effTph * 10) / 10, avgMinutes: r.avgMinutes, truckCount: r.truckCount, date: pl, periodLabel: pl };
      }
    }
    return best;
  })();

  const tphColor = (v: number | null) =>
    v == null ? 'text-slate-400' : v >= 13 ? 'text-emerald-400' : v >= 8 ? 'text-amber-400' : 'text-red-400';
  const minColor = (v: number | null) =>
    v == null ? 'text-slate-400' : v < 30 ? 'text-emerald-400' : v < 50 ? 'text-amber-400' : 'text-red-400';

  // Single overall best: whichever shift had higher efficiency
  const overallBest: BestShift | null =
    bestAM && bestPM ? (bestAM.effTph >= bestPM.effTph ? bestAM : bestPM) :
    bestAM ?? bestPM;

  const quarterlyBest: BestShift | null =
    quarterlyBestAM && quarterlyBestPM ? (quarterlyBestAM.effTph >= quarterlyBestPM.effTph ? quarterlyBestAM : quarterlyBestPM) :
    quarterlyBestAM ?? quarterlyBestPM;

  const shiftBadge = (s: 'AM' | 'PM') => (
    <span className={cn(
      'text-[8px] font-black px-1.5 py-0.5 rounded-full',
      s === 'AM' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
    )}>{s === 'AM' ? '早班' : '下午班'}</span>
  );

  return (
    <SectionWrapper title="Delivery - Loader KPI" icon={Truck} color={color}>
      {/* ── Upload row ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed cursor-pointer transition-all text-sm font-bold',
          uploading ? 'border-blue-200 text-blue-400 bg-blue-50' : 'border-slate-200 text-slate-500 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50'
        )}>
          <Upload size={14} />
          {uploading ? '解析中...' : '上传 Loader KPI Excel'}
          <input type="file" accept=".xlsx,.xls" className="hidden" disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleLKUpload(f); e.target.value = ''; }} />
        </label>
        {uploadMsg && (
          <span className={cn('text-[10px] font-bold', uploadMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-500')}>
            {uploadMsg}
          </span>
        )}
        {latestPeriod && (
          <span className="text-[10px] text-slate-400 font-medium ml-auto">
            最新数据：{latestPeriod.dateFrom} ~ {latestPeriod.dateTo}
          </span>
        )}
      </div>

      {/* ── Cards: rows 1+2 tightly stacked ─────────────────────── */}
      <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-7 gap-1.5 items-start">
        {/* 历史最佳效率 */}
        <div className="rounded-xl border border-amber-200 p-3 flex flex-col gap-1.5 bg-white shadow-sm">
          <div className="flex items-center gap-1.5">
            <Trophy size={12} className="text-amber-500 shrink-0" />
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">历史最佳效率</span>
            {overallBest && shiftBadge(overallBest.shift)}
          </div>
          {overallBest ? (
            <>
              <div className="flex gap-1 flex-wrap">
                {overallBest.names.slice(0, 3).map((n, i) => (
                  <span key={i} className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{n.split(' ')[0]}</span>
                ))}
              </div>
              <div className="flex items-baseline gap-2">
                <span className={cn('text-[20px] font-black tabular-nums', overallBest.effTph >= 13 ? 'text-emerald-500' : 'text-amber-500')}>{overallBest.effTph.toFixed(1)}</span>
                <span className="text-[9px] text-slate-400">t/h · {overallBest.avgMinutes}分/台</span>
              </div>
              <div className="text-[7px] text-slate-400">{overallBest.truckCount}台 · {overallBest.totalWeightT.toFixed(1)}t · {overallBest.periodLabel}</div>
            </>
          ) : <div className="text-[9px] text-slate-300 py-2 text-center">暂无数据</div>}
        </div>

        {/* 历史单日最多装载 */}
        <div className="rounded-xl border border-blue-200 p-3 flex flex-col gap-1.5 bg-white shadow-sm">
          <div className="flex items-center gap-1.5">
            <BarChart2 size={12} className="text-blue-400 shrink-0" />
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">历史单日最多</span>
            {bestTonnage && shiftBadge(bestTonnage.shift)}
          </div>
          {bestTonnage ? (
            <>
              <div className="flex gap-1 flex-wrap">
                {bestTonnage.names.slice(0, 3).map((n, i) => (
                  <span key={i} className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{n.split(' ')[0]}</span>
                ))}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-[20px] font-black text-blue-600 tabular-nums">{bestTonnage.totalWeightT.toFixed(1)}</span>
                <span className="text-[9px] text-blue-400 font-bold">t</span>
              </div>
              <div className="text-[7px] text-slate-400">{bestTonnage.truckCount}台 · {bestTonnage.date}</div>
            </>
          ) : <div className="text-[9px] text-slate-300 py-2 text-center">暂无数据</div>}
        </div>

        {/* 季度最佳效率 */}
        <div className="rounded-xl border border-amber-300 p-3 flex flex-col gap-1.5 bg-amber-50/60 shadow-sm">
          <div className="flex items-center gap-1.5">
            <Star size={12} className="text-amber-400 shrink-0" />
            <span className="text-[8px] font-black uppercase tracking-widest text-amber-600">{currentQ} 季度最佳</span>
            {quarterlyBest && shiftBadge(quarterlyBest.shift)}
          </div>
          {quarterlyBest ? (
            <>
              <div className="flex gap-1 flex-wrap">
                {quarterlyBest.names.slice(0, 3).map((n, i) => (
                  <span key={i} className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{n.split(' ')[0]}</span>
                ))}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-[20px] font-black text-amber-600 tabular-nums">{quarterlyBest.effTph.toFixed(1)}</span>
                <span className="text-[9px] text-amber-500 font-bold">t/h</span>
              </div>
              <div className="text-[7px] text-slate-400">{quarterlyBest.totalWeightT.toFixed(1)}t · {quarterlyBest.avgMinutes}分/台</div>
            </>
          ) : <div className="text-[9px] text-slate-300 py-2 text-center">暂无数据</div>}
        </div>

        {/* 周期均值 — 4 cards in same grid row */}
        {([
          { label:'早班 均首车', value: amSum?.avgStart ?? '—', sub: `末车 ${amSum?.avgEnd ?? '—'}`, border:'border-blue-100', clr:'text-blue-600' },
          { label:'早班 均效率', value: amSum?.avgSpanStr ?? '—', sub: `利用率 ${amSum ? amSum.utilPct+'%' : '—'} · ${amSum?.avgMin != null ? amSum.avgMin.toFixed(1)+'分' : '—'} · ${amSum?.dailyAvgT.toFixed(1)??'—'}t/天`, border:'border-blue-100', clr:'text-blue-600' },
          { label:'下午班 均首车', value: pmSum?.avgStart ?? '—', sub: `末车 ${pmSum?.avgEnd ?? '—'}`, border:'border-amber-100', clr:'text-amber-600' },
          { label:'下午班 均效率', value: pmSum?.avgSpanStr ?? '—', sub: `利用率 ${pmSum ? pmSum.utilPct+'%' : '—'} · ${pmSum?.avgMin != null ? pmSum.avgMin.toFixed(1)+'分' : '—'} · ${pmSum?.dailyAvgT.toFixed(1)??'—'}t/天`, border:'border-amber-100', clr:'text-amber-600' },
        ] as const).map(({ label, value, sub, border, clr }) => (
          <div key={label} className={cn('bg-white rounded-xl border p-3 shadow-sm min-w-0 flex flex-col gap-1.5', border)}>
            <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">{label}</div>
            <div className={cn('text-[20px] font-black leading-none tabular-nums', clr)}>{value}</div>
            <div className="text-[8px] text-slate-400 leading-tight">{sub}</div>
          </div>
        ))}
      </div>

      {validRows.length > 0 && (() => {
        const bestDay = Math.max(...chartDates.map(date =>
          validRows.filter(r=>r.date===date).reduce((s,r)=>s+r.weight/1000,0)), 0);
        const Card = ({ label, value, unit, sub, borderCls = 'border-slate-100' }: { label:string; value:string; unit?:string; sub?:string; borderCls?:string }) => (
          <div className={cn('bg-white rounded-xl border px-4 py-3.5 shadow-sm min-w-0', borderCls)}>
            <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 leading-none">{label}</div>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="text-[30px] font-black text-slate-800 tabular-nums leading-none">{value}</span>
              {unit && <span className="text-[13px] font-bold text-slate-400">{unit}</span>}
            </div>
            {sub && <div className="text-[8px] text-slate-400 mt-1 leading-tight">{sub}</div>}
          </div>
        );
        return (
          <div className="grid grid-cols-8 gap-1.5 items-start">
            <Card label="有效发货量" value={totalWeightT.toFixed(0)} unit="t" sub={`日均 ${(totalWeightT/days).toFixed(1)}t · ${validRows.length}台`} />
            <Card label="早班 AM" value={amWeightT.toFixed(0)} unit="t" sub={`日均 ${amDatesSet.size>0?(amWeightT/amDatesSet.size).toFixed(1):'—'}t`} borderCls="border-blue-100" />
            <Card label="下午班 PM" value={pmWeightT.toFixed(0)} unit="t" sub={`日均 ${pmDatesSet.size>0?(pmWeightT/pmDatesSet.size).toFixed(1):'—'}t`} borderCls="border-amber-100" />
            <Card label="最高单日" value={bestDay.toFixed(0)} unit="t" sub={chartDates.find(d=>validRows.filter(r=>r.date===d).reduce((s,r)=>s+r.weight/1000,0)>=bestDay-0.1)||''} borderCls="border-rose-100" />
            <Card label="均装车 AM" value={amAvgMin!=null?amAvgMin.toFixed(1):'—'} unit="分" sub="均每台装车" borderCls="border-blue-100" />
            <Card label="均装车 PM" value={pmAvgMin!=null?pmAvgMin.toFixed(1):'—'} unit="分" sub="均每台装车" borderCls="border-amber-100" />
            <Card label="效率 AM" value={amAvgTph!=null?amAvgTph.toFixed(1):'—'} unit="t/h" sub="发货量÷工时" borderCls="border-emerald-100" />
            <Card label="效率 PM" value={pmAvgTph!=null?pmAvgTph.toFixed(1):'—'} unit="t/h" sub="发货量÷工时" borderCls="border-emerald-100" />
          </div>
        );
      })()}
      {validRows.length > 0 ? (
        <>
          {/* ── Two charts 50/50 ─────────────────────────────────────── */}
          {chartData.length > 0 && <div className="grid grid-cols-2 gap-2 items-start">

          {/* Left: horizontal bar chart */}
          {(() => {
            const maxT = Math.max(...chartData.map(d => d.am + d.pm), 1);
            const allDailyTotals = chartDates.map(date => {
              const total = (amRows.filter(r=>r.date===date).reduce((s,r)=>s+r.weight/1000,0)) +
                            (pmRows.filter(r=>r.date===date).reduce((s,r)=>s+r.weight/1000,0));
              const d = new Date(date); const dow = d.getDay();
              const isWeekend = dow===0||dow===6;
              return { date: date.slice(5), total, isWeekend };
            });
            const globalMax = Math.max(...allDailyTotals.map(d=>d.total), 180);
            const recordDay = allDailyTotals.reduce((m,d) => d.total>m.total?d:m, allDailyTotals[0]);
            const prevTotals = [...allDailyTotals];

            const barClr = (t: number, isWeekend: boolean) => {
              if (isWeekend || t < 5) return '#d1d5db';
              if (t >= 180) return '#c0392b';
              if (t >= 150) return '#27ae60';
              return '#2980b9';
            };
            const txtClr = (t: number, isWeekend: boolean) => {
              if (isWeekend||t<5) return 'text-slate-400';
              if (t>=180) return 'text-red-600 font-black';
              if (t>=150) return 'text-emerald-600 font-bold';
              return 'text-slate-600';
            };

            return (
              <div className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm min-w-0">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">每日发货量 — 橙色≥180t</span>
                  <div className="flex gap-3 text-[8px] text-slate-400">
                    {[['#c0392b','≥180t 高产日'],['#27ae60','150-179t 良好'],['#2980b9','100-149t 正常'],['#d1d5db','周末/停工']].map(([c,l])=>(
                      <span key={l} className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{background:c}}/>
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
                {(() => {
                  const CHART_H = 300;
                  const rowH = Math.max(14, Math.floor(CHART_H / allDailyTotals.length));
                  return (
                <div className="flex flex-col" style={{ height: CHART_H }}>
                  {allDailyTotals.map((d, i) => {
                    const pct = d.total/globalMax*100;
                    const isRecord = d.date === recordDay.date && d.total > 0;
                    const prev = i > 0 ? prevTotals[i-1].total : null;
                    const trend = prev != null && d.total > 0 ? (d.total > prev+5 ? '↑' : d.total < prev-5 ? '↓' : '') : '';
                    const trendClr = trend==='↑'?'text-emerald-500':trend==='↓'?'text-red-400':'text-slate-300';
                    return (
                      <div key={d.date} className="flex items-center gap-2" style={{ height: rowH }}>
                        <div className={cn('text-[8px] w-12 text-right shrink-0 tabular-nums', d.isWeekend?'text-slate-300':d.total<5?'text-slate-300':'text-slate-500')}>
                          {d.date}{isRecord ? ' 🏆' : d.total>=180 ? ' ⭐' : ''}
                        </div>
                        <div className="flex-1 h-4 bg-slate-50 rounded-sm overflow-hidden relative">
                          {d.total > 0 && (
                            <div
                              className="h-full rounded-sm flex items-center pl-1.5 transition-all"
                              style={{ width:`${Math.max(pct,2)}%`, backgroundColor: barClr(d.total,d.isWeekend) }}
                            >
                              <span className="text-[8px] font-bold text-white tabular-nums whitespace-nowrap">
                                {d.isWeekend||d.total<5 ? '' : d.total.toFixed(1)}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className={cn('text-[8px] w-14 tabular-nums shrink-0 flex items-center gap-0.5', txtClr(d.total,d.isWeekend))}>
                          {d.isWeekend||d.total<5 ? (d.total<0.5?'停工':`${Math.round(d.total)}t`) : `${Math.round(d.total)}t`}
                          {trend && <span className={cn('text-[8px]',trendClr)}>{trend}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* Middle: stacked AM/PM bar chart */}
            <div className="bg-white rounded-xl border border-slate-100 px-3 py-2 shadow-sm flex flex-col min-w-0">
              <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">每日发货量 AM / PM (t)</div>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} margin={{ top: 2, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={24} />
                    <Tooltip contentStyle={{ fontSize: 9, borderRadius: 6, border: '1px solid #e2e8f0' }}
                      formatter={(v: number, name: string) => [`${v.toFixed(1)} t`, name==='am'?'早班 AM':'下午班 PM']} />
                    <Bar dataKey="am" stackId="s" fill="#5c85d6" name="am" radius={[0,0,0,0]} />
                    <Bar dataKey="pm" stackId="s" fill="#d4874b" name="pm" radius={[2,2,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-3 justify-center mt-0.5">
                <span className="text-[8px] text-slate-400 flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{background:'#5c85d6'}}/>早班 AM</span>
                <span className="text-[8px] text-slate-400 flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{background:'#d4874b'}}/>下午班 PM</span>
              </div>
            </div>

          </div>}

        </>
      ) : null}
      </div>{/* end card+charts wrapper */}
      {validRows.length === 0 && (
        /* ── Empty state ──────────────────────────────────────────── */
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center">
            <Truck size={24} className="text-slate-300" />
          </div>
          <div>
            <p className="text-sm font-black text-slate-500">暂无 Loader KPI 数据</p>
            <p className="text-[10px] text-slate-400 mt-1">上传 Excel 文件以查看装车效率、发货量统计和最佳团队记录</p>
          </div>
        </div>
      )}

      {/* ── Loader Bonus Calculator — password protected, collapsible ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden shrink-0">
        {/* Header toggle */}
        <button
          onClick={() => {
            if (!bonusToolUnlocked) {
              setBonusToolOpen(o => !o);
            } else {
              setBonusToolOpen(o => !o);
            }
          }}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-50/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            <BarChart2 size={14} className="text-amber-500 shrink-0" />
            <span className="text-[11px] font-black text-slate-700">Loader Bonus Calculator — 奖金计算工具</span>
            <span className="text-[9px] text-slate-400">效率分 · 难度分 · 班次系数 · 导出 PDF</span>
            {bonusToolUnlocked && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-600 font-bold">🔓 已解锁</span>}
          </div>
          <ChevronDown size={14} className={cn('text-slate-400 transition-transform duration-200 shrink-0', bonusToolOpen && 'rotate-180')} />
        </button>

        {bonusToolOpen && !bonusToolUnlocked && (
          /* Password prompt */
          <div className="border-t border-slate-100 flex flex-col items-center justify-center py-10 gap-4">
            <Lock size={28} className="text-slate-300" />
            <div className="text-center">
              <p className="text-[11px] font-black text-slate-600 mb-1">请输入访问密码</p>
              <p className="text-[9px] text-slate-400">此功能需要密码验证</p>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={bonusPwInput}
                onChange={e => { setBonusPwInput(e.target.value); setBonusPwError(false); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (bonusPwInput === 'finesteel') {
                      setBonusToolUnlocked(true); setBonusPwError(false); setBonusPwInput('');
                    } else {
                      setBonusPwError(true); setBonusPwInput('');
                    }
                  }
                }}
                placeholder="密码"
                className={cn('text-[11px] px-3 py-2 rounded-xl border focus:outline-none w-40',
                  bonusPwError ? 'border-red-300 bg-red-50' : 'border-slate-200 focus:border-amber-400')}
                autoFocus
              />
              <button
                onClick={() => {
                  if (bonusPwInput === 'finesteel') {
                    setBonusToolUnlocked(true); setBonusPwError(false); setBonusPwInput('');
                  } else {
                    setBonusPwError(true); setBonusPwInput('');
                  }
                }}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black rounded-xl transition-colors"
              >
                确认
              </button>
            </div>
            {bonusPwError && <p className="text-[9px] text-red-500 font-bold">密码错误，请重试</p>}
          </div>
        )}

        {bonusToolOpen && bonusToolUnlocked && (
          <div className="border-t border-slate-100">
            <iframe
              src="/loader-bonus.html"
              className="w-full border-0 block"
              style={{ height: '88vh' }}
              title="Loader Bonus Calculator"
            />
          </div>
        )}
      </div>
    </SectionWrapper>
  );
};

// ── 5S Types & Constants ──────────────────────────────────────────────────
interface FiveSAreaDef {
  id: string;
  name: string;
  shift?: 'AM' | 'PM';
  responsible: string;
  role: 'operator' | 'loader' | 'packer' | 'forklift' | 'cleaner';
  category: 'machine' | 'other';
  secondary?: string;
}
interface FiveSAreaScore {
  dims: number[];
  notes?: string;
  photos?: string[];      // problem photos (array)
  photosGood?: string[];  // good behaviour photos (array)
  // legacy single-photo fields kept for backward-compat
  photo?: string;
  photoGood?: string;
}
interface FiveSAudit {
  id: string;
  date: string;
  scores: Record<string, FiveSAreaScore>;
}

const DEFAULT_5S_AREAS: FiveSAreaDef[] = [
  // Machines — AM
  { id: 'ft1-am',   name: 'FT-1',  shift: 'AM', responsible: 'Kai Yuan',         role: 'operator', category: 'machine' },
  { id: 'ft2-am',   name: 'FT-2',  shift: 'AM', responsible: 'Weidong Tang',     role: 'operator', category: 'machine' },
  { id: 'mst-am',   name: 'MST',   shift: 'AM', responsible: 'Baohe Tian',       role: 'operator', category: 'machine' },
  { id: 'pl22-am',  name: 'PL22',  shift: 'AM', responsible: 'Yundeng Mai',      role: 'operator', category: 'machine' },
  { id: 'sl28-am',  name: 'SL28',  shift: 'AM', responsible: 'Kurtic Pink',      role: 'operator', category: 'machine' },
  { id: 'sl32-am',  name: 'SL32',  shift: 'AM', responsible: 'Chenxi Li',        role: 'operator', category: 'machine' },
  { id: 'sl300-am', name: 'SL300', shift: 'AM', responsible: 'Yichao Ji',        role: 'operator', category: 'machine' },
  { id: 'robo-am',  name: 'Robo',  shift: 'AM', responsible: 'Huanfeng CHEN',    role: 'operator', category: 'machine' },
  // Machines — PM
  { id: 'ft1-pm',   name: 'FT-1',  shift: 'PM', responsible: 'Christian Enrile', role: 'operator', category: 'machine' },
  { id: 'ft2-pm',   name: 'FT-2',  shift: 'PM', responsible: 'Dexing Kong',      role: 'operator', category: 'machine' },
  { id: 'mst-pm',   name: 'MST',   shift: 'PM', responsible: '',                 role: 'operator', category: 'machine' },
  { id: 'pl22-pm',  name: 'PL22',  shift: 'PM', responsible: '',                 role: 'operator', category: 'machine' },
  { id: 'sl28-pm',  name: 'SL28',  shift: 'PM', responsible: '',                 role: 'operator', category: 'machine' },
  { id: 'sl32-pm',  name: 'SL32',  shift: 'PM', responsible: 'Dean Erbert',      role: 'operator', category: 'machine' },
  { id: 'sl300-pm', name: 'SL300', shift: 'PM', responsible: '',                 role: 'operator', category: 'machine' },
  { id: 'robo-pm',  name: 'Robo',  shift: 'PM', responsible: 'Sugeng Hariyadi',  role: 'operator', category: 'machine' },
  // Other areas — AM
  { id: 'loading-am',  name: '装车车道', shift: 'AM', responsible: 'Tuan Tran',        role: 'loader',   category: 'other' },
  { id: 'fi-rack-am',  name: 'FI Rack',  shift: 'AM', responsible: 'Packer',           role: 'packer',   category: 'other' },
  { id: 'acc-am',      name: 'ACC',      shift: 'AM', responsible: 'Loader',           role: 'loader',   category: 'other' },
  { id: 'plaza-am',    name: '小广场',   shift: 'AM', responsible: 'Forklift Driver',  role: 'forklift', category: 'other', secondary: 'Loader' },
  { id: 'hygiene-am',  name: '全场卫生', shift: 'AM', responsible: 'Sugeng Hariyadi',  role: 'cleaner',  category: 'other' },
  // Other areas — PM
  { id: 'loading-pm',  name: '装车车道', shift: 'PM', responsible: 'Leanschel Joseph', role: 'loader',   category: 'other' },
  { id: 'fi-rack-pm',  name: 'FI Rack',  shift: 'PM', responsible: 'Packer',           role: 'packer',   category: 'other' },
  { id: 'acc-pm',      name: 'ACC',      shift: 'PM', responsible: 'Loader',           role: 'loader',   category: 'other' },
  { id: 'plaza-pm',    name: '小广场',   shift: 'PM', responsible: 'Forklift Driver',  role: 'forklift', category: 'other', secondary: 'Loader' },
  { id: 'hygiene-pm',  name: '全场卫生', shift: 'PM', responsible: 'Sugeng Hariyadi',  role: 'cleaner',  category: 'other' },
];

const DIMS_5S = ['整理', '整顿', '清扫', '清洁', '素养', '开机检查', '工位整理', '工具清点'];

const FiveSSection: React.FC<SectionProps> = ({ color }) => {
  const [areas, setAreas]         = useState<FiveSAreaDef[]>(DEFAULT_5S_AREAS);
  const [audits, setAudits]       = useState<FiveSAudit[]>([]);
  const [mode, setMode]           = useState<'view' | 'audit'>('view');
  const [managing, setManaging]   = useState(false);
  const [auditDate, setAuditDate] = useState(new Date().toISOString().slice(0, 10));
  const [draft, setDraft]         = useState<Record<string, FiveSAreaScore>>({});
  const [expandedRow, setExpanded] = useState<string | null>(null);
  const [slideIdx, setSlideIdx]    = useState(0);
  const [lightbox, setLightbox]    = useState<string | null>(null);

  useEffect(() => {
    idbGet<FiveSAreaDef[]>('fiveSAreas').then(d => { if (d?.length) setAreas(d); });
    idbGet<FiveSAudit[]>('fiveSAudits').then(d => { if (d?.length) setAudits(d); });
  }, []);

  const saveAudits = (a: FiveSAudit[]) => { setAudits(a); idbSet('fiveSAudits', a); };
  const saveAreas  = (a: FiveSAreaDef[]) => { setAreas(a); idbSet('fiveSAreas', a); };
  const patchArea  = (id: string, patch: Partial<FiveSAreaDef>) =>
    saveAreas(areas.map(a => a.id === id ? { ...a, ...patch } : a));
  const deleteArea = (id: string) => saveAreas(areas.filter(a => a.id !== id));
  const addArea    = (shift: 'AM' | 'PM', category: 'machine' | 'other') =>
    saveAreas([...areas, { id: `area-${Date.now()}`, name: '新区域', shift, responsible: '', role: 'operator', category }]);

  const latestAudit = audits.length ? audits[audits.length - 1] : null;
  const getScore = (id: string): FiveSAreaScore | null => latestAudit?.scores[id] ?? null;
  const pctOf = (d: number[]) => d.length ? Math.round(d.reduce((a,b)=>a+b,0) / (d.length * 5) * 100) : 0;

  const pctCls  = (p: number) => p >= 80 ? 'text-emerald-600' : p >= 60 ? 'text-amber-500' : 'text-red-500';
  const pctBar  = (p: number) => p >= 80 ? '#10b981' : p >= 60 ? '#f59e0b' : '#ef4444';
  const roleCls = (r: string) => ({ operator:'bg-blue-100 text-blue-700', loader:'bg-amber-100 text-amber-700', packer:'bg-purple-100 text-purple-700', forklift:'bg-orange-100 text-orange-700', cleaner:'bg-emerald-100 text-emerald-700' }[r] ?? 'bg-slate-100 text-slate-600');
  const roleNm  = (r: string) => ({ operator:'操作员', loader:'Loader', packer:'Packer', forklift:'叉车', cleaner:'清洁' }[r] ?? r);
  const shiftCls = (s?: string) => s === 'AM' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600';

  const scoredAreas = areas.filter(a => latestAudit?.scores[a.id]);
  const overallPct  = scoredAreas.length
    ? Math.round(scoredAreas.map(a => pctOf(latestAudit!.scores[a.id].dims)).reduce((a,b)=>a+b,0) / scoredAreas.length)
    : null;

  const resizeImg = (file: File): Promise<string> => new Promise(resolve => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 800; let [w,h] = [img.width, img.height];
      if (w > MAX) { h = Math.round(h*MAX/w); w = MAX; }
      const c = document.createElement('canvas'); c.width=w; c.height=h;
      c.getContext('2d')!.drawImage(img,0,0,w,h); URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.75));
    }; img.src = url;
  });

  // Merge legacy single-photo fields into arrays
  const toArr = (sc?: FiveSAreaScore) => ({
    photos:     [...(sc?.photos ?? []), ...(sc?.photo ? [sc.photo] : [])],
    photosGood: [...(sc?.photosGood ?? []), ...(sc?.photoGood ? [sc.photoGood] : [])],
  });
  // Get all problem photos for an area (view mode)
  const getPhotos     = (id: string) => { const sc = getScore(id); return sc ? toArr(sc).photos : []; };
  const getPhotosGood = (id: string) => { const sc = getScore(id); return sc ? toArr(sc).photosGood : []; };

  const startAudit = () => {
    const pf: Record<string, FiveSAreaScore> = {};
    for (const a of areas) {
      const prev = latestAudit?.scores[a.id];
      const { photos, photosGood } = toArr(prev);
      pf[a.id] = { dims: prev ? [...prev.dims, ...DIMS_5S.slice(prev.dims.length).map(() => 3)] : DIMS_5S.map(() => 3), notes: prev?.notes ?? '', photos, photosGood };
    }
    setDraft(pf); setAuditDate(new Date().toISOString().slice(0,10)); setMode('audit'); setExpanded(null);
  };
  const cycleScore = (id: string, di: number) =>
    setDraft(p => ({ ...p, [id]: { ...p[id], dims: p[id].dims.map((x,i) => i===di ? (x>=5?1:x+1) : x) } }));
  const setNotes = (id: string, v: string) => setDraft(p => ({ ...p, [id]: { ...p[id], notes: v } }));

  const addPhotos = async (id: string, files: FileList, good = false) => {
    const b64s = await Promise.all(Array.from(files).map(f => resizeImg(f)));
    setDraft(p => {
      const cur = p[id];
      return good
        ? { ...p, [id]: { ...cur, photosGood: [...(cur.photosGood ?? []), ...b64s] } }
        : { ...p, [id]: { ...cur, photos:     [...(cur.photos     ?? []), ...b64s] } };
    });
  };
  const removePhoto = (id: string, idx: number, good = false) =>
    setDraft(p => {
      const cur = p[id];
      return good
        ? { ...p, [id]: { ...cur, photosGood: (cur.photosGood ?? []).filter((_,i) => i !== idx) } }
        : { ...p, [id]: { ...cur, photos:     (cur.photos     ?? []).filter((_,i) => i !== idx) } };
    });
  const saveAudit = () => {
    saveAudits([...audits.filter(a => a.date !== auditDate), { id:`5s-${Date.now()}`, date:auditDate, scores:draft }]);
    setMode('view'); setExpanded(null);
  };


  // Issues slideshow
  const issueAreas = areas.filter(a => { const s = getScore(a.id); return s && (s.notes?.trim() || s.photo); });
  const si = issueAreas.length ? slideIdx % issueAreas.length : 0;
  const curSlide = issueAreas[si];

  // ── KPI card stats ───────────────────────────────────────────────
  const thisYear5S = new Date().getFullYear();
  const auditCountYTD = audits.filter(a => new Date(a.date).getFullYear() === thisYear5S).length;
  const issueCount    = issueAreas.length;
  const lowCount      = scoredAreas.filter(a => pctOf(latestAudit!.scores[a.id].dims) < 60).length;
  const avgPct = (list: FiveSAreaDef[]) => {
    const sc = list.filter(a => latestAudit?.scores[a.id]);
    return sc.length ? Math.round(sc.map(a => pctOf(latestAudit!.scores[a.id].dims)).reduce((a,b)=>a+b,0)/sc.length) : null;
  };
  const amAvg      = avgPct(areas.filter(a => a.shift === 'AM'));
  const pmAvg      = avgPct(areas.filter(a => a.shift === 'PM'));
  const machineAvg = avgPct(areas.filter(a => a.category === 'machine'));
  const otherAvg   = avgPct(areas.filter(a => a.category === 'other'));

  const trendData = [...audits].slice(-12).map(a => {
    const sc = areas.filter(x => a.scores[x.id]);
    return { date: a.date.slice(5), score: sc.length ? Math.round(sc.map(x => pctOf(a.scores[x.id].dims)).reduce((s,v)=>s+v,0)/sc.length) : 0 };
  });

  // ── Score cell (plain render fn — not a component, avoids remount on state change) ──
  const scoreCell = (id: string, di: number, editing: boolean) => {
    const sc  = editing ? draft[id] : getScore(id);
    const v   = sc?.dims[di] ?? null;
    if (v === null) return <td key={di} className="px-0.5 py-1 text-center text-slate-200 text-[9px]">—</td>;
    const cls = v >= 4 ? 'bg-emerald-100 text-emerald-700' : v === 3 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
    return (
      <td key={di} className="px-0.5 py-1 text-center">
        {editing
          ? <button onClick={() => cycleScore(id, di)} title="点击切换 1→2→3→4→5→1"
              className={cn('inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-black cursor-pointer hover:ring-2 ring-blue-300 ring-offset-1 transition-all', cls)}>{v}</button>
          : <span className={cn('inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-black', cls)}>{v}</span>
        }
      </td>
    );
  };

  // ── Table group (plain render fn) ────────────────────────────
  // ── Single-table column (reusable for AM / PM / other) ───────
  const shiftTable = (label: string, labelCls: string, borderCls: string, list: FiveSAreaDef[], editing: boolean) => {
    const shift = list[0]?.shift ?? 'AM';
    const cat   = list[0]?.category ?? 'other';
    return (
    <div className={cn('bg-white rounded-2xl border-2 shadow-sm overflow-hidden shrink-0 w-[400px]', borderCls)}>
      <div className={cn('px-4 py-2.5 border-b border-slate-100 text-[9px] font-black uppercase tracking-widest', labelCls)}>{label}</div>
      <table className="w-full text-[9px]" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/60">
            <th className="text-left px-1 py-1 font-bold text-slate-400 overflow-hidden" style={{ width: managing ? 70 : 50 }}>区域</th>
            <th className="text-left px-1 py-1 font-bold text-slate-400 overflow-hidden" style={{ width: managing ? 80 : 50 }}>负责人</th>
            {DIMS_5S.map((d,i) => <th key={i} className="text-center px-0 py-1 font-bold text-slate-400" style={{ width: 22 }}>{d}</th>)}
            <th className="text-right px-2 py-1 font-bold text-slate-400" style={{ width: 88 }}>评分</th>
            <th className="text-center px-0 py-1 font-bold text-slate-400" style={{ width: managing ? 40 : 26 }}>
              {managing ? '操作' : '📷'}
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map(area => {
            const sc       = editing ? draft[area.id] : getScore(area.id);
            const pct      = sc ? pctOf(sc.dims) : null;
            const hasIssue = sc && (sc.notes?.trim() || sc.photo);
            const open     = expandedRow === area.id;
            return (
              <React.Fragment key={area.id}>
                <tr className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors group/row">
                  <td className="px-1 py-1 overflow-hidden">
                    {managing
                      ? <input value={area.name} onChange={e => patchArea(area.id, { name: e.target.value })}
                          className="font-black text-slate-800 text-[9px] w-full bg-transparent border-b border-slate-200 focus:outline-none focus:border-blue-400 truncate" />
                      : <span className="font-black text-slate-800 text-[9px] truncate block">{area.name}</span>
                    }
                  </td>
                  <td className="px-1 py-1 overflow-hidden">
                    {managing
                      ? <input value={area.responsible} onChange={e => patchArea(area.id, { responsible: e.target.value })}
                          className="text-[8px] text-slate-500 w-full bg-transparent border-b border-slate-200 focus:outline-none focus:border-blue-400 truncate" />
                      : <span className="text-[8px] text-slate-500 truncate block">{area.responsible?.split(' ')[0] || '—'}</span>
                    }
                  </td>
                  {DIMS_5S.map((_, di) => scoreCell(area.id, di, editing))}
                  <td className="px-2 py-1 text-right" style={{ width: 88 }}>
                    {pct != null ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={cn('text-[10px] font-black tabular-nums', pctCls(pct))}>{pct}%</span>
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width:`${pct}%`, backgroundColor: pctBar(pct) }} />
                        </div>
                      </div>
                    ) : <span className="text-slate-200">—</span>}
                  </td>
                  <td className="px-1 py-1 text-center">
                    {managing
                      ? <button onClick={() => deleteArea(area.id)}
                          className="text-[9px] text-red-400 hover:text-red-600 hover:bg-red-50 rounded px-1 py-0.5 font-bold transition-colors">×</button>
                      : <button onClick={() => setExpanded(open ? null : area.id)}
                          className={cn('text-[8px] px-1 py-0.5 rounded font-bold transition-colors',
                            open ? 'bg-slate-600 text-white' : hasIssue ? 'bg-red-50 text-red-500 border border-red-100' : editing ? 'text-slate-300 hover:text-slate-500' : 'text-slate-200'
                          )}>{open ? '×' : hasIssue ? '📷' : editing ? '+' : '—'}</button>
                    }
                  </td>
                </tr>
                {open && (
                  <tr className="border-t border-slate-100 bg-slate-50/30">
                    <td colSpan={9} className="px-3 py-2.5">
                      <div className="flex flex-col gap-2">
                        {/* Notes */}
                        {editing
                          ? <textarea value={sc?.notes ?? ''} onChange={e => setNotes(area.id, e.target.value)}
                              placeholder="检查记录 / 发现问题..." rows={2}
                              className="w-full text-[10px] text-slate-600 p-2 rounded-xl border border-slate-200 resize-none focus:outline-none focus:border-blue-300 placeholder:text-slate-300 leading-relaxed bg-white" />
                          : sc?.notes
                            ? <div className="text-[10px] text-slate-600 bg-white rounded-xl p-2 leading-relaxed border border-slate-100 whitespace-pre-wrap">{sc.notes}</div>
                            : null}
                        {/* Problem photos */}
                        {(() => {
                          const srcs = editing ? (sc?.photos ?? []) : getPhotos(area.id);
                          if (!editing && srcs.length === 0) return null;
                          return (
                            <div>
                              <div className="text-[7px] text-red-400 font-bold mb-1">⚠ 问题照片{srcs.length > 0 ? ` (${srcs.length})` : ''}</div>
                              <div className="flex flex-wrap gap-1">
                                {srcs.map((src, i) => (
                                  <div key={i} className="relative shrink-0">
                                    <img src={src} className="w-14 h-14 rounded-lg object-cover cursor-pointer hover:opacity-90" onClick={() => setLightbox(src)} />
                                    {editing && <button onClick={() => removePhoto(area.id, i, false)} className="absolute -top-1 -right-1 bg-black/60 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center hover:bg-black/80"><X size={7}/></button>}
                                  </div>
                                ))}
                                {editing && <label className="w-14 h-14 rounded-lg border-2 border-dashed border-red-100 text-red-300 flex flex-col items-center justify-center text-[7px] cursor-pointer hover:border-red-300 hover:text-red-400 shrink-0"><Camera size={11}/><span>+ 添加</span><input type="file" accept="image/*" multiple className="hidden" onChange={e => { if(e.target.files?.length) addPhotos(area.id, e.target.files, false); e.target.value=''; }} /></label>}
                              </div>
                            </div>
                          );
                        })()}
                        {/* Good behaviour photos */}
                        {(() => {
                          const srcs = editing ? (sc?.photosGood ?? []) : getPhotosGood(area.id);
                          if (!editing && srcs.length === 0) return null;
                          return (
                            <div>
                              <div className="text-[7px] text-emerald-500 font-bold mb-1">✓ 良好行为{srcs.length > 0 ? ` (${srcs.length})` : ''}</div>
                              <div className="flex flex-wrap gap-1">
                                {srcs.map((src, i) => (
                                  <div key={i} className="relative shrink-0">
                                    <img src={src} className="w-14 h-14 rounded-lg object-cover cursor-pointer hover:opacity-90" onClick={() => setLightbox(src)} />
                                    {editing && <button onClick={() => removePhoto(area.id, i, true)} className="absolute -top-1 -right-1 bg-black/60 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center hover:bg-black/80"><X size={7}/></button>}
                                  </div>
                                ))}
                                {editing && <label className="w-14 h-14 rounded-lg border-2 border-dashed border-emerald-100 text-emerald-300 flex flex-col items-center justify-center text-[7px] cursor-pointer hover:border-emerald-300 hover:text-emerald-400 shrink-0"><Camera size={11}/><span>+ 添加</span><input type="file" accept="image/*" multiple className="hidden" onChange={e => { if(e.target.files?.length) addPhotos(area.id, e.target.files, true); e.target.value=''; }} /></label>}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      {managing && (
        <button onClick={() => addArea(shift, cat)}
          className="w-full py-1.5 text-[8px] font-bold text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors border-t border-slate-50 flex items-center justify-center gap-1">
          <Plus size={10} /> 添加区域
        </button>
      )}
    </div>
  );};

  return (
    <SectionWrapper title="5S - 现场管理评分" icon={ClipboardList} color={color}>
      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="max-w-full max-h-full rounded-2xl object-contain" />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white bg-black/40 rounded-full p-1.5 hover:bg-black/60"><X size={18}/></button>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 flex-wrap">
        {overallPct != null
          ? <div className="flex items-center gap-2">
              <span className={cn('text-[34px] font-black tabular-nums leading-none', pctCls(overallPct))}>{overallPct}%</span>
              <div><div className="text-[9px] text-slate-500 font-bold">综合评分</div>
                <div className="text-[8px] text-slate-400">{scoredAreas.length} 个区域 · {latestAudit?.date}</div></div>
            </div>
          : <div className="text-[11px] text-slate-400">暂无评分记录</div>
        }
        <div className="ml-auto flex gap-2 items-center">
          <button onClick={() => setManaging(m => !m)}
            className={cn('text-[10px] px-3 py-1.5 rounded-lg font-bold transition-colors',
              managing ? 'bg-violet-500 text-white hover:bg-violet-600' : 'border border-slate-200 text-slate-500 hover:bg-slate-50')}>
            {managing ? '完成管理' : '管理区域'}
          </button>
          {mode === 'audit' ? (
            <>
              <input type="date" value={auditDate} onChange={e => setAuditDate(e.target.value)}
                className="text-[10px] px-2 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:border-blue-300" />
              <button onClick={() => { setMode('view'); setExpanded(null); }} className="text-[10px] px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">取消</button>
              <button onClick={saveAudit} className="text-[10px] px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-bold hover:bg-emerald-600">保存评分</button>
            </>
          ) : (
            <button onClick={startAudit} className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-lg bg-orange-500 text-white font-bold hover:bg-orange-600">
              <Plus size={11}/> 新建评分
            </button>
          )}
        </div>
      </div>

      {/* ── KPI cards ────────────────────────────────────────────────── */}
      <div className="grid gap-3 shrink-0" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 1.6fr 1.6fr' }}>
        {([
          { label: '综合评分',   sublabel: latestAudit?.date ?? '暂无数据', value: overallPct != null ? `${overallPct}%` : '—', accent: overallPct != null ? (overallPct>=80?'#059669':overallPct>=60?'#D97706':'#DC2626') : '#94A3B8', bg: overallPct != null ? (overallPct>=80?'bg-emerald-50':overallPct>=60?'bg-amber-50':'bg-red-50') : 'bg-slate-50' },
          { label: '年度审核',   sublabel: `${thisYear5S} Year-to-Date`,    value: auditCountYTD,                                accent: '#2563EB', bg: 'bg-blue-50' },
          { label: '问题区域',   sublabel: 'Issues Found',                   value: issueCount,                                   accent: issueCount>0?'#DC2626':'#059669', bg: issueCount>0?'bg-red-50':'bg-green-50' },
          { label: '低分区域',   sublabel: 'Score < 60%',                    value: lowCount,                                     accent: lowCount>0?'#D97706':'#059669', bg: lowCount>0?'bg-amber-50':'bg-green-50' },
        ] as { label:string; sublabel:string; value:string|number; accent:string; bg:string }[]).map(({ label, sublabel, value, accent, bg }) => (
          <div key={label} className={cn('rounded-xl px-3 py-3 flex items-center gap-3 border-2', bg)} style={{ borderColor: accent+'33' }}>
            <div className="flex flex-col items-center justify-center rounded-lg w-14 h-14 shrink-0" style={{ backgroundColor: accent+'22' }}>
              <span className="text-2xl font-black tabular-nums leading-none" style={{ color: accent }}>{value}</span>
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <p className="text-xs font-black text-slate-800 leading-tight">{label}</p>
              <p className="text-[10px] font-bold text-slate-400 leading-tight">{sublabel}</p>
            </div>
          </div>
        ))}

        {/* 区域评分 */}
        <div className="rounded-xl p-3 border-2 bg-violet-50 flex flex-col gap-2" style={{ borderColor: '#7C3AED33' }}>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">区域评分 Area</p>
          <div className="flex gap-1.5 flex-1 items-center">
            <div className="flex-1 flex flex-col items-center justify-center rounded-lg py-2" style={{ backgroundColor: '#7C3AED22' }}>
              <span className="text-2xl font-black tabular-nums leading-none text-violet-600">{machineAvg != null ? `${machineAvg}%` : '—'}</span>
              <span className="text-[10px] font-black text-violet-500 mt-1">机器区域</span>
              <span className="text-[9px] font-bold text-violet-300">Machine</span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center rounded-lg py-2" style={{ backgroundColor: '#05966922' }}>
              <span className="text-2xl font-black tabular-nums leading-none text-emerald-600">{otherAvg != null ? `${otherAvg}%` : '—'}</span>
              <span className="text-[10px] font-black text-emerald-500 mt-1">其他区域</span>
              <span className="text-[9px] font-bold text-emerald-300">Other</span>
            </div>
          </div>
        </div>

        {/* 班次评分 */}
        <div className="rounded-xl p-3 border-2 bg-indigo-50 flex flex-col gap-2" style={{ borderColor: '#6366F133' }}>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">班次评分 Shift</p>
          <div className="flex gap-1.5 flex-1 items-center">
            <div className="flex-1 flex flex-col items-center justify-center rounded-lg py-2" style={{ backgroundColor: '#6366F122' }}>
              <span className="text-2xl font-black tabular-nums leading-none text-indigo-600">{amAvg != null ? `${amAvg}%` : '—'}</span>
              <span className="text-[10px] font-black text-indigo-500 mt-1">早班</span>
              <span className="text-[9px] font-bold text-indigo-300">Morning AM</span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center rounded-lg py-2" style={{ backgroundColor: '#EC489922' }}>
              <span className="text-2xl font-black tabular-nums leading-none text-pink-600">{pmAvg != null ? `${pmAvg}%` : '—'}</span>
              <span className="text-[10px] font-black text-pink-500 mt-1">下午班</span>
              <span className="text-[9px] font-bold text-pink-300">Afternoon PM</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main layout: 问题照片 | 良好行为 | AM | PM ────────────────── */}
      {(() => {
        const issuePhotos = areas.flatMap(a => getPhotos(a.id).map(src => ({ area: a, src })));
        const goodPhotos  = areas.flatMap(a => getPhotosGood(a.id).map(src => ({ area: a, src })));

        const photoCol = (
          title: string, titleCls: string, borderCls: string,
          items: { area: FiveSAreaDef; src: string }[], emptyMsg: string
        ) => (
          <div className={cn('flex-1 min-w-0 bg-white rounded-2xl border-2 shadow-sm overflow-hidden flex flex-col', borderCls)}>
            <div className={cn('px-3 py-2.5 border-b border-slate-100 text-[8px] font-black uppercase tracking-widest', titleCls)}>
              {title}{items.length > 0 && <span className="ml-1 text-slate-300">({items.length})</span>}
            </div>
            {items.length > 0 ? (
              <div className="flex flex-col divide-y divide-slate-50 overflow-y-auto flex-1">
                {items.map(({ area, src }, i) => (
                  <div key={`${area.id}-${i}`} className="p-2 flex flex-col gap-1 hover:bg-slate-50/40 transition-colors">
                    <img src={src} alt={area.name}
                      className="w-full rounded-xl object-cover h-28 cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setLightbox(src)} />
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[9px] font-black text-slate-700">{area.name}</span>
                      {area.shift && <span className={cn('text-[7px] font-black px-1 py-0.5 rounded-full', shiftCls(area.shift))}>{area.shift}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 gap-2 text-slate-300">
                <Camera size={20} />
                <span className="text-[8px] font-bold">{emptyMsg}</span>
              </div>
            )}
          </div>
        );

        return (
          <div className="flex gap-3 items-stretch">
            {photoCol('⚠ 问题照片', 'text-red-500', 'border-red-100', issuePhotos, '暂无问题照片')}
            {photoCol('✓ 良好行为', 'text-emerald-600', 'border-emerald-100', goodPhotos, '暂无良好行为照片')}
            {shiftTable('早班 AM', 'text-blue-500', 'border-blue-100', areas.filter(a => a.shift === 'AM'), mode==='audit')}
            {shiftTable('下午班 PM', 'text-orange-500', 'border-orange-100', areas.filter(a => a.shift === 'PM'), mode==='audit')}
          </div>
        );
      })()}

      {mode === 'audit' && (
        <div className="text-[8px] text-slate-400 text-center">
          💡 点击分数徽章循环切换评分 1→2→3→4→5→1 · 点击「+」展开添加问题描述和照片
        </div>
      )}

      {/* ── Trend ───────────────────────────────────────────────────── */}
      {trendData.length > 1 && mode === 'view' && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">历史评分趋势</div>
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={trendData}>
              <XAxis dataKey="date" fontSize={8} axisLine={false} tickLine={false} tick={{ fill:'#94a3b8' }} />
              <YAxis domain={[0,100]} fontSize={8} axisLine={false} tickLine={false} width={24} tick={{ fill:'#94a3b8' }} />
              <Tooltip contentStyle={{ fontSize:10, borderRadius:8 }} formatter={(v: number) => [`${v}%`, '综合评分']} />
              <Line type="monotone" dataKey="score" stroke="#f97316" strokeWidth={2} dot={{ r:3, fill:'#f97316' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionWrapper>
  );
};


// ── Machine downtime log ──────────────────────────────────────────────────
// ── Work Order types (4.3.3 iPad系统维修工单) ────────────────────────────
interface WorkOrder {
  id: string;
  machine: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  isMachineFixed: boolean;
  isMachineWorking: boolean;
  isPlannedDowntime: boolean;
  fitter: string;
  date: string;
  completedDate?: string;
  photos: string[];
  priority: 'urgent' | 'high' | 'medium' | 'low';
  estimatedHours?: number;
  actualHours?: number;
  notes?: string;
}

interface MachineDowntimeEntry {
  id: string;
  timestamp: number;
  date: string;
  machine: string;
  shift: 'AM' | 'PM';
  type: 'breakdown' | 'changeover' | 'maintenance' | 'no_plan';
  duration: number; // minutes
  notes?: string;
}

const MachineSection: React.FC<SectionProps> = ({ color }) => {
  const machines = [
    { name: 'FT-1',  oee: 92, status: 'run'   },
    { name: 'FT-2',  oee: 88, status: 'run'   },
    { name: 'MST',   oee: 74, status: 'warn'  },
    { name: 'PL22',  oee: 0,  status: 'error' },
    { name: 'SL28',  oee: 0,  status: 'idle'  },
    { name: 'SL32',  oee: 81, status: 'run'   },
    { name: 'SL300', oee: 96, status: 'run'   },
    { name: 'Robo',  oee: 98, status: 'run'   },
  ];

  // Machine status overrides (persisted)
  const [machineStatuses, setMachineStatuses] = useState<Record<string,string>>(() => {
    try { return JSON.parse(localStorage.getItem('machineStatuses') || '{}'); } catch { return {}; }
  });
  const [statusModal, setStatusModal] = useState<string | null>(null);
  const [selectedMachinePro, setSelectedMachinePro] = useState<string | null>(null);
  const [isMatrixExpanded, setIsMatrixExpanded] = useState(true);
  const [proPreviewImage, setProPreviewImage] = useState<string | null>(null);
  const [machineProConfig, setMachineProConfig] = useState<Record<string, Record<string, string[]>>>(() => {
    try { return JSON.parse(localStorage.getItem('systemConfig') || '{}'); } catch { return {}; }
  });
  const [quickDt, setQuickDt]         = useState<{ machine:string; dur:number; type:string; shift:'AM'|'PM'; reason:string } | null>(null);

  // ── Work Order state (4.3.3) ──────────────────────────────────────────────
  const [workOrders,    setWorkOrders]    = useState<WorkOrder[]>([]);
  const [woMachine,     setWoMachine]     = useState<string>('all');
  const [woModal,       setWoModal]       = useState(false);
  const [woLightbox,    setWoLightbox]    = useState<string|null>(null);
  const [woEdit,        setWoEdit]        = useState<WorkOrder|null>(null);
  // form state
  const [wfMachine,     setWfMachine]     = useState('FT-1');
  const [wfDesc,        setWfDesc]        = useState('');
  const [wfStatus,      setWfStatus]      = useState<WorkOrder['status']>('pending');
  const [wfFixed,       setWfFixed]       = useState(false);
  const [wfWorking,     setWfWorking]     = useState(true);
  const [wfPlanned,     setWfPlanned]     = useState(false);
  const [wfFitter,      setWfFitter]      = useState('');
  const [wfDate,        setWfDate]        = useState(new Date().toISOString().slice(0,10));
  const [wfPriority,    setWfPriority]    = useState<WorkOrder['priority']>('medium');
  const [wfHours,       setWfHours]       = useState('');
  const [wfActualH,     setWfActualH]     = useState('');
  const [wfNotes,       setWfNotes]       = useState('');
  const [wfPhotos,      setWfPhotos]      = useState<string[]>([]);

  useEffect(() => {
    idbGet<WorkOrder[]>('machineWorkOrders').then(d => { if (d?.length) setWorkOrders(d); });
  }, []);

  const saveWorkOrders = (wo: WorkOrder[]) => { setWorkOrders(wo); idbSet('machineWorkOrders', wo); };

  const resizeWoImg = (file: File): Promise<string> => new Promise(resolve => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 900; let [w,h] = [img.width, img.height];
      if (w > MAX) { h = Math.round(h*MAX/w); w = MAX; }
      const c = document.createElement('canvas'); c.width=w; c.height=h;
      c.getContext('2d')!.drawImage(img,0,0,w,h); URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.75));
    }; img.src = url;
  });

  const openAddWo = (machine?: string) => {
    setWoEdit(null);
    setWfMachine(machine || machines[0].name);
    setWfDesc(''); setWfStatus('pending'); setWfFixed(false); setWfWorking(true);
    setWfPlanned(false); setWfFitter(''); setWfDate(new Date().toISOString().slice(0,10));
    setWfPriority('medium'); setWfHours(''); setWfActualH(''); setWfNotes(''); setWfPhotos([]);
    setWoModal(true);
  };

  const openEditWo = (wo: WorkOrder) => {
    setWoEdit(wo);
    setWfMachine(wo.machine); setWfDesc(wo.description); setWfStatus(wo.status);
    setWfFixed(wo.isMachineFixed); setWfWorking(wo.isMachineWorking); setWfPlanned(wo.isPlannedDowntime);
    setWfFitter(wo.fitter); setWfDate(wo.date); setWfPriority(wo.priority);
    setWfHours(wo.estimatedHours ? String(wo.estimatedHours) : '');
    setWfActualH(wo.actualHours ? String(wo.actualHours) : '');
    setWfNotes(wo.notes ?? ''); setWfPhotos([...wo.photos]);
    setWoModal(true);
  };

  const saveWoForm = () => {
    if (!wfDesc.trim()) return;
    const wo: WorkOrder = {
      id: woEdit?.id ?? `wo-${Date.now()}`,
      machine: wfMachine, description: wfDesc, status: wfStatus,
      isMachineFixed: wfFixed, isMachineWorking: wfWorking, isPlannedDowntime: wfPlanned,
      fitter: wfFitter, date: wfDate,
      completedDate: wfStatus === 'completed' ? (woEdit?.completedDate || new Date().toISOString().slice(0,10)) : undefined,
      photos: wfPhotos, priority: wfPriority,
      estimatedHours: wfHours ? parseFloat(wfHours) : undefined,
      actualHours: wfActualH ? parseFloat(wfActualH) : undefined,
      notes: wfNotes.trim() || undefined,
    };
    if (woEdit) {
      saveWorkOrders(workOrders.map(w => w.id === woEdit.id ? wo : w));
    } else {
      saveWorkOrders([wo, ...workOrders]);
    }
    setWoModal(false);
  };

  const deleteWo = (id: string) => saveWorkOrders(workOrders.filter(w => w.id !== id));

  const PRIORITY_CLR: Record<string,string> = { urgent:'bg-red-500', high:'bg-orange-400', medium:'bg-amber-400', low:'bg-slate-300' };
  const PRIORITY_TXT: Record<string,string> = { urgent:'紧急', high:'高', medium:'中', low:'低' };
  const STATUS_CLR:   Record<string,string> = { completed:'bg-emerald-100 text-emerald-700', in_progress:'bg-blue-100 text-blue-700', pending:'bg-slate-100 text-slate-600' };
  const STATUS_TXT:   Record<string,string> = { completed:'已完成', in_progress:'进行中', pending:'待处理' };

  // ── Supabase / Pro-Maintenance sync ──────────────────────────────────────
  const [maintRecords,    setMaintRecords]    = useState<import('./lib/maintenance-supabase').MaintRecord[]>([]);
  const [supabaseMachines,setSupabaseMachines]= useState<import('./lib/maintenance-supabase').MachineInfo[]>([]);
  const [syncStatus,      setSyncStatus]      = useState<'idle'|'syncing'|'ok'|'err'>('idle');
  const [lastSync,        setLastSync]        = useState<string>('');

  const syncFromMaintenance = async () => {
    setSyncStatus('syncing');
    try {
      const { fetchMaintenanceRecords, fetchMachines } = await import('./lib/maintenance-supabase');
      // Fetch all records (no date filter) to get full machine list & history
      const [recs, machineList] = await Promise.all([
        fetchMaintenanceRecords(),
        fetchMachines(),
      ]);
      setMaintRecords(recs);
      if (machineList.length > 0) setSupabaseMachines(machineList);
      setLastSync(new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' }));
      setSyncStatus('ok');
    } catch { setSyncStatus('err'); }
  };

  const pushToMaintenance = async (entry: { machineName:string; shift:'AM'|'PM'; type:string; duration:number; reason?:string; date:string }) => {
    try {
      const { pushMaintenanceRecord } = await import('./lib/maintenance-supabase');
      await pushMaintenanceRecord(entry);
    } catch (e) { console.error('push to maintenance failed', e); }
  };

  useEffect(() => { syncFromMaintenance(); }, []);

  const getMachineStatus = (name: string) =>
    machineStatuses[name] ?? machines.find(m => m.name === name)?.status ?? 'run';

  const setMachineStatus = (name: string, status: string) => {
    const updated = { ...machineStatuses, [name]: status };
    setMachineStatuses(updated);
    localStorage.setItem('machineStatuses', JSON.stringify(updated));
    setStatusModal(null);
    // Auto-open quick downtime recorder for fault/maintenance
    if (status === 'error' || status === 'warn') {
      const h = new Date().getHours();
      const shift: 'AM'|'PM' = h >= 6 && h < 14 ? 'AM' : 'PM';
      setQuickDt({ machine: name, dur: 30, type: status === 'warn' ? 'maintenance' : 'breakdown', shift, reason: '' });
    }
  };

  const saveQuickDt = () => {
    if (!quickDt || quickDt.dur <= 0) { setQuickDt(null); return; }
    const today = new Date().toISOString().slice(0,10);
    const entry: MachineDowntimeEntry = {
      id: Date.now().toString(), timestamp: Date.now(),
      date: today,
      machine: quickDt.machine, shift: quickDt.shift,
      type: quickDt.type as MachineDowntimeEntry['type'],
      duration: quickDt.dur,
      notes: quickDt.reason.trim() || undefined,
    };
    const updated = [entry, ...dtLogs];
    setDtLogs(updated);
    localStorage.setItem('machineDowntimeLogs', JSON.stringify(updated));
    // Push to Pro-Maintenance Supabase
    pushToMaintenance({ machineName: quickDt.machine, shift: quickDt.shift, type: quickDt.type, duration: quickDt.dur, reason: quickDt.reason || undefined, date: today });
    setQuickDt(null);
  };

  const [dtLogs, setDtLogs] = useState<MachineDowntimeEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('machineDowntimeLogs') || '[]'); } catch { return []; }
  });
  const [addModal, setAddModal] = useState(false);
  const [fMachine,  setFMachine]  = useState(machines[0].name);
  const [fShift,    setFShift]    = useState<'AM'|'PM'>('AM');
  const [fType,     setFType]     = useState<MachineDowntimeEntry['type']>('breakdown');
  const [fDuration, setFDuration] = useState('');
  const [fDate,     setFDate]     = useState(new Date().toISOString().slice(0,10));
  const [fNotes,    setFNotes]    = useState('');

  const saveDtLogs = (logs: MachineDowntimeEntry[]) => {
    setDtLogs(logs); localStorage.setItem('machineDowntimeLogs', JSON.stringify(logs));
  };

  const now = new Date();
  const thisYear = now.getFullYear(); const thisMonth = now.getMonth();
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthLogs = dtLogs.filter(l => { const d = new Date(l.date); return d.getFullYear()===thisYear && d.getMonth()===thisMonth; });

  // Merge Supabase maintenance records into downtime calculation
  const maintDtMins = (name: string) =>
    maintRecords.filter(r => r.machineName === name).reduce((s,r) => s + (r.totalDowntime ?? 0), 0);
  const localDtMins = (name: string) =>
    monthLogs.filter(l => l.machine === name && l.type !== 'no_plan').reduce((s,l) => s + l.duration, 0);
  const combinedDtMins = (name: string) => Math.max(maintDtMins(name), localDtMins(name)); // use whichever is larger

  const totalDtMins  = machines.reduce((s,m) => s + combinedDtMins(m.name), 0);
  const noPlanMins   = monthLogs.filter(l => l.type === 'no_plan').reduce((s,l) => s+l.duration, 0);
  const daysElapsed   = now.getDate();
  const shiftMins     = 8 * 60 - 45;                                        // 8h - 45min break = 435min/shift
  const totalPlanMins = machines.length * daysElapsed * 2 * shiftMins;      // 2 shifts/day
  const uptimePct     = Math.max(0, 100 - totalDtMins / totalPlanMins * 100).toFixed(1);
  const fmtH         = (m: number) => m >= 60 ? `${(m/60).toFixed(1)}h` : `${m}m`;

  const byMachine = machines.map(m => ({ name: m.name, mins: combinedDtMins(m.name) })).sort((a,b)=>b.mins-a.mins);
  const worst = byMachine[0];

  const breakMins = monthLogs.filter(l=>l.type==='breakdown').reduce((s,l)=>s+l.duration,0);
  const changeMins= monthLogs.filter(l=>l.type==='changeover').reduce((s,l)=>s+l.duration,0);
  const maintMins = monthLogs.filter(l=>l.type==='maintenance').reduce((s,l)=>s+l.duration,0);
  const amMins    = monthLogs.filter(l=>l.shift==='AM').reduce((s,l)=>s+l.duration,0);
  const pmMins    = monthLogs.filter(l=>l.shift==='PM').reduce((s,l)=>s+l.duration,0);

  const handleAdd = () => {
    if (!fDuration) return;
    saveDtLogs([{ id:Date.now().toString(), timestamp:Date.now(), date:fDate, machine:fMachine, shift:fShift, type:fType, duration:parseInt(fDuration)||0, notes:fNotes.trim()||undefined }, ...dtLogs]);
    setAddModal(false); setFDuration(''); setFNotes('');
  };

  // ── All machines: hardcoded + Supabase + any that appear in records ──
  const hardcodedNames = new Set(machines.map(m => m.name));
  const allMachines: { name: string }[] = [
    ...machines,
    ...supabaseMachines.filter(m => !hardcodedNames.has(m.name)).map(m => ({ name: m.name })),
  ];
  const knownMachineNames = new Set(allMachines.map(m => m.name));
  [...new Set<string>(maintRecords.map(r => r.machineName))]
    .filter((n): n is string => !!n && !knownMachineNames.has(n))
    .forEach(n => allMachines.push({ name: n }));

  const shiftPlanH = (8 - 45/60) * 2 * new Date().getDate();
  const msNow = new Date();

  return (
    <SectionWrapper title="Machine - Plant Efficiency" icon={Cpu} color={color}>
      {/* Sync status bar */}
      <div className="flex items-center gap-3 text-[9px]">
        <button onClick={syncFromMaintenance} disabled={syncStatus==='syncing'}
          className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all',
            syncStatus==='syncing' ? 'bg-blue-50 text-blue-400' :
            syncStatus==='ok'     ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' :
            syncStatus==='err'    ? 'bg-red-50 text-red-500 hover:bg-red-100' :
            'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200')}>
          <RefreshCw size={11} className={syncStatus==='syncing' ? 'animate-spin' : ''} />
          {syncStatus==='syncing' ? '同步中...' : '同步保养系统'}
        </button>
        {lastSync && <span className="text-slate-400">上次同步 {lastSync} · {maintRecords.length} 条记录</span>}
        {syncStatus==='ok' && <span className="text-emerald-500 font-bold">✓ 已连接 Pro-Maintenance</span>}
        {syncStatus==='err' && <span className="text-red-400">✗ 连接失败</span>}
      </div>
      {/* ── Quick downtime recorder ───────────────────────────── */}
      {quickDt && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setQuickDt(null)}>
          <div className="bg-white rounded-2xl p-5 w-72 shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">⏱ 停机记录</p>
                <p className="text-[16px] font-black text-slate-800">{quickDt.machine}</p>
              </div>
              <button onClick={() => setQuickDt(null)} className="text-slate-300 hover:text-slate-500"><X size={16}/></button>
            </div>

            {/* Quick duration presets */}
            <p className="text-[8px] font-bold text-slate-400 uppercase mb-2">快速选择时长</p>
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {[15, 30, 60, 90].map(m => (
                <button key={m} onClick={() => setQuickDt(q => q ? { ...q, dur: m } : q)}
                  className={cn('py-2 rounded-xl text-[10px] font-black transition-colors',
                    quickDt.dur === m ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                  {m < 60 ? `${m}分` : `${m/60}小时`}
                </button>
              ))}
            </div>

            {/* Custom duration */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[9px] text-slate-400 shrink-0">自定义</span>
              <input type="number" value={quickDt.dur} min={1}
                onChange={e => setQuickDt(q => q ? { ...q, dur: parseInt(e.target.value) || 0 } : q)}
                className="flex-1 text-[11px] font-black border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-slate-400 text-right" />
              <span className="text-[9px] text-slate-400 shrink-0">分钟</span>
            </div>

            {/* Type + Shift */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div>
                <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">类型</p>
                <select value={quickDt.type} onChange={e => setQuickDt(q => q ? { ...q, type: e.target.value } : q)}
                  className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-slate-400">
                  <option value="breakdown">故障</option>
                  <option value="maintenance">保养</option>
                  <option value="changeover">换模</option>
                  <option value="no_plan">No Plan</option>
                </select>
              </div>
              <div>
                <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">班次</p>
                <select value={quickDt.shift} onChange={e => setQuickDt(q => q ? { ...q, shift: e.target.value as 'AM'|'PM' } : q)}
                  className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-slate-400">
                  <option value="AM">早班 AM</option>
                  <option value="PM">下午班 PM</option>
                </select>
              </div>
            </div>

            {/* Reason input */}
            <div>
              <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">故障原因</p>
              <input
                type="text"
                value={quickDt.reason}
                onChange={e => setQuickDt(q => q ? { ...q, reason: e.target.value } : q)}
                placeholder="简述故障原因（可选）"
                className="w-full text-[11px] border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-slate-400 placeholder:text-slate-300"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button onClick={() => setQuickDt(null)}
                className="flex-1 py-2 rounded-xl border border-slate-200 text-[10px] font-bold text-slate-400 hover:bg-slate-50">
                跳过
              </button>
              <button onClick={saveQuickDt}
                className="flex-2 px-5 py-2 rounded-xl bg-red-500 text-white text-[10px] font-black hover:bg-red-600 transition-colors">
                保存记录 ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Downtime log modal ────────────────────────────────── */}
      {addModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setAddModal(false)}>
          <div className="bg-white rounded-2xl p-5 w-80 shadow-2xl flex flex-col gap-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800">记录停机</h3>
              <button onClick={() => setAddModal(false)} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[8px] font-bold text-slate-400 uppercase mb-0.5">机器</div>
                <select value={fMachine} onChange={e=>setFMachine(e.target.value)} className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400">
                  {machines.map(m=><option key={m.name}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <div className="text-[8px] font-bold text-slate-400 uppercase mb-0.5">班次</div>
                <select value={fShift} onChange={e=>setFShift(e.target.value as 'AM'|'PM')} className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400">
                  <option value="AM">早班 AM</option><option value="PM">下午班 PM</option>
                </select>
              </div>
            </div>
            <div>
              <div className="text-[8px] font-bold text-slate-400 uppercase mb-0.5">停机类型</div>
              <select value={fType} onChange={e=>setFType(e.target.value as MachineDowntimeEntry['type'])} className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400">
                <option value="breakdown">故障 Breakdown</option>
                <option value="changeover">换模 Changeover</option>
                <option value="maintenance">保养 Maintenance</option>
                <option value="no_plan">No Plan</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[8px] font-bold text-slate-400 uppercase mb-0.5">时长（分钟）</div>
                <input type="number" value={fDuration} onChange={e=>setFDuration(e.target.value)} placeholder="60" className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <div className="text-[8px] font-bold text-slate-400 uppercase mb-0.5">日期</div>
                <input type="date" value={fDate} onChange={e=>setFDate(e.target.value)} className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400" />
              </div>
            </div>
            <div>
              <div className="text-[8px] font-bold text-slate-400 uppercase mb-0.5">备注（可选）</div>
              <input type="text" value={fNotes} onChange={e=>setFNotes(e.target.value)} placeholder="原因说明..." className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400" />
            </div>
            <button onClick={handleAdd} className="w-full py-2 rounded-xl bg-slate-800 text-white text-[10px] font-black hover:bg-slate-700 transition-colors">保存记录</button>
            {monthLogs.length > 0 && (
              <div className="border-t border-slate-100 pt-2 max-h-32 overflow-y-auto">
                {[...monthLogs].slice(0,8).map(l => (
                  <div key={l.id} className="flex items-center justify-between text-[8px] text-slate-400 py-0.5">
                    <span>{l.date} {l.machine} {l.shift}</span>
                    <span className="text-slate-500 font-bold">{l.type === 'no_plan' ? 'No Plan' : l.type === 'breakdown' ? '故障' : l.type === 'changeover' ? '换模' : '保养'} {fmtH(l.duration)}</span>
                    <button onClick={() => saveDtLogs(dtLogs.filter(x=>x.id!==l.id))} className="text-red-400 hover:text-red-600 ml-1">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── KPI card strip ────────────────────────────────────── */}
      <div className="grid gap-3 shrink-0" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 1.6fr 1.6fr' }}>
        {([
          { label:'开机率',   sublabel:`(计划 ${shiftMins}min/班 × 2班) MTD`,   value:`${uptimePct}%`, accent: parseFloat(uptimePct)>=90?'#059669':parseFloat(uptimePct)>=75?'#D97706':'#DC2626', bg: parseFloat(uptimePct)>=90?'bg-green-50':parseFloat(uptimePct)>=75?'bg-amber-50':'bg-red-50' },
          { label:'停机时间', sublabel:`${MONTH_NAMES[thisMonth]} Total`,  value: fmtH(totalDtMins), accent: totalDtMins>0?'#DC2626':'#059669', bg: totalDtMins>0?'bg-red-50':'bg-green-50' },
          { label:'No Plan', sublabel:`${MONTH_NAMES[thisMonth]} Total`,   value: fmtH(noPlanMins),  accent: noPlanMins>0?'#D97706':'#059669', bg: noPlanMins>0?'bg-amber-50':'bg-green-50' },
          { label:'停机最多', sublabel: worst.mins>0 ? `${fmtH(worst.mins)} this month` : 'No downtime recorded', value: worst.mins>0 ? worst.name : '—', accent: worst.mins>0?'#DC2626':'#059669', bg: worst.mins>0?'bg-red-50':'bg-green-50' },
        ] as { label:string; sublabel:string; value:string; accent:string; bg:string }[]).map(({ label, sublabel, value, accent, bg }) => (
          <div key={label} className={cn('rounded-xl px-3 py-3 flex items-center gap-3 border-2', bg)} style={{ borderColor: accent+'33' }}>
            <button onClick={() => setAddModal(true)}
              className="flex flex-col items-center justify-center rounded-lg w-14 h-14 shrink-0 hover:brightness-95 transition-all"
              style={{ backgroundColor: accent+'22' }}>
              <span className="text-xl font-black tabular-nums leading-none" style={{ color: accent }}>{value}</span>
            </button>
            <div className="flex flex-col gap-0.5 min-w-0">
              <p className="text-xs font-black text-slate-800 leading-tight">{label}</p>
              <p className="text-[10px] font-bold text-slate-400 leading-tight">{sublabel}</p>
            </div>
          </div>
        ))}

        {/* 停机原因 CAUSE */}
        <div className="rounded-xl p-3 border-2 bg-slate-50 flex flex-col gap-2" style={{ borderColor: '#47556933' }}>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">停机原因 Cause</p>
          <div className="flex gap-1.5 flex-1 items-center">
            {[
              { label:'故障', sub:'Breakdown',   mins: breakMins,  color:'#DC2626' },
              { label:'换模', sub:'Changeover',  mins: changeMins, color:'#D97706' },
              { label:'保养', sub:'Maintenance', mins: maintMins,  color:'#7C3AED' },
            ].map(({ label, sub, mins, color }) => (
              <button key={label} onClick={() => setAddModal(true)}
                className="flex-1 flex flex-col items-center justify-center rounded-lg py-2 hover:brightness-95 transition-all"
                style={{ backgroundColor: color+'15' }}>
                <span className="text-lg font-black tabular-nums leading-none" style={{ color }}>{fmtH(mins)}</span>
                <span className="text-[10px] font-black mt-1" style={{ color }}>{label}</span>
                <span className="text-[9px] font-bold" style={{ color: color+'88' }}>{sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 班次 SHIFT */}
        <div className="rounded-xl p-3 border-2 bg-indigo-50 flex flex-col gap-2" style={{ borderColor: '#6366F133' }}>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">班次停机 Shift</p>
          <div className="flex gap-1.5 flex-1 items-center">
            <button onClick={() => setAddModal(true)} className="flex-1 flex flex-col items-center justify-center rounded-lg py-2 hover:brightness-95 transition-all" style={{ backgroundColor:'#6366F122' }}>
              <span className="text-lg font-black tabular-nums leading-none text-indigo-600">{fmtH(amMins)}</span>
              <span className="text-[10px] font-black text-indigo-500 mt-1">早班</span>
              <span className="text-[9px] font-bold text-indigo-300">Morning AM</span>
            </button>
            <button onClick={() => setAddModal(true)} className="flex-1 flex flex-col items-center justify-center rounded-lg py-2 hover:brightness-95 transition-all" style={{ backgroundColor:'#EC489922' }}>
              <span className="text-lg font-black tabular-nums leading-none text-pink-600">{fmtH(pmMins)}</span>
              <span className="text-[10px] font-black text-pink-500 mt-1">下午班</span>
              <span className="text-[9px] font-bold text-pink-300">Afternoon PM</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Factory floor plan ───────────────────────────────── */}
      {(() => {
        const st = getMachineStatus;
        const clr = (status: string): { bg: string; fg: string } => ({
          run:   { bg: '#10b981', fg: '#fff' },
          warn:  { bg: '#f59e0b', fg: '#fff' },
          error: { bg: '#ef4444', fg: '#fff' },
          idle:  { bg: '#cbd5e1', fg: '#64748b' },
        }[status] ?? { bg: '#cbd5e1', fg: '#64748b' });

        const Machine = ({ name, x, y, w, h, rotate }: { name:string;x:number;y:number;w:number;h:number;rotate?:boolean }) => {
          const { bg, fg } = clr(st(name));
          return (
            <div
              onClick={() => setStatusModal(name)}
              style={{ position:'absolute', left:x, top:y, width:w, height:h, backgroundColor:bg, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 4px rgba(0,0,0,.15)', cursor:'pointer' }}
              title={`点击设置 ${name} 状态`}
            >
              <span style={{ color:fg, fontSize:11, fontWeight:900, writingMode: rotate ? 'vertical-rl' : undefined, transform: rotate ? 'rotate(180deg)' : undefined }}>{name}</span>
            </div>
          );
        };

        const Conv = ({ x, y, h, label }: { x:number;y:number;h:number;label?:string }) => {
          const id = label ?? 'crane';
          const { bg } = clr(st(id));
          return (
            <div onClick={() => setStatusModal(id)} title={`点击设置 ${id} 状态`}
              style={{ position:'absolute', left:x, top:y, width:18, height:h, backgroundColor:bg, borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 3px rgba(0,0,0,.2)', cursor:'pointer' }}>
              {label && <span style={{ color:'rgba(255,255,255,.85)', fontSize:7, fontWeight:700, writingMode:'vertical-rl', transform:'rotate(180deg)' }}>{label}</span>}
            </div>
          );
        };

        const Room = ({ name, x, y, w, h, bg='#f8fafc', border='#e2e8f0' }: { name:string;x:number;y:number;w:number;h:number;bg?:string;border?:string }) => (
          <div style={{ position:'absolute', left:x, top:y, width:w, height:h, backgroundColor:bg, border:`1px solid ${border}`, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:700, color:'#64748b' }}>{name}</div>
        );

        const Forklift = ({ name, x, y }: { name:string;x:number;y:number }) => {
          const { bg } = clr(st(name));
          return (
            <div onClick={() => setStatusModal(name)} title={`点击设置 ${name} 状态`}
              style={{ position:'absolute', left:x, top:y, width:68, height:62, backgroundColor:bg, borderRadius:8, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, boxShadow:'0 2px 4px rgba(0,0,0,.2)', cursor:'pointer' }}>
              <Truck size={18} color="white" />
              <span style={{ color:'white', fontSize:8, fontWeight:900 }}>{name}</span>
            </div>
          );
        };


        const Bundle = ({ x, y, w, h }: { x:number;y:number;w:number;h:number }) => (
          <div style={{ position:'absolute', left:x, top:y, width:w, height:h, backgroundColor:'white', border:'1px solid #e2e8f0', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:7, fontWeight:700, color:'#94a3b8' }}>BUNDLE<br/>AREA</div>
        );

        const Gate = ({ label, x, y }: { label:string;x:number;y:number }) => (
          <div style={{ position:'absolute', left:x, top:y, fontSize:8, fontWeight:900, color:'#94a3b8', letterSpacing:1 }}>{label}</div>
        );

        const Sep = ({ y }: { y:number }) => (
          <div style={{ position:'absolute', left:0, top:y, right:0, height:1, borderTop:'2px dashed #cbd5e1' }} />
        );

        const STATUS_OPTIONS = [
          { status: 'run',   label: '正常运行',      sublabel: 'Running',     bg: '#10b981', icon: '✅' },
          { status: 'error', label: '停机',          sublabel: 'Fault/Down',  bg: '#ef4444', icon: '🔴' },
          { status: 'warn',  label: '维修保养',      sublabel: 'Maintenance', bg: '#f59e0b', icon: '🟡' },
          { status: 'idle',  label: '无生产计划',    sublabel: 'No Plan',     bg: '#94a3b8', icon: '⬜' },
        ];

        return (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden shrink-0 relative">
            {/* Status picker modal */}
            {statusModal && (
              <div className="absolute inset-0 z-20 bg-black/30 flex items-center justify-center rounded-2xl" onClick={() => setStatusModal(null)}>
                <div className="bg-white rounded-2xl shadow-2xl p-4 w-64" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">机器状态</p>
                      <p className="text-[14px] font-black text-slate-800">{statusModal}</p>
                    </div>
                    <button onClick={() => setStatusModal(null)} className="text-slate-300 hover:text-slate-500"><X size={14}/></button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {STATUS_OPTIONS.map(opt => {
                      const current = st(statusModal) === opt.status;
                      return (
                        <button key={opt.status} onClick={() => setMachineStatus(statusModal, opt.status)}
                          className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all',
                            current ? 'ring-2 ring-offset-1' : 'hover:bg-slate-50')}
                          style={current ? { ringColor: opt.bg } : {}}>
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: opt.bg }}>
                            <span className="text-white font-black text-[10px]">{current ? '✓' : ''}</span>
                          </div>
                          <div>
                            <p className="text-[11px] font-black text-slate-800 leading-none">{opt.icon} {opt.label}</p>
                            <p className="text-[9px] text-slate-400 mt-0.5">{opt.sublabel}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Factory Layout — 车间平面图 <span className="text-slate-300 font-normal">点击机器设置状态</span></span>
              <div className="flex gap-3 text-[8px] text-slate-400">
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500"/>Running</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500"/>Fault</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-400"/>Maintenance</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-slate-300"/>No Plan</span>
              </div>
            </div>
            <div className="overflow-x-auto" style={{height: 510}}>
              <div style={{ position:'relative', width:1440, height:510, backgroundColor:'#f0f4ff' }}>

                {/* ── Zone backgrounds ── */}
                <div style={{ position:'absolute', left:0, top:0, right:0, height:205, backgroundColor:'#eff6ff' }} />
                <div style={{ position:'absolute', left:0, top:210, right:0, height:205, backgroundColor:'#eff6ff' }} />
                <div style={{ position:'absolute', left:0, top:420, right:0, height:90, backgroundColor:'#f8fafc' }} />

                {/* ── Separators ── */}
                <Sep y={206} />
                <Sep y={416} />

                {/* ═══════════ TOP ZONE: SL Lines ═══════════ */}

                <Conv x={42}   y={22} h={165} label="C11" />
                <Bundle x={70}  y={22} w={130} h={165} />
                <Conv x={210}  y={22} h={165} label="C12" />
                <Machine name="SL28"  x={238} y={22} w={220} h={145} />
                <Conv x={468}  y={22} h={165} label="C13" />

                <Conv x={548}  y={22} h={165} label="C14" />
                <Bundle x={576} y={28} w={130} h={155} />
                <Conv x={716}  y={22} h={165} label="C14" />

                <Conv x={760}  y={22} h={165} label="C15" />
                <Machine name="SL32"  x={788} y={22} w={295} h={145} />
                <Forklift name="HYSTER" x={1098} y={22} />
                <Forklift name="JCB"   x={1098} y={96} />
                <Conv x={1176} y={22} h={165} label="C16" />
                <Bundle x={1204} y={22} w={148} h={165} />
                <Conv x={1362} y={22} h={165} label="C17" />

                {/* ═══════════ MIDDLE ZONE: Production ═══════════ */}

                <Machine name="FT-2"  x={18}  y={232} w={62} h={165} rotate />
                <Conv    x={90}  y={232} h={165} label="D11" />
                <Machine name="PL22" x={118}  y={236} w={210} h={155} />
                <Conv    x={338} y={232} h={165} label="D22" />

                <Conv    x={458} y={232} h={165} label="D23" />
                <Machine name="FT-1"  x={486}  y={252} w={110} h={130} />
                <Machine name="MST"   x={606}  y={252} w={120} h={130} />
                <Conv    x={736} y={232} h={165} label="D22" />

                <Machine name="Threading" x={786} y={252} w={95}  h={75} />
                <Machine name="Robo"  x={892}  y={252} w={95}  h={75} />
                <Machine name="SL300" x={892}  y={338} w={195} h={65} />
                <Conv    x={1097} y={232} h={165} label="D33" />
                <Bundle  x={1125} y={232} w={155} h={165} />
                <Conv    x={1290} y={232} h={165} label="D44" />

                {/* ═══════════ BOTTOM ZONE: Facilities ═══════════ */}
                <Room name="WC"      x={62}  y={435} w={65}  h={45} />
                <Room name="LOCKER"  x={136} y={435} w={80}  h={45} />
                <Room name="LUNCH"   x={226} y={435} w={75}  h={45} />
                <Forklift name="TOYOTA" x={368} y={428} />

                <Room name="MEETING" x={552} y={435} w={92}  h={45} />
                <Room name="OFFICE"  x={654} y={435} w={78}  h={45} />
                <Room name="FITTING" x={742} y={435} w={78}  h={45} />

                <Room name="WAREHOUSE / ACC STOCK" x={980} y={432} w={195} h={50} bg="#e0f2fe" border="#7dd3fc" />
                <Forklift name="NISSAN" x={1188} y={428} />

                {/* Gates */}
                <Gate label="GATE 1" x={155} y={495} />
                <Gate label="GATE 2" x={575} y={495} />
                <Gate label="GATE 3" x={910} y={495} />
                <Gate label="GATE 5" x={1350} y={495} />

              </div>
            </div>

            {/* ── Maintenance Logs ── */}
            <div className="border-t border-slate-200">
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 flex-wrap">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Maintenance Logs — 维修记录</span>
                <div className="flex gap-1 flex-wrap ml-1">
                  {(["all",...allMachines.map(m=>m.name)] as string[]).map(name=>(
                    <button key={name} onClick={()=>setWoMachine(name)} className={cn("text-[8px] px-2 py-0.5 rounded-full font-bold transition-colors", woMachine===name?"bg-slate-800 text-white":"bg-slate-100 text-slate-500 hover:bg-slate-200")}>{name==="all"?"全部":name}</button>
                  ))}
                </div>
                <span className="text-[8px] text-slate-300 ml-auto">{maintRecords.filter(r=>woMachine==="all"||r.machineName===woMachine).length} 条</span>
              </div>
              {maintRecords.length > 0 ? (
                <div className="overflow-x-auto" style={{maxHeight:300,overflowY:"auto"}}>
                  <table className="w-full text-[9px]">
                    <thead style={{position:"sticky",top:0,zIndex:1}}><tr className="border-b border-slate-100 bg-slate-50">{["日期","班次","机器","故障区域","类型","难度","停机(h)","维修结果","机器状态","技术员"].map(h=><th key={h} className="text-left px-3 py-2 font-bold text-slate-400 whitespace-nowrap">{h}</th>)}</tr></thead>
                    <tbody>{maintRecords.filter(r=>woMachine==="all"||r.machineName===woMachine).slice(0,100).map((r,i)=>(
                      <tr key={r.id} className={cn("border-t border-slate-50 hover:bg-slate-50/60",i%2===1?"bg-slate-50/20":"")}>
                        <td className="px-3 py-1.5 font-bold text-slate-700 whitespace-nowrap">{r.date}</td>
                        <td className="px-3 py-1.5"><span className={cn("px-1.5 py-0.5 rounded-full text-[7px] font-black",r.shift==="AM"?"bg-blue-100 text-blue-700":"bg-amber-100 text-amber-700")}>{r.shift||"—"}</span></td>
                        <td className="px-3 py-1.5 font-black text-slate-800 whitespace-nowrap">{r.machineName}</td>
                        <td className="px-3 py-1.5 text-slate-600 max-w-[120px] truncate">{r.faultArea||"—"}</td>
                        <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{r.maintenanceType||"—"}</td>
                        <td className="px-3 py-1.5">{r.difficulty?<span className={cn("font-black",r.difficulty<=2?"text-emerald-600":r.difficulty<=3?"text-amber-500":"text-red-500")}>L{r.difficulty}</span>:"—"}</td>
                        <td className={cn("px-3 py-1.5 font-black tabular-nums",r.totalDowntime>0?"text-red-500":"text-slate-400")}>{r.totalDowntime>0?r.totalDowntime.toFixed(1):"—"}</td>
                        <td className="px-3 py-1.5">{r.repairResult?<span className={cn("px-1.5 py-0.5 rounded text-[7px] font-bold",({Fixed:"bg-emerald-100 text-emerald-700",Temporary:"bg-amber-100 text-amber-700","Not Fixed":"bg-red-100 text-red-600",Observation:"bg-blue-100 text-blue-700"} as Record<string,string>)[r.repairResult]??"bg-slate-100 text-slate-500")}>{r.repairResult}</span>:"—"}</td>
                        <td className="px-3 py-1.5">{r.machineStatusAfter?<span className={cn("px-1.5 py-0.5 rounded text-[7px] font-bold",r.machineStatusAfter==="Running"?"bg-emerald-100 text-emerald-700":r.machineStatusAfter==="Restricted"?"bg-amber-100 text-amber-700":"bg-red-100 text-red-600")}>{r.machineStatusAfter}</span>:"—"}</td>
                        <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{r.technician||"—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-slate-300 gap-2 bg-white">
                  <History size={20}/><span className="text-[9px] font-bold">暂无记录 — 点击「同步保养系统」加载</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ══ Machine Status — Pro Style (faithful port from Pro-Maintenance) ══ */}
      {(() => {
        // ── Helpers ─────────────────────────────────────────────────────────
        const isForklift = (name: string) => {
          const n = name.toLowerCase();
          return n.includes('forklift') || n.includes('叉车') || n.includes('toyota') || n.includes('nissan') || n.includes('hyster') || n === 'jcb';
        };
        const isCrane = (name: string) => {
          const n = name.toLowerCase();
          return n.includes('crane') || n.includes('行车') || n.includes('天车') || /^[gc]\d+/.test(n);
        };
        const getCraneBay = (name: string): 1 | 2 | 0 => {
          const n = name.toUpperCase();
          if (/^G[1-5]($|\s)/.test(n) || /^C1[1-6]($|\s)/.test(n)) return 1;
          if (/^C2[1-6]($|\s)/.test(n)) return 2;
          return 0;
        };

        // ── calculateHealth (adapted to Production-Dashboard MaintRecord) ──
        const calculateHealth = (machine: string) => {
          const machineRecords = maintRecords.filter(r => r.machineName === machine);
          const machineSpecificConfig = (machineProConfig[machine] || machineProConfig['DEFAULT_TEMPLATE'] || {}) as Record<string, string[]>;
          const now = new Date();
          const calcStart = new Date(localStorage.getItem('app_calc_start_date') || '2025-01-01');

          const statsByMonth: Record<string, { scheduled: number; downtime: number; plannedOff: number; yr: number; mo: number }> = {};
          let aggregatePlannedOff = 0;
          let aggregateDowntime = 0;

          machineRecords.forEach(r => {
            const d = new Date(r.date);
            const yr = d.getFullYear(); const mo = d.getMonth() + 1;
            const mKey = `${yr}-${String(mo).padStart(2,'0')}`;
            if (!statsByMonth[mKey]) statsByMonth[mKey] = { scheduled:0, downtime:0, plannedOff:0, yr, mo };
            const isPlanned = r.maintenanceType === 'Non-Production' || r.maintenanceType === 'NON_PRODUCTION';
            if (isPlanned) {
              statsByMonth[mKey].plannedOff += (r.repairTime || 0);
              aggregatePlannedOff += (r.repairTime || 0);
            } else {
              statsByMonth[mKey].downtime += (r.totalDowntime || 0);
              aggregateDowntime += (r.totalDowntime || 0);
            }
          });

          const diffDays = Math.max(1, Math.ceil((now.getTime() - calcStart.getTime()) / 86400000));
          const aggregateCalendar = diffDays * 14.5;

          const allTimeHistory = Object.keys(statsByMonth).sort().map(key => {
            const s = statsByMonth[key];
            const daysInMonth = new Date(s.yr, s.mo, 0).getDate();
            const calendarHrs = daysInMonth * 14.5;
            const scheduled = calendarHrs - s.plannedOff;
            const availability = scheduled > 0 ? Math.max(0, Math.min(100, ((scheduled - s.downtime) / scheduled) * 100)) : 0;
            return {
              monthKey: key, year: s.yr, month: s.mo,
              label: `${new Date(s.yr, s.mo-1).toLocaleString('default', {month:'short'})} ${String(s.yr).slice(2)}`,
              availability: parseFloat(availability.toFixed(1)),
              scheduled, downtime: s.downtime, plannedOff: s.plannedOff,
            };
          });

          const currentMKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
          const curData = allTimeHistory.find(h => h.monthKey === currentMKey) || { availability: 0 };

          const systems: { name:string; score:number; status:'Good'|'Warning'|'Critical'; components:{name:string;score:number;riskLevel:string;issueCount:number;deductions:{type:string;val:number;label:string}[]}[] }[] = [];
          const ninetyDaysAgo = new Date(); ninetyDaysAgo.setDate(now.getDate() - 90);

          (Object.entries(machineSpecificConfig) as [string, string[]][]).forEach(([sysName, componentNames]) => {
            const components: typeof systems[0]['components'] = [];
            let sysScoreSum = 0;
            componentNames.forEach(compName => {
              const compRecords = machineRecords.filter(r =>
                r.faultArea === compName && new Date(r.date) >= ninetyDaysAgo &&
                r.maintenanceType !== 'Non-Production' && r.maintenanceType !== 'NON_PRODUCTION'
              );
              let score = 100;
              const deductions: typeof systems[0]['components'][0]['deductions'] = [];
              const freqDec = Math.min(20, compRecords.length * 5);
              if (freqDec > 0) { score -= freqDec; deductions.push({ type:'FREQ', val:freqDec, label:`Frequency (-${freqDec})` }); }
              const sorted = [...compRecords].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
              if (sorted.length > 0) {
                const daysSince = Math.floor((now.getTime() - new Date(sorted[0].date).getTime()) / 86400000);
                const recDec = daysSince<=7?15:daysSince<=30?10:daysSince<=90?5:0;
                if (recDec > 0) { score -= recDec; deductions.push({ type:'TIME', val:recDec, label:`Recency: ${daysSince}d ago (-${recDec})` }); }
                const diff = Number(sorted[0].difficulty);
                const complexDec = diff===2?3:diff===3?6:diff===4?10:diff===5?15:0;
                if (complexDec > 0) { score -= complexDec; deductions.push({ type:'DIFF', val:complexDec, label:`Complexity: L${diff} (-${complexDec})` }); }
              }
              score = Math.max(0, score);
              const riskLevel = score<50?'Critical':score<70?'Warning':score<85?'Monitor':'Healthy';
              components.push({ name:compName, score, riskLevel, issueCount:compRecords.length, deductions });
              sysScoreSum += score;
            });
            const sysAvg = componentNames.length > 0 ? Math.round(sysScoreSum / componentNames.length) : 100;
            systems.push({ name:sysName, score:sysAvg, status:sysAvg<50?'Critical':sysAvg<70?'Warning':'Good', components: components.sort((a,b)=>a.score-b.score) });
          });

          const totalScheduled = aggregateCalendar - aggregatePlannedOff;
          const globalAvailability = totalScheduled > 0 ? ((totalScheduled - aggregateDowntime) / totalScheduled) * 100 : 100;
          const latestRecord = [...machineRecords].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
          let machineStatusCalc: 'Running'|'Down'|'Warning'|'Idle' = 'Running';
          if (latestRecord?.machineStatusAfter === 'Down') machineStatusCalc = 'Down';
          else if (globalAvailability < 85) machineStatusCalc = 'Warning';

          return {
            status: machineStatusCalc,
            currentMonthAvailability: curData.availability.toFixed(1),
            allTimeHistory, systems,
            plannedRecords: machineRecords.filter(r => r.maintenanceType==='Non-Production'||r.maintenanceType==='NON_PRODUCTION').sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()),
            downtimeRecords: machineRecords.filter(r => r.totalDowntime > 0 && r.maintenanceType !== 'Non-Production').sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()),
            totalCalendarHours: parseFloat(aggregateCalendar.toFixed(1)),
            totalPlannedOffHours: aggregatePlannedOff,
            totalScheduledHours: parseFloat(totalScheduled.toFixed(1)),
            totalDowntimeHours: aggregateDowntime,
            globalAvailability: parseFloat(globalAvailability.toFixed(1)),
          };
        };

        // ── MachineCard ──────────────────────────────────────────────────────
        const MachineCardPro = ({ m }: { m: string }) => {
          const health = calculateHealth(m);
          const avgScore = health.systems.length > 0 ? Math.round(health.systems.reduce((a,b)=>a+b.score,0)/health.systems.length) : 100;
          const isFk = isForklift(m); const isCr = isCrane(m);
          const machinePhoto = supabaseMachines.find(s => s.name === m)?.imageUrl;
          return (
            <div onClick={() => setSelectedMachinePro(m)}
              className={cn('group bg-white rounded-xl border-2 transition-all cursor-pointer flex flex-col shadow-sm hover:shadow-xl hover:-translate-y-1 overflow-hidden hover:border-blue-400 relative',
                health.status==='Down'?'border-red-200':health.status==='Idle'?'border-slate-100':health.status==='Warning'?'border-orange-200':'border-slate-200')}>
              {/* Image */}
              <div className="h-28 bg-slate-50 relative overflow-hidden border-b border-slate-100 flex items-center justify-center">
                {machinePhoto
                  ? <img src={machinePhoto} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" alt={m}/>
                  : <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-1 bg-white/30">
                      <div className="w-5 h-5 bg-slate-200 rounded animate-pulse"/>
                      <span className="text-[7px] font-black uppercase tracking-tighter opacity-30">Asset Visual</span>
                    </div>
                }
              </div>
              {/* Status bar */}
              <div className={cn('px-4 py-2 flex justify-between items-center border-b',
                health.status==='Down'?'bg-red-50':health.status==='Idle'?'bg-slate-50':health.status==='Warning'?'bg-orange-50':'bg-slate-50/50')}>
                <div className="flex items-center gap-2 min-w-0">
                  {isFk ? <Truck className={cn('w-4 h-4 shrink-0', health.status==='Down'?'text-red-500':health.status==='Idle'?'text-slate-400':'text-orange-600')}/>
                        : isCr ? <Hammer className={cn('w-4 h-4 shrink-0', health.status==='Down'?'text-red-500':health.status==='Idle'?'text-slate-400':'text-indigo-600')}/>
                               : <Monitor className={cn('w-4 h-4 shrink-0', health.status==='Down'?'text-red-500':health.status==='Idle'?'text-slate-400':'text-orange-600')}/>}
                  <h3 className="text-xs font-bold text-slate-800 truncate uppercase tracking-tight">{m}</h3>
                </div>
                <div className={cn('w-2.5 h-2.5 rounded-full shrink-0',
                  health.status==='Down'?'bg-red-500 animate-pulse':health.status==='Idle'?'bg-slate-300':health.status==='Warning'?'bg-orange-500':'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]')}/>
              </div>
              {/* Metrics */}
              <div className="px-4 py-2.5 space-y-1.5">
                <div className="flex justify-between items-center text-[9px]">
                  <span className="font-bold text-slate-400 uppercase">Avail: <span className={health.globalAvailability<85?'text-red-600':'text-slate-700'}>{health.globalAvailability}%</span></span>
                  <span className="font-bold text-slate-400 uppercase">Health: <span className={avgScore<85?'text-orange-600':'text-slate-700'}>{avgScore}%</span></span>
                </div>
                <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all duration-1000', avgScore<50?'bg-red-500':avgScore<85?'bg-orange-500':'bg-emerald-500')} style={{width:`${avgScore}%`}}/>
                </div>
              </div>
            </div>
          );
        };

        // ── CategoryHeader ───────────────────────────────────────────────────
        const CategoryHeader = ({ title, IconC, color, description }: { title:string; IconC:React.FC<{className?:string}>; color:string; description?:string }) => (
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm', color)}>
                <IconC className="w-5 h-5"/>
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">{title}</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{description||'Factory Operations Asset Group'}</p>
              </div>
            </div>
          </div>
        );

        // ── Machine groups ───────────────────────────────────────────────────
        const machineNames = allMachines.map(m => m.name);
        const forkliftMachines = machineNames.filter(isForklift);
        const craneMachines    = machineNames.filter(isCrane);
        const prodMachines     = machineNames.filter(m => !isForklift(m) && !isCrane(m));

        return (
          <>
            {/* ── Machine card grid ─────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden shrink-0">
              <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-100">
                <div className="p-3 bg-blue-50 rounded-xl text-blue-600"><Activity size={20}/></div>
                <div>
                  <h2 className="text-base font-black text-slate-800 uppercase tracking-tight">Reliability Monitor</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Predictive Engineering & Machine Health Hub</p>
                </div>
              </div>
              <div className="p-6 space-y-10">
                {prodMachines.length > 0 && (
                  <div className="space-y-4">
                    <CategoryHeader title="生产设备 (Production)" IconC={({className}) => <Monitor className={className}/>} color="bg-blue-600"/>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-6">
                      {prodMachines.map(m => <MachineCardPro key={m} m={m}/>)}
                    </div>
                  </div>
                )}
                {forkliftMachines.length > 0 && (
                  <div className="space-y-4">
                    <CategoryHeader title="物流叉车 (Logistics)" IconC={({className}) => <Truck className={className}/>} color="bg-orange-600"/>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-6">
                      {forkliftMachines.map(m => <MachineCardPro key={m} m={m}/>)}
                    </div>
                  </div>
                )}
                {craneMachines.length > 0 && (
                  <div className="space-y-4">
                    <CategoryHeader title="车间行车 (Cranes)" IconC={({className}) => <Hammer className={className}/>} color="bg-indigo-600"/>
                    <div className="space-y-6">
                      {[1,2].map(bay => {
                        const bayMachines = craneMachines.filter(m => getCraneBay(m) === bay);
                        if (!bayMachines.length) return null;
                        return (
                          <div key={bay} className="bg-slate-50/50 p-6 rounded-xl border border-slate-100">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                              <div className="w-1.5 h-3 bg-indigo-400 rounded-full"/> Bay {bay} Section
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-6">
                              {bayMachines.map(m => <MachineCardPro key={m} m={m}/>)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Machine detail modal ──────────────────────────────────────── */}
            <AnimatePresence>
              {selectedMachinePro && (() => {
                const h = calculateHealth(selectedMachinePro);
                const isFk = isForklift(selectedMachinePro); const isCr = isCrane(selectedMachinePro);
                const avgScore = h.systems.length > 0 ? Math.round(h.systems.reduce((a,b)=>a+b.score,0)/h.systems.length) : 100;
                return (
                  <motion.div key="pro-modal" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 overflow-y-auto"
                    onClick={() => setSelectedMachinePro(null)}>
                    <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.95,opacity:0}}
                      className="bg-white rounded-xl shadow-2xl w-full max-w-6xl my-auto border border-slate-200 overflow-hidden flex flex-col max-h-[95vh]"
                      onClick={e => e.stopPropagation()}>

                      {/* Modal header */}
                      <div className="bg-white border-b px-8 py-4 flex justify-between items-start z-10 sticky top-0">
                        <div className="flex items-center gap-5">
                          <div className={cn('w-14 h-14 rounded-xl flex items-center justify-center text-white shadow-lg', isFk?'bg-orange-600':isCr?'bg-indigo-600':'bg-blue-600')}>
                            {isFk ? <Truck className="w-8 h-8"/> : isCr ? <Hammer className="w-8 h-8"/> : <Activity className="w-8 h-8"/>}
                          </div>
                          <div>
                            <div className="flex items-center gap-3 mb-1">
                              <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight leading-none">{selectedMachinePro}</h2>
                              <div className={cn('px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm',
                                h.status==='Down'?'bg-red-50 text-red-600 border-red-200':h.status==='Idle'?'bg-slate-50 text-slate-400 border-slate-200':'bg-emerald-50 text-emerald-600 border-emerald-200')}>
                                {h.status} Mode
                              </div>
                            </div>
                            <div className="flex gap-4 text-[10px] text-slate-400 font-bold">
                              <span>Global Availability: <span className="text-slate-700 font-black">{h.globalAvailability}%</span></span>
                              <span>Health Score: <span className="text-slate-700 font-black">{avgScore}%</span></span>
                              <span>Downtime: <span className="text-red-600 font-black">{h.totalDowntimeHours}h</span></span>
                            </div>
                          </div>
                        </div>
                        <button onClick={() => setSelectedMachinePro(null)}
                          className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-full transition-all hover:rotate-90 shadow-inner">
                          <X className="w-7 h-7 text-slate-400"/>
                        </button>
                      </div>

                      {/* Modal body */}
                      <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-10 bg-slate-50/50">

                        {/* KPI Row */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                          <div className="bg-blue-600 p-6 rounded-lg text-white shadow-xl relative overflow-hidden">
                            <div className="text-white/60 text-[10px] font-black uppercase mb-1">Global Availability</div>
                            <div className="text-3xl font-black">{h.globalAvailability}%</div>
                            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full"/>
                          </div>
                          <div className="bg-white p-6 rounded-lg border-2 border-slate-100 shadow-sm flex flex-col justify-center">
                            <div className="text-slate-400 text-[10px] font-black uppercase mb-1">Scheduled Op Hours</div>
                            <div className="text-3xl font-black text-slate-800">{h.totalScheduledHours} <span className="text-xs font-bold opacity-30">hrs</span></div>
                          </div>
                          <div className="bg-white p-6 rounded-lg border-2 border-slate-100 shadow-sm flex flex-col justify-center">
                            <div className="text-slate-400 text-[10px] font-black uppercase mb-1">Idle / Planned Off</div>
                            <div className="text-3xl font-black text-amber-600">{h.totalPlannedOffHours} <span className="text-xs font-bold opacity-30">hrs</span></div>
                          </div>
                          <div className="bg-white p-6 rounded-lg border-2 border-slate-100 shadow-sm flex flex-col justify-center border-red-200/50">
                            <div className="text-slate-400 text-[10px] font-black uppercase mb-1">Total Downtime</div>
                            <div className="text-3xl font-black text-red-600">{h.totalDowntimeHours} <span className="text-xs font-bold opacity-30">hrs</span></div>
                          </div>
                        </div>

                        {/* Availability chart */}
                        {h.allTimeHistory.length > 0 && (
                          <div className="bg-white p-8 rounded-xl border-2 border-slate-100 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                              <h3 className="font-black text-slate-800 text-sm uppercase flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-500"/> Availability Performance History</h3>
                            </div>
                            <div className="h-48 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={h.allTimeHistory} margin={{top:10,right:10,left:-20,bottom:0}}>
                                  <defs>
                                    <linearGradient id="colorAvailPro" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize:9, fill:'#94a3b8'}}/>
                                  <YAxis domain={[0,100]} axisLine={false} tickLine={false} tick={{fontSize:9, fontWeight:'bold', fill:'#94a3b8'}}/>
                                  <Tooltip contentStyle={{borderRadius:'15px', border:'none', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)', fontSize:'10px'}}/>
                                  <Area type="monotone" dataKey="availability" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorAvailPro)" dot={{r:4, strokeWidth:2, fill:'#fff'}}/>
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}

                        {/* Subsystem Risk Matrix */}
                        <div className="space-y-6">
                          <div className="flex justify-between items-end px-2">
                            <div>
                              <h3 className="text-2xl font-black text-slate-800 uppercase flex items-center gap-3 tracking-tight">
                                <Activity className="w-8 h-8 text-red-500"/>
                                子系统风险审计矩阵
                                <button onClick={() => setIsMatrixExpanded(!isMatrixExpanded)}
                                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-all ml-2">
                                  {isMatrixExpanded ? <ChevronUp className="w-5 h-5"/> : <ChevronDown className="w-5 h-5"/>}
                                </button>
                              </h3>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">基于历史日志数据的动态组件失效预测</p>
                            </div>
                          </div>

                          {h.systems.length === 0 && (
                            <div className="bg-white rounded-xl border-2 border-slate-100 p-8 text-center text-slate-300">
                              <p className="text-sm font-black uppercase tracking-widest">未配置子系统矩阵</p>
                              <p className="text-[10px] mt-1">在 Pro-Maintenance 中配置 Health Matrix Engine</p>
                            </div>
                          )}

                          {isMatrixExpanded && h.systems.length > 0 && (
                            <div className="grid grid-cols-1 gap-8 pb-4">
                              {h.systems.map(sys => (
                                <div key={sys.name} className="bg-white rounded-xl border-2 border-slate-100 overflow-hidden shadow-md hover:border-blue-200 transition-all">
                                  <div className="px-10 py-4 bg-slate-50/80 border-b border-slate-100 flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                      <div className={cn('w-3 h-3 rounded-full', sys.status==='Critical'?'bg-red-500 animate-pulse':sys.status==='Warning'?'bg-orange-400':'bg-emerald-500')}/>
                                      <h4 className="font-black text-slate-800 text-sm uppercase tracking-widest">{sys.name}</h4>
                                    </div>
                                    <div className={cn('text-xl font-black px-6 py-1 rounded-xl border-2 shadow-sm',
                                      sys.score<50?'bg-red-50 text-red-600':sys.score<85?'bg-orange-50 text-orange-600':'bg-emerald-50 text-emerald-600')}>
                                      {sys.score}% <span className="text-[10px] opacity-40 uppercase tracking-tighter">健康度</span>
                                    </div>
                                  </div>
                                  <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-8 bg-white">
                                    {sys.components.map(comp => (
                                      <div key={comp.name} className="flex flex-col gap-3 group/comp relative pl-5 border-l-4 border-slate-100 hover:border-blue-400 transition-all">
                                        <div className="flex justify-between items-center">
                                          <span className="text-xs font-black text-slate-800 uppercase tracking-tight group-hover/comp:text-blue-600 transition-colors">{comp.name}</span>
                                          <span className={cn('text-[10px] font-black', comp.score<85?'text-orange-500':'text-slate-400')}>{comp.score}/100</span>
                                        </div>
                                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                          <div className={cn('h-full rounded-full transition-all duration-1000', comp.score<50?'bg-red-600':comp.score<85?'bg-orange-500':'bg-emerald-500')} style={{width:`${comp.score}%`}}/>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 min-h-[22px]">
                                          {comp.deductions.map((d,i) => (
                                            <div key={i} className="flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-black bg-red-50 text-red-600 border-red-100">
                                              <span>{d.type}</span><span className="opacity-60">-{d.val}</span>
                                            </div>
                                          ))}
                                          {comp.deductions.length === 0 && <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">优化完成</span>}
                                        </div>
                                        <div className="flex justify-between items-center pt-3 mt-1 border-t border-slate-50">
                                          <span className="text-[9px] font-black uppercase text-blue-600 flex items-center gap-1.5">
                                            <History size={11}/> {comp.issueCount} 日志
                                          </span>
                                          <span className={cn('text-[9px] font-black uppercase px-2 py-0.5 rounded', comp.score<70?'bg-red-50 text-red-500':'bg-slate-50 text-slate-400')}>{comp.riskLevel}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Planned off + Downtime tables */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-6">
                          <div className="space-y-4">
                            <h3 className="text-sm font-black text-slate-800 uppercase flex items-center gap-3 tracking-widest px-2">
                              <Hourglass className="w-5 h-5 text-amber-500"/> IDLE / PLANNED OFF (计划停机明细)
                            </h3>
                            <div className="bg-white rounded-lg border-2 border-slate-100 overflow-hidden shadow-sm">
                              <table className="w-full text-[10px] text-left border-collapse">
                                <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-tighter border-b">
                                  <tr><th className="px-4 py-3">日期</th><th className="px-4 py-3">班次</th><th className="px-4 py-3">原因</th><th className="px-4 py-3 text-right">时长(H)</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {h.plannedRecords.slice(0,15).map(r => (
                                    <tr key={r.id} className="hover:bg-slate-50">
                                      <td className="px-4 py-3 font-bold text-slate-600">{r.date}</td>
                                      <td className="px-4 py-3 font-bold text-slate-400 uppercase">{r.shift}</td>
                                      <td className="px-4 py-3 text-slate-500 italic truncate max-w-[150px]">{r.faultReason}</td>
                                      <td className="px-4 py-3 text-right font-black text-amber-600">{r.repairTime}</td>
                                    </tr>
                                  ))}
                                  {h.plannedRecords.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-300 font-bold uppercase tracking-widest italic">无计划停机记录</td></tr>}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          <div className="space-y-4">
                            <h3 className="text-sm font-black text-slate-800 uppercase flex items-center gap-3 tracking-widest px-2">
                              <AlertTriangle className="w-5 h-5 text-red-500"/> TOTAL DOWNTIME (故障停机明细)
                            </h3>
                            <div className="bg-white rounded-lg border-2 border-slate-100 overflow-hidden shadow-sm">
                              <table className="w-full text-[10px] text-left border-collapse">
                                <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-tighter border-b">
                                  <tr><th className="px-4 py-3">日期</th><th className="px-4 py-3">区域</th><th className="px-4 py-3">描述</th><th className="px-4 py-3 text-right">损失(H)</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {h.downtimeRecords.slice(0,15).map(r => (
                                    <tr key={r.id} className="hover:bg-slate-50 cursor-pointer">
                                      <td className="px-4 py-3 font-bold text-slate-600">{r.date}</td>
                                      <td className="px-4 py-3 font-bold text-slate-500 uppercase">{r.faultArea}</td>
                                      <td className="px-4 py-3 text-slate-500 truncate max-w-[150px]">{r.faultDescription}</td>
                                      <td className="px-4 py-3 text-right font-black text-red-600">{r.totalDowntime}</td>
                                    </tr>
                                  ))}
                                  {h.downtimeRecords.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-300 font-bold uppercase tracking-widest italic">未发现故障记录</td></tr>}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>

                      </div>
                    </motion.div>
                  </motion.div>
                );
              })()}
            </AnimatePresence>
          </>
        );
      })()}


            {/* ══ Maintenance Logs ═══════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden shrink-0">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 flex-wrap">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Maintenance Logs — 维修记录</span>
          <div className="flex gap-1 flex-wrap">
            {(['all', ...machines.map(m=>m.name), ...supabaseMachines.filter(m=>!machines.some(hm=>hm.name===m.name)).map(m=>m.name)] as string[]).map(name => (
              <button key={name} onClick={()=>setWoMachine(name)}
                className={cn('text-[8px] px-2 py-0.5 rounded-full font-bold transition-colors',
                  woMachine===name ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}>
                {name==='all'?'全部':name}
              </button>
            ))}
          </div>
          <span className="text-[8px] text-slate-300 ml-auto">{maintRecords.filter(r=>woMachine==='all'||r.machineName===woMachine).length} 条</span>
        </div>
        {maintRecords.length > 0 ? (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-[9px]">
              <thead className="sticky top-0">
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['日期','班次','机器','故障区域','类型','难度','停机(h)','维修结果','机器状态','技术员'].map(h=>(
                    <th key={h} className="text-left px-3 py-2 font-bold text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {maintRecords.filter(r=>woMachine==='all'||r.machineName===woMachine).slice(0,100).map((r,i)=>(
                  <tr key={r.id} className={cn('border-t border-slate-50 hover:bg-slate-50/60', i%2===1?'bg-slate-50/20':'')}>
                    <td className="px-3 py-1.5 font-bold text-slate-700 whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-1.5"><span className={cn('px-1.5 py-0.5 rounded-full text-[7px] font-black', r.shift==='AM'?'bg-blue-100 text-blue-700':'bg-amber-100 text-amber-700')}>{r.shift||'—'}</span></td>
                    <td className="px-3 py-1.5 font-black text-slate-800 whitespace-nowrap">{r.machineName}</td>
                    <td className="px-3 py-1.5 text-slate-600 max-w-[120px] truncate">{r.faultArea||'—'}</td>
                    <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{r.maintenanceType||'—'}</td>
                    <td className="px-3 py-1.5">{r.difficulty?<span className={cn('font-black',r.difficulty<=2?'text-emerald-600':r.difficulty<=3?'text-amber-500':'text-red-500')}>L{r.difficulty}</span>:'—'}</td>
                    <td className={cn('px-3 py-1.5 font-black tabular-nums',r.totalDowntime>0?'text-red-500':'text-slate-400')}>{r.totalDowntime>0?r.totalDowntime.toFixed(1):'—'}</td>
                    <td className="px-3 py-1.5">{r.repairResult?<span className={cn('px-1.5 py-0.5 rounded text-[7px] font-bold',{Fixed:'bg-emerald-100 text-emerald-700',Temporary:'bg-amber-100 text-amber-700','Not Fixed':'bg-red-100 text-red-600',Observation:'bg-blue-100 text-blue-700'}[r.repairResult]??'bg-slate-100 text-slate-500')}>{r.repairResult}</span>:'—'}</td>
                    <td className="px-3 py-1.5">{r.machineStatusAfter?<span className={cn('px-1.5 py-0.5 rounded text-[7px] font-bold',r.machineStatusAfter==='Running'?'bg-emerald-100 text-emerald-700':r.machineStatusAfter==='Restricted'?'bg-amber-100 text-amber-700':'bg-red-100 text-red-600')}>{r.machineStatusAfter}</span>:'—'}</td>
                    <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{r.technician||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-slate-300 gap-2">
            <History size={24}/><span className="text-[9px] font-bold">暂无记录 — 点击「同步保养系统」加载</span>
          </div>
        )}
      </div>

      {/* ── 4.3.3 维修工单管理 Work Order Tracker ─────────────────── */}
      {woLightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={()=>setWoLightbox(null)}>
          <img src={woLightbox} className="max-w-full max-h-full rounded-2xl object-contain" />
          <button onClick={()=>setWoLightbox(null)} className="absolute top-4 right-4 text-white bg-black/40 rounded-full p-1.5"><X size={18}/></button>
        </div>
      )}

      {/* Work order add/edit modal */}
      {woModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={()=>setWoModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[520px] max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-800">{woEdit ? '编辑工单' : '新建工单'}</h3>
              <button onClick={()=>setWoModal(false)} className="text-slate-300 hover:text-slate-500"><X size={16}/></button>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[8px] font-bold text-slate-400 uppercase mb-1">机器</div>
                  <select value={wfMachine} onChange={e=>setWfMachine(e.target.value)} className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400">
                    {machines.map(m=><option key={m.name}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <div className="text-[8px] font-bold text-slate-400 uppercase mb-1">优先级</div>
                  <select value={wfPriority} onChange={e=>setWfPriority(e.target.value as WorkOrder['priority'])} className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400">
                    <option value="urgent">紧急 Urgent</option>
                    <option value="high">高 High</option>
                    <option value="medium">中 Medium</option>
                    <option value="low">低 Low</option>
                  </select>
                </div>
              </div>
              <div>
                <div className="text-[8px] font-bold text-slate-400 uppercase mb-1">故障描述</div>
                <textarea value={wfDesc} onChange={e=>setWfDesc(e.target.value)} rows={3} placeholder="描述故障现象和维修内容..."
                  className="w-full text-[10px] border border-slate-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-blue-400" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[8px] font-bold text-slate-400 uppercase mb-1">状态</div>
                  <select value={wfStatus} onChange={e=>setWfStatus(e.target.value as WorkOrder['status'])} className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none">
                    <option value="pending">待处理</option>
                    <option value="in_progress">进行中</option>
                    <option value="completed">已完成</option>
                  </select>
                </div>
                <div>
                  <div className="text-[8px] font-bold text-slate-400 uppercase mb-1">Fitter</div>
                  <input value={wfFitter} onChange={e=>setWfFitter(e.target.value)} placeholder="姓名" className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none" />
                </div>
                <div>
                  <div className="text-[8px] font-bold text-slate-400 uppercase mb-1">日期</div>
                  <input type="date" value={wfDate} onChange={e=>setWfDate(e.target.value)} className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none" />
                </div>
              </div>
              {/* FMS-style toggles */}
              <div className="grid grid-cols-3 gap-2">
                {([
                  { label: 'Is Machine Fixed?', val: wfFixed,   set: setWfFixed   },
                  { label: 'Is Machine Working?',val: wfWorking, set: setWfWorking },
                  { label: 'Is Planned Downtime?',val: wfPlanned,set: setWfPlanned },
                ] as const).map(({ label, val, set }) => (
                  <button key={label} onClick={() => (set as (v: boolean) => void)(!val)}
                    className={cn('flex flex-col items-center gap-1 py-2 rounded-xl border-2 text-[8px] font-bold transition-colors',
                      val ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-400')}>
                    <span className="text-[14px]">{val ? '✓' : '✗'}</span>
                    <span className="text-center leading-tight">{label}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[8px] font-bold text-slate-400 uppercase mb-1">预计工时 (h)</div>
                  <input type="number" value={wfHours} onChange={e=>setWfHours(e.target.value)} placeholder="2" className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none" />
                </div>
                <div>
                  <div className="text-[8px] font-bold text-slate-400 uppercase mb-1">实际工时 (h)</div>
                  <input type="number" value={wfActualH} onChange={e=>setWfActualH(e.target.value)} placeholder="3" className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none" />
                </div>
              </div>
              <div>
                <div className="text-[8px] font-bold text-slate-400 uppercase mb-1">备注</div>
                <input value={wfNotes} onChange={e=>setWfNotes(e.target.value)} placeholder="备注（可选）" className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none" />
              </div>
              {/* Photos */}
              <div>
                <div className="text-[8px] font-bold text-slate-400 uppercase mb-1">工单照片 / FMS截图</div>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {wfPhotos.map((src, i) => (
                    <div key={i} className="relative">
                      <img src={src} className="w-16 h-16 rounded-lg object-cover cursor-pointer hover:opacity-90" onClick={()=>setWoLightbox(src)} />
                      <button onClick={()=>setWfPhotos(p=>p.filter((_,j)=>j!==i))} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center"><X size={8}/></button>
                    </div>
                  ))}
                  <label className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-[7px] text-slate-400 cursor-pointer hover:border-blue-300 hover:text-blue-400 gap-0.5">
                    <Camera size={12}/><span>+ 上传</span>
                    <input type="file" accept="image/*" multiple className="hidden"
                      onChange={async e => {
                        const files = Array.from(e.target.files ?? []);
                        const b64s = await Promise.all(files.map(resizeWoImg));
                        setWfPhotos(p => [...p, ...b64s]);
                        e.target.value = '';
                      }} />
                  </label>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                {woEdit && <button onClick={()=>{deleteWo(woEdit.id);setWoModal(false);}} className="px-3 py-2 text-[10px] font-bold text-red-500 border border-red-200 rounded-xl hover:bg-red-50">删除</button>}
                <div className="flex-1"/>
                <button onClick={()=>setWoModal(false)} className="px-4 py-2 text-[10px] font-bold text-slate-400 border border-slate-200 rounded-xl hover:bg-slate-50">取消</button>
                <button onClick={saveWoForm} className="px-5 py-2 bg-slate-800 text-white text-[10px] font-black rounded-xl hover:bg-slate-700">保存</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Work order tracker panel */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">4.3.3 iPad 系统维修工单完成情况  Work Order Tracker</span>
            {(() => {
              const total = workOrders.length;
              const done  = workOrders.filter(w => w.status === 'completed').length;
              const pct   = total > 0 ? Math.round(done/total*100) : 0;
              return total > 0 ? (
                <div className="flex items-center gap-3 mt-0.5">
                  <span className={cn('text-[11px] font-black tabular-nums', pct>=80?'text-emerald-600':pct>=60?'text-amber-500':'text-red-500')}>{pct}%</span>
                  <span className="text-[9px] text-slate-400">完成 {done}/{total} 张  待完成 {total-done} 张</span>
                </div>
              ) : null;
            })()}
          </div>
          <button onClick={()=>openAddWo()} className="flex items-center gap-1.5 text-[9px] px-3 py-1.5 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-colors">
            <Plus size={10}/> 新建工单
          </button>
        </div>

        <div className="flex" style={{ minHeight: 340 }}>
          {/* Left: machine list */}
          <div className="w-36 shrink-0 border-r border-slate-100 flex flex-col">
            <button onClick={()=>setWoMachine('all')}
              className={cn('px-3 py-2 text-left text-[9px] font-bold border-b border-slate-50 transition-colors',
                woMachine==='all' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50')}>
              全部机器 ({workOrders.length})
            </button>
            {machines.map(m => {
              const mWo   = workOrders.filter(w => w.machine === m.name);
              const mDone = mWo.filter(w => w.status === 'completed').length;
              return (
                <button key={m.name} onClick={()=>setWoMachine(m.name)}
                  className={cn('px-3 py-2 text-left border-b border-slate-50 transition-colors',
                    woMachine===m.name ? 'bg-slate-100 font-bold text-slate-800' : 'text-slate-500 hover:bg-slate-50')}>
                  <div className="text-[10px] font-bold">{m.name}</div>
                  {mWo.length > 0
                    ? <div className={cn('text-[8px]', mDone===mWo.length?'text-emerald-500':'text-amber-500')}>完成 {mDone}/{mWo.length}</div>
                    : <div className="text-[8px] text-slate-300">无工单</div>}
                </button>
              );
            })}
            <button onClick={()=>openAddWo(woMachine !== 'all' ? woMachine : undefined)}
              className="mt-auto px-3 py-2 text-[8px] text-blue-500 font-bold hover:bg-blue-50 border-t border-slate-100 flex items-center gap-1">
              <Plus size={9}/> 为此机器添加
            </button>
          </div>

          {/* Right: work order list */}
          <div className="flex-1 min-w-0 overflow-y-auto p-3 flex flex-col gap-2">
            {(() => {
              const filtered = workOrders.filter(w => woMachine === 'all' || w.machine === woMachine)
                .sort((a, b) => {
                  const pOrd = { urgent:0, high:1, medium:2, low:3 };
                  const sOrd = { pending:0, in_progress:1, completed:2 };
                  return (sOrd[a.status] - sOrd[b.status]) || (pOrd[a.priority] - pOrd[b.priority]);
                });
              if (!filtered.length) return (
                <div className="flex flex-col items-center justify-center h-40 text-slate-300 gap-2">
                  <ClipboardList size={28}/>
                  <span className="text-[10px] font-bold">暂无工单 — 点击「新建工单」添加</span>
                </div>
              );
              return filtered.map(wo => (
                <div key={wo.id} className={cn('border rounded-xl p-3 flex flex-col gap-2 hover:shadow-sm transition-shadow cursor-pointer',
                  wo.status==='completed' ? 'border-emerald-100 bg-emerald-50/30' :
                  wo.status==='in_progress'? 'border-blue-100 bg-blue-50/20' : 'border-slate-100 bg-white')}
                  onClick={()=>openEditWo(wo)}>
                  <div className="flex items-start gap-2">
                    {/* Priority dot */}
                    <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', PRIORITY_CLR[wo.priority])} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black text-slate-800">{wo.machine}</span>
                        <span className={cn('text-[7px] font-black px-1.5 py-0.5 rounded-full', STATUS_CLR[wo.status])}>{STATUS_TXT[wo.status]}</span>
                        <span className="text-[7px] text-slate-400">{wo.date}</span>
                        {wo.fitter && <span className="text-[7px] text-slate-400">Fitter: {wo.fitter}</span>}
                      </div>
                      <p className="text-[10px] text-slate-700 mt-0.5 leading-relaxed">{wo.description}</p>
                    </div>
                  </div>
                  {/* FMS-style status flags */}
                  <div className="flex gap-2 text-[8px]">
                    <span className={cn('px-1.5 py-0.5 rounded font-bold', wo.isMachineFixed?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-600')}>
                      Is Machine Fixed? {wo.isMachineFixed ? 'Yes':'No'}
                    </span>
                    <span className={cn('px-1.5 py-0.5 rounded font-bold', wo.isMachineWorking?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-600')}>
                      Is Machine Working? {wo.isMachineWorking ? 'Yes':'No'}
                    </span>
                    <span className={cn('px-1.5 py-0.5 rounded font-bold', wo.isPlannedDowntime?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-500')}>
                      Is Planned Downtime? {wo.isPlannedDowntime ? 'Yes':'No'}
                    </span>
                  </div>
                  {/* Photos */}
                  {wo.photos.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {wo.photos.map((src,i)=>(
                        <img key={i} src={src} className="w-14 h-14 rounded-lg object-cover cursor-pointer hover:opacity-90"
                          onClick={e=>{e.stopPropagation();setWoLightbox(src);}} />
                      ))}
                    </div>
                  )}
                  {wo.notes && <p className="text-[8px] text-slate-400 italic">{wo.notes}</p>}
                  {(wo.estimatedHours || wo.actualHours) && (
                    <div className="text-[8px] text-slate-400">
                      {wo.estimatedHours ? `预计 ${wo.estimatedHours}h` : ''}{wo.estimatedHours && wo.actualHours ? ' · ' : ''}{wo.actualHours ? `实际 ${wo.actualHours}h` : ''}
                    </div>
                  )}
                </div>
              ));
            })()}
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
};



// ---- Capacity & Cost Section ----
const SL_MACHINES   = ['SL28', 'SL32'];   // with inline packer cards
const MAIN_MACHINES = ['FT-2', 'PL22', 'FT-1', 'MST', 'Robo', 'SL300'];

// Badge-only status: color lives only in the top-right badge, not the card background
const STATUS_BADGE_BG:  Record<string, string> = { passed:'bg-green-100',  not_assessed:'bg-orange-100', failed:'bg-red-100'  };
const STATUS_BADGE_TX:  Record<string, string> = { passed:'text-green-700', not_assessed:'text-orange-600', failed:'text-red-600' };
// Dynamic input width: shrinks to content so units sit right next to the number
const chW = (val: number | string) => ({ style: { width: `${Math.max(1, String(val).replace('-','').length) + 0.2}ch` } });

interface UploadRow { shift: 'morning'|'afternoon'; name: string; efficiency: number; bonus: number; matched: CapEmp|null; }

const AFTERNOON_LOADING = 1.15; // 15% afternoon penalty rate

const CapacitySection: React.FC<SectionProps> = ({ color }) => {
  const [employees, setEmployees] = useState<CapEmp[]>(DEFAULT_CAP_EMPLOYEES);
  const [uploadPreview, setUploadPreview] = useState<{ period: string; periodStartRaw: string; periodEndRaw: string; rows: UploadRow[] } | null>(null);
  const [leaves, setLeaves]       = useState<CapLeave[]>([]);
  const [calMonth, setCalMonth]   = useState(() => new Date());
  const [selDay, setSelDay]       = useState<string | null>(null);
  const [newLeave, setNewLeave]   = useState({ empName: '', shift: 'morning' as 'morning'|'afternoon', startDate: '', endDate: '', reason: '' });
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());
  const toggleCard = (key: string) => setCollapsedCards(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const [wageUnlocked, setWageUnlocked] = useState(false);
  const [wageModal, setWageModal] = useState(false);
  const [wagePwInput, setWagePwInput] = useState('');
  const [showCostModal, setShowCostModal] = useState(false);
  const [costStaff, setCostStaff] = useState<CostStaff[]>([
    { id:'cs-mgr1', name:'Manager',     role:'management', hours:8, rate:50 },
    { id:'cs-tl1',  name:'Team Leader', role:'teamleader', hours:7, rate:40 },
  ]);
  const saveCostStaff = (s: CostStaff[]) => { setCostStaff(s); idbSet('costStaff', s); };
  const updCostStaff  = (id: string, patch: Partial<CostStaff>) => saveCostStaff(costStaff.map(s => s.id===id ? {...s,...patch} : s));
  const delCostStaff  = (id: string) => saveCostStaff(costStaff.filter(s => s.id!==id));

  // Interview state
  const [ivProfiles, setIvProfiles] = useState<OperatorProfile[]>(DEFAULT_OPERATOR_PROFILES);
  const [ivInterviews, setIvInterviews] = useState<BiWeeklyInterview[]>([]);
  const [ivSelectedId, setIvSelectedId] = useState<string | null>(null);
  const [ivBiWeeklyEff, setIvBiWeeklyEff] = useState<BiWeeklyPeriod[]>([]); // read from prod IDB
  const [ivAddingNew, setIvAddingNew] = useState(false);
  const [ivNewEntry, setIvNewEntry] = useState<Omit<BiWeeklyInterview,'id'|'profileId'>>(EMPTY_IV_ENTRY);
  const [ivEditingId, setIvEditingId] = useState<string | null>(null);
  const [ivEditDraft, setIvEditDraft] = useState<Omit<BiWeeklyInterview,'id'|'profileId'> | null>(null);
  const [qAssessments, setQAssessments] = useState<QuarterlyAssessment[]>([]);
  const [qDialogKey, setQDialogKey] = useState<string | null>(null); // 'profileId-year-quarter'
  const [qDraft, setQDraft] = useState<Omit<QuarterlyAssessment,'id'|'profileId'> | null>(null);
  const [qViewYear, setQViewYear] = useState<number>(new Date().getFullYear());

  // Personnel dropdown + management
  const [personnelDropdown, setPersonnelDropdown] = useState<string|null>(null);
  const [personnelSearch, setPersonnelSearch] = useState('');
  const [personnelMgmt, setPersonnelMgmt] = useState(false);

  // Track name at focus so onBlur can detect replacements vs renames
  const empNameAtFocus = useRef<Record<string, string>>({});

  useEffect(() => {
    idbGet<CapEmp[]>('capEmployees').then(d => {
      const base: CapEmp[] = d?.length ? d : DEFAULT_CAP_EMPLOYEES;
      // Ensure all fixed slots exist (operators per machine, support, packers)
      const missing: CapEmp[] = [];
      const has = (role: string, machine: string, shift: string) =>
        base.some(e => e.role === role && e.machine === machine && e.shift === shift) ||
        missing.some(e => e.role === role && e.machine === machine && e.shift === shift);
      const mkSlot = (id: string, role: CapEmp['role'], machine: string, shift: 'morning'|'afternoon', rate: number): CapEmp => ({
        id, name: '(空缺)', role, machine, shift, type: 'casual', rate, hours: 7,
        capacity: 0, efficiency: 0, superPct: 11, status: 'not_assessed', active: true,
      });
      for (const machine of ML_MACHINES) {
        if (!has('operator', machine, 'morning'))   missing.push(mkSlot(`m-op-${machine.replace(/[^a-z0-9]/gi,'').toLowerCase()}-auto`, 'operator', machine, 'morning', 33));
        if (!has('operator', machine, 'afternoon')) missing.push(mkSlot(`a-op-${machine.replace(/[^a-z0-9]/gi,'').toLowerCase()}-auto`, 'operator', machine, 'afternoon', 37.3));
      }
      for (const [shift, s] of [['morning','m'],['afternoon','a']] as const) {
        if (!has('cutter',  '', shift)) missing.push(mkSlot(`${s}-cut-auto`,     'cutter',  '', shift, 36));
        if (!has('fitter',  '', shift)) missing.push(mkSlot(`${s}-fit-auto`,     'fitter',  '', shift, 40));
        if (!has('forklift','', shift)) missing.push(mkSlot(`${s}-fl-auto`,      'forklift','', shift, 38.5));
        if (!has('packer','SL28',shift)) missing.push(mkSlot(`${s}-pk-sl28-auto`,'packer','SL28',shift, 32));
        if (!has('packer','SL32',shift)) missing.push(mkSlot(`${s}-pk-sl32-auto`,'packer','SL32',shift, 32));
      }
      const all = [...base, ...missing];
      setEmployees(all);
      if (missing.length > 0) idbSet('capEmployees', all);
    });
    idbGet<CapLeave[]>('capLeaves').then(d => { if (d?.length) setLeaves(d); });
    idbGet<CostStaff[]>('costStaff').then(d => { if (d?.length) setCostStaff(d); });
    idbGet<OperatorProfile[]>('operatorProfiles').then(d => { if (d?.length) setIvProfiles(d); });
    idbGet<BiWeeklyInterview[]>('biWeeklyInterviews').then(d => { if (d?.length) setIvInterviews(d); });
    idbGet<QuarterlyAssessment[]>('quarterlyAssessments').then(d => { if (d?.length) setQAssessments(d); });
    idbGet<BiWeeklyPeriod[]>('biWeeklyEfficiency').then(d => { if (d?.length) setIvBiWeeklyEff(d); });
  }, []);

  const save      = (emps: CapEmp[])    => { setEmployees(emps); idbSet('capEmployees', emps); };
  const upd       = (id: string, patch: Partial<CapEmp>) => save(employees.map(e => e.id === id ? { ...e, ...patch } : e));
  const del       = (id: string)        => save(employees.filter(e => e.id !== id));
  const saveLeaves = (ls: CapLeave[])   => { setLeaves(ls); idbSet('capLeaves', ls); };
  const delLeave  = (id: string)        => saveLeaves(leaves.filter(l => l.id !== id));

  // Interview helpers
  const saveIvProfiles = (ps: OperatorProfile[]) => { setIvProfiles(ps); idbSet('operatorProfiles', ps); };
  const saveIvInterviews = (is: BiWeeklyInterview[]) => { setIvInterviews(is); idbSet('biWeeklyInterviews', is); };
  const saveQAssessments = (qs: QuarterlyAssessment[]) => { setQAssessments(qs); idbSet('quarterlyAssessments', qs); };
  const EMPTY_Q: Omit<QuarterlyAssessment,'id'|'profileId'> = {
    year: new Date().getFullYear(), quarter: Math.ceil((new Date().getMonth()+1)/3) as 1|2|3|4,
    values: {passion:0,dedication:0,teamwork:0,customerFirst:0},
    workScores: {efficiency:0,quality:0,safety:0,fiveS:0},
    tlScores: {teamBuilding:0,behaviorMetrics:0,fiveS:0}, notes: '',
  };

  // Find the OperatorProfile for a given slot employee (by profileId link, then legacy id, then name)
  const findProfileForEmp = (emp: CapEmp): OperatorProfile | undefined => {
    if (emp.profileId) {
      const byPid = ivProfiles.find(p => p.id === emp.profileId);
      if (byPid) return byPid;
    }
    const byId = ivProfiles.find(p => p.id === emp.id); // legacy
    if (byId) return byId;
    const n = emp.name.trim().toLowerCase();
    if (!n || n === '(空缺)') return undefined;
    return ivProfiles.find(p => p.name.trim().toLowerCase() === n);
  };

  // Called onBlur of any name input — handles replace (switch profile) vs rename (update profile name)
  const handleEmpNameChange = (emp: CapEmp, newName: string) => {
    const trimmedNew = newName.trim();
    const prevName = (empNameAtFocus.current[emp.id] ?? emp.name).trim();
    if (!trimmedNew || trimmedNew.toLowerCase() === prevName.toLowerCase()) return;

    // Profile linked before the name changed
    const currentProfile = findProfileForEmp({ ...emp, name: prevName });

    // Does a profile already exist for the new name?
    const newNameProfile = ivProfiles.find(
      p => p.name.trim().toLowerCase() === trimmedNew.toLowerCase()
    );

    if (newNameProfile) {
      // Switch slot to existing person
      upd(emp.id, { profileId: newNameProfile.id });
    } else if (currentProfile) {
      // No one with that name exists → rename the current profile
      saveIvProfiles(ivProfiles.map(p =>
        p.id === currentProfile.id ? { ...p, name: trimmedNew } : p
      ));
    }
    // If neither: profile will be created fresh when modal is opened
  };

  const getOrCreateProfile = (emp: CapEmp): OperatorProfile => {
    const existing = findProfileForEmp(emp);
    if (existing) {
      // Ensure slot carries the profileId link
      if (emp.profileId !== existing.id) upd(emp.id, { profileId: existing.id });
      return existing;
    }
    const newId = `prof-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const np: OperatorProfile = {
      id: newId, name: emp.name,
      shift: emp.shift === 'morning' ? 'AM' : 'PM',
      type: emp.type, role: emp.role,
      loaderLevel: '', packerLevel: '', machines: emp.machine ? [emp.machine] : [], active: true,
    };
    saveIvProfiles([...ivProfiles, np]);
    upd(emp.id, { profileId: newId });
    return np;
  };

  const openIvModal = (emp: CapEmp) => {
    const profile = getOrCreateProfile(emp);
    setIvSelectedId(profile.id);
    setIvAddingNew(false);
  };
  const closeIvModal = () => { setIvSelectedId(null); setIvAddingNew(false); };

  // Assign a profile from the roster to a slot card
  const assignPersonToSlot = (empId: string, profile: OperatorProfile | null) => {
    if (profile) {
      upd(empId, { name: profile.name, profileId: profile.id });
    } else {
      upd(empId, { name: '(空缺)', profileId: undefined });
    }
    setPersonnelDropdown(null);
    setPersonnelSearch('');
  };

  // Inline dropdown for selecting a person from the roster
  const PersonDropdown = ({ empId }: { empId: string }) => {
    const filtered = ivProfiles
      .filter(p => p.name.trim() && p.name.toLowerCase().includes(personnelSearch.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
    return (
      <div className="absolute top-full left-0 z-[200] mt-0.5 w-48 bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col" style={{maxHeight: '220px'}}>
        <div className="p-1.5 border-b border-slate-100 shrink-0 rounded-t-xl">
          <input autoFocus value={personnelSearch} onChange={e => setPersonnelSearch(e.target.value)}
            placeholder="搜索姓名..." className="w-full text-[10px] px-2 py-1 rounded-md border border-slate-200 focus:outline-none focus:border-teal-400"/>
        </div>
        <div className="overflow-y-auto flex-1 rounded-b-xl">
          <button onClick={() => assignPersonToSlot(empId, null)}
            className="w-full text-left px-3 py-1.5 text-[10px] text-slate-400 hover:bg-slate-50 italic">
            (空缺)
          </button>
          {filtered.map(p => (
            <button key={p.id} onClick={() => assignPersonToSlot(empId, p)}
              className="w-full text-left px-3 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-teal-50 hover:text-teal-700 truncate">
              {p.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-[9px] text-slate-300 px-3 py-2 text-center">无匹配人员</p>
          )}
        </div>
      </div>
    );
  };

  const ivSelectedProfile = ivSelectedId ? ivProfiles.find(p => p.id === ivSelectedId) ?? null : null;
  const ivSelectedInterviews = ivInterviews
    .filter(i => i.profileId === ivSelectedId)
    .sort((a,b) => (b.periodEnd ?? b.periodStart ?? '').localeCompare(a.periodEnd ?? a.periodStart ?? ''));

  const patchIvProfile = (patch: Partial<OperatorProfile>) => {
    if (!ivSelectedProfile) return;
    const updated = { ...ivSelectedProfile, ...patch };
    saveIvProfiles(ivProfiles.map(p => p.id === updated.id ? updated : p));
  };

  const submitIvInterview = () => {
    if (!ivSelectedId) return;
    const entry: BiWeeklyInterview = { id: `iv-${Date.now()}`, profileId: ivSelectedId, ...ivNewEntry };
    saveIvInterviews([...ivInterviews, entry]);
    setIvNewEntry({ ...EMPTY_IV_ENTRY, periodStart: new Date().toISOString().slice(0,10), periodEnd: new Date().toISOString().slice(0,10) });
    setIvAddingNew(false);
  };

  const daysSince = (dateStr: string) => Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);

  // Wage: afternoon gets 1.15× loading (afternoon penalty rate)
  const baseWage  = (e: CapEmp) => e.rate * e.hours;
  const takeHome  = (e: CapEmp) => e.shift === 'afternoon' ? baseWage(e) * AFTERNOON_LOADING : baseWage(e);
  const superAmt  = (e: CapEmp) => takeHome(e) * e.superPct / 100;
  const totalCostE = (e: CapEmp) => takeHome(e) + superAmt(e);

  const shiftStats = (shift: 'morning'|'afternoon') => {
    const emps = employees.filter(e => e.shift === shift && e.active);
    return {
      staff: emps.length,
      cap:   emps.reduce((s, e) => s + (e.role === 'operator' ? e.capacity : 0), 0),
      wage:  emps.reduce((s, e) => s + baseWage(e), 0),
      take:  emps.reduce((s, e) => s + takeHome(e), 0),
      sup:   emps.reduce((s, e) => s + superAmt(e), 0),
      tot:   emps.reduce((s, e) => s + totalCostE(e), 0),
    };
  };
  const mS = shiftStats('morning');
  const aS = shiftStats('afternoon');
  const totalCap  = mS.cap + aS.cap;
  const totalCost = mS.tot + aS.tot;

  // Calendar helpers
  const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const todayStr = fmtDate(new Date());

  const leaveCoversDate = (l: CapLeave, date: string) => {
    const end = l.endDate && l.endDate >= l.date ? l.endDate : l.date;
    return l.date <= date && date <= end;
  };

  const leaveDateSet = (() => {
    const s = new Set<string>();
    leaves.forEach(l => {
      const end = l.endDate && l.endDate >= l.date ? l.endDate : l.date;
      const cur = new Date(l.date + 'T00:00:00');
      const stop = new Date(end + 'T00:00:00');
      while (cur <= stop) { s.add(fmtDate(cur)); cur.setDate(cur.getDate() + 1); }
    });
    return s;
  })();

  const calDays = () => {
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    const firstWd = new Date(y, m, 1).getDay();
    const lastDay = new Date(y, m+1, 0).getDate();
    const days: (string|null)[] = Array(firstWd).fill(null);
    for (let d = 1; d <= lastDay; d++) days.push(fmtDate(new Date(y, m, d)));
    return days;
  };

  const next7Leaves = () => {
    const result: { date: string; ls: CapLeave[] }[] = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now); d.setDate(d.getDate() + i);
      const ds = fmtDate(d);
      const dl = leaves.filter(l => leaveCoversDate(l, ds));
      if (dl.length) result.push({ date: ds, ls: dl });
    }
    return result;
  };

  // xlsx efficiency upload
  const handleXlsxUpload = async (file: File) => {
    try {
      const JSZip = (await import('jszip')).default;
      const zip   = await JSZip.loadAsync(file);
      const ssXml = await zip.file('xl/sharedStrings.xml')?.async('text') ?? '';
      const ssDoc = new DOMParser().parseFromString(ssXml, 'application/xml');
      const strs  = Array.from(ssDoc.querySelectorAll('si')).map(si => si.textContent ?? '');
      const getCellVal = (c: Element) => {
        const v = c.querySelector('v')?.textContent ?? '';
        return c.getAttribute('t') === 's' ? (strs[parseInt(v)] ?? '') : v;
      };
      const sheetFiles = Object.keys(zip.files).filter(k => k.match(/xl\/worksheets\/sheet\d+\.xml/));
      let sheetXml = '';
      for (const sf of sheetFiles) { sheetXml = await zip.file(sf)?.async('text') ?? ''; if (sheetXml) break; }
      const doc  = new DOMParser().parseFromString(sheetXml, 'application/xml');
      const rows = Array.from(doc.querySelectorAll('row'));
      let period = '';
      let periodStartRaw = '', periodEndRaw = '';
      const row51 = rows.find(r => r.getAttribute('r') === '51');
      if (row51) {
        const cells = Array.from(row51.querySelectorAll('c'));
        const colVal = (col: string) => { const c = cells.find(c => (c.getAttribute('r') ?? '').startsWith(col)); return c ? getCellVal(c) : ''; };
        const from = colVal('D'), to = colVal('E');
        periodStartRaw = from; periodEndRaw = to;
        if (from || to) period = `${from} – ${to}`.trim();
      }
      const efRows: UploadRow[] = [];
      for (const row of rows) {
        const rNum = parseInt(row.getAttribute('r') ?? '0');
        if (rNum < 53) continue;
        const cells = Array.from(row.querySelectorAll('c'));
        const colVal = (col: string) => { const c = cells.find(c => (c.getAttribute('r') ?? '').startsWith(col)); return c ? getCellVal(c) : ''; };
        const shiftSym = colVal('C'), name = colVal('D').trim(), effStr = colVal('E');
        const bonusStr = colVal('F') || colVal('G'); // bonus column – try F then G
        if (!name || !effStr) continue;
        const efficiency = parseFloat(effStr);
        if (isNaN(efficiency) || efficiency <= 0) continue;
        const bonus = Math.max(0, parseFloat(bonusStr) || 0);
        const shift: 'morning'|'afternoon' = shiftSym.includes('☀') ? 'morning' : 'afternoon';
        const matched = employees.find(e => (e.role === 'operator' || e.role === 'loader') && e.shift === shift &&
          e.name.toLowerCase().replace(/[^a-z一-鿿]/g, '').includes(name.toLowerCase().replace(/[^a-z一-鿿]/g, ''))) ?? null;
        efRows.push({ shift, name, efficiency, bonus, matched });
      }
      setUploadPreview({ period, periodStartRaw, periodEndRaw, rows: efRows });
    } catch (err) { console.error('xlsx parse error', err); }
  };

  // Sync capacity names + efficiency from the latest biweekly period stored in IDB.
  // For each biweekly entry: match by machine+shift (operators) or fuzzy name+shift (loaders).
  // If no match found, create a new capacity employee entry.
  const syncFromBiWeekly = () => {
    if (!ivBiWeeklyEff.length) return;
    const latest = ivBiWeeklyEff[ivBiWeeklyEff.length - 1];

    // Group by machine+shift, picking the entry with the most shifts worked (primary operator)
    const primaryByMachineShift = new Map<string, typeof latest.entries[number]>();
    for (const entry of latest.entries) {
      const mc = (entry.machineCode ?? '').trim().toUpperCase();
      if (!mc || mc === 'LOADER' || mc === 'CRANE' || mc === 'FORKLIFT') continue;
      const key = `${mc}-${entry.shift}`;
      const existing = primaryByMachineShift.get(key);
      if (!existing || (entry.shiftsWorked ?? 0) > (existing.shiftsWorked ?? 0)) {
        primaryByMachineShift.set(key, entry);
      }
    }
    // All loader/crane entries (no reliable machine match → match by name or create new)
    const loaderEntries = latest.entries.filter(e => {
      const mc = (e.machineCode ?? '').trim().toUpperCase();
      return !mc || mc === 'LOADER' || mc === 'CRANE' || mc === 'FORKLIFT';
    });

    // Convert kg/h → T/h: biweekly PDF data stores kg/h (e.g. 700), capacity cards use T/h (e.g. 0.7).
    // Heuristic: if value > 10 it must be kg/h; ≤ 10 is already T/h (from xlsx uploads).
    const toTph = (kgh: number) => kgh > 10 ? kgh / 1000 : kgh;

    let emps = [...employees];
    const newEmps: CapEmp[] = [];
    const updatedIds = new Set<string>();

    // 1. Operator slots — match by machine+shift, update name + efficiency (T/h) + capacity
    for (const [, entry] of primaryByMachineShift) {
      const bwShift   = entry.shift === 'AM' ? 'morning' : 'afternoon';
      const bwMachine = (entry.machineCode ?? '').trim().toUpperCase();
      const bwName    = entry.operator.trim();
      const effTph    = toTph(entry.avgKgH);
      const match = emps.find(e =>
        !updatedIds.has(e.id) &&
        e.machine.trim().toUpperCase() === bwMachine &&
        e.shift === bwShift &&
        e.role === 'operator'
      );
      if (match) {
        updatedIds.add(match.id);
        const eff2 = parseFloat(effTph.toFixed(2));
        const cap2 = parseFloat((eff2 * match.hours).toFixed(2));
        emps = emps.map(e => e.id !== match.id ? e : {
          ...e, name: bwName, efficiency: eff2, capacity: cap2,
        });
      } else {
        const eff2 = parseFloat(effTph.toFixed(2));
        newEmps.push({
          id: `bw-${bwShift[0]}-${bwMachine}-${Date.now()}`,
          name: bwName, role: 'operator', machine: entry.machineCode ?? bwMachine,
          shift: bwShift, type: 'casual', rate: 34, hours: 7,
          capacity: parseFloat((eff2 * 7).toFixed(2)), efficiency: eff2,
          superPct: 11, status: 'not_assessed', active: true,
        });
      }
    }

    // 2. Loader/crane entries — name only sync; capacity stays 0 (loaders excluded from production cap)
    for (const entry of loaderEntries) {
      const bwShift = entry.shift === 'AM' ? 'morning' : 'afternoon';
      const bwName  = entry.operator.trim();
      const norm    = (s: string) => s.toLowerCase().replace(/[^a-z一-鿿]/g, '');
      const match = emps.find(e =>
        !updatedIds.has(e.id) &&
        e.shift === bwShift &&
        (e.role === 'loader' || e.role === 'crane') &&
        norm(bwName).length > 0 &&
        (norm(e.name).includes(norm(bwName)) || norm(bwName).includes(norm(e.name)))
      );
      if (match) {
        updatedIds.add(match.id);
        const ldEffTph = parseFloat(toTph(entry.avgKgH).toFixed(2));
        // Update name + efficiency (T/h); capacity stays 0 — loaders excluded from production total
        emps = emps.map(e => e.id !== match.id ? e : { ...e, name: bwName, efficiency: ldEffTph });
      } else {
        const ldEffTph = parseFloat(toTph(entry.avgKgH).toFixed(2));
        newEmps.push({
          id: `bw-ld-${bwShift[0]}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          name: bwName, role: 'loader', machine: '',
          shift: bwShift, type: 'casual', rate: 35, hours: 7,
          capacity: 0, efficiency: ldEffTph,
          superPct: 11, status: 'not_assessed', active: true,
        });
      }
    }

    save([...emps, ...newEmps]);
  };

  const applyUpload = () => {
    if (!uploadPreview) return;
    // 1. Update live employee efficiency (convert kg/h → T/h if value > 10)
    const toTphXlsx = (v: number) => v > 10 ? v / 1000 : v;
    let emps = [...employees];
    for (const row of uploadPreview.rows) {
      if (!row.matched) continue;
      if (row.matched.role === 'loader' || row.matched.role === 'crane') continue; // loaders excluded from cap
      const effTph = toTphXlsx(row.efficiency);
      emps = emps.map(e => e.id !== row.matched!.id ? e : { ...e, efficiency: effTph, capacity: effTph * e.hours, status: 'passed' as const });
    }
    save(emps);
    // 2. Build a BiWeeklyPeriod from the xlsx data (with bonus + efficiency) and store in biWeeklyEfficiency IDB
    const xlsxEntries: BiWeeklyOpEntry[] = uploadPreview.rows.map(r => ({
      operator: r.name,
      machineCode: r.matched?.machine ?? '',
      machineName: r.matched?.machine ?? '',
      shift: r.shift === 'morning' ? 'AM' : 'PM',
      avgKgH: r.efficiency,
      peakKgH: r.efficiency,
      shiftsWorked: 0,
      bonus: r.bonus > 0 ? r.bonus : undefined,
    }));
    const tryParseDate = (raw: string): string => {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      // Excel serial number?
      const n = parseFloat(raw);
      if (!isNaN(n)) { const d2 = new Date((n - 25569) * 86400000); return d2.toISOString().slice(0, 10); }
      return new Date().toISOString().slice(0, 10);
    };
    const ps = tryParseDate(uploadPreview.periodStartRaw) || new Date().toISOString().slice(0, 10);
    const pe = tryParseDate(uploadPreview.periodEndRaw) || ps;
    const newPeriod: BiWeeklyPeriod = {
      id: `xlsx-${Date.now()}`,
      periodStart: ps, periodEnd: pe,
      uploadDate: new Date().toISOString().slice(0, 10),
      label: uploadPreview.period || ps,
      entries: xlsxEntries,
    };
    // Merge into existing biWeeklyEff: replace any existing xlsx- period with same dates, or append
    const existing = ivBiWeeklyEff.filter(p => !(p.id.startsWith('xlsx-') && p.periodStart === ps));
    const merged = [...existing, newPeriod].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
    setIvBiWeeklyEff(merged);
    idbSet('biWeeklyEfficiency', merged);
    setUploadPreview(null);
  };

  // Machine card — fixed position slot, no add/delete, name change triggers profile switch
  const MachineCard = ({ machine, shift }: { machine: string; shift: 'morning'|'afternoon' }) => {
    const emp = employees.find(e => e.machine === machine && e.shift === shift && e.role === 'operator');
    const isMorn = shift === 'morning';
    const cardKey = `${machine}-${shift}`;
    const collapsed = collapsedCards.has(cardKey);
    if (!emp) return (
      <div className="border-2 border-dashed border-slate-100 rounded-xl p-2 flex flex-col items-center justify-center min-h-[126px] text-slate-200">
        <Cpu size={16} className="mb-1 opacity-40"/>
        <span className="text-[9px] font-black">{machine}</span>
      </div>
    );
    const st = emp.status || 'not_assessed';
    const profile = findProfileForEmp(emp);
    const isTL = !!profile?.tlType;
    const allStickers = ['packer','loader','operator','support'].flatMap(k => profile?.stickers?.[k] ?? []);
    return (
      <div className={cn('border-2 bg-white rounded-xl p-2 flex flex-col gap-1 relative min-h-[126px]', isTL ? 'border-purple-200 bg-purple-50/20' : 'border-slate-200')}>
        {/* Status badge */}
        <select value={st} onChange={e => upd(emp.id,{status:e.target.value as CapEmp['status']})}
          className={cn('absolute top-1.5 right-1.5 text-[8px] font-black px-1 py-0.5 rounded-md appearance-none cursor-pointer border-0 focus:outline-none', STATUS_BADGE_BG[st], STATUS_BADGE_TX[st])}>
          <option value="passed">✓考核</option>
          <option value="not_assessed">?待考</option>
          <option value="failed">✗未过</option>
        </select>
        {/* Machine label (fixed) */}
        <div className="flex items-center gap-1">
          <span className={cn('text-[9px] font-black px-1.5 py-0.5 rounded-md self-start select-none',
            isMorn ? 'bg-amber-200 text-amber-900' : 'bg-indigo-200 text-indigo-900')}>
            {machine}
          </span>
          {isTL && <span className="text-[7px] font-black px-1 py-0.5 rounded-full bg-purple-100 text-purple-600">⭐ TL</span>}
        </div>
        {/* Name — edit to replace personnel; blur triggers profile switch/rename */}
        <div className="relative flex items-center">
          <input value={emp.name}
            onChange={e => upd(emp.id, { name: e.target.value })}
            onFocus={() => { empNameAtFocus.current[emp.id] = emp.name; }}
            onBlur={e => handleEmpNameChange(emp, e.target.value)}
            className="text-xs font-black text-slate-800 bg-transparent focus:outline-none flex-1 min-w-0 truncate pr-4"/>
          <button onClick={() => { setPersonnelDropdown(personnelDropdown === emp.id ? null : emp.id); setPersonnelSearch(''); }}
            className="shrink-0 text-slate-300 hover:text-teal-500 transition-colors">
            <ChevronDown size={11}/>
          </button>
          {personnelDropdown === emp.id && PersonDropdown({ empId: emp.id })}
        </div>
        {/* Capacity + efficiency */}
        <div className="flex items-baseline gap-0.5 leading-none">
          <input type="number" value={parseFloat(emp.capacity.toFixed(2))} step="0.01"
            onChange={e => { const cap=parseFloat(parseFloat(e.target.value||'0').toFixed(2)); upd(emp.id,{capacity:cap, efficiency: emp.hours>0 ? parseFloat((cap/emp.hours).toFixed(2)) : emp.efficiency}); }}
            className="text-[22px] font-black text-slate-800 tabular-nums bg-transparent focus:outline-none min-w-0"
            style={{ width: `${Math.max(4, emp.capacity.toFixed(2).length) + 0.5}ch` }}/>
          <span className="text-[10px] font-normal text-slate-500">T</span>
        </div>
        <div className="flex items-center text-[9px] text-slate-500">
          <input type="number" value={parseFloat(emp.efficiency.toFixed(2))} step="0.01"
            onChange={e => { const ef=parseFloat(parseFloat(e.target.value||'0').toFixed(2)); upd(emp.id,{efficiency:ef,capacity:parseFloat((ef*emp.hours).toFixed(2))}); }}
            className="bg-transparent focus:outline-none font-bold text-slate-600 tabular-nums min-w-0"
            style={{ width: `${Math.max(3, emp.efficiency.toFixed(2).length) + 0.5}ch` }}/>
          <span>T/h×</span>
          <input type="number" value={emp.hours} step="0.5"
            onChange={e => { const h=parseFloat(e.target.value)||0; upd(emp.id,{hours:h,capacity:parseFloat((emp.efficiency*h).toFixed(2))}); }}
            className="bg-transparent focus:outline-none tabular-nums text-slate-600" {...chW(emp.hours)}/>
          <span>h</span>
        </div>
        {/* Collapsible: FT/CAS + rate */}
        {!collapsed && wageUnlocked && (
          <div className="flex items-center gap-1.5 text-[9px] pt-0.5 border-t border-black/5">
            <button onClick={() => upd(emp.id,{type:emp.type==='fulltime'?'casual':'fulltime'})}
              className={cn('text-[8px] font-black px-1 py-0.5 rounded shrink-0',emp.type==='fulltime'?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-500')}>
              {emp.type==='fulltime'?'FT':'CAS'}
            </button>
            <div className="flex items-center text-slate-700 shrink-0">
              <span className="text-slate-400">$</span>
              <input type="number" value={emp.rate} step="0.1"
                onChange={e => upd(emp.id,{rate:parseFloat(e.target.value)||0})}
                className="bg-transparent focus:outline-none font-bold tabular-nums" {...chW(emp.rate)}/>
              <span className="text-slate-400">/h</span>
            </div>
          </div>
        )}
        {/* Sticker strip — read-only, all categories from profile */}
        {allStickers.length > 0 && (
          <div className="grid grid-cols-5 gap-1 pt-1 border-t border-black/5">
            {allStickers.map((src, i) => (
              <div key={i} className="h-[40px] rounded-md overflow-hidden bg-white">
                <img src={src} alt="" className="w-full h-full object-contain"/>
              </div>
            ))}
          </div>
        )}
        {/* Interview button */}
        <button
          onClick={e => { e.stopPropagation(); openIvModal(emp); }}
          className={cn(
            'absolute bottom-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[7px] font-black transition-all',
            (() => {
              const pIvs = ivInterviews.filter(i => i.profileId === emp.id);
              const last = pIvs.sort((a,b) => (b.periodEnd??'').localeCompare(a.periodEnd??''))[0];
              return last && daysSince(last.periodEnd ?? last.periodStart) < 14
                ? 'bg-teal-50 text-teal-600 hover:bg-teal-100'
                : 'bg-red-50 text-red-400 hover:bg-red-100';
            })()
          )}>
          <MessageCircle size={8}/>
          {(() => {
            const pIvs = ivInterviews.filter(i => i.profileId === emp.id);
            const last = pIvs.sort((a,b) => (b.periodEnd??'').localeCompare(a.periodEnd??''))[0];
            return last ? `${daysSince(last.periodEnd ?? last.periodStart)}d` : '面谈';
          })()}
        </button>
      </div>
    );
  };

  // Person row used in support / supervisor sections
  const PersonRow = ({ emp, showBay = false, showRole = false }: { emp: CapEmp; showBay?: boolean; showRole?: boolean }) => {
    const profile = findProfileForEmp(emp);
    const stickers = ['packer','loader','operator','support'].flatMap(k => profile?.stickers?.[k] ?? []);
    return (
      <div className="flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 px-2.5 py-1.5">
          {showBay && <span className="text-[9px] font-black text-cyan-700 bg-cyan-100 px-1.5 py-0.5 rounded-md shrink-0">{emp.machine}</span>}
          {showRole && <span className={cn('text-[8px] font-black px-1.5 py-0.5 rounded-md shrink-0', CAP_ROLE_COLOR[emp.role] || 'bg-slate-100 text-slate-600')}>{CAP_ROLE_LABEL[emp.role] || emp.role}</span>}
          <input value={emp.name} onChange={e => upd(emp.id,{name:e.target.value})}
            onFocus={() => { empNameAtFocus.current[emp.id] = emp.name; }}
            onBlur={e => handleEmpNameChange(emp, e.target.value)}
            className="flex-1 text-[11px] font-black text-slate-800 bg-transparent focus:outline-none min-w-0 truncate"/>
          <button onClick={() => upd(emp.id,{type:emp.type==='fulltime'?'casual':'fulltime'})}
            className={cn('text-[8px] font-black px-1 py-0.5 rounded shrink-0',emp.type==='fulltime'?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-500')}>
            {emp.type==='fulltime'?'FT':'CAS'}
          </button>
          <div className="flex items-center gap-0.5 text-[9px] shrink-0">
            <span className="text-slate-400">$</span>
            <input type="number" value={emp.rate} onChange={e => upd(emp.id,{rate:parseFloat(e.target.value)||0})}
              className="w-8 text-right bg-transparent focus:outline-none font-bold text-slate-700 tabular-nums"/>
            <span className="text-slate-400">/h</span>
          </div>
          <button onClick={() => del(emp.id)} className="text-slate-300 hover:text-red-500 ml-0.5"><X size={10}/></button>
          <button onClick={() => openIvModal(emp)}
            className={cn(
              'flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[7px] font-black shrink-0 transition-all',
              (() => {
                const pIvs = ivInterviews.filter(i => i.profileId === emp.id);
                const last = pIvs.sort((a,b) => (b.periodEnd??'').localeCompare(a.periodEnd??''))[0];
                return last && daysSince(last.periodEnd ?? last.periodStart) < 14
                  ? 'bg-teal-50 text-teal-600 hover:bg-teal-100'
                  : 'bg-red-50 text-red-400 hover:bg-red-100';
              })()
            )}>
            <MessageCircle size={8}/>
          </button>
        </div>
        {/* Sticker strip — read-only, uploaded via interview modal */}
        {stickers.length > 0 && (
          <div className="grid grid-cols-5 gap-1 px-2.5 pb-1.5 border-t border-slate-100 pt-1">
            {stickers.map((src, i) => (
              <div key={i} className="h-[40px] rounded-md overflow-hidden bg-white">
                <img src={src} alt="" className="w-full h-full object-contain"/>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Packer card (inline with machine cards for SL28/SL32)
  const PackerCard = ({ machine, shift }: { machine: string; shift: 'morning'|'afternoon' }) => {
    const emp = employees.find(e => e.machine === machine && e.shift === shift && e.role === 'packer');
    const isMorn = shift === 'morning';
    const cardKey = `packer-${machine}-${shift}`;
    const collapsed = collapsedCards.has(cardKey);
    if (!emp) return (
      <div className="border-2 border-dashed border-purple-100 rounded-xl p-2 flex flex-col items-center justify-center min-h-[126px] text-purple-200">
        <span className="text-[9px] font-black">Packer</span>
        <span className="text-[8px]">{machine}</span>
      </div>
    );
    const st = emp.status || 'not_assessed';
    const profile = findProfileForEmp(emp);
    const packerStickers = ['packer','loader','operator','support'].flatMap(k => profile?.stickers?.[k] ?? []);
    return (
      <div className="border-2 border-purple-200 bg-purple-50 rounded-xl p-2 flex flex-col gap-1 relative">
        {/* Status badge */}
        <select value={st} onChange={e => upd(emp.id,{status:e.target.value as CapEmp['status']})}
          className={cn('absolute top-1.5 right-1.5 text-[8px] font-black px-1 py-0.5 rounded-md appearance-none cursor-pointer border-0 focus:outline-none', STATUS_BADGE_BG[st], STATUS_BADGE_TX[st])}>
          <option value="passed">✓考核</option>
          <option value="not_assessed">?待考</option>
          <option value="failed">✗未过</option>
        </select>
        <div className="flex items-center gap-1">
          <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-purple-200 text-purple-800 shrink-0">Packer</span>
          <span className="text-[8px] text-purple-500 shrink-0">{machine}</span>
        </div>
        {/* Name — edit to replace personnel */}
        <div className="relative flex items-center">
          <input value={emp.name} onChange={e => upd(emp.id,{name:e.target.value})}
            onFocus={() => { empNameAtFocus.current[emp.id] = emp.name; }}
            onBlur={e => handleEmpNameChange(emp, e.target.value)}
            className="text-xs font-black text-slate-800 bg-transparent focus:outline-none flex-1 min-w-0 truncate pr-4"/>
          <button onClick={() => { setPersonnelDropdown(personnelDropdown === emp.id ? null : emp.id); setPersonnelSearch(''); }}
            className="shrink-0 text-slate-300 hover:text-purple-500 transition-colors">
            <ChevronDown size={11}/>
          </button>
          {personnelDropdown === emp.id && PersonDropdown({ empId: emp.id })}
        </div>
        <div className="flex-1"/>
        {/* Sticker strip — read-only, from profile */}
        {packerStickers.length > 0 && (
          <div className="grid grid-cols-5 gap-1 pt-1 border-t border-purple-100">
            {packerStickers.map((src, i) => (
              <div key={i} className="h-[40px] rounded-md overflow-hidden bg-white">
                <img src={src} alt="" className="w-full h-full object-contain"/>
              </div>
            ))}
          </div>
        )}
        {/* Interview button */}
        <button
          onClick={e => { e.stopPropagation(); openIvModal(emp); }}
          className={cn(
            'absolute bottom-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[7px] font-black transition-all',
            (() => {
              const pIvs = ivInterviews.filter(i => i.profileId === emp.id);
              const last = pIvs.sort((a,b) => (b.periodEnd??'').localeCompare(a.periodEnd??''))[0];
              return last && daysSince(last.periodEnd ?? last.periodStart) < 14
                ? 'bg-teal-50 text-teal-600 hover:bg-teal-100'
                : 'bg-red-50 text-red-400 hover:bg-red-100';
            })()
          )}>
          <MessageCircle size={8}/>
          {(() => {
            const pIvs = ivInterviews.filter(i => i.profileId === emp.id);
            const last = pIvs.sort((a,b) => (b.periodEnd??'').localeCompare(a.periodEnd??''))[0];
            return last ? `${daysSince(last.periodEnd ?? last.periodStart)}d` : '面谈';
          })()}
        </button>
        {/* Collapsible: FT/CAS + rate + delete */}
        {!collapsed && wageUnlocked && (
          <div className="flex items-center gap-1.5 text-[9px] pt-0.5 border-t border-purple-100">
            <button onClick={() => upd(emp.id,{type:emp.type==='fulltime'?'casual':'fulltime'})}
              className={cn('text-[8px] font-black px-1 py-0.5 rounded shrink-0',emp.type==='fulltime'?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-500')}>
              {emp.type==='fulltime'?'FT':'CAS'}
            </button>
            <div className="flex items-center text-slate-700 shrink-0">
              <span className="text-slate-400">$</span>
              <input type="number" value={emp.rate} step="0.1"
                onChange={e => upd(emp.id,{rate:parseFloat(e.target.value)||0})}
                className="bg-transparent focus:outline-none font-bold tabular-nums" {...chW(emp.rate)}/>
              <span className="text-slate-400">/h</span>
            </div>
            <button onClick={() => del(emp.id)} className="ml-auto text-slate-300 hover:text-red-500 shrink-0"><X size={9}/></button>
          </div>
        )}
      </div>
    );
  };

  const renderShift = (shift: 'morning'|'afternoon') => {
    const isMorn   = shift === 'morning';
    const S        = isMorn ? mS : aS;
    const hdrBg    = isMorn ? 'bg-amber-700' : 'bg-indigo-700';

    const loaders     = employees.filter(e => e.shift===shift && (e.role==='crane'||e.role==='loader'));
    const support     = employees.filter(e => e.shift===shift && (e.role==='cutter'||e.role==='forklift'||e.role==='fitter'));
    const supervisors = employees.filter(e => e.shift===shift && e.role==='supervisor');

    const operators  = employees.filter(e => e.shift===shift && e.role==='operator' && e.active);
    const avgEff     = operators.length > 0 ? operators.reduce((s, e) => s + e.efficiency, 0) / operators.length : 0;
    const totalCap   = S.cap * 1.15; // cap + 15% stock dispatch

    const addBtn = (label: string, role: CapEmp['role'], defaultRate = 33) => (
      <button onClick={() => save([...employees, {
        id:`${shift[0]}-${role}-${Date.now()}`, name:'(新增)', role, machine:'',
        shift, type:'casual', rate:defaultRate, hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true,
      }])} className="flex items-center gap-0.5 text-[9px] text-slate-400 hover:text-teal-600 transition-colors">
        <Plus size={10}/>{label}
      </button>
    );

    const LoaderInlineCard = ({ emp }: { emp: CapEmp }) => {
      const cardKey = `loader-${emp.id}`;
      const collapsed = collapsedCards.has(cardKey);
      const st = emp.status || 'not_assessed';
      const passed = st === 'passed';
      const loaderProfile = findProfileForEmp(emp);
      const loaderProfileId = loaderProfile?.id ?? emp.profileId ?? emp.id;
      const isLoaderTL = !!loaderProfile?.tlType;
      return (
        <div className={cn('border-2 rounded-xl p-2 flex flex-col gap-1 relative group/loader', isLoaderTL ? 'border-purple-200 bg-purple-50/30' : 'border-cyan-200 bg-cyan-50')}>
          {/* Delete button — top-left, hover only */}
          <button onClick={() => del(emp.id)}
            className="absolute top-1 left-1 opacity-0 group-hover/loader:opacity-100 transition-opacity text-slate-300 hover:text-red-500 z-10">
            <X size={10}/>
          </button>
          {/* Status badge — top-right, acts as dropdown */}
          <select value={st} onChange={e => upd(emp.id,{status:e.target.value as CapEmp['status']})}
            className={cn('absolute top-1.5 right-1.5 text-[8px] font-black px-1 py-0.5 rounded-md appearance-none cursor-pointer border-0 focus:outline-none', STATUS_BADGE_BG[st], STATUS_BADGE_TX[st])}>
            <option value="passed">✓考核</option>
            <option value="not_assessed">?待考</option>
            <option value="failed">✗未过</option>
          </select>
          <div className="flex items-center gap-1">
            <span className={cn('text-[8px] font-black px-1.5 py-0.5 rounded shrink-0', isLoaderTL ? 'bg-purple-200 text-purple-800' : 'bg-cyan-200 text-cyan-800')}>Loader</span>
            {isLoaderTL && <span className="text-[7px] font-black px-1 py-0.5 rounded-full bg-purple-100 text-purple-600">⭐ TL</span>}
          </div>
          {/* Name — edit to replace personnel */}
          <div className="relative flex items-center">
            <input value={emp.name} onChange={e => upd(emp.id,{name:e.target.value})}
              onFocus={() => { empNameAtFocus.current[emp.id] = emp.name; }}
              onBlur={e => handleEmpNameChange(emp, e.target.value)}
              className="text-xs font-black text-slate-800 bg-transparent focus:outline-none flex-1 min-w-0 truncate pr-4"/>
            <button onClick={() => { setPersonnelDropdown(personnelDropdown === emp.id ? null : emp.id); setPersonnelSearch(''); }}
              className="shrink-0 text-slate-300 hover:text-cyan-500 transition-colors">
              <ChevronDown size={11}/>
            </button>
            {personnelDropdown === emp.id && PersonDropdown({ empId: emp.id })}
          </div>
          {/* 装车效率 — always visible, same size as machine capacity */}
          <div className="flex items-baseline leading-none">
            <input type="number" value={parseFloat(emp.efficiency.toFixed(2))} step="0.01"
              onChange={e => upd(emp.id,{efficiency: parseFloat(parseFloat(e.target.value||'0').toFixed(2))})}
              className="text-[22px] font-black text-slate-800 bg-transparent focus:outline-none tabular-nums min-w-0"
              style={{ width: `${Math.max(4, emp.efficiency.toFixed(2).length) + 0.5}ch` }}/>
            <span className="text-[10px] font-normal text-slate-500 ml-0.5">T/h</span>
          </div>
          <div className="flex-1"/>
          {/* Sticker strip — read-only, all categories from profile */}
          {(['packer','loader','operator','support'].flatMap(k => loaderProfile?.stickers?.[k] ?? [])).length > 0 && (
            <div className="grid grid-cols-5 gap-1 pt-1 border-t border-cyan-100">
              {['packer','loader','operator','support'].flatMap(k => loaderProfile?.stickers?.[k] ?? []).map((src, i) => (
                <div key={i} className="h-[40px] rounded-md overflow-hidden bg-white">
                  <img src={src} alt="" className="w-full h-full object-contain"/>
                </div>
              ))}
            </div>
          )}
          {/* Collapsible: FT/CAS + rate + delete */}
          {!collapsed && wageUnlocked && (
            <div className="flex items-center gap-1.5 text-[9px] pt-0.5 border-t border-cyan-100">
              <button onClick={() => upd(emp.id,{type:emp.type==='fulltime'?'casual':'fulltime'})}
                className={cn('text-[8px] font-black px-1 py-0.5 rounded shrink-0',emp.type==='fulltime'?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-500')}>
                {emp.type==='fulltime'?'FT':'CAS'}
              </button>
              <div className="flex items-center text-slate-700 shrink-0">
                <span className="text-slate-400">$</span>
                <input type="number" value={emp.rate} step="0.1"
                  onChange={e => upd(emp.id,{rate:parseFloat(e.target.value)||0})}
                  className="bg-transparent focus:outline-none font-bold tabular-nums" {...chW(emp.rate)}/>
                <span className="text-slate-400">/h</span>
              </div>
              <button onClick={() => del(emp.id)} className="ml-auto text-slate-300 hover:text-red-500 shrink-0"><X size={9}/></button>
            </div>
          )}
          {/* Interview button */}
          <button onClick={e => { e.stopPropagation(); openIvModal(emp); }}
            className={cn('absolute bottom-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[7px] font-black transition-all',
              (() => {
                const last = ivInterviews.filter(i => i.profileId === loaderProfileId).sort((a,b) => (b.periodEnd??'').localeCompare(a.periodEnd??''))[0];
                return last && daysSince(last.periodEnd ?? last.periodStart) < 14 ? 'bg-teal-50 text-teal-600 hover:bg-teal-100' : 'bg-red-50 text-red-400 hover:bg-red-100';
              })())}>
            <MessageCircle size={8}/>
            {(() => {
              const last = ivInterviews.filter(i => i.profileId === loaderProfileId).sort((a,b) => (b.periodEnd??'').localeCompare(a.periodEnd??''))[0];
              return last ? `${daysSince(last.periodEnd ?? last.periodStart)}d` : '面谈';
            })()}
          </button>
        </div>
      );
    };

    return (
      <div className="flex flex-col gap-1.5">
        {/* Shift header — all summary stats inline */}
        <div className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl text-white shrink-0', hdrBg)}>
          {/* Shift label + supervisor inline */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-base font-black uppercase tracking-wide leading-none">{isMorn ? '☀ 早班' : '🌙 下午班'}</span>
            {supervisors.length > 0 && (
              <>
                <div className="w-px h-4 bg-white/30 shrink-0"/>
                {supervisors.map((s, i) => (
                  <React.Fragment key={s.id}>
                    {i > 0 && <span className="text-[11px] opacity-50"> / </span>}
                    <input
                      value={s.name}
                      onChange={e => upd(s.id, { name: e.target.value })}
                      className="text-[11px] font-bold opacity-80 leading-none bg-transparent focus:outline-none focus:opacity-100 border-b border-transparent focus:border-white/50 text-white w-auto min-w-[2ch]"
                      style={{ width: `${Math.max(2, s.name.length)}ch` }}
                    />
                  </React.Fragment>
                ))}
              </>
            )}
          </div>
          <div className="flex items-center gap-0.5 ml-auto">
            {([
              { l:'人数',  v:`${S.staff}人` },
              ...(avgEff > 0 ? [{ l:'效率', v:`${avgEff.toFixed(3)}T/h` }] : []),
              { l:'产能',  v:`${totalCap.toFixed(2)}T` },
              ...(totalCap > 0 ? [{ l:'$/吨', v:`$${(S.tot/totalCap).toFixed(2)}` }] : []),
            ] as {l:string; v:string}[]).map(({l, v}, i, arr) => (
              <React.Fragment key={l}>
                <div className="flex flex-col items-center px-2.5">
                  <span className="text-[9px] font-bold opacity-60 leading-none mb-0.5">{l}</span>
                  <span className="text-[13px] font-black tabular-nums leading-none">{v}</span>
                </div>
                {i < arr.length - 1 && <div className="w-px h-6 bg-white/20 shrink-0"/>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Row 1: SL28 | SL28 Packer | Loader×3 | SL32 | SL32 Packer */}
        <div className="shrink-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">SL28 · Loader({loaders.length}) · SL32</p>
            <button onClick={() => save([...employees, {
              id:`${shift[0]}-crn-${Date.now()}`, name:'(新增)', role:'crane' as const, machine:'',
              shift, type:'casual', rate:35, hours:7, capacity:0, efficiency:0, superPct:11, status:'not_assessed', active:true,
            }])} className="flex items-center gap-0.5 text-[9px] text-slate-400 hover:text-teal-600 transition-colors">
              <Plus size={10}/>添加Loader
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {MachineCard({machine:'SL28', shift})}
            {PackerCard({machine:'SL28', shift})}
            {loaders.map(emp => <React.Fragment key={emp.id}>{LoaderInlineCard({emp})}</React.Fragment>)}
            {MachineCard({machine:'SL32', shift})}
            {PackerCard({machine:'SL32', shift})}
          </div>
        </div>

        {/* Row 2: FT-2 | P22 | FT-1 | MST | Robo | SL300 */}
        <div className="shrink-0">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Machine Floor 机器区</p>
          <div className="grid grid-cols-6 gap-1.5">
            {MAIN_MACHINES.map(m => <React.Fragment key={m}>{MachineCard({machine:m, shift})}</React.Fragment>)}
          </div>
        </div>

        {/* Support: Cutter · Fitter · Forklift — 3-col vertical cards, same style as MachineCard */}
        {isMorn && (() => {
          const SupportCard = ({ role, label }: { role: CapEmp['role']; label: string }) => {
            const emp = employees.find(e => e.shift === shift && e.role === role);
            const accentCls = CAP_ROLE_COLOR[role] ?? 'bg-slate-100 text-slate-600';
            if (!emp) return (
              <div className="border-2 border-dashed border-slate-100 rounded-xl p-2 flex flex-col items-center justify-center min-h-[126px] text-slate-200">
                <span className="text-[9px] font-black">{label}</span>
              </div>
            );
            const st = emp.status || 'not_assessed';
            const profile = findProfileForEmp(emp);
            const stickers = ['packer','loader','operator','support'].flatMap(k => profile?.stickers?.[k] ?? []);
            // Interview button uses profileId link
            const profileId = profile?.id ?? emp.profileId ?? emp.id;
            return (
              <div className="border-2 border-slate-200 bg-white rounded-xl p-1.5 flex flex-col gap-0.5 relative min-h-[126px]">
                {/* Status badge */}
                <select value={st} onChange={e => upd(emp.id, { status: e.target.value as CapEmp['status'] })}
                  className={cn('absolute top-1 right-1 text-[8px] font-black px-1 py-0.5 rounded-md appearance-none cursor-pointer border-0 focus:outline-none', STATUS_BADGE_BG[st], STATUS_BADGE_TX[st])}>
                  <option value="passed">✓考核</option>
                  <option value="not_assessed">?待考</option>
                  <option value="failed">✗未过</option>
                </select>
                {/* Role badge */}
                <span className={cn('text-[8px] font-black px-1.5 py-0.5 rounded-md self-start', accentCls)}>{label}</span>
                {/* Name — edit to replace personnel */}
                <div className="relative flex items-center">
                  <input value={emp.name} onChange={e => upd(emp.id, { name: e.target.value })}
                    onFocus={() => { empNameAtFocus.current[emp.id] = emp.name; }}
                    onBlur={e => handleEmpNameChange(emp, e.target.value)}
                    className="text-xs font-black text-slate-800 bg-transparent focus:outline-none flex-1 min-w-0 truncate pr-4"/>
                  <button onClick={() => { setPersonnelDropdown(personnelDropdown === emp.id ? null : emp.id); setPersonnelSearch(''); }}
                    className="shrink-0 text-slate-300 hover:text-slate-500 transition-colors">
                    <ChevronDown size={11}/>
                  </button>
                  {personnelDropdown === emp.id && PersonDropdown({ empId: emp.id })}
                </div>
                {/* FT/CAS + rate */}
                {wageUnlocked && (
                  <div className="flex items-center gap-1.5 text-[9px] pt-0.5 border-t border-black/5">
                    <button onClick={() => upd(emp.id, { type: emp.type === 'fulltime' ? 'casual' : 'fulltime' })}
                      className={cn('text-[8px] font-black px-1 py-0.5 rounded shrink-0', emp.type === 'fulltime' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500')}>
                      {emp.type === 'fulltime' ? 'FT' : 'CAS'}
                    </button>
                    <div className="flex items-center text-slate-700 shrink-0">
                      <span className="text-slate-400">$</span>
                      <input type="number" value={emp.rate} step="0.1"
                        onChange={e => upd(emp.id, { rate: parseFloat(e.target.value) || 0 })}
                        className="bg-transparent focus:outline-none font-bold tabular-nums" {...chW(emp.rate)}/>
                      <span className="text-slate-400">/h</span>
                    </div>
                  </div>
                )}
                {/* Sticker strip — read-only, from profile */}
                {stickers.length > 0 && (
                  <div className="grid grid-cols-5 gap-1 pt-1 border-t border-black/5">
                    {stickers.map((src, i) => (
                      <div key={i} className="h-[40px] rounded-md overflow-hidden bg-white">
                        <img src={src} alt="" className="w-full h-full object-contain"/>
                      </div>
                    ))}
                  </div>
                )}
                {/* Interview button */}
                <button onClick={e => { e.stopPropagation(); openIvModal(emp); }}
                  className={cn('absolute bottom-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[7px] font-black transition-all',
                    (() => {
                      const last = ivInterviews.filter(i => i.profileId === profileId).sort((a,b) => (b.periodEnd??'').localeCompare(a.periodEnd??''))[0];
                      return last && daysSince(last.periodEnd ?? last.periodStart) < 14 ? 'bg-teal-50 text-teal-600 hover:bg-teal-100' : 'bg-red-50 text-red-400 hover:bg-red-100';
                    })())}>
                  <MessageCircle size={8}/>
                  {(() => {
                    const last = ivInterviews.filter(i => i.profileId === profileId).sort((a,b) => (b.periodEnd??'').localeCompare(a.periodEnd??''))[0];
                    return last ? `${daysSince(last.periodEnd ?? last.periodStart)}d` : '面谈';
                  })()}
                </button>
              </div>
            );
          };

          return (
            <div className="shrink-0">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Support — Cutter · Fitter · Forklift</p>
              <div className="grid grid-cols-3 gap-1.5">
                {SupportCard({ role: 'cutter',   label: 'Cutter' })}
                {SupportCard({ role: 'fitter',   label: 'M.Fitter' })}
                {SupportCard({ role: 'forklift', label: 'Forklift' })}
              </div>
            </div>
          );
        })()}


      </div>
    );
  };

  // Leave Calendar panel
  const days = calDays();
  const upcomingLeaves = next7Leaves();
  const selLeaves = selDay ? leaves.filter(l => leaveCoversDate(l, selDay)) : [];
  const calY = calMonth.getFullYear(), calMIdx = calMonth.getMonth();
  const DAY_NAMES = ['S','M','T','W','T','F','S'];

  return (
    <SectionWrapper title="People & Capacity" icon={Users} color={color}>
      {/* Upload preview modal */}
      {uploadPreview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-4 max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-black text-slate-800 text-sm">效率数据更新预览</h3>
                {uploadPreview.period && <p className="text-[10px] text-slate-500 mt-0.5">周期: {uploadPreview.period}</p>}
              </div>
              <button onClick={() => setUploadPreview(null)} className="text-slate-400 hover:text-slate-700"><X size={16}/></button>
            </div>
            <table className="w-full text-[10px] border-collapse mb-3">
              <thead><tr className="bg-slate-100">
                {['姓名','班次','新效率','奖金','匹配'].map(h => (
                  <th key={h} className={cn('px-2 py-1 font-black text-slate-500', ['新效率','奖金'].includes(h)?'text-right':'text-left')}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {uploadPreview.rows.map((r,i) => (
                  <tr key={i} className={cn('border-b border-slate-100', r.matched?'':'opacity-40')}>
                    <td className="px-2 py-1 font-bold text-slate-800">{r.name}</td>
                    <td className="px-2 py-1">{r.shift==='morning'?'☀ 早':'🌙 午'}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.efficiency.toFixed(3)} T/h</td>
                    <td className="px-2 py-1 text-right tabular-nums font-black text-emerald-700">{r.bonus > 0 ? `$${r.bonus}` : '—'}</td>
                    <td className="px-2 py-1">{r.matched
                      ?<span className="text-green-700 font-bold">✓ {r.matched.name}</span>
                      :<span className="text-red-500">未找到</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setUploadPreview(null)} className="px-3 py-1.5 text-[10px] font-black text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">取消</button>
              <button onClick={applyUpload} className="px-3 py-1.5 text-[10px] font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">
                确认更新 ({uploadPreview.rows.filter(r=>r.matched).length}人)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Personnel dropdown backdrop — closes dropdown on outside click */}
      {personnelDropdown && (
        <div className="fixed inset-0 z-[199]" onClick={() => { setPersonnelDropdown(null); setPersonnelSearch(''); }}/>
      )}

      {/* Personnel management modal */}
      {personnelMgmt && (
        <div className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-sm flex items-center justify-center"
          onClick={() => setPersonnelMgmt(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-80 max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <Users size={13} className="text-teal-600"/>
                <span className="text-sm font-black text-slate-800">人员名单</span>
                <span className="text-[9px] text-slate-400">{ivProfiles.length} 人</span>
              </div>
              <button onClick={() => {
                const newId = `prof-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
                const np: OperatorProfile = { id: newId, name: '新员工', shift: 'AM', type: 'casual', role: 'operator', loaderLevel: '', machines: [], active: true };
                saveIvProfiles([...ivProfiles, np]);
              }} className="flex items-center gap-1 text-[10px] font-black text-teal-600 hover:text-teal-700 px-2 py-1 rounded-lg hover:bg-teal-50 transition-colors">
                <Plus size={10}/>添加
              </button>
            </div>
            {/* List */}
            <div className="overflow-y-auto flex-1 p-2">
              {ivProfiles.sort((a,b) => a.name.localeCompare(b.name)).map(p => (
                <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 group">
                  <input value={p.name}
                    onChange={e => saveIvProfiles(ivProfiles.map(x => x.id === p.id ? {...x, name: e.target.value} : x))}
                    className="flex-1 text-[11px] font-bold bg-transparent focus:outline-none text-slate-700 focus:border-b focus:border-teal-400 min-w-0"/>
                  <button onClick={() => saveIvProfiles(ivProfiles.filter(x => x.id !== p.id))}
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all shrink-0">
                    <X size={11}/>
                  </button>
                </div>
              ))}
              {ivProfiles.length === 0 && <p className="text-[10px] text-slate-300 text-center py-6">暂无人员，点击「添加」创建</p>}
            </div>
            {/* Footer */}
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              <button onClick={() => {
                // Update existing profile names by ID (preserves interview record links)
                const nameMap: Record<string, string> = {
                  'op-tomson':    'Weidong Tang',
                  'op-laotian':   'Baohe Tian',
                  'op-winston':   'Yundeng Mai',
                  'op-kurtic':    'Kurtic Pink',
                  'op-eric':      'Chenxi Li',
                  'op-yichao':    'Yichao Ji',
                  'op-simon':     'Huanfeng CHEN',
                  'op-tuan':      'Tuan Tran',
                  'op-allen':     'Christian Enrile',
                  'op-kong':      'Dexing Kong',
                  'op-christian': 'Christian Enrile',
                  'op-dean':      'Dean Erbert',
                  'op-geo':       'Geo Casper Chong',
                };
                // Step 1: rename by old ID
                let profiles = ivProfiles.map(p => nameMap[p.id] ? { ...p, name: nameMap[p.id] } : p);
                // Step 2: deduplicate by name — keep the one that has interview records, else keep first
                const seenNames = new Map<string, OperatorProfile>();
                const hasIv = (id: string) => ivInterviews.some(iv => iv.profileId === id);
                for (const p of profiles) {
                  const key = p.name.trim().toLowerCase();
                  if (!seenNames.has(key)) { seenNames.set(key, p); }
                  else if (hasIv(p.id) && !hasIv(seenNames.get(key)!.id)) { seenNames.set(key, p); }
                }
                profiles = [...seenNames.values()];
                // Add new people who aren't in the list yet
                const newPeople: OperatorProfile[] = [
                  { id:'op-weidong',         name:'Weidong Tang',          shift:'AM', type:'casual',   role:'operator', loaderLevel:'',   machines:['FT-2'],  active:true },
                  { id:'op-baohe',           name:'Baohe Tian',            shift:'AM', type:'fulltime', role:'operator', loaderLevel:'',   machines:['MST'],   active:true },
                  { id:'op-yundeng',         name:'Yundeng Mai',           shift:'AM', type:'fulltime', role:'operator', loaderLevel:'',   machines:['PL22'],  active:true },
                  { id:'op-chenxi',          name:'Chenxi Li',             shift:'AM', type:'fulltime', role:'operator', loaderLevel:'',   machines:['SL32'],  active:true },
                  { id:'op-huanfeng',        name:'Huanfeng CHEN',         shift:'AM', type:'fulltime', role:'operator', loaderLevel:'',   machines:['Robo'],  active:true },
                  { id:'op-sugeng',          name:'Sugeng Hariyadi',       shift:'AM', type:'casual',   role:'operator', loaderLevel:'',   machines:['Robo'],  active:true },
                  { id:'op-xingjiang',       name:'Xingjiang Xu',          shift:'AM', type:'casual',   role:'loader',   loaderLevel:'L2', machines:[],        active:true },
                  { id:'op-shengchih',       name:'Shengchih Hung',        shift:'AM', type:'casual',   role:'loader',   loaderLevel:'L2', machines:[],        active:true },
                  { id:'op-christian-e',     name:'Christian Enrile',      shift:'PM', type:'casual',   role:'operator', loaderLevel:'',   machines:['FT-1','MST'], active:true },
                  { id:'op-dexing',          name:'Dexing Kong',           shift:'PM', type:'casual',   role:'operator', loaderLevel:'',   machines:['FT-2'],  active:true },
                  { id:'op-dean',            name:'Dean Erbert',           shift:'PM', type:'casual',   role:'operator', loaderLevel:'',   machines:['SL32'],  active:true },
                  { id:'op-leanschel-david', name:'Leanschel Joseph David',shift:'PM', type:'casual',   role:'loader',   loaderLevel:'L2', machines:[],        active:true },
                  { id:'op-tingyi',          name:'Tingyi Xie',            shift:'PM', type:'casual',   role:'loader',   loaderLevel:'L2', machines:[],        active:true },
                  { id:'op-yubiao',          name:'Yubiao Wu',             shift:'PM', type:'casual',   role:'loader',   loaderLevel:'L2', machines:[],        active:true },
                  { id:'op-geocasper',       name:'Geo Casper Chong',      shift:'PM', type:'casual',   role:'loader',   loaderLevel:'L2', machines:[],        active:true },
                  { id:'op-leanschel-j',     name:'Leanschel Joseph',      shift:'PM', type:'casual',   role:'crane',    loaderLevel:'',   machines:[],        active:true },
                ];
                const existingIds   = new Set(profiles.map(p => p.id));
                const existingNames = new Set(profiles.map(p => p.name.trim().toLowerCase()));
                const toAdd = newPeople.filter(np =>
                  !existingIds.has(np.id) &&
                  !existingNames.has(np.name.trim().toLowerCase())
                );
                saveIvProfiles([...profiles, ...toAdd]);
              }} className="text-[9px] font-black px-2.5 py-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 transition-colors">
                ↻ 同步名单
              </button>
              <button onClick={() => setPersonnelMgmt(false)}
                className="text-[10px] font-black px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* Wage unlock password modal */}
      {wageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-72 flex flex-col gap-4">
            <p className="text-sm font-black text-slate-800">查看折叠内容</p>
            <input
              type="password"
              placeholder="输入密码"
              value={wagePwInput}
              autoFocus
              onChange={e => setWagePwInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (wagePwInput === 'finesteel') { setWageUnlocked(true); setCollapsedCards(new Set()); setWageModal(false); setWagePwInput(''); }
                  else { setWagePwInput(''); }
                }
                if (e.key === 'Escape') { setWageModal(false); setWagePwInput(''); }
              }}
              className="text-sm px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-teal-400 w-full"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setWageModal(false); setWagePwInput(''); }}
                className="px-3 py-1.5 text-[11px] font-black text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">取消</button>
              <button onClick={() => {
                if (wagePwInput === 'finesteel') { setWageUnlocked(true); setCollapsedCards(new Set()); setWageModal(false); setWagePwInput(''); }
                else { setWagePwInput(''); }
              }} className="px-3 py-1.5 text-[11px] font-black text-white bg-teal-600 hover:bg-teal-700 rounded-lg">确认</button>
            </div>
          </div>
        </div>
      )}

      {/* Cost Efficiency Detail Modal */}
      {showCostModal && (() => {
        const totalCap   = (mS.cap + aS.cap) * 1.15;
        const shiftCost  = mS.tot + aS.tot;
        const mgmtCost   = costStaff.filter(s=>s.role==='management').reduce((a,s)=>a+s.hours*s.rate, 0);
        const tlCost     = costStaff.filter(s=>s.role==='teamleader').reduce((a,s)=>a+s.hours*s.rate, 0);
        const grandTotal = shiftCost + mgmtCost + tlCost;
        const costPerT   = totalCap > 0 ? grandTotal / totalCap : 0;
        const mAvgEff    = (() => { const ops = employees.filter(e=>e.shift==='morning'&&e.role==='operator'&&e.active); return ops.length ? ops.reduce((a,e)=>a+e.efficiency,0)/ops.length : 0; })();
        const aAvgEff    = (() => { const ops = employees.filter(e=>e.shift==='afternoon'&&e.role==='operator'&&e.active); return ops.length ? ops.reduce((a,e)=>a+e.efficiency,0)/ops.length : 0; })();

        const SectionHeader = ({ label, onAdd }: { label: string; onAdd: () => void }) => (
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</p>
            <button onClick={onAdd} className="flex items-center gap-0.5 text-[9px] text-slate-400 hover:text-teal-600 transition-colors"><Plus size={10}/>添加</button>
          </div>
        );

        const StaffRow: React.FC<{ s: CostStaff }> = ({ s }) => (
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
            <input value={s.name} onChange={e=>updCostStaff(s.id,{name:e.target.value})}
              className="flex-1 text-[11px] font-bold text-slate-800 bg-transparent focus:outline-none min-w-0"/>
            <div className="flex items-center text-[10px] text-slate-500 shrink-0 gap-0.5">
              <input type="number" value={s.hours} onChange={e=>updCostStaff(s.id,{hours:parseFloat(e.target.value)||0})}
                className="w-8 text-right bg-transparent focus:outline-none font-bold text-slate-700 tabular-nums"/>
              <span>h</span>
            </div>
            <div className="flex items-center text-[10px] text-slate-500 shrink-0 gap-0.5">
              <span>$</span>
              <input type="number" value={s.rate} onChange={e=>updCostStaff(s.id,{rate:parseFloat(e.target.value)||0})}
                className="w-10 text-right bg-transparent focus:outline-none font-bold text-slate-700 tabular-nums"/>
              <span>/h</span>
            </div>
            <span className="text-[10px] font-black text-slate-400 tabular-nums shrink-0 w-14 text-right">${(s.hours*s.rate).toFixed(2)}</span>
            <button onClick={()=>delCostStaff(s.id)} className="text-slate-300 hover:text-red-500 shrink-0"><X size={10}/></button>
          </div>
        );

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div>
                  <p className="text-sm font-black text-slate-800">成本效率计算</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Cost per Tonne Calculator</p>
                </div>
                <button onClick={()=>setShowCostModal(false)} className="text-slate-300 hover:text-slate-600 p-1"><X size={16}/></button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

                {/* Shift summary */}
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">班次数据</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { label:'☀ 早班', cap:`${(mS.cap*1.15).toFixed(2)}T`, eff:`${mAvgEff.toFixed(3)}T/h`, staff:`${mS.staff}人`, cost:`$${mS.tot.toFixed(2)}` },
                      { label:'🌙 下午班', cap:`${(aS.cap*1.15).toFixed(2)}T`, eff:`${aAvgEff.toFixed(3)}T/h`, staff:`${aS.staff}人`, cost:`$${aS.tot.toFixed(2)}` },
                    ]).map(({label,cap,eff,staff,cost})=>(
                      <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] font-black text-slate-600 mb-2">{label}</p>
                        <div className="flex flex-col gap-1">
                          {([['人数',staff],['产能',cap],['平均效率',eff],['班次成本',cost]] as const).map(([k,v])=>(
                            <div key={k} className="flex justify-between text-[10px]">
                              <span className="text-slate-400">{k}</span>
                              <span className="font-bold text-slate-700 tabular-nums">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] px-1 mt-2">
                    <span className="text-slate-400">日总产能（含15% stock）</span>
                    <span className="font-black text-slate-700 tabular-nums">{totalCap.toFixed(2)} T</span>
                  </div>
                  <div className="flex justify-between text-[10px] px-1 mt-1">
                    <span className="text-slate-400">班次总成本</span>
                    <span className="font-black text-slate-700 tabular-nums">${shiftCost.toFixed(2)}</span>
                  </div>
                </div>

                {/* Management */}
                <div>
                  <SectionHeader label="管理人员 Management" onAdd={()=>saveCostStaff([...costStaff,{id:`cs-mgr-${Date.now()}`,name:'新管理',role:'management',hours:8,rate:50}])}/>
                  <div className="flex flex-col gap-1.5">
                    {costStaff.filter(s=>s.role==='management').map(s=><StaffRow key={s.id} s={s}/>)}
                    {costStaff.filter(s=>s.role==='management').length===0 && <p className="text-[10px] text-slate-300 px-1">暂无管理人员</p>}
                  </div>
                  <div className="flex justify-between text-[10px] px-1 mt-2">
                    <span className="text-slate-400">管理人员小计</span>
                    <span className="font-black text-slate-600 tabular-nums">${mgmtCost.toFixed(2)}</span>
                  </div>
                </div>

                {/* Team Leaders */}
                <div>
                  <SectionHeader label="Team Leader" onAdd={()=>saveCostStaff([...costStaff,{id:`cs-tl-${Date.now()}`,name:'Team Leader',role:'teamleader',hours:7,rate:40}])}/>
                  <div className="flex flex-col gap-1.5">
                    {costStaff.filter(s=>s.role==='teamleader').map(s=><StaffRow key={s.id} s={s}/>)}
                    {costStaff.filter(s=>s.role==='teamleader').length===0 && <p className="text-[10px] text-slate-300 px-1">暂无 Team Leader</p>}
                  </div>
                  <div className="flex justify-between text-[10px] px-1 mt-2">
                    <span className="text-slate-400">TL 小计</span>
                    <span className="font-black text-slate-600 tabular-nums">${tlCost.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Footer — grand total */}
              <div className="border-t border-slate-100 px-5 py-4 bg-slate-50 rounded-b-2xl">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] font-black text-slate-600">总成本 Grand Total</span>
                  <span className="text-base font-black text-slate-800 tabular-nums">${grandTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-black text-slate-600">成本效率 Cost / Tonne</span>
                  <span className="text-2xl font-black tabular-nums" style={{color:'#10b981'}}>${costPerT.toFixed(2)}<span className="text-sm font-bold text-slate-400 ml-1">/T</span></span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Main layout: Shifts (left) | KPIs + Leave Calendar (right) */}
      <div className="flex-1 flex gap-3 min-h-0">
        <div className="flex-1 flex flex-col gap-3 overflow-y-auto min-h-0 pr-1">
          {renderShift('morning')}
          <div className="h-px bg-slate-200 shrink-0"/>
          {renderShift('afternoon')}
        </div>
        <div className="w-px bg-slate-200 shrink-0"/>

        {/* Right column: KPIs + Leave Calendar */}
        <div className="w-80 flex flex-col gap-2 shrink-0 overflow-y-auto">

          {/* KPI cards — combined totals */}
          {((): {label:string; sublabel:string; accent:string; bg:string; value:string; unit:string}[] => {
            const totalStaff = mS.staff + aS.staff;
            const totalCap   = (mS.cap + aS.cap) * 1.15;
            const totalCost  = mS.tot + aS.tot;
            return [
              { label:'人员配置', sublabel:'Total Headcount', accent:'#f59e0b', bg:'bg-amber-50',
                value:`${totalStaff}`, unit:'人' },
              { label:'日总产能', sublabel:'Daily Capacity (T)', accent:'#6366f1', bg:'bg-indigo-50',
                value:`${totalCap.toFixed(2)}`, unit:'T' },
              { label:'成本效率', sublabel:'Cost per Tonne', accent:'#10b981', bg:'bg-emerald-50',
                value: totalCap > 0 ? `$${(totalCost/totalCap).toFixed(2)}` : '—', unit:'' },
            ];
          })().map(({label,sublabel,accent,bg,value,unit}) => {
            const isCost = label === '成本效率';
            return (
              <div key={label} className={cn('rounded-xl px-3 py-3 flex items-center gap-3 border-2 shrink-0', bg)} style={{borderColor:accent+'33'}}>
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  {isCost
                    ? <button onClick={()=>setShowCostModal(true)}
                        className="text-xs font-black text-slate-800 leading-tight text-left hover:underline underline-offset-2 decoration-dotted w-fit">
                        {label} ↗
                      </button>
                    : <p className="text-xs font-black text-slate-800 leading-tight">{label}</p>
                  }
                  <p className="text-[10px] font-bold text-slate-400 leading-tight">{sublabel}</p>
                </div>
                <div className="flex items-baseline gap-1 shrink-0">
                  <span className="text-2xl font-black tabular-nums leading-none" style={{color:accent}}>{value}</span>
                  {unit && <span className="text-[11px] font-bold text-slate-400">{unit}</span>}
                </div>
              </div>
            );
          })}

          {/* Month calendar */}
          <div className="bg-white border border-slate-200 rounded-xl p-2.5 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setCalMonth(d => new Date(d.getFullYear(), d.getMonth()-1, 1))}
                className="text-slate-400 hover:text-slate-700 p-0.5 rounded hover:bg-slate-100"><ChevronLeft size={14}/></button>
              <span className="text-[11px] font-black text-slate-700">{calY}年{calMIdx+1}月</span>
              <button onClick={() => setCalMonth(d => new Date(d.getFullYear(), d.getMonth()+1, 1))}
                className="text-slate-400 hover:text-slate-700 p-0.5 rounded hover:bg-slate-100"><ChevronRight size={14}/></button>
            </div>
            <div className="grid grid-cols-7 mb-1">
              {DAY_NAMES.map((d,i) => <div key={i} className="text-center text-[8px] font-black text-slate-300">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {days.map((d, i) => {
                if (!d) return <div key={i}/>;
                const hasLeave = leaveDateSet.has(d);
                const isToday  = d === todayStr;
                const isSel    = d === selDay;
                const dayNum   = parseInt(d.split('-')[2]);
                return (
                  <button key={d} onClick={() => {
                    const next = isSel ? null : d;
                    setSelDay(next);
                    if (next) setNewLeave(s => ({ ...s, startDate: next, endDate: '' }));
                  }}
                    className={cn('relative flex items-center justify-center rounded-lg text-[9px] font-bold py-0.5',
                      isSel    ? 'bg-teal-600 text-white' :
                      hasLeave ? 'bg-red-100 text-red-700 hover:bg-red-200' :
                      isToday  ? 'bg-slate-100 font-black text-teal-700' :
                                 'text-slate-600 hover:bg-slate-50')}>
                    {dayNum}
                    {hasLeave && !isSel && <span className="absolute bottom-0 right-0.5 w-1 h-1 rounded-full bg-red-400"/>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected day detail + add leave */}
          {selDay && (
            <div className="bg-white border border-slate-200 rounded-xl p-2.5 shrink-0">
              <p className="text-[10px] font-black text-slate-700 mb-1.5">
                {selDay.slice(5).replace('-','/')} 请假 ({selLeaves.length})
              </p>
              {selLeaves.length > 0 && (
                <div className="flex flex-col gap-1 mb-2">
                  {selLeaves.map(l => (
                    <div key={l.id} className="flex items-center gap-1 text-[9px]">
                      <span className={cn('px-1.5 rounded-md font-black shrink-0',
                        l.shift==='morning'?'bg-amber-100 text-amber-700':'bg-indigo-100 text-indigo-700')}>
                        {l.shift==='morning'?'早':'午'}
                      </span>
                      <span className="font-bold text-slate-800 flex-1 truncate">{l.empName}</span>
                      {l.endDate && l.endDate !== l.date
                        ? <span className="text-slate-400 text-[8px] shrink-0">{l.date.slice(5).replace('-','/')}~{l.endDate.slice(5).replace('-','/')}</span>
                        : null}
                      {l.reason && <span className="text-slate-400 text-[8px] truncate ml-0.5">{l.reason}</span>}
                      <button onClick={() => delLeave(l.id)} className="text-slate-300 hover:text-red-500 shrink-0 ml-1"><X size={9}/></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-1 pt-1 border-t border-slate-100">
                <input placeholder="员工姓名" value={newLeave.empName}
                  onChange={e => setNewLeave(s => ({...s, empName: e.target.value}))}
                  className="text-[10px] px-2 py-1 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-400 w-full"/>
                <select value={newLeave.shift} onChange={e => setNewLeave(s => ({...s, shift: e.target.value as 'morning'|'afternoon'}))}
                  className="text-[10px] px-1.5 py-1 border border-slate-200 rounded-lg focus:outline-none w-full bg-white">
                  <option value="morning">☀ 早班</option>
                  <option value="afternoon">🌙 午班</option>
                </select>
                <div className="flex gap-1 items-center">
                  <span className="text-[9px] text-slate-400 shrink-0">开始</span>
                  <input type="date" value={newLeave.startDate || selDay}
                    onChange={e => setNewLeave(s => ({...s, startDate: e.target.value}))}
                    className="text-[10px] px-1.5 py-1 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-400 flex-1 bg-white"/>
                </div>
                <div className="flex gap-1 items-center">
                  <span className="text-[9px] text-slate-400 shrink-0">结束</span>
                  <input type="date" value={newLeave.endDate}
                    min={newLeave.startDate || selDay}
                    onChange={e => setNewLeave(s => ({...s, endDate: e.target.value}))}
                    placeholder="单天可不填"
                    className="text-[10px] px-1.5 py-1 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-400 flex-1 bg-white"/>
                </div>
                <input placeholder="原因 (选填)" value={newLeave.reason}
                  onChange={e => setNewLeave(s => ({...s, reason: e.target.value}))}
                  className="text-[10px] px-2 py-1 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-400 w-full"/>
                <button onClick={() => {
                  const start = newLeave.startDate || selDay!;
                  if (!start || !newLeave.empName.trim()) return;
                  const end = newLeave.endDate && newLeave.endDate > start ? newLeave.endDate : undefined;
                  saveLeaves([...leaves, { id: Date.now().toString(), date: start, endDate: end, empName: newLeave.empName.trim(), shift: newLeave.shift, reason: newLeave.reason||undefined }]);
                  setNewLeave(s => ({ ...s, empName:'', endDate:'', reason:'' }));
                }} className="text-[10px] font-black text-white bg-teal-600 hover:bg-teal-700 rounded-lg px-2 py-1 transition-colors">
                  + 记录请假
                </button>
              </div>
            </div>
          )}

          {/* Next 7 days leave reminder */}
          <div className="bg-white border border-slate-200 rounded-xl p-2.5 shrink-0">
            <p className="text-[10px] font-black text-slate-700 mb-2">📋 近7天请假提醒</p>
            {upcomingLeaves.length === 0 ? (
              <p className="text-[9px] text-slate-400">暂无请假安排</p>
            ) : upcomingLeaves.map(({ date, ls }) => (
              <div key={date} className="mb-2">
                <p className="text-[9px] font-black text-slate-500 mb-1">
                  {date === todayStr ? '今天' : date.slice(5).replace('-','/')}
                </p>
                {ls.map(l => (
                  <div key={`${l.id}-${date}`} className="flex items-center gap-1.5 text-[9px] ml-1 mb-0.5">
                    <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', l.shift==='morning'?'bg-amber-400':'bg-indigo-500')}/>
                    <span className="font-bold text-slate-700 flex-1 truncate">{l.empName}</span>
                    {l.endDate && l.endDate !== l.date
                      ? <span className="text-slate-400 text-[8px] shrink-0">{l.date.slice(5).replace('-','/')}~{l.endDate.slice(5).replace('-','/')}</span>
                      : null}
                    {l.reason && <span className="text-slate-400 text-[8px]">— {l.reason}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="bg-white border border-slate-200 rounded-xl p-2.5 shrink-0">
            <p className="text-[9px] font-black text-slate-500 mb-1.5">评估状态图例</p>
            <div className="flex items-center gap-1.5">
              {([
                ['bg-green-100  text-green-700',  '✓考核'],
                ['bg-orange-100 text-orange-600', '?待考'],
                ['bg-red-100    text-red-600',    '✗未过'],
              ] as const).map(([badge, label]) => (
                <span key={label} className={cn('text-[8px] font-black px-1.5 py-0.5 rounded-md', badge)}>{label}</span>
              ))}
            </div>
          </div>

          {/* Bottom-right action buttons */}
          <div className="flex flex-col gap-1.5 shrink-0 mt-auto">
            {(() => {
              const allKeys = (['morning','afternoon'] as const).flatMap(sh => [
                ...SL_MACHINES.map(m => `${m}-${sh}`),
                ...SL_MACHINES.map(m => `packer-${m}-${sh}`),
                ...MAIN_MACHINES.map(m => `${m}-${sh}`),
                ...employees.filter(e => e.shift===sh && (e.role==='crane'||e.role==='loader')).map(e => `loader-${e.id}`),
              ]);
              if (wageUnlocked) {
                return (
                  <button onClick={() => { setCollapsedCards(new Set(allKeys)); setWageUnlocked(false); }}
                    className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-[10px] font-black rounded-xl transition-colors bg-slate-700 text-white hover:bg-slate-800">
                    <ChevronUp size={13}/>折叠
                  </button>
                );
              }
              return (
                <button onClick={() => setWageModal(true)}
                  className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-[10px] font-black rounded-xl transition-colors bg-slate-100 text-slate-500 hover:bg-slate-200">
                  <ChevronDown size={13}/>展开
                </button>
              );
            })()}
            <button onClick={() => setPersonnelMgmt(true)}
              className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-[10px] font-black rounded-xl transition-colors bg-slate-100 text-slate-500 hover:bg-slate-200">
              <Users size={13}/>人员名单
            </button>
            {/* Sync from latest biweekly period */}
            {(() => {
              const latest = ivBiWeeklyEff[ivBiWeeklyEff.length - 1];
              return (
                <div className="flex flex-col gap-1">
                  <button
                    onClick={syncFromBiWeekly}
                    disabled={!latest}
                    className={cn(
                      'flex items-center justify-center gap-1.5 w-full px-3 py-2 text-[10px] font-black rounded-xl transition-colors',
                      latest
                        ? 'bg-teal-600 text-white hover:bg-teal-700'
                        : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                    )}>
                    <TrendingUp size={13}/>同步双周效率
                  </button>
                  {latest && (
                    <p className="text-[8px] text-slate-400 text-center leading-tight">
                      {latest.label || latest.periodStart}<br/>
                      <span className="text-slate-300">{latest.entries.length}人</span>
                    </p>
                  )}
                </div>
              );
            })()}
            {/* xlsx manual upload (fallback) */}
            <label className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-[10px] font-black text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer transition-colors">
              <Upload size={13}/>xlsx上传
              <input type="file" accept=".xlsx" className="hidden" onChange={e => { const f=e.target.files?.[0]; if(f) handleXlsxUpload(f); e.target.value=''; }}/>
            </label>
          </div>
        </div>
      </div>

      {/* ── Interview Modal ── */}
      {ivSelectedId && ivSelectedProfile && (() => {
        // Find the slot employee via profileId link (new) or legacy id match
        const ivSelectedEmp = employees.find(e => e.profileId === ivSelectedId)
          ?? employees.find(e => e.id === ivSelectedId)
          ?? null;
        const tlType = ivSelectedProfile.tlType ?? (ivSelectedProfile.role === 'supervisor' ? 'production' : null);
        const isIvTL = !!tlType;
        const ivTLDims = tlType === 'loader' ? IV_LOADER_TL_DIMS : IV_PROD_TL_DIMS;

        const ScoreDots = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
          <div className="flex gap-0.5">
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => onChange(value === n ? 0 : n)}
                className={cn('w-[18px] h-[18px] rounded-sm text-[8px] font-black border transition-all',
                  n <= value ? 'bg-teal-500 text-white border-teal-500' : 'bg-white text-slate-300 border-slate-200 hover:border-teal-300')}>
                {n}
              </button>
            ))}
          </div>
        );

        const ScoreRow = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-600 w-20 shrink-0">{label}</span>
            {ScoreDots({ value, onChange })}
            <span className={cn('text-[11px] font-black w-4 tabular-nums', value > 0 ? 'text-teal-600' : 'text-slate-300')}>{value || '—'}</span>
          </div>
        );

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeIvModal}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"/>
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}>

              {/* ── Header: name left, skills right ── */}
              <div className="px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
                {/* Row 1: identity + scores + close — never wraps */}
                <div className="flex items-start gap-6 flex-nowrap overflow-hidden">

                  {/* Left: identity */}
                  <div className="min-w-0 shrink-0">
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      <span className={cn('text-[9px] font-black px-2 py-0.5 rounded-full',
                        ivSelectedProfile.shift === 'AM' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700')}>
                        {ivSelectedProfile.shift}
                      </span>
                      <span className={cn('text-[9px] font-bold px-2 py-0.5 rounded-full',
                        ivSelectedProfile.type === 'fulltime' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                        {ivSelectedProfile.type === 'fulltime' ? 'Full-time' : 'Casual'}
                      </span>
                      {/* TL type dropdown */}
                      <select
                        value={tlType ?? ''}
                        onChange={e => {
                          const v = e.target.value;
                          patchIvProfile({ tlType: v === 'production' || v === 'loader' ? v : undefined });
                        }}
                        className={cn(
                          'text-[8px] font-black px-2 py-0.5 rounded-full border appearance-none cursor-pointer focus:outline-none transition-all',
                          tlType === 'production' || tlType === 'loader'
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-slate-50 text-slate-500 border-slate-200'
                        )}
                      >
                        <option value="">普通</option>
                        <option value="production">⭐ 生产TL</option>
                        <option value="loader">⭐ 装车TL</option>
                      </select>
                    </div>
                    <h2 className={cn('text-2xl font-black', isIvTL ? 'text-purple-900' : 'text-slate-800')}>{ivSelectedProfile.name}</h2>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                      {PEOPLE_ROLE_LABELS[ivSelectedProfile.role] ?? ivSelectedProfile.role}
                      {isIvTL && <span className="ml-1.5 text-purple-500 font-black">{tlType === 'loader' ? '· 装车 Team Leader' : '· 生产 Team Leader'}</span>}
                    </p>
                    {/* Visa info */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <div className="flex items-center gap-1">
                        <span className="text-[8px] text-slate-400 font-medium">签证</span>
                        <input
                          value={ivSelectedProfile.visaType ?? ''}
                          onChange={e => patchIvProfile({ visaType: e.target.value })}
                          placeholder="类型"
                          className={cn(
                            'text-[9px] font-black px-1.5 py-0.5 rounded border w-16 focus:outline-none focus:border-blue-300 transition-colors',
                            ivSelectedProfile.visaType ? 'border-blue-200 text-blue-700 bg-blue-50/60' : 'border-slate-200 text-slate-400 bg-slate-50'
                          )}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[8px] text-slate-400 font-medium">到期</span>
                        <input
                          type="date"
                          value={ivSelectedProfile.visaExpiry ?? ''}
                          onChange={e => patchIvProfile({ visaExpiry: e.target.value })}
                          className={cn(
                            'text-[9px] font-black px-1.5 py-0.5 rounded border focus:outline-none focus:border-blue-300 transition-colors',
                            (() => {
                              if (!ivSelectedProfile.visaExpiry) return 'border-slate-200 text-slate-400 bg-slate-50';
                              const days = Math.ceil((new Date(ivSelectedProfile.visaExpiry).getTime() - Date.now()) / 86400000);
                              return days < 30 ? 'border-red-300 text-red-600 bg-red-50' : days < 90 ? 'border-amber-300 text-amber-700 bg-amber-50' : 'border-blue-200 text-blue-700 bg-blue-50/60';
                            })()
                          )}
                        />
                        {ivSelectedProfile.visaExpiry && (() => {
                          const days = Math.ceil((new Date(ivSelectedProfile.visaExpiry).getTime() - Date.now()) / 86400000);
                          if (days < 0) return <span className="text-[8px] font-black text-red-600">已过期</span>;
                          if (days < 30) return <span className="text-[8px] font-black text-red-500">{days}天</span>;
                          if (days < 90) return <span className="text-[8px] font-black text-amber-600">{days}天</span>;
                          return null;
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Middle: overall avg scores (from quarterly assessments) */}
                  {(() => {
                    const qas = qAssessments.filter(q => q.profileId === ivSelectedId);
                    const hasAny = qas.length > 0;
                    // Quarterly avg for a scored field (values / workScores)
                    const qAvg = (key: string, scoreField: 'values' | 'workScores' | 'tlScores') => {
                      if (!hasAny) return 0;
                      const scored = qas.filter(q => ((q[scoreField] as unknown as Record<string,number>)?.[key] ?? 0) > 0);
                      if (!scored.length) return 0;
                      return scored.reduce((s, q) => s + (((q[scoreField] as unknown as Record<string,number>)?.[key]) ?? 0), 0) / scored.length;
                    };

                    // For TL: average auto-score per dim from biweekly records
                    const ivRecords = ivSelectedInterviews;
                    const tlDimAvg = (dimKey: string): number => {
                      if (!ivRecords.length) return 0;
                      const scores = ivRecords.map(iv => {
                        const issues = (iv.workIssues?.[dimKey] ?? []).filter((s: string) => s.trim()).length;
                        const good   = (iv.workGood?.[dimKey]   ?? []).filter((s: string) => s.trim()).length;
                        return Math.min(5, Math.max(1, 5 - issues + good));
                      });
                      return scores.reduce((a, b) => a + b, 0) / scores.length;
                    };
                    // Bonus/efficiency dim avg score
                    const bonusAvg = (): number => {
                      const withBonus = ivRecords.filter(iv => (iv.bonus ?? 0) > 0);
                      if (!withBonus.length) return 0;
                      const isLoaderTL = tlType === 'loader';
                      const scores = withBonus.map(iv => {
                        const b = iv.bonus ?? 0;
                        return isLoaderTL ? (b >= 170 ? 5 : b >= 130 ? 4 : 3) : (b >= 200 ? 5 : 4);
                      });
                      return scores.reduce((a, b) => a + b, 0) / scores.length;
                    };

                    const ScoreDot = ({ avg, color }: { avg: number; color: string }) => {
                      const filled = Math.round(avg);
                      return (
                        <div className="flex gap-0.5">
                          {[1,2,3,4,5].map(n => (
                            <div key={n} className={cn('w-[14px] h-[14px] rounded-sm text-[7px] font-black border flex items-center justify-center',
                              n <= filled ? color : 'bg-slate-50 text-slate-200 border-slate-200')}>{n}</div>
                          ))}
                        </div>
                      );
                    };

                    const ScoreRow2 = ({ label, avg, color, textColor }: { label: string; avg: number; color: string; textColor: string }) => (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-slate-500 w-[60px] shrink-0 truncate">{label}</span>
                        {ScoreDot({ avg, color })}
                        <span className={cn('text-[10px] font-black w-6 tabular-nums', avg > 0 ? textColor : 'text-slate-300')}>
                          {avg > 0 ? avg.toFixed(1) : '—'}
                        </span>
                      </div>
                    );

                    if (isIvTL) {
                      // TL header: values (quarterly) + full TL dims (biweekly avg)
                      const bAvg = bonusAvg();
                      return (
                        <div className="shrink-0 flex gap-4">
                          {/* Values (quarterly) */}
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">价值观评分</span>
                              {hasAny && <span className="text-[7px] text-slate-300">({qas.length}季)</span>}
                            </div>
                            {(IV_VALUES_DIMS as {key:string;label:string}[]).map(({ key, label }) =>
                              ScoreRow2({ label, avg: qAvg(key, 'values'), color: 'bg-teal-500 text-white border-teal-500', textColor: 'text-teal-600' })
                            )}
                          </div>
                          <div className="w-px bg-slate-100 self-stretch"/>
                          {/* TL dims (biweekly avg) */}
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[7px] font-black text-purple-400 uppercase tracking-widest">{tlType === 'loader' ? '装车TL' : '生产TL'}职责</span>
                              {ivRecords.length > 0 && <span className="text-[7px] text-slate-300">({ivRecords.length}期均值)</span>}
                            </div>
                            {/* Efficiency/bonus dim */}
                            {ScoreRow2({ label: '产能效率', avg: bAvg, color: 'bg-purple-500 text-white border-purple-500', textColor: 'text-purple-600' })}
                            {/* All TL dims */}
                            {ivTLDims.map(({ key, label: defaultLbl }) => {
                              const label = ivSelectedProfile?.tlDimLabels?.[key] ?? defaultLbl;
                              return ScoreRow2({ label, avg: tlDimAvg(key), color: 'bg-purple-500 text-white border-purple-500', textColor: 'text-purple-600' });
                            })}
                          </div>
                        </div>
                      );
                    }

                    // Non-TL: values (quarterly) + work dims (quarterly)
                    return (
                      <div className="shrink-0 flex gap-4">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">价值观评分</span>
                            {hasAny && <span className="text-[7px] text-slate-300">({qas.length}季均值)</span>}
                          </div>
                          {(IV_VALUES_DIMS as {key:string;label:string}[]).map(({ key, label }) =>
                            ScoreRow2({ label, avg: qAvg(key, 'values'), color: 'bg-teal-500 text-white border-teal-500', textColor: 'text-teal-600' })
                          )}
                        </div>
                        <div className="w-px bg-slate-100 self-stretch"/>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">工作职责</span>
                            {hasAny && <span className="text-[7px] text-slate-300">({qas.length}季均值)</span>}
                          </div>
                          {(IV_WORK_DIMS as {key:string;label:string}[]).map(({ key, label }) =>
                            ScoreRow2({ label, avg: qAvg(key, 'workScores'), color: 'bg-teal-500 text-white border-teal-500', textColor: 'text-teal-600' })
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Spacer pushes close button to right */}
                  <div className="flex-1"/>
                  <button onClick={closeIvModal} className="text-slate-300 hover:text-slate-600 transition-colors shrink-0 mt-1"><X size={20}/></button>
                </div>

                {/* Row 2: sticker categories — wraps freely */}
                <div className="flex flex-wrap gap-3 mt-3">
                  {([
                    { sk: 'packer',   label: 'Packer',   upload: 'border-purple-200 text-purple-300 hover:border-purple-400 hover:text-purple-500', single: true },
                    { sk: 'loader',   label: 'Loader',   upload: 'border-cyan-200 text-cyan-300 hover:border-cyan-400 hover:text-cyan-500',         single: true },
                    { sk: 'operator', label: 'Operator', upload: 'border-teal-200 text-teal-300 hover:border-teal-400 hover:text-teal-500',         single: false },
                    { sk: 'support',  label: 'Support',  upload: 'border-orange-200 text-orange-300 hover:border-orange-400 hover:text-orange-500', single: false },
                  ] as const).map(({ sk, label, upload, single }) => {
                    const srcs = ivSelectedProfile.stickers?.[sk] ?? [];
                    const pid = `iv-sticker-${sk}-${ivSelectedProfile.id}`;
                    const showUpload = !single || srcs.length === 0;
                    return (
                      <div key={sk} className="flex flex-col gap-0.5">
                        <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
                        <div className="flex flex-wrap gap-1">
                          {srcs.map((src, i) => (
                            <div key={i} className="relative group w-[48px] h-[48px] shrink-0 rounded-md overflow-hidden bg-white">
                              <img src={src} alt="" className="w-full h-full object-contain"/>
                              <button onClick={() => patchIvProfile({ stickers: { ...ivSelectedProfile.stickers, [sk]: srcs.filter((_,idx)=>idx!==i) } })}
                                className="absolute inset-0 bg-black/60 hidden group-hover:flex items-center justify-center rounded-md">
                                <X size={8} className="text-white"/>
                              </button>
                            </div>
                          ))}
                          {showUpload && (
                            <label htmlFor={pid} className={`w-[48px] h-[48px] shrink-0 rounded-md border-2 border-dashed flex items-center justify-center transition-colors cursor-pointer ${upload}`}>
                              <input id={pid} type="file" accept="image/*" className="hidden" onChange={e => {
                                const f = e.target.files?.[0]; if (!f) return;
                                const r = new FileReader();
                                r.onload = ev => patchIvProfile({ stickers: { ...ivSelectedProfile.stickers, [sk]: [...srcs, ev.target?.result as string] } });
                                r.readAsDataURL(f); e.target.value = '';
                              }}/>
                              <Plus size={9}/>
                            </label>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Body ── */}
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

                {/* Action bar */}
                <div className="flex items-center justify-between px-6 pt-4 pb-2 shrink-0">
                  <div className="text-[9px] font-black text-slate-400 tracking-widest uppercase">双周面谈记录</div>
                  {!ivAddingNew && !ivEditingId && (
                    <button onClick={() => { setIvAddingNew(true); setIvEditingId(null); setIvEditDraft(null); }}
                      className="flex items-center gap-1 px-3 py-1 rounded-full text-[9px] font-black bg-teal-50 text-teal-700 border border-teal-300 hover:bg-teal-100 transition-all">
                      <Plus size={9}/> 新建面谈
                    </button>
                  )}
                </div>

                {/* New / Edit form panel */}
                {(ivAddingNew || ivEditingId) && (() => {
                  const isNew = ivAddingNew;
                  const entry = isNew ? ivNewEntry : ivEditDraft!;
                  const setEntry = isNew
                    ? (fn: (p: typeof ivNewEntry) => typeof ivNewEntry) => setIvNewEntry(fn)
                    : (fn: (p: NonNullable<typeof ivEditDraft>) => NonNullable<typeof ivEditDraft>) => setIvEditDraft(p => p ? fn(p) : p);
                  if (!entry) return null;
                  return (
                    <div className="shrink-0 overflow-y-auto max-h-[50%] px-6 pb-4 border-b border-slate-100">
                      <div className="rounded-2xl border border-teal-200 bg-teal-50/20 p-4 space-y-3">
                        {/* Top row: period + supervisor */}
                        <div className="flex flex-wrap items-end gap-3">
                          <div>
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">周期开始</label>
                            <input type="date" value={entry.periodStart} onChange={e => setEntry(p => ({...p, periodStart: e.target.value}))}
                              className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-teal-400 bg-white"/>
                          </div>
                          <span className="text-slate-400 mb-1">~</span>
                          <div>
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">周期结束</label>
                            <input type="date" value={entry.periodEnd} onChange={e => setEntry(p => ({...p, periodEnd: e.target.value}))}
                              className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-teal-400 bg-white"/>
                          </div>
                          <div>
                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Supervisor</label>
                            <input value={entry.supervisor} onChange={e => setEntry(p => ({...p, supervisor: e.target.value}))} placeholder="姓名"
                              className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-teal-400 bg-white w-28"/>
                          </div>
                        </div>
                        {/* 面谈摘要 */}
                        <div>
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">面谈摘要</label>
                          <textarea value={entry.interviewSummary} onChange={e => setEntry(p => ({...p, interviewSummary: e.target.value}))}
                            rows={2} placeholder="本次面谈要点..." className="w-full text-[11px] border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-teal-400 resize-none bg-white"/>
                        </div>
                        {/* Work dimensions */}
                        <div>
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">{isIvTL ? '管理职责' : '工作职责'}</label>
                          {isIvTL ? (
                            /* TL: efficiency card + issue list per dim (auto-scored) */
                            <div className="space-y-2">
                              {/* Efficiency / bonus card (same as operators) */}
                              {(() => {
                                const profName = ivSelectedProfile?.name ?? '';
                                const profRole = ivSelectedProfile?.role ?? '';
                                const effPeriod = ivBiWeeklyEff.find(p =>
                                  p.periodStart <= (entry.periodEnd || '9999') && p.periodEnd >= (entry.periodStart || '0000')
                                );
                                const effEntry = effPeriod?.entries.find(e => e.operator.trim().toLowerCase() === profName.trim().toLowerCase());
                                const displayBonus = entry.bonus > 0 ? entry.bonus : (effEntry?.bonus ?? 0);
                                const isLoader = tlType === 'loader';
                                const computedScore = displayBonus <= 0 ? 0 : isLoader
                                  ? (displayBonus >= 170 ? 5 : displayBonus >= 130 ? 4 : 3)
                                  : (displayBonus >= 200 ? 5 : 4);
                                return (
                                  <div className="bg-white rounded-xl border border-purple-100 p-2.5">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-[10px] font-black text-slate-600">产能效率</span>
                                      {computedScore > 0 && <span className={cn('text-[9px] font-black px-2 py-0.5 rounded-full', computedScore >= 5 ? 'bg-teal-100 text-teal-700' : 'bg-emerald-100 text-emerald-700')}>{computedScore}/5</span>}
                                    </div>
                                    <div className="flex items-center gap-4 flex-wrap">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] text-slate-400 shrink-0">奖金 $</span>
                                        <input type="number" min={0} step={1} value={entry.bonus || ''} onChange={e => setEntry(p => ({...p, bonus: parseFloat(e.target.value)||0}))}
                                          placeholder={effEntry?.bonus ? String(effEntry.bonus) : '0'}
                                          className="w-20 text-[11px] font-black border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-purple-300 bg-white"/>
                                        {effEntry?.bonus && entry.bonus === 0 && (
                                          <button onClick={() => setEntry(p => ({...p, bonus: effEntry!.bonus!}))} className="text-[8px] text-purple-500 hover:text-purple-700 px-1.5 py-0.5 rounded bg-purple-50">填入 ${effEntry.bonus}</button>
                                        )}
                                      </div>
                                      {effEntry && <span className="text-[9px] text-slate-400">效率 <span className="font-black text-teal-600">{effEntry.avgKgH.toFixed(2)}</span> T/h</span>}
                                    </div>
                                  </div>
                                );
                              })()}
                              {/* TL responsibility dims — good records + issue records + auto-score */}
                              <div className="grid grid-cols-2 gap-2">
                                {ivTLDims.map(({ key, label: defaultLabel }) => {
                                  const customLabel = ivSelectedProfile?.tlDimLabels?.[key];
                                  const label = customLabel ?? defaultLabel;
                                  const issues = entry.workIssues?.[key] ?? [];
                                  const good   = entry.workGood?.[key]   ?? [];
                                  const issCount = issues.filter(s => s.trim()).length;
                                  const goodCount = good.filter(s => s.trim()).length;
                                  const autoScore = Math.min(5, Math.max(1, 5 - issCount + goodCount));
                                  return (
                                    <div key={key} className="bg-white rounded-xl border border-purple-50 p-2.5 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <input
                                          value={label}
                                          onChange={e => patchIvProfile({ tlDimLabels: { ...ivSelectedProfile?.tlDimLabels, [key]: e.target.value } })}
                                          className="text-[10px] font-black text-purple-800 bg-transparent focus:outline-none focus:border-b focus:border-purple-200 min-w-0 flex-1 truncate"
                                          title="点击编辑维度名称"
                                        />
                                        <span className={cn('text-[9px] font-black px-1.5 py-0.5 rounded-full',
                                          autoScore >= 5 ? 'bg-teal-100 text-teal-700' : autoScore >= 4 ? 'bg-emerald-100 text-emerald-700' : autoScore >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600')}>
                                          {autoScore}/5
                                        </span>
                                      </div>
                                      {/* Good records */}
                                      <div className="space-y-1">
                                        {good.map((g, idx) => (
                                          <div key={idx} className="flex gap-1 items-start">
                                            <textarea value={g} rows={1} placeholder="好的表现..."
                                              onChange={e => setEntry(p => { const arr=[...(p.workGood?.[key]??[])]; arr[idx]=e.target.value; return {...p, workGood:{...p.workGood,[key]:arr}}; })}
                                              className="flex-1 text-[10px] border border-emerald-100 rounded px-1.5 py-1 focus:outline-none focus:border-emerald-300 resize-none bg-emerald-50/40 placeholder-slate-300"/>
                                            <button onClick={() => setEntry(p => { const arr=(p.workGood?.[key]??[]).filter((_,i)=>i!==idx); return {...p, workGood:{...p.workGood,[key]:arr}}; })}
                                              className="mt-1 text-slate-300 hover:text-red-400 shrink-0"><X size={10}/></button>
                                          </div>
                                        ))}
                                        <button onClick={() => setEntry(p => ({ ...p, workGood: {...p.workGood, [key]: [...(p.workGood?.[key]??[]), '']} }))}
                                          className="flex items-center gap-0.5 text-[9px] text-emerald-500 hover:text-emerald-700">
                                          <Plus size={9}/>好的记录
                                        </button>
                                      </div>
                                      {/* Issue records */}
                                      <div className="space-y-1 border-t border-slate-50 pt-1">
                                        {issues.map((iss, idx) => (
                                          <div key={idx} className="flex gap-1 items-start">
                                            <textarea value={iss} rows={1} placeholder={`${label}问题...`}
                                              onChange={e => setEntry(p => { const arr=[...(p.workIssues?.[key]??[])]; arr[idx]=e.target.value; return {...p, workIssues:{...p.workIssues,[key]:arr}}; })}
                                              className="flex-1 text-[10px] border border-red-100 rounded px-1.5 py-1 focus:outline-none focus:border-red-200 resize-none bg-red-50/30 placeholder-slate-300"/>
                                            <button onClick={() => setEntry(p => { const arr=(p.workIssues?.[key]??[]).filter((_,i)=>i!==idx); return {...p, workIssues:{...p.workIssues,[key]:arr}}; })}
                                              className="mt-1 text-slate-300 hover:text-red-400 shrink-0"><X size={10}/></button>
                                          </div>
                                        ))}
                                        <button onClick={() => setEntry(p => ({ ...p, workIssues: {...p.workIssues, [key]: [...(p.workIssues?.[key]??[]), '']} }))}
                                          className="flex items-center gap-0.5 text-[9px] text-red-400 hover:text-red-600">
                                          <Plus size={9}/>记录问题
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            /* Operator: efficiency+bonus card + quality/safety/fiveS issue lists */
                            <div className="space-y-2">
                              {/* 奖金/效率 card */}
                              {(() => {
                                const profName = ivSelectedProfile?.name ?? '';
                                const profRole = ivSelectedProfile?.role ?? '';
                                const effPeriod = ivBiWeeklyEff.find(p =>
                                  p.periodStart <= (entry.periodEnd || '9999') && p.periodEnd >= (entry.periodStart || '0000')
                                );
                                const effEntry = effPeriod?.entries.find(e => e.operator.trim().toLowerCase() === profName.trim().toLowerCase());
                                // Auto-fill bonus from efficiency file if available and entry.bonus is 0
                                const displayBonus = entry.bonus > 0 ? entry.bonus : (effEntry?.bonus ?? 0);
                                // Auto-compute efficiency score from bonus + role
                                const isLoader = profRole === 'loader';
                                const computedScore = displayBonus <= 0 ? 0
                                  : isLoader
                                    ? (displayBonus >= 170 ? 5 : displayBonus >= 130 ? 4 : 3)
                                    : (displayBonus >= 200 ? 5 : 4); // operator: any bonus ≥ 4pts
                                return (
                                  <div className="bg-white rounded-xl border border-slate-100 p-2.5">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-[10px] font-black text-slate-600">奖金 / 效率</span>
                                      {computedScore > 0 && (
                                        <span className={cn('text-[9px] font-black px-2 py-0.5 rounded-full',
                                          computedScore >= 5 ? 'bg-teal-100 text-teal-700' : computedScore >= 4 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                                          {computedScore}/5
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-4 flex-wrap">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] text-slate-400 shrink-0">奖金 $</span>
                                        <input type="number" min={0} step={1}
                                          value={entry.bonus || ''}
                                          onChange={e => setEntry(p => ({...p, bonus: parseFloat(e.target.value)||0}))}
                                          placeholder={effEntry?.bonus ? String(effEntry.bonus) : '0'}
                                          className="w-20 text-[11px] font-black border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-teal-400 bg-white"/>
                                        {effEntry?.bonus && entry.bonus === 0 && (
                                          <button onClick={() => setEntry(p => ({...p, bonus: effEntry!.bonus!}))}
                                            className="text-[8px] text-teal-500 hover:text-teal-700 px-1.5 py-0.5 rounded bg-teal-50">
                                            填入 ${effEntry.bonus}
                                          </button>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] text-slate-400 shrink-0">效率</span>
                                        {effEntry ? (
                                          <div className="flex items-baseline gap-1">
                                            <span className="text-[13px] font-black text-teal-600">{effEntry.avgKgH.toFixed(2)}</span>
                                            <span className="text-[8px] text-slate-400">T/h</span>
                                          </div>
                                        ) : (
                                          <span className="text-[9px] text-slate-300 italic">{effPeriod ? '(名字未匹配)' : '(无数据)'}</span>
                                        )}
                                      </div>
                                    </div>
                                    {computedScore > 0 && (
                                      <div className="mt-1.5 text-[8px] text-slate-400">
                                        {isLoader
                                          ? `Loader: ≥$130→4分, ≥$170→5分`
                                          : `Operator: 有奖金→4分, ≥$200→5分`}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                              {/* Quality / Safety / 5S issue lists */}
                              <div className="grid grid-cols-3 gap-2">
                                {([
                                  { key: 'quality', label: '生产质量' },
                                  { key: 'safety',  label: '安全' },
                                  { key: 'fiveS',   label: '5S整理' },
                                ] as const).map(({ key, label }) => {
                                  const issues = entry.workIssues?.[key] ?? [];
                                  const autoScore = Math.max(1, 5 - issues.filter(s => s.trim()).length);
                                  return (
                                    <div key={key} className="bg-white rounded-xl border border-slate-100 p-2.5 space-y-1.5">
                                      <div className="flex items-center justify-between mb-0.5">
                                        <span className="text-[10px] font-black text-slate-600">{label}</span>
                                        <span className={cn('text-[9px] font-black px-1.5 py-0.5 rounded-full',
                                          autoScore >= 4 ? 'bg-teal-100 text-teal-700' : autoScore >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600')}>
                                          {autoScore}/5
                                        </span>
                                      </div>
                                      <div className="space-y-1">
                                        {issues.map((iss, idx) => (
                                          <div key={idx} className="flex gap-1 items-start">
                                            <textarea value={iss} rows={2}
                                              onChange={e => setEntry(p => { const arr=[...(p.workIssues?.[key]??[])]; arr[idx]=e.target.value; return {...p, workIssues:{...p.workIssues,[key]:arr}}; })}
                                              placeholder={`${label}问题...`}
                                              className="flex-1 text-[10px] border border-slate-100 rounded px-1.5 py-1 focus:outline-none focus:border-teal-300 resize-none bg-slate-50 placeholder-slate-300"/>
                                            <button onClick={() => setEntry(p => { const arr=(p.workIssues?.[key]??[]).filter((_,i)=>i!==idx); return {...p, workIssues:{...p.workIssues,[key]:arr}}; })}
                                              className="mt-1 text-slate-300 hover:text-red-400 shrink-0"><X size={10}/></button>
                                          </div>
                                        ))}
                                        <button onClick={() => setEntry(p => ({ ...p, workIssues: {...p.workIssues, [key]: [...(p.workIssues?.[key]??[]), '']} }))}
                                          className="flex items-center gap-0.5 text-[9px] text-teal-500 hover:text-teal-700">
                                          <Plus size={9}/>记录问题
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 pt-1 border-t border-teal-100">
                          {isNew ? (
                            <>
                              <button onClick={submitIvInterview} className="px-4 py-1.5 rounded-full text-[10px] font-black bg-teal-600 text-white hover:bg-teal-700 transition-all">保存记录</button>
                              <button onClick={() => setIvAddingNew(false)} className="px-3 py-1.5 rounded-full text-[10px] font-black bg-white text-slate-500 border border-slate-200 hover:border-slate-300 transition-all">取消</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => { saveIvInterviews(ivInterviews.map(i => i.id === ivEditingId ? {...i, ...ivEditDraft!} : i)); setIvEditingId(null); setIvEditDraft(null); }}
                                className="px-4 py-1.5 rounded-full text-[10px] font-black bg-teal-600 text-white hover:bg-teal-700 transition-all">保存修改</button>
                              <button onClick={() => { setIvEditingId(null); setIvEditDraft(null); }} className="px-3 py-1.5 rounded-full text-[10px] font-black bg-white text-slate-500 border border-slate-200 hover:border-slate-300 transition-all">取消</button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Quarterly assessment section */}
                {(() => {
                  const currentYear = new Date().getFullYear();
                  const quarters = [1, 2, 3, 4] as const;
                  const profileQas = qAssessments.filter(q => q.profileId === ivSelectedId && q.year === qViewYear);
                  const workDimsQ = isIvTL ? IV_TL_DIMS : IV_WORK_DIMS;
                  const workFieldQ = isIvTL ? 'tlScores' : 'workScores';
                  return (
                    <div className="shrink-0 px-6 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[9px] font-black text-slate-400 tracking-widest uppercase">季度评估</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setQViewYear(y => y - 1)} className="w-4 h-4 flex items-center justify-center text-slate-300 hover:text-slate-500 text-xs rounded transition-colors">‹</button>
                          <span className="text-[10px] font-black text-slate-600 w-10 text-center">{qViewYear}</span>
                          <button onClick={() => setQViewYear(y => y + 1)} disabled={qViewYear >= currentYear} className="w-4 h-4 flex items-center justify-center text-slate-300 hover:text-slate-500 text-xs rounded transition-colors disabled:opacity-30">›</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {quarters.map(q => {
                          const qa = profileQas.find(x => x.quarter === q);
                          const qLabel = `Q${q} ${['一','二','三','四'][q-1]}季度`;
                          return (
                            <div key={q} className={cn('rounded-xl p-2.5 transition-all', qa ? 'bg-slate-50/80' : 'bg-slate-50/30')}>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className={cn('text-[9px] font-black', qa ? 'text-slate-500' : 'text-slate-300')}>{qLabel}</span>
                                {qa ? (
                                  <button onClick={() => { setQDialogKey(`${ivSelectedId}-${qViewYear}-${q}`); setQDraft({year: qViewYear, quarter: q, values: {...qa.values}, workScores: {...qa.workScores}, tlScores: {...qa.tlScores}, notes: qa.notes}); }}
                                    className="text-[7px] font-black text-slate-300 hover:text-teal-600 px-1.5 py-0.5 rounded hover:bg-teal-50 transition-colors">编辑</button>
                                ) : (
                                  <button onClick={() => { setQDialogKey(`${ivSelectedId}-${qViewYear}-${q}`); setQDraft({...EMPTY_Q, year: qViewYear, quarter: q as 1|2|3|4}); }}
                                    className="w-5 h-5 flex items-center justify-center text-slate-200 hover:text-teal-400 hover:bg-teal-50 rounded-full transition-colors">
                                    <Plus size={10}/>
                                  </button>
                                )}
                              </div>
                              {qa ? (
                                <div className="space-y-1">
                                  <div>
                                    <div className="text-[7px] font-black text-slate-300 uppercase tracking-widest mb-0.5">价值观</div>
                                    {IV_VALUES_DIMS.map(({key, label: lbl}) => {
                                      const v = qa.values?.[key] ?? 0;
                                      return (
                                        <div key={key} className="flex items-center gap-1 mb-0.5">
                                          <span className="text-[7px] text-slate-400 w-10 shrink-0 truncate">{lbl}</span>
                                          <div className="flex gap-px">{[1,2,3,4,5].map(n => <div key={n} className={cn('w-1.5 h-1.5 rounded-[1px]', n <= v ? 'bg-teal-400' : 'bg-slate-150')}/>)}</div>
                                          <span className="text-[7px] font-black text-slate-500 tabular-nums">{v||''}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <div>
                                    <div className="text-[7px] font-black text-slate-300 uppercase tracking-widest mb-0.5">{isIvTL ? '管理' : '工作'}职责</div>
                                    {workDimsQ.map(({key, label: lbl}) => {
                                      const v = ((isIvTL ? qa.tlScores : qa.workScores) as unknown as Record<string,number>)?.[key] ?? 0;
                                      return (
                                        <div key={key} className="flex items-center gap-1 mb-0.5">
                                          <span className="text-[7px] text-slate-400 w-10 shrink-0 truncate">{lbl}</span>
                                          <div className="flex gap-px">{[1,2,3,4,5].map(n => <div key={n} className={cn('w-1.5 h-1.5 rounded-[1px]', n <= v ? 'bg-indigo-400' : 'bg-slate-150')}/>)}</div>
                                          <span className="text-[7px] font-black text-slate-500 tabular-nums">{v||''}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {qa.notes && <p className="text-[7px] text-slate-400 italic truncate" title={qa.notes}>{qa.notes}</p>}
                                </div>
                              ) : (
                                <p className="text-[8px] text-slate-200 text-center py-3">—</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Horizontal biweekly timeline */}
                {(() => {
                  const ANCHOR = '2025-04-30';
                  const DAY_MS = 86400000;
                  const PERIOD = 14;
                  const getPeriodIdx = (dateStr: string) => {
                    const ms = new Date(dateStr).getTime() - new Date(ANCHOR).getTime();
                    return Math.floor(ms / (PERIOD * DAY_MS));
                  };
                  const getPeriodRange = (idx: number) => {
                    const s = new Date(new Date(ANCHOR).getTime() + idx * PERIOD * DAY_MS);
                    const e = new Date(s.getTime() + (PERIOD - 1) * DAY_MS);
                    const fmt = (d: Date) => `${d.getMonth()+1}/${d.getDate()}`;
                    return { start: s.toISOString().slice(0,10), end: e.toISOString().slice(0,10), label: `${fmt(s)} ~ ${fmt(e)}` };
                  };
                  const today = new Date().toISOString().slice(0,10);
                  const curIdx = getPeriodIdx(today);

                  // Map interviews to their period (one per period, earliest date wins)
                  const byPeriod = new Map<number, BiWeeklyInterview>();
                  [...ivSelectedInterviews].reverse().forEach(iv => {
                    if (iv.periodStart) byPeriod.set(getPeriodIdx(iv.periodStart), iv);
                  });

                  const minIdx = byPeriod.size > 0 ? Math.min(...byPeriod.keys()) : curIdx - 2;
                  const indices = Array.from({ length: curIdx - minIdx + 2 }, (_, i) => minIdx + i);

                  return (
                    <div className="flex-1 min-h-0 overflow-x-auto px-6 py-4">
                      <div className="flex gap-3 h-full">
                        {indices.map(idx => {
                          const { start, end, label } = getPeriodRange(idx);
                          const iv = byPeriod.get(idx);
                          const isCurrent = idx === curIdx;
                          const isEditingThis = iv && ivEditingId === iv.id;
                          const gc = GRADE_COLOR[iv?.grade ?? ''] ?? GRADE_COLOR[''];

                          return (
                            <div key={idx} className="shrink-0 w-[210px] flex flex-col">
                              {/* Column header */}
                              <div className="flex items-center gap-1.5 mb-2 shrink-0">
                                <span className={cn('text-[10px] font-black', isCurrent ? 'text-teal-600' : 'text-slate-400')}>{label}</span>
                                {isCurrent && <span className="text-[7px] font-black bg-teal-100 text-teal-600 px-1.5 py-0.5 rounded-full">当前</span>}
                              </div>

                              {iv ? (
                                <div className={cn('flex-1 overflow-y-auto p-3 flex flex-col gap-2 group/col rounded-xl', isCurrent ? 'bg-teal-50/40' : 'bg-slate-50/60')}>
                                  {/* Supervisor + actions */}
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9px] text-slate-400">{iv.supervisor}</span>
                                    <div className="flex items-center gap-1 opacity-0 group-hover/col:opacity-100 transition-opacity">
                                      {!isEditingThis && (
                                        <button onClick={() => { setIvEditingId(iv.id); setIvAddingNew(false); setIvEditDraft({ periodStart: iv.periodStart, periodEnd: iv.periodEnd, supervisor: iv.supervisor, grade: iv.grade, values: {...iv.values}, workScores: {...iv.workScores}, tlScores: {...iv.tlScores}, notes: iv.notes, lowScoreReason: iv.lowScoreReason, interviewSummary: iv.interviewSummary, quarterlyAssessment: iv.quarterlyAssessment, workNotes: {...(iv.workNotes ?? {})}, bonus: iv.bonus ?? 0, workIssues: Object.fromEntries(Object.entries(iv.workIssues ?? {}).map(([k,v])=>[k,[...v]])), workGood: Object.fromEntries(Object.entries(iv.workGood ?? {}).map(([k,v])=>[k,[...v]])) }); }}
                                          className="text-[8px] font-black text-slate-400 hover:text-teal-600 px-1.5 py-0.5 rounded hover:bg-teal-50">编辑</button>
                                      )}
                                      <button onClick={() => saveIvInterviews(ivInterviews.filter(i => i.id !== iv.id))}
                                        className="text-slate-300 hover:text-red-400"><X size={10}/></button>
                                    </div>
                                  </div>
                                  {isEditingThis && <span className="text-[8px] font-black text-teal-500">编辑中...</span>}
                                  {/* 面谈摘要 */}
                                  {iv.interviewSummary ? (
                                    <div>
                                      <div className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">面谈摘要</div>
                                      <p className="text-[10px] text-slate-600 leading-relaxed whitespace-pre-wrap">{iv.interviewSummary}</p>
                                    </div>
                                  ) : null}
                                  {/* Work record display */}
                                  {isIvTL ? (
                                    /* TL: good + issue list per dim + auto-score */
                                    <div className="space-y-1">
                                      {ivTLDims.map(({ key, label: defaultLbl }) => {
                                        const lbl = ivSelectedProfile?.tlDimLabels?.[key] ?? defaultLbl;
                                        const issues = (iv.workIssues?.[key] ?? []).filter(s => s.trim());
                                        const good   = (iv.workGood?.[key]   ?? []).filter(s => s.trim());
                                        const autoScore = Math.min(5, Math.max(1, 5 - issues.length + good.length));
                                        if (!issues.length && !good.length) return null;
                                        return (
                                          <div key={key} className="rounded-lg p-1.5 bg-purple-50/60">
                                            <div className="flex items-center gap-1.5 mb-0.5">
                                              <span className="text-[8px] font-black text-purple-700 shrink-0">{lbl}</span>
                                              <span className={cn('text-[7px] font-black px-1 rounded-full', autoScore>=5?'bg-teal-100 text-teal-700':autoScore>=4?'bg-emerald-100 text-emerald-700':autoScore>=2?'bg-amber-100 text-amber-700':'bg-red-100 text-red-600')}>{autoScore}/5</span>
                                            </div>
                                            {good.length > 0 && good.map((g,i)=><p key={i} className="text-[8px] text-emerald-600 leading-snug">✓ {g}</p>)}
                                            {issues.length > 0 && issues.map((iss,i)=><p key={i} className="text-[8px] text-red-500 leading-snug">• {iss}</p>)}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    /* Operator: bonus+efficiency + quality/safety/fiveS issues */
                                    <div className="space-y-1.5">
                                      {/* Bonus / Efficiency */}
                                      {(() => {
                                        const profName = ivSelectedProfile?.name ?? '';
                                        const profRole = ivSelectedProfile?.role ?? '';
                                        const effPeriod = ivBiWeeklyEff.find(p => p.periodStart <= iv.periodEnd && p.periodEnd >= iv.periodStart);
                                        const effEntry = effPeriod?.entries.find(e => e.operator.trim().toLowerCase() === profName.trim().toLowerCase());
                                        const bonus = iv.bonus > 0 ? iv.bonus : (effEntry?.bonus ?? 0);
                                        const isLoader = profRole === 'loader';
                                        const score = bonus <= 0 ? 0 : isLoader
                                          ? (bonus >= 170 ? 5 : bonus >= 130 ? 4 : 3)
                                          : (bonus >= 200 ? 5 : 4);
                                        if (!bonus && !effEntry) return null;
                                        return (
                                          <div className="rounded-lg bg-white/70 p-1.5">
                                            <div className="flex items-center gap-2">
                                              {bonus > 0 && (
                                                <div className="flex items-center gap-1">
                                                  <span className="text-[8px] text-slate-400">奖金</span>
                                                  <span className="text-[9px] font-black text-emerald-600">${bonus}</span>
                                                  {score > 0 && <span className={cn('text-[7px] font-black px-1 rounded-full ml-0.5', score>=5?'bg-teal-100 text-teal-700':'bg-emerald-100 text-emerald-700')}>{score}/5</span>}
                                                </div>
                                              )}
                                              {effEntry && <span className="text-[8px] text-slate-400">效率 <span className="font-black text-slate-600">{effEntry.avgKgH.toFixed(2)}</span> T/h</span>}
                                            </div>
                                          </div>
                                        );
                                      })()}
                                      {/* Issue lists */}
                                      {([{key:'quality',label:'质量'},{key:'safety',label:'安全'},{key:'fiveS',label:'5S'}] as const).map(({key,label:lbl})=>{
                                        const issues = (iv.workIssues?.[key]??[]).filter(s=>s.trim());
                                        const autoScore = Math.max(1, 5 - issues.length);
                                        if (!issues.length) return null;
                                        return (
                                          <div key={key} className="rounded-lg bg-white/70 p-1.5">
                                            <div className="flex items-center gap-1.5 mb-0.5">
                                              <span className="text-[8px] font-black text-slate-500">{lbl}</span>
                                              <span className={cn('text-[7px] font-black px-1 rounded-full',autoScore>=4?'bg-teal-100 text-teal-700':autoScore>=2?'bg-amber-100 text-amber-700':'bg-red-100 text-red-600')}>{autoScore}/5</span>
                                            </div>
                                            {issues.map((iss,i)=><p key={i} className="text-[8px] text-slate-500 leading-snug">• {iss}</p>)}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-300 rounded-xl border border-dashed border-slate-150">
                                  <button onClick={() => { const r = getPeriodRange(idx); setIvNewEntry(p => ({...p, periodStart: r.start, periodEnd: r.end})); setIvAddingNew(true); setIvEditingId(null); setIvEditDraft(null); }}
                                    className="w-8 h-8 rounded-full flex items-center justify-center hover:text-teal-400 transition-colors">
                                    <Plus size={14}/>
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

            </div>

            {/* Quarterly assessment dialog */}
            {qDialogKey && qDraft && (() => {
              const [, yearStr, quarterStr] = qDialogKey.split('-');
              const qYear2 = parseInt(yearStr);
              const qQuarter = parseInt(quarterStr) as 1|2|3|4;
              const workDimsD = isIvTL ? IV_TL_DIMS : IV_WORK_DIMS;
              const workFieldD = isIvTL ? 'tlScores' : 'workScores';
              const handleSave = () => {
                const existing = qAssessments.find(q => q.profileId === ivSelectedId && q.year === qYear2 && q.quarter === qQuarter);
                if (existing) {
                  saveQAssessments(qAssessments.map(q => q.id === existing.id ? {...q, ...qDraft} : q));
                } else {
                  saveQAssessments([...qAssessments, { id: `${Date.now()}`, profileId: ivSelectedId!, ...qDraft }]);
                }
                setQDialogKey(null); setQDraft(null);
              };
              const handleDelete = () => {
                saveQAssessments(qAssessments.filter(q => !(q.profileId === ivSelectedId && q.year === qYear2 && q.quarter === qQuarter)));
                setQDialogKey(null); setQDraft(null);
              };
              return (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 backdrop-blur-sm rounded-3xl"
                  onClick={() => { setQDialogKey(null); setQDraft(null); }}>
                  <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[80vh] flex flex-col overflow-hidden m-4"
                    onClick={e => e.stopPropagation()}>
                    {/* Dialog header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                      <div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">季度评估</span>
                        <h3 className="text-base font-black text-slate-800">{qYear2}年 第{['一','二','三','四'][qQuarter-1]}季度</h3>
                      </div>
                      <button onClick={() => { setQDialogKey(null); setQDraft(null); }} className="text-slate-300 hover:text-slate-600"><X size={18}/></button>
                    </div>
                    {/* Dialog body */}
                    <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
                      {/* Helper: biweekly avg for values dims */}
                      {(() => {
                        const ivs = ivSelectedInterviews;
                        const bwValAvg = (k: string): number => {
                          const scored = ivs.filter(iv => ((iv.values as unknown as Record<string,number>)?.[k] ?? 0) > 0);
                          if (!scored.length) return 0;
                          return scored.reduce((s, iv) => s + ((iv.values as unknown as Record<string,number>)[k] ?? 0), 0) / scored.length;
                        };
                        const bwWorkAvg = (k: string): number => {
                          if (!ivs.length) return 0;
                          if (k === 'efficiency' || k === 'bonus') {
                            // use bonus-derived score same as header
                            const profRole = ivSelectedProfile?.role ?? '';
                            const profName = ivSelectedProfile?.name ?? '';
                            const withBonus = ivs.filter(iv => (iv.bonus ?? 0) > 0 || (() => {
                              const ep = ivBiWeeklyEff.find(p => p.periodStart <= iv.periodEnd && p.periodEnd >= iv.periodStart);
                              return (ep?.entries.find(e => e.operator.trim().toLowerCase() === profName.trim().toLowerCase())?.bonus ?? 0) > 0;
                            })());
                            if (!withBonus.length) return 0;
                            const isLdr = profRole === 'loader';
                            const scores = withBonus.map(iv => {
                              const ep = ivBiWeeklyEff.find(p => p.periodStart <= iv.periodEnd && p.periodEnd >= iv.periodStart);
                              const b = iv.bonus > 0 ? iv.bonus : (ep?.entries.find(e => e.operator.trim().toLowerCase() === profName.trim().toLowerCase())?.bonus ?? 0);
                              return b <= 0 ? 0 : isLdr ? (b >= 170 ? 5 : b >= 130 ? 4 : 3) : (b >= 200 ? 5 : 4);
                            }).filter(s => s > 0);
                            if (!scores.length) return 0;
                            return scores.reduce((a, b) => a + b, 0) / scores.length;
                          }
                          // issue-tracked dims
                          const scores = ivs.map(iv => {
                            const issues = (iv.workIssues?.[k] ?? []).filter((s: string) => s.trim()).length;
                            const good   = (iv.workGood?.[k]   ?? []).filter((s: string) => s.trim()).length;
                            return issues === 0 && good === 0 ? 0 : Math.min(5, Math.max(1, 5 - issues + good));
                          }).filter(s => s > 0);
                          if (!scores.length) return 0;
                          return scores.reduce((a, b) => a + b, 0) / scores.length;
                        };
                        const AvgBadge = ({ avg, color }: { avg: number; color: string }) => avg <= 0 ? (
                          <span className="text-[8px] text-slate-200 w-10 text-right tabular-nums shrink-0">—</span>
                        ) : (
                          <span className={cn('text-[8px] font-black w-10 text-right tabular-nums shrink-0', color)}>≈{avg.toFixed(1)}</span>
                        );
                        const DotRow5 = ({ val, active, onSet }: { val: number; active: string; onSet: (n: number) => void }) => (
                          <div className="flex gap-[2px]">
                            {[1,2,3,4,5].map(n => (
                              <button key={n} onClick={() => onSet(val === n ? 0 : n)}
                                className={cn('w-[18px] h-[18px] rounded-[3px] text-[8px] font-black border transition-all flex items-center justify-center',
                                  val >= n ? active : 'bg-slate-50 text-slate-300 border-slate-200 hover:border-slate-300')}>
                                {n}
                              </button>
                            ))}
                          </div>
                        );
                        return (
                          <>
                            {/* Values scores */}
                            <div>
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">价值观评分</span>
                                {ivs.length > 0 && <span className="text-[7px] text-slate-300">({ivs.length}期均值→)</span>}
                              </div>
                              <div className="space-y-1">
                                {IV_VALUES_DIMS.map(({key, label}) => {
                                  const cur = qDraft.values[key as keyof IvValuesScores] ?? 0;
                                  return (
                                    <div key={key} className="flex items-center gap-2">
                                      <span className="text-[9px] text-slate-600 w-16 shrink-0">{label}</span>
                                      <DotRow5 val={cur} active="bg-teal-500 text-white border-teal-500"
                                        onSet={n => setQDraft(p => p ? {...p, values: {...p.values, [key]: n}} : p)} />
                                      <span className={cn('text-[10px] font-black w-4 tabular-nums shrink-0', cur > 0 ? 'text-teal-600' : 'text-slate-200')}>{cur || '—'}</span>
                                      <AvgBadge avg={bwValAvg(key)} color="text-teal-400" />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            {/* Work/TL scores */}
                            <div>
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{isIvTL ? '管理职责' : '工作职责'}评分</span>
                                {ivs.length > 0 && <span className="text-[7px] text-slate-300">({ivs.length}期均值→)</span>}
                              </div>
                              <div className="space-y-1">
                                {workDimsD.map(({key, label}) => {
                                  const scoreObj = (qDraft[workFieldD] as unknown as Record<string,number>) ?? {};
                                  const val = scoreObj[key] ?? 0;
                                  return (
                                    <div key={key} className="flex items-center gap-2">
                                      <span className="text-[9px] text-slate-600 w-16 shrink-0">{label}</span>
                                      <DotRow5 val={val} active="bg-indigo-500 text-white border-indigo-500"
                                        onSet={n => setQDraft(p => {
                                          if (!p) return p;
                                          const cur = ((p[workFieldD] as unknown as Record<string,number>) ?? {})[key] ?? 0;
                                          return {...p, [workFieldD]: {...(p[workFieldD] as object), [key]: cur === n ? 0 : n}};
                                        })} />
                                      <span className={cn('text-[10px] font-black w-4 tabular-nums shrink-0', val > 0 ? 'text-indigo-600' : 'text-slate-200')}>{val || '—'}</span>
                                      <AvgBadge avg={bwWorkAvg(key)} color="text-indigo-400" />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </>
                        );
                      })()}
                      {/* Notes */}
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">备注</label>
                        <textarea value={qDraft.notes} onChange={e => setQDraft(p => p ? {...p, notes: e.target.value} : p)}
                          rows={3} placeholder="季度综合评价..."
                          className="w-full text-[11px] border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-400 resize-none bg-white"/>
                      </div>
                    </div>
                    {/* Dialog footer */}
                    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
                      <button onClick={handleDelete}
                        className="text-[10px] font-black text-red-400 hover:text-red-600 px-3 py-1.5 rounded-full hover:bg-red-50 transition-colors">
                        删除
                      </button>
                      <div className="flex gap-2">
                        <button onClick={() => { setQDialogKey(null); setQDraft(null); }}
                          className="px-4 py-1.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all">取消</button>
                        <button onClick={handleSave}
                          className="px-4 py-1.5 rounded-full text-[10px] font-black bg-teal-600 text-white hover:bg-teal-700 transition-all">保存</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}
    </SectionWrapper>
  );
};
