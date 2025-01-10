"use client";

import { Field, Label } from "@/components/fieldset";
import { Input } from "@/components/input";
import { Button } from "@/components/button";

/**
 * For Fidium, typically no "upgrade," just "base." 
 * We'll still store them in planValues as { base, upgrade }, but upgrade can be ignored.
 *
 * Props:
 *   - fidiumPlans: array of { id, name }
 *   - dateRanges: array
 *   - setDateRanges: function
 *   - label: string
 */
export default function DateRangeManagerFidium({
  fidiumPlans = [],
  dateRanges = [],
  setDateRanges,
  label,
}) {
  const safeRanges = Array.isArray(dateRanges) ? dateRanges : [];
  const safePlans = Array.isArray(fidiumPlans) ? fidiumPlans : [];

  function addNewRange() {
    setDateRanges((prev) => {
      const old = Array.isArray(prev) ? prev : [];
      const planObj = {};
      for (const fp of safePlans) {
        planObj[fp.id] = { base: "0" };
      }
      const newRange = {
        id: "local-" + Math.random().toString(36).substring(2),
        start_date: "",
        end_date: "",
        planValues: planObj,
      };
      return [...old, newRange];
    });
  }

  function removeRange(id) {
    setDateRanges((prev) => {
      const old = Array.isArray(prev) ? prev : [];
      return old.filter((dr) => dr.id !== id);
    });
  }

  function updateRange(id, field, value) {
    setDateRanges((prev) => {
      const old = Array.isArray(prev) ? prev : [];
      return old.map((dr) => {
        if (dr.id !== id) return dr;
        return { ...dr, [field]: value };
      });
    });
  }

  function updatePlanValue(rangeId, planId, newVal) {
    setDateRanges((prev) => {
      const old = Array.isArray(prev) ? prev : [];
      return old.map((dr) => {
        if (dr.id !== rangeId) return dr;
        const oldVals = dr.planValues || {};
        const planObj = oldVals[planId] || { base: "0" };
        return {
          ...dr,
          planValues: {
            ...oldVals,
            [planId]: {
              ...planObj,
              base: newVal,
            },
          },
        };
      });
    });
  }

  return (
    <div className="border p-2 rounded bg-gray-50">
      <h4 className="font-semibold mb-2">{label}</h4>
      <Button variant="outline" onClick={addNewRange}>
        + Add Date Range
      </Button>

      {safeRanges.length === 0 && (
        <div className="text-xs text-gray-400 mt-1">(No date ranges)</div>
      )}

      {safeRanges.map((dr) => (
        <div key={dr.id} className="p-2 border rounded mt-2 bg-white">
          <div className="flex items-center gap-4 mb-2">
            <Field className="w-1/3">
              <Label className="text-sm">Start Date</Label>
              <Input
                type="date"
                value={dr.start_date || ""}
                onChange={(e) => updateRange(dr.id, "start_date", e.target.value)}
              />
            </Field>
            <Field className="w-1/3">
              <Label className="text-sm">End Date</Label>
              <Input
                type="date"
                value={dr.end_date || ""}
                onChange={(e) => updateRange(dr.id, "end_date", e.target.value)}
              />
            </Field>
            <Button size="sm" variant="outline" onClick={() => removeRange(dr.id)}>
              Remove
            </Button>
          </div>

          {/* Per-plan fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {safePlans.map((fp) => {
              const valObj = dr.planValues?.[fp.id] || { base: "0" };
              return (
                <div key={fp.id} className="border p-2 rounded text-sm">
                  <div className="font-medium mb-1">{fp.name}</div>
                  <Field className="flex items-center">
                    <Label className="w-1/3 text-xs">Base($)</Label>
                    <Input
                      type="number"
                      value={valObj.base}
                      onChange={(e) =>
                        updatePlanValue(dr.id, fp.id, e.target.value)
                      }
                    />
                  </Field>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
