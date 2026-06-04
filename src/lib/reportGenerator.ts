/**
 * reportGenerator.ts  v2
 * Fixes: Chinese font encoding | Section KPI cards | Highlight boxes
 * Structure mirrors: 月度例会-(最新Apr 2026).pages.pdf
 */

import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, HeadingLevel, AlignmentType, WidthType, BorderStyle,
  TableLayoutType, ShadingType, PageBreak, ImageRun, VerticalAlign,
} from 'docx';

// ─── Font & colour constants ───────────────────────────────────────────────
const FONT      = 'Microsoft YaHei';   // full CJK + Latin support
const FONT_MONO = 'Courier New';
const C_GREEN   = '1a6b3a';
const C_LGREEN  = 'd4edda';
const C_DBLUE   = '1e3a5f';
const C_LBLUE   = 'dbeafe';
const C_RED     = 'c0392b';
const C_LRED    = 'fde8e8';
const C_AMBER   = '92400e';
const C_LAMBER  = 'fef3c7';
const C_GRAY    = '475569';
const C_LGRAY   = 'f1f5f9';
const C_WHITE   = 'FFFFFF';
const C_DARK    = '1e293b';

// ─── Base text helper (always sets font → fixes garbled CJK) ──────────────
const tr = (text: string, opts: Partial<{
  bold: boolean; size: number; color: string; font: string;
  italics: boolean; underline: boolean;
}> = {}) => new TextRun({
  text,
  font:    opts.font    ?? FONT,
  bold:    opts.bold    ?? false,
  size:    opts.size    ?? 22,
  color:   opts.color   ?? C_DARK,
  italics: opts.italics ?? false,
});

// ─── Paragraph helpers ────────────────────────────────────────────────────
const h1 = (text: string) => new Paragraph({
  children: [tr(text, { bold: true, size: 30, color: C_GREEN })],
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 360, after: 160 },
  border: { bottom: { style: BorderStyle.THICK, size: 6, color: C_GREEN } },
});
const h2 = (text: string) => new Paragraph({
  children: [tr(text, { bold: true, size: 26, color: C_DBLUE })],
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 240, after: 100 },
});
const h3 = (text: string) => new Paragraph({
  children: [tr(text, { bold: true, size: 23, color: C_GRAY })],
  spacing: { before: 180, after: 80 },
});
const body = (text: string) => new Paragraph({
  children: [tr(text)],
  spacing: { after: 80 },
});
const italic = (text: string) => new Paragraph({
  children: [tr(text, { italics: true, color: '666666', size: 19 })],
  alignment: AlignmentType.CENTER,
  spacing: { after: 100 },
});
const bullet = (text: string, level = 0) => new Paragraph({
  children: [tr(text)],
  bullet: { level },
  spacing: { after: 60 },
});
const gap  = () => new Paragraph({ children: [tr('')], spacing: { after: 80 } });
const pgBr = () => new Paragraph({ children: [new PageBreak()] });

// ─── Table helpers ────────────────────────────────────────────────────────
const cell = (text: string, opts: Partial<{
  bg: string; bold: boolean; size: number; color: string;
  align: (typeof AlignmentType)[keyof typeof AlignmentType];
  vAlign: 'top' | 'center' | 'bottom';
  colspan: number; width: number;
}> = {}) => new TableCell({
  columnSpan: opts.colspan ?? 1,
  verticalAlign: (opts.vAlign ?? 'center') as any,
  shading: opts.bg ? { type: ShadingType.SOLID, color: opts.bg } : undefined,
  margins: { top: 80, bottom: 80, left: 100, right: 100 },
  width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
  children: [new Paragraph({
    children: [tr(text, { bold: opts.bold, size: opts.size ?? 20, color: opts.color ?? C_DARK })],
    alignment: opts.align ?? AlignmentType.CENTER,
    spacing: { after: 0 },
  })],
});

const dataTable = (headers: string[], rows: string[][], hdrBg = C_DBLUE) => new Table({
  layout: TableLayoutType.FIXED,
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({
      tableHeader: true,
      children: headers.map(h => cell(h, { bg: hdrBg, bold: true, color: C_WHITE, size: 19 })),
    }),
    ...rows.map((row, ri) => new TableRow({
      children: row.map(v => cell(v || '—', {
        bg: ri % 2 === 0 ? C_WHITE : C_LGRAY,
        size: 19,
        align: AlignmentType.LEFT,
      })),
    })),
  ],
});

