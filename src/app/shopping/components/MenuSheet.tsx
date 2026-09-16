"use client";

import Link from "next/link";
import {
  ShoppingCart, FileText, ShoppingBag, RotateCcw, Settings, Star, Download,
  FileSpreadsheet, Trash2, Receipt, Database, Edit3, Clock,
} from "lucide-react";
import { BottomSheet } from "./BottomSheet";

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
  onImportRecurringList: () => void;
  onOpenRecurringEditor: () => void;
  onOpenCategories: () => void;
  onOpenStarManager: () => void;
  onOpenReceiptScan: () => void;
  onOpenAdminRequests: () => void;
  onExportProcurementList: () => void;
  onExportOngoingList: () => void;
  onExportXlsx: () => void;
  onDeleteArchiveDay: () => void;
  onClearAllArchive: () => void;
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
      : "bg-[var(--foreground)]/[0.03] hover:bg-[var(--foreground)]/[0.06] border-[var(--border)] text-[var(--foreground)]"
  }`;
  const content = (
    <>
      {icon}
      <span className="flex-1">{label}</span>
      {!!badge && badge > 0 && (
        <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black">{badge}</span>
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
  return <div className="text-[10px] font-black text-[var(--muted)] uppercase tracking-widest px-1 pt-1">{children}</div>;
}

/**
 * The single "⋯" menu — replaces the old ad-hoc/export/tools dropdown trio on desktop
 * and the separate mobile actions drawer, so every device has exactly one place to find
 * these actions instead of three differently-shaped ones.
 */
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
  onImportRecurringList,
  onOpenRecurringEditor,
  onOpenCategories,
  onOpenStarManager,
  onOpenReceiptScan,
  onOpenAdminRequests,
  onExportProcurementList,
  onExportOngoingList,
  onExportXlsx,
  onDeleteArchiveDay,
  onClearAllArchive,
}: MenuSheetProps) {
  const wrap = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="פעולות ותפריט" icon={<Settings className="w-4 h-4 text-indigo-500" />}>
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
            {listType === "supermarket" && (
              <MenuItem icon={<RotateCcw className="w-4 h-4 text-purple-500" />} label="שאיבת רשימה קבועה לסופר" onClick={wrap(onImportRecurringList)} />
            )}
            {listType === "supermarket" && (isAdmin || isLogistics) && (
              <MenuItem icon={<Clock className="w-4 h-4 text-purple-500" />} label="עריכת רשימה קבועה (שבועית)" onClick={wrap(onOpenRecurringEditor)} />
            )}
            <MenuItem icon={<Edit3 className="w-4 h-4 text-indigo-500" />} label="ניהול קטגוריות ומועד קציבה" onClick={wrap(onOpenCategories)} />
            {(isAdmin || isManager || isLogistics) && (
              <MenuItem icon={<Star className="w-4 h-4 text-amber-500" />} label="ניהול מוצרי כוכב" onClick={wrap(onOpenStarManager)} />
            )}
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
          <div className="space-y-2">
            <MenuSectionLabel>ייצוא</MenuSectionLabel>
            <MenuItem icon={<Download className="w-4 h-4 text-blue-500" />} label="ייצוא רשימת רכש (Word)" onClick={wrap(onExportProcurementList)} />
            <MenuItem icon={<Download className="w-4 h-4 text-emerald-500" />} label="ייצוא רשימה שוטפת (Word)" onClick={wrap(onExportOngoingList)} />
            {isAdmin && (
              <MenuItem icon={<FileSpreadsheet className="w-4 h-4 text-emerald-600" />} label="ייצוא ארכיון מלא (Excel)" onClick={wrap(onExportXlsx)} />
            )}
          </div>
        )}

        <div className="space-y-2">
          <MenuSectionLabel>אחר</MenuSectionLabel>
          {canPurchase && (
            <MenuItem icon={<Receipt className="w-4 h-4 text-rose-500" />} label="סריקת קבלה" onClick={wrap(onOpenReceiptScan)} />
          )}
          {(isAdmin || isManager || isLogistics) && (
            <>
              <MenuItem icon={<Trash2 className="w-4 h-4 text-rose-500" />} label="מחיקת יום מהארכיון" danger onClick={wrap(onDeleteArchiveDay)} />
              <MenuItem icon={<Trash2 className="w-4 h-4 text-rose-500" />} label="איפוס וניקוי כל הארכיון" danger onClick={wrap(onClearAllArchive)} />
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
