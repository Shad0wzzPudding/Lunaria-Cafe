import { CAMPUS, TEAM_MEMBERS } from './licenseText';

/**
 * The Privacy Notice, as data rather than markup.
 *
 * Three surfaces render it — the players' welcome gate, the instructors'
 * notice, and the Help page — in three different palettes. Structured sections
 * let each bring its own styling to one set of words, the same reason the NSC
 * license text lives in licenseText.jsx. A privacy notice that says different
 * things in different places is worse than one that is merely plain.
 */

export const PRIVACY_LAST_UPDATED = '10 August 2026';

// The address readers are told to write to. It belongs here rather than in the
// component so `privacyContact().email` is truthy — the contact line styles
// itself as real text or as a placeholder off exactly that value.
export const PRIVACY_CONTACT_EMAIL = 'Sutthikan.kra@student.mahidol.ac.th';

export const PRIVACY_INTRO =
  'Lunaria Cafe is a student project developed for the National Software Contest (NSC) 2026. ' +
  'We respect your privacy and are committed to protecting your personal data while you use ' +
  'the application. This notice explains what the application processes, what it stores, and ' +
  'what stays on your own device.';

export const PRIVACY_SECTIONS = [
  {
    title: '1. Information We Process',
    body: [
      'Lunaria Cafe may access your webcam while the attention-monitoring feature is enabled. The webcam is used solely to analyse your attention and distraction during a focus session.',
      'While that feature is running, the application processes:',
    ],
    list: [
      'Facial landmarks detected from the webcam',
      'Attention and distraction-related signals, such as gaze direction and whether a face is present',
      'Object detection results relating to smartphone usage',
      'Focus scores calculated from the above',
    ],
    after: ['Lunaria Cafe does not use facial data to identify or authenticate you.'],
  },
  {
    title: '2. Local Processing',
    body: [
      'All webcam analysis happens locally, inside your web browser, on your own device. The detection models are downloaded to your browser and run there.',
      'Your webcam images and video are never uploaded to our servers, and the application does not transmit camera footage to any third party for processing.',
    ],
  },
  {
    title: '3. What Is Stored',
    body: [
      'Lunaria Cafe does not store or retain webcam images, video recordings, or facial images. Nothing from the camera is written to disk or to a database — the video is analysed frame by frame and discarded.',
      'The application does store information needed for the game and for classrooms:',
    ],
    list: [
      'Your account details: email address and display name',
      'Game progress: coins, reputation, furniture and decorations, pets, and settings',
      'Focus statistics: session counts, focus time, streaks, and your most recent focus score',
      'Journal entries you write yourself, including notes and to-do items',
      'A record of the device currently signed in, so one account runs in one place at a time',
      'The date you accepted this notice',
    ],
  },
  {
    title: '4. How the Information Is Used',
    body: ['The information the application processes is used to:'],
    list: [
      'Monitor attention during a focus session',
      'Detect potential distraction events',
      'Calculate focus-related scores',
      'Provide feedback and in-game rewards',
      'Support the gameplay and classroom features of Lunaria Cafe',
    ],
    after: [
      'We do not use webcam data for advertising, facial recognition, profiling, or identifying individual users.',
    ],
  },
  {
    title: '5. Classrooms and Sharing',
    body: [
      'If you join a classroom, the instructor who owns that classroom can see your display name and your progress figures — focus score, reputation, coins, and focus time — including on the classroom leaderboard alongside other members.',
      'Your journal entries are private and are never shown to instructors. No webcam data of any kind is shared with instructors, because none of it leaves your device.',
      'If you do not join a classroom, none of your data is shared with anyone else.',
    ],
  },
  {
    title: '6. Third-Party Services',
    body: [
      'Lunaria Cafe uses Supabase for account authentication, database storage, and synchronising game data between your devices. The stored information listed in section 3 is held there.',
      'Webcam images and video are processed locally and are never uploaded to Supabase or to any other external service.',
    ],
  },
  {
    title: '7. Your Choices',
    body: ['Webcam access is optional and always requires permission from your browser. You may:'],
    list: [
      'Decline webcam access when your browser asks',
      'Withdraw webcam access at any time through your browser settings',
      'Stop using the attention-monitoring feature at any time',
    ],
    after: [
      'If webcam access is unavailable, the cafe still runs — only the features that depend on attention detection are affected.',
    ],
  },
  {
    title: '8. Data Security',
    body: [
      'We take reasonable measures to protect the information Lunaria Cafe stores. Access to your save and your account details is restricted to your own signed-in account, and to the instructor of a classroom you have joined, for the progress figures described in section 5.',
      'Because webcam analysis happens on your own device, camera footage never needs to be transmitted or stored at all.',
    ],
  },
];

export function privacyContact() {
  return {
    project: 'Lunaria Cafe',
    developers: TEAM_MEMBERS.map((m) => m.name).join(', '),
    institution: CAMPUS,
    email: PRIVACY_CONTACT_EMAIL,
  };
}