// ─── Section KPI cards ────────────────────────────────────────────────────
// Each card: big number (top, green/white) + label (bottom, subtle)
const kpiCards = (cards: { value: string; label: string; sublabel?: string; accent?: string }[]) => {
  const cols = Math.min(cards.length, 5);
  const pct  = Math.floor(100 / cols);
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      // Value row
      new TableRow({
        children: cards.map(c => new TableCell({
          width: { size: pct, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.SOLID, color: c.accent ?? C_GREEN },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 120, bottom: 60, left: 80, right: 80 },
          children: [new Paragraph({
            children: [tr(c.value, { bold: true, size: 40, color: C_WHITE })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 0 },
          })],
        })),
      }),
      // Label row
      new TableRow({
        children: cards.map(c => new TableCell({
          width: { size: pct, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.SOLID, color: 'f0faf4' },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          children: [
            new Paragraph({
              children: [tr(c.label, { bold: true, size: 19, color: C_GRAY })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 0 },
            }),
            ...(c.sublabel ? [new Paragraph({
              children: [tr(c.sublabel, { size: 16, color: '888888' })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 0 },
            })] : []),
          ],
        })),
      }),
    ],
  });
};

// ─── Highlight box ────────────────────────────────────────────────────────
const highlightBox = (
  issues: string,
  direction: string,
) => {
  const toLines = (s: string) => s.split('\n').map(l => l.trim()).filter(Boolean);
  const issueLines = toLines(issues);
  const dirLines   = toLines(direction);
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      // Issues header
      new TableRow({ children: [new TableCell({
        shading: { type: ShadingType.SOLID, color: C_RED },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({
          children: [tr('🔴  关键问题  KEY ISSUES', { bold: true, size: 22, color: C_WHITE })],
          spacing: { after: 0 },
        })],
      })] }),
      // Issues content
      ...(issueLines.length > 0
        ? [new TableRow({ children: [new TableCell({
            shading: { type: ShadingType.SOLID, color: C_LRED },
            margins: { top: 80, bottom: 80, left: 160, right: 120 },
            children: issueLines.map(l => new Paragraph({
              children: [tr(`• ${l}`, { size: 20, color: C_RED })],
              spacing: { after: 40 },
            })),
          })] })]
        : [new TableRow({ children: [new TableCell({
            shading: { type: ShadingType.SOLID, color: C_LRED },
            margins: { top: 60, bottom: 60, left: 160, right: 120 },
            children: [new Paragraph({ children: [tr('（请填写本期关键问题）', { size: 19, color: 'aaaaaa', italics: true })], spacing: { after: 0 } })],
          })] })]),
      // Direction header
      new TableRow({ children: [new TableCell({
        shading: { type: ShadingType.SOLID, color: C_GREEN },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({
          children: [tr('🟢  下期工作方向  NEXT PERIOD DIRECTION', { bold: true, size: 22, color: C_WHITE })],
          spacing: { after: 0 },
        })],
      })] }),
      // Direction content
      ...(dirLines.length > 0
        ? [new TableRow({ children: [new TableCell({
            shading: { type: ShadingType.SOLID, color: C_LGREEN },
            margins: { top: 80, bottom: 80, left: 160, right: 120 },
            children: dirLines.map(l => new Paragraph({
              children: [tr(`• ${l}`, { size: 20, color: C_GREEN })],
              spacing: { after: 40 },
            })),
          })] })]
        : [new TableRow({ children: [new TableCell({
            shading: { type: ShadingType.SOLID, color: C_LGREEN },
            margins: { top: 60, bottom: 60, left: 160, right: 120 },
            children: [new Paragraph({ children: [tr('（请填写下期工作方向）', { size: 19, color: 'aaaaaa', italics: true })], spacing: { after: 0 } })],
          })] })]),
    ],
  });
};

