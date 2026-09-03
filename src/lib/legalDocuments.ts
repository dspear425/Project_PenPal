export type LegalDocumentKey =
  | 'terms'
  | 'privacy'
  | 'community'
  | 'safety'
  | 'profile_photo'
  | 'snail_mail'

export type LegalSection = {
  heading: string
  paragraphs?: string[]
  bullets?: string[]
  callout?: string
}

export type LegalDocument = {
  key: LegalDocumentKey
  title: string
  shortTitle: string
  version: string
  effectiveDate: string
  requiredAcceptance: boolean
  summary: string
  sections: LegalSection[]
}

export const LEGAL_EFFECTIVE_DATE = '2026-09-02'
export const LEGAL_EFFECTIVE_DATE_LABEL = 'September 2, 2026'

export const legalDocuments: LegalDocument[] = [
  {
    key: 'terms',
    title: 'Terms of Service',
    shortTitle: 'Terms',
    version: '1.0',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    requiredAcceptance: true,
    summary: 'The rules for creating an account and using Project PenPal as a friendship-first correspondence service.',
    sections: [
      {
        heading: '1. Agreement and eligibility',
        paragraphs: [
          'These Terms of Service govern your use of Project PenPal. By creating or using an account, you agree to these Terms and the Community Guidelines. If you do not agree, do not use the service.',
          'Project PenPal is currently for adults age 18 and older. You must be legally able to enter into this agreement where you live. Do not create an account for another person without authorization.',
        ],
      },
      {
        heading: '2. What Project PenPal is for',
        paragraphs: [
          'Project PenPal is a friendship-first service for platonic pen-pal relationships and meaningful one-to-one correspondence. It supports digital letters and, when both members choose, a consent-based transition to physical mail.',
          'Project PenPal is not a dating, hookup, sexual-services, employment, financial-services, marketplace, or emergency-response platform. Compatibility scores and profile information are aids for discovery, not guarantees about another member, their identity, or the quality or safety of a future friendship.',
        ],
      },
      {
        heading: '3. Your account',
        bullets: [
          'Provide accurate information where the app requires it and keep your login credentials secure.',
          'Use one account per person unless Project PenPal explicitly authorizes otherwise.',
          'Do not sell, transfer, rent, or share access to your account.',
          'Tell Project PenPal support promptly if you believe your account has been compromised.',
          'You are responsible for activity performed through your account unless caused by a Project PenPal security failure.',
        ],
      },
      {
        heading: '4. Member conduct',
        paragraphs: [
          'You must follow the Community Guidelines and all applicable laws. You may not use Project PenPal to harass, threaten, exploit, deceive, impersonate, stalk, dox, spam, scam, solicit sexual activity, seek romantic or hookup partners, distribute illegal content, or evade a block or moderation action.',
          'Do not use another member’s profile, letters, photos, mailing address, or other personal information outside the purpose for which they shared it. A person sharing information with you does not give you permission to publish, sell, redistribute, or weaponize it.',
        ],
      },
      {
        heading: '5. Your content and correspondence',
        paragraphs: [
          'You keep ownership of content you create, including profile text, photos, and letters. You give Project PenPal a limited, non-exclusive license to host, store, process, display, transmit, resize, and otherwise use that content only as reasonably necessary to operate, secure, moderate, improve, and support the service.',
          'You must have the rights and permissions needed for anything you upload or send. You are responsible for what you choose to disclose to another member.',
          'Private correspondence is not public content. Authorized moderation staff may review relevant correspondence when reasonably necessary to investigate a report, safety issue, abuse concern, or support request. Project PenPal is designed to audit such moderation access where supported by the moderation tools.',
        ],
      },
      {
        heading: '6. Photos, privacy, and identity',
        paragraphs: [
          'Profile photos are optional and are not identity verification. Project PenPal does not currently perform government-ID verification, criminal background checks, or guarantee that profile claims are true.',
          'Use the privacy controls that fit your comfort level. Never assume that information another person sees can be technically erased from copies they make outside the service.',
        ],
      },
      {
        heading: '7. Snail mail and off-platform contact',
        paragraphs: [
          'Physical-mail address exchange is optional. Accepting an address-exchange request does not automatically share an address; each member must separately choose to share. You remain responsible for deciding whether, when, and which address to provide.',
          'Project PenPal cannot control physical mail after an address has been disclosed. Revoking access, ending a pen-pal relationship, or blocking a member stops normal in-app access but cannot retrieve an address the recipient already copied or remembered.',
        ],
        callout: 'Consider a PO box, commercial mailbox, or mail-forwarding address when you do not want to disclose your home address.',
      },
      {
        heading: '8. Moderation and account actions',
        paragraphs: [
          'Project PenPal may investigate reports and take proportionate action including warnings, feature restrictions, temporary suspensions, content or photo removal, or account bans. Serious or repeated violations may result in immediate restriction without a prior warning.',
          'We may preserve limited records reasonably necessary for safety, abuse prevention, audit integrity, dispute handling, or legal obligations even when other account data is removed, subject to applicable law and the Privacy Policy.',
          'Where the app provides an appeal or support channel, you may use it to ask for review of an account action. An appeal does not guarantee reversal.',
        ],
      },
      {
        heading: '9. Service availability and changes',
        paragraphs: [
          'Project PenPal is under active development. Features may change, be interrupted, be limited, or be discontinued. We do not promise uninterrupted availability, delivery of any particular letter or notification, or permanent preservation of optional features.',
          'We may update these Terms when the service, law, or risk environment changes. If a material update requires renewed agreement, the app may ask you to accept a new version before continuing normal use.',
        ],
      },
      {
        heading: '10. Third-party services',
        paragraphs: [
          'Project PenPal relies on third-party infrastructure providers for functions such as hosting, authentication, storage, security, and communications. Their services may have their own terms and availability limitations. Project PenPal is not responsible for independent third-party services you choose to use outside the app, including postal carriers or mailbox providers.',
        ],
      },
      {
        heading: '11. Disclaimers',
        paragraphs: [
          'To the extent permitted by law, Project PenPal is provided on an “as is” and “as available” basis. We do not warrant that every member is who they claim to be, that every friendship will be safe or successful, or that the service will be error-free or uninterrupted.',
          'Nothing in these Terms excludes rights or warranties that cannot legally be excluded in your jurisdiction.',
        ],
      },
      {
        heading: '12. Limitation of liability',
        paragraphs: [
          'To the extent permitted by applicable law, Project PenPal and its operator will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages arising from use of the service or interactions between members. Any limitation applies only to the extent the law allows and does not limit liability that legally cannot be limited.',
        ],
      },
      {
        heading: '13. Governing law',
        paragraphs: [
          'To the extent permitted by law, these Terms are governed by the laws of the State of Alabama, United States, without regard to conflict-of-law principles. Mandatory consumer protections in your home jurisdiction continue to apply where the law requires them.',
        ],
      },
      {
        heading: '14. Contact',
        paragraphs: [
          'For account, privacy, moderation, or Terms questions, use the Help Center and private support conversation tools inside Project PenPal. Public contact information can be added here before general public launch if the service establishes a separate business or legal contact address.',
        ],
      },
    ],
  },
  {
    key: 'privacy',
    title: 'Privacy Policy',
    shortTitle: 'Privacy',
    version: '1.0',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    requiredAcceptance: true,
    summary: 'What Project PenPal collects, why it uses it, who can see it, and the controls members have over their information.',
    sections: [
      {
        heading: '1. Scope',
        paragraphs: [
          'This Privacy Policy explains how Project PenPal handles personal information when you create an account, build a profile, discover pen pals, exchange letters, use safety tools, contact support, or choose to exchange physical mailing addresses.',
          'Project PenPal is currently an 18+ service. It is not intended for children or minors.',
        ],
      },
      {
        heading: '2. Information you provide',
        bullets: [
          'Account information, such as your email address and authentication credentials handled by the authentication service.',
          'Profile information, including display name, birth year, country, optional region or nearby city, languages, interests, friendship goals, communication preferences, and About Me text.',
          'Private account details, including an optional private last name and an automatically generated member code.',
          'Optional profile photos and the visibility setting you choose for them.',
          'Pen-pal requests, relationship status, digital letters, read status, and correspondence history.',
          'Optional snail-mail preferences, private mailing-address vault information, address-exchange requests, and per-relationship address-share snapshots.',
          'Reports, blocks, moderation notices, appeals, support threads, and information you provide when contacting support.',
          'Notification, privacy, discovery, and account settings.',
        ],
      },
      {
        heading: '3. Information stored on your device',
        paragraphs: [
          'Project PenPal currently uses browser storage for limited app state, authentication/session operation, and local drafts. Unsent letter drafts and unfinished profile edits may be stored locally in the browser on the device where you created them. Those local drafts are not the same as a sent letter or saved server-side profile.',
          'The Progressive Web App may cache the public application shell and static assets so the interface can reopen more gracefully. The PWA service worker is intentionally designed not to cache Supabase or other third-party API requests containing account data.',
        ],
      },
      {
        heading: '4. How we use information',
        bullets: [
          'Create, authenticate, secure, and maintain your account.',
          'Show the profile information you choose to eligible members.',
          'Calculate compatibility and provide Discover results.',
          'Deliver pen-pal requests and correspondence and maintain relationship history.',
          'Provide optional profile-photo and snail-mail features according to your privacy choices.',
          'Detect spam, abuse, suspicious activity, rate-limit violations, and attempts to evade safety controls.',
          'Investigate reports, provide moderation, enforce rules, and maintain audit records.',
          'Respond to support requests and appeals.',
          'Provide account exports, deletion tools, notices, and other member-requested functions.',
          'Maintain, debug, improve, and protect Project PenPal.',
        ],
      },
      {
        heading: '5. What other members can see',
        paragraphs: [
          'Other members can see only the profile information and content allowed by the feature and your current privacy settings. Your email address, private surname, member code, and private mailing-address vault are not part of your public member profile.',
          'Profile-photo visibility can be limited. A mailing address is disclosed to a specific established pen pal only after the applicable consent flow and your separate decision to share it. The recipient may then be able to copy that information outside Project PenPal.',
        ],
      },
      {
        heading: '6. Moderation access',
        paragraphs: [
          'Authorized moderation staff can access information needed to handle reports, account safety, support, abuse prevention, and enforcement. Current moderation tools may provide audited access to relevant correspondence when a moderator supplies an access reason.',
          'A profile photo reported for a safety violation may be preserved as evidence of the exact image that was reported even if the member later replaces or hides the current photo. Mailing addresses are not exposed in normal moderator search or case-file tools.',
        ],
      },
      {
        heading: '7. Service providers and disclosure',
        paragraphs: [
          'Project PenPal uses infrastructure and service providers to host data, authenticate users, store files, secure the service, and support app operation. Those providers process information on Project PenPal’s behalf according to their role and applicable agreements.',
          'We may disclose information when reasonably necessary to comply with law, legal process, protect a person from serious harm, investigate fraud or abuse, defend legal rights, or protect the security and integrity of Project PenPal.',
          'Project PenPal does not sell member personal information and does not provide member conversations or mailing addresses to advertisers for targeted advertising.',
        ],
      },
      {
        heading: '8. Mailing addresses',
        paragraphs: [
          'Mailing addresses are treated as higher-sensitivity information and are stored separately from ordinary public profile fields. Address sharing is relationship-specific and requires explicit member action.',
          'When you share an address with a pen pal, Project PenPal creates a snapshot for that relationship. Updating the address in your private vault does not silently replace previously shared snapshots. Ending the relationship, blocking the member, or revoking sharing removes normal in-app access to the shared address, but cannot erase copies the recipient already made outside the service.',
        ],
      },
      {
        heading: '9. Retention',
        paragraphs: [
          'We retain account information while your account is active and as needed to provide the service. You can use Settings to request a data export and, for ordinary member accounts, delete your account.',
          'Some information may be retained longer when reasonably necessary for security, abuse prevention, moderation audit integrity, dispute resolution, legal compliance, backup recovery, or to prevent a banned account from immediately evading enforcement. Retention will be limited to what is reasonably necessary for those purposes and applicable law.',
        ],
      },
      {
        heading: '10. Security',
        paragraphs: [
          'Project PenPal uses access controls, database row-level security, protected server functions, private storage rules, and other technical safeguards appropriate to the current service. No online service can guarantee absolute security. Protect your password, use a secure device, and report suspected account compromise promptly.',
        ],
      },
      {
        heading: '11. International processing',
        paragraphs: [
          'Project PenPal is designed for international friendships. Depending on where you live and where service providers operate, information may be processed in another country. Applicable privacy rights continue to apply according to law.',
        ],
      },
      {
        heading: '12. Your choices and rights',
        bullets: [
          'Edit profile and visibility information in the app.',
          'Control Discover availability, pen-pal capacity, blocks, photo visibility, and notification preferences.',
          'Choose whether to participate in snail mail and whether to share an address with a specific pen pal.',
          'Revoke an active mailing-address share in the app.',
          'Download the account data available through Settings.',
          'Delete an eligible ordinary member account through Settings.',
          'Contact support with a privacy question or request that cannot be completed through self-service controls.',
        ],
      },
      {
        heading: '13. Legal-policy acceptance records',
        paragraphs: [
          'Project PenPal records the policy document, version, time, and acceptance source when you agree to a required version of the Terms, Privacy Policy acknowledgement, or Community Guidelines. We do not need to store your IP address in the legal-acceptance record for the current beta implementation.',
        ],
      },
      {
        heading: '14. Changes and contact',
        paragraphs: [
          'We may update this Privacy Policy as Project PenPal changes. A material version change may require a new acknowledgement in the app. For privacy questions, use Help → Contact support and choose the privacy category.',
        ],
      },
    ],
  },
  {
    key: 'community',
    title: 'Community Guidelines',
    shortTitle: 'Community',
    version: '1.0',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    requiredAcceptance: true,
    summary: 'The behavior standards that keep Project PenPal focused on respectful, platonic friendship and safe correspondence.',
    sections: [
      {
        heading: '1. Friendship first',
        paragraphs: [
          'Project PenPal exists for genuine platonic friendship. Do not use the service to seek dates, hookups, romantic partners, sexual partners, commercial companionship, or sexual services.',
          'Friendships can naturally evolve in ways a platform cannot predict, but members may not use Project PenPal’s discovery, requests, profiles, or correspondence tools as a dating or sexual-solicitation system.',
        ],
      },
      {
        heading: '2. Respect boundaries',
        bullets: [
          'Accept “no,” a declined request, a pause, an ended friendship, a revoked address share, and a block.',
          'Do not repeatedly contact someone who has asked you to stop.',
          'Do not evade a block, suspension, or other safety control using another account or outside channel.',
          'Do not pressure another member to disclose a photo, legal name, home address, phone number, social account, money, or other private information.',
        ],
      },
      {
        heading: '3. No harassment, hate, or threats',
        paragraphs: [
          'Do not threaten, bully, stalk, intimidate, shame, degrade, or target another person. Hate speech, dehumanizing attacks, extremist recruitment or propaganda, and content that promotes violence against protected or vulnerable groups are not allowed.',
        ],
      },
      {
        heading: '4. No sexual or exploitative content',
        paragraphs: [
          'Do not send or solicit pornography, explicit sexual content, sexualized nudity, sexual services, coercive sexual messages, or non-consensual intimate content. Project PenPal is an adult service, but “18+” does not make explicit sexual use appropriate here.',
        ],
      },
      {
        heading: '5. No scams, spam, or financial exploitation',
        bullets: [
          'Do not ask pen pals for money, gift cards, cryptocurrency, bank credentials, loans, investments, or financial-account access.',
          'Do not promote pyramid schemes, fake charities, fraudulent jobs, investment opportunities, or romance/friendship scams.',
          'Do not mass-send repetitive requests, advertisements, referral links, or promotional content.',
          'Do not use Project PenPal to harvest email addresses, mailing addresses, photos, or other member data.',
        ],
      },
      {
        heading: '6. Be authentic; do not impersonate',
        paragraphs: [
          'Do not pretend to be another real person, organization, moderator, or public figure. Do not fabricate an identity to manipulate, defraud, or endanger another member. Display names and privacy choices are allowed; deceptive impersonation is not.',
        ],
      },
      {
        heading: '7. Protect privacy',
        bullets: [
          'Do not publish or redistribute another member’s private letters without permission.',
          'Do not post, sell, trade, or expose another member’s mailing address, private name, contact details, or identifying information.',
          'Do not threaten to expose private information as leverage.',
          'Do not upload a photo you do not have permission or rights to use.',
        ],
      },
      {
        heading: '8. Illegal and dangerous activity',
        paragraphs: [
          'Do not use Project PenPal to facilitate illegal activity, credible violence, trafficking, exploitation, malicious hacking, distribution of illegal goods, or instructions intended to cause serious harm. Do not use physical mail arranged through Project PenPal to send illegal, dangerous, threatening, or prohibited items.',
        ],
      },
      {
        heading: '9. Adults only',
        paragraphs: [
          'Members must be 18 or older. Do not create an account for a minor, invite a minor to use an adult account, or use Project PenPal to seek contact with minors. Report an account if you reasonably believe the user is under 18.',
        ],
      },
      {
        heading: '10. Use safety tools in good faith',
        paragraphs: [
          'Reports should be made in good faith. Do not weaponize reporting to retaliate against someone for declining a friendship or expressing a lawful opinion you dislike. False or abusive reporting may itself result in moderation action.',
        ],
      },
      {
        heading: '11. Enforcement',
        paragraphs: [
          'Project PenPal may consider severity, context, evidence, prior behavior, risk to others, and attempts to evade enforcement. Actions may include warnings, content or photo removal, temporary suspension, permanent bans, and other restrictions available in the service.',
        ],
      },
    ],
  },
  {
    key: 'safety',
    title: 'Member Safety Guidelines',
    shortTitle: 'Safety',
    version: '1.0',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    requiredAcceptance: false,
    summary: 'Practical ways to build trust gradually, protect personal information, recognize scams, and use Project PenPal safety tools.',
    sections: [
      {
        heading: 'Build trust slowly',
        paragraphs: [
          'A compatibility score, warm conversation, long correspondence history, or profile photo is not proof of identity or good intentions. Give a new friendship time before sharing information that could affect your physical, financial, or online safety.',
        ],
      },
      {
        heading: 'Keep sensitive information private',
        bullets: [
          'Do not share passwords, authentication codes, banking details, government ID numbers, or security answers.',
          'Use a broad city or region rather than an exact home location on your profile.',
          'Think carefully before sharing your phone number, workplace, daily routine, personal social accounts, or legal name.',
          'Remember that recipients can save screenshots or copies of information once you disclose it.',
        ],
      },
      {
        heading: 'Treat money requests as a major warning sign',
        paragraphs: [
          'Do not send money, gift cards, cryptocurrency, banking access, or financial credentials to a pen pal. Be especially cautious about emergencies, travel problems, investment claims, customs fees, inheritance stories, or requests to move money for someone else.',
        ],
      },
      {
        heading: 'Use photo and identity claims carefully',
        paragraphs: [
          'Project PenPal profile photos are not verified identity documents. Reverse-image searches, video calls, or outside research may provide additional context, but none of those methods guarantees safety. Never pressure another member to prove their identity by sending sensitive documents.',
        ],
      },
      {
        heading: 'If you choose snail mail',
        bullets: [
          'Consider a PO box, private/commercial mailbox, or forwarding address instead of your home address.',
          'Do not share an address until you are comfortable with the specific person.',
          'Use the in-app consent flow rather than placing an address in a public profile or ordinary About Me text.',
          'Revoke access and block the member if the relationship becomes unsafe, while remembering that an already-copied address cannot be remotely erased.',
        ],
      },
      {
        heading: 'If you ever meet in person',
        bullets: [
          'Meet in a public place and arrange your own transportation.',
          'Tell a trusted person where you are going and when you expect to return.',
          'Keep control of your phone, identification, money, food, and drinks.',
          'Leave if you feel pressured or unsafe. You do not owe anyone continued contact.',
        ],
      },
      {
        heading: 'Block and report',
        paragraphs: [
          'Use Block when you want normal contact to stop. Use Report when moderation should review potential rule violations or safety concerns. For immediate threats or emergencies, contact local emergency services or law enforcement; Project PenPal support is not an emergency-response service.',
        ],
      },
    ],
  },
  {
    key: 'profile_photo',
    title: 'Profile Photo Guidelines',
    shortTitle: 'Photo rules',
    version: '1.0',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    requiredAcceptance: false,
    summary: 'What is allowed in a Project PenPal profile photo and how photo privacy and moderation work.',
    sections: [
      {
        heading: 'Photos are optional',
        paragraphs: [
          'You do not need a profile photo to participate in Project PenPal. A photo is a social cue, not proof that a member’s name, age, location, or identity has been verified.',
        ],
      },
      {
        heading: 'Use an image you have the right to use',
        paragraphs: [
          'Upload only a photo or neutral image you own or are authorized to use. Do not impersonate another person, use a stolen image to mislead members, or falsely present a public figure or other person as yourself.',
        ],
      },
      {
        heading: 'Not allowed',
        bullets: [
          'Nudity, sexualized imagery, pornography, or sexually explicit content.',
          'Graphic gore or shocking violent imagery.',
          'Hate symbols, extremist propaganda, or imagery used to threaten or target people.',
          'Images that expose another person’s private information without permission.',
          'Advertising, spam, QR codes, or contact information primarily intended to bypass Project PenPal safety controls.',
          'Illegal content or imagery that exploits or sexualizes minors.',
        ],
      },
      {
        heading: 'Visibility controls',
        paragraphs: [
          'Depending on the current app options, you may allow a photo in Discover, limit it to established pen pals, or keep it hidden from ordinary members. Authorized moderation staff can access current profile photos when necessary to administer photo-safety rules.',
        ],
      },
      {
        heading: 'Reported-photo evidence',
        paragraphs: [
          'When a member reports a profile photo, Project PenPal may preserve the exact reported image as private moderation evidence. Replacing or hiding the current photo does not rewrite the evidence attached to an earlier report. Photo evidence may be retained as reasonably necessary for moderation, safety, audit integrity, or legal obligations.',
        ],
      },
      {
        heading: 'Removal and account action',
        paragraphs: [
          'Moderation may remove a current photo that violates these rules. Serious, repeated, deceptive, or dangerous photo violations may also lead to a warning, suspension, or ban under the Community Guidelines.',
        ],
      },
    ],
  },
  {
    key: 'snail_mail',
    title: 'Snail Mail & Address-Sharing Guidelines',
    shortTitle: 'Snail mail',
    version: '1.0',
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    requiredAcceptance: false,
    summary: 'The consent, privacy, and safety rules for exchanging physical mailing addresses and handwritten letters.',
    sections: [
      {
        heading: 'Snail mail is always optional',
        paragraphs: [
          'No member is required to exchange a physical mailing address. Choosing “Digital + snail mail” or “Snail mail preferred” signals interest; it does not publish an address or obligate you to share one.',
        ],
      },
      {
        heading: 'Mutual-consent flow',
        bullets: [
          'Two members must first have an active accepted pen-pal relationship.',
          'One member may request an address exchange when both profiles are currently open to the applicable type of snail mail.',
          'The other member may accept or decline.',
          'Accepting the exchange shares no address by itself.',
          'Each member separately saves an address in their private vault and separately chooses whether to share it with that pen pal.',
        ],
      },
      {
        heading: 'Choose the address that fits your risk level',
        paragraphs: [
          'A mailing address can reveal where you live, receive mail, or spend time. Consider a PO box, commercial/private mailbox, or forwarding address if you do not want a pen pal to know your home address. The recipient name you enter can also reveal a legal name, so use only information you are comfortable disclosing.',
        ],
      },
      {
        heading: 'Address snapshots and updates',
        paragraphs: [
          'A shared address is a relationship-specific snapshot. If you later edit your private mailing-address vault, the new address is not silently pushed to people who received an older snapshot. Revoke the old share and explicitly share again if you intend to provide an updated address.',
        ],
      },
      {
        heading: 'Revocation, ending, and blocking',
        paragraphs: [
          'Revoking an address share, ending the pen-pal relationship, or blocking a member removes normal in-app access to the shared address. Project PenPal cannot erase a copy the recipient already wrote down, printed, photographed, memorized, or saved elsewhere.',
          'Do not continue sending unwanted physical mail after someone revokes access, ends the friendship, blocks you, or otherwise asks you to stop. Using a previously copied address to bypass a boundary may lead to moderation action and could violate local law.',
        ],
      },
      {
        heading: 'Protect the other person’s address',
        paragraphs: [
          'A pen pal’s mailing address is shared with you for correspondence with that person. Do not publish it, upload it elsewhere, sell it, trade it, use it for marketing, threaten to expose it, or give it to another person without clear permission.',
        ],
      },
      {
        heading: 'What you may send',
        paragraphs: [
          'Use physical mail for lawful personal correspondence. Do not send illegal goods, dangerous materials, threats, harassment, sexually explicit unsolicited material, contraband, or anything prohibited by the postal carrier or destination country. You are responsible for postage, customs declarations, carrier rules, and applicable law.',
        ],
      },
      {
        heading: 'International mail',
        paragraphs: [
          'Cross-border address exchange is available only when the app’s current consent requirements are met. International mail may reveal additional customs information and can be subject to inspection, delays, fees, import restrictions, or local postal rules outside Project PenPal’s control.',
        ],
      },
      {
        heading: 'Staff access and support',
        paragraphs: [
          'Mailing addresses are not displayed in ordinary moderator member search or case-file tools. Infrastructure administrators may still have technical access when necessary to operate, secure, restore, or legally administer the service. If physical mail becomes threatening or abusive, use Project PenPal reporting tools and consider contacting your postal carrier or local authorities when appropriate.',
        ],
      },
    ],
  },
]

export const requiredLegalDocuments = legalDocuments.filter((document) => document.requiredAcceptance)

export function getLegalDocument(key: LegalDocumentKey) {
  return legalDocuments.find((document) => document.key === key) ?? null
}

export function legalSignupMetadata() {
  return requiredLegalDocuments.reduce<Record<string, string>>((metadata, document) => {
    metadata[`legal_${document.key}_version`] = document.version
    return metadata
  }, {})
}
