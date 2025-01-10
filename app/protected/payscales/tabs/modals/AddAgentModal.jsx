"use client";

import { useState } from "react";
import { Dialog, DialogTitle, DialogBody, DialogActions } from "@/components/dialog";
import { Field, Label } from "@/components/fieldset";
import { Input } from "@/components/input";
import { Select } from "@/components/select";
import { Checkbox, CheckboxField } from "@/components/checkbox";
import { Button } from "@/components/button";

export default function AddAgentModal({
  supabase,
  personalPayscales,
  managerPayscales,
  fidiumPersonalPayscales,
  fidiumManagerPayscales,
  onClose,
}) {
  const [form, setForm] = useState({
    name: "",
    identifier: "",
    fidium_identifier: "",
    is_manager: false,
    personal_payscale_id: "",
    manager_payscale_id: "",
    fidium_personal_payscale_id: "",
    fidium_manager_payscale_id: "",
  });

  async function addAgent() {
    if (!form.name.trim() || !form.identifier.trim()) return;
    await supabase.from("agents").insert([
      {
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
      },
    ]);
    onClose();
  }

  return (
    <Dialog open onClose={onClose} size="xl">
      <DialogTitle>Add Agent</DialogTitle>
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
            onChange={(e) => setForm({ ...form, fidium_identifier: e.target.value })}
          />
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
            onChange={(e) => setForm({ ...form, personal_payscale_id: e.target.value })}
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
              onChange={(e) => setForm({ ...form, manager_payscale_id: e.target.value })}
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
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={addAgent}>Add</Button>
      </DialogActions>
    </Dialog>
  );
}
