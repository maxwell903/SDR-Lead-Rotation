import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ZoomIn, ZoomOut, RotateCcw, ExternalLink } from 'lucide-react';

interface CalendarViewOptionsProps {
  // Zoom controls
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  
  // Size controls
  rowHeight: number;
  onRowHeightChange: (value: number) => void;
  columnWidth: number;
  onColumnWidthChange: (value: number) => void;
  
  // Date format
  showDayOfMonth: boolean;
  onShowDayOfMonthChange: (value: boolean) => void;
  showDayOfWeek: boolean;
  onShowDayOfWeekChange: (value: boolean) => void;
  
  // Restrictions
  showRestrictions: boolean;
  onShowRestrictionsChange: (value: boolean) => void;
  showCanDo: boolean;
  onShowCanDoChange: (value: boolean) => void;
  showCantDo: boolean;
  onShowCantDoChange: (value: boolean) => void;
}

const CalendarViewOptions: React.FC<CalendarViewOptionsProps> = ({
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  rowHeight,
  onRowHeightChange,
  columnWidth,
  onColumnWidthChange,
  showDayOfMonth,
  onShowDayOfMonthChange,
  showDayOfWeek,
  onShowDayOfWeekChange,
  showRestrictions,
  onShowRestrictionsChange,
  showCanDo,
  onShowCanDoChange,
  showCantDo,
  onShowCantDoChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      {/* Dropdown Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors shadow-sm"
      >
        <span>View Options</span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-[800px] bg-white border border-gray-200 rounded-lg shadow-xl z-50 p-6">
          {/* Zoom Controls Section */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Zoom Controls</h4>
            <div className="flex items-center space-x-3">
              <button
                onClick={onZoomOut}
                className="flex items-center space-x-1 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                disabled={zoomLevel <= 50}
              >
                <ZoomOut className="w-4 h-4" />
                <span>Zoom Out</span>
              </button>
              
              <span className="text-sm font-medium bg-gray-50 px-3 py-1 rounded-md border border-gray-200 min-w-[60px] text-center">
                {zoomLevel}%
              </span>
              
              <button
                onClick={onZoomIn}
                className="flex items-center space-x-1 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                disabled={zoomLevel >= 150}
              >
                <ZoomIn className="w-4 h-4" />
                <span>Zoom In</span>
              </button>
              
              <button
                onClick={onResetZoom}
                className="flex items-center space-x-1 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Grid with all other controls */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Row Height Slider */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Cell Height: {rowHeight}px
              </label>
              <input
                type="range"
                min="40"
                max="120"
                value={rowHeight}
                onChange={(e) => onRowHeightChange(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((rowHeight - 40) / (120 - 40)) * 100}%, #e5e7eb ${((rowHeight - 40) / (120 - 40)) * 100}%, #e5e7eb 100%)`
                }}
              />
            </div>

            {/* Column Width Slider */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Cell Width: {columnWidth}px
              </label>
              <input
                type="range"
                min="100"
                max="250"
                value={columnWidth}
                onChange={(e) => onColumnWidthChange(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((columnWidth - 100) / (250 - 100)) * 100}%, #e5e7eb ${((columnWidth - 100) / (250 - 100)) * 100}%, #e5e7eb 100%)`
                }}
              />
            </div>

            {/* Date Format Toggles */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Date Format</label>
              <div className="flex flex-col space-y-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={showDayOfMonth}
                    onChange={(e) => onShowDayOfMonthChange(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600">Show Day of Month</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={showDayOfWeek}
                    onChange={(e) => onShowDayOfWeekChange(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600">Show Day of Week</span>
                </label>
              </div>
            </div>

            {/* Restriction Display Toggles */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Rep Restrictions</label>
              <div className="flex flex-col space-y-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={showRestrictions}
                    onChange={(e) => onShowRestrictionsChange(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600">Show Restrictions</span>
                </label>
                {showRestrictions && (
                  <>
                    <label className="flex items-center space-x-2 ml-4">
                      <input
                        type="checkbox"
                        checked={showCanDo}
                        onChange={(e) => onShowCanDoChange(e.target.checked)}
                        className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500"
                      />
                      <span className="text-sm text-gray-600">Restrictions</span>
                    </label>
                    <label className="flex items-center space-x-2 ml-4">
                      <input
                        type="checkbox"
                        checked={showCantDo}
                        onChange={(e) => onShowCantDoChange(e.target.checked)}
                        className="w-4 h-4 text-red-600 bg-gray-100 border-gray-300 rounded focus:ring-red-500"
                      />
                      <span className="text-sm text-gray-600">Permissions</span>
                    </label>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Legend Section */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <label className="text-sm font-semibold text-gray-700 mb-3 block">Legend</label>
            <div className="grid grid-cols-5 gap-4 text-xs">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-blue-100 border border-blue-200 rounded"></div>
                <span className="text-gray-700">Lead</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-yellow-100 border border-yellow-200 rounded"></div>
                <span className="text-gray-700">Skip</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-red-100 border border-red-200 rounded"></div>
                <span className="text-gray-700">OOO</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-green-100 border border-green-200 rounded"></div>
                <span className="text-gray-700">Next</span>
              </div>
              <div className="flex items-center space-x-2">
                <ExternalLink className="w-4 h-4 text-blue-600" />
                <span className="text-gray-700">Clickable Link</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarViewOptions;