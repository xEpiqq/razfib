'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/button';

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ monthly: 0, yearly: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!session) {
        // No session, redirect or show message
        setLoading(false);
        return;
      }
      const userId = session.user.id;

      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (!profileData) {
        setLoading(false);
        return;
      }
      setProfile(profileData);

      // Example: Fetch current month's and year's total personal commissions
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      // monthly personal totals from payroll_reports for this user
      const { data: monthlyData } = await supabase
        .from('payroll_reports')
        .select('personal_total')
        .eq('agent_id', userId)
        .gte('created_at', `${year}-${month}-01`)
        .lt('created_at', `${year}-${month + 1}-01`); // simplistic monthly range

      // yearly personal totals
      const { data: yearlyData } = await supabase
        .from('payroll_reports')
        .select('personal_total')
        .eq('agent_id', userId)
        .gte('created_at', `${year}-01-01`)
        .lt('created_at', `${year + 1}-01-01`);

      const monthlySum = (monthlyData || []).reduce((sum, r) => sum + (r.personal_total || 0), 0);
      const yearlySum = (yearlyData || []).reduce((sum, r) => sum + (r.personal_total || 0), 0);

      setStats({ monthly: monthlySum, yearly: yearlySum });
      setLoading(false);
    })();
  }, [supabase]);

  if (loading) return <div className="p-6 text-gray-900">Loading...</div>;
  if (!profile) return <div className="p-6 text-gray-900">Please log in to view your dashboard.</div>;

  return (
    <div className="p-6 space-y-6 font-sans text-gray-900">
      <h2 className="text-2xl font-bold">Welcome, {profile.name}!</h2>
      <div className="space-y-4">
        <div>This month's personal commission: ${stats.monthly.toFixed(2)}</div>
        <div>This year's personal commission: ${stats.yearly.toFixed(2)}</div>
      </div>
      <Button onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }}>Sign Out</Button>
    </div>
  );
}