// ─── Image embed ──────────────────────────────────────────────────────────
function imgParagraph(dataUrl: string, w = 480, h = 260, caption?: string): Paragraph[] {
  try {
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const binary  = atob(base64);
    const bytes   = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const items: Paragraph[] = [
      new Paragraph({
        children: [new ImageRun({ data: bytes, transformation: { width: w, height: h }, type: 'png' })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: caption ? 40 : 120 },
      }),
    ];
    if (caption) items.push(new Paragraph({
      children: [tr(caption, { italics: true, size: 18, color: '888888' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    }));
    return items;
  } catch { return []; }
}

function photoGrid(photos: { caption: string; src: string }[], pw = 215, ph = 158): Paragraph[] {
  const rows: Paragraph[] = [];
  for (let i = 0; i < photos.length; i += 2) {
    const left  = photos[i];
    const right = photos[i + 1];
    const children: (ImageRun | TextRun)[] = [];
    try {
      const toBytes = (url: string) => {
        const b64 = url.includes(',') ? url.split(',')[1] : url;
        const bin = atob(b64); const ba = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) ba[j] = bin.charCodeAt(j);
        return ba;
      };
      children.push(new ImageRun({ data: toBytes(left.src), transformation: { width: pw, height: ph }, type: 'png' }));
      if (right) {
        children.push(new TextRun({ text: '    ' }));
        children.push(new ImageRun({ data: toBytes(right.src), transformation: { width: pw, height: ph }, type: 'png' }));
      }
    } catch { /* skip */ }
    rows.push(new Paragraph({ children, spacing: { before: 80, after: 30 } }));
    rows.push(new Paragraph({
      children: [tr(right ? `${left.caption}        ${right.caption}` : left.caption, { italics: true, size: 17, color: '666666' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }));
  }
  return rows;
}

// ─── ReportData type ──────────────────────────────────────────────────────
export interface SectionHighlight { issues: string; direction: string; }

export interface ReportData {
  period: string;
  reportType: 'monthly' | 'quarterly' | 'annual';
  company: string;
  delivery: {
    totalTonnage: number; dailyAvg: number; bestDay: number;
    weeklyBreakdown: { week: string; total: number; avg: number }[];
    amTotal: number; pmTotal: number; amAvgEff: number; pmAvgEff: number;
    avgLoadTimeMins: { am: number; pm: number };
  };
  capacity: {
    amCapacity: number; pmCapacity: number; totalCapacity: number;
    avgLoadEff: number; costPerTon: number;
    operatorRows: { machine: string; operator: string; capacity: number; efficiency: number; rating: string }[];
    // Full staffing detail (from CapEmp)
    staffing?: {
      name: string; machine: string; role: string; shift: 'morning'|'afternoon';
      efficiency: number; capacity: number; hours: number;
      rate: number; superPct: number; shiftCost: number;
    }[];
    amTotalCost?: number; pmTotalCost?: number;
    amCostPerTon?: number; pmCostPerTon?: number;
    amHeadcount?: number; pmHeadcount?: number;
  };
  quality: {
    totalIssues: number; customerComplaints: number; internalFixed: number;
    loaderErrors: number; operatorErrors: number;
    issues: { date: string; order: string; cause: string; shift: string; type: string; result: string }[];
    improvements: { dimension: string; current: string; rating: string; target: string }[];
  };
  safety: {
    totalIncidents: number; serious: number; minor: number; accidentFreeDays: number;
    incidents: { date: string; person: string; description: string; cause: string; action: string }[];
  };
  equipment: {
    // 4.1.1 绩效指标
    workOrderCompletion: number; totalCompleted: number; totalPending: number;
    totalDowntimeHours: number; kbArticles?: number; avgOvertimeHours?: number;
    // 4.1.2 Fitter面谈记录
    fitterInterviews?: { date: string; interviewer: string; topics: string; feedback: string; actions: string }[];
    // 4.2 设备管理目标
    managementGoals?: { person: string; priority: string; direction: string; current: string; goal: string; owner: string }[];
    // 4.3.1 设备停机记录
    downtimeRecords: { date: string; machine: string; description: string; status: string; hours: number }[];
    // 4.3.2 配件管理
    partsUsage?: { machine: string; times: number; mainParts: string; status: string }[];
    // 4.3.3 iPad工单完成情况
    workOrdersByMachine?: { machine: string; total: number; completed: number; pending: number }[];
    workOrderPhotos?: { machine: string; caption: string; src: string }[];
    // 4.3.4 大型停机维修记录
    majorRepairs?: { date: string; machine: string; content: string; part: string; actualH: string; baselineH: string; efficiency: string; status: string }[];
    // 4.3.4 流程规范和效率提高
    processImprovements?: string[];
  };
  other: { actionItems: string[]; notes: string; };
  // Highlight boxes (issues + direction per section)
  highlights?: {
    overall?:   SectionHighlight;
    delivery?:  SectionHighlight;
    capacity?:  SectionHighlight;
    quality?:   SectionHighlight;
    safety?:    SectionHighlight;
    equipment?: SectionHighlight;
  };
  // Chart + photo images (base64 PNG)
  images?: {
    deliveryChart?: string; shiftCompareChart?: string;
    qualityChart?: string; downtimeChart?: string;
    safetyPhotos?: { caption: string; src: string }[];
    fiveSIssuePhotos?: { area: string; src: string }[];
    fiveSGoodPhotos?:  { area: string; src: string }[];
  };
}

// ─── Cover ────────────────────────────────────────────────────────────────
function buildCover(data: ReportData): (Paragraph | Table)[] {
  const typeLabel = data.reportType === 'monthly' ? 'Monthly Meeting' : data.reportType === 'quarterly' ? 'Quarterly Review' : 'Annual Report';
  const d = data.delivery; const q = data.quality; const s = data.safety; const e = data.equipment;
  return [
    new Paragraph({
      children: [tr(data.company, { bold: true, size: 28, color: C_DARK })],
      alignment: AlignmentType.CENTER, spacing: { after: 80 },
    }),
    new Paragraph({
      children: [tr('271 Edgar Street Condell Park NSW 2200  |  www.finesteel.com.au  |  ABN 36 157 862 032', { size: 17, color: '888888' })],
      alignment: AlignmentType.CENTER, spacing: { after: 480 },
    }),
    new Paragraph({
      children: [tr(`${typeLabel}  —  ${data.period}`, { bold: true, size: 44, color: C_GREEN })],
      alignment: AlignmentType.CENTER, spacing: { after: 80 },
    }),
    new Paragraph({
      children: [tr('生产运营报告  Production Operations Report', { size: 22, color: C_GRAY })],
      alignment: AlignmentType.CENTER, spacing: { after: 600 },
    }),
    // Cover KPI cards (5 metrics from the PDF cover)
    kpiCards([
      { value: `${d.totalTonnage.toLocaleString()}t`, label: '月发货量', sublabel: `日均 ${d.dailyAvg.toFixed(1)}t/天` },
      { value: `${e.workOrderCompletion}%`,            label: '维修工单完成率', sublabel: `完成 ${e.totalCompleted}/${e.totalCompleted+e.totalPending} 张` },
      { value: `${q.totalIssues} 起`,                 label: '质量问题总数', sublabel: `客诉 ${q.customerComplaints} · 内部 ${q.internalFixed}`, accent: q.totalIssues > 5 ? C_RED : C_GREEN },
      { value: `${s.totalIncidents} 起`,              label: '安全事故', sublabel: `严重 ${s.serious} · 一般 ${s.minor}`, accent: s.totalIncidents > 0 ? C_AMBER : C_GREEN },
      { value: `${s.accidentFreeDays}天`,              label: '无事故天数', sublabel: 'Accident-Free Days' },
    ]),
    gap(), gap(),
    ...(data.highlights?.overall
      ? [highlightBox(data.highlights.overall.issues, data.highlights.overall.direction), gap()]
      : []),
    pgBr(),
  ];
}

// ─── 1. Delivery ──────────────────────────────────────────────────────────
function buildDelivery(data: ReportData): (Paragraph | Table)[] {
  const d = data.delivery; const imgs = data.images;
  return [
    h1('1. 发货量  Delivery Volume'),
    // Section KPI cards
    kpiCards([
      { value: `${d.totalTonnage.toLocaleString()}t`, label: '月发货量', sublabel: `日均 ${d.dailyAvg.toFixed(1)}t/天` },
      { value: `${d.bestDay}t`,                       label: '最高单日' },
      { value: `${d.amTotal.toFixed(0)}t`,            label: '早班总量 AM', accent: C_DBLUE },
      { value: `${d.pmTotal.toFixed(0)}t`,            label: '下午班总量 PM', accent: C_AMBER },
      { value: `${d.amAvgEff.toFixed(1)} t/h`,        label: '早班效率', sublabel: `下午班 ${d.pmAvgEff.toFixed(1)} t/h` },
    ]),
    gap(),
    body(`本期总发货量 ${d.totalTonnage.toLocaleString()} 吨，日均 ${d.dailyAvg.toFixed(1)} 吨/天，最高单日 ${d.bestDay} 吨。早班装载效率 ${d.amAvgEff.toFixed(1)} t/h，下午班 ${d.pmAvgEff.toFixed(1)} t/h。`),
    gap(),
    // Highlight box
    highlightBox(data.highlights?.delivery?.issues ?? '', data.highlights?.delivery?.direction ?? ''),
    gap(),
    h2('1.1 周次发货量明细'),
    d.weeklyBreakdown.length > 0
      ? dataTable(['周次', '总发货量', '日均发货量'], d.weeklyBreakdown.map(w => [w.week, `${w.total} t`, `${w.avg.toFixed(1)} T/天`]))
      : body('（暂无周次数据）'),
    ...(imgs?.deliveryChart ? imgParagraph(imgs.deliveryChart, 500, 270, '图1 — 周次发货量（t）早班 / 下午班') : []),
    gap(),
    h2('1.2 早班 / 下午班对比'),
    dataTable(
      ['指标', '早班 AM (6am–2pm)', '下午班 PM (2pm–10pm)', '差异'],
      [
        ['总装车量', `${d.amTotal.toFixed(1)} T`, `${d.pmTotal.toFixed(1)} T`, `早班多 ${(d.amTotal-d.pmTotal).toFixed(1)} T`],
        ['平均效率', `${d.amAvgEff.toFixed(1)} t/h`, `${d.pmAvgEff.toFixed(1)} t/h`, `差 ${(d.amAvgEff-d.pmAvgEff).toFixed(1)} t/h`],
        ['均装车时间', `${d.avgLoadTimeMins.am.toFixed(1)} 分`, `${d.avgLoadTimeMins.pm.toFixed(1)} 分`, ''],
      ]
    ),
    ...(imgs?.shiftCompareChart ? imgParagraph(imgs.shiftCompareChart, 400, 240, '图2 — 早班 / 下午班效率对比（t/h）') : []),
    gap(), pgBr(),
  ];
}

// ─── 2. Capacity ──────────────────────────────────────────────────────────
function buildCapacity(data: ReportData): (Paragraph | Table)[] {
  const c = data.capacity;
  const sf = c.staffing ?? [];
  const amStaff = sf.filter(r => r.shift === 'morning');
  const pmStaff = sf.filter(r => r.shift === 'afternoon');

  const roleLabel = (r: string) =>
    ({ operator:'操作员', loader:'Loader', packer:'Packer', crane:'吊车', forklift:'叉车', fitter:'Fitter', cutter:'切割', supervisor:'主管' }[r] ?? r);

  const staffTable = (rows: typeof sf) => {
    if (!rows.length) return body('（暂无人员数据）');
    // Group by role: operators first, then others
    const ops    = rows.filter(r => r.role === 'operator');
    const others = rows.filter(r => r.role !== 'operator');
    const all    = [...ops, ...others];
    const totalCap  = ops.reduce((s, r) => s + r.capacity, 0);
    const totalCost = all.reduce((s, r) => s + r.shiftCost, 0);
    const avgEff    = ops.length ? ops.reduce((s,r) => s + r.efficiency, 0) / ops.length : 0;
    const dataRows  = all.map(r => [
      r.machine || '—',
      r.name,
      roleLabel(r.role),
      r.efficiency > 0 ? `${r.efficiency.toFixed(2)} t/h` : '—',
      r.capacity > 0   ? `${r.capacity.toFixed(1)} t`    : '—',
      `${r.hours}h`,
      `$${r.rate}/h`,
      `$${r.shiftCost.toFixed(0)}`,
    ]);
    // Summary row
    dataRows.push(['合计 / 均值', `${all.length} 人`, '', avgEff > 0 ? `均 ${avgEff.toFixed(2)} t/h` : '', `${totalCap.toFixed(1)} t`, '', '', `$${totalCost.toFixed(0)}`]);

    return new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: ['机器', '姓名', '角色', '效率', '产能', '工时', '工资', '班次成本'].map(h =>
            cell(h, { bg: C_DBLUE, bold: true, color: C_WHITE, size: 18 })),
        }),
        ...dataRows.map((row, ri) => {
          const isTotal = ri === dataRows.length - 1;
          return new TableRow({
            children: row.map(v => cell(v, {
              bg: isTotal ? C_LGRAY : ri % 2 === 0 ? C_WHITE : 'f8fafc',
              bold: isTotal,
              size: 18,
              color: isTotal ? C_GREEN : C_DARK,
              align: AlignmentType.CENTER,
            })),
          });
        }),
      ],
    });
  };

  // Shift summary comparison table
  const shiftSummary = () => {
    if (!sf.length) return null;
    return dataTable(
      ['指标', '早班 AM (6am–2pm)', '下午班 PM (2pm–10pm)', '对比'],
      [
        ['产能 (T)',   `${c.amCapacity.toFixed(1)} t`,  `${c.pmCapacity.toFixed(1)} t`,  `差 ${Math.abs(c.amCapacity-c.pmCapacity).toFixed(1)} t`],
        ['操作员人数', `${amStaff.filter(r=>r.role==='operator').length} 人`, `${pmStaff.filter(r=>r.role==='operator').length} 人`, ''],
        ['平均效率',  `${amStaff.filter(r=>r.role==='operator').length ? (amStaff.filter(r=>r.role==='operator').reduce((s,r)=>s+r.efficiency,0)/amStaff.filter(r=>r.role==='operator').length).toFixed(2) : '—'} t/h`, `${pmStaff.filter(r=>r.role==='operator').length ? (pmStaff.filter(r=>r.role==='operator').reduce((s,r)=>s+r.efficiency,0)/pmStaff.filter(r=>r.role==='operator').length).toFixed(2) : '—'} t/h`, ''],
        ['总人力成本', c.amTotalCost ? `$${c.amTotalCost.toFixed(0)}` : '—', c.pmTotalCost ? `$${c.pmTotalCost.toFixed(0)}` : '—', ''],
        ['成本/吨',   c.amCostPerTon ? `$${c.amCostPerTon.toFixed(2)}/t` : '—', c.pmCostPerTon ? `$${c.pmCostPerTon.toFixed(2)}/t` : '—', c.amCostPerTon && c.pmCostPerTon ? `差 $${Math.abs(c.amCostPerTon-c.pmCostPerTon).toFixed(2)}/t` : ''],
        ['装车效率',  `${data.delivery.amAvgEff.toFixed(1)} t/h`, `${data.delivery.pmAvgEff.toFixed(1)} t/h`, `差 ${Math.abs(data.delivery.amAvgEff-data.delivery.pmAvgEff).toFixed(1)} t/h`],
      ],
      C_GREEN,
    );
  };

  return [
    h1('2. 人员配置与产能  Staffing & Capacity'),
    kpiCards([
      { value: `${c.amCapacity.toFixed(1)} t`, label: '早班产能 AM', sublabel: `${amStaff.filter(r=>r.role==='operator').length} 名操作员` },
      { value: `${c.pmCapacity.toFixed(1)} t`, label: '下午班产能 PM', sublabel: `${pmStaff.filter(r=>r.role==='operator').length} 名操作员`, accent: C_AMBER },
      { value: `${c.totalCapacity.toFixed(1)} t`, label: '总产能', sublabel: '早班+下午班' },
      { value: `${c.avgLoadEff.toFixed(1)} t/h`, label: '均装载效率' },
      { value: `$${c.costPerTon.toFixed(2)}`, label: '综合成本/吨', sublabel: '含 Super', accent: C_DBLUE },
    ]),
    gap(),
    highlightBox(data.highlights?.capacity?.issues ?? '', data.highlights?.capacity?.direction ?? ''),
    gap(),
    ...(shiftSummary() ? [h2('2.1 班次效率与成本汇总'), shiftSummary()!, gap()] : []),
    h2('2.2 早班 AM 人员配置与产能'),
    staffTable(amStaff),
    gap(),
    h2('2.3 下午班 PM 人员配置与产能'),
    staffTable(pmStaff),
    gap(),
    pgBr(),
  ];
}

