import RequestForm from "./RequestForm";
import StoryList, { type CardEntry } from "./StoryList";
import PdfPreviewModal from "./PdfPreviewModal";
import type { StoryCardState } from "./StoryCard";
import type { GenerateRequest } from "../types";

export type GeneratorViewProps = {
  entries: CardEntry[];
  previewStory: { story: StoryCardState; request: GenerateRequest } | null;
  onSubmit: (req: GenerateRequest) => void;
  onDismiss: (story_id: string) => void;
  onPreviewPdf: (story: StoryCardState, request: GenerateRequest) => void;
  onClosePreview: () => void;
};

export default function GeneratorView({
  entries,
  previewStory,
  onSubmit,
  onDismiss,
  onPreviewPdf,
  onClosePreview,
}: GeneratorViewProps) {
  return (
    <>
      <RequestForm onSubmit={onSubmit} />

      <StoryList
        entries={entries}
        onPreviewPdf={onPreviewPdf}
        onDismiss={onDismiss}
      />

      {previewStory && (
        <PdfPreviewModal
          open
          story={previewStory.story}
          request={previewStory.request}
          onClose={onClosePreview}
        />
      )}
    </>
  );
}
