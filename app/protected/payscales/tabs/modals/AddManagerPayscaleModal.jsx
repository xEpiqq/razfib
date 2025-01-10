"use client";

import { useState } from "react";
import { Dialog, DialogTitle, DialogBody, DialogActions } from "@/components/dialog";
import { Field, Label } from "@/components/fieldset";
import { Input } from "@/components/input";
import { Button } from "@/components/button";
import DateRangeManager from "./DateRangeManager";

export default function AddManagerPayscaleModal({ plans, supabase, onClose }) {
  const [form, setForm] = useState({
    name: "",
    commissions: {},
    upgradeCommissions: {},
  });

  const [dateRanges, setDateRanges] = useState([]);

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

    // 1) Insert payscale
    const { data: inserted } = await supabase
      .from("manager_payscales")
      .insert([{ name: form.name.trim() }])
      .select("*")
      .single();
    if (!inserted) return;

    // 2) Insert base commissions
    const arr = plans.map((p) => ({
      manager_payscale_id: inserted.id,
      plan_id: p.id,
      manager_commission_type: "fixed_amount",
      manager_commission_value: parseFloat(form.commissions[p.id] || "0"),
      manager_upgrade_commission_type: "fixed_amount",
      manager_upgrade_commission_value: parseFloat(form.upgradeCommissions[p.id] || "0"),
    }));
    await supabase.from("manager_payscale_plan_commissions").insert(arr);

    // 3) Insert date range overrides
    for (const dr of dateRanges) {
      const { data: insertedRange } = await supabase
        .from("manager_payscale_date_ranges")
        .insert([
          {
            manager_payscale_id: inserted.id,
            start_date: dr.start_date,
            end_date: dr.end_date || null,
          },
        ])
        .select("*")
        .single();
      if (!insertedRange) continue;

      const planCommArr = [];
      for (const p of plans) {
        const valObj = dr.planValues[p.id] || { base: "0", upgrade: "0" };
        planCommArr.push({
          manager_payscale_date_range_id: insertedRange.id,
          plan_id: p.id,
          manager_commission_type: "fixed_amount",
          manager_commission_value: parseFloat(valObj.base || "0"),
          manager_upgrade_commission_type: "fixed_amount",
          manager_upgrade_commission_value: parseFloat(valObj.upgrade || "0"),
        });
      }
      await supabase
        .from("manager_payscale_date_range_plan_commissions")
        .insert(planCommArr);
    }

    onClose();
  }

  return (
    <Dialog open onClose={onClose} size="xl">
      <DialogTitle>Add Manager Payscale</DialogTitle>
      <DialogBody>
        <Field className="mb-4">
          <Label>Payscale Name</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>

        <h3 className="font-semibold mb-2">Base Commissions (per plan)</h3>
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

        <hr className="my-4" />

        <DateRangeManager
          plans={plans}
          dateRanges={dateRanges}
          setDateRanges={setDateRanges}
          label="Add Date Ranges for Additional Commission Rules"
        />
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
