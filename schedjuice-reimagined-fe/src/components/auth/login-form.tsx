"use client";
import { useToast } from "@/components/primitives";

import AutoForm, {
  getDefaultValues,
  getObjectFormSchema,
  type AutoFormGroup,
} from "@/components/auto-form";
import { Button, Checkbox, Field } from "@/components/primitives";

import Link from "next/link";
import * as z from "zod";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  completeMicrosoftRedirectLogin,
  exchangeGoogleHandoff,
  isMicrosoftLoginFailure,
  login,
  loginWithTelegram,
} from "@/app/client-api/auth";
import { formatMicrosoftLoginError } from "@/helpers/ms-login-error";
import {
  getEnabledSocialProviders,
  parseGoogleOAuthReturn,
  parseTelegramOAuthHash,
  parseTelegramOAuthReturn,
} from "@/helpers/login-composition";
import {
  openGoogleOAuthLogin,
  openTelegramOAuthLogin,
  SocialLoginIconRow,
} from "@/components/auth/social-login-icon-row";
import { useTenant } from "@/hooks/useTenant";
import { tenantNeedsPublicRefresh } from "@/lib/tenant-cookie";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

import { organizationType } from "@/types/organization";
import { useEffect, useRef, useState } from "react";
import { Loader } from "@/components/form/loader";
import { snakeToTitle } from "@/helpers/formatters";
import { cn } from "@/lib/utils";
import axios from "axios";

type LoginApiErrorBody = {
  isError?: boolean;
  message?: string;
  details?: string | { detail?: string };
};

type LoginSubmitFailure = {
  message: string;
  showOnPasswordField?: boolean;
  redirectToForgotPassword?: boolean;
};

const INVALID_CREDENTIALS_MESSAGE = "Your email or password may be incorrect.";

const LOGIN_STATUS_COPY: Record<string, string> = {
  awaiting_activation:
    "Your registration is pending administrator approval. You will receive an email when your account is activated.",
  password_change_required:
    "You are required to change your password before logging in.",
  inactive_user:
    "Your account is currently disabled. Please contact your administrator.",
  telegram_not_linked:
    "No account is linked to this Telegram user. Sign in another way, then connect Telegram on your profile.",
  telegram_login_disabled: "Telegram login is not enabled for this school.",
  telegram_auth_invalid: "Telegram sign-in could not be verified. Try again.",
  telegram_auth_expired: "Telegram sign-in expired. Try again.",
  google_not_linked:
    "No account is linked to this Google user. Sign in another way, then connect Google on your profile.",
  google_login_disabled: "Google login is not enabled for this school.",
  google_auth_invalid: "Google sign-in could not be verified. Try again.",
  microsoft_link_required:
    "Link your Microsoft account on your profile before signing in with Telegram.",
};

function getLoginHttpStatus(error: unknown): number | undefined {
  if (!axios.isAxiosError(error)) {
    return (error as { status?: number }).status;
  }
  return error.response?.status;
}

function getLoginErrorBody(error: unknown): LoginApiErrorBody | undefined {
  if (!axios.isAxiosError(error) || !error.response?.data) {
    return undefined;
  }
  return error.response.data as LoginApiErrorBody;
}

function getLoginErrorDetail(
  body: LoginApiErrorBody | undefined,
): string | undefined {
  if (!body?.details) {
    return undefined;
  }
  if (typeof body.details === "string" && body.details.trim()) {
    return body.details.trim();
  }
  if (
    typeof body.details === "object" &&
    typeof body.details.detail === "string" &&
    body.details.detail.trim()
  ) {
    return body.details.detail.trim();
  }
  return undefined;
}

function isInvalidCredentialsError(error: unknown): boolean {
  const status = getLoginHttpStatus(error);
  const body = getLoginErrorBody(error);
  const detail = getLoginErrorDetail(body)?.toLowerCase() ?? "";

  if (status === 401) {
    return true;
  }
  if (
    body?.isError &&
    (detail.includes("credentials") || detail.includes("no active account"))
  ) {
    return true;
  }
  return false;
}

