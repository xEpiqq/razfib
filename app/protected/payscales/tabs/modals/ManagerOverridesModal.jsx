"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogTitle, DialogBody, DialogActions } from "@/components/dialog";
import { Field, Label } from "@/components/fieldset";
import { Select } from "@/components/select";
import { Input } from "@/components/input";
import { Button } from "@/components/button";
import DateRangeManager from "./DateRangeManager";

/**
 * Normal Manager Overrides using the new "manager_overrides" table with is_fidium=false.
 *
 * - managerList: array of manager objects => must not be undefined.
 *   We'll default to an empty array if not provided.
 * - assignedAgentsMap: function that returns an array of agents for a given managerId. Also default to [] if it returns nothing.
 * - plans: array of plan objects => default to [] if not provided.
 * - supabase instance
 */
export default function ManagerOverridesModal({
  payscaleName = "My Payscale",
  managerList = [],
  assignedAgentsMap = () => [],
  plans = [],
  supabase,
  onClose,
}) {
  // If managerList is empty, set managerId = "" to avoid TypeError
  const initialManagerId = managerList.length > 0 ? managerList[0].id : "";
  const [managerId, setManagerId] = useState(initialManagerId);

  // { [agentId]: { id, manager_id, agent_id, plan_overrides, date_ranges } }
  const [overridesByAgent, setOverridesByAgent] = useState({});

  useEffect(() => {
    if (managerId) {
      fetchOverrides(managerId);
    } else {
      setOverridesByAgent({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managerId]);

  async function fetchOverrides(mId) {
    const { data, error } = await supabase
      .from("manager_overrides")
      .select("*")
      .eq("manager_id", mId)
      .eq("is_fidium", false);

    if (error) {
      console.error("Error fetching overrides", error);
      setOverridesByAgent({});
      return;
    }
    const map = {};
    (data || []).forEach((row) => {
      map[row.agent_id] = row;
    });
    setOverridesByAgent(map);
  }

  function getAssignedAgents(mId) {
    const result = assignedAgentsMap(mId);
    return Array.isArray(result) ? result : [];
  }

  function getOrCreateOverrideRow(agentId) {
    const existing = overridesByAgent[agentId];
    if (!existing) {
      return {
        id: null,
        manager_id: managerId,
        agent_id: agentId,
        is_fidium: false,
        plan_overrides: {},
        date_ranges: [],
      };
    }
    return existing;
  }

  function setBaseVal(agentId, planId, newVal, isUpgrade) {
    setOverridesByAgent((prev) => {
      const oldRow = prev[agentId] || {
        id: null,
        manager_id: managerId,
        agent_id,
        is_fidium: false,
        plan_overrides: {},
        date_ranges: [],
      };
      const oldPlanOverrides = oldRow.plan_overrides || {};
      const oldPlanObj = oldPlanOverrides[planId] || { base: "0", upgrade: "0" };
      return {
        ...prev,
        [agentId]: {
          ...oldRow,
          plan_overrides: {
            ...oldPlanOverrides,
            [planId]: {
              ...oldPlanObj,
              [isUpgrade ? "upgrade" : "base"]: newVal,
            },
          },
        },
      };
    });
  }

  function getAgentDateRanges(agentId) {
    return getOrCreateOverrideRow(agentId).date_ranges || [];
  }

  function setAgentDateRanges(agentId, newRanges) {
    setOverridesByAgent((prev) => {
      const oldRow = getOrCreateOverrideRow(agentId);
      return {
        ...prev,
        [agentId]: {
          ...oldRow,
          date_ranges: newRanges,
        },
      };
    });
  }

  async function handleSave() {
    // upsert each row
    const assignedAgents = getAssignedAgents(managerId);
    // Also incorporate those in overridesByAgent (maybe not assigned anymore, but let's keep them if you want).
    const allAgentIds = new Set([...assignedAgents.map((a) => a.id), ...Object.keys(overridesByAgent)]);

    const rowsToUpsert = [];
    for (const agentId of allAgentIds) {
      const rowObj = getOrCreateOverrideRow(agentId);
      rowsToUpsert.push({
        id: rowObj.id || undefined,
        manager_id: rowObj.manager_id,
        agent_id: rowObj.agent_id,
        is_fidium: false,
        plan_overrides: rowObj.plan_overrides || {},
        date_ranges: rowObj.date_ranges || [],
      });
    }

    for (const item of rowsToUpsert) {
      const { error } = await supabase.from("manager_overrides").upsert(item).select("*").single();
      if (error) {
        console.error("Error upserting manager_overrides row:", error);
      }
    }

    onClose();
  }

  // If there's literally no managers, show empty state
  if (managerList.length === 0) {
    return (
      <Dialog open onClose={onClose} size="md">
        <DialogTitle>Manager Overrides ({payscaleName})</DialogTitle>
        <DialogBody>No managers found.</DialogBody>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} size="xl">
      <DialogTitle>Manager Overrides ({payscaleName})</DialogTitle>
      <DialogBody>
        <Field className="mb-4">
          <Label>Select Manager</Label>
          <Select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
            {managerList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.identifier}
              </option>
            ))}
          </Select>
        </Field>

        <hr className="my-4" />

        {getAssignedAgents(managerId).length === 0 && (
          <div className="text-sm text-gray-600">
            No assigned agents for this manager.
          </div>
        )}
        {getAssignedAgents(managerId).map((agt) => {
          const overrideRow = getOrCreateOverrideRow(agt.id);
          return (
            <div key={agt.id} className="mb-6 border-b pb-4">
              <h3 className="text-lg font-semibold mb-2">
                Agent: {agt.name || agt.identifier}
              </h3>

              <p className="text-sm font-medium text-gray-600 mb-2">
                Plan Overrides (Base/Upgrade):
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {plans.map((p) => {
                  const planObj = overrideRow.plan_overrides?.[p.id] || { base: "0", upgrade: "0" };
                  return (
                    <div key={p.id} className="border p-2 rounded bg-white text-sm">
                      <div className="font-medium mb-1">{p.name}</div>
                      <Field className="flex items-center mb-1">
                        <Label className="w-1/3 text-xs">Base($)</Label>
                        <Input
                          type="number"
                          value={planObj.base}
                          onChange={(e) =>
                            setBaseVal(agt.id, p.id, e.target.value, false)
                          }
                        />
                      </Field>
                      <Field className="flex items-center">
                        <Label className="w-1/3 text-xs">Upgr($)</Label>
                        <Input
                          type="number"
                          value={planObj.upgrade}
                          onChange={(e) =>
                            setBaseVal(agt.id, p.id, e.target.value, true)
                          }
                        />
                      </Field>
                    </div>
                  );
                })}
              </div>

              <p className="text-sm font-medium text-gray-600 mt-4 mb-2">
                Date Range Overrides
              </p>
              <DateRangeManager
                plans={plans}
                dateRanges={overrideRow.date_ranges}
                setDateRanges={(newRanges) => setAgentDateRanges(agt.id, newRanges)}
                label="Override Commission Amounts by Date"
              />
            </div>
          );
        })}
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave}>Save All</Button>
      </DialogActions>
    </Dialog>
  );
}
