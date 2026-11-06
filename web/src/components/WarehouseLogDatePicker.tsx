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
  const activeMonth = month || value.slice(0, 7);
  const [year, monthNumber] = activeMonth.split("-").map(Number);
  const leadingDays = new Date(year, monthNumber - 1, 1).getDay();
  const dayCount = new Date(year, monthNumber, 0).getDate();
  const shiftMonth = (offset: number) => {
    const index = year * 12 + monthNumber - 1 + offset;
    setMonth(`${String(Math.floor(index / 12)).padStart(4, "0")}-${String(index % 12 + 1).padStart(2, "0")}`);
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
      <summary id="log-date" aria-label="Choose warehouse log date" aria-disabled={loading}
        onClick={(event) => { if (loading) event.preventDefault(); }}>
        {loading ? "Loading dates…" : value}<span aria-hidden="true"> ▾</span>
      </summary>
      {activeMonth && (
        <div className="warehouse-log-calendar" role="group" aria-label="Packer log calendar">
          <div className="warehouse-log-calendar-nav">
            <button type="button" aria-label="Previous month" disabled={activeMonth === "0001-01"} onClick={() => shiftMonth(-1)}>‹</button>
            <input type="month" aria-label="Calendar month" min="0001-01" max="9999-12" value={activeMonth}
              onChange={(event) => { if (event.target.validity.valid && event.target.value) setMonth(event.target.value); }} />
            <button type="button" aria-label="Next month" disabled={activeMonth === "9999-12"} onClick={() => shiftMonth(1)}>›</button>
          </div>
          <div className="warehouse-log-calendar-days">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <span className="warehouse-log-weekday" key={day}>{day}</span>)}
            {Array.from({ length: leadingDays }, (_, index) => <span key={`blank-${index}`} />)}
            {Array.from({ length: dayCount }, (_, index) => {
              const day = index + 1;
              const key = `${activeMonth}-${String(day).padStart(2, "0")}`;
              const hasLogs = available.has(key);
              return <button key={key} type="button" data-has-logs={hasLogs} aria-label={key} aria-pressed={key === value}
                title={hasLogs ? "View warehouse logs" : "No warehouse logs"}
                onClick={() => {
                  onChange(key);
                  if (picker.current) {
                    picker.current.open = false;
                    picker.current.querySelector("summary")?.focus();
                  }
                }}>{day}</button>;
            })}
          </div>
          <p>Gray dates have no logs. All dates can be selected.</p>
        </div>
      )}
    </details>
  );
}