function resolveLoginSubmitFailure(error: unknown): LoginSubmitFailure {
  if (isInvalidCredentialsError(error)) {
    return {
      message: INVALID_CREDENTIALS_MESSAGE,
      showOnPasswordField: true,
    };
  }

  const status = getLoginHttpStatus(error);
  const body = getLoginErrorBody(error);
  const messageCode = body?.message?.trim();
  const detail = getLoginErrorDetail(body);
  const statusFallback = messageCode
    ? LOGIN_STATUS_COPY[messageCode]
    : undefined;

  if (status === 400 && messageCode === "password_change_required") {
    return {
      message:
        detail ??
        statusFallback ??
        "You need to reset your password before signing in.",
      redirectToForgotPassword: true,
    };
  }

  if (statusFallback) {
    return {
      message: detail ?? statusFallback,
    };
  }

  if (detail) {
    return { message: detail };
  }

  if (messageCode) {
    return { message: snakeToTitle(messageCode) };
  }

  if (!axios.isAxiosError(error) || !error.response) {
    return {
      message:
        "Could not reach the server. Check your connection and try again.",
    };
  }

  return {
    message: "Something went wrong while logging in. Please try again later.",
  };
}

function applyLoginSubmitFailure(
  error: unknown,
  email: string,
  actions: {
    setLoginError: (message: string) => void;
    setPasswordError: (message: string) => void;
    redirectToForgotPassword: (email: string) => void;
  },
) {
  const failure = resolveLoginSubmitFailure(error);
  actions.setLoginError(failure.message);

  if (failure.showOnPasswordField) {
    actions.setPasswordError(failure.message);
  }
  if (failure.redirectToForgotPassword) {
    actions.redirectToForgotPassword(email);
  }
}

const LOGIN_GROUPS: AutoFormGroup[] = [
  {
    id: "credentials",
    title: "Credentials",
    fields: ["email", "password"],
  },
];

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const loginFieldConfig = {
  password: { inputProps: { type: "password" as const } },
};

interface ILoginFormProps {
  tenant?: organizationType;
}

