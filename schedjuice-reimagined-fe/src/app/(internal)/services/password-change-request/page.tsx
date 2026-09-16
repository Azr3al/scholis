"use client";

import { PageContainer } from "@/components/layout/page-container";
import { TypographyH1 } from "@/components/typography/h1";
import Link from "next/link";

const PasswordChangeRequestPage: React.FC = () => {
  return (
    <PageContainer width="default" className="flex flex-col gap-3">
      <TypographyH1>Password Change Request</TypographyH1>
      <p className="text-text-secondary">
        You can request a password change for your account here by using our
        Telegram bot Staffy
      </p>

      <Link
        className="underline text-accent"
        href="https://t.me/miss_staffy_bot"
        target="_blank"
      >
        Open Telegram Bot
      </Link>
    </PageContainer>
  );
};

export default PasswordChangeRequestPage;
