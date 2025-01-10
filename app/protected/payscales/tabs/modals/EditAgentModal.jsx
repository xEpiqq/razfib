"use client";

import { useState } from "react";
import { Dialog, DialogTitle, DialogBody, DialogActions } from "@/components/dialog";
import { Field, Label } from "@/components/fieldset";
import { Input } from "@/components/input";
import { Select } from "@/components/select";
import { Checkbox, CheckboxField } from "@/components/checkbox";
import { Button } from "@/components/button";
import { BadgeButton } from "@/components/badge";

export default function EditAgentModal({
  agent,
  allAgents,
  agentManagers,
  personalPayscales,
  managerPayscales,
  fidiumPersonalPayscales,
  fidiumManagerPayscales,
  fidiumSalesmen,
  supabase,
  onClose,
}) {
  const assignedIds = agentManagers
    .filter((am) => am.manager_id === agent.id)
    .map((am) => am.agent_id);

  const [form, setForm] = useState({
    id: agent.id,
    name: agent.name,
    identifier: agent.identifier,
    fidium_identifier: agent.fidium_identifier || "",
    is_manager: agent.is_manager,
    personal_payscale_id: agent.personal_payscale_id || "",
    manager_payscale_id: agent.manager_payscale_id || "",
    fidium_personal_payscale_id: agent.fidium_personal_payscale_id || "",
    fidium_manager_payscale_id: agent.fidium_manager_payscale_id || "",
    assignedAgents: assignedIds,
  });

  const [searchVal, setSearchVal] = useState("");
  const [fidiumSearch, setFidiumSearch] = useState("");

  // Agents that can be assigned to this manager
  const assignable = allAgents.filter(
    (a) => a.id !== agent.id && !form.assignedAgents.includes(a.id)
  );
  const filteredAssignable = searchVal
    ? assignable.filter((a) =>
        (a.name || a.identifier || "")
          .toLowerCase()
          .includes(searchVal.toLowerCase())
      )
    : assignable;

  async function updateAgent() {
    await supabase
      .from("agents")
      .update({
        name: form.name.trim(),
        identifier: form.identifier.trim(),
        fidium_identifier: form.fidium_identifier.trim() || null,
        is_manager: form.is_manager,
        personal_payscale_id: form.personal_payscale_id || null,
        manager_payscale_id: form.is_manager ? form.manager_payscale_id || null : null,
        fidium_personal_payscale_id: form.fidium_personal_payscale_id || null,
        fidium_manager_payscale_id: form.is_manager
          ? form.fidium_manager_payscale_id || null
          : null,
      })
      .eq("id", form.id);

    // Reassign agent_managers
    await supabase.from("agent_managers").delete().eq("manager_id", form.id);
    if (form.is_manager && form.assignedAgents.length > 0) {
      const rows = form.assignedAgents.map((aid) => ({
        agent_id: aid,
        manager_id: form.id,
      }));
      await supabase.from("agent_managers").insert(rows);
    }
    onClose();
  }

  return (
    <Dialog open onClose={onClose} size="xl">
      <DialogTitle>Edit Agent</DialogTitle>
      <DialogBody>
        <Field className="mb-4">
          <Label>Name</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>

        <Field className="mb-4">
          <Label>Identifier</Label>
          <Input
            value={form.identifier}
            onChange={(e) => setForm({ ...form, identifier: e.target.value })}
          />
        </Field>

        <Field className="mb-4">
          <Label>Fidium Identifier</Label>
          <Input
            value={form.fidium_identifier}
            onChange={(e) => {
              setForm({ ...form, fidium_identifier: e.target.value });
              setFidiumSearch(e.target.value);
            }}
          />
          {/* Fidium Salesmen suggestions */}
          {fidiumSearch && (
            <div className="mt-2 border p-2 rounded max-h-48 overflow-auto bg-white">
              {fidiumSalesmen
                .filter((fs) =>
                  fs.rep_name.toLowerCase().includes(fidiumSearch.toLowerCase())
                )
                .map((fs) => (
                  <div
                    key={fs.id}
                    className="cursor-pointer hover:bg-gray-100 p-1"
                    onClick={() => {
                      setForm({ ...form, fidium_identifier: fs.rep_name });
                      setFidiumSearch("");
                    }}
                  >
                    {fs.rep_name}
                  </div>
                ))}
            </div>
          )}
        </Field>

        <CheckboxField className="mb-4">
          <Checkbox
            checked={form.is_manager}
            onChange={(val) => setForm({ ...form, is_manager: val })}
          />
          <Label>Is Manager?</Label>
        </CheckboxField>

        <Field className="mb-4">
          <Label>Personal Payscale</Label>
          <Select
            value={form.personal_payscale_id}
            onChange={(e) =>
              setForm({ ...form, personal_payscale_id: e.target.value })
            }
          >
            <option value="">(None)</option>
            {personalPayscales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        {form.is_manager && (
          <Field className="mb-4">
            <Label>Manager Payscale</Label>
            <Select
              value={form.manager_payscale_id}
              onChange={(e) =>
                setForm({ ...form, manager_payscale_id: e.target.value })
              }
            >
              <option value="">(None)</option>
              {managerPayscales.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field className="mb-4">
          <Label>Fidium Personal Payscale</Label>
          <Select
            value={form.fidium_personal_payscale_id}
            onChange={(e) =>
              setForm({ ...form, fidium_personal_payscale_id: e.target.value })
            }
          >
            <option value="">(None)</option>
            {fidiumPersonalPayscales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        {form.is_manager && (
          <Field className="mb-4">
            <Label>Fidium Manager Payscale</Label>
            <Select
              value={form.fidium_manager_payscale_id}
              onChange={(e) =>
                setForm({ ...form, fidium_manager_payscale_id: e.target.value })
              }
            >
              <option value="">(None)</option>
              {fidiumManagerPayscales.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {/* If manager, show assigned agents */}
        {form.is_manager && (
          <Field className="mb-4">
            <Label>Assigned Agents</Label>
            <Input
              placeholder="Search other agents..."
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
            />
            <div className="my-2 flex flex-wrap gap-2">
              {form.assignedAgents.map((aid) => {
                const A = allAgents.find((x) => x.id === aid);
                if (!A) return null;
                return (
                  <BadgeButton
                    key={aid}
                    color="blue"
                    onClick={() =>
                      setForm({
                        ...form,
                        assignedAgents: form.assignedAgents.filter((x) => x !== aid),
                      })
                    }
                  >
                    {A.name || A.identifier} ×
                  </BadgeButton>
                );
              })}
            </div>
            <div className="border p-2 mt-2 max-h-48 overflow-auto rounded">
              {filteredAssignable.map((a) => (
                <div
                  key={a.id}
                  className="cursor-pointer hover:bg-gray-100 p-1"
                  onClick={() =>
                    setForm({
                      ...form,
                      assignedAgents: [...form.assignedAgents, a.id],
                    })
                  }
                >
                  {a.name || a.identifier}
                </div>
              ))}
            </div>
          </Field>
        )}
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={updateAgent}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
