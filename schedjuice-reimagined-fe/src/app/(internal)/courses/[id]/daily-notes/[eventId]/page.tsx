"use client";
import { Button, Skeleton } from "@/components/primitives";

import { PageContainer } from "@/components/layout/page-container";
import {
  fetchEntity,
  makePostRequest,
  searchEntities,
  updateEntity,
} from "@/app/client-api/utils";

import { defaultEditorOptions, getDefaultEditorOptions } from "@/components/editor/config";
import TextEditor from "@/components/editor/editor";
import Selector from "@/components/form/selectors/selector";
import BackButton from "@/components/misc/back-button";

import { useToast } from "@/components/primitives";
import { formatDate } from "@/helpers/date";
import { operatorEnum } from "@/types/api";
import { eventType } from "@/types/course";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEditor } from "@tiptap/react";
import { NavArrowLeft } from "iconoir-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const DailyNoteDetailsPage = () => {
  const editor = useEditor(getDefaultEditorOptions());
  const { id, eventId } = useParams<{id: string, eventId: string}>();
  const toast = useToast();
  const router = useRouter();

  const getCourse = useQuery({
    queryKey: ["getCourse", id],
    queryFn: () => {
      return fetchEntity("courses", id);
    },
    refetchOnMount: false,
  });

  const getEvents = useQuery({
    queryKey: ["getEventsWithNoteOfCourse", id],
    queryFn: () => {
      return searchEntities(
        "events",
        { size: -1, expand: ["daily_note"], sorts: ["date"] },
        {
          filter_params: [
            {
              field_name: "course_id",
              operator: operatorEnum.exact,
              value: id,
            },
          ],
        }
      );
    },
    refetchOnMount: false,
  });

  const getDailyNote = useQuery({
    queryKey: ["getDailyNote", eventId],
    queryFn: () => {
      return searchEntities(
        "daily-notes",
        {},
        {
          filter_params: [
            {
              field_name: "event",
              operator: operatorEnum.exact,
              value: eventId,
            },
          ],
        }
      );
    },
    enabled: false,
  });

  const noteCreateMutation = useMutation({
    mutationKey: ["createDailyNote", id],
    mutationFn: () => {
      return makePostRequest("daily-notes", {
        event: eventId,
        note: editor!.getJSON(),
      });
    },
    onSuccess: () => {
      toast.add({
        description: "Your note has been saved",
      });
      getDailyNote.refetch();
    },
  });

  const noteUpdateMutation = useMutation({
    mutationKey: ["updateDailyNote", id],
    mutationFn: (v: any) => {
      return updateEntity(
        "daily-notes",
        getEvents.data?.data.data.find(
          (event: eventType) => event.id === Number(eventId)
        )?.daily_note.id,
        {
          event: eventId,
          note: editor?.getJSON(),
        }
      );
    },
    onSuccess: () => {
      getDailyNote.refetch();
    },
  });

  useEffect(() => {
    if (getDailyNote.isSuccess && getDailyNote.data && editor) {
      if (getDailyNote.data.data.data.length === 0) {
        editor?.commands.setContent(
          getCourse.data?.data.data.default_daily_note
        );
      } else {
        if (getDailyNote.data.data.data[0].note) {
          editor?.commands.setContent(getDailyNote.data.data.data[0].note);
        } else {
          editor?.commands.setContent(getCourse.data?.data.default_daily_note);
        }
      }
    }
  }, [getDailyNote.data, getDailyNote.isSuccess, editor]);

  useEffect(() => {
    getDailyNote.refetch();
  }, []);

  return  (
<PageContainer width="default" className="space-y-3">
      <div className="flex justify-between items-center">
        <BackButton href={`/courses/${id}`}></BackButton>
      </div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className=" text-3xl font-bold">Create a Daily Note</h1>
          <p>
            <span className="font-bold ">Date</span>:{" "}
            {formatDate(
              getEvents.data?.data.data.find(
                (event: eventType) => event.id === Number(eventId)
              )?.date
            )}
          </p>
        </div>

        {getEvents.isSuccess && getEvents.data.data.data.length > 0 && (
          <Selector
            options={getEvents.data?.data.data.map((event: eventType) => ({
              value: String(event.id),
              label: event.date,
            }))}
            onChange={(v) => {
              router.push(`/courses/${id}/daily-notes/${v}`);
            }}
            value={eventId}
            label="Date"
          ></Selector>
        )}
      </div>
      {getDailyNote.isLoading ||
        (!getDailyNote.data && <Skeleton className="w-full h-40"></Skeleton>)}

      {editor && !getDailyNote.isLoading && getDailyNote.data && (
        <div className="space-y-3">
          <TextEditor
            editor={editor}
            isViewOnly={
              noteCreateMutation.isLoading || noteUpdateMutation.isLoading
            }
          ></TextEditor>
          <Button
            isLoading={
              noteCreateMutation.isLoading || noteUpdateMutation.isLoading
            }
            onClick={() => {
              if (
                getEvents.data?.data.data.find(
                  (event: eventType) => event.id === Number(eventId)
                )?.daily_note
              ) {
                noteUpdateMutation.mutate("ok", {
                  onSuccess: () => {
                    toast.add({
                      description: "Your note has been saved",
                    });
                  },
                });
              } else {
                noteCreateMutation.mutate();
              }
            }}
          >
            Save
          </Button>
        </div>
      )}
    </PageContainer>
);
};

export default DailyNoteDetailsPage;
