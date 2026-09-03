import { helpArticles, helpCategoryLabels } from './helpContent'

helpCategoryLabels.legal = 'Rules & policies'

if (!helpArticles.some((article) => article.id === 'legal-policy-center')) {
  helpArticles.push({
    id: 'legal-policy-center',
    title: 'Terms, privacy, and community rules',
    category: 'legal',
    summary: 'Where to read Project PenPal policies and how versioned acknowledgements work.',
    contexts: ['dashboard', 'profile', 'discover', 'connections', 'correspondence', 'snail-mail', 'photos', 'settings', 'restricted', 'admin'],
    keywords: ['terms', 'privacy policy', 'community guidelines', 'legal', 'policy', 'rules', 'acceptance', 'version'],
    sections: [
      {
        paragraphs: [
          'Project PenPal keeps its Terms of Service, Privacy Policy, Community Guidelines, Member Safety Guidelines, Profile Photo Guidelines, and Snail Mail & Address-Sharing Guidelines together in the Legal & safety center.',
        ],
      },
      {
        heading: 'Required policy versions',
        paragraphs: [
          'Terms, Privacy, and Community Guidelines are versioned. If a current required version has not been acknowledged by your account, Project PenPal will show a policy-review screen before normal use. Your acceptance record stores the document, version, server time, and acceptance source.',
        ],
      },
      {
        heading: 'Open the policies',
        paragraphs: [
          'Open the Project PenPal Menu and choose Legal & safety. Signed-out visitors can also use the policy links at the bottom of the welcome, sign-in, and signup screens.',
        ],
      },
      {
        note: 'Safety, Profile Photo, and Snail Mail guidelines remain available for reference without requiring a new account-wide acknowledgement every time explanatory guidance is refined.',
      },
    ],
  })
}