// ─── 3. Quality ───────────────────────────────────────────────────────────
function buildQuality(data: ReportData): (Paragraph | Table)[] {
  const q = data.quality; const imgs = data.images;
  return [
    h1('3. 加工质量与装车问题  Quality & Loading Issues'),
    kpiCards([
      { value: `${q.totalIssues}`, label: '问题总数', sublabel: '本期合计', accent: q.totalIssues > 10 ? C_RED : C_AMBER },
      { value: `${q.customerComplaints}`, label: '客户投诉', sublabel: `占 ${q.totalIssues > 0 ? Math.round(q.customerComplaints/q.totalIssues*100) : 0}%`, accent: C_RED },
      { value: `${q.internalFixed}`, label: '内部解决', sublabel: `占 ${q.totalIssues > 0 ? Math.round(q.internalFixed/q.totalIssues*100) : 0}%`, accent: C_GREEN },
      { value: `${q.loaderErrors}`, label: 'Loader失误', accent: C_AMBER },
      { value: `${q.operatorErrors}`, label: '操作员失误', accent: C_DBLUE },
    ]),
    gap(),
    highlightBox(data.highlights?.quality?.issues ?? '', data.highlights?.quality?.direction ?? ''),
    gap(),
    h2('3.1 生产错误记录'),
    q.issues.length > 0
      ? dataTable(['日期','订单/事件','根本原因','班次','问题类型','处理结果'],
          q.issues.map(i => [i.date, i.order, i.cause, i.shift, i.type, i.result]))
      : body('本期无质量问题记录。'),
    ...(imgs?.qualityChart ? imgParagraph(imgs.qualityChart, 380, 240, '图3 — 质量问题类型分布') : []),
    gap(),
    h2('3.2 下期改进方向'),
    q.improvements.length > 0
      ? dataTable(['维度','本期数据','评级','下期目标'], q.improvements.map(i => [i.dimension, i.current, i.rating, i.target]))
      : body('（请填写改进方向）'),
    gap(), pgBr(),
  ];
}

