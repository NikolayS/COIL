export type TrackerType = "boolean" | "counter" | "rating";
export type TrackerValue = boolean | number;

export interface TrackerDefinition {
  id: string;
  label: string;
  emoji: string;
  type: TrackerType;
  enabled: boolean;
  unit?: string;
  builtIn?: boolean;
}

export interface TrackerSettings {
  trackers: TrackerDefinition[];
}

export const DEFAULT_TRACKERS: TrackerDefinition[] = [
  { id: "drinks", label: "Drinks", emoji: "🥃", type: "counter", enabled: true, builtIn: true },
  { id: "bagels", label: "Bagels", emoji: "🥯", type: "counter", enabled: true, builtIn: true },
  { id: "steps10k", label: "10k Steps", emoji: "👟", type: "boolean", enabled: true, builtIn: true },
  { id: "gym", label: "Gym", emoji: "🏋️", type: "boolean", enabled: true, builtIn: true },
  { id: "coldPlunge", label: "Cold Plunge", emoji: "🧊", type: "boolean", enabled: false, builtIn: true },
  { id: "fasting", label: "Fasting", emoji: "⏳", type: "boolean", enabled: false, builtIn: true },
];

export const DEFAULT_TRACKER_SETTINGS: TrackerSettings = { trackers: DEFAULT_TRACKERS };

const LEGACY_ENABLED_COLUMNS: Record<string, string> = {
  bagels: "bagels_enabled",
  steps10k: "steps10k_enabled",
  coldPlunge: "cold_plunge_enabled",
  fasting: "fasting_enabled",
};

const LEGACY_DAY_FIELDS = new Set(["drinks", "bagels", "steps10k", "coldPlunge", "fasting"]);

function normalizeTracker(value: unknown): TrackerDefinition | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || typeof raw.label !== "string") return null;
  if (raw.type !== "boolean" && raw.type !== "counter" && raw.type !== "rating") return null;
  return {
    id: raw.id,
    label: raw.label.trim().slice(0, 40) || "Tracker",
    emoji: typeof raw.emoji === "string" ? raw.emoji.trim().slice(0, 8) : "🎯",
    type: raw.type,
    enabled: raw.enabled !== false,
    unit: typeof raw.unit === "string" ? raw.unit.trim().slice(0, 20) : undefined,
    builtIn: raw.builtIn === true,
  };
}

function mergeWithDefaults(trackers: TrackerDefinition[]): TrackerDefinition[] {
  const byId = new Map(trackers.map((tracker) => [tracker.id, tracker]));
  const merged = DEFAULT_TRACKERS.map((fallback) => {
    const saved = byId.get(fallback.id);
    return saved ? { ...fallback, ...saved, builtIn: true } : { ...fallback };
  });
  for (const tracker of trackers) {
    if (!DEFAULT_TRACKERS.some((fallback) => fallback.id === tracker.id)) merged.push(tracker);
  }
  return merged;
}

export function trackerSettingsFromRow(row: Record<string, unknown> | null | undefined): TrackerSettings {
  const saved = row?.tracker_definitions;
  if (Array.isArray(saved)) {
    const trackers = saved.map(normalizeTracker).filter((tracker): tracker is TrackerDefinition => tracker !== null);
    return { trackers: mergeWithDefaults(trackers) };
  }

  // Existing users keep their old on/off choices; Gym is added on by default.
  return {
    trackers: DEFAULT_TRACKERS.map((tracker) => {
      const column = LEGACY_ENABLED_COLUMNS[tracker.id];
      return column && typeof row?.[column] === "boolean"
        ? { ...tracker, enabled: row[column] as boolean }
        : { ...tracker };
    }),
  };
}

export function trackerSettingsToRow(settings: TrackerSettings) {
  const enabled = (id: string, fallback: boolean) => settings.trackers.find((tracker) => tracker.id === id)?.enabled ?? fallback;
  return {
    tracker_definitions: settings.trackers,
    // Keep legacy columns populated during the transition.
    bagels_enabled: enabled("bagels", true),
    steps10k_enabled: enabled("steps10k", true),
    cold_plunge_enabled: enabled("coldPlunge", false),
    fasting_enabled: enabled("fasting", false),
  };
}

export function trackerSettingsFromJson(value: string | null | undefined): TrackerSettings {
  if (!value) return { trackers: DEFAULT_TRACKERS.map((tracker) => ({ ...tracker })) };
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      const trackers = parsed.map(normalizeTracker).filter((tracker): tracker is TrackerDefinition => tracker !== null);
      return { trackers: mergeWithDefaults(trackers) };
    }
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as TrackerSettings).trackers)) {
      const trackers = (parsed as TrackerSettings).trackers.map(normalizeTracker).filter((tracker): tracker is TrackerDefinition => tracker !== null);
      return { trackers: mergeWithDefaults(trackers) };
    }
    // Read the former Record<`${key}Enabled`, boolean> localStorage format.
    return trackerSettingsFromRow({
      bagels_enabled: (parsed as Record<string, unknown>).bagelsEnabled,
      steps10k_enabled: (parsed as Record<string, unknown>).steps10kEnabled,
      cold_plunge_enabled: (parsed as Record<string, unknown>).coldPlungeEnabled,
      fasting_enabled: (parsed as Record<string, unknown>).fastingEnabled,
    });
  } catch {
    return { trackers: DEFAULT_TRACKERS.map((tracker) => ({ ...tracker })) };
  }
}

export function enabledTrackers(settings: TrackerSettings = DEFAULT_TRACKER_SETTINGS): TrackerDefinition[] {
  return settings.trackers.filter((tracker) => tracker.enabled);
}

export function defaultTrackerValue(tracker: TrackerDefinition): TrackerValue {
  return tracker.type === "boolean" ? false : 0;
}

export function getTrackerValue(day: Record<string, unknown> | null | undefined, tracker: TrackerDefinition): TrackerValue {
  const values = day?.trackers;
  if (values && typeof values === "object") {
    const saved = (values as Record<string, unknown>)[tracker.id];
    if (tracker.type === "boolean" && typeof saved === "boolean") return saved;
    if (tracker.type !== "boolean" && typeof saved === "number" && Number.isFinite(saved)) return saved;
  }
  if (LEGACY_DAY_FIELDS.has(tracker.id)) {
    const legacy = day?.[tracker.id];
    if (tracker.type === "boolean") return typeof legacy === "boolean" ? legacy : false;
    return typeof legacy === "number" && Number.isFinite(legacy) ? legacy : 0;
  }
  return defaultTrackerValue(tracker);
}

export function trackerValueLabel(value: TrackerValue, tracker: TrackerDefinition): string {
  if (tracker.type === "boolean") return value ? "yes" : "no";
  if (tracker.type === "rating") return Number(value) > 0 ? `${value}/5` : "—";
  return tracker.unit ? `${value} ${tracker.unit}` : String(value);
}

export function createTrackerId(label: string): string {
  const slug = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "tracker";
  return `custom-${slug}-${Date.now().toString(36)}`;
}
