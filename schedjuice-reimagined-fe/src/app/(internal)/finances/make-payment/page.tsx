"use client";

import { PageContainer } from "@/components/layout/page-container";
import { useFinancePageHeader } from "@/components/finances/record/use-finance-record-page-header";
import { makePostRequest, searchEntities } from "@/app/client-api/utils";
import {
  CheckoutCartRecap,
} from "@/components/finances/make-payment/checkout-cart-recap";
import {
  CheckoutScreenshotUpload,
  checkoutScreenshotToPartInput,
  createInitialCheckoutScreenshots,
  type CheckoutScreenshot,
} from "@/components/finances/make-payment/checkout-screenshot-upload";
import { PaymentMethodInstructions } from "@/components/finances/make-payment/payment-method-instructions";
import { PendingInvoiceRow } from "@/components/finances/make-payment/pending-invoice-row";
import { Button, Skeleton, useToast } from "@/components/primitives";
import { EmptyCopy, EmptyState } from "@/components/primitives/empty";
import { EMPTY_COPY_PRESETS } from "@/components/primitives/empty/empty-copy-presets";
import { formatMoney } from "@/helpers/money";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { useMakePaymentCart } from "@/hooks/finances/use-make-payment-cart";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useUser } from "@/hooks/useUser";
import { buildStudentCheckoutFormData } from "@/lib/finances/student-checkout-form-data";
import {
  crossfade,
  crossfadeInstant,
  staggerItem,
  staggerList,
} from "@/lib/sj/motion";
import { operatorEnum } from "@/types/api";
import { UserPaymentStatus } from "@/types/finance";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import type { courseType } from "@/types/course";

type CheckoutStep = "shop" | "checkout";

type PendingPaymentRecord = {
  id: number;
  invoiced_amount?: string | number | null;
  billing_start_date: Date | string;
  billing_end_date: Date | string;
  course: courseType;
};

