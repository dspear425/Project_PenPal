export type HelpContext =
  | 'dashboard'
  | 'profile'
  | 'discover'
  | 'connections'
  | 'correspondence'
  | 'snail-mail'
  | 'photos'
  | 'settings'
  | 'restricted'
  | 'admin'

export type HelpSection = {
  heading?: string
  paragraphs?: string[]
  bullets?: string[]
  note?: string
}

export type HelpArticle = {
  id: string
  title: string
  category: string
  summary: string
  contexts: HelpContext[]
  keywords: string[]
  sections: HelpSection[]
}

export const helpCategoryLabels: Record<string, string> = {
  getting_started: 'Getting started',
  profiles: 'Profiles & photos',
  matching: 'Discover & matching',
  connections: 'Requests & connections',
  letters: 'Digital letters',
  snail_mail: 'Snail mail',
  safety: 'Privacy & safety',
  account: 'Account & security',
  moderation: 'Moderation & support',
  staff: 'Staff tools',
}

export const helpArticles: HelpArticle[] = [
  {
    id: 'build-profile',
    title: 'Build a useful pen-pal profile',
    category: 'getting_started',
    summary: 'What to add to your profile and what other members can see.',
    contexts: ['profile', 'dashboard'],
    keywords: ['profile', 'about me', 'interests', 'language', 'country', 'birth year', 'goals'],
    sections: [
      { paragraphs: ['Your profile is designed to help people decide whether they would enjoy corresponding with you. A complete profile gives the matching system more useful information and gives potential pen pals something meaningful to respond to.'] },
      { heading: 'What helps most', bullets: ['Use a display name you are comfortable sharing.', 'Write an About Me that gives people several conversation starters.', 'Choose at least three genuine interests.', 'Select the friendship goals and writing rhythm that actually fit you.', 'Use a broad region or nearby metro rather than an exact home location.'] },
      { note: 'Your email address, private surname, member code, and mailing address are not part of your public profile.' },
    ],
  },
  {
    id: 'correspondence-format',
    title: 'Digital letters, snail mail, or both?',
    category: 'getting_started',
    summary: 'Choose how you would like to correspond with future pen pals.',
    contexts: ['profile', 'snail-mail'],
    keywords: ['correspondence format', 'digital', 'snail mail', 'physical letters', 'handwritten'],
    sections: [
      { bullets: ['Digital letters only keeps all correspondence inside Project PenPal.', 'Digital + snail mail means you are open to both in-app and physical letters.', 'Snail mail preferred tells matches that handwritten mail is your preferred format, while the app can still be used to connect and establish trust.'] },
      { paragraphs: ['Choosing a snail-mail option never publishes your address. Physical addresses use a separate, private consent process after two people become established pen pals.'] },
    ],
  },
  {
    id: 'match-percentage',
    title: 'How compatibility matching works',
    category: 'matching',
    summary: 'Understand the match percentage and the reasons shown in Discover.',
    contexts: ['discover'],
    keywords: ['match', 'percentage', 'compatibility', 'score', 'discover', 'algorithm'],
    sections: [
      { paragraphs: ['The match percentage is a compatibility guide, not a prediction that two people will definitely become friends.'] },
      { heading: 'What contributes to the score', bullets: ['Shared interests', 'Compatible communication style', 'Shared friendship goals', 'Similar reply rhythm', 'Location preference', 'Shared language'] },
      { paragraphs: ['Snail-mail compatibility is shown as an additional reason when relevant, but it does not currently change the 100-point score. Read the whole profile before deciding whether to connect.'] },
    ],
  },
  {
    id: 'discover-availability',
    title: 'Who appears in Discover?',
    category: 'matching',
    summary: 'Why a member may appear, disappear, or stop accepting requests.',
    contexts: ['discover', 'settings'],
    keywords: ['discoverable', 'availability', 'accepting', 'capacity', 'hide profile'],
    sections: [
      { paragraphs: ['Discover normally shows completed, active profiles that are discoverable and currently accepting new pen pals. Members can hide themselves from Discover or stop accepting requests without affecting existing pen pals.'] },
      { note: 'A pending request can remain reviewable even if the other member later turns off general Discover visibility.' },
    ],
  },
  {
    id: 'profile-photos',
    title: 'Profile photos and privacy',
    category: 'profiles',
    summary: 'Upload, crop, replace, hide, or limit who can see your photo.',
    contexts: ['photos', 'profile', 'settings', 'discover'],
    keywords: ['photo', 'avatar', 'crop', 'image', 'visibility', 'hidden', 'pen pals only'],
    sections: [
      { bullets: ['Show in Discover lets eligible members see the photo while browsing.', 'Pen pals only shows initials to strangers and the photo to established pen pals.', 'Hidden keeps the stored photo visible only to you and authorized moderation staff.'] },
      { paragraphs: ['The in-app cropper creates a fresh 512×512 JPEG before upload, which removes the original image metadata such as embedded GPS/EXIF information.'] },
      { note: 'A profile photo does not mean Project PenPal has verified that member’s identity.' },
    ],
  },
  {
    id: 'report-photo',
    title: 'Report an inappropriate profile photo',
    category: 'profiles',
    summary: 'How photo reports preserve the image that was actually reported.',
    contexts: ['photos', 'discover', 'connections'],
    keywords: ['report photo', 'inappropriate image', 'nudity', 'impersonation', 'hate'],
    sections: [
      { paragraphs: ['Open Safety for the member and choose the profile-photo report option when available. Select the closest reason and add context that will help moderation review it.'] },
      { paragraphs: ['Project PenPal records the exact photo version that was reported. If the member replaces it before review, moderators can still review the historical evidence without accidentally removing the newer photo.'] },
    ],
  },
  {
    id: 'incoming-requests',
    title: 'Review an incoming pen-pal request',
    category: 'connections',
    summary: 'View the person’s profile before accepting or declining.',
    contexts: ['connections'],
    keywords: ['incoming request', 'accept', 'decline', 'view profile', 'queue'],
    sections: [
      { paragraphs: ['Open Pen pals & requests and use View profile on the incoming request. You can review their About Me, interests, friendship goals, writing style, location information, languages, and any photo their privacy setting allows you to see.'] },
      { bullets: ['Accept creates an active pen-pal relationship.', 'Decline closes the request.', 'Safety gives you reporting and blocking options when needed.'] },
    ],
  },
  {
    id: 'pause-end-reconnect',
    title: 'Pause, end, or reconnect with a pen pal',
    category: 'connections',
    summary: 'Understand relationship controls and what happens to old letters.',
    contexts: ['connections', 'correspondence'],
    keywords: ['pause', 'resume', 'end', 'reconnect', 'past pen pal', 'history'],
    sections: [
      { bullets: ['Pause temporarily stops new letters. Existing correspondence remains readable, and only the person who paused can resume it.', 'End closes the relationship and preserves the existing correspondence as read-only history.', 'Reconnect sends a fresh pen-pal request while keeping the old correspondence in a separate historical period.'] },
    ],
  },
  {
    id: 'blocking',
    title: 'What happens when you block someone?',
    category: 'safety',
    summary: 'Blocking stops normal contact and hides relationship access.',
    contexts: ['connections', 'correspondence', 'settings'],
    keywords: ['block', 'blocked', 'unblock', 'safety', 'contact'],
    sections: [
      { paragraphs: ['Blocking prevents normal contact between the two accounts and removes the blocked member from normal discovery/contact flows. Open relationships are closed and protected content is no longer available through that connection while the block exists.'] },
      { paragraphs: ['You can review and remove your own blocks in Settings. Only unblock someone if you are comfortable restoring the possibility of future contact.'] },
    ],
  },
  {
    id: 'writing-letters',
    title: 'Write and send a digital letter',
    category: 'letters',
    summary: 'Compose long-form correspondence without instant-message pressure.',
    contexts: ['correspondence'],
    keywords: ['write letter', 'subject', 'send', 'word count', 'reply'],
    sections: [
      { paragraphs: ['Open an active pen pal and choose Write a letter. The subject is optional and the body can contain up to 12,000 characters. Letters appear chronologically in the shared correspondence history.'] },
      { note: 'Project PenPal is intentionally built around slower correspondence. There is no expectation that a letter needs an immediate reply.' },
    ],
  },
  {
    id: 'letter-drafts',
    title: 'How letter drafts are saved',
    category: 'letters',
    summary: 'Understand automatic local draft saving before you send.',
    contexts: ['correspondence'],
    keywords: ['draft', 'autosave', 'saved', 'device', 'letter'],
    sections: [
      { paragraphs: ['An unfinished digital letter is automatically saved in the browser on the device you are currently using. The draft is removed after the letter sends successfully.'] },
      { note: 'Drafts are currently device/browser-local. A draft started on one device will not automatically appear on another device.' },
    ],
  },
  {
    id: 'read-receipts',
    title: 'Sent, received, and read letters',
    category: 'letters',
    summary: 'What the correspondence status indicators mean.',
    contexts: ['correspondence', 'connections'],
    keywords: ['read receipt', 'sent', 'received', 'unread', 'notification'],
    sections: [
      { paragraphs: ['A sent letter is marked Read after the recipient opens that correspondence and Project PenPal records the read time. Incoming unread letters also contribute to the notification badge on Pen pals & requests.'] },
    ],
  },
  {
    id: 'snail-mail-overview',
    title: 'How snail-mail address exchange works',
    category: 'snail_mail',
    summary: 'Move from online correspondence to physical letters using mutual consent.',
    contexts: ['snail-mail', 'correspondence', 'profile'],
    keywords: ['snail mail', 'address exchange', 'mailing address', 'physical', 'handwritten'],
    sections: [
      { heading: 'The consent flow', bullets: ['Both members first indicate they are open to snail mail.', 'One active pen pal requests an address exchange.', 'The other person accepts or declines.', 'Accepting shares no address.', 'Each person saves their own address privately.', 'Each person separately chooses Share with [pen pal].'] },
      { note: 'You never have to reveal an address just because you accepted an exchange request or because the other person shared theirs.' },
    ],
  },
  {
    id: 'snail-mail-address-privacy',
    title: 'Protect your privacy when sharing a mailing address',
    category: 'snail_mail',
    summary: 'PO boxes, private mailboxes, revoking access, and address snapshots.',
    contexts: ['snail-mail', 'correspondence'],
    keywords: ['address privacy', 'po box', 'private mailbox', 'revoke', 'snapshot', 'home address'],
    sections: [
      { paragraphs: ['A PO box, commercial/private mailbox, or mail-forwarding address can reduce how much home-location information you disclose. Use whichever address you are genuinely comfortable giving another person.'] },
      { paragraphs: ['When you share an address, Project PenPal stores a per-relationship snapshot. Editing your private vault later does not silently give the new address to people who had the old one. Revoke and share again when you intentionally want to update a pen pal.'] },
      { note: 'Revoking access stops Project PenPal from displaying the address. It cannot erase a copy the recipient already wrote down, printed, photographed, or saved elsewhere.' },
    ],
  },
  {
    id: 'snail-mail-international',
    title: 'International snail mail',
    category: 'snail_mail',
    summary: 'When two pen pals in different countries can exchange addresses.',
    contexts: ['snail-mail', 'profile'],
    keywords: ['international mail', 'different countries', 'overseas', 'postage'],
    sections: [
      { paragraphs: ['When pen pals are in different countries, both people must opt into international snail mail before Project PenPal allows an address exchange to begin.'] },
      { note: 'Project PenPal does not calculate postage, customs requirements, prohibited-mail rules, or delivery estimates. Check the relevant postal services before mailing internationally.' },
    ],
  },
  {
    id: 'report-member',
    title: 'Report a member or safety concern',
    category: 'safety',
    summary: 'Use Safety when behavior or content needs moderation review.',
    contexts: ['discover', 'connections', 'correspondence'],
    keywords: ['report', 'safety', 'harassment', 'spam', 'moderation'],
    sections: [
      { paragraphs: ['Use the Safety option attached to the relevant member or relationship. Choose the report reason that best fits and explain what happened. Reports enter the private moderation queue for staff review.'] },
      { paragraphs: ['If you need to stop contact immediately, blocking is separate from reporting. You can use one or both depending on the situation.'] },
    ],
  },
  {
    id: 'profile-privacy',
    title: 'Control profile visibility and availability',
    category: 'safety',
    summary: 'Hide from Discover, stop new requests, or adjust pen-pal capacity.',
    contexts: ['settings', 'profile'],
    keywords: ['privacy', 'discoverable', 'accepting requests', 'capacity', 'settings'],
    sections: [
      { bullets: ['Show me in Discover controls whether new matches can normally browse your profile.', 'Accept new pen-pal requests controls whether new requests are allowed.', 'Pen-pal capacity limits how many active relationships you want at one time.'] },
      { paragraphs: ['Turning these settings off does not delete existing correspondence or automatically end current pen-pal relationships.'] },
    ],
  },
  {
    id: 'data-export-delete',
    title: 'Export or delete your account data',
    category: 'account',
    summary: 'Download your own Project PenPal data or permanently delete a member account.',
    contexts: ['settings'],
    keywords: ['export data', 'delete account', 'privacy', 'json', 'mailing address'],
    sections: [
      { paragraphs: ['Settings → Your data can create a JSON export containing information the member is entitled to receive about their own account, including their own private mailing-address information and their own snail-mail exchange/share history. It does not export another member’s mailing address.'] },
      { paragraphs: ['Permanent account deletion requires explicit confirmation. Staff-role accounts are protected from self-deletion until the staff role is removed or transferred appropriately.'] },
    ],
  },
  {
    id: 'password-email',
    title: 'Change your email or password',
    category: 'account',
    summary: 'Account-security controls and password recovery.',
    contexts: ['settings'],
    keywords: ['password', 'email', 'reset', 'security', 'login'],
    sections: [
      { paragraphs: ['Open Settings → Security to request an email change, set a new password while signed in, or send yourself a password-reset email. Email changes may require verification before becoming active.'] },
    ],
  },
  {
    id: 'moderation-notices',
    title: 'Account notices, warnings, suspensions, and bans',
    category: 'moderation',
    summary: 'Where moderation notices appear and how to contact the team.',
    contexts: ['restricted', 'dashboard'],
    keywords: ['warning', 'suspension', 'ban', 'notice', 'appeal', 'moderation'],
    sections: [
      { paragraphs: ['Moderation actions that affect your account can create an Account Notice explaining the action. Notices remain available even when normal Project PenPal features are restricted.'] },
      { paragraphs: ['If you believe an action needs review, open Help and contact the moderation team. Choose Moderation appeal when that category is available and explain the specific decision you are asking staff to reconsider.'] },
    ],
  },
  {
    id: 'support-conversations',
    title: 'Contact Project PenPal support',
    category: 'moderation',
    summary: 'Start a private support conversation and follow moderator replies.',
    contexts: ['dashboard', 'settings', 'restricted'],
    keywords: ['support', 'contact', 'help', 'message moderators', 'member code'],
    sections: [
      { paragraphs: ['If a Help Center article does not solve the problem, choose Contact support. Support conversations are private between the member and authorized moderation staff.'] },
      { paragraphs: ['Your member code is shown in the support area so you can copy it when staff need a reliable way to locate your account. Unread moderator replies appear on the Help launcher badge.'] },
    ],
  },
  {
    id: 'bug-report',
    title: 'Report a technical problem',
    category: 'moderation',
    summary: 'Send a useful bug report without needing to diagnose the cause yourself.',
    contexts: ['dashboard', 'profile', 'discover', 'connections', 'correspondence', 'snail-mail', 'photos', 'settings', 'admin'],
    keywords: ['bug', 'error', 'broken', 'technical', 'issue', 'problem'],
    sections: [
      { heading: 'Include what you can', bullets: ['What you were trying to do', 'What you expected to happen', 'What actually happened', 'Any error text you saw', 'Whether refreshing or trying again changed anything'] },
      { paragraphs: ['The Report a bug shortcut automatically adds the current Project PenPal area to the support message so staff have useful context. Do not include passwords, authentication tokens, or another person’s private mailing address.'] },
    ],
  },
  {
    id: 'staff-reports',
    title: 'Staff: reviewing moderation reports',
    category: 'staff',
    summary: 'Use report evidence, notes, and account actions proportionately.',
    contexts: ['admin'],
    keywords: ['admin', 'moderator', 'report queue', 'case', 'evidence', 'staff'],
    sections: [
      { paragraphs: ['Start with the report context and preserved evidence. Use internal notes for moderation reasoning, and use the member case file when broader account history is genuinely relevant.'] },
      { note: 'Correspondence review is intentionally audited and should be opened only for a documented moderation reason.' },
    ],
  },
  {
    id: 'staff-roles',
    title: 'Staff: Owner, Admin, and Moderator roles',
    category: 'staff',
    summary: 'Understand staff permission boundaries and protected role changes.',
    contexts: ['admin'],
    keywords: ['owner', 'admin', 'moderator', 'role', 'permissions', 'team'],
    sections: [
      { bullets: ['Moderator: review cases/support/activity, warn members, and issue temporary suspensions.', 'Admin: moderator capabilities plus permanent bans/restores and moderator management.', 'Owner: full staff management and protected administrative access.'] },
      { paragraphs: ['Admin Team records role changes in an audit history. Database rules enforce role boundaries even if someone attempts to bypass the visible controls.'] },
    ],
  },
  {
    id: 'staff-photo-moderation',
    title: 'Staff: profile-photo moderation',
    category: 'staff',
    summary: 'Review current photos and preserved reported-image evidence safely.',
    contexts: ['admin'],
    keywords: ['photo moderation', 'remove photo', 'reported image', 'historical evidence'],
    sections: [
      { paragraphs: ['A case file can show a member’s current photo regardless of member-facing visibility. A profile-photo report can preserve the exact reported upload as evidence even if the member later changes their current photo.'] },
      { note: 'If preserved evidence is no longer the current photo, do not remove a newer unrelated photo based solely on the old report.' },
    ],
  },
]

