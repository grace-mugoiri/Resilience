"use client";

import { useRouter } from "next/navigation";
import { Cloud, CloudRain, CloudSun, MapPin, RotateCw, Sun } from "lucide-react";

const FORECAST = [
  { day: "Mon", icon: Sun, high: 26, low: 17 },
  { day: "Tue", icon: CloudSun, high: 25, low: 17 },
  { day: "Wed", icon: Cloud, high: 23, low: 16 },
  { day: "Thu", icon: CloudRain, high: 22, low: 16 },
  { day: "Fri", icon: CloudSun, high: 24, low: 17 },
];

/**
 * Decoy screen. Deliberately has NO app chrome, no Resilience branding, and
 * no visible "exit the decoy" affordance — it must survive a casual glance.
 * Returning to the real app requires knowing to tap the refresh icon, which
 * routes to the PIN screen rather than straight back into the app.
 */
export default function DecoyPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-sky-400 to-sky-600 px-6 py-10 text-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Nairobi
        </div>
        <button
          type="button"
          onClick={() => router.push("/unlock")}
          aria-label="Refresh forecast"
          className="opacity-70"
        >
          <RotateCw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-16 flex flex-col items-center">
        <Sun className="h-20 w-20" aria-hidden="true" />
        <p className="mt-4 text-6xl font-light">24°C</p>
        <p className="mt-1 text-lg">Partly Cloudy</p>
        <p className="mt-1 text-sm opacity-80">H:26° L:16°</p>
      </div>

      <div className="mt-16">
        <p className="mb-3 text-sm font-medium opacity-80">5-Day Forecast</p>
        <div className="flex justify-between rounded-2xl bg-white/10 p-4">
          {FORECAST.map(({ day, icon: Icon, high, low }) => (
            <div key={day} className="flex flex-col items-center gap-1.5 text-xs">
              <span>{day}</span>
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{high}°</span>
              <span className="opacity-70">{low}°</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
