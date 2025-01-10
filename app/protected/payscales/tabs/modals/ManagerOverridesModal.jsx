"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogTitle, DialogBody, DialogActions } from "@/components/dialog";
import { Field, Label } from "@/components/fieldset";
import { Select } from "@/components/select";
import { Input } from "@/components/input";
import { Button } from "@/components/button";

export default function ManagerOverridesModal({
  payscale,
  agents,
  agentManagers,
  plans,
  supabase,
  onClose,
}) {
  // Find all managers using this payscale
  const managersUsingThis = agents.filter(
    (a) => a.is_manager && a.manager_payscale_id === payscale.id
  );
  const [managerId, setManagerId] = useState(
    managersUsingThis[0]?.id || ""
  );

  const [dbData, setDbData] = useState([]);
  const [localData, setLocalData] = useState([]);

  useEffect(() => {
    if (managerId) loadOverrides(managerId);
  }, [managerId]);

  async function loadOverrides(mId) {
    const { data } = await supabase
      .from("manager_agent_commissions")
      .select("*")
      .eq("manager_id", mId);
    setDbData(data || []);
    setLocalData(data || []);
  }

  function getAssignedAgents(mId) {
    const assignedIds = agentManagers
      .filter((am) => am.manager_id === mId)
      .map((am) => am.agent_id);
    return agents.filter((a) => assignedIds.includes(a.id));
  }

  function getLocalVal(mId, agId, planId, isUpgrade = false) {
    const found = localData.find(
      (x) => x.manager_id === mId && x.agent_id === agId && x.plan_id === planId
    );
    if (!found) return "";
    return isUpgrade
      ? found.manager_upgrade_commission_value
      : found.manager_commission_value;
  }

  function setLocalVal(mId, agId, planId, newVal, isUpgrade = false) {
    setLocalData((prev) => {
      const idx = prev.findIndex(
        (x) => x.manager_id === mId && x.agent_id === agId && x.plan_id === planId
      );
      if (idx >= 0) {
        const updated = [...prev];
        if (isUpgrade) {
          updated[idx] = {
            ...updated[idx],
            manager_upgrade_commission_value: newVal,
          };
        } else {
          updated[idx] = {
            ...updated[idx],
            manager_commission_value: newVal,
          };
        }
        return updated;
      } else {
        return [
          ...prev,
          {
            manager_id: mId,
            agent_id: agId,
            plan_id: planId,
            manager_commission_type: "fixed_amount",
            manager_commission_value: isUpgrade ? 0 : newVal,
            manager_upgrade_commission_type: "fixed_amount",
            manager_upgrade_commission_value: isUpgrade ? newVal : 0,
          },
        ];
      }
    });
  }

  function removeLocalOverride(mId, agId, planId) {
    setLocalData((prev) =>
      prev.filter(
        (x) => !(x.manager_id === mId && x.agent_id === agId && x.plan_id === planId)
      )
    );
  }

  async function save() {
    // Delete old
    await supabase.from("manager_agent_commissions").delete().eq("manager_id", managerId);

    // Insert non-zero overrides
    const toInsert = localData
      .filter(
        (x) =>
          parseFloat(x.manager_commission_value || "0") !== 0 ||
          parseFloat(x.manager_upgrade_commission_value || "0") !== 0
      )
      .map((x) => ({
        manager_id: x.manager_id,
        agent_id: x.agent_id,
        plan_id: x.plan_id,
        manager_commission_type: x.manager_commission_type,
        manager_commission_value: parseFloat(x.manager_commission_value || "0"),
        manager_upgrade_commission_type: x.manager_upgrade_commission_type,
        manager_upgrade_commission_value: parseFloat(
          x.manager_upgrade_commission_value || "0"
        ),
      }));
    if (toInsert.length > 0) {
      await supabase.from("manager_agent_commissions").insert(toInsert);
    }
    onClose();
  }

  return (
    <Dialog open onClose={onClose} size="xl">
      <DialogTitle>Manager Overrides ({payscale.name})</DialogTitle>
      <DialogBody>
        {managersUsingThis.length === 0 ? (
          <div>No managers are currently using this payscale.</div>
        ) : (
          <>
            <Field className="mb-4">
              <Label>Select Manager</Label>
              <Select
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
              >
                {managersUsingThis.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.identifier}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="border rounded p-4 max-h-96 overflow-auto">
              {getAssignedAgents(managerId).map((agt) => (
                <div key={agt.id} className="mb-4">
                  <h3 className="font-semibold mb-2">
                    {agt.name || agt.identifier}
                  </h3>
                  {plans.map((pl) => {
                    const baseVal = getLocalVal(managerId, agt.id, pl.id, false);
                    const upgVal = getLocalVal(managerId, agt.id, pl.id, true);
                    return (
                      <div key={pl.id} className="border p-2 mb-2 rounded">
                        <div className="font-medium mb-1">{pl.name}</div>
                        <Field className="flex items-center mb-2">
                          <Label className="w-1/3">Base ($)</Label>
                          <Input
                            type="number"
                            value={baseVal}
                            onChange={(e) =>
                              setLocalVal(managerId, agt.id, pl.id, e.target.value, false)
                            }
                          />
                        </Field>
                        <Field className="flex items-center">
                          <Label className="w-1/3">Upgrade ($)</Label>
                          <Input
                            type="number"
                            value={upgVal}
                            onChange={(e) =>
                              setLocalVal(managerId, agt.id, pl.id, e.target.value, true)
                            }
                          />
                        </Field>
                        {(parseFloat(baseVal) || parseFloat(upgVal)) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeLocalOverride(managerId, agt.id, pl.id)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Close
        </Button>
        <Button onClick={save}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
