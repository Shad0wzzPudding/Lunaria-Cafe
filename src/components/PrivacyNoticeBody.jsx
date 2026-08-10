import {
  PRIVACY_INTRO,
  PRIVACY_LAST_UPDATED,
  PRIVACY_SECTIONS,
  privacyContact,
} from '@/lib/nsc/privacyNotice';

/**
 * The Privacy Notice text, rendered in a caller-supplied palette.
 *
 * The three surfaces that show it look nothing alike — cream letter paper,
 * a light instructor document, the dark Help page — so the colours come in as
 * props while the words stay in one place. Same arrangement as the license
 * paragraphs, and for the same reason: a privacy notice that drifts between
 * surfaces is worse than a plain one.
 */
export default function PrivacyNoticeBody({
  font,
  headingColor,
  bodyColor,
  mutedColor,
  ruleColor,
}) {
  const contact = privacyContact();

  return (
    <div style={{ fontFamily: font }}>
      <p className="text-[11px] mb-3" style={{ color: mutedColor }}>
        Last updated: {PRIVACY_LAST_UPDATED}
      </p>

      <p className="text-[13px] leading-relaxed mb-4" style={{ color: bodyColor }}>
        {PRIVACY_INTRO}
      </p>

      {PRIVACY_SECTIONS.map((section) => (
        <section key={section.title} className="mb-4">
          <h3 className="font-pixel text-[11px] mb-2" style={{ color: headingColor }}>
            {section.title}
          </h3>

          {section.body?.map((p) => (
            <p key={p} className="text-[13px] leading-relaxed mb-2" style={{ color: bodyColor }}>
              {p}
            </p>
          ))}

          {section.list && (
            <ul className="mb-2 list-disc space-y-1 pl-5">
              {section.list.map((item) => (
                <li key={item} className="text-[13px] leading-relaxed" style={{ color: bodyColor }}>
                  {item}
                </li>
              ))}
            </ul>
          )}

          {section.after?.map((p) => (
            <p key={p} className="text-[13px] leading-relaxed mb-2" style={{ color: bodyColor }}>
              {p}
            </p>
          ))}
        </section>
      ))}

      <section className="pt-3" style={{ borderTop: `1px solid ${ruleColor}` }}>
        <h3 className="font-pixel text-[11px] mb-2" style={{ color: headingColor }}>
          9. Contact
        </h3>
        <p className="text-[13px] leading-relaxed" style={{ color: bodyColor }}>
          Questions about this notice, or about how Lunaria Cafe handles data, can go to the
          project team:
        </p>
        <ul className="mt-2 space-y-1 text-[13px]" style={{ color: bodyColor }}>
          <li>Project: {contact.project}</li>
          <li>Developers: {contact.developers}</li>
          <li>Institution: {contact.institution}</li>
          {/* No invented address: a contact line that goes nowhere is worse
              than a visible gap, because someone will write to it. */}
          <li style={{ color: contact.email ? bodyColor : mutedColor }}>
            Contact: {contact.email ?? '— to be added before submission —'}
          </li>
        </ul>
      </section>
    </div>
  );
}
