import type { LegalDoc } from './types';

/**
 * Avino Terms of Service — English locale.
 * Source: terms.ru.ts (canonical Russian version).
 * This is a working draft for subsequent legal review; not a final legal document in its current form.
 */
export const termsEn: LegalDoc = {
  title: 'Terms of Service',
  updatedAt: '2026-06-29',
  intro:
    'These Terms govern the use of Avino — an online real estate listings platform in ' +
    'Uzbekistan. Please read them carefully before using the service.',
  sections: [
    {
      id: 'general',
      heading: 'General provisions',
      blocks: [
        {
          type: 'p',
          text:
            'Avino is an online service for posting and searching real estate listings, ' +
            'available at avino.uz. The service allows users to publish listings for the sale, ' +
            'rental, and purchase of residential and commercial real estate within the ' +
            'Republic of Uzbekistan.',
        },
        {
          type: 'p',
          text:
            'The service is operated by "[ОРГ-ПРАВОВАЯ ФОРМА] [НАЗВАНИЕ ЮРЛИЦА]" ' +
            '(hereinafter — "Avino", "Operator", "we"), registered at: [ЮР. АДРЕС], ' +
            'INN/OGRN: [ИНН/ОГРН], registration date: [ДАТА РЕГИСТРАЦИИ].',
        },
        {
          type: 'subheading',
          text: 'Definitions',
        },
        {
          type: 'list',
          items: [
            '"User" — any individual or legal entity registered on the Service or using it.',
            '"Listing" — structured information about a real estate property posted by a User on the Service.',
            '"Service" — the totality of software, content, interfaces, and infrastructure available at avino.uz and associated mobile applications.',
            '"Moderation" — the procedure by which the Operator reviews a Listing before publication or following a complaint.',
          ],
        },
        {
          type: 'p',
          text:
            'These Terms constitute a public offer. Registering on the Service, posting a ' +
            'Listing, or any other use of the Service signifies full and unconditional acceptance ' +
            'of the Terms. If you disagree with any conditions — please do not use the Service.',
        },
      ],
    },
    {
      id: 'account',
      heading: 'Account and roles',
      blocks: [
        {
          type: 'p',
          text:
            'Registration is required to post Listings and access extended features. A user may ' +
            'create an account using one of the following methods: by phone number confirmed via ' +
            'SMS code (Eskiz provider), or via OAuth through Google, Apple, or Telegram.',
        },
        {
          type: 'subheading',
          text: 'User roles',
        },
        {
          type: 'p',
          text:
            'Depending on the nature of their activity, a user is assigned one of the following roles:',
        },
        {
          type: 'list',
          items: [
            'USER — the basic role; available after registration.',
            'OWNER — a property owner posting listings on their own behalf.',
            'AGENT — a private real estate agent representing clients\' interests.',
            'AGENCY — a real estate agency account with the ability to manage multiple agents.',
            'LANDLORD — a landlord who regularly rents out properties.',
            'PROPERTY_MANAGER — a property management company or an authorized representative of the owner.',
          ],
        },
        {
          type: 'p',
          text:
            'The User must provide accurate information upon registration and update it when it ' +
            'changes. The User is fully responsible for maintaining the security of their ' +
            'credentials (login and password/OTP). Any unauthorized access to the account must ' +
            'be reported immediately to support@avino.uz.',
        },
        {
          type: 'p',
          text:
            'Each person is permitted to have only one personal account. It is prohibited to ' +
            'transfer account access to third parties, to buy or sell accounts, or to create ' +
            'fictitious or automated (bot) accounts. Violation of these requirements results in ' +
            'account suspension.',
        },
      ],
    },
    {
      id: 'listings',
      heading: 'Posting listings and moderation',
      blocks: [
        {
          type: 'p',
          text:
            'The User may post Listings in compliance with these Terms. A Listing is created in ' +
            'one of the supported languages (Uzbek, Russian, or English) and is automatically ' +
            'translated by the Service into the other two languages. The User may manually edit ' +
            'the automatic translation.',
        },
        {
          type: 'subheading',
          text: 'Moderation process',
        },
        {
          type: 'p',
          text:
            'After publication, every Listing undergoes mandatory moderation. Possible statuses:',
        },
        {
          type: 'list',
          items: [
            'NEW — the Listing has been submitted for review and is awaiting the moderator\'s decision.',
            'ACTIVE — the Listing has passed moderation and appears in search results.',
            'DRAFT — the Listing is saved as a draft and has not been published.',
            'REJECTED — the Listing was rejected for violation of the Terms.',
            'DELETED — the Listing was removed by the Operator or by the User.',
          ],
        },
        {
          type: 'p',
          text:
            'The Operator may reject or remove a Listing at any time in the event of a violation ' +
            'of these Terms. A reasoned explanation is provided upon request; however, the ' +
            'Operator is not obliged to disclose the details of its internal review procedures.',
        },
        {
          type: 'subheading',
          text: 'Listing requirements',
        },
        {
          type: 'list',
          items: [
            'The information must be accurate and relate to a real, existing property.',
            'Photographs must depict the specific property described in the Listing.',
            'The price must be current and correspond to a genuine offer.',
            'The location (address, coordinates) must be accurately stated.',
            'Duplicate listings for the same property are prohibited.',
          ],
        },
      ],
    },
    {
      id: 'prohibited',
      heading: 'Prohibited content and conduct',
      blocks: [
        {
          type: 'p',
          text:
            'In the interest of community safety and trust, the following actions and types of ' +
            'content are strictly prohibited on the Service:',
        },
        {
          type: 'list',
          items: [
            'Posting false, misleading, or fraudulent listings.',
            'Using another person\'s photographs or other protected content without the rights holder\'s permission.',
            'Placing contact details (phone numbers, email addresses) directly on photographs.',
            'Publishing duplicate listings for the same property.',
            'Sending spam to other users via chat or any other feature of the Service.',
            'Insults, discriminatory statements, or harassment of other users.',
            'Offering properties whose transactions are prohibited under the laws of the Republic of Uzbekistan.',
            'Attempting to circumvent or deceive the moderation system, including deliberately distorting property data.',
            'Automated data collection (scraping) from the Service without the Operator\'s written permission.',
            'Using the Service to distribute malware or conduct phishing attacks.',
          ],
        },
        {
          type: 'p',
          text:
            'Violation of these prohibitions results in the immediate removal of the Listing. ' +
            'In the event of systematic or serious violations, the Operator may temporarily or ' +
            'permanently suspend the User\'s account without prior notice and may, where required ' +
            'by law, refer information about the violation to law enforcement authorities.',
        },
      ],
    },
    {
      id: 'promotion',
      heading: 'Paid promotion',
      blocks: [
        {
          type: 'p',
          text:
            'The Service may offer paid listing promotion services that increase their visibility ' +
            'in search results and on the home page. At the current stage of the Service\'s ' +
            'development, promotion is available on a limited basis and may be activated manually ' +
            'by the Operator upon the User\'s request.',
        },
        {
          type: 'list',
          items: [
            'VIP — special highlighting of the Listing in the search results list.',
            'TOP — pinning the Listing to the top of its category.',
          ],
        },
        {
          type: 'p',
          text:
            'Promotion affects only the visibility and display priority of the Listing. ' +
            'Payment for promotion does not replace mandatory moderation: the Listing must ' +
            'comply with these Terms regardless of payment.',
        },
        {
          type: 'p',
          text:
            'The procedure for refunding payment for unused promotion periods is governed by ' +
            'separate terms published on the payment page at the time of its activation. Until ' +
            'such terms are published, refunds are handled on a case-by-case basis upon request ' +
            'to support@avino.uz.',
        },
      ],
    },
    {
      id: 'chat',
      heading: 'Chat and communications',
      blocks: [
        {
          type: 'p',
          text:
            'The Service provides a built-in messenger (chat) for direct communication between ' +
            'Users — prospective buyers/tenants and Listing authors. Chat is intended exclusively ' +
            'for discussing the terms of a transaction regarding a specific property.',
        },
        {
          type: 'subheading',
          text: 'Chat usage rules',
        },
        {
          type: 'list',
          items: [
            'Sending promotional, spam, or off-topic messages in chat is prohibited.',
            'Using chat for fraudulent purposes, including requesting advance payments outside of formally documented agreements, is prohibited.',
            'Publishing personal data of third parties in chat without their consent is prohibited.',
            'Insults, threats, and other forms of aggressive communication are prohibited.',
          ],
        },
        {
          type: 'p',
          text:
            'Avino provides the technical infrastructure for chat but is not a party to the ' +
            'correspondence and is not responsible for the content of Users\' messages. If you ' +
            'receive unwanted messages, use the "Report" feature or contact support@avino.uz.',
        },
        {
          type: 'p',
          text:
            'Avino reserves the right, in accordance with applicable law, to store correspondence ' +
            'and provide it to authorized authorities upon official request.',
        },
      ],
    },
    {
      id: 'content-rights',
      heading: 'Content rights',
      blocks: [
        {
          type: 'p',
          text:
            'By posting photographs, texts, descriptions, and other materials as part of a ' +
            'Listing, the User warrants that they are the rights holder of the said materials ' +
            'or have all necessary permissions to use them in this context.',
        },
        {
          type: 'p',
          text:
            'By posting content on the Service, the User grants the Operator a non-exclusive, ' +
            'royalty-free license for the entire duration of the Listing\'s existence, covering:',
        },
        {
          type: 'list',
          items: [
            'Storage of materials on the Operator\'s servers and cloud infrastructure.',
            'Display of materials on the Service and in associated distribution channels (mobile applications, partner widgets).',
            'Automatic translation of the Listing\'s text description into Uzbek, Russian, and English.',
            'Creation of thumbnail (preview) images for use in search result lists.',
          ],
        },
        {
          type: 'p',
          text:
            'This license does not grant the Operator the right to resell or transfer the ' +
            'User\'s content to third parties for commercial purposes without the User\'s ' +
            'separate consent. After a Listing is deleted, the Operator may retain technical ' +
            'copies for the period prescribed by applicable law.',
        },
      ],
    },
    {
      id: 'liability',
      heading: 'Liability of the parties',
      blocks: [
        {
          type: 'p',
          text:
            'Avino acts as an information intermediary: the Service provides a technical ' +
            'platform for posting and searching listings, but is not a party to any transactions ' +
            'between Users. The Operator does not verify the legal cleanliness of properties and ' +
            'does not guarantee the accuracy of information provided by Users in Listings.',
        },
        {
          type: 'p',
          text:
            'The Operator is not liable for damage arising from:',
        },
        {
          type: 'list',
          items: [
            'Actions or omissions of third parties, including other users of the Service.',
            'Provision of inaccurate or incomplete information by Users in Listings.',
            'Users entering into transactions on unfavorable terms or failing to perform contracts properly.',
            'Temporary unavailability of the Service due to technical reasons or circumstances beyond the Operator\'s control (force majeure).',
          ],
        },
        {
          type: 'subheading',
          text: 'Safe transaction recommendations',
        },
        {
          type: 'list',
          items: [
            'Always verify the title documents for the property before signing a contract.',
            'Arrange a personal visit and inspection of the property before transferring funds.',
            'Be cautious of advance payment requests: legitimate real estate transactions do not require deposits before a formal contract is signed.',
            'When in doubt, consult a lawyer or a licensed real estate agent.',
          ],
        },
        {
          type: 'p',
          text:
            'The Service is provided "as is." The Operator makes no express or implied warranties ' +
            'regarding uninterrupted operation of the Service, its fitness for a particular ' +
            'purpose, or freedom from errors.',
        },
      ],
    },
    {
      id: 'ip',
      heading: 'Avino intellectual property',
      blocks: [
        {
          type: 'p',
          text:
            'The "Avino" trademark, logo, brand identity, interface design, source code, ' +
            'listing database structure, search and recommendation algorithms, and other ' +
            'intellectual property created by the Operator belong to ' +
            '"[ОРГ-ПРАВОВАЯ ФОРМА] [НАЗВАНИЕ ЮРЛИЦА]" or are used on a lawful basis.',
        },
        {
          type: 'p',
          text:
            'Without the Operator\'s written permission, the following are prohibited:',
        },
        {
          type: 'list',
          items: [
            'Copying, reproducing, or distributing any elements of the brand identity, interface, or Service content.',
            'Using the "Avino" brand for advertising, commercial, or other purposes.',
            'Automated data collection (parsing, scraping) from the Service.',
            'Creating derivative works based on Service materials without express permission.',
          ],
        },
        {
          type: 'p',
          text:
            'Users may share links to Service pages on social networks and messengers for ' +
            'personal, non-commercial purposes. Any other use requires prior written agreement ' +
            'with the Operator at support@avino.uz.',
        },
      ],
    },
    {
      id: 'termination',
      heading: 'Suspension and termination',
      blocks: [
        {
          type: 'p',
          text:
            'The Operator may restrict, suspend, or terminate a User\'s access to the Service ' +
            'in the following cases:',
        },
        {
          type: 'list',
          items: [
            'Violation of these Terms, including the "Prohibited Content and Conduct" section.',
            'Suspicion of fraudulent activity or causing harm to other users.',
            'Knowingly providing false information at registration.',
            'Receipt of an official request from an authorized authority.',
            'Prolonged non-use of the account where violations have previously been recorded.',
          ],
        },
        {
          type: 'p',
          text:
            'Blocking may be temporary (for a period set by the Operator) or permanent, ' +
            'depending on the severity of the violation. The User is notified of the fact of ' +
            'blocking and its reasons through the contact details provided in the account, ' +
            'unless this conflicts with legal requirements.',
        },
        {
          type: 'p',
          text:
            'The User may at any time delete their account via profile settings or by contacting ' +
            'support@avino.uz. After account deletion, published Listings are taken down. Data ' +
            'is retained for the period established by applicable law and then destroyed.',
        },
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to the Terms',
      blocks: [
        {
          type: 'p',
          text:
            'The Operator may unilaterally amend these Terms at any time. The current version ' +
            'is always available at avino.uz/terms.',
        },
        {
          type: 'p',
          text:
            'The date of the last update is indicated in the "Last updated" field at the ' +
            'beginning of the document. For changes affecting material conditions of use of the ' +
            'Service, the Operator notifies registered Users through available contact details ' +
            'no less than 7 days before the changes take effect.',
        },
        {
          type: 'p',
          text:
            'Continued use of the Service after the changes take effect constitutes the User\'s ' +
            'full agreement with the new version of the Terms. If the User does not agree with ' +
            'the changes, they must cease using the Service and delete their account before the ' +
            'effective date of the changes.',
        },
      ],
    },
    {
      id: 'law',
      heading: 'Applicable law and disputes',
      blocks: [
        {
          type: 'p',
          text:
            'These Terms are governed by and construed in accordance with the laws of the ' +
            'Republic of Uzbekistan, including the Law "On Electronic Commerce," the Law ' +
            '"On Personal Data," and the Civil Code of the Republic of Uzbekistan.',
        },
        {
          type: 'p',
          text:
            'All disputes arising from these Terms or in connection with the use of the Service ' +
            'shall be resolved through negotiations. For this purpose, the User submits a written ' +
            'claim to [EMAIL ОПЕРАТОРА ДАННЫХ], stating the substance of the claims and their ' +
            'contact details. The Operator considers the claim within 30 (thirty) calendar days ' +
            'of receiving it.',
        },
        {
          type: 'p',
          text:
            'If the dispute is not settled pre-trial, it is referred to the competent court at ' +
            'the Operator\'s location in accordance with the procedural laws of the Republic of ' +
            'Uzbekistan.',
        },
      ],
    },
    {
      id: 'contacts',
      heading: 'Details and contacts',
      blocks: [
        {
          type: 'subheading',
          text: 'Service operator',
        },
        {
          type: 'list',
          items: [
            '[ОРГ-ПРАВОВАЯ ФОРМА] [НАЗВАНИЕ ЮРЛИЦА]',
            'Registered address: [ЮР. АДРЕС]',
            'INN/OGRN: [ИНН/ОГРН]',
            'Registration date: [ДАТА РЕГИСТРАЦИИ]',
          ],
        },
        {
          type: 'subheading',
          text: 'Support team',
        },
        {
          type: 'p',
          text:
            'For all questions related to the Service\'s operation, Terms violations, listing ' +
            'complaints, and other inquiries, please contact us:',
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
        {
          type: 'p',
          text:
            'We aim to respond to inquiries within one business day. For questions related to ' +
            'personal data, please use: [EMAIL ОПЕРАТОРА ДАННЫХ].',
        },
      ],
    },
  ],
};
