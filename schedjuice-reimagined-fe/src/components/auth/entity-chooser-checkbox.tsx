import { Checkbox, Tooltip } from "@/components/primitives";
import { role } from "@/types/user";
import {
  applyRoleToggle,
  formatRoleLabel,
  getMutableRoleOfUser,
  hasStaffRole,
  hasStudentRole,
} from "@/helpers/role";
import { useTenant } from "@/hooks/useTenant";
import { cn } from "@/lib/utils";

type CheckedState = boolean | "indeterminate";

interface IRoleChooserProps {
  roles: string[];
  /** Preferred: receives the full next roles array after exclusivity rules apply. */
  onRolesChange?: (roles: string[]) => void;
  /** Legacy: per-checkbox callback used by org-admin forms. */
  setRoles?: (role: string, checked: CheckedState) => void;
  userRoles: role[];
  disabled?: boolean;
  enforceStudentExclusivity?: boolean;
  label?: string;
  isRequired?: boolean;
  /** Used for scroll-to-error targeting (`data-field-name`). */
  fieldName?: string;
  fieldConfigItem?: { description?: React.ReactNode };
  fieldProps?: Record<string, unknown>;
}

function syncLegacySetRoles(
  current: string[],
  next: string[],
  setRoles: (role: string, checked: CheckedState) => void
) {
  const currentSet = new Set(current);
  const nextSet = new Set(next);
  for (const r of Array.from(currentSet)) {
    if (!nextSet.has(r)) setRoles(r, false);
  }
  for (const r of Array.from(nextSet)) {
    if (!currentSet.has(r)) setRoles(r, true);
  }
}

function RoleCheckboxRow({
  id,
  roleValue,
  checked,
  disabled,
  disabledReason,
  onCheckedChange,
  fieldProps,
}: {
  id: string;
  roleValue: role;
  checked: boolean;
  disabled: boolean;
  disabledReason?: string;
  onCheckedChange: (checked: CheckedState) => void;
  fieldProps?: Record<string, unknown>;
}) {
  const row = (
    <div
      className={cn(
        "flex items-center gap-3",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <div>
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          {...fieldProps}
        />
      </div>
      <label
        htmlFor={id}
        className={cn(disabled && "cursor-not-allowed")}
      >
        {formatRoleLabel(roleValue)}
      </label>
    </div>
  );

  if (disabled && disabledReason) {
    return (
      <Tooltip.Root>
        <Tooltip.Trigger render={<span className="inline-flex w-full">{row}</span>} />
        <Tooltip.Portal>
        <Tooltip.Positioner>
        <Tooltip.Popup>{disabledReason}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
      </Tooltip.Root>
    );
  }

  return row;
}

const EntityChooserCheckbox: React.FC<IRoleChooserProps> = ({
  roles,
  onRolesChange,
  setRoles,
  fieldProps,
  fieldConfigItem,
  label,
  isRequired,
  fieldName,
  userRoles,
  disabled = false,
  enforceStudentExclusivity = true,
}) => {
  const { tenant } = useTenant();
  const selectedRoles = roles ?? [];
  const assignableRoles = tenant
    ? getMutableRoleOfUser(userRoles, tenant)
    : [];
  const assignableStudent = assignableRoles.includes(role.student);
  const assignableStaff = assignableRoles.filter((r) => r !== role.student);
  const studentSelected = hasStudentRole(selectedRoles);
  const staffSelected = hasStaffRole(selectedRoles);

  const handleToggle = (toggled: role, checked: CheckedState) => {
    const isChecked = checked === true;
    const next = enforceStudentExclusivity
      ? applyRoleToggle(selectedRoles, toggled, isChecked)
      : isChecked
        ? selectedRoles.includes(toggled)
          ? selectedRoles
          : [...selectedRoles, toggled]
        : selectedRoles.filter((r) => r !== toggled);

    if (onRolesChange) {
      onRolesChange(next);
      return;
    }
    if (setRoles) {
      syncLegacySetRoles(selectedRoles, next, setRoles);
    }
  };

  const useGroupedLayout =
    enforceStudentExclusivity && assignableStudent && assignableStaff.length > 0;

  return (
    <div {...(fieldName ? { "data-field-name": fieldName } : {})}>
      <label>
        {label} {isRequired && <span className="text-destructive">*</span>}
      </label>

      <Tooltip.Provider>
        {useGroupedLayout ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-border/70 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Learner
              </p>
              <RoleCheckboxRow
                id={`${role.student}-checkbox`}
                roleValue={role.student}
                checked={studentSelected}
                disabled={disabled || staffSelected}
                disabledReason={
                  staffSelected
                    ? "Remove staff roles before selecting Student"
                    : undefined
                }
                onCheckedChange={(checked) =>
                  handleToggle(role.student, checked)
                }
                fieldProps={fieldProps}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Cannot be combined with staff roles.
              </p>
            </div>

            <div className="rounded-xl border border-border/70 p-3">
              <p className="mb-3 text-xs font-medium text-muted-foreground">
                School team (select one or more)
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {assignableStaff.map((r) => (
                  <RoleCheckboxRow
                    key={r}
                    id={`${r}-checkbox`}
                    roleValue={r}
                    checked={selectedRoles.includes(r)}
                    disabled={disabled || studentSelected}
                    disabledReason={
                      studentSelected
                        ? "Clear the Student role before adding staff roles"
                        : undefined
                    }
                    onCheckedChange={(checked) => handleToggle(r, checked)}
                    fieldProps={fieldProps}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {assignableRoles.map((r) => {
              const isStaffRole = r !== role.student;
              const rowDisabled =
                disabled ||
                (enforceStudentExclusivity &&
                  ((studentSelected && isStaffRole) ||
                    (staffSelected && r === role.student)));

              return (
                <RoleCheckboxRow
                  key={r}
                  id={`${r}-checkbox`}
                  roleValue={r}
                  checked={selectedRoles.includes(r)}
                  disabled={rowDisabled}
                  disabledReason={
                    enforceStudentExclusivity && studentSelected && isStaffRole
                      ? "Clear the Student role before adding staff roles"
                      : enforceStudentExclusivity &&
                          staffSelected &&
                          r === role.student
                        ? "Remove staff roles before selecting Student"
                        : undefined
                  }
                  onCheckedChange={(checked) => handleToggle(r, checked)}
                  fieldProps={fieldProps}
                />
              );
            })}
          </div>
        )}
      </Tooltip.Provider>

      <p>{fieldConfigItem?.description}</p>
    </div>
  );
};

export default EntityChooserCheckbox;
