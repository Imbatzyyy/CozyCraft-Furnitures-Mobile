// Shared by registration and the in-app reader. Policy wording is unchanged.
export const MOBILE_POLICY_VERSION = "2026-08-16"

type LegalSection = {
  title: string
  paragraphs?: string[]
  bullets?: string[]
}

export const termsSections: LegalSection[] = [
  {
    title: "1. About these Terms",
    paragraphs: [
      "These Terms of Service govern your access to and use of the CozyCraft Furnitures mobile application, website, customer account, catalog, ordering, delivery, support, reviews, and related services in the Philippines (collectively, the “Services”). By creating an account, placing an order, or continuing to use the Services, you agree to these Terms and our Privacy Policy.",
      "CozyCraft Furnitures is the online merchant for products identified as sold by CozyCraft. Business and customer-support details are available in Account › Support and on your order confirmation. If you do not agree, do not create an account or place an order.",
    ],
  },
  {
    title: "2. Eligibility and accounts",
    bullets: [
      "You must be at least 18 years old and legally able to enter into a contract, or use the Services with the involvement and consent of a parent or legal guardian.",
      "Provide accurate, current information and keep your email, phone number, delivery address, and account details updated.",
      "Keep your password, verification codes, and signed-in devices secure. Notify us through Support if you suspect unauthorized activity.",
      "You are responsible for activity performed through your account, except where caused by our failure to apply reasonable security measures.",
    ],
  },
  {
    title: "3. Products, content, and prices",
    paragraphs: [
      "We aim to display product descriptions, dimensions, materials, finishes, colors, availability, prices, promotions, and photographs accurately. Screen settings, natural materials, production batches, and handcrafted finishes may cause reasonable variation. Product measurements are approximate unless expressly stated otherwise.",
      "Prices are shown in Philippine pesos and include applicable taxes unless stated otherwise. Delivery, assembly, or other charges are disclosed before you confirm checkout. We may correct genuine typographical or pricing errors before fulfillment and will give you the choice to accept the corrected price or cancel for a refund.",
    ],
  },
  {
    title: "4. Orders and acceptance",
    paragraphs: [
      "Submitting checkout is an offer to purchase. An automated acknowledgment does not by itself mean the order has been accepted. Acceptance occurs when we confirm the order for processing or shipment. We may decline or cancel an order for unavailable stock, suspected fraud, incorrect information, delivery limitations, legal restrictions, or a genuine pricing error. If payment was collected, the appropriate refund process will be started.",
      "Inventory is shared between the app, website, and administrative system. Rare timing differences may occur when several customers purchase the final units at the same time.",
    ],
  },
  {
    title: "5. Payments",
    paragraphs: [
      "Available methods may include cash on delivery and supported electronic methods such as cards or GCash through an authorized payment provider. Electronic payment credentials are entered into the payment provider’s secure flow; CozyCraft does not request your card PIN, GCash MPIN, one-time password, or complete card security code through chat or support.",
      "A payment marked pending is not final until confirmed by the payment provider. You authorize us and our payment partners to process payment, verification, reversal, and refund information necessary to complete the transaction.",
    ],
  },
  {
    title: "6. Delivery and receiving furniture",
    bullets: [
      "Delivery estimates are good-faith estimates and may change due to inventory, weather, traffic, carrier capacity, access restrictions, force majeure, or events beyond reasonable control.",
      "Provide a complete, serviceable delivery address and disclose stairs, elevators, narrow access, subdivision rules, or other conditions relevant to safe furniture delivery.",
      "An adult authorized to receive and inspect the order must be present. Check the packaging and product promptly and report visible damage, missing parts, or an incorrect item through Support with reasonable evidence.",
      "Risk of accidental loss transfers upon completed delivery to you or your authorized recipient, without limiting rights provided by Philippine consumer law.",
    ],
  },
  {
    title: "7. Cancellations, returns, and refunds",
    paragraphs: [
      "The cancellation, return, exchange, and refund rules displayed at checkout, in your order, or in Store Policies apply together with mandatory rights under the Consumer Act of the Philippines, the Internet Transactions Act, and other applicable law. Nothing in these Terms removes a remedy that cannot legally be waived.",
      "Change-of-mind requests may be subject to the posted policy and the item’s condition. Defective, damaged, misdescribed, or incorrect goods will be handled in accordance with applicable law. Customized, made-to-order, assembled, hygiene-sensitive, or clearance items may have special conditions where legally permitted. Approved electronic-payment refunds are returned through the supported provider and may take additional banking or provider processing time.",
    ],
  },
  {
    title: "8. Reviews, support, and acceptable use",
    bullets: [
      "Reviews must reflect a genuine experience and must not contain unlawful, abusive, discriminatory, fraudulent, infringing, private, or misleading material.",
      "Do not probe security, scrape the catalog at scale, interfere with the Services, misuse promotions, impersonate another person, submit false claims, or use another customer’s account or personal data.",
      "You retain ownership of your review content, while granting CozyCraft a non-exclusive, royalty-free license to display, format, moderate, and use it to operate and promote the Services. We may remove content that violates these Terms or law.",
    ],
  },
  {
    title: "9. Intellectual property",
    paragraphs: [
      "The CozyCraft name, logo, interface, product presentation, photographs owned by CozyCraft, text, graphics, and software are protected by applicable intellectual-property laws. You may use the Services only for personal, lawful shopping. No ownership is transferred to you, and commercial reproduction or redistribution requires written permission.",
    ],
  },
  {
    title: "10. Service availability and liability",
    paragraphs: [
      "We use reasonable care to keep the Services accurate, secure, and available, but temporary maintenance, network interruption, device incompatibility, or third-party service failure may occur. To the maximum extent allowed by law, neither party is liable for indirect or unforeseeable loss. Any limitation applies only where legally permitted and does not exclude liability for fraud, willful misconduct, gross negligence, personal injury caused by negligence, or mandatory consumer rights.",
    ],
  },
  {
    title: "11. Suspension and termination",
    paragraphs: [
      "You may stop using the Services and request account deletion through Support, subject to records we must retain by law or for unresolved transactions. We may restrict or suspend access where reasonably necessary to protect customers, investigate fraud or security incidents, comply with law, or address a material breach. When appropriate, we will provide notice and a way to contact us.",
    ],
  },
  {
    title: "12. Governing law, concerns, and changes",
    paragraphs: [
      "These Terms are governed by the laws of the Republic of the Philippines. Please contact CozyCraft Support first so we can try to resolve a concern promptly. You may also exercise remedies or submit complaints to the appropriate Philippine authority, including the Department of Trade and Industry, without losing any right available by law.",
      "We may update these Terms for legal, security, operational, or service changes. Material changes will be announced in the app or by another appropriate channel before they take effect when required. Continued use after the effective date means you accept the updated Terms; where fresh consent is legally required, we will request it.",
    ],
  },
]

