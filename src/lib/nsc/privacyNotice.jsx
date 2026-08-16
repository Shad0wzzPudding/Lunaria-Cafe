import { CAMPUS, TEAM_MEMBERS } from './licenseText';

/**
 * The Privacy Notice, as data rather than markup.
 *
 * Three surfaces render it — the players' welcome gate, the instructors'
 * notice, and the Help page — in three different palettes. Structured sections
 * let each bring its own styling to one set of words, the same reason the NSC
 * license text lives in licenseText.jsx. A privacy notice that says different
 * things in different places is worse than one that is merely plain.
 *
 * When a feature changes what leaves a player's device, THIS FILE IS PART OF
 * THE FEATURE. Section 6 must match what visit_friend_cafe() actually returns
 * and what a study-room board actually shows; section 5 must match
 * get_classroom_stats(). A notice that under-describes sharing is worse than
 * no notice, because the player agreed to it.
 */

export const PRIVACY_LAST_UPDATED = '16 August 2026';

/**
 * The version a player's consent is measured against.
 *
 * A full INSTANT, not a bare date, and it must be AT OR AFTER the moment the
 * wording actually changed. Two ways to get this wrong, both of which let
 * someone keep an agreement to text they never saw:
 *   • a bare date means UTC midnight, so anyone who accepted the OLD notice
 *     earlier that same day compares as up to date;
 *   • an instant set before the edit actually landed leaves the same window,
 *     just a narrower one.
 * The students' gate uses string equality and re-asks regardless, so an
 * instant that is too early makes the two gates silently disagree.
 *
 * BUMP THIS whenever the privacy notice or the NSC license text changes in a
 * way that alters what a player is agreeing to — new data leaving the device,
 * a new party seeing it, a new default. Bumping it re-opens the letter for
 * everyone who accepted an earlier version, because their agreement was to
 * different words. Do NOT bump it for typos or rewording that changes nothing.
 *
 * When you bump it, update all three together: this, PRIVACY_LAST_UPDATED, and
 * CONSENT_CHANGE_SUMMARY — the last is shown to returning players and silently
 * becomes a lie if it is left describing the previous change.
 */
export const CONSENT_VERSION = '2026-08-16T04:30:00Z';

/**
 * What changed, in one clause, for the returning-player line in the letter.
 * Reads after "Our Privacy Notice was updated on <date> — it now ".
 */
export const CONSENT_CHANGE_SUMMARY =
  'covers friends, visiting each other\u2019s cafes, and study rooms';

/** Has this player agreed to the notice as it stands NOW? */
export function hasCurrentConsent(settings) {
  return settings?.nscConsentVersion === CONSENT_VERSION;
}

/**
 * Instructor side. Their acceptance is a timestamp on the profile rather than
 * a version in a save, so "current" means accepted at or after the version
 * date. No migration needed — an older stamp simply reads as out of date.
 */
export function consentTimestampIsCurrent(acceptedAt) {
  if (!acceptedAt) return false;
  const accepted = new Date(acceptedAt).getTime();
  const required = new Date(CONSENT_VERSION).getTime();
  return Number.isFinite(accepted) && Number.isFinite(required) && accepted >= required;
}

