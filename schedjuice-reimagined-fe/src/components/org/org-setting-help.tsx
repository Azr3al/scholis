import { ORG_SETTING_HELP } from "@/config/org-setting-help-copy";

export function OrgSettingHelp({ settingKey }: { settingKey: string }) {
  const entry = ORG_SETTING_HELP[settingKey];
  if (!entry) return null;

  return (
    <div className="space-y-1.5">
      <p>{entry.summary}</p>
      <details>
        <summary className="cursor-pointer text-sm text-text-muted hover:text-text-secondary">
          How it works
        </summary>
        <pre className="mt-1.5 overflow-x-auto rounded-md bg-muted/50 p-2 font-mono text-xs whitespace-pre-wrap text-text-secondary">
          {entry.pseudoCode}
        </pre>
      </details>
    </div>
  );
}
