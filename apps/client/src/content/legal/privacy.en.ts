import type { LegalDoc } from './types';

/**
 * Avino Privacy Policy — English variant.
 * Source: privacy.ru.ts (canonical Russian).
 * Prepared in accordance with the Law of the Republic of Uzbekistan on Personal Data (ZRU-547).
 * This is a working draft for subsequent legal review; not an official legal document as-is.
 */
export const privacyEn: LegalDoc = {
  title: 'Privacy Policy',
  updatedAt: '2026-06-29',
  intro:
    'This Privacy Policy explains how "[ОРГ-ПРАВОВАЯ ФОРМА] [НАЗВАНИЕ ЮРЛИЦА]" ' +
    '(hereinafter "Avino", "we", "Operator") collects, uses, and protects the personal ' +
    'data of Avino (avino.uz) users in accordance with the Law of the Republic of ' +
    'Uzbekistan on Personal Data (ZRU-547).',
  sections: [
    {
      id: 'general',
      heading: 'General provisions',
      blocks: [
        {
          type: 'p',
          text:
            'The personal data operator for users of avino.uz is ' +
            '"[ОРГ-ПРАВОВАЯ ФОРМА] [НАЗВАНИЕ ЮРЛИЦА]" (hereinafter "Operator", "Avino", "we"), ' +
            'registered at [ЮР. АДРЕС], TIN/OGRN: [ИНН/ОГРН], ' +
            'registration date: [ДАТА РЕГИСТРАЦИИ].',
        },
        {
          type: 'p',
          text:
            'This Privacy Policy (hereinafter "Policy") describes the procedure for ' +
            'processing the personal data of Service users in accordance with ' +
            'the Law of the Republic of Uzbekistan on Personal Data (ZRU-547) ' +
            'and other applicable regulatory acts.',
        },
        {
          type: 'p',
          text:
            'By registering on the Service or otherwise using it, you confirm that you ' +
            'have read this Policy and consent to the processing of your personal data ' +
            'for the purposes and to the extent described herein. If you do not agree ' +
            'with the terms of the Policy, please refrain from using the Service.',
        },
      ],
    },
    {
      id: 'data-collected',
      heading: 'Data we collect',
      blocks: [
        {
          type: 'subheading',
          text: 'Account data',
        },
        {
          type: 'list',
          items: [
            'Phone number — for registration, sign-in, and OTP verification.',
            'Email address — if provided at registration or via OAuth.',
            'Name — as entered by the user in their profile.',
          ],
        },
        {
          type: 'subheading',
          text: 'Sign-in identifiers',
        },
        {
          type: 'list',
          items: [
            'Google identifier (Google ID) — when signing in with Google.',
            'Apple identifier (Apple ID) — when signing in with Apple.',
            'Telegram identifier (Telegram ID) — when signing in with Telegram.',
          ],
        },
        {
          type: 'subheading',
          text: 'Content',
        },
        {
          type: 'list',
          items: [
            'Listings — text, photos, property attributes, status, and change history.',
            'Geolocation coordinates of property objects provided when creating a listing.',
            'Photos uploaded to listings, which are stored in cloud storage.',
            'Chat messages — correspondence between users within the Service.',
            'Favourites — listings bookmarked by the user.',
            'Saved searches and configured notification filters.',
          ],
        },
        {
          type: 'subheading',
          text: 'Technical data',
        },
        {
          type: 'list',
          items: [
            'Device IP address.',
            'Device and browser type, operating system version.',
            'Cookies and similar technologies (see the "Cookies" section for details).',
            'Device geolocation — only when using the "nearby" search feature and solely with the user\'s explicit consent.',
          ],
        },
      ],
    },
    {
      id: 'purposes',
      heading: 'Purposes of processing',
      blocks: [
        {
          type: 'p',
          text:
            'We process personal data exclusively for lawful and specific purposes. ' +
            'The main purposes of processing are:',
        },
        {
          type: 'list',
          items: [
            'Providing and operating the Service: registration, authentication, publishing and displaying listings, handling requests and messages.',
            'Content moderation: reviewing listings for compliance with the Terms of Service before publication and in response to user complaints.',
            'Notifications: sending SMS (via Eskiz), email, and push notifications about listing status changes, new chat messages, and matches with saved searches.',
            'Anti-fraud and security: detecting suspicious activity, preventing fraud and abuse of the Service.',
            'Analytics and improvement: studying aggregated usage patterns to improve Service quality and usability.',
            'Compliance with legal requirements: fulfilling the Operator\'s obligations under applicable legislation of the Republic of Uzbekistan.',
          ],
        },
        {
          type: 'p',
          text:
            'We do not use personal data for purposes incompatible with those for which ' +
            'it was collected without additional consent from the data subject.',
        },
      ],
    },
    {
      id: 'legal-basis',
      heading: 'Legal basis',
      blocks: [
        {
          type: 'p',
          text:
            'Personal data processing is carried out on the following legal bases ' +
            'in accordance with the Law of the Republic of Uzbekistan on Personal Data (ZRU-547):',
        },
        {
          type: 'list',
          items: [
            'Consent of the data subject — given by registering on the Service or otherwise accepting this Policy.',
            'Performance of the public offer agreement (Terms of Service) — processing is necessary to properly fulfil obligations to the user.',
            'Legitimate interest of the Operator — ensuring Service security, anti-fraud, protecting the rights and legitimate interests of users.',
            'Compliance with legal requirements — obligations imposed on the Operator by applicable regulatory acts of the Republic of Uzbekistan.',
          ],
        },
      ],
    },
    {
      id: 'sharing',
      heading: 'Sharing with third parties',
      blocks: [
        {
          type: 'p',
          text:
            'We do not sell personal data to third parties. Data is transferred to ' +
            'sub-processors only to the extent necessary for the operation of the Service, ' +
            'on the basis of appropriate data processing agreements. ' +
            'The list of sub-processors and transfer purposes is provided below:',
        },
        {
          type: 'list',
          items: [
            'Eskiz (eskiz.uz) — sending SMS messages for OTP verification and transactional notifications.',
            'Yandex Maps (maps.yandex.ru) — displaying interactive maps, geocoding addresses, and providing address suggestions.',
            'Google Translate / Yandex Translate — automatic translation of listing text into Uzbek, Russian, and English.',
            'Cloudflare R2 — cloud storage of user listing photos.',
            'SMTP provider — delivering email notifications to registered users.',
            'Firebase Cloud Messaging (Google) — delivering push notifications to mobile devices.',
            'Google / Apple / Telegram — OAuth authentication when users sign in via the respective platforms.',
          ],
        },
        {
          type: 'p',
          text:
            'Personal data is transferred to state authorities and officials exclusively ' +
            'on lawful grounds — upon an official request in the manner prescribed by law. ' +
            'We do not sell or transfer personal data for advertising or other commercial purposes.',
        },
      ],
    },
    {
      id: 'cross-border',
      heading: 'Cross-border transfer',
      blocks: [
        {
          type: 'p',
          text:
            'Some of the sub-processors involved in operating the Service are located ' +
            'outside the Republic of Uzbekistan. In particular, server infrastructure, ' +
            'CDN nodes, and certain cloud services may be located in other countries, ' +
            'including European Union member states, the United States, and others.',
        },
        {
          type: 'p',
          text:
            'By using the Service, you consent to the cross-border transfer of your ' +
            'personal data to the extent necessary for the operation of the Service. ' +
            'The Operator takes reasonable organisational and technical measures to ensure ' +
            'an appropriate level of protection for data transferred abroad, including by ' +
            'entering into contracts with sub-processors that provide corresponding ' +
            'confidentiality guarantees.',
        },
      ],
    },
    {
      id: 'cookies',
      heading: 'Cookies',
      blocks: [
        {
          type: 'p',
          text:
            'The Service uses cookies and similar technologies (e.g., localStorage) ' +
            'to ensure correct operation and to improve the user experience.',
        },
        {
          type: 'list',
          items: [
            'Session cookies — necessary to maintain your session (authentication) while using the Service; deleted when the browser is closed.',
            'Preference cookies — store your preferences such as the selected interface language and currency for price display.',
            'Analytics cookies — help us understand how users interact with the Service; data is collected in aggregated and anonymised form.',
          ],
        },
        {
          type: 'p',
          text:
            'You may manage cookies through your browser settings: restrict or entirely ' +
            'block their use. Please note that disabling mandatory cookies may affect ' +
            'the availability of certain Service features.',
        },
      ],
    },
    {
      id: 'retention',
      heading: 'Retention',
      blocks: [
        {
          type: 'p',
          text:
            'We retain personal data for the period necessary to achieve the processing ' +
            'purposes described in this Policy and for the period required by applicable ' +
            'legislation.',
        },
        {
          type: 'list',
          items: [
            'Account data is retained for as long as the account is active and has not been deleted by the user or the Operator.',
            'Listing data is retained for the duration of the listing\'s active period; after deletion — for the period prescribed by the legislation of the Republic of Uzbekistan.',
            'Correspondence data (chat) is retained in accordance with the requirements of the legislation of the Republic of Uzbekistan.',
            'Technical logs (IP addresses, sessions) are retained for a limited period necessary for security purposes, then automatically deleted.',
          ],
        },
        {
          type: 'p',
          text:
            'After account deletion, personal data is deleted or anonymised within a ' +
            'reasonable period of "[…]", except where retention is required by law or ' +
            'necessary to protect the Operator\'s legitimate interests.',
        },
      ],
    },
    {
      id: 'security',
      heading: 'Data security',
      blocks: [
        {
          type: 'p',
          text:
            'We apply organisational and technical data protection measures that meet ' +
            'modern information security standards and the requirements of the legislation ' +
            'of the Republic of Uzbekistan.',
        },
        {
          type: 'list',
          items: [
            'Encryption in transit: all connections to the Service are secured with the HTTPS/TLS protocol.',
            'Access control: access to personal data is granted only to authorised employees strictly within the scope of their job responsibilities.',
            'Protection of credentials: passwords and OTP codes are not stored in plain text; cryptographic methods are applied; one-time codes have a limited validity period.',
            'Security monitoring: continuous monitoring of infrastructure for anomalies, unauthorised access, and other threats.',
          ],
        },
        {
          type: 'p',
          text:
            'Despite the measures applied, no data transmission or storage system on ' +
            'the internet can guarantee absolute security. If you become aware of a ' +
            'possible security breach, please notify us immediately at support@avino.uz.',
        },
      ],
    },
    {
      id: 'rights',
      heading: 'Your rights',
      blocks: [
        {
          type: 'p',
          text:
            'In accordance with the Law of the Republic of Uzbekistan on Personal Data ' +
            '(ZRU-547), you have the following rights with respect to your personal data:',
        },
        {
          type: 'list',
          items: [
            'Right of access — obtain information about what personal data the Operator processes about you and on what basis.',
            'Right to rectification — have inaccurate or incomplete data corrected.',
            'Right to erasure — request that processing cease and data be deleted when there are no lawful grounds for further retention.',
            'Right to restriction — temporarily suspend processing during the resolution of a dispute or verification of data accuracy.',
            'Right to withdraw consent — you may withdraw your consent at any time without affecting the lawfulness of processing carried out prior to withdrawal.',
          ],
        },
        {
          type: 'p',
          text:
            'To exercise any of the rights listed above, submit a written request to ' +
            '[EMAIL ОПЕРАТОРА ДАННЫХ], stating your name, contact details, and the nature ' +
            'of your request. The request will be reviewed within "[…]" business days of receipt.',
        },
      ],
    },
    {
      id: 'minors',
      heading: 'Minors',
      blocks: [
        {
          type: 'p',
          text:
            'The Service is intended exclusively for individuals who have reached the age ' +
            'of 18. We do not knowingly or intentionally collect or process the personal ' +
            'data of children.',
        },
        {
          type: 'p',
          text:
            'If you become aware that a minor has registered on the Service or provided ' +
            'us with their personal data, please inform us at support@avino.uz. ' +
            'We will take prompt steps to delete such data.',
        },
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to this policy',
      blocks: [
        {
          type: 'p',
          text:
            'The Operator reserves the right to make changes to this Policy at any time. ' +
            'The current version is always available at avino.uz/privacy. ' +
            'The date of the last update is indicated in the "Last updated" field at the beginning of the document.',
        },
        {
          type: 'p',
          text:
            'Material changes affecting the rights of data subjects will be communicated ' +
            'to users through the Service interface — via an information banner or other ' +
            'prominent means — before the changes take effect.',
        },
        {
          type: 'p',
          text:
            'Continued use of the Service after the updated Policy is published ' +
            'constitutes your acceptance of the changes made.',
        },
      ],
    },
    {
      id: 'contacts',
      heading: 'Contact the operator',
      blocks: [
        {
          type: 'subheading',
          text: 'Personal data operator',
        },
        {
          type: 'list',
          items: [
            '[ОРГ-ПРАВОВАЯ ФОРМА] [НАЗВАНИЕ ЮРЛИЦА]',
            'Registered address: [ЮР. АДРЕС]',
            'TIN/OGRN: [ИНН/ОГРН]',
            'Registration date: [ДАТА РЕГИСТРАЦИИ]',
          ],
        },
        {
          type: 'subheading',
          text: 'Personal data enquiries',
        },
        {
          type: 'p',
          text:
            'For questions about personal data processing, exercising your rights, or ' +
            'withdrawing consent, contact the person responsible for data processing: ' +
            '[EMAIL ОПЕРАТОРА ДАННЫХ].',
        },
        {
          type: 'subheading',
          text: 'General support',
        },
        {
          type: 'list',
          items: [
            'Email: support@avino.uz',
            'Telegram: @avino_uz',
            'Instagram: avino.uz',
            'Facebook: avino.uz',
            'YouTube: @avino_uz',
          ],
        },
      ],
    },
  ],
};
