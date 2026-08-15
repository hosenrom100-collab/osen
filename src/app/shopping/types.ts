import { Timestamp } from "firebase/firestore";

export interface ShoppingRequest {
  id: string;
  name: string;
  category: string;
  quantity: string;
  status: "pending" | "approved" | "purchased" | "archived" | "deleted";
  requestedBy: string;
  requestedByName: string;
  createdAt: Timestamp | Date;
  notes?: string;
  priority?: "low" | "normal" | "urgent";
  listType?: "supermarket" | "large";
  updatedAt?: Timestamp | Date;
  updatedBy?: string;
  archivedAt?: Timestamp | Date;
  archivedBy?: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  defaultUnit?: string;
  defaultNotes?: string;
  isRecurring?: boolean;
  recurringQuantity?: string;
  trackInventory?: boolean;
  isActive?: boolean;
  isStar?: boolean;
}

export interface InventoryItem {
  id: string;
  productId: string;
  name: string;
  category: string;
  currentStock: number;
  minStock: number;
  unit: string;
  lastUpdated?: Timestamp | Date;
  lastUpdatedBy?: string;
  lastUpdatedByName?: string;
}

export interface InventoryLogEntry {
  id?: string;
  productId: string;
  productName: string;
  previousStock: number;
  newStock: number;
  delta: number;
  reason: "manual" | "purchased" | "reorder" | "count" | "consumed";
  updatedBy: string;
  updatedByName: string;
  timestamp: Timestamp | Date;
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
}

export interface CutoffConfig {
  enabled: boolean;
  day: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  time: string; // "HH:MM" format e.g. "12:00"
}

export interface CutoffStatus {
  isEnabled: boolean;
  isPassed: boolean;
  formattedTarget: string;
  timeLeftFormatted: string;
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
}
