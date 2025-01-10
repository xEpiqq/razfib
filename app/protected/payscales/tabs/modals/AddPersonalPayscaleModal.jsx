"use client";

import { useState } from "react";
import { Dialog, DialogTitle, DialogBody, DialogActions } from "@/components/dialog";
import { Field, Label } from "@/components/fieldset";
import { Input } from "@/components/input";
import { Button } from "@/components/button";

export default function AddPersonalPayscaleModal({ plans, supabase, onClose }) {
  const [form, setForm] = useState({
    name: "",
    upfront_percentage: "",
    backend_percentage: "",
    commissions: {},
    upgradeCommissions: {},
  });

  function updateCommission(planId, value, isUpgrade = false) {
    if (isUpgrade) {
      setForm((prev) => ({
        ...prev,
        upgradeCommissions: { ...prev.upgradeCommissions, [planId]: value },
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        commissions: { ...prev.commissions, [planId]: value },
      }));
    }
  }

  async function addPayscale() {
    if (!form.name.trim()) return;
    const up = parseFloat(form.upfront_percentage) || 0;
    const bp = parseFloat(form.backend_percentage) || 0;

    // 1) Insert payscale
    const { data: inserted } = await supabase
      .from("personal_payscales")
      .insert([{ name: form.name.trim(), upfront_percentage: up, backend_percentage: bp }])
      .select("*")
      .single();
    if (!inserted) return;

    // 2) Insert commissions
    const commissionsArray = plans.map((p) => ({
      personal_payscale_id: inserted.id,
      plan_id: p.id,
      rep_commission_type: "fixed_amount",
      rep_commission_value: parseFloat(form.commissions[p.id] || "0"),
      rep_upgrade_commission_type: "fixed_amount",
      rep_upgrade_commission_value: parseFloat(form.upgradeCommissions[p.id] || "0"),
    }));
    await supabase.from("personal_payscale_plan_commissions").insert(commissionsArray);

    onClose();
  }

  return (
    <Dialog open onClose={onClose} size="xl">
      <DialogTitle>Add Personal Payscale</DialogTitle>
      <DialogBody>
        <Field className="mb-4">
          <Label>Payscale Name</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>

        <div className="flex space-x-4 mb-4">
          <Field className="w-1/2">
            <Label>Upfront (%)</Label>
            <Input
              type="number"
              value={form.upfront_percentage}
              onChange={(e) => setForm({ ...form, upfront_percentage: e.target.value })}
            />
          </Field>
          <Field className="w-1/2">
            <Label>Backend (%)</Label>
            <Input
              type="number"
              value={form.backend_percentage}
              onChange={(e) => setForm({ ...form, backend_percentage: e.target.value })}
            />
          </Field>
        </div>

        <h3 className="font-semibold mb-2">Commissions (per plan)</h3>
        {plans.map((p) => (
          <div key={p.id} className="border p-2 mb-2 rounded">
            <div className="font-medium mb-1">{p.name}</div>
            <Field className="flex items-center mb-2">
              <Label className="w-1/3">Base ($)</Label>
              <Input
                type="number"
                value={form.commissions[p.id] || ""}
                onChange={(e) => updateCommission(p.id, e.target.value, false)}
              />
            </Field>
            <Field className="flex items-center">
              <Label className="w-1/3">Upgrade ($)</Label>
              <Input
                type="number"
                value={form.upgradeCommissions[p.id] || ""}
                onChange={(e) => updateCommission(p.id, e.target.value, true)}
              />
            </Field>
          </div>
        ))}
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={addPayscale}>Add</Button>
      </DialogActions>
    </Dialog>
  );
}
