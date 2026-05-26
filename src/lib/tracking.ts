export type TrackerKey = "bagels" | "steps10k" | "coldPlunge" | "fasting";

export type TrackerSettings = Record<`${TrackerKey}Enabled`, boolean>;

export const DEFAULT_TRACKER_SETTINGS: TrackerSettings = {
  bagelsEnabled: true,
  steps10kEnabled: true,
  coldPlungeEnabled: false,
  fastingEnabled: false,
};

export const BOOLEAN_TRACKERS: { key: Exclude<TrackerKey, "bagels">; field: Exclude<TrackerKey, "bagels">; enabledKey: keyof TrackerSettings; label: string; emoji: string }[] = [
  { key: "steps10k", field: "steps10k", enabledKey: "steps10kEnabled", label: "10k Steps", emoji: "👟" },
  { key: "coldPlunge", field: "coldPlunge", enabledKey: "coldPlungeEnabled", label: "Cold Plunge", emoji: "🧊" },
  { key: "fasting", field: "fasting", enabledKey: "fastingEnabled", label: "Fasting", emoji: "⏳" },
];

export function trackerSettingsFromRow(row: Record<string, unknown> | null | undefined): TrackerSettings {
  return {
    bagelsEnabled: row?.bagels_enabled ?? DEFAULT_TRACKER_SETTINGS.bagelsEnabled,
    steps10kEnabled: row?.steps10k_enabled ?? DEFAULT_TRACKER_SETTINGS.steps10kEnabled,
    coldPlungeEnabled: row?.cold_plunge_enabled ?? DEFAULT_TRACKER_SETTINGS.coldPlungeEnabled,
    fastingEnabled: row?.fasting_enabled ?? DEFAULT_TRACKER_SETTINGS.fastingEnabled,
  } as TrackerSettings;
}

export function trackerSettingsToRow(settings: TrackerSettings) {
  return {
    bagels_enabled: settings.bagelsEnabled,
    steps10k_enabled: settings.steps10kEnabled,
    cold_plunge_enabled: settings.coldPlungeEnabled,
    fasting_enabled: settings.fastingEnabled,
  };
}

export function trackerSettingsFromJson(value: string | null | undefined): TrackerSettings {
  if (!value) return DEFAULT_TRACKER_SETTINGS;
  try {
    const parsed = JSON.parse(value) as Partial<TrackerSettings>;
    return { ...DEFAULT_TRACKER_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_TRACKER_SETTINGS;
  }
}
