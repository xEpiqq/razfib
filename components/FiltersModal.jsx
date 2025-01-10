'use client';

import { useState } from 'react';

export default function FiltersModal({
  availableColumns,
  filters,
  setFilters,
  addFilter,
  filterColumn,
  setFilterColumn,
  filterValue,
  setFilterValue,
  closeModal,
}) {
  const [condition, setCondition] = useState('');

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center"
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      {/* Background backdrop */}
      <div
        className="fixed inset-0 bg-gray-500/75 transition-opacity"
        aria-hidden="true"
        onClick={closeModal}
      ></div>

      {/* Modal panel */}
      <div className="relative transform overflow-hidden rounded-lg bg-white px-6 pb-4 pt-5 text-left transition-all sm:my-8 sm:w-full sm:max-w-2xl sm:p-6">
        <div>
          <div className="mt-3 text-center sm:mt-5">
            <h3
              className="text-lg font-semibold text-gray-900"
              id="modal-title"
            >
              Manage Filters
            </h3>
            <div className="mt-4">
              <div className="flex space-x-2 items-center">
                <select
                  value={filterColumn}
                  onChange={e => setFilterColumn(e.target.value)}
                  className="flex-1 px-2 py-1 border rounded text-sm"
                >
                  <option value="">Select Column</option>
                  {availableColumns.map(column => (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  ))}
                </select>

                {/* Condition Dropdown */}
                <select
                  value={condition}
                  onChange={e => setCondition(e.target.value)}
                  className="flex-1 px-2 py-1 border rounded text-sm"
                >
                  <option value="">Select Condition</option>
                  <option value="contains">Contains</option>
                  <option value="equals">Equals</option>
                  <option value="not_equals">Does not equal</option>
                  <option value="is_empty">Is empty</option>
                  <option value="is_not_empty">Is not empty</option>
                  <option value="does_not_contain">Does not contain</option>
                  <option value="starts_with">Starts with</option>
                  <option value="does_not_start_with">
                    Does not start with
                  </option>
                  <option value="ends_with">Ends with</option>
                  <option value="does_not_end_with">
                    Does not end with
                  </option>
                  <option value="wildcard_match">Wildcard match</option>
                  <option value="regex_match">Regex match</option>
                </select>

                <input
                  type="text"
                  value={filterValue}
                  onChange={e => setFilterValue(e.target.value)}
                  placeholder="Value"
                  className="flex-1 px-2 py-1 border rounded text-sm"
                />
                <button
                  onClick={addFilter}
                  className="text-white bg-indigo-600 hover:bg-indigo-500 rounded-full p-2"
                >
                  {/* Plus Icon */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </button>
              </div>

              {Object.keys(filters).length > 0 && (
                <div className="mt-4">
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(filters).map(([column, value]) => (
                      <span
                        key={column}
                        className="bg-gray-100 px-3 py-1 rounded text-sm flex items-center space-x-2"
                      >
                        <span>
                          {column}: {value}
                        </span>
                        <button
                          onClick={() => {
                            const updated = { ...filters };
                            delete updated[column];
                            setFilters(updated);
                          }}
                          className="text-red-500 hover:text-red-700"
                          aria-label={`Remove filter on ${column}`}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mt-6 sm:mt-6 flex justify-end space-x-3">
          <button
            type="button"
            className="inline-flex justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            onClick={closeModal}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            onClick={() => {
              // Apply filters if needed
              closeModal();
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
