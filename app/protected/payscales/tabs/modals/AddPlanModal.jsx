"use client";

import { useState } from "react";
import { Dialog, DialogTitle, DialogBody, DialogActions } from "@/components/dialog";
import { Field, Label } from "@/components/fieldset";
import { Input } from "@/components/input";
import { Button } from "@/components/button";

export default function AddPlanModal({ supabase, onClose }) {
  const [planName, setPlanName] = useState("");

  async function addPlan() {
    if (!planName.trim()) return;
    await supabase.from("plans").insert([{ name: planName.trim(), commission_amount: 0 }]);
    onClose();
  }

  return (
    <Dialog open onClose={onClose} size="md">
      <DialogTitle>Add Plan</DialogTitle>
      <DialogBody>
        <Field className="mb-4">
          <Label>Plan Name</Label>
          <Input value={planName} onChange={(e) => setPlanName(e.target.value)} />
        </Field>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={addPlan}>Add</Button>
      </DialogActions>
    </Dialog>
  );
}
