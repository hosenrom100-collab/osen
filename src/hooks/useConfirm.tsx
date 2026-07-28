"use client";

import { useCallback, useState } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

interface ConfirmOptions {
  title: string;
  message: string;
  type?: "danger" | "info" | "success";
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ConfirmState extends ConfirmOptions {
  isOpen: boolean;
  resolve?: (value: boolean) => void;
}

/**
 * Promise-based replacement for window.confirm(), backed by the shared ConfirmModal.
 * Usage: const ok = await confirm({ title, message }); if (ok) { ... }
 * Render <ConfirmDialog /> once in the component that calls confirm().
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState>({ isOpen: false, title: "", message: "" });

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, isOpen: true, resolve });
    });
  }, []);

  const handleConfirm = () => {
    state.resolve?.(true);
    setState((s) => ({ ...s, isOpen: false }));
  };

  const handleClose = () => {
    state.resolve?.(false);
    setState((s) => ({ ...s, isOpen: false }));
  };

  const ConfirmDialog = () => (
    <ConfirmModal
      isOpen={state.isOpen}
      onClose={handleClose}
      onConfirm={handleConfirm}
      title={state.title}
      message={state.message}
      type={state.type}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
    />
  );

  return { confirm, ConfirmDialog };
}