export const privacySections: LegalSection[] = [
  {
    title: "1. Who controls your information",
    paragraphs: [
      "CozyCraft Furnitures is the personal information controller for customer information processed through the CozyCraft app and website. Privacy requests may be submitted through Account › Support or sent to privacy@cozycraftfurnitures.com. The business contact and service address shown in the app’s Store Information and your order documents form part of this notice.",
      "This notice follows the Philippine Data Privacy Act of 2012 (Republic Act No. 10173), its Implementing Rules and Regulations, applicable National Privacy Commission issuances, and Philippine e-commerce and consumer-protection requirements.",
    ],
  },
  {
    title: "2. Information we collect",
    bullets: [
      "Account and identity data: name, username, email address, authentication identifier, profile photo, date of birth when voluntarily supplied, and Google account profile details when you choose Google sign-in.",
      "Contact and delivery data: mobile number, recipient name, address, barangay, city or municipality, province or region, postal code, landmark, and delivery instructions.",
      "Shopping and transaction data: cart, wishlist, product selections, orders, quantities, discounts, payment method and status, payment-provider references, refunds, delivery tracking, returns, and invoices. We do not intentionally store your complete card number, CVV, GCash MPIN, or payment OTP.",
      "Customer-service and community data: support tickets and replies, attachments you submit, product ratings, reviews, and moderation records.",
      "Technical and security data: device and app version, IP address, session and authentication events, timestamps, diagnostics, crash information, security logs, notification token, and consent or preference records.",
      "App permissions: only permissions needed for a feature you request, such as photos or camera access when uploading a profile image or support attachment, and notifications when you opt in. We do not need your contacts, microphone, or precise location for ordinary shopping and will not access them without a stated purpose and the permission required by your device.",
    ],
  },
  {
    title: "3. How information is collected",
    paragraphs: [
      "We receive information directly from you, automatically from your use of the Services, from your chosen sign-in or payment provider, and from delivery or support partners involved in your transaction. We may combine records across the CozyCraft app and website so your account, cart, wishlist, orders, support, and notifications remain synchronized.",
    ],
  },
  {
    title: "4. Why we process information",
    bullets: [
      "To create and secure your account, authenticate sign-ins, recover access, prevent duplicate or fraudulent accounts, and keep sessions synchronized.",
      "To provide the catalog, remember carts and wishlists, accept and fulfill orders, process or reconcile payments and refunds, arrange delivery, issue records, and provide after-sales support.",
      "To send transactional messages such as verification, password reset, order, payment, delivery, refund, support, and security notices.",
      "To personalize relevant content and improve product availability, accessibility, performance, customer experience, and service reliability using aggregated or appropriately protected information where possible.",
      "To prevent fraud, abuse, and security incidents; enforce our Terms; maintain audit records; establish or defend legal claims; and comply with tax, accounting, consumer, privacy, and other legal obligations.",
      "To send optional promotions only where permitted and according to your preferences. You can withdraw marketing consent without affecting essential service messages.",
    ],
  },
  {
    title: "5. Lawful bases",
    paragraphs: [
      "Depending on the activity, processing is necessary to perform our contract with you, take steps you request before a purchase, comply with legal obligations, protect lawful interests such as security and fraud prevention, establish or defend legal claims, or act on your freely given consent. Consent may be withdrawn at any time for future processing, but withdrawal does not invalidate earlier lawful processing or processing required on another lawful basis.",
    ],
  },
  {
    title: "6. Who receives information",
    bullets: [
      "Authorized CozyCraft personnel whose roles require access, subject to access controls and confidentiality duties.",
      "Cloud database, authentication, storage, email, monitoring, and hosting providers, including Supabase and service infrastructure supporting the app and website.",
      "Google when you choose Google authentication, and the relevant mobile operating-system provider for app functionality you enable.",
      "Payment providers such as PayMongo and their supported banks, card networks, e-wallets, anti-fraud, and settlement partners.",
      "Delivery, logistics, installation, and customer-support partners that need limited order and contact information to serve you.",
      "Professional advisers, insurers, regulators, courts, law enforcement, or other parties where disclosure is authorized or required by law, or necessary to protect rights, safety, and security.",
    ],
  },
  {
    title: "7. Cross-border processing",
    paragraphs: [
      "Some technology providers may process or store information using infrastructure outside the Philippines. Where this occurs, we remain accountable for the processing under applicable Philippine privacy law and use contractual, access-control, encryption, and other appropriate safeguards proportionate to the risk.",
    ],
  },
  {
    title: "8. Retention and deletion",
    paragraphs: [
      "We keep identifiable information only for as long as necessary for the stated purpose: account and preference records while the account is active; carts and wishlists until removed or the account is deleted; transaction, payment, invoice, refund, and delivery records for the period required by Philippine tax, accounting, consumer, anti-fraud, and legal-claims obligations; support and review records while needed to resolve the matter and maintain service integrity; and security logs for a limited risk-based period. Backups are rotated and securely overwritten according to the applicable backup cycle.",
      "When retention is no longer justified, information is deleted, anonymized, or securely disposed of. A deletion request may not immediately remove records we must preserve for an unresolved order, refund, dispute, fraud investigation, or legal obligation. We will explain an applicable exception when responding to a request.",
    ],
  },
  {
    title: "9. Security",
    paragraphs: [
      "We use reasonable and appropriate organizational, physical, and technical safeguards, including authenticated access, role-based permissions, database row-level security, encrypted network transport, restricted administrator access, secrets kept outside the client app, backups, audit logging, monitoring, and incident-response procedures. No internet service can guarantee absolute security, so protect your device and credentials and report suspicious activity promptly.",
      "If a personal-data breach creates a notification obligation, we will notify affected individuals and the National Privacy Commission in accordance with applicable requirements.",
    ],
  },
  {
    title: "10. Your rights",
    bullets: [
      "Be informed about processing and request access to personal data concerning you.",
      "Dispute inaccuracies and request correction without unreasonable delay.",
      "Object to processing or withdraw consent where the processing depends on consent.",
      "Request suspension, blocking, removal, or destruction when the legal conditions are met.",
      "Receive data portability where applicable and technically feasible.",
      "Seek indemnification for damage caused by a violation and lodge a complaint with the National Privacy Commission.",
    ],
    paragraphs: [
      "Submit a request through Account › Support or the privacy email above. We may verify identity before acting to protect your account. We will respond within the period required by applicable law and explain any lawful limitation. You may manage notification and marketing choices in Account settings, while essential transactional or security messages cannot be disabled during an active transaction.",
    ],
  },
  {
    title: "11. Children",
    paragraphs: [
      "The Services are intended for adults. We do not knowingly create independent shopping accounts for children under 18. A parent or legal guardian who believes a child provided personal data without proper involvement should contact us so we can review and take appropriate action.",
    ],
  },
  {
    title: "12. Automated processing and updates",
    paragraphs: [
      "We may use rules to detect suspicious sign-ins, payment anomalies, stock limits, or misuse. These safeguards support human review and are not intended to make a solely automated decision that produces a legal or similarly significant effect without the disclosures and rights required by law.",
      "We may update this notice when our practices, providers, security measures, or legal obligations change. The effective date and material changes will be shown in the app. Where a new purpose requires consent, we will ask before processing for that purpose.",
    ],
  },
]