const StudentMakePaymentPage = () => {
  const currencySymbol = useTenantCurrencySymbol();
  const toast = useToast();
  const { user } = useUser();
  const reducedMotion = useReducedMotion();
  const [step, setStep] = useState<CheckoutStep>("shop");
  const [screenshots, setScreenshots] = useState<CheckoutScreenshot[]>(() =>
    createInitialCheckoutScreenshots(),
  );
  const [courseIdParam] = useQueryState("courseId", parseAsString);

  const userId = user?.id != null ? String(user.id) : "";

  const getUserPayments = useQuery({
    enabled: user !== undefined && isValidApiEntityIdParam(userId),
    queryKey: ["searchUserPayments", userId],
    queryFn: async () =>
      searchEntities(
        "user-payments",
        {
          size: -1,
          expand: ["course"],
        },
        {
          filter_params: [
            {
              field_name: "status",
              operator: operatorEnum.exact,
              value: UserPaymentStatus.pending_payment,
            },
            {
              field_name: "user_id",
              operator: operatorEnum.exact,
              value: userId,
            },
          ],
        },
      ),
  });

  const paymentMethodFields = [
    "name",
    "id",
    "payment_bank",
    "bank_account_number",
    "description",
  ] as const;

  const paymentMethods = useQuery({
    queryKey: ["payment-methods", "checkout", paymentMethodFields],
    queryFn: () =>
      searchEntities(
        "payment-methods",
        {
          size: -1,
          fields: [...paymentMethodFields],
          sorts: ["name"],
        },
        { filter_params: [] },
      ),
  });

  const pendingPayments = (getUserPayments.data?.data.data ??
    []) as PendingPaymentRecord[];

  const cart = useMakePaymentCart({
    userId,
    pendingPayments,
    courseIdParam,
  });

  const cartItems = useMemo(
    () => pendingPayments.filter((row) => cart.cartIdSet.has(row.id)),
    [cart.cartIdSet, pendingPayments],
  );

  const submitMutation = useMutation({
    mutationKey: ["submitStudentCheckout"],
    mutationFn: (formData: FormData) =>
      makePostRequest(
        "make-payment",
        formData,
        {},
        { "Content-Type": "multipart/form-data" },
      ),
    onSuccess: () => {
      cart.clear();
      setScreenshots(createInitialCheckoutScreenshots());
      setStep("shop");
      getUserPayments.refetch();
      toast.add({
        description: "Submitted — we'll review your payment soon.",
      });
    },
    onError: () => {
      toast.add({ description: "Could not submit payment. Try again." });
    },
  });

  const hasUploadableScreenshot = screenshots.some(
    (row) => row.files.length > 0 && "file" in row.files[0],
  );

  const onSubmit = () => {
    if (cart.cartIds.length === 0 || !hasUploadableScreenshot) return;
    const uploadableScreenshots = screenshots.filter(
      (row) => row.files.length > 0 && "file" in row.files[0],
    );
    const formData = buildStudentCheckoutFormData({
      paymentIds: cart.cartIds,
      screenshots: uploadableScreenshots.map(checkoutScreenshotToPartInput),
    });
    submitMutation.mutate(formData);
  };

  const isSaving = submitMutation.isPending;

  useFinancePageHeader(useMemo(() => ({}), []));

  return (
    <PageContainer width="narrow" className="pb-28 sm:pb-8">
      {getUserPayments.isLoading ? (
        <div className="space-y-6" aria-busy="true">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-6 w-80" />
          <div className="space-y-3">
            <Skeleton className="h-[72px] w-full" />
            <Skeleton className="h-[72px] w-full" />
            <Skeleton className="h-[72px] w-full" />
          </div>
        </div>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          {step === "shop" ? (
            <motion.div
              key="shop"
              variants={reducedMotion ? crossfadeInstant : crossfade}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-6"
            >
              <header>
                <h1 className="font-serif text-3xl text-text-primary">
                  Pay for courses
                </h1>
              </header>

              {pendingPayments.length === 0 ? (
                <EmptyState>
                  <EmptyCopy {...EMPTY_COPY_PRESETS.noPayments} />
                  <Link href="/home" className="text-sm text-accent underline">
                    Back to home
                  </Link>
                </EmptyState>
              ) : (
                <motion.ul
                  className="divide-y divide-border-subtle border-y border-border-subtle"
                  variants={reducedMotion ? undefined : staggerList}
                  initial={reducedMotion ? false : "hidden"}
                  animate={reducedMotion ? undefined : "show"}
                >
                  {pendingPayments.map((payment) => (
                    <motion.li
                      key={payment.id}
                      variants={reducedMotion ? undefined : staggerItem}
                    >
                      <PendingInvoiceRow
                        paymentId={payment.id}
                        course={payment.course}
                        price={payment.invoiced_amount ?? 0}
                        billingStartDate={payment.billing_start_date}
                        billingEndDate={payment.billing_end_date}
                        inCart={cart.isInCart(payment.id)}
                        disabled={isSaving}
                        onToggle={() => cart.toggle(payment.id)}
                      />
                    </motion.li>
                  ))}
                </motion.ul>
              )}

              <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border-subtle bg-surface-elevated/95 px-4 py-4 backdrop-blur-sm sm:static sm:mt-8 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
                <div className="flex w-full items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-text-muted">
                      {cart.cartIds.length === 0
                        ? "Cart is empty"
                        : `${cart.cartIds.length} course${cart.cartIds.length === 1 ? "" : "s"} selected`}
                    </p>
                    <p className="font-mono text-xl text-text-primary">
                      {formatMoney(cart.total, currencySymbol)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    disabled={cart.cartIds.length === 0 || isSaving}
                    onClick={() => setStep("checkout")}
                  >
                    Proceed to checkout
                  </Button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="checkout"
              variants={reducedMotion ? crossfadeInstant : crossfade}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-8"
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="inline-flex items-center gap-2 px-0"
                disabled={isSaving}
                onClick={() => setStep("shop")}
              >
                <NavArrowLeft className="size-4 shrink-0" aria-hidden />
                Back to courses
              </Button>

              <CheckoutCartRecap
                items={cartItems}
                total={cart.total}
                onEditCart={() => setStep("shop")}
              />

              {paymentMethods.isLoading ? (
                <div
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                  aria-busy="true"
                >
                  <Skeleton className="h-28 w-full rounded-xl" />
                  <Skeleton className="h-28 w-full rounded-xl" />
                </div>
              ) : (
                <PaymentMethodInstructions
                  methods={paymentMethods.data?.data.data ?? []}
                />
              )}

              <CheckoutScreenshotUpload
                screenshots={screenshots}
                onChange={setScreenshots}
                disabled={isSaving}
              />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  isLoading={isSaving}
                  disabled={
                    cart.cartIds.length === 0 ||
                    !hasUploadableScreenshot ||
                    isSaving
                  }
                  onClick={onSubmit}
                >
                  Submit payment
                </Button>
                <Link
                  href="/finances/payment-history"
                  className="text-sm text-accent underline"
                >
                  View payment history
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </PageContainer>
  );
};

export default StudentMakePaymentPage;
