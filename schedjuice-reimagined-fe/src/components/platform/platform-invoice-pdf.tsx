"use client";

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { PlatformInvoicePdfPayload } from "@/helpers/platform-invoice";
import { formatDate } from "@/helpers/date";
import type { PdfFontFamilies } from "@/lib/sj/register-pdf-fonts";
import { PDF, PDF_TABLE_ROW_MIN_HEIGHT } from "@/lib/sj/pdf-tokens";

function createPlatformInvoiceStyles(fonts: PdfFontFamilies) {
  const emphasis = fonts.emphasisWeight
    ? { fontFamily: fonts.emphasis, fontWeight: fonts.emphasisWeight }
    : { fontFamily: fonts.emphasis };

  const monoMedium = fonts.monoWeight
    ? { fontFamily: fonts.mono, fontWeight: fonts.monoWeight }
    : { fontFamily: fonts.mono };

  const serifHeading = fonts.emphasisWeight
    ? { fontFamily: fonts.serif, fontWeight: fonts.emphasisWeight }
    : { fontFamily: fonts.serif };

  return StyleSheet.create({
    page: {
      paddingTop: 44,
      paddingBottom: 56,
      paddingHorizontal: 48,
      fontSize: 10,
      fontFamily: fonts.sans,
      color: PDF.textPrimary,
      backgroundColor: PDF.surface,
      lineHeight: 1.6,
    },
    topBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 24,
    },
    brandBlock: {
      flexDirection: "row",
      alignItems: "center",
      maxWidth: "52%",
    },
    logo: {
      width: 40,
      height: 40,
      objectFit: "contain",
      marginRight: 12,
    },
    brandName: {
      fontSize: 16,
      ...serifHeading,
      color: PDF.textPrimary,
    },
    brandTagline: {
      fontSize: 9,
      color: PDF.textMuted,
      marginTop: 2,
    },
    invoiceMeta: {
      alignItems: "flex-end",
      minWidth: 188,
    },
    invoiceTitle: {
      fontSize: 20,
      ...serifHeading,
      letterSpacing: 1.4,
      color: PDF.textPrimary,
      marginBottom: 10,
    },
    metaLine: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: 3,
    },
    metaLabel: {
      color: PDF.textMuted,
      fontSize: 9,
      minWidth: 52,
      textAlign: "right",
      marginRight: 8,
    },
    metaValue: {
      ...monoMedium,
      fontSize: 9,
      minWidth: 100,
      textAlign: "right",
      color: PDF.textSecondary,
    },
    accentRule: {
      height: 2,
      backgroundColor: PDF.accent,
      marginBottom: 28,
    },
    partyRow: {
      flexDirection: "row",
      marginBottom: 32,
    },
    partyBlock: {
      flex: 1,
    },
    partyBlockFirst: {
      marginRight: 32,
    },
    partyLabel: {
      fontSize: 8,
      ...emphasis,
      letterSpacing: 1,
      color: PDF.accent,
      marginBottom: 8,
      paddingBottom: 6,
      borderBottomWidth: 1,
      borderBottomColor: PDF.border,
    },
    partyName: {
      fontSize: 12,
      ...serifHeading,
      marginBottom: 4,
      color: PDF.textPrimary,
    },
    partyDetail: {
      color: PDF.textMuted,
      fontSize: 9,
      lineHeight: 1.5,
    },
    table: {
      borderTopWidth: 1,
      borderTopColor: PDF.borderStrong,
      marginBottom: 24,
    },
    tableHeader: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: PDF.border,
      paddingVertical: 10,
      paddingHorizontal: 0,
      minHeight: 36,
      alignItems: "center",
    },
    tableHeaderCell: {
      fontSize: 8,
      ...emphasis,
      letterSpacing: 0.8,
      color: PDF.textMuted,
    },
    tableRow: {
      flexDirection: "row",
      paddingVertical: 14,
      paddingHorizontal: 0,
      minHeight: PDF_TABLE_ROW_MIN_HEIGHT,
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: PDF.border,
    },
    tableRowLast: {
      borderBottomWidth: 0,
    },
    colDescription: {
      flex: 1.4,
      paddingRight: 12,
    },
    colDetail: {
      flex: 1,
      paddingRight: 12,
      color: PDF.textSecondary,
      fontSize: 9,
    },
    colAmount: {
      width: 104,
      textAlign: "right",
      ...serifHeading,
      fontSize: 10,
      color: PDF.textPrimary,
    },
    itemTitle: {
      ...emphasis,
      color: PDF.textPrimary,
    },
    totalsWrap: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: 28,
    },
    totalsBox: {
      width: 272,
      borderTopWidth: 1,
      borderTopColor: PDF.borderStrong,
    },
    totalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 10,
      paddingHorizontal: 0,
      borderBottomWidth: 1,
      borderBottomColor: PDF.border,
      alignItems: "center",
    },
    totalRowLast: {
      borderBottomWidth: 0,
      paddingTop: 12,
      marginTop: 2,
      borderTopWidth: 1,
      borderTopColor: PDF.borderStrong,
    },
    totalLabel: {
      color: PDF.textSecondary,
      fontSize: 9,
    },
    totalValue: {
      ...serifHeading,
      fontSize: 10,
      textAlign: "right",
      color: PDF.textPrimary,
    },
    totalValueAccent: {
      ...serifHeading,
      fontSize: 11,
      color: PDF.amount,
      textAlign: "right",
    },
    note: {
      fontSize: 9,
      color: PDF.textMuted,
      marginBottom: 16,
      lineHeight: 1.6,
      maxWidth: "88%",
    },
    infoSection: {
      marginBottom: 20,
      paddingTop: 4,
      borderTopWidth: 1,
      borderTopColor: PDF.border,
    },
    infoSectionTitle: {
      fontSize: 8,
      ...emphasis,
      letterSpacing: 0.8,
      color: PDF.accent,
      marginBottom: 8,
    },
    infoLine: {
      fontSize: 9,
      color: PDF.textSecondary,
      marginBottom: 4,
      lineHeight: 1.5,
    },
    infoLineMuted: {
      fontSize: 8,
      color: PDF.textMuted,
      marginTop: 6,
      lineHeight: 1.5,
      maxWidth: "92%",
    },
    footer: {
      position: "absolute",
      bottom: 36,
      left: 48,
      right: 48,
      borderTopWidth: 1,
      borderTopColor: PDF.border,
      paddingTop: 10,
      fontSize: 8,
      color: PDF.textMuted,
      flexDirection: "row",
      justifyContent: "space-between",
    },
    footerMono: {
      fontFamily: fonts.mono,
      fontSize: 8,
      color: PDF.textMuted,
    },
  });
}

