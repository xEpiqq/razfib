'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Avatar } from '@/components/avatar';
import Image from 'next/image';
import { BanknotesIcon,
  ReceiptRefundIcon
 } from '@heroicons/react/20/solid';
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/dropdown';
import {
  Navbar,
  NavbarItem,
  NavbarSection,
  NavbarSpacer,
} from '@/components/navbar';
import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from '@/components/sidebar';
import { SidebarLayout } from '@/components/sidebar-layout';
import {
  ArrowRightStartOnRectangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Cog8ToothIcon,
  LightBulbIcon,
  PlusIcon,
  ShieldCheckIcon,
  UserIcon,
} from '@heroicons/react/16/solid';
import {
  Cog6ToothIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  QuestionMarkCircleIcon,
  SparklesIcon,
  UserIcon as UserIcon20,
  CurrencyDollarIcon,
  ChartBarIcon,
} from '@heroicons/react/20/solid';
import { createClient } from '@/utils/supabase/client';
import { useRouter, usePathname } from 'next/navigation';

/** Overdue if install_date is > 90 days old */
function isOverdue(install_date) {
  if (!install_date) return false;
  const now = new Date();
  const diffDays = (now - new Date(install_date)) / (1000 * 60 * 60 * 24);
  return diffDays > 90;
}

