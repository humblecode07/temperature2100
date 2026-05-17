import type { ComparisonResponse } from "./types";
import { SOURCE_GROUPS } from "./DataSourcesSection";
import { buildHeroMessage, buildTakeaway, formatDegrees } from "./helpers";

// ─── pdfmake types (minimal) ────────────────────────────────────────────────
type ContentItem = any;

// ─── Design tokens ───────────────────────────────────────────────────────────
const C = {
  ink:       "#0F1117",
  inkMid:    "#3D4252",
  inkLight:  "#6B7280",
  paper:     "#FFFFFF",
  accent:    "#1D4ED8",   // deep blue
  accentAlt: "#0EA5E9",  // sky
  warn:      "#F59E0B",
  danger:    "#EF4444",
  success:   "#10B981",
  surface:   "#F1F5F9",
  border:    "#E2E8F0",
  coral:     "#F97316",
} as const;

// ─── Risk helpers ────────────────────────────────────────────────────────────
type RiskLevel = "Elevated" | "Moderate" | "High" | "Severe";

function riskColor(label: RiskLevel): string {
  return { Elevated: C.success, Moderate: C.warn, High: C.coral, Severe: C.danger }[label] ?? C.inkMid;
}

function heatRiskLabel(w: number): RiskLevel  { return w < 1.5 ? "Elevated" : w < 2 ? "Moderate" : w < 3 ? "High" : "Severe"; }
function foodRiskLabel(w: number): RiskLevel  { return heatRiskLabel(w); }
function ecoRiskLabel(w: number): RiskLevel   { return heatRiskLabel(w); }

function coastalRiskLabel(m: number): RiskLevel {
  const cm = m * 100;
  return cm < 20 ? "Elevated" : cm < 35 ? "Moderate" : cm < 55 ? "High" : "Severe";
}

// ─── Coastal helpers (same logic as original) ────────────────────────────────
type CoastalRow = {
  lon: number; lat: number; process: string; confidence: string;
  scenario: "ssp119"|"ssp126"|"ssp245"|"ssp370"|"ssp585";
  quantile: 5|17|50|83|95;
  [year: string]: string | number;
};

const AVAIL_YEARS = [2020,2030,2040,2050,2060,2070,2080,2090,2100,2110,2120,2130,2140,2150];
const SSP_ANCHORS = { ssp119:-80, ssp126:-30, ssp245:10, ssp370:55, ssp585:120 } as const;
const SSP_ORDER: CoastalRow["scenario"][] = ["ssp119","ssp126","ssp245","ssp370","ssp585"];

function scenarioScore(r: ComparisonResponse) {
  const m = r.request.scenario_modifiers;
  return m.co2 + m.forest_loss * 0.35 - m.renewables * 0.7;
}

function getVal(row: CoastalRow, year: number) {
  const v = row[String(year)]; return typeof v === "number" ? v : Number(v);
}

function interpYear(row: CoastalRow, target: number) {
  if (target <= AVAIL_YEARS[0]) return getVal(row, AVAIL_YEARS[0]);
  if (target >= AVAIL_YEARS[AVAIL_YEARS.length-1]) return getVal(row, AVAIL_YEARS[AVAIL_YEARS.length-1]);
  const ui = AVAIL_YEARS.findIndex(y => y >= target);
  const uy = AVAIL_YEARS[ui], ly = AVAIL_YEARS[ui-1];
  return getVal(row, ly) + (getVal(row, uy) - getVal(row, ly)) * (target - ly) / (uy - ly);
}

function surroundingSSP(score: number) {
  const c = Math.max(SSP_ANCHORS.ssp119, Math.min(SSP_ANCHORS.ssp585, score));
  for (let i = 0; i < SSP_ORDER.length - 1; i++) {
    const lo = SSP_ORDER[i], hi = SSP_ORDER[i+1];
    if (c >= SSP_ANCHORS[lo] && c <= SSP_ANCHORS[hi]) {
      const ratio = SSP_ANCHORS[hi] === SSP_ANCHORS[lo] ? 0 : (c - SSP_ANCHORS[lo]) / (SSP_ANCHORS[hi] - SSP_ANCHORS[lo]);
      return { lower: lo, upper: hi, ratio };
    }
  }
  return { lower: SSP_ORDER[SSP_ORDER.length-1], upper: SSP_ORDER[SSP_ORDER.length-1], ratio: 0 };
}