// ─── 4. Safety ────────────────────────────────────────────────────────────
function buildSafety(data: ReportData): (Paragraph | Table)[] {
  const s = data.safety; const photos = data.images?.safetyPhotos ?? [];
  return [
    h1('4. 安全事故  Safety Incidents'),
    kpiCards([
      { value: `${s.totalIncidents} 起`, label: '工伤总数', sublabel: 'Work Health & Safety', accent: s.totalIncidents > 0 ? C_RED : C_GREEN },
      { value: `${s.serious} 起`,        label: '严重工伤', sublabel: "Workers' Compensation", accent: C_RED },
      { value: `${s.minor} 起`,          label: '一般事故', sublabel: 'First Aid / Minor', accent: C_AMBER },
      { value: `${s.accidentFreeDays}天`, label: '无事故天数', sublabel: 'Accident-Free Days' },
    ]),
    gap(),
    body(`本期共发生 ${s.totalIncidents} 起安全事故（严重 ${s.serious} 起，一般 ${s.minor} 起）。无事故天数：${s.accidentFreeDays} 天。`),
    gap(),
    highlightBox(data.highlights?.safety?.issues ?? '', data.highlights?.safety?.direction ?? ''),
    gap(),
    s.incidents.length > 0
      ? dataTable(['日期','涉及人员','事故经过','根本原因','跟进措施'],
          s.incidents.map(i => [i.date, i.person, i.description, i.cause, i.action]))
      : body('本期无安全事故记录。'),
    ...(photos.length > 0 ? [gap(), h3('现场照片  Site Photos'), ...photoGrid(photos)] : []),
    gap(), pgBr(),
  ];
}

