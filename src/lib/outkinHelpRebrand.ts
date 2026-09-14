import { helpArticles } from './helpContent'

function rebrand(value: string) {
  return value
    .replaceAll('Project PenPal', 'OutKin')
    .replaceAll('current beta', 'current public early access')
    .replaceAll('beta implementation', 'public early-access implementation')
}

for (const article of helpArticles) {
  article.title = rebrand(article.title)
  article.summary = rebrand(article.summary)
  article.keywords = article.keywords.map(rebrand)

  for (const section of article.sections) {
    if (section.heading) section.heading = rebrand(section.heading)
    if (section.paragraphs) section.paragraphs = section.paragraphs.map(rebrand)
    if (section.bullets) section.bullets = section.bullets.map(rebrand)
    if (section.note) section.note = rebrand(section.note)
  }
}
