"use client";

import React, { useState, useEffect } from "react";
import { Dialog } from "@/components/dialog";
import { Field, Label } from "@/components/fieldset";
import { Input } from "@/components/input";
import { Button } from "@/components/button";

/**
 * FidiumManagerOverridesModal
 *
 * For each agent managed by a manager on this Fidium manager payscale:
 * - We unify existing date-range rows that share start_date/end_date into a single `globalRanges` object.
 * - The user can only add/edit date ranges if there's at least one plan override row (dbId) for that manager->agent.
 * - On save, we remove old date-range rows and re-insert them in one pass.
 */
export default function FidiumManagerOverridesModal({
  payscale,
  agents,
  agentManagers,
  fidiumPlans,
  supabase,
  onClose,
}) {
  const [managedAgents, setManagedAgents] = useState([]);

  /**
   * overrideData shape:
   *   {
   *     [managerId]: {
   *       [agentId]: {
   *         plans: {
   *           [planId]: { base: string, dbId?: string }
   *         },
   *         globalRanges: [
   *           {
   *             id: string,           // local ID for React
   *             start_date: string,
   *             end_date: string,
   *             rowIds: array<string>, // existing DB row IDs
   *             planValues: {
   *               [planId]: { base: string }
   *             }
   *           }
   *         ]
   *       }
   *     }
   *   }
   */
  const [overrideData, setOverrideData] = useState({});

  useEffect(() => {
    const managerIds = agents
      .filter((a) => a.fidium_manager_payscale_id === payscale.id)
      .map((a) => a.id);

    const relevantLinks = agentManagers.filter((am) =>
      managerIds.includes(am.manager_id)
    );
    const relevantAgentIds = [...new Set(relevantLinks.map((am) => am.agent_id))];
    setManagedAgents(agents.filter((a) => relevantAgentIds.includes(a.id)));

    loadExistingOverrides(managerIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadExistingOverrides(managerIds) {
    if (!managerIds.length) {
      setOverrideData({});
      return;
    }

    const { data: overrides } = await supabase
      .from("fidium_manager_agent_commissions")
      .select("*, fidium_manager_agent_commission_date_ranges(*)")
      .in("manager_id", managerIds);

    const initData = {};

    (overrides || []).forEach((ov) => {
      const mId = ov.manager_id;
      const aId = ov.agent_id;
      const pId = ov.fidium_plan_id;

      if (!initData[mId]) initData[mId] = {};
      if (!initData[mId][aId]) {
        initData[mId][aId] = {
          plans: {},
          globalRanges: [],
        };
      }

      // per-plan base override
      initData[mId][aId].plans[pId] = {
        base: ov.manager_commission_value?.toString() || "0",
        dbId: ov.id,
      };

      // unify date ranges by (start_date, end_date)
      (ov.fidium_manager_agent_commission_date_ranges || []).forEach((dr) => {
        const s = dr.start_date || "";
        const e = dr.end_date || "";
        const block = initData[mId][aId];
        let rangeObj = block.globalRanges.find(
          (x) => x.start_date === s && x.end_date === e
        );
        if (!rangeObj) {
          // create new date range block
          const planObj = {};
          for (const fp of fidiumPlans) {
            planObj[fp.id] = { base: "0" };
          }
          rangeObj = {
            id: "db-" + Math.random().toString(36).slice(2),
            start_date: s,
            end_date: e,
            rowIds: [],
            planValues: planObj,
          };
          block.globalRanges.push(rangeObj);
        }
        rangeObj.rowIds.push(dr.id);
        // set the plan's base value
        rangeObj.planValues[pId].base =
          dr.manager_commission_value?.toString() || "0";
      });
    });

    setOverrideData(initData);
  }

  // per-plan base override
  function getPlanBase(mId, aId, pId) {
    return overrideData[mId]?.[aId]?.plans[pId]?.base || "0";
  }
  function setPlanBase(mId, aId, pId, val) {
    setOverrideData((prev) => {
      const next = structuredClone(prev);
      if (!next[mId]) next[mId] = {};
      if (!next[mId][aId]) {
        next[mId][aId] = { plans: {}, globalRanges: [] };
      }
      if (!next[mId][aId].plans[pId]) {
        next[mId][aId].plans[pId] = { base: "0" };
      }
      next[mId][aId].plans[pId].base = val;
      return next;
    });
  }

  // agent-level date ranges
  function addAgentDateRange(mId, aId) {
    // if no plan has a dbId, show a message or do nothing
    const block = overrideData[mId]?.[aId];
    if (!block) return;
    const hasAnyDbId = Object.values(block.plans).some((p) => p.dbId);
    if (!hasAnyDbId) {
      alert(
        "You must set a base override (and save) for at least one plan before creating date ranges."
      );
      return;
    }

    // otherwise proceed
    setOverrideData((prev) => {
      const next = structuredClone(prev);
      const planObj = {};
      for (const fp of fidiumPlans) {
        planObj[fp.id] = { base: "0" };
      }
      next[mId][aId].globalRanges.push({
        id: "local-" + Math.random().toString(36).slice(2),
        start_date: "",
        end_date: "",
        rowIds: [],
        planValues: planObj,
      });
      return next;
    });
  }

  function setDateRangeVal(mId, aId, rangeId, field, value) {
    setOverrideData((prev) => {
      const next = structuredClone(prev);
      const ranges = next[mId][aId].globalRanges;
      const idx = ranges.findIndex((r) => r.id === rangeId);
      if (idx >= 0) {
        ranges[idx][field] = value;
      }
      return next;
    });
  }

  function setDateRangePlanVal(mId, aId, rangeId, planId, val) {
    setOverrideData((prev) => {
      const next = structuredClone(prev);
      const ranges = next[mId][aId].globalRanges;
      const idx = ranges.findIndex((r) => r.id === rangeId);
      if (idx >= 0) {
        ranges[idx].planValues[planId].base = val;
      }
      return next;
    });
  }

  async function handleSave() {
    // For each manager->agent, upsert base for each plan => rowId
    // Then remove old date range rows, then re-insert new from globalRanges
    for (const mId in overrideData) {
      for (const aId in overrideData[mId]) {
        const block = overrideData[mId][aId];

        // Upsert base for each plan
        for (const pId in block.plans) {
          const baseVal = parseFloat(block.plans[pId].base) || 0;
          let rowId = block.plans[pId].dbId;

          if (!rowId) {
            // Insert
            const { data: inserted } = await supabase
              .from("fidium_manager_agent_commissions")
              .insert([
                {
                  manager_id: mId,
                  agent_id: aId,
                  fidium_plan_id: pId,
                  manager_commission_value: baseVal,
                },
              ])
              .select("*")
              .single();
            if (inserted) {
              rowId = inserted.id;
              block.plans[pId].dbId = rowId;
            }
          } else {
            // Update
            await supabase
              .from("fidium_manager_agent_commissions")
              .update({ manager_commission_value: baseVal })
              .eq("id", rowId);
          }

          // remove old date range rows and re-insert
          if (rowId) {
            await supabase
              .from("fidium_manager_agent_commission_date_ranges")
              .delete()
              .eq("fidium_manager_agent_commission_id", rowId);

            for (const dr of block.globalRanges) {
              const st = dr.start_date || null;
              const ed = dr.end_date || null;
              const valBase = parseFloat(dr.planValues[pId].base) || 0;
              await supabase
                .from("fidium_manager_agent_commission_date_ranges")
                .insert([
                  {
                    fidium_manager_agent_commission_id: rowId,
                    fidium_plan_id: pId,
                    start_date: st,
                    end_date: ed,
                    manager_commission_value: valBase,
                  },
                ]);
            }
          }
        }
      }
    }
    onClose();
  }

  return (
    <Dialog open onClose={onClose} size="xl">
      <div className="flex flex-col h-[80vh]">
        <div className="px-4 py-2 border-b">
          <h2 className="text-xl font-bold">
            Fidium Manager Overrides: {payscale.name}
          </h2>
        </div>

        <div className="overflow-auto p-4 flex-1">
          {managedAgents.length === 0 ? (
            <div>No agents assigned to managers with this Fidium manager payscale.</div>
          ) : (
            managedAgents.map((agent) => {
              const managerLinks = agentManagers.filter(
                (am) =>
                  am.agent_id === agent.id &&
                  agents.find((x) => x.id === am.manager_id)
                    ?.fidium_manager_payscale_id === payscale.id
              );
              if (!managerLinks.length) return null;

              return (
                <div key={agent.id} className="border p-4 mb-4 rounded bg-gray-50">
                  <h3 className="font-bold text-lg mb-2">
                    Agent: {agent.name || agent.identifier}
                  </h3>

                  {managerLinks.map((ml) => {
                    const manager = agents.find((a) => a.id === ml.manager_id);
                    if (!manager) return null;

                    return (
                      <div key={ml.id} className="mb-4 border-l pl-4">
                        <p className="text-gray-600 mb-2">
                          Manager: {manager.name || manager.identifier}
                        </p>

                        {/* Per-plan base overrides */}
                        <div className="space-y-3">
                          {fidiumPlans.map((fp) => {
                            const baseVal = getPlanBase(manager.id, agent.id, fp.id);
                            return (
                              <div key={fp.id} className="flex items-center gap-4">
                                <span className="w-40 font-semibold">{fp.name}</span>
                                <Field className="flex items-center">
                                  <Label className="text-xs mr-1">Base($)</Label>
                                  <Input
                                    type="number"
                                    className="w-20"
                                    value={baseVal}
                                    onChange={(e) =>
                                      setPlanBase(manager.id, agent.id, fp.id, e.target.value)
                                    }
                                  />
                                </Field>
                              </div>
                            );
                          })}
                        </div>

                        {/* Agent-wide date ranges (for all plans) */}
                        <div className="mt-4 p-2">
                          <div className="font-semibold mb-2">Global Date Ranges</div>

                          {overrideData[manager.id]?.[agent.id]?.globalRanges?.map((dr) => (
                            <div
                              key={dr.id}
                              className="border p-2 rounded mb-2 space-y-2"
                            >
                              <div className="flex gap-4">
                                <Field>
                                  <Label className="text-xs">Start Date</Label>
                                  <Input
                                    type="date"
                                    value={dr.start_date}
                                    onChange={(e) =>
                                      setDateRangeVal(
                                        manager.id,
                                        agent.id,
                                        dr.id,
                                        "start_date",
                                        e.target.value
                                      )
                                    }
                                  />
                                </Field>
                                <Field>
                                  <Label className="text-xs">End Date</Label>
                                  <Input
                                    type="date"
                                    value={dr.end_date}
                                    onChange={(e) =>
                                      setDateRangeVal(
                                        manager.id,
                                        agent.id,
                                        dr.id,
                                        "end_date",
                                        e.target.value
                                      )
                                    }
                                  />
                                </Field>
                              </div>

                              {/* All fidium plans inside this date range */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {fidiumPlans.map((fp) => {
                                  const rangeBaseVal =
                                    dr.planValues[fp.id]?.base || "0";
                                  return (
                                    <div
                                      key={fp.id}
                                      className="border p-2 rounded text-sm"
                                    >
                                      <div className="font-medium mb-1">{fp.name}</div>
                                      <Field className="flex items-center">
                                        <Label className="w-1/3 text-xs">Base($)</Label>
                                        <Input
                                          type="number"
                                          value={rangeBaseVal}
                                          onChange={(e) =>
                                            setDateRangePlanVal(
                                              manager.id,
                                              agent.id,
                                              dr.id,
                                              fp.id,
                                              e.target.value
                                            )
                                          }
                                        />
                                      </Field>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => addAgentDateRange(manager.id, agent.id)}
                          >
                            + Add Date Range
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <div className="border-t p-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Overrides</Button>
        </div>
      </div>
    </Dialog>
  );
}