export function articlesForContext(context: HelpContext) {
  return helpArticles.filter((article) => article.contexts.includes(context))
}

export function searchHelpArticles(query: string) {
  const clean = query.trim().toLowerCase()
  if (!clean) return helpArticles
  const terms = clean.split(/\s+/).filter(Boolean)

  return helpArticles
    .map((article) => {
      const title = article.title.toLowerCase()
      const summary = article.summary.toLowerCase()
      const keywords = article.keywords.join(' ').toLowerCase()
      const sectionText = article.sections.flatMap((section) => [
        section.heading ?? '',
        ...(section.paragraphs ?? []),
        ...(section.bullets ?? []),
        section.note ?? '',
      ]).join(' ').toLowerCase()
      let score = 0
      for (const term of terms) {
        if (title.includes(term)) score += 7
        if (keywords.includes(term)) score += 5
        if (summary.includes(term)) score += 3
        if (sectionText.includes(term)) score += 1
      }
      return { article, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title))
    .map((item) => item.article)
}

export function helpContextLabel(context: HelpContext) {
  const labels: Record<HelpContext, string> = {
    dashboard: 'Dashboard',
    profile: 'Edit profile',
    discover: 'Discover',
    connections: 'Pen pals & requests',
    correspondence: 'Correspondence',
    'snail-mail': 'Snail mail',
    photos: 'Profile photo',
    settings: 'Settings',
    restricted: 'Account status',
    admin: 'Moderation dashboard',
  }
  return labels[context]
}
