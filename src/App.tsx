import React, { useState, useEffect, useCallback } from 'react';
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
  TrendingUp
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
  Cell,
  PieChart,
  Pie
} from 'recharts';

// --- Types ---

type SectionType = 'S' | 'Q' | 'Prod' | 'D' | 'P' | 'M';

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
  { id: 'P', label: 'P', fullName: 'People', color: 'bg-purple-600', icon: Users },
  { id: 'M', label: 'M', fullName: 'Machine', color: 'bg-slate-700', icon: Cpu },
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

// --- Sub-components ---

const KPIBox = ({ label, value, unit, subtext, color }: any) => (
  <div className="bg-white border-l-4 p-4 rounded shadow-sm" style={{ borderLeftColor: color }}>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
    <div className="flex items-baseline gap-1 my-1">
      <h4 className="text-3xl font-black text-slate-800">{value}</h4>
      <span className="text-xs font-bold text-slate-400">{unit}</span>
    </div>
    <p className="text-[10px] font-medium text-slate-500">{subtext}</p>
  </div>
);

export default function App() {
  const [time, setTime] = useState(new Date());
  const [activeSection, setActiveSection] = useState<SectionType>('S');
  const [isAutoRotate, setIsAutoRotate] = useState(true);
  const currentShift = getCurrentShift(time);

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

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900 select-none overflow-hidden">
      {/* Header - PERSISTENT */}
      <header className="bg-white border-b-2 border-slate-200 px-6 py-4 flex justify-between items-center z-50 shadow-sm transition-all">
        <div className="flex items-center gap-6">
          <div className={cn("p-3 rounded-lg text-white shadow-lg transition-colors duration-500", currentSectionConfig.color)}>
            <currentSectionConfig.icon size={28} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black uppercase tracking-tighter leading-none">Indy Daily Direction Setting Board</h1>
              <span className={cn("px-2 py-0.5 rounded text-[10px] font-black text-white", currentSectionConfig.color)}>
                SECTION {activeSection}
              </span>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">MEP-SCHNELL STEEL PROCESSING NETWORK</p>
          </div>
        </div>
        
        <div className="flex items-center gap-8">
          {/* Controls */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button 
              onClick={prevSection}
              className="p-2 hover:bg-white rounded-lg text-slate-400 hover:text-slate-900 transition-all"
            >
              <ChevronLeft size={18} />
            </button>
            <button 
              onClick={() => setIsAutoRotate(!isAutoRotate)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                isAutoRotate ? "bg-blue-600 text-white shadow-md w-40" : "bg-white text-slate-600 border border-slate-200 w-40"
              )}
            >
              <div className="flex items-center gap-2 mx-auto">
                {isAutoRotate ? <RefreshCw size={14} className="animate-spin" /> : <Lock size={14} />}
                {isAutoRotate ? "Loop (10s)" : "Fixed View"}
              </div>
            </button>
            <button 
              onClick={nextSection}
              className="p-2 hover:bg-white rounded-lg text-slate-400 hover:text-slate-900 transition-all"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="h-10 w-px bg-slate-200" />
          
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status: {currentShift.name}</p>
            <div className="flex items-center gap-2 justify-end">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-lg font-mono font-black text-slate-800 leading-none">
                {time.toLocaleTimeString([], { hour12: false })}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Section Area */}
      <main className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {activeSection === 'S' && <SafetySection key="S" color={currentSectionConfig.color} />}
          {activeSection === 'Q' && <QualitySection key="Q" color={currentSectionConfig.color} />}
          {activeSection === 'Prod' && <ProductivitySection key="Prod" color={currentSectionConfig.color} />}
          {activeSection === 'D' && <DeliverySection key="D" color={currentSectionConfig.color} />}
          {activeSection === 'P' && <PeopleSection key="P" color={currentSectionConfig.color} />}
          {activeSection === 'M' && <MachineSection key="M" color={currentSectionConfig.color} />}
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

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=JetBrains+Mono:wght@700&display=swap');
      `}</style>
    </div>
  );
}

// --- Specific Section Components ---

interface SectionProps {
  color: string;
}

const SectionWrapper = ({ children, title, icon: Icon, color }: any) => (
  <motion.div
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    transition={{ duration: 0.5 }}
    className="absolute inset-0 p-6 flex flex-col gap-6"
  >
    <div className="flex items-center gap-3">
      <div className={cn("p-2 rounded-lg text-white", color)}>
        <Icon size={20} />
      </div>
      <h2 className="text-xl font-black uppercase tracking-widest text-slate-800">{title}</h2>
      <div className="flex-1 h-px bg-slate-200 ml-4" />
    </div>
    {children}
  </motion.div>
);

const SafetySection: React.FC<SectionProps> = ({ color }) => (
  <SectionWrapper title="Safety - No.1 Priority" icon={ShieldCheck} color={color}>
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <KPIBox label="Accident Free Days" value="150" unit="DAYS" subtext="Target: Zero Harm" color="#059669" />
      <KPIBox label="Weekly Observations" value="14" unit="DONE" subtext="100% On-time" color="#059669" />
      <KPIBox label="Near Miss Reports" value="1" unit="QTY" subtext="MTD Trend: Down" color="#D97706" />
      <KPIBox label="PPE Compliance" value="100" unit="%" subtext="Checked at Shift Start" color="#059669" />
    </div>
    
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        <div className="lg:col-span-2 bg-white border-2 border-slate-100 rounded-2xl p-6 shadow-sm flex flex-col">
            <h3 className="text-xs font-black uppercase text-slate-400 mb-6 tracking-widest">Global Safety Milestone Log</h3>
            <div className="flex-1 overflow-y-auto space-y-4">
                {[
                    { type: 'Safety Walk', msg: 'Area 2 (P22) floor markings verified.', time: '08:15 AM' },
                    { type: 'Hazard Mitigated', msg: 'Electrical cord at FT-1 cable tray secured.', time: 'Yesterday' },
                    { type: 'Training', msg: 'Fire Drill completed for all C-Shift personnel.', time: 'Last Week' },
                ].map((log, i) => (
                    <div key={i} className="flex gap-4 items-start p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><ShieldCheck size={16} /></div>
                        <div>
                            <p className="text-[10px] font-black text-emerald-700 uppercase">{log.type}</p>
                            <p className="text-xs font-medium text-slate-700">{log.msg}</p>
                            <p className="text-[9px] text-slate-400 mt-1 uppercase font-bold">{log.time}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
        <div className="bg-emerald-600 rounded-2xl p-8 text-white relative overflow-hidden shadow-xl shadow-emerald-600/20">
            <div className="absolute top-0 right-0 p-8 opacity-10">
                <ShieldCheck size={200} />
            </div>
            <h1 className="text-4xl font-black leading-tight mb-4">WE HAVE WORKED<br/><span className="text-emerald-300 text-6xl">150</span><br/>SAFE DAYS</h1>
            <p className="text-sm font-bold opacity-80 uppercase tracking-widest border-t border-white/20 pt-4">Together we make a difference.</p>
        </div>
    </div>
  </SectionWrapper>
);

const QualitySection: React.FC<SectionProps> = ({ color }) => (
  <SectionWrapper title="Quality - Perfection Guaranteed" icon={CheckCircle2} color={color}>
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <KPIBox label="First Pass Yield" value="98.2" unit="%" subtext="Target: 99.0%" color="#2563EB" />
      <KPIBox label="Internal Reject Rate" value="0.12" unit="%" subtext="-0.05% vs L.W." color="#2563EB" />
      <KPIBox label="Customer NCRs" value="0" unit="YTD" subtext="Benchmark Achievement" color="#059669" />
      <KPIBox label="Active Holds" value="2" unit="TAGS" subtext="Awaiting Inspection" color="#DC2626" />
    </div>
    
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border-2 border-slate-100 rounded-2xl p-6 shadow-sm">
            <h3 className="text-xs font-black uppercase text-slate-400 mb-6 tracking-widest">Yield Variance (Weekly)</h3>
            <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={generateWeeklyData(98, 1)}>
                        <XAxis dataKey="name" hide />
                        <Tooltip />
                        <Area type="monotone" dataKey="value" stroke="#2563EB" fill="#2563EB" fillOpacity={0.1} strokeWidth={4} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
        <div className="space-y-4">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest px-2">Quality Checkpoints</h3>
            {[
                { label: 'Surface Finish', status: 'PASS', score: 100 },
                { label: 'Bend Accuracy', status: 'PASS', score: 99.4 },
                { label: 'Weld Strength', status: 'WARN', score: 94.2 },
                { label: 'Weight Deviation', status: 'PASS', score: 99.8 },
            ].map((check, i) => (
                <div key={i} className="bg-white border border-slate-100 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded flex items-center justify-center text-white text-[10px] font-black", check.status === 'PASS' ? 'bg-emerald-500' : 'bg-amber-500')}>
                            {check.status}
                        </div>
                        <span className="text-xs font-black uppercase text-slate-700">{check.label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                        <span className="text-sm font-black text-slate-800">{check.score}%</span>
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-600" style={{width: `${check.score}%`}} />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    </div>
  </SectionWrapper>
);

const ProductivitySection: React.FC<SectionProps> = ({ color }) => (
  <SectionWrapper title="Productivity - Efficient Output" icon={TrendingUp} color={color}>
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <KPIBox label="Output vs Target" value="104" unit="%" subtext="Target: 1,200 Units" color="#0891B2" />
      <KPIBox label="OEE Performance" value="82.4" unit="%" subtext="+2.1% vs Benchmark" color="#0891B2" />
      <KPIBox label="Units Per Hour" value="158" unit="UPH" subtext="Shift Mean" color="#0891B2" />
      <KPIBox label="Idle Time" value="12" unit="MIN" subtext="Material Waiting" color="#D97706" />
    </div>
    
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border-2 border-slate-100 rounded-2xl p-6 shadow-sm">
            <h3 className="text-xs font-black uppercase text-slate-400 mb-6 tracking-widest">Shift Output Trend</h3>
            <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                        { name: '06:00', value: 120 },
                        { name: '08:00', value: 145 },
                        { name: '10:00', value: 110 },
                        { name: '12:00', value: 160 },
                        { name: '14:00', value: 130 },
                    ]}>
                        <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#0891B2" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
        <div className="bg-white border-2 border-slate-100 rounded-2xl p-6 shadow-sm flex flex-col">
            <h3 className="text-xs font-black uppercase text-slate-400 mb-4 tracking-widest">Productivity Insights</h3>
            <div className="space-y-4 flex-1 overflow-y-auto">
                {[
                    { label: 'Line Utilization', val: '92%', status: 'optimal' },
                    { label: 'Setup Reduction', val: '-14m', status: 'improved' },
                    { label: 'Changeover Time', val: '22m', status: 'target' },
                ].map((insight, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-tight">{insight.label}</p>
                            <p className="text-lg font-black text-slate-800">{insight.val}</p>
                        </div>
                        <div className={cn(
                            "px-2 py-1 rounded text-[8px] font-black uppercase",
                            insight.status === 'optimal' ? 'bg-emerald-100 text-emerald-700' : 
                            insight.status === 'improved' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-700'
                        )}>
                            {insight.status}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    </div>
  </SectionWrapper>
);

const DeliverySection: React.FC<SectionProps> = ({ color }) => (
  <SectionWrapper title="Delivery - Schedule Attainment" icon={Truck} color={color}>
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <KPIBox label="Plan Accomplished" value="94.6" unit="%" subtext="Target: 92%" color="#059669" />
      <KPIBox label="On-Time Dispatch" value="100" unit="%" subtext="All loads sent" color="#059669" />
      <KPIBox label="WIP Inventory" value="48.2" unit="T" subtext="+5t vs L.W." color="#D97706" />
      <KPIBox label="Mean Cycletime" value="34" unit="SEC" subtext="Norm: 32s" color="#D97706" />
    </div>

    <div className="flex-1 bg-white border-2 border-slate-100 rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col">
        <h3 className="text-xs font-black uppercase text-slate-400 mb-6 tracking-widest">Production Schedule Tracker</h3>
        <div className="flex-1 space-y-4 overflow-y-auto pr-4">
            {[
                { order: '#ORD-7742', client: 'Building Corp', status: 'Loading', progress: 95 },
                { order: '#ORD-7745', client: 'Steel Infra', status: 'In Production', progress: 62 },
                { order: '#ORD-7748', client: 'Mega Structure', status: 'Pending', progress: 0 },
                { order: '#ORD-7751', client: 'City Bridges', status: 'Waiting Mat', progress: 15 },
            ].map((ord, i) => (
                <div key={i} className="flex flex-col gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-100 group">
                    <div className="flex justify-between items-center">
                        <div>
                            <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">{ord.order}</span>
                            <h4 className="text-sm font-black text-slate-800">{ord.client}</h4>
                        </div>
                        <div className="text-right">
                             <span className="text-[10px] font-black text-slate-400 uppercase">{ord.status}</span>
                             <p className="text-lg font-black text-slate-800">{ord.progress}%</p>
                        </div>
                    </div>
                    <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden">
                        <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${ord.progress}%` }}
                            className="h-full bg-amber-500 rounded-full"
                        />
                    </div>
                </div>
            ))}
        </div>
    </div>
  </SectionWrapper>
);

