"use client";

import Link from "next/link";
import {
  ShoppingCart, FileText, ShoppingBag, RotateCcw, Settings, Star, Download,
  Database, Edit3, Clock, Boxes, History,
} from "lucide-react";
import { BottomSheet } from "./BottomSheet";
import { TargetFramework, ShoppingRequest } from "../types";
import { TARGET_FRAMEWORKS } from "../lib/constants";

interface MenuSheetProps {
  isOpen: boolean;
  onClose: () => void;
  listType: "supermarket" | "large";
  canPurchase: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isLogistics: boolean;
  pendingStoreAuthCount: number;
  pendingRequestsCount: number;
  requests?: ShoppingRequest[];
  onOpenCategories: () => void;
  onOpenStarManager: () => void;
  onOpenAdminRequests: () => void;
  onOpenCycleHistory: () => void;
  onExportProcurementList: (framework?: "all" | TargetFramework) => void;
  onExportOngoingList: (framework?: "all" | TargetFramework) => void;
  onExportSplitOngoingLists: () => void;
  onExportSplitProcurementLists: () => void;
}

function MenuItem({
  icon,
  label,
  badge,
  danger,
  onClick,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  danger?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const className = `w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all text-sm font-bold text-right cursor-pointer ${
    danger
      ? "bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/20 text-rose-500"
      : "bg-[var(--fill)] hover:bg-[var(--fill-strong)] border-[var(--border)] text-[var(--foreground)]"
  }`;
  const content = (
    <>
      {icon}
      <span className="flex-1">{label}</span>
      {!!badge && badge > 0 && (
        <span className="bg-rose-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">{badge}</span>
      )}
    </>
  );
  if (href) {
    return (
      <Link href={href} onClick={onClick} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={className + " border-none"}>
      {content}
    </button>
  );
}

function MenuSectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-bold text-[var(--muted)] px-1 pt-1">{children}</div>;
}

export function MenuSheet({
  isOpen,
  onClose,
  listType,
  canPurchase,
  isAdmin,
  isManager,
  isLogistics,
  pendingStoreAuthCount,
  pendingRequestsCount,
  requests = [],
  onOpenCategories,
  onOpenStarManager,
  onOpenAdminRequests,
  onOpenCycleHistory,
  onExportProcurementList,
  onExportOngoingList,
  onExportSplitOngoingLists,
  onExportSplitProcurementLists,
}: MenuSheetProps) {
  const wrap = (fn: () => void) => () => {
    onClose();
    fn();
  };

  const activeSupermarket = requests.filter(
    (r) => (r.status === "approved" || r.status === "pending" || r.status === "purchased") && r.listType !== "large"
  );
  const activeProcurement = requests.filter(
    (r) => (r.status === "approved" || r.status === "pending" || r.status === "purchased") && r.listType === "large"
  );

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="פעולות ותפריט" icon={<Settings className="w-4 h-4 text-[var(--accent-text)]" />}>
      <div className="space-y-4">
        <div className="space-y-2">
          <MenuSectionLabel>קנייה אד-הוק</MenuSectionLabel>
          <MenuItem icon={<ShoppingCart className="w-4 h-4 text-blue-500" />} label="בקשת קנייה אד-הוק חדשה" href="/store-authorization" onClick={onClose} />
          <MenuItem icon={<FileText className="w-4 h-4 text-emerald-500" />} label="הבקשות שלי וסטטוס אישורים" href="/store-authorization/requests" onClick={onClose} />
          {canPurchase && (
            <MenuItem
              icon={<ShoppingBag className="w-4 h-4 text-blue-600" />}
              label="אישור בקשות אד-הוק"
              badge={pendingStoreAuthCount}
              href="/admin/store-requests"
              onClick={onClose}
            />
          )}
        </div>

        {canPurchase && (
          <div className="space-y-2">
            <MenuSectionLabel>ניהול הרשימה</MenuSectionLabel>
            <MenuItem icon={<Edit3 className="w-4 h-4 text-[var(--accent-text)]" />} label="ניהול קטגוריות ומועד קציבה" onClick={wrap(onOpenCategories)} />
            {(isAdmin || isManager || isLogistics) && (
              <MenuItem icon={<Star className="w-4 h-4 text-amber-500" />} label="ניהול מוצרים נפוצים" onClick={wrap(onOpenStarManager)} />
            )}
            <MenuItem icon={<History className="w-4 h-4 text-slate-500" />} label="סבבים קודמים" onClick={wrap(onOpenCycleHistory)} />
            {isAdmin && (
              <MenuItem
                icon={<Database className="w-4 h-4 text-amber-500" />}
                label="בקשות מוצרים חדשים"
                badge={pendingRequestsCount}
                onClick={wrap(onOpenAdminRequests)}
              />
            )}
          </div>
        )}

        {canPurchase && (
          <div className="space-y-3 pt-2">
            <MenuSectionLabel>הפקת רשימות לקניות וחלוקה (Word)</MenuSectionLabel>
            
            <div className="p-3 bg-[var(--fill)] rounded-2xl border border-[var(--border)] space-y-2">
              <div className="text-xs font-bold text-[var(--accent-text)] flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>רשימת סופר שוטפת</span>
                </div>
                <button
                  onClick={wrap(() => onExportOngoingList("all"))}
                  className="py-1 px-2.5 rounded-lg bg-[var(--accent)] hover:brightness-110 text-white text-xs font-bold transition-all cursor-pointer border-none shadow-xs"
                >
                  📑 רשימה מאוחדת ({activeSupermarket.length})
                </button>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {TARGET_FRAMEWORKS.map((fw) => {
                  const count = activeSupermarket.filter((r) => (r.targetFramework || "main") === fw.id).length;
                  return (
                    <button
                      key={fw.id}
                      onClick={wrap(() => onExportOngoingList(fw.id))}
                      className={`py-2 px-2 rounded-xl ${fw.pillInactive} border text-xs font-bold transition-all cursor-pointer text-center leading-tight flex items-center justify-between gap-1`}
                    >
                      <span className="truncate">📄 {fw.name}</span>
                      <span className="text-xs font-bold opacity-80 shrink-0">({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-3 bg-[var(--fill)] rounded-2xl border border-[var(--border)] space-y-2">
              <div className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Boxes className="w-3.5 h-3.5" />
                  <span>רשימת ציוד ורכש</span>
                </div>
                <button
                  onClick={wrap(() => onExportProcurementList("all"))}
                  className="py-1 px-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all cursor-pointer border-none shadow-xs"
                >
                  📑 רשימה מאוחדת ({activeProcurement.length})
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {TARGET_FRAMEWORKS.map((fw) => {
                  const count = activeProcurement.filter((r) => (r.targetFramework || "main") === fw.id).length;
                  return (
                    <button
                      key={fw.id}
                      onClick={wrap(() => onExportProcurementList(fw.id))}
                      className={`py-2 px-2 rounded-xl ${fw.pillInactive} border text-xs font-bold transition-all cursor-pointer text-center leading-tight flex items-center justify-between gap-1`}
                    >
                      <span className="truncate">📦 {fw.name}</span>
                      <span className="text-xs font-bold opacity-80 shrink-0">({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
