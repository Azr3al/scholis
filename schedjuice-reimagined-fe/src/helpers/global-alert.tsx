import useGlobalAlertStore from "@/store/global-alert";
import { organizationType } from "@/types/organization";
import { accountType } from "@/types/user";
import Link from "next/link";

export const showGlobalAlert = (
  user: accountType,
  tenant: organizationType
) => {
  const { setIsVisible, setMessage } = useGlobalAlertStore.getState();
  if (!tenant?.is_microsoft_on) {
    if (user.is_password_change_required) {
      setIsVisible(true);
      setMessage(
        <p>Your account is flagged for password change. Please change your password immediately <Link href={"/forgot-password"}>here</Link>.</p>
      );
    }
  }
};
