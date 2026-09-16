import { axiosClient } from "@/lib/api";
import type {
  ArtifactDetail,
  ArtifactListItem,
  BriefDetail,
  DemoArtifactHub,
  DemoProvisionActiveJob,
  DemoProvisionJob,
  DemoProvisionStatus,
} from "@/types/demo-artifacts";

type Envelope<T> = { isError: boolean; message: string; data: T };

async function get<T>(path: string): Promise<T> {
  const res = await axiosClient.get<Envelope<T>>(path);
  if (res.data.isError) {
    throw new Error(res.data.message || "Request failed");
  }
  return res.data.data;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await axiosClient.post<Envelope<T>>(path, body);
  if (res.data.isError) {
    throw new Error(res.data.message || "Request failed");
  }
  return res.data.data;
}

export const fetchDemoArtifactsHub = () => get<DemoArtifactHub>("demo-artifacts");

export const fetchDemoArtifactBlueprints = () =>
  get<ArtifactListItem[]>("demo-artifacts/blueprints");

export const fetchDemoArtifactBlueprint = (id: string) =>
  get<ArtifactDetail>(`demo-artifacts/blueprints/${encodeURIComponent(id)}`);

export const fetchDemoArtifactBriefs = () =>
  get<ArtifactListItem[]>("demo-artifacts/briefs");

export const fetchDemoArtifactBrief = (slug: string) =>
  get<BriefDetail>(`demo-artifacts/briefs/${encodeURIComponent(slug)}`);

export const fetchDemoGuide = () => get<BriefDetail>("demo-artifacts/guide");

export const fetchDemoArtifactScenarioPacks = () =>
  get<ArtifactListItem[]>("demo-artifacts/scenario-packs");

export const fetchDemoArtifactScenarioPack = (id: string) =>
  get<ArtifactDetail>(
    `demo-artifacts/scenario-packs/${encodeURIComponent(id)}`
  );

export const fetchDemoArtifactUseCases = () =>
  get<ArtifactListItem[]>("demo-artifacts/use-cases");

export const fetchDemoArtifactUseCase = (id: string) =>
  get<ArtifactDetail>(`demo-artifacts/use-cases/${encodeURIComponent(id)}`);

export const fetchDemoArtifactImports = () =>
  get<ArtifactListItem[]>("demo-artifacts/imports");

export const fetchDemoArtifactImport = (filename: string) =>
  get<ArtifactDetail>(
    `demo-artifacts/imports/${encodeURIComponent(filename)}`
  );

export const fetchDemoProvisionStatus = (slug: string) =>
  get<DemoProvisionStatus>(
    `demo-artifacts/briefs/${encodeURIComponent(slug)}/provision-status`
  );

export const startDemoProvision = (slug: string, reset: boolean) =>
  post<DemoProvisionActiveJob>(
    `demo-artifacts/briefs/${encodeURIComponent(slug)}/provision`,
    { reset }
  );

export const fetchDemoProvisionJob = (jobId: number) =>
  get<DemoProvisionJob>(`demo-artifacts/provision-jobs/${jobId}`);
