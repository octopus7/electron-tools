import { CloseIcon, RestoreIcon } from "../icons";
import { formatDocumentLabel } from "../state";
import type { DocumentWindowState } from "../types";

type TabStripProps = {
  documents: DocumentWindowState[];
  activeDocumentId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onRestore: () => void;
};

export function TabStrip({
  documents,
  activeDocumentId,
  onSelect,
  onClose,
  onRestore
}: TabStripProps) {
  return (
    <div className="tab-strip">
      <div className="tab-strip__tabs">
        {documents.map((document) => (
          <div
            key={document.id}
            className={`document-tab ${
              document.id === activeDocumentId ? "is-active" : ""
            }`}
          >
            <button
              type="button"
              className="document-tab__label"
              onClick={() => onSelect(document.id)}
            >
              {formatDocumentLabel(document)}
            </button>
            <button
              type="button"
              className="document-tab__close"
              aria-label={`${document.title} \uB2EB\uAE30`}
              onClick={() => onClose(document.id)}
            >
              <CloseIcon />
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="tab-strip__restore" onClick={onRestore}>
        <RestoreIcon />
        <span>{"\uBB38\uC11C \uBCF5\uC6D0"}</span>
      </button>
    </div>
  );
}
