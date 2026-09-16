"use client";

import { Button, Menu, useToast } from "@/components/primitives";
import {
  Menu as MenuIcon,
  HalfMoon as MoonIcon,
  SunLight as SunIcon,
  SystemRestart as SunMoonIcon,
} from "iconoir-react";
import { useTheme } from "next-themes";
import { useUser } from "@/hooks/useUser";
import Link from "next/link";
import { logout } from "@/helpers/auth";
import { usePathname, useRouter } from "next/navigation";
import { canEditOrganization } from "@/helpers/authorization";

const ProfileMenu: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const { user } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();

  const perfomLogout = () => {
    logout();
    router.push(`login?${new URLSearchParams({ next: pathname })}`);
    toast.add({
      description: "You have been successfully logged out.",
    });
  };

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button size="sm" variant="ghost" aria-label="Account menu">
            <MenuIcon width={20} height={20} aria-hidden />
          </Button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner align="end">
          <Menu.Popup>
            <Menu.GroupLabel>My account</Menu.GroupLabel>
            <Menu.Separator />
            {user ? (
              <Menu.Group>
                <Menu.Item render={<Link href={`/users/${user.id}`} />}>
                  Profile
                </Menu.Item>
                {canEditOrganization(user) ? (
                  <Menu.Item render={<Link href="/organizations/profile" />}>
                    Organization
                  </Menu.Item>
                ) : null}
                <Menu.Item
                  render={
                    <Link
                      href={`/users/${user.id}?section=settings&pane=appearance`}
                    />
                  }
                >
                  Settings
                </Menu.Item>
              </Menu.Group>
            ) : null}

            <Menu.Separator />
            <Menu.GroupLabel>Theme</Menu.GroupLabel>
            <Menu.Item onClick={() => setTheme("light")}>
              <SunIcon width={16} height={16} aria-hidden />
              Light
              {theme === "light" ? " ✓" : null}
            </Menu.Item>
            <Menu.Item onClick={() => setTheme("dark")}>
              <MoonIcon width={16} height={16} aria-hidden />
              Dark
              {theme === "dark" ? " ✓" : null}
            </Menu.Item>
            <Menu.Item onClick={() => setTheme("system")}>
              <SunMoonIcon width={16} height={16} aria-hidden />
              System
              {theme === "system" ? " ✓" : null}
            </Menu.Item>

            <Menu.Separator />
            <Menu.Item onClick={() => perfomLogout()}>Log out</Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};

export default ProfileMenu;
