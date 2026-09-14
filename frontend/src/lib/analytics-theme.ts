/**
 * Chart tokens for the analytics surfaces.
 *
 * Slot 1 is Azure DevOps communication blue, so the charts lead with the same
 * accent as the rest of the portal. The categorical order is fixed and assigned
 * by slot, never by rank, so a series keeps its colour when a filter removes its
 * neighbours. Both sets were validated against a white chart surface: the
 * categorical slots clear the colourblind separation and normal-vision floors,
 * and the flow ramp is a single blue hue stepped light to dark. Aqua and yellow
 * sit below 3:1 contrast on white, so every chart using them also ships a
 * legend, direct labels, or a table view.
 */

export const surface = '#ffffff';

export const ink = {
  primary: '#201f1e',
  secondary: '#605e5c',
  muted: '#a19f9d',
  grid: '#edebe9',
  axis: '#d2d0ce',
  border: '#e1dfdd',
} as const;

/** Fixed categorical order. Assign by slot; never cycle past the last one. */
export const series = ['#0078d4', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'] as const;

/**
 * Ordered stage ramp for workflow states, which are a progression rather than
 * unrelated identities. Steps run light (not started) to dark (finished).
 */
export const flowRamp = ['#86b6ef', '#4a9ade', '#0078d4', '#004578'] as const;

/** Reserved for state, never for a data series. */
export const status = {
  good: '#107c10',
  warning: '#ca5010',
  serious: '#da3b01',
  critical: '#a4262c',
} as const;

/** The three flow categories the backend groups statuses into. */
export const categoryColor: Record<string, string> = {
  todo: flowRamp[0],
  inprogress: flowRamp[2],
  done: flowRamp[3],
};

export const categoryLabel: Record<string, string> = {
  todo: 'To do',
  inprogress: 'In progress',
  done: 'Done',
};

/** Pick the colour for a stage by its position in the ordered workflow. */
export function stageColor(index: number, total: number): string {
  if (total <= 1) return flowRamp[flowRamp.length - 1];
  const position = (index / (total - 1)) * (flowRamp.length - 1);
  return flowRamp[Math.round(position)];
}

export function seriesColor(index: number): string {
  return series[index % series.length];
}

/** Shared Recharts props so every chart carries the same recessive chrome. */
export const axisProps = {
  stroke: ink.axis,
  tick: { fill: ink.muted, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: ink.axis },
} as const;

export const gridProps = {
  stroke: ink.grid,
  strokeDasharray: '0',
  vertical: false,
} as const;

export function formatDay(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}
