"use client";

import { useState } from "react";
import { Dialog, DialogTitle, DialogBody, DialogActions } from "@/components/dialog";
import { Field, Label } from "@/components/fieldset";
import { Input } from "@/components/input";
import { Button } from "@/components/button";

export default function EditManagerPayscaleModal({ payscale, plans, supabase, onClose }) {
  const commObj = {};
  const upgObj = {};
  (payscale.manager_payscale_plan_commissions || []).forEach((c) => {
    commObj[c.plan_id] = c.manager_commission_value;
    upgObj[c.plan_id] = c.manager_upgrade_commission_value;
  });

  const [form, setForm] = useState({
    name: payscale.name,
    commissions: { ...commObj },
    upgradeCommissions: { ...upgObj },
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

  async function saveChanges() {
    // 1) Update name
    await supabase.from("manager_payscales").update({ name: form.name.trim() }).eq("id", payscale.id);

    // 2) Remove old commissions
    await supabase
      .from("manager_payscale_plan_commissions")
      .delete()
      .eq("manager_payscale_id", payscale.id);

    // 3) Insert new
    const arr = plans.map((p) => ({
      manager_payscale_id: payscale.id,
      plan_id: p.id,
      manager_commission_type: "fixed_amount",
      manager_commission_value: parseFloat(form.commissions[p.id] || "0"),
      manager_upgrade_commission_type: "fixed_amount",
      manager_upgrade_commission_value: parseFloat(
        form.upgradeCommissions[p.id] || "0"
      ),
    }));
    await supabase.from("manager_payscale_plan_commissions").insert(arr);

    onClose();
  }

  return (
    <Dialog open onClose={onClose} size="xl">
      <DialogTitle>Edit Manager Payscale</DialogTitle>
      <DialogBody>
        <Field className="mb-4">
          <Label>Payscale Name</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>

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
        <Button onClick={saveChanges}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
