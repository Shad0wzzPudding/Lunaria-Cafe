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

// What the checkbox on both gates commits the reader to having understood.
export const CONSENT_STATEMENT =
  'Lunaria Cafe is a student project developed for the National Software Contest (NSC) 2026, ' +
  'and this website does not collect any pictures or personal sensitive data — the attention ' +
  'camera runs entirely on the viewer’s own device.';

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
