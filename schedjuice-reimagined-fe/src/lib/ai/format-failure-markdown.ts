import {
  type AiUsageFailureItem,
  type CapabilityGapCode,
  type LikelyCauseCode,
  formatAiTokens,
} from "@/types/ai-usage";

const GAP_LABELS: Record<CapabilityGapCode, string> = {
  missing_tool: "Missing tool",
  data_not_exposed: "Data not exposed",
  access_policy: "Access policy",
  feature_unavailable: "Feature off",
  unknown: "Unknown",
};

const CAUSE_LABELS: Record<LikelyCauseCode, string> = {
  tool_descriptions: "Tool descriptions",
  complex_task: "Complex task",
  model_loop: "Model loop",
  unknown: "Unknown",
};

const OUTCOME_LABELS: Record<AiUsageFailureItem["outcome"], string> = {
  tool_limit_exceeded: "Tool limit",
  capability_gap: "Capability gap",
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function mdSection(title: string, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  return `## ${title}\n\n${trimmed}\n`;
}

function mdField(label: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return `- **${label}:** ${value}`;
}

export function formatAiFailureMarkdown(item: AiUsageFailureItem): string {
  const metadata = [
    mdField("ID", item.id),
    mdField("When", formatWhen(item.created_at)),
    mdField("User", item.user_display_name),
    mdField("Email", item.user_email),
    mdField("Outcome", OUTCOME_LABELS[item.outcome]),
    mdField("Feature", item.feature),
    mdField("Channel", item.channel_key),
    mdField("Model", item.model),
    mdField("Tokens", formatAiTokens(item.total_tokens)),
    mdField("Latency (ms)", item.latency_ms),
    mdField("Tool iterations", item.tool_iterations),
    mdField("Source", item.source),
  ]
    .filter(Boolean)
    .join("\n");

  let diagnosis = "";
  if (item.outcome === "capability_gap") {
    diagnosis = [
      mdField("Why flagged", item.capability_gap_reason),
      mdField("Intent", item.capability_gap_intent),
      mdField("Suggested fix", item.capability_gap_suggested_surface),
      mdField("Domain", item.capability_gap_domain),
      item.capability_gaps.length > 0
        ? `- **Gap types:** ${item.capability_gaps.map((g) => GAP_LABELS[g]).join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  } else {
    diagnosis =
      item.likely_causes.length > 0
        ? `- **Likely causes:** ${item.likely_causes.map((c) => CAUSE_LABELS[c]).join(", ")}`
        : "";
  }

  const reasoning =
    item.thinking_steps.length > 0
      ? item.thinking_steps
          .map((step) => {
            const header = `### Step ${step.iteration}${
              step.thinking_tokens > 0
                ? ` (${formatAiTokens(step.thinking_tokens)} thinking tokens)`
                : ""
            }`;
            const text = step.text.trim() || "—";
            return `${header}\n\n${text}`;
          })
          .join("\n\n")
      : "No reasoning captured.";

  const toolCalls =
    item.tool_calls.length > 0
      ? "```json\n" + JSON.stringify(item.tool_calls, null, 2) + "\n```"
      : "No tool calls recorded.";

  const sections = [
    "# AI Failure Record",
    mdSection("Metadata", metadata),
    mdSection("Question", item.prompt),
    item.response_text ? mdSection("Assistant response", item.response_text) : "",
    diagnosis ? mdSection("Diagnosis", diagnosis) : "",
    mdSection("Reasoning", reasoning),
    mdSection("Tool call chain", toolCalls),
  ].filter(Boolean);

  return sections.join("\n").trim() + "\n";
}
