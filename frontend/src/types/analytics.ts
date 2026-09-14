/** Response shapes for the /analytics endpoints. */

/**
 * How much of a metric came from recorded status transitions rather than being
 * reconstructed from created/updated timestamps. Charts surface this so an
 * estimated series is never presented as a measured one.
 */
export interface Coverage {
  issues: number;
  observed: number;
  estimated: number;
  observed_ratio: number;
}

export interface ProjectOverview {
  window_days: number;
  totals: {
    issues: number;
    open: number;
    in_progress: number;
    done: number;
    completion_rate: number;
  };
  created: { current: number; previous: number; change: number | null };
  resolved: { current: number; previous: number; change: number | null };
  median_cycle_time_days: number | null;
  coverage: Coverage;
}

export interface BurndownPoint {
  date: string;
  remaining: number | null;
  ideal: number;
  scope: number | null;
  completed: number | null;
}

export interface Burndown {
  sprint: {
    sprint_id: number;
    name: string;
    goal: string | null;
    start_date: string;
    end_date: string;
    status: string;
    is_completed: boolean;
  };
  unit: 'count' | 'hours';
  committed: number;
  scope_added: number;
  points: BurndownPoint[];
  coverage: Coverage;
}

export interface VelocitySprint {
  sprint_id: number;
  name: string;
  end_date: string;
  committed: number;
  completed: number;
  issue_count: number;
}

export interface Velocity {
  unit: 'count' | 'hours';
  sprints: VelocitySprint[];
  average_velocity: number;
  predictability: number | null;
  coverage: Coverage;
}

export interface CumulativeFlow {
  series: { key: string; color: string | null; category: string }[];
  points: Record<string, string | number>[];
  coverage: Coverage;
}

export interface ControlChartPoint {
  issue_id: number;
  issue_key: string;
  summary: string;
  completed_at: string;
  days: number;
  issue_type: string;
  lead_time_fallback: boolean;
  estimated: boolean;
  rolling_average: number;
  band_upper: number;
  band_lower: number;
}

export interface ControlChart {
  points: ControlChartPoint[];
  median_days: number | null;
  p85_days: number | null;
  mean_days: number | null;
  coverage: Coverage;
}

export interface CreatedVsResolved {
  interval: 'day' | 'week';
  points: { period: string; created: number; resolved: number; net: number; open: number }[];
  total_created: number;
  total_resolved: number;
  resolution_rate: number | null;
  coverage: Coverage;
}

export interface Throughput {
  series: string[];
  points: Record<string, string | number>[];
  average_per_week: number;
  coverage: Coverage;
}

export interface AgingItem {
  issue_id: number;
  issue_key: string;
  summary: string;
  status: string;
  assignee: string | null;
  priority: string | null;
  age_days: number;
  estimated: boolean;
}

export interface AgingWip {
  items: AgingItem[];
  count: number;
  median_age_days: number | null;
  oldest_age_days: number | null;
}

export interface Workload {
  by_assignee: { assignee: string; issues: number; hours: number }[];
  by_priority: { name: string; count: number }[];
  by_type: { name: string; count: number }[];
  by_status: { name: string; count: number; color: string | null; category: string | null }[];
}

export interface EpicProgressRow {
  issue_id: number;
  issue_key: string;
  summary: string;
  status: string;
  total: number;
  done: number;
  in_progress: number;
  todo: number;
  percent_complete: number;
  estimate_hours: number;
}

export interface EpicProgress {
  epics: EpicProgressRow[];
}
