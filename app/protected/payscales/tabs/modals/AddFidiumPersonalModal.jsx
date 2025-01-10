"use client";

import { useState } from "react";
import { Dialog, DialogTitle, DialogBody, DialogActions } from "@/components/dialog";
import { Field, Label } from "@/components/fieldset";
import { Input } from "@/components/input";
import { Button } from "@/components/button";

export default function AddFidiumPersonalModal({ fidiumPlans, supabase, onClose }) {
  const [form, setForm] = useState({
    name: "",
    upfront_percentage: "",
    backend_percentage: "",
    commissions: {},
  });

  function updateCommission(planId, value) {
    setForm((prev) => ({
      ...prev,
      commissions: { ...prev.commissions, [planId]: value },
    }));
  }

  async function addPayscale() {
    if (!form.name.trim()) return;
    const up = parseFloat(form.upfront_percentage) || 0;
    const bp = parseFloat(form.backend_percentage) || 0;

    // Insert payscale
    const { data: inserted } = await supabase
      .from("fidium_personal_payscales")
      .insert([{ name: form.name.trim(), upfront_percentage: up, backend_percentage: bp }])
      .select("*")
      .single();
    if (!inserted) return;

    // Insert commissions
    const arr = fidiumPlans.map((fp) => ({
      fidium_personal_payscale_id: inserted.id,
      fidium_plan_id: fp.id,
      rep_commission_type: "fixed_amount",
      rep_commission_value: parseFloat(form.commissions[fp.id] || "0"),
    }));
    await supabase.from("fidium_personal_payscale_plan_commissions").insert(arr);

    onClose();
  }

  return (
    <Dialog open onClose={onClose} size="xl">
      <DialogTitle>Add Fidium Personal Payscale</DialogTitle>
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
              onChange={(e) =>
                setForm({ ...form, upfront_percentage: e.target.value })
              }
            />
          </Field>
          <Field className="w-1/2">
            <Label>Backend (%)</Label>
            <Input
              type="number"
              value={form.backend_percentage}
              onChange={(e) =>
                setForm({ ...form, backend_percentage: e.target.value })
              }
            />
          </Field>
        </div>

        <h3 className="font-semibold mb-2">Commissions (per Fidium plan)</h3>
        {fidiumPlans.map((fp) => (
          <Field key={fp.id} className="mb-2 flex items-center">
            <Label className="w-1/2">{fp.name}</Label>
            <div className="w-1/2 flex items-center">
              <span className="mr-2">$</span>
              <Input
                type="number"
                value={form.commissions[fp.id] || ""}
                onChange={(e) => updateCommission(fp.id, e.target.value)}
              />
            </div>
          </Field>
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
