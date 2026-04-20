"use client";

import { cn } from "@/lib/utils";

interface Amenity {
  id: number;
  code: string;
  nameAr: string;
  category: string;
}

interface Props {
  amenities: Amenity[];
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
}

export function AmenitiesPicker({ amenities, selectedCodes, onChange }: Props) {
  const selected = new Set(selectedCodes);
  const grouped = amenities.reduce<Record<string, Amenity[]>>((acc, a) => {
    (acc[a.category] = acc[a.category] || []).push(a);
    return acc;
  }, {});

  const categoryLabels: Record<string, string> = {
    general: "عام",
    kitchen: "مطبخ",
    bathroom: "حمّام",
    entertainment: "ترفيه",
    outdoor: "خارجي",
  };

  function toggle(code: string) {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange(Array.from(next));
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([category, list]) => (
        <div key={category} className="space-y-2">
          <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {categoryLabels[category] ?? category}
          </h5>
          <div className="flex flex-wrap gap-2">
            {list.map((a) => {
              const isOn = selected.has(a.code);
              return (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => toggle(a.code)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full border transition-colors",
                    isOn
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-gray-600 border-gray-200 hover:border-primary/50",
                  )}
                >
                  {a.nameAr}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
