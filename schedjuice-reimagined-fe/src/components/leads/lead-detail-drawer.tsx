"use client";
import { Sheet } from "@/components/primitives";
import { RoughDivider } from "@/components/primitives/decoration/rough-divider";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DURATION } from "@/lib/sj/motion";
import { fetchLeadMentionCandidates, fetchTimeline } from "@/lib/leads-api";
import {
  leadsKeys,
  useAddLeadComment,
  useAddLeadObserver,
  useLeadMentionCandidates,
  useLeads,
  useRemoveLeadObserver,
} from "@/hooks/leads/use-leads-board";
import { LeadTimeline } from "./lead-timeline";
import {
  appointmentPlatformDisplay,
  nextLeadAppointment,
} from "./appointment-platform-display";
import { MeetingLinkRow, MeetingPlatformBadge } from "./meeting-platform-badge";
import { candidatesToMentionRoster } from "@/lib/board-mentions";
import { MentionCommentComposer } from "@/components/board-detail/mention-comment-composer";
import { ObserversList } from "@/components/board-detail/observers-list";
import type { Lead, LeadSource, LeadStatus } from "@/types/lead";

export function LeadDetailDrawer({
  open,
  lead,
  statuses,
  sources,
  onClose,
}: {
  open: boolean;
  lead: Lead | null;
  statuses: LeadStatus[];
  sources: LeadSource[];
  onClose: () => void;
}) {
  const [visibleLead, setVisibleLead] = useState<Lead | null>(null);

  useEffect(() => {
    if (lead) {
      setVisibleLead(lead);
      return;
    }
    if (!open) {
      const id = window.setTimeout(
        () => setVisibleLead(null),
        DURATION.normal * 1000,
      );
      return () => clearTimeout(id);
    }
  }, [lead, open]);

  return (
    <Sheet.Root open={open && !!lead} onOpenChange={(next) => !next && onClose()}>
      {visibleLead ? (
        <LeadDetailDrawerContent
          lead={visibleLead}
          statuses={statuses}
          sources={sources}
        />
      ) : null}
    </Sheet.Root>
  );
}