async function getCoastalMetrics(result: ComparisonResponse) {
  const res = await fetch("/coastal_projection_local.json", { cache: "no-store" });
  if (!res.ok) return null;
  const rows = await res.json() as CoastalRow[];
  const targetYear = result.request.target_year;
  const interp = surroundingSSP(scenarioScore(result));
  const find = (s: CoastalRow["scenario"], q: 17|50|83) =>
    rows.find(r => r.process==="total" && r.confidence==="medium" && r.scenario===s && r.quantile===q);
  const bm = find("ssp245",50), lm=find(interp.lower,50), um=find(interp.upper,50);
  const ll=find(interp.lower,17), ul=find(interp.upper,17);
  const lh=find(interp.lower,83), uh=find(interp.upper,83);
  if (!bm||!lm||!um||!ll||!ul||!lh||!uh) return null;
  const lerp = (a:number,b:number) => a+(b-a)*interp.ratio;
  const baseM = interpYear(bm, targetYear);
  const medM  = lerp(interpYear(lm,targetYear), interpYear(um,targetYear));
  const lowM  = lerp(interpYear(ll,targetYear), interpYear(ul,targetYear));
  const highM = lerp(interpYear(lh,targetYear), interpYear(uh,targetYear));
  return {
    risk: coastalRiskLabel(medM),
    scenarioMedianCm: medM*100,
    deltaCm: (medM - baseM)*100,
    rangeLowCm: lowM*100,
    rangeHighCm: highM*100,
  };
}

// ─── Divider helper ──────────────────────────────────────────────────────────
function divider(color: string = C.border): ContentItem {
  return { canvas: [{ type:"line", x1:0, y1:2, x2:515, y2:2, lineWidth:0.5, lineColor:color }], margin:[0,8,0,8] };
}

// ─── Section header ──────────────────────────────────────────────────────────
function sectionHeader(title: string): ContentItem {
  return {
    table: {
      body: [[
        { text: title, style:"sectionHeader", color: C.paper },
      ]],
      widths: ["*"],
    },
    layout: {
      hLineColor: () => C.accent,
      vLineColor: () => C.accent,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
    },
    margin: [0, 12, 0, 6],
  };
}

// ─── Risk badge ──────────────────────────────────────────────────────────────
function riskBadge(label: RiskLevel): ContentItem {
  const color = riskColor(label);
  return {
    table: {
      body: [[{ text: `● ${label.toUpperCase()} RISK`, fontSize: 9, bold: true, color }]],
      widths: ["auto"],
    },
    layout: { hLineWidth:()=>0, vLineWidth:()=>0, hLineColor:()=>color, vLineColor:()=>color },
    margin: [0, 2, 0, 6],
  };
}

// ─── Metric row ──────────────────────────────────────────────────────────────
function metricRow(label: string, value: string): ContentItem {
  return {
    columns: [
      { text: label, color: C.inkLight, fontSize: 9, bold: true },
      { text: value, color: C.ink, fontSize: 9, bold: true },
    ],
    margin: [0, 2, 0, 2],
  };
}

// ─── Interpretation box ──────────────────────────────────────────────────────
function interpBox(text: string): ContentItem {
  return {
    table: {
      body: [[{ text, fontSize: 9, italics: true, color: C.inkMid }]],
      widths: ["*"],
    },
    layout: {
      hLineColor: () => C.border,
      vLineColor: () => C.accentAlt,
      hLineWidth: () => 0.5,
      vLineWidth: (i: number) => (i === 0 ? 3 : 0),
    },
    margin: [0, 4, 0, 10],
  };
}

