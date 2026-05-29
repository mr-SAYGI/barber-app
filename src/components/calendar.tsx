import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CalendarProps {
  selectedDate: string; // YYYY-MM-DD
  onSelect: (date: string) => void;
  minDate?: string;
  holidays?: { holiday_date: string; name: string; is_off: boolean }[];
  onHolidayClick?: (holidayName: string) => void;
}

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
];

const DAY_NAMES = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export function Calendar({ selectedDate, onSelect, minDate, holidays, onHolidayClick }: CalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (selectedDate) return new Date(selectedDate);
    return new Date();
  });

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  // Haftayı Pazartesi başlat: Pazar (0) ise 6 yap, diğerlerini 1 eksilt
  const startingDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const days = [];
  for (let i = 0; i < startingDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }

  const min = minDate ? new Date(minDate) : null;
  if (min) min.setHours(0, 0, 0, 0);

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 w-full select-none">
      {/* Üst Kısım: Ay - Yıl Seçici */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          type="button"
          onClick={handleNextMonth}
          className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Gün İsimleri */}
      <div className="grid grid-cols-7 gap-1 text-center mb-2">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-[10px] font-bold text-slate-500">
            {d}
          </div>
        ))}
      </div>

      {/* Tarihler Grid */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {days.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} className="w-8 h-8" />;

          const fmt = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
            2,
            "0"
          )}-${String(date.getDate()).padStart(2, "0")}`;

          const isSelected = selectedDate === fmt;
          const isPast = min && date < min;
          const isToday =
            fmt ===
            `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(
              2,
              "0"
            )}-${String(new Date().getDate()).padStart(2, "0")}`;
            
          const holiday = holidays?.find(h => h.holiday_date === fmt);
          const isHolidayOff = holiday?.is_off;
          
          const isDisabled = isPast || isHolidayOff;

          return (
            <button
              key={i}
              type="button"
              disabled={isDisabled && !isHolidayOff} // if it's a holiday we want to handle the click to show toast
              onClick={() => {
                if (isPast) return;
                if (isHolidayOff) {
                  onHolidayClick?.(holiday.name);
                  return;
                }
                onSelect(fmt);
              }}
              className={`aspect-square w-full flex items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                isSelected
                  ? "bg-amber-500 text-slate-950 font-black shadow-md border border-amber-400"
                  : isPast
                  ? "text-slate-700 opacity-40 cursor-not-allowed"
                  : isHolidayOff
                  ? "bg-rose-500/10 text-rose-400 border border-rose-500/30 cursor-not-allowed"
                  : isToday
                  ? "bg-slate-800/50 text-slate-200 border border-slate-700 hover:bg-slate-800"
                  : "text-slate-400 hover:bg-slate-900 border border-transparent hover:border-slate-800"
              }`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