function MetaLine({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createPlatformInvoiceStyles>;
}) {
  return (
    <View style={styles.metaLine}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

export function PlatformInvoicePdfDocument({
  payload,
  fonts,
}: {
  payload: PlatformInvoicePdfPayload;
  fonts: PdfFontFamilies;
}) {
  const styles = createPlatformInvoiceStyles(fonts);
  const orgSubtotalCount =
    (payload.platformSubtotal != null ? 1 : 0) +
    (payload.flatRateSubtotal != null ? 1 : 0);
  const hasAiSubtotal = payload.aiSubtotal != null;
  const showSplitDueNote =
    orgSubtotalCount > 1 || (orgSubtotalCount > 0 && hasAiSubtotal);
  const singleOrgSubtotal =
    orgSubtotalCount === 1 && !hasAiSubtotal
      ? (payload.platformSubtotal ?? payload.flatRateSubtotal)
      : null;
  const generatedLabel = formatDate(payload.generatedAt);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.topBar}>
          <View style={styles.brandBlock}>
            {payload.orgLogoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image has no alt prop
              <Image src={payload.orgLogoUrl} style={styles.logo} />
            ) : null}
            <View>
              <Text style={styles.brandName}>{payload.billFromName}</Text>
              <Text style={styles.brandTagline}>
                School management platform
              </Text>
            </View>
          </View>
          <View style={styles.invoiceMeta}>
            <Text style={styles.invoiceTitle}>Invoice</Text>
            <MetaLine
              label="No."
              value={`#${payload.invoiceNumber}`}
              styles={styles}
            />
            <MetaLine
              label="Period"
              value={payload.periodLabel}
              styles={styles}
            />
            <MetaLine label="Date" value={generatedLabel} styles={styles} />
            <MetaLine
              label="Valid until"
              value={payload.validUntilLabel}
              styles={styles}
            />
          </View>
        </View>

        <View style={styles.accentRule} />

        <View style={styles.partyRow}>
          <View style={[styles.partyBlock, styles.partyBlockFirst]}>
            <Text style={styles.partyLabel}>FROM</Text>
            <Text style={styles.partyName}>{payload.billFromName}</Text>
          </View>
          <View style={styles.partyBlock}>
            <Text style={styles.partyLabel}>BILL TO</Text>
            <Text style={styles.partyName}>{payload.billToName}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colDescription]}>
              DESCRIPTION
            </Text>
            <Text style={[styles.tableHeaderCell, styles.colDetail]}>
              USAGE
            </Text>
            <Text style={[styles.tableHeaderCell, styles.colAmount]}>
              AMOUNT
            </Text>
          </View>
          {payload.lineItems.map((item, index) => (
            <View
              key={`${item.label}-${item.amount}`}
              style={
                index === payload.lineItems.length - 1
                  ? [styles.tableRow, styles.tableRowLast]
                  : styles.tableRow
              }
            >
              <View style={styles.colDescription}>
                <Text style={styles.itemTitle}>{item.label}</Text>
              </View>
              <Text style={styles.colDetail}>{item.detail}</Text>
              <Text style={styles.colAmount}>{item.amount}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsWrap}>
          <View style={styles.totalsBox}>
            {payload.platformSubtotal ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Usage subtotal</Text>
                <Text style={styles.totalValue}>
                  {payload.platformSubtotal}
                </Text>
              </View>
            ) : null}
            {payload.flatRateSubtotal ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subscription</Text>
                <Text style={styles.totalValue}>
                  {payload.flatRateSubtotal}
                </Text>
              </View>
            ) : null}
            {payload.aiSubtotal ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>AI usage (USD)</Text>
                <Text style={styles.totalValue}>{payload.aiSubtotal}</Text>
              </View>
            ) : null}
            {singleOrgSubtotal ? (
              <View style={[styles.totalRow, styles.totalRowLast]}>
                <Text style={styles.totalLabel}>Amount due</Text>
                <Text style={styles.totalValueAccent}>{singleOrgSubtotal}</Text>
              </View>
            ) : null}
            {hasAiSubtotal && orgSubtotalCount === 0 ? (
              <View style={[styles.totalRow, styles.totalRowLast]}>
                <Text style={styles.totalLabel}>Amount due (USD)</Text>
                <Text style={styles.totalValueAccent}>
                  {payload.aiSubtotal}
                </Text>
              </View>
            ) : null}
            {showSplitDueNote ? (
              <View style={[styles.totalRow, styles.totalRowLast]}>
                <Text style={styles.totalLabel}>Due</Text>
                <Text style={[styles.totalValueAccent, { fontSize: 9 }]}>
                  See subtotals above
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {showSplitDueNote ? (
          <Text style={styles.note}>
            {hasAiSubtotal
              ? "Platform fees and AI usage are billed in separate currencies. Amounts are not combined into a single total."
              : "Usage and subscription amounts are listed separately and are not combined into a single total."}
          </Text>
        ) : null}

        <View style={styles.infoSection}>
          <Text style={styles.infoSectionTitle}>PAYMENT INFORMATION</Text>
          <Text style={styles.infoLine}>KBZ Pay: {payload.paymentKbzPay}</Text>
          <Text style={styles.infoLineMuted}>{payload.paymentFeeNote}</Text>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoSectionTitle}>CONTACT</Text>
          <Text style={styles.infoLine}>{payload.contactName}</Text>
          <Text style={styles.infoLine}>{payload.contactPhone}</Text>
          <Text style={styles.infoLine}>{payload.contactEmail}</Text>
        </View>

        <Text style={styles.note}>
          This invoice reflects platform usage for the billing period above. For
          payment or billing questions, use the contact details listed above.
        </Text>

        <View style={styles.footer} fixed>
          <Text style={styles.footerMono}>
            Schedjuice · #{payload.invoiceNumber}
          </Text>
          <Text>
            {payload.generatedByName
              ? `Prepared by ${payload.generatedByName} · ${generatedLabel}`
              : `Generated ${generatedLabel}`}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
