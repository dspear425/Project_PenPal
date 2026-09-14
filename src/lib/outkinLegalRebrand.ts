import { legalDocuments } from './legalDocuments'

const OUTKIN_LEGAL_VERSION = '1.1'
const OUTKIN_LEGAL_EFFECTIVE_DATE = '2026-09-13'

function rebrand(value: string) {
  return value
    .replaceAll('Project PenPal', 'OutKin')
    .replaceAll('current beta implementation', 'current public early-access implementation')
    .replaceAll('before general public launch', 'as the public service evolves')
}

for (const document of legalDocuments) {
  document.version = OUTKIN_LEGAL_VERSION
  document.effectiveDate = OUTKIN_LEGAL_EFFECTIVE_DATE
  document.summary = rebrand(document.summary)

  for (const section of document.sections) {
    section.heading = rebrand(section.heading)
    if (section.paragraphs) section.paragraphs = section.paragraphs.map(rebrand)
    if (section.bullets) section.bullets = section.bullets.map(rebrand)
    if (section.callout) section.callout = rebrand(section.callout)
  }
}
