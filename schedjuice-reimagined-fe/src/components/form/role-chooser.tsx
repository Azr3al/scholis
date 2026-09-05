import { Checkbox } from "@/components/primitives";
import { getMutableRoleOfUser } from "@/helpers/role";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";

interface RoleChooserProps {
  roles: string[];
  setRoles: (roles: string[]) => void;
}

const RoleChooser: React.FC<RoleChooserProps> = ({ roles, setRoles }) => {
  const { user } = useUser();
  const { tenant } = useTenant();
  return (
    <div className="flex flex-col items-start gap-3">
      {user &&
        getMutableRoleOfUser(user?.roles, tenant ?? undefined).map((r) => (
          <div key={r} className="flex items-center gap-3">
            <Checkbox
              id={`${r}-checkbox`}
              checked={roles?.filter((x) => x === r).length > 0}
              onCheckedChange={(e) => {
                if (e) {
                  setRoles([...roles, r]);
                } else {
                  setRoles(roles.filter((x) => x !== r));
                }
              }}
            ></Checkbox>
            <label htmlFor={`${r}-checkbox`}>{r}</label>
          </div>
        ))}
    </div>
  );
};

export default RoleChooser;
