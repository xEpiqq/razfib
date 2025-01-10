"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogTitle, DialogBody, DialogActions } from "@/components/dialog";
import { Field, Label } from "@/components/fieldset";
import { Select } from "@/components/select";
import { Input } from "@/components/input";
import { Button } from "@/components/button";

export default function FidiumManagerOverridesModal({
  payscale,
  agents,
  agentManagers,
  fidiumPlans,
  supabase,
  onClose,
}) {
  // Managers using this Fidium manager payscale
  const managersUsing = agents.filter(
    (a) => a.is_manager && a.fidium_manager_payscale_id === payscale.id
  );
  const [managerId, setManagerId] = useState(managersUsing[0]?.id || "");
  const [dbData, setDbData] = useState([]);
  const [localData, setLocalData] = useState([]);

  useEffect(() => {
    if (managerId) loadOverrides(managerId);
  }, [managerId]);

  async function loadOverrides(mId) {
    const { data } = await supabase
      .from("fidium_manager_agent_commissions")
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

  function getLocalVal(mId, agId, planId) {
    const found = localData.find(
      (x) =>
        x.manager_id === mId && x.agent_id === agId && x.fidium_plan_id === planId
    );
    return found ? found.manager_commission_value : "";
  }

  function setLocalVal(mId, agId, planId, newVal) {
    setLocalData((prev) => {
      const idx = prev.findIndex(
        (x) =>
          x.manager_id === mId && x.agent_id === agId && x.fidium_plan_id === planId
      );
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          manager_commission_value: newVal,
        };
        return updated;
      } else {
        return [
          ...prev,
          {
            manager_id: mId,
            agent_id: agId,
            fidium_plan_id: planId,
            manager_commission_type: "fixed_amount",
            manager_commission_value: newVal,
          },
        ];
      }
    });
  }

  function removeLocalOverride(mId, agId, planId) {
    setLocalData((prev) =>
      prev.filter(
        (x) =>
          !(
            x.manager_id === mId &&
            x.agent_id === agId &&
            x.fidium_plan_id === planId
          )
      )
    );
  }

  async function save() {
    // remove old
    await supabase
      .from("fidium_manager_agent_commissions")
      .delete()
      .eq("manager_id", managerId);

    // insert new if not zero
    const toInsert = localData
      .filter((x) => parseFloat(x.manager_commission_value || "0") !== 0)
      .map((x) => ({
        manager_id: x.manager_id,
        agent_id: x.agent_id,
        fidium_plan_id: x.fidium_plan_id,
        manager_commission_type: x.manager_commission_type || "fixed_amount",
        manager_commission_value: parseFloat(x.manager_commission_value || "0"),
      }));
    if (toInsert.length > 0) {
      await supabase.from("fidium_manager_agent_commissions").insert(toInsert);
    }
    onClose();
  }

  return (
    <Dialog open onClose={onClose} size="xl">
      <DialogTitle>Fidium Manager Overrides ({payscale.name})</DialogTitle>
      <DialogBody>
        {managersUsing.length === 0 ? (
          <div>No managers are using this Fidium manager payscale.</div>
        ) : (
          <>
            <Field className="mb-4">
              <Label>Select Manager</Label>
              <Select
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
              >
                {managersUsing.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.identifier}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="border rounded p-4 max-h-96 overflow-auto">
              {getAssignedAgents(managerId).map((agt) => (
                <div key={agt.id} className="mb-4">
                  <h3 className="font-semibold mb-2">{agt.name || agt.identifier}</h3>
                  {fidiumPlans.map((pl) => {
                    const val = getLocalVal(managerId, agt.id, pl.id);
                    return (
                      <Field key={pl.id} className="mb-2 flex items-center">
                        <Label className="w-1/3">{pl.name}</Label>
                        <div className="w-2/3 flex items-center space-x-2">
                          <span>$</span>
                          <Input
                            type="number"
                            value={val}
                            onChange={(e) =>
                              setLocalVal(managerId, agt.id, pl.id, e.target.value)
                            }
                          />
                          {val && parseFloat(val) !== 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                removeLocalOverride(managerId, agt.id, pl.id)
                              }
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      </Field>
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
