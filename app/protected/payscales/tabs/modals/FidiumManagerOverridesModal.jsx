"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogTitle, DialogBody, DialogActions } from "@/components/dialog";
import { Field, Label } from "@/components/fieldset";
import { Select } from "@/components/select";
import { Input } from "@/components/input";
import { Button } from "@/components/button";
import DateRangeManagerFidium from "./DateRangeManagerFidium";

/**
 * Fidium Manager Overrides using "manager_overrides" table with is_fidium=true.
 *
 * Props:
 *   - payscaleName (string)
 *   - managerList: array of manager objects
 *   - assignedAgentsMap: function that returns array of agents for a manager
 *   - fidiumPlans: array of {id, name}
 *   - supabase
 */
export default function FidiumManagerOverridesModal({
  payscaleName = "Fidium Payscale",
  managerList = [],
  assignedAgentsMap = () => [],
  fidiumPlans = [],
  supabase,
  onClose,
}) {
  const initialManagerId = managerList.length > 0 ? managerList[0].id : "";
  const [managerId, setManagerId] = useState(initialManagerId);

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
      .eq("is_fidium", true);

    if (error) {
      console.error("Error fetching Fidium overrides:", error);
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
        is_fidium: true,
        plan_overrides: {},
        date_ranges: [],
      };
    }
    return existing;
  }

  function setBaseVal(agentId, planId, newVal) {
    setOverridesByAgent((prev) => {
      const oldRow = prev[agentId] || {
        id: null,
        manager_id: managerId,
        agent_id,
        is_fidium: true,
        plan_overrides: {},
        date_ranges: [],
      };
      const oldPlan = oldRow.plan_overrides[planId] || { base: "0" };
      return {
        ...prev,
        [agentId]: {
          ...oldRow,
          plan_overrides: {
            ...oldRow.plan_overrides,
            [planId]: {
              ...oldPlan,
              base: newVal,
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
    // gather all agent rows
    const assignedAgents = getAssignedAgents(managerId);
    const allAgentIds = new Set([...assignedAgents.map((a) => a.id), ...Object.keys(overridesByAgent)]);

    const rowsToUpsert = [];
    for (const agentId of allAgentIds) {
      const rowObj = getOrCreateOverrideRow(agentId);
      rowsToUpsert.push({
        id: rowObj.id || undefined,
        manager_id: rowObj.manager_id,
        agent_id: rowObj.agent_id,
        is_fidium: true,
        plan_overrides: rowObj.plan_overrides || {},
        date_ranges: rowObj.date_ranges || [],
      });
    }

    for (const item of rowsToUpsert) {
      const { error } = await supabase.from("manager_overrides").upsert(item).select("*").single();
      if (error) {
        console.error("Error upserting Fidium override row:", error);
      }
    }

    onClose();
  }

  if (managerList.length === 0) {
    return (
      <Dialog open onClose={onClose} size="md">
        <DialogTitle>Fidium Manager Overrides ({payscaleName})</DialogTitle>
        <DialogBody>No Fidium managers found.</DialogBody>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} size="xl">
      <DialogTitle>Fidium Manager Overrides ({payscaleName})</DialogTitle>
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
          <div>This manager has no assigned agents.</div>
        )}
        {getAssignedAgents(managerId).map((agt) => {
          const row = getOrCreateOverrideRow(agt.id);
          return (
            <div key={agt.id} className="mb-6 border-b pb-4">
              <h3 className="text-lg font-semibold mb-2">
                Agent: {agt.name || agt.identifier}
              </h3>

              <p className="text-sm font-medium text-gray-600 mb-2">
                Base Overrides (per Fidium plan):
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {fidiumPlans.map((fp) => {
                  const planObj = row.plan_overrides?.[fp.id] || { base: "0" };
                  return (
                    <div key={fp.id} className="border p-2 rounded bg-white text-sm">
                      <div className="font-medium mb-1">{fp.name}</div>
                      <Field className="flex items-center">
                        <Label className="w-1/3 text-xs">Base($)</Label>
                        <Input
                          type="number"
                          value={planObj.base}
                          onChange={(e) =>
                            setBaseVal(agt.id, fp.id, e.target.value)
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
              <DateRangeManagerFidium
                fidiumPlans={fidiumPlans}
                dateRanges={row.date_ranges}
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
