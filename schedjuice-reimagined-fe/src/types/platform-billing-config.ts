export type PlatformBillingConfig = {
  platform_monthly_flat_rate: number | null;
  cost_per_account_per_day: number | null;
  currency_symbol: string;
  currency_iso4217: string;
};

export type PlatformBillingConfigResponse = {
  isError: boolean;
  message: string;
  data: PlatformBillingConfig;
};

export type PlatformBillingConfigPatch = {
  platform_monthly_flat_rate: number | null;
};
