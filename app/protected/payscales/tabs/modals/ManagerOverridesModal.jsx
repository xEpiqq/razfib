"use client";

import React, { useState, useEffect } from "react";
import { Dialog } from "@/components/dialog";
import { Field, Label } from "@/components/fieldset";
import { Input } from "@/components/input";
import { Button } from "@/components/button";

/**
 * ManagerOverridesModal
 *
 * For each agent managed by a manager on this normal manager payscale:
 * - We unify existing date-range rows that share start_date/end_date into a single `globalRanges` object.
 * - The user can only add/edit date ranges if there's at least one plan override row (dbId) for that manager->agent.
 * - On save, we remove old date-range rows and re-insert them in one pass.
 */
export default function ManagerOverridesModal({
  payscale,
  agents,
  agentManagers,
  plans,
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
   *           [planId]: { base: string, upgrade: string, dbId?: string }
   *         },
   *         globalRanges: [
   *           {
   *             id: string,
   *             start_date: string,
   *             end_date: string,
   *             rowIds: array<string>,
   *             planValues: {
   *               [planId]: { base: string, upgrade: string }
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
      .filter((a) => a.manager_payscale_id === payscale.id)
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
      .from("manager_agent_commissions")
      .select("*, manager_agent_commission_date_ranges(*)")
      .in("manager_id", managerIds);

    const initData = {};

    (overrides || []).forEach((ov) => {
      const mId = ov.manager_id;
      const aId = ov.agent_id;
      const pId = ov.plan_id;

      if (!initData[mId]) initData[mId] = {};
      if (!initData[mId][aId]) {
        initData[mId][aId] = {
          plans: {},
          globalRanges: [],
        };
      }

      // per-plan base/upgrade override
      initData[mId][aId].plans[pId] = {
        base: ov.manager_commission_value?.toString() || "0",
        upgrade: ov.manager_upgrade_commission_value?.toString() || "0",
        dbId: ov.id,
      };

      // unify date ranges
      (ov.manager_agent_commission_date_ranges || []).forEach((dr) => {
        const s = dr.start_date || "";
        const e = dr.end_date || "";
        const block = initData[mId][aId];
        let rangeObj = block.globalRanges.find(
          (x) => x.start_date === s && x.end_date === e
        );
        if (!rangeObj) {
          // create
          const planObj = {};
          for (const pl of plans) {
            planObj[pl.id] = { base: "0", upgrade: "0" };
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

        // set plan’s base/upgrade
        rangeObj.planValues[pId].base =
          dr.manager_commission_value?.toString() || "0";
        rangeObj.planValues[pId].upgrade =
          dr.manager_upgrade_commission_value?.toString() || "0";
      });
    });

    setOverrideData(initData);
  }

  // per-plan outside date ranges
  function getPlanVal(mId, aId, pId, field) {
    return overrideData[mId]?.[aId]?.plans[pId]?.[field] || "0";
  }
  function setPlanVal(mId, aId, pId, field, val) {
    setOverrideData((prev) => {
      const next = structuredClone(prev);
      if (!next[mId]) next[mId] = {};
      if (!next[mId][aId]) {
        next[mId][aId] = { plans: {}, globalRanges: [] };
      }
      if (!next[mId][aId].plans[pId]) {
        next[mId][aId].plans[pId] = { base: "0", upgrade: "0" };
      }
      next[mId][aId].plans[pId][field] = val;
      return next;
    });
  }

  // agent-level date ranges
  function addAgentDateRange(mId, aId) {
    const block = overrideData[mId]?.[aId];
    if (!block) return;
    // user can only add a date range if at least one plan override row is in DB
    const hasAnyDbId = Object.values(block.plans).some((p) => p.dbId);
    if (!hasAnyDbId) {
      alert(
        "You must set a base/upgrade override (and save) for at least one plan before creating date ranges."
      );
      return;
    }

    // proceed
    setOverrideData((prev) => {
      const next = structuredClone(prev);
      const planObj = {};
      for (const pl of plans) {
        planObj[pl.id] = { base: "0", upgrade: "0" };
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

  function setDateRangePlanVal(mId, aId, rangeId, planId, field, val) {
    setOverrideData((prev) => {
      const next = structuredClone(prev);
      const ranges = next[mId][aId].globalRanges;
      const idx = ranges.findIndex((r) => r.id === rangeId);
      if (idx >= 0) {
        ranges[idx].planValues[planId][field] = val;
      }
      return next;
    });
  }

  async function handleSave() {
    // For each manager->agent, upsert plan base/upgrade,
    // remove old date range rows, then insert new from globalRanges
    for (const mId in overrideData) {
      for (const aId in overrideData[mId]) {
        const block = overrideData[mId][aId];

        // upsert each plan
        for (const pId in block.plans) {
          const baseVal = parseFloat(block.plans[pId].base) || 0;
          const upgVal = parseFloat(block.plans[pId].upgrade) || 0;
          let rowId = block.plans[pId].dbId;

          if (!rowId) {
            // insert
            const { data: inserted } = await supabase
              .from("manager_agent_commissions")
              .insert([
                {
                  manager_id: mId,
                  agent_id: aId,
                  plan_id: pId,
                  manager_commission_value: baseVal,
                  manager_upgrade_commission_value: upgVal,
                },
              ])
              .select("*")
              .single();
            if (inserted) {
              rowId = inserted.id;
              block.plans[pId].dbId = rowId;
            }
          } else {
            // update
            await supabase
              .from("manager_agent_commissions")
              .update({
                manager_commission_value: baseVal,
                manager_upgrade_commission_value: upgVal,
              })
              .eq("id", rowId);
          }

          // remove old date ranges, then re-insert new
          if (rowId) {
            await supabase
              .from("manager_agent_commission_date_ranges")
              .delete()
              .eq("manager_agent_commission_id", rowId);

            for (const dr of block.globalRanges) {
              const st = dr.start_date || null;
              const ed = dr.end_date || null;
              const bVal = parseFloat(dr.planValues[pId].base) || 0;
              const uVal = parseFloat(dr.planValues[pId].upgrade) || 0;

              await supabase.from("manager_agent_commission_date_ranges").insert([
                {
                  manager_agent_commission_id: rowId,
                  plan_id: pId,
                  start_date: st,
                  end_date: ed,
                  manager_commission_value: bVal,
                  manager_upgrade_commission_value: uVal,
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
          <h2 className="text-xl font-bold">Manager Overrides: {payscale.name}</h2>
        </div>

        <div className="overflow-auto p-4 flex-1">
          {managedAgents.length === 0 ? (
            <div>No agents assigned to managers with this payscale.</div>
          ) : (
            managedAgents.map((agent) => {
              const managerLinks = agentManagers.filter(
                (am) =>
                  am.agent_id === agent.id &&
                  agents.find((x) => x.id === am.manager_id)
                    ?.manager_payscale_id === payscale.id
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

                        {/* Per-plan base/upgrade overrides */}
                        <div className="space-y-3">
                          {plans.map((pl) => {
                            const baseVal = getPlanVal(
                              manager.id,
                              agent.id,
                              pl.id,
                              "base"
                            );
                            const upgVal = getPlanVal(
                              manager.id,
                              agent.id,
                              pl.id,
                              "upgrade"
                            );
                            return (
                              <div key={pl.id} className="flex items-center gap-4">
                                <span className="w-40 font-semibold">{pl.name}</span>
                                <Field className="flex items-center">
                                  <Label className="text-xs mr-1">Base($)</Label>
                                  <Input
                                    type="number"
                                    className="w-20"
                                    value={baseVal}
                                    onChange={(e) =>
                                      setPlanVal(
                                        manager.id,
                                        agent.id,
                                        pl.id,
                                        "base",
                                        e.target.value
                                      )
                                    }
                                  />
                                </Field>
                                <Field className="flex items-center">
                                  <Label className="text-xs mr-1">Upg($)</Label>
                                  <Input
                                    type="number"
                                    className="w-20"
                                    value={upgVal}
                                    onChange={(e) =>
                                      setPlanVal(
                                        manager.id,
                                        agent.id,
                                        pl.id,
                                        "upgrade",
                                        e.target.value
                                      )
                                    }
                                  />
                                </Field>
                              </div>
                            );
                          })}
                        </div>

                        {/* Agent-wide date ranges */}
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

                              {/* plan-specific fields */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {plans.map((pl) => {
                                  const pValBase = dr.planValues[pl.id]?.base || "0";
                                  const pValUpg = dr.planValues[pl.id]?.upgrade || "0";
                                  return (
                                    <div
                                      key={pl.id}
                                      className="border p-2 rounded text-sm"
                                    >
                                      <div className="font-medium mb-1">
                                        {pl.name}
                                      </div>
                                      <Field className="flex items-center mb-1">
                                        <Label className="w-1/3 text-xs">Base</Label>
                                        <Input
                                          type="number"
                                          value={pValBase}
                                          onChange={(e) =>
                                            setDateRangePlanVal(
                                              manager.id,
                                              agent.id,
                                              dr.id,
                                              pl.id,
                                              "base",
                                              e.target.value
                                            )
                                          }
                                        />
                                      </Field>
                                      <Field className="flex items-center">
                                        <Label className="w-1/3 text-xs">Upg</Label>
                                        <Input
                                          type="number"
                                          value={pValUpg}
                                          onChange={(e) =>
                                            setDateRangePlanVal(
                                              manager.id,
                                              agent.id,
                                              dr.id,
                                              pl.id,
                                              "upgrade",
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
