export type TabKey = "today" | "week" | "plan" | "review";
export type AppView = "plan" | "close" | "review" | "report";

const ALLOWED_VIEWS: Record<TabKey, readonly AppView[]> = {
  today: ["plan", "close"],
  week: ["plan", "review", "report"],
  plan: ["plan"],
  review: ["review", "plan"],
};

export function parseTab(value: string | null): TabKey {
  if (value === "week" || value === "weekly") return "week";
  if (value === "plan" || value === "cycle") return "plan";
  if (value === "review" || value === "export" || value === "past") return "review";
  return "today";
}

export function defaultViewForTab(tab: TabKey, weekOffset = 0): AppView {
  if (tab === "today") return weekOffset < 0 ? "close" : "plan";
  if (tab === "week") return weekOffset < 0 ? "review" : "plan";
  if (tab === "review") return "review";
  return "plan";
}

export function resolveView(tab: TabKey, value: string | null, weekOffset = 0): AppView {
  const requested = value as AppView | null;
  return requested && ALLOWED_VIEWS[tab].includes(requested)
    ? requested
    : defaultViewForTab(tab, weekOffset);
}