// ─── Source group ────────────────────────────────────────────────────────────
function sourceGroup(group: typeof SOURCE_GROUPS[number]): ContentItem[] {
  return [
    { text: group.title, style: "sourceGroupTitle", margin: [0, 8, 0, 2] },
    { text: group.note,  fontSize: 8, color: C.inkLight, italics: true, margin: [0, 0, 0, 4] },
    ...group.items.map(item => ({
      table: {
        body: [[
          { text: item.name,         fontSize: 8, bold: true,  color: C.ink,      width: 160 },
          { text: item.organization, fontSize: 8,               color: C.inkMid,   width: 100 },
          { text: item.yearRange,    fontSize: 8,               color: C.inkLight, width: 80  },
          { text: item.scope,        fontSize: 8,               color: item.scope.includes("Philip") ? C.coral : C.accent, width: 80 },
        ]],
        widths: [160, 100, 80, "*"],
      },
      layout: {
        hLineColor: () => C.border,
        vLineColor: () => C.border,
        hLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
        vLineWidth: () => 0,
      },
      margin: [0, 1, 0, 1],
    } as ContentItem)),
    {
      ul: group.items.map(item => ({
        text: [
          { text: `${item.name}: `, fontSize: 7, bold: true, color: C.inkMid },
          { text: item.url, fontSize: 7, color: C.accent },
        ],
      })),
      margin: [0, 4, 0, 4],
    } as ContentItem,
  ];
}