// ─── 5. Fitter与设备管理 (follows exact PDF headings) ─────────────────────
function buildEquipment(data: ReportData): (Paragraph | Table)[] {
  const e = data.equipment; const imgs = data.images;
  const totalWo = (e.workOrdersByMachine ?? []).reduce((s,m)=>s+m.total,0) || e.totalCompleted+e.totalPending;
  const doneWo  = (e.workOrdersByMachine ?? []).reduce((s,m)=>s+m.completed,0) || e.totalCompleted;
  return [
    h1('5. Fitter 与设备管理  Equipment Management'),
    // KPI cards matching PDF section 4.1.1
    kpiCards([
      { value: `${e.workOrderCompletion || (totalWo>0?Math.round(doneWo/totalWo*100):0)}%`, label: '工单完成率', sublabel: `完成 ${doneWo}/${totalWo} 张`, accent: e.workOrderCompletion >= 80 ? C_GREEN : C_AMBER },
      { value: `${e.totalDowntimeHours}h`, label: '设备停机时间', accent: e.totalDowntimeHours > 50 ? C_RED : C_AMBER },
      ...(e.kbArticles !== undefined ? [{ value: `${e.kbArticles} 篇`, label: '知识库新增' }] : []),
      ...(e.avgOvertimeHours !== undefined ? [{ value: `${e.avgOvertimeHours}h/w`, label: 'Fitter平均加班' }] : []),
    ]),
    gap(),
    highlightBox(data.highlights?.equipment?.issues ?? '', data.highlights?.equipment?.direction ?? ''),
    gap(),

    // 4.1.1 绩效与行为指标管理
    h2('4.1.1 绩效与行为指标管理'),
    body('（本期 Fitter 绩效评估摘要）'),
    gap(),

    // 4.1.2 Fitter面谈记录
    ...(e.fitterInterviews?.length ? [
      h2('4.1.2 Fitter 面谈记录'),
      dataTable(['面谈日期','面谈人','主要讨论内容','Fitter反馈','跟进行动'],
        e.fitterInterviews.map(i=>[i.date,i.interviewer,i.topics,i.feedback,i.actions])),
      gap(),
    ] : [h2('4.1.2 Fitter 面谈记录'), body('（请填写本期面谈记录）'), gap()]),

    // 4.2 设备管理目标
    ...(e.managementGoals?.length ? [
      h2('4.2 设备管理目标'),
      dataTable(['人员','优先级','方向','现状','目标/行动计划','负责人'],
        e.managementGoals.map(g=>[g.person,g.priority,g.direction,g.current,g.goal,g.owner])),
      gap(),
    ] : [h2('4.2 设备管理目标'), body('（请填写本期设备管理目标）'), gap()]),

    // 4.3.1 设备停机记录
    h2('4.3.1 设备停机记录'),
    e.downtimeRecords.length > 0
      ? dataTable(['日期','机器','故障描述','状态','停机(h)'],
          e.downtimeRecords.map(r=>[r.date,r.machine,r.description,r.status,String(r.hours)]))
      : body('本期无设备停机记录。'),
    ...(imgs?.downtimeChart ? imgParagraph(imgs.downtimeChart, 440, 240, '图4 — 各机器停机时长（h）') : []),
    gap(),

    // 4.3.2 配件管理使用情况
    ...(e.partsUsage?.length ? [
      h2('4.3.2 配件管理使用情况'),
      dataTable(['机器','配件操作次数','主要配件','状态'],
        e.partsUsage.map(p=>[p.machine,`${p.times}次`,p.mainParts,p.status])),
      gap(),
    ] : [h2('4.3.2 配件管理使用情况'), body('（暂无配件管理记录）'), gap()]),

    // 4.3.3 iPad系统维修工单完成情况
    h2('4.3.3 iPad 系统维修工单完成情况'),
    ...(e.workOrdersByMachine?.length ? [
      dataTable(['机器','工单总数','已完成','待完成','完成率'],
        e.workOrdersByMachine.map(m=>[
          m.machine, String(m.total), String(m.completed), String(m.pending),
          `${m.total>0?Math.round(m.completed/m.total*100):0}%`
        ])),
      gap(),
    ] : [body('（请在 Machine 板块的工单系统录入工单数据）'), gap()]),
    ...(e.workOrderPhotos?.length
      ? [h3('工单照片 / FMS截图'), ...photoGrid(e.workOrderPhotos.map(p=>({caption:p.caption,src:p.src})), 210, 150), gap()]
      : []),

    // 4.3.4 大型停机维修记录
    ...(e.majorRepairs?.length ? [
      h2('4.3.4 大型停机维修记录'),
      dataTable(['日期','机器','维修内容','部件','实际工时','熟练基准','效率判断','完成状态'],
        e.majorRepairs.map(r=>[r.date,r.machine,r.content,r.part,r.actualH,r.baselineH,r.efficiency,r.status])),
      gap(),
    ] : [h2('4.3.4 大型停机维修记录'), body('（暂无大型停机维修记录）'), gap()]),

    // 4.3.4 流程规范和效率提高
    ...(e.processImprovements?.length ? [
      h2('4.3.4 流程规范和效率提高'),
      ...e.processImprovements.map((item, i) => bullet(`${i+1}. ${item}`)),
      gap(),
    ] : [h2('4.3.4 流程规范和效率提高'), body('（请填写本期流程改进事项）'), gap()]),

    pgBr(),
  ];
}

