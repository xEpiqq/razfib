"use client";

import { useState } from "react";
import { Dialog, DialogTitle, DialogBody, DialogActions } from "@/components/dialog";
import { Field, Label } from "@/components/fieldset";
import { Input } from "@/components/input";
import { Button } from "@/components/button";

export default function EditFidiumPersonalModal({
  payscale,
  fidiumPlans,
  supabase,
  onClose,
}) {
  const commObj = {};
  (payscale.personal_payscale_plan_commissions || []).forEach((c) => {
    commObj[c.fidium_plan_id] = c.rep_commission_value;
  });

  const [form, setForm] = useState({
    name: payscale.name,
    upfront_percentage: payscale.upfront_percentage.toString(),
    backend_percentage: payscale.backend_percentage.toString(),
    commissions: { ...commObj },
  });

  function updateCommission(planId, value) {
    setForm((prev) => ({
      ...prev,
      commissions: { ...prev.commissions, [planId]: value },
    }));
  }

  async function saveChanges() {
    const up = parseFloat(form.upfront_percentage) || 0;
    const bp = parseFloat(form.backend_percentage) || 0;

    // 1) Update payscale
    await supabase
      .from("fidium_personal_payscales")
      .update({
        name: form.name.trim(),
        upfront_percentage: up,
        backend_percentage: bp,
      })
      .eq("id", payscale.id);

    // 2) Remove old
    await supabase
      .from("fidium_personal_payscale_plan_commissions")
      .delete()
      .eq("fidium_personal_payscale_id", payscale.id);

    // 3) Insert new
    const arr = fidiumPlans.map((fp) => ({
      fidium_personal_payscale_id: payscale.id,
      fidium_plan_id: fp.id,
      rep_commission_type: "fixed_amount",
      rep_commission_value: parseFloat(form.commissions[fp.id] || "0"),
    }));
    await supabase.from("fidium_personal_payscale_plan_commissions").insert(arr);

    onClose();
  }

  return (
    <Dialog open onClose={onClose} size="xl">
      <DialogTitle>Edit Fidium Personal Payscale</DialogTitle>
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

        <h3 className="font-semibold mb-2">Commissions (Fidium plans)</h3>
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
        <Button onClick={saveChanges}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
