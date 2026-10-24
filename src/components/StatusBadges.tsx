import { integrationStatus } from "@/lib/config";

export default function StatusBadges() {
  const s = integrationStatus();
  const items: [string, string][] = [
    ["AgenticOrg", s.agenticorg],
    ["Pine Labs", s.pinelabs],
    ["3dcart", s.shift4shop],
  ];
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {items.map(([name, mode]) => (
        <span
          key={name}
          className={`rounded-full px-2.5 py-1 font-medium ${mode.startsWith("live") ? "bg-emerald-100 text-emerald-800" : "bg-neutral-200 text-neutral-600"}`}
          title={mode.startsWith("live") ? "Using real API" : "No credentials: using mock data"}
        >
          {name}: {mode}
        </span>
      ))}
    </div>
  );
}