// ─── 6. 5S Photos ─────────────────────────────────────────────────────────
function build5SPhotos(data: ReportData): (Paragraph | Table)[] {
  const issue = data.images?.fiveSIssuePhotos ?? [];
  const good  = data.images?.fiveSGoodPhotos  ?? [];
  if (!issue.length && !good.length) return [];
  return [
    h1('6. 5S 现场照片  Site Photos'),
    ...(issue.length > 0 ? [h2('⚠ 问题照片  Issue Photos'), ...photoGrid(issue.map(p=>({caption:p.area,src:p.src})))] : []),
    ...(good.length  > 0 ? [h2('✓ 良好行为  Good Practice'), ...photoGrid(good.map(p=>({caption:p.area,src:p.src})))] : []),
    gap(), pgBr(),
  ];
}

// ─── 7. Other ─────────────────────────────────────────────────────────────
function buildOther(data: ReportData): (Paragraph | Table)[] {
  const hasPhotos = (data.images?.fiveSIssuePhotos?.length || data.images?.fiveSGoodPhotos?.length);
  const n = hasPhotos ? '7' : '6';
  return [
    h1(`${n}. 其他事项  Other`),
    ...(data.other.actionItems.length > 0
      ? [h2('行动项  Action Items'), ...data.other.actionItems.map(i => bullet(i))]
      : [body('（暂无其他事项）')]),
    ...(data.other.notes ? [h2('备注  Notes'), body(data.other.notes)] : []),
    gap(),
  ];
}

