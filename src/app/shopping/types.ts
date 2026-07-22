export interface ShoppingRequest {
  id: string;
  name: string;
  category: string;
  quantity: string;
  status: "pending" | "approved" | "purchased" | "archived" | "deleted";
  requestedBy: string;
  requestedByName: string;
  createdAt: any;
  notes?: string;
  priority?: "low" | "normal" | "urgent";
  listType?: "supermarket" | "large";
  updatedAt?: any;
  updatedBy?: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  defaultUnit?: string;
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
  lastUpdated?: any;
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
  timestamp: any;
}
