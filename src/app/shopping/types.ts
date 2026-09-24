import { Timestamp } from "firebase/firestore";

export type TargetFramework =
  | "main"
  | "lower"
  | "veterans_morning"
  | "veterans_evening"
  | "iron_swords_evening"
  | "forest";

export interface ShoppingRequest {
  id: string;
  name: string;
  category: string;
  quantity: string;
  status: "pending" | "approved" | "purchased" | "deleted";
  requestedBy: string;
  requestedByName: string;
  createdAt: Timestamp | Date;
  notes?: string;
  priority?: "low" | "normal" | "urgent";
  listType?: "supermarket" | "large";
  targetFramework?: TargetFramework;
  updatedAt?: Timestamp | Date;
  updatedBy?: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  defaultUnit?: string;
  defaultNotes?: string;
  isActive?: boolean;
  isStar?: boolean;
}

export interface NewProductRequest {
  id: string;
  name: string;
  category: string;
  requestedBy: string;
  requestedByName: string;
  createdAt: Timestamp | Date;
  status: "pending" | "approved" | "rejected";
  notes?: string;
  quantity?: string;
  priority?: "normal" | "urgent";
  targetFramework?: TargetFramework;
}

export interface CutoffConfig {
  enabled: boolean;
  day: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  time: string; // "HH:MM" format e.g. "16:00"
  deliveryDay?: number | null; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday, null = not set
}

export interface CutoffStatus {
  isEnabled: boolean;
  isPassed: boolean;
  formattedTarget: string;
  timeLeftFormatted: string;
  /** Milliseconds until the cutoff; only set while the cutoff hasn't passed. */
  msLeft?: number;
  deliveryDayFormatted?: string;
}

export interface StoreAuthorizationItem {
  productName: string;
  quantity: string;
  unit?: string;
  approvedQuantity?: string;
  status: "pending" | "approved" | "rejected";
  notes?: string;
}

export interface StoreAuthorizationRequest {
  id: string;
  requestNumber: number;
  requestedBy: string;
  requestedByName: string;
  items: StoreAuthorizationItem[];
  status: "pending" | "approved" | "rejected";
  createdAt: Timestamp | Date;
  approvedAt?: Timestamp | Date;
  approvedBy?: string | "";
  approvedByName?: string | "";
  pdfUrl?: string;
  notes?: string;
  storeName?: string;
}

/** One line of a closed cycle, frozen as it was when the cycle ended. */
export interface CycleItemSnapshot {
  name: string;
  category: string;
  quantity: string;
  notes: string;
  priority: "low" | "normal" | "urgent";
  targetFramework: TargetFramework;
  requestedByName: string;
  purchased: boolean;
}

/** A closed shopping cycle, saved to `shopping_cycles` before the live items are cleared. */
export interface CycleRecord {
  id: string;
  listType: "supermarket" | "large";
  closedAt: Date;
  closedByName: string;
  purchasedCount: number;
  unpurchasedCount: number;
  carriedOverCount: number;
  items: CycleItemSnapshot[];
}
