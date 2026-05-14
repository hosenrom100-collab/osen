import { UserRole } from "@/context/AuthContext";
import { Check } from "lucide-react";

interface RoleSelectorProps {
  value: UserRole[];
  onChange: (roles: UserRole[]) => void;
  disabled?: boolean;
}

export function RoleSelector({ value, onChange, disabled }: RoleSelectorProps) {
  const roles: { value: UserRole; label: string }[] = [
    { value: "admin", label: "אדמין (ניהול על)" },
    { value: "manager", label: "מנהלת חוסן" },
    { value: "logistics", label: "לוגיסטיקה" },
    { value: "instructor", label: "מדריך" },
    { value: "social_worker", label: "עובד סוציאלי" }
  ];

  const toggleRole = (role: UserRole) => {
    if (value.includes(role)) {
      onChange(value.filter(r => r !== role));
    } else {
      onChange([...value, role]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {roles.map((role) => {
        const isSelected = value.includes(role.value);
        return (
          <button
            key={role.value}
            disabled={disabled}
            onClick={() => toggleRole(role.value)}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 ${
              isSelected 
                ? 'bg-[var(--foreground)] text-[var(--background)] border-transparent' 
                : 'bg-[var(--foreground)]/5 border-[var(--border)] text-[var(--foreground)]/40 hover:bg-[var(--foreground)]/10'
            }`}
          >
            {isSelected && <Check className="w-3 h-3" />}
            {role.label}
          </button>
        );
      })}
    </div>
  );
}
