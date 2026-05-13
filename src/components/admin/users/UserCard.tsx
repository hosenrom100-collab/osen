import { UserProfile } from "@/app/admin/users/page";
import { UserRole, UserStatus } from "@/context/AuthContext";
import { motion } from "framer-motion";
import { User, Check, X, ShieldAlert, BellRing } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { RoleSelector } from "./RoleSelector";

interface UserCardProps {
  user: UserProfile;
  index: number;
  updatingId: string | null;
  onUpdateRole: (userId: string, role: UserRole) => void;
  onUpdateStatus: (userId: string, status: UserStatus) => void;
  onSendNotification?: (userId: string) => void;
}

export function UserCard({ user, index, updatingId, onUpdateRole, onUpdateStatus, onSendNotification }: UserCardProps) {
  const isUpdating = updatingId === user.id;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white/5 border border-white/10 p-5 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4"
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400">
          <User className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold">{user.name}</h3>
            <StatusBadge status={user.status} />
          </div>
          <p className="text-slate-500 text-sm">{user.email}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <RoleSelector 
          value={user.role} 
          onChange={(role) => onUpdateRole(user.id, role)}
          disabled={isUpdating}
        />

        {user.status === "pending" ? (
          <button
            onClick={() => onUpdateStatus(user.id, "approved")}
            disabled={isUpdating}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-sm font-bold hover:bg-emerald-500/30 transition-all disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            אשר כניסה
          </button>
        ) : user.status === "approved" ? (
          <button
            onClick={() => onUpdateStatus(user.id, "blocked")}
            disabled={isUpdating}
            className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-xl text-sm font-medium hover:bg-rose-500/20 transition-all disabled:opacity-50"
          >
            <ShieldAlert className="w-4 h-4" />
            חסום
          </button>
        ) : (
          <button
            onClick={() => onUpdateStatus(user.id, "approved")}
            disabled={isUpdating}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-sm font-medium hover:bg-emerald-500/20 transition-all disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            שחרר חסימה
          </button>
        )}

        {onSendNotification && user.status === "approved" && (
          <button
            onClick={() => onSendNotification(user.id)}
            className="p-2 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-xl hover:bg-purple-500/20 transition-all"
            title="שלח התראת בדיקה"
          >
            <BellRing className="w-4 h-4" />
          </button>
        )}

        {isUpdating && (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500"></div>
        )}
      </div>
    </motion.div>
  );
}
