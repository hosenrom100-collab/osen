"use client";

import { useCallback, useState } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

interface AlertOptions {
  title: string;
  message: string;
  type?: "danger" | "info" | "success";
}

interface AlertState extends AlertOptions {
  isOpen: boolean;
  resolve?: () => void;
}

/**
 * Promise-based replacement for window.alert(), backed by the shared ConfirmModal
 * rendered with a single dismiss button (hideCancel).
 * Usage: await alert({ title, message }); render <AlertDialog /> once in the component.
 */
export function useAlert() {
  const [state, setState] = useState<AlertState>({ isOpen: false, title: "", message: "" });

  const alert = useCallback((options: AlertOptions) => {
    return new Promise<void>((resolve) => {
      setState({ ...options, isOpen: true, resolve });
    });
  }, []);

  const handleDismiss = () => {
    state.resolve?.();
    setState((s) => ({ ...s, isOpen: false }));
  };

  const AlertDialog = () => (
    <ConfirmModal
      isOpen={state.isOpen}
      onClose={handleDismiss}
      onConfirm={handleDismiss}
      title={state.title}
      message={state.message}
      type={state.type}
      confirmLabel="הבנתי"
      hideCancel
    />
  );

  return { alert, AlertDialog };
}
