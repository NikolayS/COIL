import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRACKERS,
  createTrackerId,
  getTrackerValue,
  trackerSettingsFromJson,
  trackerSettingsFromRow,
  trackerSettingsToRow,
  type TrackerSettings,
} from "@/lib/tracking";

describe("configurable trackers", () => {
  it("adds Gym for existing users while preserving legacy toggles", () => {
    const settings = trackerSettingsFromRow({
      bagels_enabled: false,
      steps10k_enabled: true,
      cold_plunge_enabled: true,
      fasting_enabled: false,
    });
    expect(settings.trackers.find((tracker) => tracker.id === "gym")?.enabled).toBe(true);
    expect(settings.trackers.find((tracker) => tracker.id === "bagels")?.enabled).toBe(false);
    expect(settings.trackers.find((tracker) => tracker.id === "coldPlunge")?.enabled).toBe(true);
  });

  it("round-trips custom definitions through the database row", () => {
    const settings: TrackerSettings = {
      trackers: [...DEFAULT_TRACKERS, { id: "custom-reading", label: "Reading", emoji: "📚", type: "counter", enabled: true, unit: "pages" }],
    };
    const row = trackerSettingsToRow(settings);
    const loaded = trackerSettingsFromRow(row);
    expect(loaded.trackers.find((tracker) => tracker.id === "custom-reading")).toMatchObject({ label: "Reading", type: "counter", unit: "pages" });
  });

  it("reads the old localStorage format", () => {
    const loaded = trackerSettingsFromJson(JSON.stringify({ bagelsEnabled: false, steps10kEnabled: true, coldPlungeEnabled: false, fastingEnabled: false }));
    expect(loaded.trackers.find((tracker) => tracker.id === "bagels")?.enabled).toBe(false);
    expect(loaded.trackers.find((tracker) => tracker.id === "gym")?.enabled).toBe(true);
  });

  it("uses generic values first and falls back to legacy week fields", () => {
    const drinks = DEFAULT_TRACKERS.find((tracker) => tracker.id === "drinks")!;
    expect(getTrackerValue({ drinks: 2 }, drinks)).toBe(2);
    expect(getTrackerValue({ drinks: 2, trackers: { drinks: 4 } }, drinks)).toBe(4);
  });

  it("creates stable custom-prefixed ids", () => {
    expect(createTrackerId("Morning Reading")).toMatch(/^custom-morning-reading-/);
  });
});
