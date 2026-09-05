"use client";

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { StaffPayslipPayload } from "@/helpers/staff-payslip";

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  header: {
    marginBottom: 24,
  },
  logo: {
    width: 80,
    height: 40,
    objectFit: "contain",
    marginBottom: 8,
  },
  orgName: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 12,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 10,
    color: "#6B7280",
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    fontWeight: "bold",
  },
  footer: {
    position: "absolute",
    bottom: 48,
    left: 48,
    right: 48,
    fontSize: 9,
    color: "#6B7280",
  },
});

export function StaffPayslipPdfDocument({
  payload,
}: {
  payload: StaffPayslipPayload;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {payload.orgLogoUrl ? (
            <Image src={payload.orgLogoUrl} style={styles.logo} />
          ) : null}
          <Text style={styles.orgName}>{payload.orgName}</Text>
          <Text style={styles.title}>{payload.title}</Text>
          <Text style={styles.subtitle}>{payload.subtitle}</Text>
        </View>
        <View>
          {payload.lineItems.map((item) => (
            <View key={item.id} style={styles.row}>
              <Text>{item.label}</Text>
              <Text>{item.amount}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text>Total</Text>
            <Text>{payload.total}</Text>
          </View>
        </View>
        <Text style={styles.footer}>Generated {payload.generatedAt}</Text>
      </Page>
    </Document>
  );
}
