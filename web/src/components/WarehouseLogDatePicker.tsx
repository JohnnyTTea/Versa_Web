import { useEffect, useRef, useState } from "react";
import "../styles/warehouse-log-calendar.css";

type Props = {
  dates: string[];
  value: string;
  loading: boolean;
  onChange: (date: string) => void;
};

export default function WarehouseLogDatePicker({ dates, value, loading, onChange }: Props) {
  const picker = useRef<HTMLDetailsElement>(null);
  const [month, setMonth] = useState(value.slice(0, 7));
  const available = new Set(dates);
  const months = [...new Set(dates.map((date) => date.slice(0, 7)))].sort();
  const activeMonth = months.includes(month) ? month : value.slice(0, 7) || months.at(-1) || "";
  const monthIndex = months.indexOf(activeMonth);
  const [year, monthNumber] = activeMonth.split("-").map(Number);
  const leadingDays = activeMonth ? new Date(year, monthNumber - 1, 1).getDay() : 0;
  const dayCount = activeMonth ? new Date(year, monthNumber, 0).getDate() : 0;
  const monthLabel = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  useEffect(() => { setMonth(value.slice(0, 7)); }, [value]);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (picker.current && !picker.current.contains(event.target as Node)) picker.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  return (
    <details ref={picker} className="warehouse-log-date-picker" onKeyDown={(event) => {
      if (event.key === "Escape" && picker.current) {
        picker.current.open = false;
        picker.current.querySelector("summary")?.focus();
      }
    }}>
      <summary id="log-date" aria-label="Choose warehouse log date" aria-disabled={loading || !dates.length}
        onClick={(event) => { if (loading || !dates.length) event.preventDefault(); }}>
        {loading ? "Loading dates…" : value || "No log dates"}<span aria-hidden="true"> ▾</span>
      </summary>
      {dates.length > 0 && (
        <div className="warehouse-log-calendar" role="group" aria-label="Warehouse log calendar">
          <div className="warehouse-log-calendar-nav">
            <button type="button" aria-label="Previous month with data" disabled={monthIndex <= 0} onClick={() => setMonth(months[monthIndex - 1])}>‹</button>
            <select aria-label="Calendar month" value={activeMonth} onChange={(event) => setMonth(event.target.value)}>
              {months.map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}
            </select>
            <button type="button" aria-label="Next month with data" disabled={monthIndex >= months.length - 1} onClick={() => setMonth(months[monthIndex + 1])}>›</button>
          </div>
          <div className="warehouse-log-calendar-days">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <span className="warehouse-log-weekday" key={day}>{day}</span>)}
            {Array.from({ length: leadingDays }, (_, index) => <span key={`blank-${index}`} />)}
            {Array.from({ length: dayCount }, (_, index) => {
              const day = index + 1;
              const key = `${activeMonth}-${String(day).padStart(2, "0")}`;
              const enabled = available.has(key);
              return <button key={key} type="button" disabled={!enabled} aria-label={key} aria-pressed={key === value}
                title={enabled ? "View warehouse logs" : "No warehouse logs"}
                onClick={() => {
                  if (!enabled) return;
                  onChange(key);
                  if (picker.current) {
                    picker.current.open = false;
                    picker.current.querySelector("summary")?.focus();
                  }
                }}>{day}</button>;
            })}
          </div>
          <p>Gray dates have no logs and cannot be selected.</p>
        </div>
      )}
    </details>
  );
}