// ─── Main export ─────────────────────────────────────────────────────────────
export async function exportComparisonPdfReport(result: ComparisonResponse) {
  const pdfmakeModule = await import("pdfmake/build/pdfmake");
  const pdfFontsModule = await import("pdfmake/build/vfs_fonts");
  const pdfmake = (pdfmakeModule as any).default ?? pdfmakeModule;
  const rawVfs =
    (pdfFontsModule as any).default?.pdfMake?.vfs ??
    (pdfFontsModule as any).default?.vfs ??
    (pdfFontsModule as any).pdfMake?.vfs ??
    (pdfFontsModule as any).vfs ??
    (pdfFontsModule as any).default ??
    pdfFontsModule;
  const vfs =
    rawVfs && typeof rawVfs === "object" ? { ...rawVfs } : rawVfs;

  if (typeof pdfmake.addVirtualFileSystem === "function") {
    pdfmake.addVirtualFileSystem(vfs);
  } else if (!pdfmake.vfs) {
    pdfmake.vfs = vfs;
  }

  const warming  = result.scenario.target_year.p50;
  const heat     = result.heat_impact;
  const food     = result.food_agriculture_impact;
  const ecosystem = result.ecosystem_impact;
  const coastal  = await getCoastalMetrics(result);
  const now      = new Date().toLocaleString();

  const heatLabel = heatRiskLabel(warming);
  const foodLabel = foodRiskLabel(warming);
  const ecoLabel  = ecoRiskLabel(warming);

  const content: ContentItem[] = [

    // ── Cover block ──────────────────────────────────────────────────────
    {
      table: {
        body: [[{
          stack: [
            { text: "CLIMATE SCENARIO", fontSize: 9, bold: true, color: C.accentAlt, characterSpacing: 3 },
            { text: "Comparison Report", fontSize: 28, bold: true, color: C.paper, margin: [0,4,0,6] },
            { text: `Generated ${now}`, fontSize: 8, color: "#93C5FD" },
          ],
        }]],
        widths: ["*"],
      },
      layout: { hLineWidth:()=>0, vLineWidth:()=>0, hLineColor:()=>C.accent, vLineColor:()=>C.accent },
      margin: [0, 0, 0, 16],
    },

    // ── Scenario summary ─────────────────────────────────────────────────
    {
      columns: [
        {
          table: {
            body: [[
              {
                stack: [
                  { text: "TARGET YEAR", fontSize: 7, bold: true, color: C.inkLight, characterSpacing: 1 },
                  { text: String(result.request.target_year), fontSize: 20, bold: true, color: C.accent },
                ],
              },
            ]],
            widths:["*"],
          },
          layout:{hLineWidth:()=>0,vLineWidth:()=>0,hLineColor:()=>C.border,vLineColor:()=>C.border},
        },
        {
          table: {
            body:[[
              {
                stack: [
                  { text:"YOUR SCENARIO", fontSize:7, bold:true, color:C.inkLight, characterSpacing:1 },
                  { text: formatDegrees(warming), fontSize:20, bold:true, color:C.danger },
                ],
              },
            ]],
            widths:["*"],
          },
          layout:{hLineWidth:()=>0,vLineWidth:()=>0,hLineColor:()=>C.border,vLineColor:()=>C.border},
        },
        {
          table: {
            body:[[
              {
                stack: [
                  { text:"VS BASELINE", fontSize:7, bold:true, color:C.inkLight, characterSpacing:1 },
                  { text: formatDegrees(result.delta.target_year.p50), fontSize:20, bold:true, color:C.warn },
                ],
              },
            ]],
            widths:["*"],
          },
          layout:{hLineWidth:()=>0,vLineWidth:()=>0,hLineColor:()=>C.border,vLineColor:()=>C.border},
        },
      ],
      margin:[0,0,0,8],
    },

    {
      table:{
        body:[[
          { text:`CO₂ ${result.request.scenario_modifiers.co2>=0?"+":""}${result.request.scenario_modifiers.co2}%`, fontSize:9, color:C.ink },
          { text:`Forest loss ${result.request.scenario_modifiers.forest_loss>=0?"+":""}${result.request.scenario_modifiers.forest_loss}%`, fontSize:9, color:C.ink },
          { text:`Renewables ${result.request.scenario_modifiers.renewables>=0?"+":""}${result.request.scenario_modifiers.renewables}%`, fontSize:9, color:C.ink },
        ]],
        widths:["auto","auto","auto"],
      },
      layout:{hLineWidth:()=>0,vLineWidth:()=>0,hLineColor:()=>C.border,vLineColor:()=>C.border},
      margin:[0,0,0,4],
    },

    divider(C.accent),

    // ── Executive summary ────────────────────────────────────────────────
    { text:"EXECUTIVE SUMMARY", fontSize:8, bold:true, color:C.inkLight, characterSpacing:2, margin:[0,0,0,4] },
    { text: buildHeroMessage(result), fontSize:14, bold:true, color:C.ink, margin:[0,0,0,4] },
    { text: buildTakeaway(result), fontSize:10, color:C.inkMid, margin:[0,0,0,4] },

    divider(),
  ];

  // ── Heat & Health ─────────────────────────────────────────────────────
  if (heat) {
    content.push(
      sectionHeader("Heat & Health"),
      riskBadge(heatLabel),
      { text:"Key metrics driving this prediction", fontSize:8, bold:true, color:C.inkLight, characterSpacing:1, margin:[0,0,0,4] },
      metricRow("Heat mortality rate",   heat.scenario.heat_mortality_rate.toFixed(2)),
      metricRow("Annual heat deaths",    Math.round(heat.scenario.annual_heat_deaths).toLocaleString()),
      metricRow("Heat work-loss pressure", Math.round(heat.scenario.heat_work_loss_pp).toLocaleString()),
      interpBox("This score reflects how strongly warming is projected to increase dangerous heat, stress on exposed workers, and heat-related mortality relative to the modeled baseline."),
    );
  }

  // ── Flooding & Coasts ─────────────────────────────────────────────────
  if (coastal) {
    content.push(
      sectionHeader("Flooding & Coasts"),
      riskBadge(coastal.risk as RiskLevel),
      { text:"Key metrics driving this prediction", fontSize:8, bold:true, color:C.inkLight, characterSpacing:1, margin:[0,0,0,4] },
      metricRow("Estimated local sea-level rise", `${coastal.scenarioMedianCm.toFixed(1)} cm`),
      metricRow("Difference vs baseline",         `${coastal.deltaCm>=0?"+":""}${coastal.deltaCm.toFixed(1)} cm`),
      metricRow("Likely local range",             `${coastal.rangeLowCm.toFixed(1)} – ${coastal.rangeHighCm.toFixed(1)} cm`),
      interpBox("This score reflects projected local sea-level rise and the additional long-term coastal pressure it creates for flooding, shoreline disruption, and adaptation needs."),
    );
  }

  // ── Food & Agriculture ────────────────────────────────────────────────
  if (food) {
    content.push(
      sectionHeader("Food & Agriculture"),
      riskBadge(foodLabel),
      { text:"Key metrics driving this prediction", fontSize:8, bold:true, color:C.inkLight, characterSpacing:1, margin:[0,0,0,4] },
      metricRow("Food price index",          food.scenario.food_price_index.toFixed(1)),
      metricRow("Agricultural water stress", `${food.scenario.agricultural_water_stress_pct.toFixed(1)}%`),
      interpBox("This score reflects projected pressure on food affordability and agricultural water demand, rather than a single exact hunger percentage."),
    );
  }

  // ── Ecosystems ────────────────────────────────────────────────────────
  if (ecosystem) {
    content.push(
      sectionHeader("Ecosystems"),
      riskBadge(ecoLabel),
      { text:"Key metrics driving this prediction", fontSize:8, bold:true, color:C.inkLight, characterSpacing:1, margin:[0,0,0,4] },
      metricRow("Red List Index",                 ecosystem.scenario.red_list_index.toFixed(3)),
      metricRow("Ocean pH",                       ecosystem.scenario.ocean_ph.toFixed(3)),
      metricRow("Tree cover loss",                `${Math.round(ecosystem.scenario.tree_cover_loss_ha).toLocaleString()} ha`),
      metricRow("Coral reef thermal stress (DHW)",`${ecosystem.scenario.coral_dhw.toFixed(1)} °C-weeks`),
      metricRow("Coral bleaching alert level",    `${Math.min(ecosystem.scenario.coral_baa_max, 5).toFixed(1)} / 5`),
      { text:"⚠  Coral data is Philippines-specific (Central, Northern, Western stations). All other metrics are global.", fontSize:8, color:C.coral, italics:true, margin:[0,2,0,4] },
      interpBox("This score reflects biodiversity decline, ocean chemistry stress, tree-cover loss, and Philippines-specific coral thermal stress under the projected warming level."),
    );
  }

  // ── Data sources ──────────────────────────────────────────────────────
  content.push(
    divider(C.accent),
    { text:"DATA SOURCES", fontSize:8, bold:true, color:C.inkLight, characterSpacing:2, margin:[0,8,0,6] },
    { text:"The following datasets underpin the current prediction workflow and impact cards.", fontSize:9, color:C.inkMid, margin:[0,0,0,6] },
    ...SOURCE_GROUPS.flatMap(sourceGroup),
    divider(),
    { text:"Predictions are model-based estimates and should not be interpreted as guaranteed outcomes. Impact scores are relative indices, not absolute measurements.", fontSize:8, italics:true, color:C.inkLight, margin:[0,4,0,0] },
  );

  // ── Document definition ───────────────────────────────────────────────
  const docDef = {
    content,
    styles: {
      sectionHeader: {
        fontSize: 13,
        bold: true,
        color: C.paper,
        fillColor: C.accent,
        margin: [8, 6, 8, 6],
      },
      sourceGroupTitle: {
        fontSize: 10,
        bold: true,
        color: C.ink,
      },
    },
    defaultStyle: {
      font: "Roboto",
      fontSize: 10,
      color: C.ink,
      lineHeight: 1.4,
    },
    pageMargins: [48, 48, 48, 48] as [number,number,number,number],
    pageSize: "A4" as const,
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text:"Climate Scenario Comparison Report", fontSize:7, color:C.inkLight, margin:[48,0,0,0] },
        { text:`Page ${currentPage} of ${pageCount}`, fontSize:7, color:C.inkLight, alignment:"right", margin:[0,0,48,0] },
      ],
    }),
  };

  const filename = `climate-report-${result.request.target_year}-${Date.now()}.pdf`;
  pdfmake.createPdf(docDef).download(filename);
}
