"use client";

import Link from "next/link";
import {
  ShoppingCart, FileText, ShoppingBag, RotateCcw, Settings, Star, Download,
  Database, Edit3, Clock, Boxes, History, ChevronLeft,
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
  const className = `w-full flex items-center gap-3 px-3 min-h-[56px] rounded-2xl border transition-colors text-[15px] font-semibold text-right cursor-pointer ${
    danger
      ? "bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/20 text-rose-600 dark:text-rose-400"
      : "bg-[var(--surface)] hover:bg-[var(--fill)] border-[var(--border)] text-[var(--foreground)] shadow-[var(--shadow-card)]"
  }`;
  const content = (
    <>
      <span
        aria-hidden
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 [&>svg]:w-[18px] [&>svg]:h-[18px] ${
          danger ? "bg-rose-500/15 text-rose-600" : "bg-[var(--accent-soft)] text-[var(--accent-text)]"
        }`}
      >
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {!!badge && badge > 0 && (
        <span className="bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full font-bold tabular-nums">{badge}</span>
      )}
      <ChevronLeft className="w-4 h-4 text-[var(--muted)]/50 shrink-0" />
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
          <MenuItem icon={<ShoppingCart className="w-4 h-4" />} label="בקשת קנייה אד-הוק חדשה" href="/store-authorization" onClick={onClose} />
          <MenuItem icon={<FileText className="w-4 h-4" />} label="הבקשות שלי וסטטוס אישורים" href="/store-authorization/requests" onClick={onClose} />
          {canPurchase && (
            <MenuItem
              icon={<ShoppingBag className="w-4 h-4" />}
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
              <MenuItem icon={<Star className="w-4 h-4" />} label="ניהול מוצרים נפוצים" onClick={wrap(onOpenStarManager)} />
            )}
            <MenuItem icon={<History className="w-4 h-4" />} label="סבבים קודמים" onClick={wrap(onOpenCycleHistory)} />
            {isAdmin && (
              <MenuItem
                icon={<Database className="w-4 h-4" />}
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
            
            <div className="p-3 bg-[var(--fill)] rounded-2xl space-y-2.5">
              <div className="text-[13px] font-bold text-[var(--foreground)] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <ShoppingCart className="w-4 h-4 text-[var(--accent-text)]" />
                  <span>רשימת סופר שוטפת</span>
                </div>
                <button
                  onClick={wrap(() => onExportOngoingList("all"))}
                  className="btn-primary h-8 px-3 rounded-lg !text-white text-[13px] font-semibold cursor-pointer flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  רשימה מאוחדת ({activeSupermarket.length})
                </button>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {TARGET_FRAMEWORKS.map((fw) => {
                  const count = activeSupermarket.filter((r) => (r.targetFramework || "main") === fw.id).length;
                  return (
                    <button
                      key={fw.id}
                      onClick={wrap(() => onExportOngoingList(fw.id))}
                      className="h-10 px-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--fill-strong)] text-[13px] font-semibold text-[var(--foreground)] transition-colors cursor-pointer text-right leading-tight flex items-center gap-2"
                    >
                      <span aria-hidden className={`w-2 h-2 rounded-full shrink-0 ${fw.dot}`} />
                      <span className="truncate flex-1">{fw.name}</span>
                      <span className="text-xs font-semibold text-[var(--muted)] tabular-nums shrink-0">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-3 bg-[var(--fill)] rounded-2xl space-y-2.5">
              <div className="text-[13px] font-bold text-[var(--foreground)] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Boxes className="w-4 h-4 text-[var(--accent-text)]" />
                  <span>רשימת רכש</span>
                </div>
                <button
                  onClick={wrap(() => onExportProcurementList("all"))}
                  className="btn-primary h-8 px-3 rounded-lg !text-white text-[13px] font-semibold cursor-pointer flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  רשימה מאוחדת ({activeProcurement.length})
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {TARGET_FRAMEWORKS.map((fw) => {
                  const count = activeProcurement.filter((r) => (r.targetFramework || "main") === fw.id).length;
                  return (
                    <button
                      key={fw.id}
                      onClick={wrap(() => onExportProcurementList(fw.id))}
                      className="h-10 px-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--fill-strong)] text-[13px] font-semibold text-[var(--foreground)] transition-colors cursor-pointer text-right leading-tight flex items-center gap-2"
                    >
                      <span aria-hidden className={`w-2 h-2 rounded-full shrink-0 ${fw.dot}`} />
                      <span className="truncate flex-1">{fw.name}</span>
                      <span className="text-xs font-semibold text-[var(--muted)] tabular-nums shrink-0">{count}</span>
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