const LoginForm: React.FC<ILoginFormProps> = ({ tenant: tenantProp }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const telegramOAuthProcessedRef = useRef(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const {
    tenant: liveTenant,
    isLoading: isTenantLoading,
    isFetching: isTenantFetching,
    isError: isTenantError,
    isTenantMissing,
    retryTenant,
    refetchTenant,
  } = useTenant();
  // Prefer the live public-org payload (rewrites cookie) over the slim SSR cookie.
  const tenant = liveTenant ?? tenantProp ?? null;
  const socialProviders = getEnabledSocialProviders(tenant);
  const hasSocialLogin = socialProviders.length > 0;

  const objectFormSchema = getObjectFormSchema(loginSchema);

  const form = useForm<z.infer<typeof objectFormSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: getDefaultValues(loginSchema),
  });

  const getRedirectPath = () => {
    if (searchParams.get("next")) {
      if (searchParams.get("next") === "/") {
        return "/home";
      }
      return searchParams.get("next")!;
    }
    return "/home";
  };
  const redirect = () => {
    window.location.href = getRedirectPath();
  };

  const submitHandler = async (values: typeof loginSchema._type) => {
    form.clearErrors("password");
    setLoginError(null);
    setIsLoading(true);
    const isLoggedInSuccess = await login({
      email: values.email,
      password: values.password,
      isMicrosoft: false,
      remember: rememberMe,
      onError: (error) => {
        applyLoginSubmitFailure(error, values.email, {
          setLoginError,
          setPasswordError: (message) => {
            form.setError("password", { type: "server", message });
          },
          redirectToForgotPassword: (email) => {
            router.push(`/forgot-password?email=${email}`);
          },
        });
        setIsLoading(false);
      },
    });
    if (isLoggedInSuccess) {
      toast.add({
        description: "Successfully logged in.",
      });

      redirect();
    }
    setIsLoading(false);
  };

  const microsoftLogin = async () => {
    if (!tenant) {
      return;
    }
    let activeTenant = tenant;
    if (tenantNeedsPublicRefresh(activeTenant)) {
      try {
        activeTenant = (await refetchTenant()) ?? activeTenant;
      } catch (err) {
        console.error("[tenant revalidate]", err);
        toast.add({
          type: "error",
          description:
            "Microsoft sign-in failed: could not refresh tenant Microsoft settings.",
        });
        return;
      }
    }
    if (tenantNeedsPublicRefresh(activeTenant)) {
      toast.add({
        type: "error",
        description:
          "Microsoft sign-in failed: tenant is missing app_id/authority after refresh. Check org Microsoft settings.",
      });
      return;
    }

    const result = await login({
      isMicrosoft: true,
      authority: activeTenant.authority!,
      clientId: activeTenant.app_id!,
      remember: rememberMe,
    });
    if (result === true) {
      toast.add({
        description: "Successfully logged in.",
      });
      redirect();
    } else if (isMicrosoftLoginFailure(result)) {
      console.error(`[${result.stage}]`, result.error);
      toast.add({
        type: "error",
        description: formatMicrosoftLoginError(result.error),
      });
    }
  };

  const handleTelegramAuth = async (user: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    auth_date: number;
    hash: string;
  }) => {
    setLoginError(null);
    setIsLoading(true);
    try {
      await loginWithTelegram(user, rememberMe);
      toast.add({
        description: "Successfully logged in.",
      });
      redirect();
    } catch (error) {
      applyLoginSubmitFailure(error, "", {
        setLoginError,
        setPasswordError: () => undefined,
        redirectToForgotPassword: () => undefined,
      });
      toast.add({
        type: "error",
        description: resolveLoginSubmitFailure(error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleHandoff = async (code: string) => {
    setLoginError(null);
    setIsLoading(true);
    try {
      await exchangeGoogleHandoff(code);
      toast.add({
        description: "Successfully logged in.",
      });
      redirect();
    } catch (error) {
      applyLoginSubmitFailure(error, "", {
        setLoginError,
        setPasswordError: () => undefined,
        redirectToForgotPassword: () => undefined,
      });
      toast.add({
        type: "error",
        description: resolveLoginSubmitFailure(error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getRandomLoginImage = () => {
    if (
      tenant &&
      ["suconnect.thiha.net", "suconnect.teachersucenter.com"].includes(
        tenant.domain_url,
      )
    ) {
      return "/images/trsu-bg.webp";
    }
    return `/images/login-${Math.floor(Math.random() * 10) + 1}.jpg`;
  };

  useEffect(() => {
    if (isTenantLoading || isTenantFetching) {
      return;
    }
    // Only a definitive 404 means this host has no organization. Timeouts,
    // throttling and 5xx leave the tenant unknown, not missing, and must stay
    // on a retryable screen instead of the dead-end /notfound page.
    if (!tenant && isTenantMissing) {
      router.push("/notfound?error=tenant");
    }
  }, [tenant, isTenantLoading, isTenantFetching, isTenantMissing, router]);

  useEffect(() => {
    if (!tenant?.is_microsoft_on || !tenant.app_id || !tenant.authority) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const isLoggedInSuccess = await completeMicrosoftRedirectLogin(
        tenant.app_id!,
        tenant.authority!,
      );
      if (cancelled) {
        return;
      }
      if (isMicrosoftLoginFailure(isLoggedInSuccess)) {
        console.error(`[${isLoggedInSuccess.stage}]`, isLoggedInSuccess.error);
        toast.add({
          type: "error",
          description: formatMicrosoftLoginError(isLoggedInSuccess.error),
        });
        return;
      }
      if (!isLoggedInSuccess) {
        return;
      }
      toast.add({
        description: "Successfully logged in.",
      });
      redirect();
    })();

    return () => {
      cancelled = true;
    };
  }, [tenant?.app_id, tenant?.authority, tenant?.is_microsoft_on]);

  const [currentImage, setCurrentImage] = useState(getRandomLoginImage());
  const [fade, setFade] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(true);
      const next = getRandomLoginImage();

      setTimeout(() => {
        setCurrentImage(next);
        setFade(false);
      }, 800);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (telegramOAuthProcessedRef.current) {
      return;
    }

    const hashPayload = parseTelegramOAuthHash(window.location.hash);
    const queryPayload = parseTelegramOAuthReturn(searchParams);
    const telegramPayload = hashPayload ?? queryPayload;

    if (telegramPayload) {
      telegramOAuthProcessedRef.current = true;
      if (hashPayload) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }
      void handleTelegramAuth(telegramPayload);
      if (queryPayload) {
        router.replace("/login");
      }
      return;
    }

    const googleReturn = parseGoogleOAuthReturn(searchParams);
    if (!googleReturn) {
      return;
    }

    if (googleReturn.handoffCode) {
      void handleGoogleHandoff(googleReturn.handoffCode);
      router.replace("/login");
      return;
    }

    if (googleReturn.errorCode) {
      const message =
        LOGIN_STATUS_COPY[googleReturn.errorCode] ??
        googleReturn.errorDetails ??
        LOGIN_STATUS_COPY.google_auth_invalid;
      setLoginError(message);
      router.replace("/login");
    }
  }, [searchParams]);

  if (!tenant) {
    const isTenantUnreachable =
      isTenantError &&
      !isTenantMissing &&
      !isTenantLoading &&
      !isTenantFetching;
    if (isTenantUnreachable) {
      return (
        <div
          data-testid="login-tenant-error"
          className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-surface px-6 text-center"
        >
          <p className="text-sm text-text-muted">
            We couldn&apos;t reach the server. Check your connection and try
            again.
          </p>
          <Button onClick={() => void retryTenant()}>Try again</Button>
        </div>
      );
    }
    return (
      <div
        data-testid="login-tenant-loading"
        className="flex h-screen w-full items-center justify-center bg-surface text-text-muted"
      >
        <Loader />
        <span className="text-sm">Loading</span>
      </div>
    );
  }

  const socialLoginRow = hasSocialLogin ? (
    <SocialLoginIconRow
      tenant={tenant}
      disabled={isLoading || (isTenantFetching && tenantNeedsPublicRefresh(tenant))}
      onMicrosoftLogin={() => void microsoftLogin()}
      onGoogleRedirect={() => openGoogleOAuthLogin(rememberMe)}
      onTelegramRedirect={() => openTelegramOAuthLogin(tenant)}
    />
  ) : null;

  const socialLoginFooter = hasSocialLogin ? (
    <>
      <Field.Root className="flex flex-row items-center gap-2">
        <Checkbox
          id="remember-me-social"
          checked={rememberMe}
          onCheckedChange={(checked) => setRememberMe(checked === true)}
        />
        <Field.Label
          htmlFor="remember-me-social"
          className="text-sm font-normal text-text-muted"
        >
          Remember me
        </Field.Label>
      </Field.Root>
      <div
        className={cn(
          "min-h-9 px-3 py-2 text-sm",
          loginError &&
            "rounded-md border border-danger/50 bg-danger/10 text-danger",
        )}
        role={loginError ? "alert" : undefined}
        aria-hidden={loginError ? undefined : true}
      >
        {loginError ?? null}
      </div>
    </>
  ) : null;

  return (
    <div>
      <div className="mx-auto max-sm:mr-0">
        <div className="flex justify-between items-center relative">
          <div className="hidden md:flex w-1/2 bg-black h-screen relative">
            {!imageLoaded && (
              <div
                className="h-screen max-sm:hidden w-full bg-gray-200 animate-pulse
              flex items-center justify-center"
              >
                <div className="flex items-center text-gray-500">
                  <Loader />
                  <span className="text-gray-500 text-sm">Loading</span>
                </div>
              </div>
            )}{" "}
            <Image
              unoptimized
              priority
              onLoad={() => setImageLoaded(true)}
              className={`h-screen w-full object-cover brightness-75 absolute inset-0 transition-opacity duration-1000 ${
                fade ? "opacity-0" : "opacity-100"
              }`}
              height={1000}
              width={300}
              alt="background"
              src={currentImage}
            />
            <p className="absolute left-8 top-8 z-10 text-2xl font-bold text-white">
              {tenant.name}
            </p>
            <div className="absolute left-8 bottom-8 right-12 z-10 text-white space-y-3 hidden md:block">
              <p className="text-sm">{tenant?.tagline}</p>
            </div>
            {/* Image Overlay */}
            <div className="w-full h-screen bg-black/20 absolute top-0 left-0 right-0 bottom-0"></div>
          </div>
          <div className="relative flex h-screen w-full flex-col items-center justify-center gap-3 bg-surface md:w-1/2">
            {!imageLoaded && (
              <div
                className="h-screen w-full bg-gray-200 animate-pulse
              flex items-center justify-center absolute top-0 left-0 right-0 bottom-0 md:hidden"
              >
                <div className="flex items-center text-gray-500">
                  <Loader />
                  <span className="text-gray-500 text-sm">Loading</span>
                </div>
              </div>
            )}{" "}
            {/* Skeleton placeholder with loader */}
            <Image
              unoptimized
              priority
              onLoad={() => setImageLoaded(true)}
              className={`md:hidden h-screen w-full object-cover brightness-75 absolute inset-0 transition-opacity duration-1000 ${
                fade ? "opacity-0" : "opacity-100"
              }`}
              height={1000}
              width={300}
              alt="background"
              src={currentImage}
            />
            {/* Image Overlay */}
            <div className="w-full h-screen bg-black/20 absolute top-0 left-0 right-0 bottom-0 md:hidden"></div>
            <div className="absolute inset-0 z-dropdown flex items-center justify-center px-4">
              <div
                className={cn(
                  "flex w-96 max-md:w-72 flex-col gap-6 rounded-md border-none bg-surface p-6 shadow-none md:bg-transparent md:p-0",
                  tenant?.is_microsoft_on && "items-center text-center",
                )}
              >
                <div
                  className="flex w-full flex-col gap-1"
                  data-testid="login-form-header"
                >
                  {tenant.logo && (
                    <Image
                      className="mx-auto mb-2 md:hidden"
                      src={tenant.logo}
                      alt="Logo"
                      width={200}
                      height={100}
                    ></Image>
                  )}
                  <h3 className="text-lg font-bold text-text-primary">
                    Login to your account
                  </h3>
                </div>
                {tenant && tenant.is_microsoft_on && (
                  <div className="flex flex-col gap-4">
                    {socialLoginRow}
                    {socialLoginFooter}
                  </div>
                )}
                {tenant && !tenant.is_microsoft_on && (
                  <>
                    <AutoForm
                      schema={loginSchema}
                      saveMode="create"
                      groups={LOGIN_GROUPS}
                      form={form}
                      className="w-full"
                      stickyFooter={false}
                      onSubmit={(values) =>
                        submitHandler(values as z.infer<typeof loginSchema>)
                      }
                      fieldConfig={loginFieldConfig}
                    >
                      <div className="mt-5 flex flex-col gap-4">
                        <div
                          className={cn(
                            "min-h-9 px-3 py-2 text-sm",
                            loginError &&
                              "rounded-md border border-danger/50 bg-danger/10 text-danger",
                          )}
                          role={loginError ? "alert" : undefined}
                          aria-hidden={loginError ? undefined : true}
                        >
                          {loginError ?? null}
                        </div>
                        <Field.Root className="flex flex-row items-center gap-2">
                          <Checkbox
                            id="remember-me"
                            checked={rememberMe}
                            onCheckedChange={(checked) =>
                              setRememberMe(checked === true)
                            }
                          />
                          <Field.Label
                            htmlFor="remember-me"
                            className="text-sm font-normal text-text-muted"
                          >
                            Remember me
                          </Field.Label>
                        </Field.Root>
                        <Button
                          className="w-full"
                          isLoading={isLoading}
                          type="submit"
                          variant="primary"
                        >
                          Submit
                        </Button>
                      </div>
                    </AutoForm>
                    {hasSocialLogin ? (
                      <div className="flex flex-col gap-4">
                        <p className="text-center text-sm text-text-muted">or</p>
                        {socialLoginRow}
                      </div>
                    ) : null}
                    <div className="flex flex-col gap-4">
                      <div className="flex w-full justify-between text-sm text-text-muted">
                        <Link className="underline" href={"/forgot-password"}>
                          Reset password
                        </Link>

                        <Link
                          className="underline"
                          href={`/register?${new URLSearchParams(
                            searchParams.toString(),
                          )}`}
                        >
                          Register
                        </Link>
                      </div>
                      <div className="text-center text-sm text-text-muted">
                        <p>By continuing, you agree to our </p>
                        <p>
                          <Link
                            href="/terms"
                            className="underline underline-offset-4 hover:text-text-primary"
                          >
                            Terms of Service
                          </Link>{" "}
                          and{" "}
                          <Link
                            href="/privacy-policy"
                            className="underline underline-offset-4 hover:text-text-primary"
                          >
                            Privacy Policy
                          </Link>
                          .
                        </p>
                      </div>
                    </div>
                  </>
                )}
                <p className="w-full text-center font-mono text-[8px] text-text-muted">
                  Developed by Schedjuice in Yangon.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
