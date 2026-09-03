import type { LegalDocumentKey } from './legalDocuments'

export function openLegalCenter(documentKey?: LegalDocumentKey) {
  window.dispatchEvent(new CustomEvent('project-penpal:open-legal', {
    detail: { documentKey },
  }))
}
