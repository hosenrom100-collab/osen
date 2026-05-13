import { UserRole } from "@/context/AuthContext";

interface RoleSelectorProps {
  value: UserRole;
  onChange: (role: UserRole) => void;
  disabled?: boolean;
}

export function RoleSelector({ value, onChange, disabled }: RoleSelectorProps) {
  const roles: { value: UserRole; label: string }[] = [
    { value: "admin", label: "אדמין (ניהול על)" },
    { value: "manager", label: "מנהל" },
    { value: "logistics", label: "לוגיסטיקה" },
    { value: "instructor", label: "מדריך" },
    { value: "employee", label: "עובד סוציאלי" }
  ];

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as UserRole)}
      className="bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-50 text-white"
    >
      {roles.map((role) => (
        <option key={role.value} value={role.value}>
          {role.label}
        </option>
      ))}
    </select>
  );
}
