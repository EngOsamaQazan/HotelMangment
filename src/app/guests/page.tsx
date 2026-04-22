"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Users, Loader2 } from "lucide-react";
import { Pagination, usePaginatedSlice } from "@/components/Pagination";

const PAGE_SIZE = 20;

interface GuestData {
  id: number;
  fullName: string;
  idNumber: string;
  nationality: string;
  guestOrder: number;
  reservation: {
    id: number;
    guestName: string;
    unit: {
      id: number;
      unitNumber: string;
      unitType: string;
    };
  };
}

export default function GuestsPage() {
  const [guests, setGuests] = useState<GuestData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset to first page when the search query changes so the user always sees
  // matches from the top.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const pagedGuests = usePaginatedSlice(guests, page, PAGE_SIZE);

  const fetchGuests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/guests?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setGuests(json);
    } catch {
      setGuests([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    fetchGuests();
  }, [fetchGuests]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Users className="text-primary" size={24} />
        <h1 className="text-xl sm:text-2xl font-bold text-primary">سجل الضيوف</h1>
      </div>

      {/* Search */}
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4">
        <div className="relative w-full md:max-w-md">
          <Search
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />
          <input
            type="text"
            placeholder="بحث بالاسم أو رقم الهوية..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-primary" size={32} />
            <span className="mr-3 text-gray-500">جاري تحميل الضيوف...</span>
          </div>
        ) : guests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Users size={48} className="mb-3 opacity-50" />
            <p className="text-lg font-medium">لا يوجد ضيوف</p>
            <p className="text-sm mt-1">
              {search
                ? "لم يتم العثور على نتائج مطابقة"
                : "سيظهر الضيوف هنا عند إضافة حجوزات"}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-5 py-3 text-right font-semibold text-gray-600">
                      الاسم
                    </th>
                    <th className="px-5 py-3 text-right font-semibold text-gray-600">
                      رقم الهوية
                    </th>
                    <th className="px-5 py-3 text-right font-semibold text-gray-600">
                      الجنسية
                    </th>
                    <th className="px-5 py-3 text-right font-semibold text-gray-600">
                      رقم الحجز
                    </th>
                    <th className="px-5 py-3 text-right font-semibold text-gray-600">
                      الوحدة
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedGuests.map((g) => (
                    <tr
                      key={g.id}
                      className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-5 py-3 font-medium text-gray-800">
                        {g.fullName}
                      </td>
                      <td className="px-5 py-3 text-gray-600 font-mono">
                        {g.idNumber}
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {g.nationality || "—"}
                      </td>
                      <td className="px-5 py-3 text-primary font-medium">
                        #{g.reservation.id}
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {g.reservation.unit.unitNumber}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {pagedGuests.map((g) => (
                <div key={g.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-800">{g.fullName}</span>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
                      #{g.reservation.id}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>🪪 {g.idNumber}</span>
                    <span>🌍 {g.nationality || "—"}</span>
                    <span>🏠 {g.reservation.unit.unitNumber}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {!loading && guests.length > 0 && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={guests.length}
          onChange={setPage}
          className="pt-2"
        />
      )}
    </div>
  );
}
