"use client";

import { useState } from "react";
import { Dialog, DialogTitle, DialogBody, DialogActions } from "@/components/dialog";
import { Field, Label } from "@/components/fieldset";
import { Input } from "@/components/input";
import { Button } from "@/components/button";
import DateRangeManagerFidium from "./DateRangeManagerFidium";

export default function AddFidiumPersonalModal({ fidiumPlans, supabase, onClose }) {
  const [form, setForm] = useState({
    name: "",
    upfront_percentage: "",
    backend_percentage: "",
    commissions: {},
  });

  const [dateRanges, setDateRanges] = useState([]);

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

    // Insert base commissions
    const arr = fidiumPlans.map((fp) => ({
      fidium_personal_payscale_id: inserted.id,
      fidium_plan_id: fp.id,
      rep_commission_type: "fixed_amount",
      rep_commission_value: parseFloat(form.commissions[fp.id] || "0"),
    }));
    await supabase.from("fidium_personal_payscale_plan_commissions").insert(arr);

    // Insert date ranges
    for (const dr of dateRanges) {
      const { data: insertedRange } = await supabase
        .from("fidium_personal_payscale_date_ranges")
        .insert([
          {
            fidium_personal_payscale_id: inserted.id,
            start_date: dr.start_date,
            end_date: dr.end_date || null,
          },
        ])
        .select("*")
        .single();
      if (!insertedRange) continue;

      const planCommArr = [];
      for (const fp of fidiumPlans) {
        const baseVal = dr.planValues[fp.id]?.base || "0";
        planCommArr.push({
          fidium_personal_payscale_date_range_id: insertedRange.id,
          fidium_plan_id: fp.id,
          rep_commission_type: "fixed_amount",
          rep_commission_value: parseFloat(baseVal),
        });
      }
      await supabase
        .from("fidium_personal_payscale_date_range_plan_commissions")
        .insert(planCommArr);
    }

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

        <h3 className="font-semibold mb-2">Base Commissions (per Fidium plan)</h3>
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

        <hr className="my-4" />

        <DateRangeManagerFidium
          fidiumPlans={fidiumPlans}
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