const PeopleSection: React.FC<SectionProps> = ({ color }) => (
  <SectionWrapper title="People - Skill & Spirit" icon={Users} color={color}>
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <KPIBox label="Shift Attendance" value="98" unit="%" subtext="2 Out on Leave" color="#7C3AED" />
      <KPIBox label="Cross-Training" value="74" unit="%" subtext="Target: 80%" color="#D97706" />
      <KPIBox label="Certifications" value="6" unit="DONE" subtext="MTD Achievements" color="#059669" />
      <KPIBox label="H&S Briefing" value="100" unit="%" subtext="All Staff briefed" color="#059669" />
    </div>

    <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border-2 border-slate-100 rounded-2xl p-6 shadow-sm flex flex-col items-center justify-center gap-4">
            <div className="w-24 h-24 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600">
                <Users size={48} />
            </div>
            <h3 className="text-sm font-black uppercase text-slate-800 tracking-widest">Active Personnel</h3>
            <div className="flex -space-x-4">
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="w-12 h-12 rounded-full border-4 border-white bg-slate-200 overflow-hidden shadow-sm">
                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=user${i}`} alt="user" />
                    </div>
                ))}
                <div className="w-12 h-12 rounded-full border-4 border-white bg-purple-600 text-white flex items-center justify-center text-xs font-black shadow-sm">+19</div>
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">24 members present today</p>
        </div>
        <div className="lg:col-span-2 bg-purple-700 rounded-2xl p-8 text-white relative overflow-hidden flex items-center gap-10">
            <div className="absolute top-0 right-0 p-10 opacity-10">
                <Award size={180} />
            </div>
            <div className="w-40 h-40 rounded-2xl overflow-hidden border-4 border-purple-400 shadow-2xl skew-x-3">
                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Leo" alt="Award" className="w-full h-full object-cover" />
            </div>
            <div>
                <h4 className="text-xs font-black uppercase tracking-[0.3em] text-purple-300 mb-2">Team Achievement</h4>
                <h1 className="text-5xl font-black mb-4 leading-tight">MASTER OF<br/>EFFICIENCY</h1>
                <p className="text-purple-200 font-bold text-sm italic">Congratulations to the Afternoon B-Team for achieving 99% OEE on the FT-1 line last Friday.</p>
            </div>
        </div>
    </div>
  </SectionWrapper>
);

const MachineSection: React.FC<SectionProps> = ({ color }) => {
  const machines = [
    { name: 'FT-1', oee: 92, status: 'run' },
    { name: 'FT-2', oee: 88, status: 'run' },
    { name: 'MST', oee: 74, status: 'warn' },
    { name: 'P22', oee: 0, status: 'error' },
    { name: 'SL28', oee: 0, status: 'idle' },
    { name: 'SL32', oee: 81, status: 'run' },
    { name: 'SL300', oee: 96, status: 'run' },
    { name: 'Robo', oee: 98, status: 'run' },
  ];

  return (
    <SectionWrapper title="Machine - Plant Efficiency (OEE)" icon={Cpu} color={color}>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-2">
        <KPIBox label="Mean Plant OEE" value="79.2" unit="%" subtext="Across 8 Nodes" color="#334155" />
        <KPIBox label="Downtime MTD" value="12.4" unit="HRS" subtext="-2.1h vs monthly avg" color="#059669" />
        <KPIBox label="Active Alarms" value="1" unit="ERR" subtext="Crit: High - P22 Hub" color="#DC2626" />
        <KPIBox label="Maint. Pending" value="3" unit="QTY" subtext="Scheduled for 22:00" color="#334155" />
      </div>

      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-4 overflow-y-auto pr-2">
        {machines.map(m => (
          <div key={m.name} className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between hover:shadow-lg hover:-translate-y-1 transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                 <div className={cn(
                    "p-2 rounded-lg text-slate-700",
                    m.status === 'run' ? 'bg-emerald-50' : 
                    m.status === 'error' ? 'bg-red-50' : 'bg-slate-50'
                 )}><Cpu size={20} /></div>
                 <div>
                    <h4 className="font-black text-slate-800 text-lg leading-none">{m.name}</h4>
                    <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">CNC Active</p>
                 </div>
              </div>
              <div className={cn(
                "w-2.5 h-2.5 rounded-full",
                m.status === 'run' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]' :
                m.status === 'warn' ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.6)]' :
                m.status === 'error' ? 'bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 'bg-slate-300'
              )} />
            </div>
            
            <div className="flex-1 flex flex-col justify-center">
                <div className="flex items-baseline justify-between mb-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Efficiency</p>
                    <span className="text-2xl font-black text-slate-800">{m.oee}%</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-4">
                    <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${m.oee}%` }}
                        transition={{ duration: 1, delay: 0.2 }}
                        className={cn(
                            "h-full rounded-full transition-all",
                            m.oee > 90 ? 'bg-emerald-500' : m.oee > 70 ? 'bg-blue-500' : 'bg-red-500'
                        )} 
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="bg-slate-50 p-2 rounded-xl text-center">
                    <p className="text-[8px] font-bold text-slate-400 uppercase mb-0.5">Uptime</p>
                    <p className="text-xs font-black text-slate-700">{m.status === 'run' ? '12h' : '0h'}</p>
                </div>
                 <div className="bg-slate-50 p-2 rounded-xl text-center border border-slate-100">
                    <p className="text-[8px] font-bold text-slate-400 uppercase mb-0.5">Alerts</p>
                    <p className={cn("text-xs font-black", m.status === 'error' ? 'text-red-500' : 'text-slate-700')}>{m.status === 'error' ? '1' : '0'}</p>
                </div>
            </div>
          </div>
        ))}
      </div>
    </SectionWrapper>
  );
};
