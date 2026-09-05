import { z } from "zod";

export const HUB_PROGRAM_ALL = "all" as const;

export type HubStatusFilter = "active" | "planned" | "ended";
export const HUB_STATUS_VALUES: HubStatusFilter[] = [
  "active",
  "planned",
  "ended",
];

export interface HubFilterSet {
  program: string;
  status: HubStatusFilter[];
  intake: string | null;
  subjects: string[];
  categories: string[];
  q: string;
  my: boolean;
  page: number;
}

export interface HubAggregateRequest {
  filter_params: { field_name: string; operator: string; value: string }[];
  q?: string;
  facets: ("status" | "subject" | "category")[];
}

export const hubStatusAggregateSchema = z.object({
  active: z.number(),
  planned: z.number(),
  ended: z.number(),
  paused: z.number(),
});
export type HubStatusAggregate = z.infer<typeof hubStatusAggregateSchema>;

export const hubFacetProgramSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const hubFacetRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  count: z.number(),
  programs: z.array(hubFacetProgramSchema).optional(),
});
export type HubFacetRow = z.infer<typeof hubFacetRowSchema>;

export const hubAggregateResponseSchema = z.object({
  status: hubStatusAggregateSchema.optional(),
  subject: z.array(hubFacetRowSchema).optional(),
  category: z.array(hubFacetRowSchema).optional(),
});
export type HubAggregateResponse = z.infer<typeof hubAggregateResponseSchema>;

export type HubFacet = "status" | "subject" | "category";
