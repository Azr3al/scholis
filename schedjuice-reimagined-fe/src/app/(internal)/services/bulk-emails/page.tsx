"use client";

import { PageContainer } from "@/components/layout/page-container";
import { defaultEditorOptions } from "@/components/editor/config";
import TextEditor from "@/components/editor/editor";
import FileDragAndDrop, {
  extendedFileType,
  localFileType,
} from "@/components/form/file-drag-and-drop";
import { Button, useToast } from "@/components/primitives";
import { parseCsv } from "@/helpers/csv";
import { useEditor } from "@tiptap/react";
import { useEffect, useState } from "react";

const BulkEmailsPage = () => {
  const [files, setFiles] = useState<extendedFileType[]>([]);
  const [dataObjects, setDataObjects] = useState<Record<string, string>[]>([]);
  const editor = useEditor(defaultEditorOptions);

  const toast = useToast();

  const onSubmit = () => {
    if (dataObjects.length === 0) {
      toast.add({
        description: "Upload a valid CSV file first",
      });
      return;
    }
  };

  useEffect(() => {
    if (files.length > 0) {
      const file = files[0] as localFileType;
      console.log(
        parseCsv(
          file.file,
          (r) => {
            setDataObjects(r);
          },
          (m) => {
            toast.add({
              description: m,
            });
          },
        ),
      );
    }
  }, [files]);

  return (
    <PageContainer width="default">
      <div>
        <FileDragAndDrop
          files={files}
          setFiles={setFiles}
          maxFiles={1}
          label={"Upload a CSV file"}
        />
        <Button onClick={onSubmit}>Submit</Button>
        {editor && (
          <>
            <TextEditor editor={editor} />
          </>
        )}
      </div>
    </PageContainer>
  );
};

export default BulkEmailsPage;
