"use client";

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { Policy } from "@/lib/rbac/synthesize-policy";
import {
  PEOPLE_DATA_POLICY_HEADING,
  PEOPLE_DATA_POLICY_PARAGRAPHS,
} from "@/lib/rbac/people-data-policy";
import { policyBreadthSummary } from "./policy-overview-utils";

const pdfStyles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8,
  },
  row: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  domain: {
    fontWeight: "bold",
    marginBottom: 4,
    textTransform: "capitalize",
  },
  body: {
    color: "#374151",
    marginBottom: 6,
  },
});

export function PolicyPdfDocument({
  roleName,
  policy,
}: {
  roleName: string;
  policy: Policy;
}) {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <Text style={pdfStyles.title}>Role policy: {roleName}</Text>
        <Text style={pdfStyles.subtitle}>{policyBreadthSummary(policy)}</Text>

        <Text style={pdfStyles.sectionTitle}>{PEOPLE_DATA_POLICY_HEADING}</Text>
        {PEOPLE_DATA_POLICY_PARAGRAPHS.map((paragraph) => (
          <Text key={paragraph} style={pdfStyles.body}>
            {paragraph}
          </Text>
        ))}

        <Text style={pdfStyles.sectionTitle}>At a glance</Text>
        <Text style={pdfStyles.body}>
          Data classes: {policy.dataClasses.join(", ") || "None"}
        </Text>
        {policy.canGrantRoles ? (
          <Text style={pdfStyles.body}>Can grant permissions to others</Text>
        ) : null}

        <Text style={pdfStyles.sectionTitle}>What this role can do</Text>
        {policy.can.map((group) => (
          <View key={group.domain} style={pdfStyles.row}>
            <Text style={pdfStyles.domain}>{group.domain}</Text>
            <Text style={pdfStyles.body}>{group.text}</Text>
          </View>
        ))}

        {policy.cannot.length > 0 ? (
          <>
            <Text style={pdfStyles.sectionTitle}>What this role cannot do</Text>
            {policy.cannot.map((item) => (
              <View key={item.code} style={pdfStyles.row}>
                <Text style={pdfStyles.domain}>{item.code}</Text>
                <Text style={pdfStyles.body}>{item.sentence}</Text>
              </View>
            ))}
          </>
        ) : null}
      </Page>
    </Document>
  );
}
