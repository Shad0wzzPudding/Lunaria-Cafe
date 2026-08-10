import { Fragment } from 'react';

/**
 * The NSC license text and the acknowledgement wording, in one place.
 *
 * Two surfaces ask for the same acknowledgement — the players' welcome letter
 * (LicenseEnvelope) and the instructors' formal notice (NscNotice) — and they
 * look nothing alike. Legal text duplicated across two files drifts; this
 * module lets each surface bring its own palette to the same words.
 */

export const ADVISOR_NAME = '"Dr. Punyanuch Borwarnginn"';
export const PROJECT_NAME = '"Lunaria Cafe"';
export const CAMPUS = 'Mahidol University Salaya Campus';

// The three developers, each signing in their own ink where the surface wants
// it — muted "pen on cream paper" shades, not UI-bright colors.
export const TEAM_MEMBERS = [
  { name: 'Thanita Thitakan',        color: '#4a8b57' }, // greenish
  { name: 'Sawastachod Siriphatum',  color: '#1f7f8c' }, // cyan
  { name: 'Pisitpong Srisuthangkul', color: '#c1701f' }, // orangish
];

/**
 * What the first checkbox on both gates commits the reader to having understood.
 *
 * `voice` is REQUIRED, with no default. Both sentences begin "I understand /
 * acknowledge that…", so every pronoun in the tail has to be both in the
 * reader's own voice and TRUE of them: the camera runs on the player's machine
 * and never on the instructor's, so the two cannot be told the same thing. A
 * default here would let a future third surface silently claim the wrong one,
 * which is the exact bug this parameter was introduced to fix.
 */
// Declared ABOVE its callers on purpose. `const` is hoisted but sits in the
// temporal dead zone until evaluated, so a caller running at MODULE scope —
// exactly what `const LICENSE_PARAGRAPHS = licenseParagraphs(...)` already does
// in two files — would throw a ReferenceError at import and blank the app.
const VOICES = {
  player:     { webcam: 'my webcam',             device: 'my device',                 person: 'me'   },
  instructor: { webcam: "each student's webcam", device: "each student's own device",  person: 'them' },
};

export function consentStatement({ voice }) {
  const v = VOICES[voice];
  if (!v) throw new Error(`consentStatement: unknown voice "${voice}"`);
  return (
    'Lunaria Cafe is a student project developed for the National Software Contest (NSC) 2026. ' +
    `The application uses ${v.webcam} only to analyse attention during learning. Webcam data is ` +
    `processed locally on ${v.device} and is not uploaded, stored, or shared with third parties. ` +
    `The system does not use facial data to identify or authenticate ${v.person}.`
  );
}

/** What the second checkbox commits the reader to: they have read the notice. */
export function privacyStatement({ voice }) {
  if (!VOICES[voice]) throw new Error(`privacyStatement: unknown voice "${voice}"`);
  return voice === 'instructor'
    ? 'I have read the Privacy Notice and understand what Lunaria Cafe processes, stores, and shares with instructors.'
    : 'I have read the Privacy Notice and understand what Lunaria Cafe processes, stores, and shares.';
}

/**
 * The three NSC license paragraphs, as an array of fragments.
 *
 * @param ink      color for the filled-in fields (campus, advisor, project)
 * @param teamInk  true renders each developer's name in their own color;
 *                 false leaves the names in the surrounding text color, which
 *                 suits a formal document better than a hand-signed letter.
 */
export function licenseParagraphs({ ink = 'inherit', teamInk = true } = {}) {
  const Ink = ({ children }) => <span style={{ color: ink }}>{children}</span>;

  const Team = () => (
    <>
      {TEAM_MEMBERS.map((m, i) => (
        <Fragment key={m.name}>
          {/* separators stay in the surrounding print color, outside the ink spans */}
          {i > 0 && (i === TEAM_MEMBERS.length - 1 ? ', and ' : ', ')}
          <span style={teamInk ? { color: m.color } : undefined}>{m.name}</span>
        </Fragment>
      ))}
    </>
  );

  return [
    <>This software is a work developed by <Team /> from <Ink>{CAMPUS}</Ink> under the provision of <Ink>{ADVISOR_NAME}</Ink> under <Ink>{PROJECT_NAME}</Ink>, which has been supported by the National Science and Technology Development Agency (NSTDA), in order to encourage pupils and students to learn and practice their skills in developing software.</>,
    <>Therefore, the intellectual property of this software shall belong to the developer and the developer gives NSTDA a permission to distribute this software as an &quot;as is&quot; and non-modified software for a temporary and non-exclusive use without remuneration to anyone for his or her own purpose or academic purpose, which are not commercial purposes.</>,
    <>In this connection, NSTDA shall not be responsible to the user for taking care, maintaining, training, or developing the efficiency of this software. Moreover, NSTDA shall not be liable for any error, software efficiency and damages in connection with or arising out of the use of the software.</>,
  ];
}
