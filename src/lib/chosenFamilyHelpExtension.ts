import { helpArticles } from './helpContent'

if (!helpArticles.some((article) => article.id === 'chosen-family-friendship')) {
  helpArticles.push({
    id: 'chosen-family-friendship',
    title: 'Chosen family and supportive friendship',
    category: 'matching',
    summary: 'Use chosen-family goals without having to disclose private family history or trauma.',
    contexts: ['dashboard', 'profile', 'discover', 'connections'],
    keywords: ['chosen family', 'supportive friendship', 'care', 'support', 'cards', 'holidays', 'milestones', 'family'],
    sections: [
      {
        paragraphs: [
          'Chosen family on Project PenPal means adult platonic friendships that may become deeply caring and family-like over time. Selecting it does not assign anyone a parent, child, sibling, guardian, counselor, or caregiver role.',
          'You do not need to explain estrangement, rejection, abuse, trauma, identity, or any other private reason for wanting this kind of friendship. Share only what you are comfortable having potential pen pals read.',
        ],
      },
      {
        heading: 'Care preferences',
        bullets: [
          'How I like to show care describes things that feel natural for you to offer in friendship.',
          'What feels meaningful to me describes the kinds of friendship gestures you appreciate.',
          'Examples include regular check-ins, encouragement, listening, birthday or holiday cards, celebrating milestones, sharing traditions, thoughtful letters, and long-term consistency.',
        ],
      },
      {
        heading: 'How matching uses them',
        paragraphs: [
          'Chosen-family and supportive-friendship selections participate in the existing friendship-goal portion of the compatibility score. Care-style overlap is shown as an additional compatibility reason and does not currently add extra points to the 100-point score.',
        ],
      },
      {
        note: 'A compatible profile is only an introduction. Trust, closeness, and family-like relationships should develop gradually and mutually over time.',
      },
    ],
  })
}

if (!helpArticles.some((article) => article.id === 'chosen-family-safety')) {
  helpArticles.push({
    id: 'chosen-family-safety',
    title: 'Keep chosen-family connections safe and friendship-first',
    category: 'safety',
    summary: 'Boundaries for support, money, housing, addresses, and relationships that become emotionally close.',
    contexts: ['profile', 'discover', 'connections', 'correspondence', 'snail-mail'],
    keywords: ['chosen family safety', 'money', 'housing', 'boundaries', 'support', 'address', 'guardian', 'therapy'],
    sections: [
      {
        paragraphs: [
          'Chosen-family and supportive-friendship preferences describe social connection. They are not agreements to provide therapy, crisis intervention, money, loans, housing, employment, transportation, legal guardianship, medical care, or other professional or financial support.',
        ],
      },
      {
        heading: 'Let trust grow before increasing access',
        bullets: [
          'Keep early conversations inside Project PenPal while you get to know someone.',
          'Do not feel pressured to disclose trauma, financial circumstances, exact location, workplace, or other sensitive details.',
          'Use the separate snail-mail consent flow only when you are comfortable sharing a mailing address; a PO box or private mailbox can reduce home-location exposure.',
          'Be cautious if someone quickly asks for money, housing, account access, intimate material, secrecy, or major personal commitments.',
          'Use Block and Report when behavior becomes manipulative, threatening, exploitative, hateful, or otherwise unsafe.',
        ],
      },
      {
        note: 'Project PenPal is a friendship platform, not an emergency or crisis service. If you are in immediate danger, use appropriate local emergency or trusted in-person support resources.',
      },
    ],
  })
}
