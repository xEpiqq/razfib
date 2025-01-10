"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogTitle, DialogBody, DialogActions } from "@/components/dialog";
import { Field, Label } from "@/components/fieldset";
import { Input } from "@/components/input";
import { Button } from "@/components/button";
import DateRangeManagerFidium from "./DateRangeManagerFidium";

export default function EditFidiumManagerModal({
  payscale,
  fidiumPlans,
  supabase,
  onClose,
}) {
  const commObj = {};
  (payscale.manager_payscale_plan_commissions || []).forEach((c) => {
    commObj[c.fidium_plan_id] = c.manager_commission_value;
  });

  const [form, setForm] = useState({
    name: payscale.name,
    commissions: { ...commObj },
  });

  const [dateRanges, setDateRanges] = useState([]);

  async function loadExistingDateRanges() {
    const { data } = await supabase
      .from("fidium_manager_payscale_date_ranges")
      .select("*, fidium_manager_payscale_date_range_plan_commissions(*)")
      .eq("fidium_manager_payscale_id", payscale.id);
    if (!data) return;
    const converted = data.map((dr) => {
      const planValues = {};
      for (const pc of dr.fidium_manager_payscale_date_range_plan_commissions) {
        planValues[pc.fidium_plan_id] = {
          base: pc.manager_commission_value.toString(),
        };
      }
      return {
        id: dr.id,
        start_date: dr.start_date,
        end_date: dr.end_date,
        planValues,
      };
    });
    setDateRanges(converted);
  }

  useEffect(() => {
    loadExistingDateRanges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateCommission(planId, value) {
    setForm((prev) => ({
      ...prev,
      commissions: { ...prev.commissions, [planId]: value },
    }));
  }

  async function saveChanges() {
    // 1) update name
    await supabase
      .from("fidium_manager_payscales")
      .update({ name: form.name.trim() })
      .eq("id", payscale.id);

    // 2) remove old base commissions
    await supabase
      .from("fidium_manager_payscale_plan_commissions")
      .delete()
      .eq("fidium_manager_payscale_id", payscale.id);

    // 3) insert new base commissions
    const arr = fidiumPlans.map((fp) => ({
      fidium_manager_payscale_id: payscale.id,
      fidium_plan_id: fp.id,
      manager_commission_type: "fixed_amount",
      manager_commission_value: parseFloat(form.commissions[fp.id] || "0"),
    }));
    await supabase.from("fidium_manager_payscale_plan_commissions").insert(arr);

    // 4) remove old date ranges
    await supabase
      .from("fidium_manager_payscale_date_ranges")
      .delete()
      .eq("fidium_manager_payscale_id", payscale.id);

    // 5) insert new date ranges
    for (const dr of dateRanges) {
      const { data: insertedRange } = await supabase
        .from("fidium_manager_payscale_date_ranges")
        .insert([
          {
            fidium_manager_payscale_id: payscale.id,
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
          fidium_manager_payscale_date_range_id: insertedRange.id,
          fidium_plan_id: fp.id,
          manager_commission_type: "fixed_amount",
          manager_commission_value: parseFloat(baseVal),
        });
      }
      await supabase
        .from("fidium_manager_payscale_date_range_plan_commissions")
        .insert(planCommArr);
    }

    onClose();
  }

  return (
    <Dialog open onClose={onClose} size="xl">
      <DialogTitle>Edit Fidium Manager Payscale</DialogTitle>
      <DialogBody>
        <Field className="mb-4">
          <Label>Payscale Name</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <h3 className="font-semibold mb-2">Base Commissions (Fidium plans)</h3>
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
          label="Date Ranges"
        />
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