function LeadDetailDrawerContent({
  lead,
  statuses,
  sources,
}: {
  lead: Lead;
  statuses: LeadStatus[];
  sources: LeadSource[];
}) {
  const queryClient = useQueryClient();
  const { data: leads = [] } = useLeads();
  const liveLead = leads.find((item) => item.id === lead.id) ?? lead;
  const [selectedTimelineEventId, setSelectedTimelineEventId] = useState<
    number | null
  >(null);
  const [removingObserverId, setRemovingObserverId] = useState<number | null>(null);
  const status =
    typeof lead.status === "object"
      ? lead.status
      : statuses.find((item) => item.id === lead.status);
  const source =
    typeof lead.source === "object"
      ? lead.source
      : sources.find((item) => item.id === lead.source);

  const subtitle = [lead.interested_in || "—", source?.name, status?.name]
    .filter(Boolean)
    .join(" · ");

  const nextAppointment = nextLeadAppointment(liveLead.appointments);
  const appointmentDisplay = nextAppointment
    ? appointmentPlatformDisplay(nextAppointment)
    : null;

  const { data: timeline = [] } = useQuery({
    queryKey: leadsKeys.timeline(lead.id),
    queryFn: () => fetchTimeline(lead.id),
  });

  const { data: mentionCandidates = [] } = useLeadMentionCandidates("");
  const mentionRoster = useMemo(
    () => candidatesToMentionRoster(mentionCandidates),
    [mentionCandidates],
  );

  const addComment = useAddLeadComment(lead.id);
  const addObserver = useAddLeadObserver(lead.id);
  const removeObserver = useRemoveLeadObserver(lead.id);

  const observers = liveLead.observers ?? [];

  return (
    <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden border-l-0 p-0 sm:max-w-none md:w-[720px] lg:w-[820px]"
        >
          <div className="absolute left-0 top-0 h-full w-px bg-border" aria-hidden />

          <div className="space-y-1 border-b border-border px-6 py-5 pr-12 text-left">
            <Sheet.Title>{lead.name}</Sheet.Title>
            <Sheet.Description className="text-sm text-text-secondary">
              {subtitle}
            </Sheet.Description>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_260px]">
            <section className="flex min-h-0 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <h3 className="mb-4 font-serif text-xl text-text-primary">
                  Activity
                </h3>
                <LeadTimeline
                  items={timeline}
                  appointments={liveLead.appointments ?? []}
                  selectedEventId={selectedTimelineEventId}
                  onSelectEvent={setSelectedTimelineEventId}
                  onAppointmentSaved={() => {
                    queryClient.invalidateQueries({ queryKey: leadsKeys.leads });
                    queryClient.invalidateQueries({
                      queryKey: leadsKeys.timeline(lead.id),
                    });
                  }}
                />
              </div>

              <footer className="border-t border-border p-4">
                <MentionCommentComposer
                  roster={mentionRoster}
                  isSubmitting={addComment.isPending}
                  onSubmit={({ body, mentions }) =>
                    addComment.mutate({ body, mentions })
                  }
                />
              </footer>
            </section>

            <aside className="border-t border-border bg-surface-hover px-5 py-5 md:border-l md:border-t-0">
              <div className="space-y-5 text-sm">
                <section className="space-y-2">
                  <h3 className="text-xs font-medium text-text-muted">Contact</h3>
                  <dl className="space-y-2">
                    <div>
                      <dt className="text-xs text-text-muted">Phone</dt>
                      <dd className="break-words text-text-primary">
                        {lead.phone || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-text-muted">Email</dt>
                      <dd className="break-words text-text-primary">
                        {lead.email || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-text-muted">Facebook</dt>
                      <dd className="break-words text-text-primary">
                        {lead.facebook_link || "—"}
                      </dd>
                    </div>
                  </dl>
                </section>

                <RoughDivider />

                <section className="space-y-2">
                  <h3 className="text-xs font-medium text-text-muted">Observers</h3>
                  <ObserversList
                    observers={observers}
                    fetchCandidates={fetchLeadMentionCandidates}
                    candidateQueryKeyPrefix={["leads", "mention-candidates", "observer"]}
                    isAdding={addObserver.isPending}
                    removingUserId={removingObserverId}
                    onAdd={(userId) => addObserver.mutate(userId)}
                    onRemove={(userId) => {
                      setRemovingObserverId(userId);
                      removeObserver.mutate(userId, {
                        onSettled: () => setRemovingObserverId(null),
                      });
                    }}
                  />
                </section>

                <RoughDivider />

                <section className="space-y-2">
                  <h3 className="text-xs font-medium text-text-muted">CRM</h3>
                  <dl className="space-y-2">
                    <div>
                      <dt className="text-xs text-text-muted">Status</dt>
                      <dd className="text-text-primary">{status?.name || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-text-muted">Source</dt>
                      <dd className="text-text-primary">{source?.name || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-text-muted">Interested in</dt>
                      <dd className="text-text-primary">
                        {lead.interested_in || "—"}
                      </dd>
                    </div>
                  </dl>
                </section>

                {nextAppointment && (
                  <>
                    <RoughDivider />
                    <section className="space-y-2">
                      <h3 className="text-xs font-medium text-text-muted">
                        Appointment
                      </h3>
                      <dl className="space-y-2">
                        <div>
                          <dt className="text-xs text-text-muted">When</dt>
                          <dd className="font-mono text-text-primary">
                            {new Date(nextAppointment.scheduled_at).toLocaleString()}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-text-muted">Platform</dt>
                          <dd>
                            {appointmentDisplay ? (
                              <MeetingPlatformBadge
                                icon={appointmentDisplay.icon}
                                label={appointmentDisplay.label}
                              />
                            ) : (
                              "—"
                            )}
                          </dd>
                        </div>
                        {nextAppointment.meeting_link ? (
                          <div>
                            <dt className="text-xs text-text-muted">Meeting link</dt>
                            <dd>
                              <MeetingLinkRow href={nextAppointment.meeting_link} />
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                    </section>
                  </>
                )}

                {lead.note && (
                  <>
                    <RoughDivider />
                    <section className="space-y-2">
                      <h3 className="text-xs font-medium text-text-muted">Note</h3>
                      <p className="whitespace-pre-wrap text-text-primary">
                        {lead.note}
                      </p>
                    </section>
                  </>
                )}
              </div>
            </aside>
          </div>
        </Sheet.Popup>
    </Sheet.Portal>
  );
}