// ─── Main ─────────────────────────────────────────────────────────────────
export async function generateReportDocx(data: ReportData): Promise<Blob> {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22 },
        },
      },
    },
    sections: [{
      properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } },
      children: [
        ...buildCover(data),
        ...buildDelivery(data),
        ...buildCapacity(data),
        ...buildQuality(data),
        ...buildSafety(data),
        ...buildEquipment(data),
        ...build5SPhotos(data),
        ...buildOther(data),
      ],
    }],
  });
  return await Packer.toBlob(doc);
}

export function buildEmptyReportData(period: string, type: 'monthly'|'quarterly'|'annual'): ReportData {
  return {
    period, reportType: type,
    company: 'Aotai (Australia) Investment and Holding Pty Ltd',
    delivery: { totalTonnage:0, dailyAvg:0, bestDay:0, weeklyBreakdown:[], amTotal:0, pmTotal:0, amAvgEff:0, pmAvgEff:0, avgLoadTimeMins:{am:0,pm:0} },
    capacity: { amCapacity:0, pmCapacity:0, totalCapacity:0, avgLoadEff:0, costPerTon:0, operatorRows:[] },
    quality:  { totalIssues:0, customerComplaints:0, internalFixed:0, loaderErrors:0, operatorErrors:0, issues:[], improvements:[] },
    safety:   { totalIncidents:0, serious:0, minor:0, accidentFreeDays:0, incidents:[] },
    equipment:{ workOrderCompletion:0, totalCompleted:0, totalPending:0, totalDowntimeHours:0, downtimeRecords:[] },
    other:    { actionItems:[], notes:'' },
    highlights: { overall:{issues:'',direction:''}, delivery:{issues:'',direction:''}, quality:{issues:'',direction:''}, safety:{issues:'',direction:''}, equipment:{issues:'',direction:''}, capacity:{issues:'',direction:''} },
  };
}
