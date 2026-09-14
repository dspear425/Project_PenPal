import { useEffect, useMemo, useState } from 'react'
import {
  LEGAL_EFFECTIVE_DATE_LABEL,
  getLegalDocument,
  legalDocuments,
  type LegalDocumentKey,
} from '../lib/legalDocuments'

type OpenLegalEvent = CustomEvent<{ documentKey?: LegalDocumentKey }>

export default function LegalCenter() {
  const [open, setOpen] = useState(false)
  const [selectedKey, setSelectedKey] = useState<LegalDocumentKey>('terms')

  const selected = useMemo(() => getLegalDocument(selectedKey) ?? legalDocuments[0], [selectedKey])

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as OpenLegalEvent).detail
      if (detail?.documentKey && getLegalDocument(detail.documentKey)) setSelectedKey(detail.documentKey)
      setOpen(true)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('project-penpal:open-legal', onOpen)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('project-penpal:open-legal', onOpen)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  if (!open) return null

  return (
    <div
      className="legal-center-overlay"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}
    >
      <section className="legal-center-panel" role="dialog" aria-modal="true" aria-labelledby="legal-center-title">
        <header className="legal-center-header">
          <div>
            <p className="eyebrow">Project PenPal</p>
            <h2 id="legal-center-title">Legal & safety center.</h2>
            <p>Terms, privacy information, community rules, and safety guidance for digital and physical correspondence.</p>
          </div>
          <button className="legal-center-close" type="button" onClick={() => setOpen(false)} aria-label="Close Legal and Safety Center">×</button>
        </header>

        <div className="legal-center-layout">
          <nav className="legal-document-nav" aria-label="Legal and safety documents">
            <div className="legal-document-nav-heading">
              <strong>Documents</strong>
              <span>Effective {LEGAL_EFFECTIVE_DATE_LABEL}</span>
            </div>
            {legalDocuments.map((document) => (
              <button
                key={document.key}
                type="button"
                className={selectedKey === document.key ? 'selected' : ''}
                onClick={() => setSelectedKey(document.key)}
                aria-current={selectedKey === document.key ? 'page' : undefined}
              >
                <span>{document.shortTitle}</span>
                <small>v{document.version}{document.requiredAcceptance ? ' · required' : ''}</small>
              </button>
            ))}
          </nav>

          <article className="legal-document" key={selected.key}>
            <header className="legal-document-header">
              <div>
                <span>{selected.requiredAcceptance ? 'Required policy' : 'Safety guidance'}</span>
                <h3>{selected.title}</h3>
                <p>{selected.summary}</p>
              </div>
              <dl>
                <div><dt>Version</dt><dd>{selected.version}</dd></div>
                <div><dt>Effective</dt><dd>{LEGAL_EFFECTIVE_DATE_LABEL}</dd></div>
              </dl>
            </header>

            <div className="legal-document-content">
              {selected.sections.map((section, index) => (
                <section key={`${selected.key}-${index}`}>
                  <h4>{section.heading}</h4>
                  {section.paragraphs?.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
                  {section.bullets && (
                    <ul>
                      {section.bullets.map((bullet, bulletIndex) => <li key={bulletIndex}>{bullet}</li>)}
                    </ul>
                  )}
                  {section.callout && <aside>{section.callout}</aside>}
                </section>
              ))}
            </div>

            <footer className="legal-document-footer">
              <p>Questions about these policies can be sent through Project PenPal Help and private support.</p>
              <button className="secondary" type="button" onClick={() => setOpen(false)}>Done</button>
            </footer>
          </article>
        </div>
      </section>
    </div>
  )
}