// The address readers are told to write to. It belongs here rather than in the
// component so `privacyContact().email` is truthy — the contact line styles
// itself as real text or as a placeholder off exactly that value.
export const PRIVACY_CONTACT_EMAIL = 'thanita.thi@student.mahidol.ac.th';

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
      'Your webcam images and video are never uploaded to any server, and the application does not transmit camera footage to any third party for processing.',
    ],
  },
  {
    title: '3. What Is Stored',
    body: [
      'Lunaria Cafe does not store or retain webcam images, video recordings, or facial images. Nothing from the camera is written to disk or to a database — the video is analysed frame by frame and discarded.',
      'The application does store information needed for the game, for classrooms, and for friends:',
    ],
    list: [
      'Your account details: email address and display name',
      'Game progress: coins, reputation, furniture and decorations, pets, and settings',
      'Focus statistics: session counts, focus time, streaks, and your most recent focus score',
      'Journal entries you write yourself, including notes and to-do items',
      'Your account code, the friends you have added, and the friend requests you have sent or received',
      'A record of each live session you take part in, whether run by an instructor or by a friend: the focus time, coins, reputation and average focus score you earned during it, and whether you paused or left',
      'A randomly generated code that identifies the browser currently signed in, so one account runs in one place at a time. This code is created at random and stored in your browser; it does not use your IP address, location, or any hardware identifier, and cannot be used to identify your actual device',
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
      'Support the gameplay, classroom, and friends features of Lunaria Cafe',
    ],
    after: [
      'We do not use webcam data for advertising, facial recognition, profiling, or identifying individual users.',
    ],
  },
  {
    title: '5. Classrooms and Sharing',
    body: [
      'If you join a classroom, the instructor who owns that classroom can see your display name and your progress figures — focus score, session count, reputation, coins, and focus time — including on the classroom leaderboard alongside other members.',
      'An instructor can also invite you to their classroom. An invitation on its own shares nothing: you choose whether to accept, and you only become a member — and only then share the figures above — if you do.',
      'Your journal entries are private and are never shown to instructors. No webcam data of any kind is shared with instructors, because none of it leaves your device.',
      'Aside from classrooms you join and the friends features described in section 6, none of your data is shared with anyone else.',
    ],
  },
  {
    title: '6. Friends and Social Features',
    body: [
      'Lunaria Cafe lets you add other players as friends using an account code. Becoming friends requires both people to agree: one person sends a request using the other’s account code, and the other accepts or declines it. Using these features is your choice — if you never add a friend, nothing in this section applies to you.',
      'Once a request is accepted, a friend can see your display name, the date you became friends, whether you are currently online, and when you were last active.',
      'A friend can also visit your cafe. Visiting shows them the cafe as it was when you last saved it: its name, the furniture and decorations you have placed, your pets, your cafe upgrades, and the time of day. It does not show your coins, your reputation, your focus statistics, or your journal. Visiting is switched ON by default, and you can switch it off at any time in Settings, which closes your cafe to everyone.',
      'You can also study together in a study room opened by you or by a friend. Everyone in the room shares a live scoreboard, so while a session is running the others can see your display name, the focus time, coins and reputation you earn during that session, your average focus score, how many distractions were detected, and whether you have paused or left. People in the same room can also look at each other’s cafes, on the same terms as a visit above.',
      'A study room is opened by one person and joined by their friends, so someone in the room with you may be a friend of the host rather than a friend of yours.',
      'What you share in a room belongs to that session. While the room is running, the people in it can see the figures above; once it ends, only the people who actually took part — and the person who opened it — can still see that session\u2019s figures.',
      'Friends never see your email address, your journal entries, your lifetime game progress, or any webcam-related data. You can remove a friend at any time, which ends all of the above.',
    ],
  },
  {
    title: '7. Third-Party Services',
    body: [
      'Lunaria Cafe uses Supabase for account authentication, database storage, and synchronising game data between your devices. The stored information listed in section 3 is held there.',
      'Webcam images and video are processed locally and are never uploaded to Supabase or to any other external service.',
    ],
  },
  {
    title: '8. Your Choices',
    body: ['Webcam access is optional and always requires permission from your browser. You may:'],
    list: [
      'Decline webcam access when your browser asks',
      'Withdraw webcam access at any time through your browser settings',
      'Stop using the attention-monitoring feature at any time',
      'Close your cafe to visitors in Settings, or remove a friend, at any time',
    ],
    after: [
      'If webcam access is unavailable, the cafe still runs — only the features that depend on attention detection are affected.',
    ],
  },
  {
    title: '9. Data Security',
    body: [
      'We take reasonable measures to protect the information Lunaria Cafe stores. Access to your save and your account details is restricted to your own signed-in account, to the instructor of a classroom you have joined for the progress figures described in section 5, and to friends for the information described in section 6.',
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
