"use client";

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { PaymentReceiptPayload } from "@/helpers/payment-receipt";

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  header: {
    marginBottom: 24,
    alignItems: "center",
  },
  logo: {
    width: 160,
    height: 80,
    objectFit: "contain",
    marginBottom: 8,
  },
  orgName: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
    textAlign: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 12,
    marginBottom: 16,
    textAlign: "center",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
    width: "100%",
  },
  metaLabel: {
    color: "#6B7280",
  },
  section: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 16,
  },
  sectionTitle: {
    fontWeight: "bold",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    marginBottom: 8,
  },
  label: {
    width: 130,
    color: "#6B7280",
  },
  value: {
    flex: 1,
    fontWeight: "bold",
  },
  footer: {
    position: "absolute",
    bottom: 48,
    left: 48,
    right: 48,
    fontSize: 9,
    color: "#6B7280",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 12,
  },
  signatureBlock: {
    marginTop: 8,
    marginBottom: 4,
  },
  signatureImage: {
    height: 36,
    width: 120,
    objectFit: "contain",
    objectPosition: "left center",
    marginBottom: 4,
  },
  signatureLabel: {
    fontSize: 9,
    color: "#374151",
  },
});

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export function PaymentReceiptPdfDocument({
  payload,
}: {
  payload: PaymentReceiptPayload;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {payload.orgLogoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image has no alt prop
            <Image src={payload.orgLogoUrl} style={styles.logo} />
          ) : null}
          <Text style={styles.orgName}>{payload.orgName}</Text>
          <Text style={styles.title}>Payment Receipt</Text>
          <View style={styles.metaRow}>
            <Text>
              <Text style={styles.metaLabel}>Receipt # </Text>
              {payload.receiptNumber}
            </Text>
            <Text>
              <Text style={styles.metaLabel}>Date </Text>
              {payload.receiptDate}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <DetailRow label="Student" value={payload.studentName} />
          {payload.courseLines ? null : (
            <DetailRow label="Course" value={payload.courseTitle} />
          )}
          <DetailRow
            label="Months covered"
            value={
              payload.monthsCoveredCount
                ? `${payload.billingPeriod} (${payload.monthsCoveredCount} ${
                    payload.monthsCoveredCount === 1 ? "month" : "months"
                  })`
                : payload.billingPeriod
            }
          />
          {payload.baseAmount ? (
            <DetailRow label="Base amount" value={payload.baseAmount} />
          ) : null}
          {payload.discountLines?.length ? (
            <DetailRow
              label="Discount"
              value={payload.discountLines.join("\n")}
            />
          ) : payload.discountLine ? (
            <DetailRow label="Discount" value={payload.discountLine} />
          ) : null}
          {payload.invoicedAmount ? (
            <DetailRow label="Invoiced amount" value={payload.invoicedAmount} />
          ) : null}
          {payload.refundLine ? (
            <DetailRow label="Refund" value={payload.refundLine} />
          ) : null}
          <DetailRow label="Amount paid" value={payload.amountPaid} />
          {payload.termProgress ? (
            <DetailRow label="Term progress" value={payload.termProgress} />
          ) : null}
          {payload.adjustedNote ? (
            <DetailRow label="Adjustment" value={payload.adjustedNote} />
          ) : null}
          <DetailRow label="Transaction ID" value={payload.transactionId} />
          <DetailRow label="Payment method" value={payload.paymentMethod} />
          <DetailRow label="Status" value="Verified" />
          {payload.installmentNote ? (
            <DetailRow label="Installment" value={payload.installmentNote} />
          ) : null}
          {payload.remarks ? (
            <DetailRow label="Remarks" value={payload.remarks} />
          ) : null}
        </View>

        {payload.courseLines && payload.courseLines.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Courses</Text>
            {payload.courseLines.map((line) => (
              <DetailRow
                key={line.courseTitle}
                label={line.courseTitle}
                value={[
                  line.baseAmount ? `Base ${line.baseAmount}` : null,
                  ...line.discountLines,
                  line.invoicedAmount ? `Invoiced ${line.invoicedAmount}` : null,
                  `Paid ${line.amountPaid}`,
                ]
                  .filter(Boolean)
                  .join("\n")}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.footer}>
          {payload.authorizedSignatureUrl ? (
            <View style={styles.signatureBlock}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image has no alt prop */}
              <Image
                src={payload.authorizedSignatureUrl}
                style={styles.signatureImage}
              />
              {payload.authorizedSignatureName ? (
                <Text style={styles.signatureLabel}>
                  Authorized by {payload.authorizedSignatureName}
                </Text>
              ) : null}
            </View>
          ) : null}
          <Text>
            This receipt confirms a verified payment recorded in {payload.orgName}.
          </Text>
          <Text>Generated at {payload.generatedAt}</Text>
          <Text>Downloaded by {payload.downloadedBy}</Text>
          {payload.createdBy ? (
            <Text>Created by {payload.createdBy}</Text>
          ) : null}
          {payload.verifiedBy ? (
            <Text>Verified by {payload.verifiedBy}</Text>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}
