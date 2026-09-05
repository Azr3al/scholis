"use client";

import { OpenNewWindow as ExternalLink } from "iconoir-react";

import CopyInput from "@/components/misc/copy-input";
import { Button, buttonVariants, useToast } from "@/components/primitives";
import { cn } from "@/lib/utils";
import type { DemoCredentials } from "@/types/demo-artifacts";

export function DemoCredentialsBlock({
  credentials,
  domainUrl,
  description,
}: {
  credentials: DemoCredentials;
  domainUrl: string;
  description?: string;
}) {
  const toast = useToast();
  const adminAccount =
    credentials.accounts.find((account) => account.role === "admin") ??
    credentials.accounts[0];

  return (
    <div className="mt-4 space-y-3">
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
      <CopyInput label="Domain" text={domainUrl} />
      <CopyInput
        label="Local dev hint"
        text={credentials.dev_tenant_domain_hint}
      />
      <CopyInput label="Shared demo password" text={credentials.password} />
      <div>
        <p className="text-xs font-semibold mb-1">Demo accounts</p>
        <ul className="text-xs space-y-1">
          {credentials.accounts.map((account) => (
            <li key={account.email}>
              {account.email}{" "}
              <span className="text-muted-foreground">({account.role})</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <a
            href={`https://${domainUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "inline-flex items-center")}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Open tenant
          </a>
        {adminAccount ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              const login = `${adminAccount.email} / ${credentials.password}`;
              void navigator.clipboard.writeText(login);
              toast.add({ description: "School admin login copied" });
            }}
          >
            Copy school admin login
          </Button>
        ) : null}
      </div>
    </div>
  );
}
