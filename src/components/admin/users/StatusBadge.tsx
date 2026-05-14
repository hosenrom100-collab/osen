import { UserStatus } from "@/context/AuthContext";
import { Clock, CheckCircle2, Ban, X } from "lucide-react";

interface StatusBadgeProps {
  status: UserStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = {
    pending: {
      text: "ממתין לאישור",
      icon: Clock,
      className: "bg-amber-500/10 text-amber-500 border-amber-500/20"
    },
    approved: {
      text: "מאושר",
      icon: CheckCircle2,
      className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
    },
    blocked: {
      text: "חסום",
      icon: Ban,
      className: "bg-rose-500/10 text-rose-500 border-rose-500/20"
    },
    rejected: {
      text: "נדחה",
      icon: X,
      className: "bg-slate-500/10 text-slate-500 border-slate-500/20"
    }
  };

  const { text, icon: Icon, className } = (config as any)[status] || config.pending;

  return (
    <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${className}`}>
      <Icon className="w-3.5 h-3.5" />
      {text}
    </span>
  );
}
