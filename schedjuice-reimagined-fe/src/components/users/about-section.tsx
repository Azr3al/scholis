import { accountType, accountVisibilitySchema } from "@/types/user";
import { getExcludedColumns } from "@/helpers/visibility";
import { useUser } from "@/hooks/useUser";
import { useEffect, useState } from "react";
import AboutItem from "./about-item";
import { cn } from "@/lib/utils";

interface IAboutSectionProps {
  user: accountType;
}

type AboutItemProps = {
  keyName: string;
  label: string;
  renderFn?: (value: any) => React.ReactNode;
};

type AboutSectionProps = {
  name: string;
  items: AboutItemProps[];
  className?: string;
};

// Identity-only fields. Registry built-ins (personal/address/emergency) render via
// the config-driven FormConfigDetail on the profile page.
const aboutItems: AboutSectionProps[] = [
  {
    name: "General",
    items: [
      {
        keyName: "code",
        label: "Account code",
      },
    ],
  },
  {
    name: "Communication",
    items: [
      {
        keyName: "email",
        label: "Primary email",
      },
      {
        keyName: "communication_email",
        label: "Communication email",
      },
      {
        keyName: "phone_number",
        label: "Phone number",
      },
    ],
  },
];

const AboutSection: React.FC<IAboutSectionProps> = ({ user }) => {
  const [excludedColumns, setExcludedColumns] = useState<string[]>([]);
  const { user: loggedInUser } = useUser();

  useEffect(() => {
    if (!loggedInUser) return;
    const excludedColumns = getExcludedColumns(
      loggedInUser,
      accountVisibilitySchema,
      "user"
    );
    setExcludedColumns(excludedColumns);
  }, [loggedInUser]);

  return (
    <div className="rounded-lg border border-border/60 bg-surface text-text-primary shadow-sm">
      <div className="flex flex-col gap-8 px-4 py-6 sm:px-6">
        {aboutItems.map((section, sectionIndex) => (
          <div key={section.name}>
            <div
              className={cn("flex flex-col gap-3", section.className)}
            >
              <h3 className="text-sm font-medium text-text-muted">
                {section.name}
              </h3>
              <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
                {section.items.map((item) => (
                  <AboutItem
                    key={item.keyName}
                    label={item.label}
                    isRedacted={excludedColumns.includes(item.keyName)}
                    value={user[item.keyName as keyof accountType] as string}
                    renderFn={item.renderFn}
                  />
                ))}
              </div>
            </div>
            {sectionIndex < aboutItems.length - 1 && (
              <div className="mt-8 h-px bg-border/60" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AboutSection;
