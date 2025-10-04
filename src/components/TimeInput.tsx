// src/components/TimeInput.tsx
import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface TimeInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const TimeInput: React.FC<TimeInputProps> = ({ value, onChange, disabled = false }) => {
  const [hour, setHour] = useState('9');
  const [minute, setMinute] = useState('00');
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');

  // Parse existing value on mount or when value changes
  useEffect(() => {
    const match = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (match) {
      setHour(match[1]);
      setMinute(match[2]);
      setPeriod(match[3].toUpperCase() as 'AM' | 'PM');
    }
  }, [value]);

  // Update parent when values change
  useEffect(() => {
    const formattedTime = `${hour}:${minute} ${period}`;
    if (formattedTime !== value) {
      onChange(formattedTime);
    }
  }, [hour, minute, period]);

  const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value) || 0;
    if (val >= 1 && val <= 12) {
      setHour(val.toString());
    } else if (val === 0) {
      setHour('12');
    }
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value) || 0;
    if (val >= 0 && val <= 59) {
      setMinute(val.toString().padStart(2, '0'));
    }
  };

  return (
    <div className="flex items-center space-x-2 w-full">
      <div className="flex items-center flex-1 border-2 border-blue-200 rounded-xl bg-blue-50 px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
        <Clock className="w-4 h-4 text-gray-500 mr-2" />
        <input
          type="number"
          min="1"
          max="12"
          value={hour}
          onChange={handleHourChange}
          disabled={disabled}
          className="w-12 text-center bg-transparent border-none focus:outline-none font-medium text-gray-700"
          placeholder="09"
        />
        <span className="text-gray-600 font-medium">:</span>
        <input
          type="number"
          min="0"
          max="59"
          step="15"
          value={minute}
          onChange={handleMinuteChange}
          disabled={disabled}
          className="w-12 text-center bg-transparent border-none focus:outline-none font-medium text-gray-700"
          placeholder="00"
        />
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as 'AM' | 'PM')}
          disabled={disabled}
          className="ml-2 bg-transparent border-none focus:outline-none font-medium text-gray-700 cursor-pointer"
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
};