const Example = ({ children }) => {
  const [user, setUser] = useState(null);
  const router = useRouter();
  const pathname = usePathname();
  const [backendOverdueCount, setBackendOverdueCount] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const fetchUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) console.error('Error fetching user:', error);
      else setUser(data.user);
    };
    fetchUser();
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    );
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    // Now we only count overdue items that are actually referenced in payroll_reports.details
    const fetchOverdueCount = async () => {
      try {
        // 1) Fetch all payroll reports
        const { data: reportsData, error: prError } = await supabase
          .from('payroll_reports')
          .select('details');
        if (prError) throw prError;
        if (!reportsData) return;

        // 2) Gather all referenced white glove IDs + fidium IDs
        const whiteIds = [];
        const fidiumIds = [];

        for (const report of reportsData) {
          const detailArray = report.details || [];
          if (!Array.isArray(detailArray)) continue;
          for (const d of detailArray) {
            if (d.white_glove_entry_id) whiteIds.push(d.white_glove_entry_id);
            if (d.fidium_white_glove_id) fidiumIds.push(d.fidium_white_glove_id);
          }
        }

        // 3) Load those actual entries from DB
        let count = 0;

        if (whiteIds.length > 0) {
          const { data: wgeData, error: wgeError } = await supabase
            .from('white_glove_entries')
            .select('install_date, backend_paid, id')
            .in('id', whiteIds);
          if (wgeError) throw wgeError;
          for (const w of wgeData || []) {
            if (!w.backend_paid && isOverdue(w.install_date)) count++;
          }
        }

        if (fidiumIds.length > 0) {
          const { data: fwgData, error: fwgError } = await supabase
            .from('fidium_white_glove_entries')
            .select('install_date, backend_paid, id')
            .in('id', fidiumIds);
          if (fwgError) throw fwgError;
          for (const f of fwgData || []) {
            if (!f.backend_paid && isOverdue(f.install_date)) count++;
          }
        }

        setBackendOverdueCount(count);
      } catch (err) {
        console.error('Error fetching overdue count:', err);
      }
    };
    fetchOverdueCount();
  }, [supabase]);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Error signing out:', error);
    else router.push('/sign-in');
  };

  const nonClickableClass = 'text-gray-600 dark:text-gray-400 cursor-default rounded-md';
  const linkClass =
    'flex items-center cursor-pointer text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-md';
  const isActive = (url) => (pathname === url ? 'bg-gray-200 dark:bg-gray-800' : '');

  return (
    <SidebarLayout
      navbar={
        <Navbar>
          <NavbarSpacer />
          <NavbarSection>
            <NavbarItem className={`${nonClickableClass} flex items-center`}>
              <MagnifyingGlassIcon className="h-5 w-5" />
            </NavbarItem>
            <NavbarItem className={`${nonClickableClass} flex items-center`}>
              <HomeIcon className="h-5 w-5" />
            </NavbarItem>
            <Dropdown>
              <DropdownButton as={NavbarItem}>
                <Avatar src={user?.user_metadata?.avatar_url || '/snowma.jpeg'} square />
              </DropdownButton>
              <DropdownMenu className="min-w-64" anchor="bottom end">
                <DropdownItem className="flex items-center cursor-default">
                  <UserIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>My profile</DropdownLabel>
                </DropdownItem>
                <DropdownItem className="flex items-center cursor-default">
                  <Cog8ToothIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>Settings</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem className="flex items-center cursor-default">
                  <ShieldCheckIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>Privacy policy</DropdownLabel>
                </DropdownItem>
                <DropdownItem className="flex items-center cursor-default">
                  <LightBulbIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>Share feedback</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem onClick={handleSignOut} className="flex items-center cursor-pointer">
                  <ArrowRightStartOnRectangleIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>Sign out</DropdownLabel>
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </NavbarSection>
        </Navbar>
      }
      sidebar={
        <Sidebar>
          <SidebarHeader>
            <Dropdown>
              <DropdownButton as={SidebarItem} className="lg:mb-2.5 flex items-center">
                <Avatar src="/snowma.jpeg" />
                <SidebarLabel className="ml-2">{user?.email || 'monkey@example.com'}</SidebarLabel>
                <ChevronDownIcon className="h-4 w-4 ml-auto" />
              </DropdownButton>
              <DropdownMenu className="min-w-80 lg:min-w-64" anchor="bottom start">
                <DropdownItem href="/teams/1/settings" className="flex items-center">
                  <Cog8ToothIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>Settings</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem href="/teams/1" className="flex items-center">
                  <Avatar slot="icon" src="/snowma.jpeg" />
                  <DropdownLabel className="ml-2">
                    {user?.email || 'monkey@example.com'}
                  </DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem href="/teams/create" className="flex items-center">
                  <PlusIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>New team&hellip;</DropdownLabel>
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </SidebarHeader>
          <SidebarBody>
            <SidebarSection>
              <SidebarItem
                className={`${linkClass} ${isActive('/protected/payroll')}`}
                onClick={() => router.push('/protected/payroll')}
              >
                <CurrencyDollarIcon className="h-5 w-5 mr-2" />
                <SidebarLabel>Calculate</SidebarLabel>
              </SidebarItem>
              <SidebarItem
                className={`${linkClass} ${isActive('/protected/payscales')}`}
                onClick={() => router.push('/protected/payscales')}
              >
                <ChartBarIcon className="h-5 w-5 mr-2" />
                <SidebarLabel>Payscales</SidebarLabel>
              </SidebarItem>
              <SidebarItem
                className={`${linkClass} ${isActive('/protected/frontend')}`}
                onClick={() => router.push('/protected/frontend')}
              >
                <BanknotesIcon className="h-5 w-5 mr-2" />
                <SidebarLabel>Frontend</SidebarLabel>
              </SidebarItem>
              <SidebarItem
                className={`${linkClass} ${isActive('/protected/backend')} relative`}
                onClick={() => router.push('/protected/backend')}
              >
                <BanknotesIcon className="h-5 w-5 mr-2" />
                <SidebarLabel>Backend</SidebarLabel>
                {backendOverdueCount > 0 && (
                  <span className="absolute right-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold text-white bg-red-600 rounded-full">
                    {backendOverdueCount}
                  </span>
                )}
              </SidebarItem>
              <SidebarItem
                className={`${linkClass} ${isActive('/protected/deductions')}`}
                onClick={() => router.push('/protected/deductions')}
              >
                <ReceiptRefundIcon className="h-5 w-5 mr-2" />
                <SidebarLabel>Deductions / Reimbursements</SidebarLabel>
              </SidebarItem>
            </SidebarSection>
            <SidebarSpacer />
            <SidebarSection>
              <SidebarItem className={`flex items-center ${nonClickableClass}`}>
                <QuestionMarkCircleIcon className="h-5 w-5 mr-2" />
                <SidebarLabel>Support</SidebarLabel>
              </SidebarItem>
              <SidebarItem className={`flex items-center ${nonClickableClass}`}>
                <SparklesIcon className="h-5 w-5 mr-2" />
                <SidebarLabel>Changelog</SidebarLabel>
              </SidebarItem>
            </SidebarSection>
          </SidebarBody>
          <SidebarFooter className="max-lg:hidden">
            <Dropdown>
              <DropdownButton as={SidebarItem} className="flex items-center">
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar
                    src={user?.user_metadata?.avatar_url || '/snowma.jpeg'}
                    className="size-10"
                    square
                    alt="Profile"
                  />
                  <span className="flex flex-col ml-2">
                    <span className="block truncate text-sm font-medium text-zinc-950 dark:text-white">
                      {user?.user_metadata?.full_name || 'User'}
                    </span>
                    <span className="block truncate text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      {user?.email || 'monkey@example.com'}
                    </span>
                  </span>
                </span>
                <ChevronUpIcon className="h-4 w-4 ml-auto" />
              </DropdownButton>
              <DropdownMenu className="min-w-64" anchor="top start">
                <DropdownItem className="flex items-center cursor-default">
                  <UserIcon20 className="h-5 w-5 mr-2" />
                  <DropdownLabel>My profile</DropdownLabel>
                </DropdownItem>
                <DropdownItem className="flex items-center cursor-default">
                  <Cog8ToothIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>Settings</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem className="flex items-center cursor-default">
                  <ShieldCheckIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>Privacy policy</DropdownLabel>
                </DropdownItem>
                <DropdownItem className="flex items-center cursor-default">
                  <LightBulbIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>Share feedback</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem onClick={handleSignOut} className="flex items-center cursor-pointer">
                  <ArrowRightStartOnRectangleIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>Sign out</DropdownLabel>
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </SidebarFooter>
        </Sidebar>
      }
    >
      {children}
    </SidebarLayout>
  );
};

export default Example;
