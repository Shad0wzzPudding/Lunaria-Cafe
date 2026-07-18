import { INITIAL_FURNITURE } from './constants';
import { DEFAULT_HEX, DEFAULT_SHADE } from '@/lib/theme/themeDeriver';

export const initialState = {
  phase: 'menu',
  lastSession: null,
  coins: 0,
  reputation: 0,
  cafe: {
    name: 'Lunaria Cafe',
    currentCustomers: 0,
    maxCustomers: 8,
    timeOfDay: 'day',
    bgMode: 'immersive', // 'immersive' | 'reallife' | 'freestyle'
    decorateMode: false,
    decorateTool: 'place',
    placeFurnitureType: 'plant_big',
    placeFurnitureRotation: 0,
    pendingFurniture: null,
    furniture: INITIAL_FURNITURE,
  },
  focus: {
    status: 'idle',
    elapsed: 0,
    duration: 25 * 60,
    mode: 'pomodoro',
    repPenaltyLastAt: null,
    roundControlled: false, // true while a teacher's live round drives this session
    endsAt: null,           // wall-clock ms when a timed round ends (null = open-ended)
    sessionRep: 0,          // reputation earned THIS live session (held out of lifetime)
    boostActive: false,     // a focus-boost ticket was spent on THIS session (×1.15 score)
  },
  boosts: {
    // Starter pack: granted once for opening the welcome letter. The letter
    // stays re-openable, so idempotence lives here — not in the envelope UI.
    starterPackClaimed: false,
    focusTickets: 0, // ×1.15 attention-score tickets; consumed at session START, never refunded
  },
  attention: {
    score: 70,
    // The engine's last unamplified reading. Internal baseline for the
    // focus-boost gain math (each event's delta is measured against it, so
    // the boost amplifies real climb without compounding). Nothing external
    // reads it — competitive surfaces read the boosted `score`.
    rawScore: 70,
    chaosLevel: 0,
    phoneDetected: false,
    userPresent: true,
    chaosEvents: [],
    sessionDistractions: 0,
    absenceCounted: false,
    warningMessage: '',
    phones: [],
    source: 'offline',
    phoneWarningStart: null,
    phoneFreeSince: null,
    gazeFocusedSince: null,
    userAbsentSince: null,
    userPresentSince: null,
    debugAttentionLock: false,
  },
  journal: {
    noteHeader: 'Extra notes.',
    note: 'All of the Potion must brews with Heart, so don\'t forget to put all of your effort into it <3\n\n(...Actully, it\'s Penisinalia for curing Mana sickness...) \n\n- From Lulys the cafe staff.',
    todoHeader: 'To-do list for the week.',
    todos: [{
        "id": "todo-1781717297908-98pz1x",
        "text": "Clean the tables.",
        "completed": false,
        "createdAt": 1781717297908
      },
      {
        "id": "todo-1781717305452-fs9ygy",
        "text": "Feed Rabbits.",
        "completed": false,
        "createdAt": 1781717305452
      },
      {
        "id": "todo-1781717375100-fctfnl",
        "text": "Go gather suppiles from the town.",
        "completed": false,
        "createdAt": 1781717375100
      },
      {
        "id": "todo-1781717385583-szwthd",
        "text": "Wandering into the night....",
        "completed": false,
        "createdAt": 1781717385583
      }],
  },
  npcs: {
    customers: [],
    rabbits: [
      { id: 'rabbit-1', x: 200, y: 350, mood: 'happy' },
      { id: 'rabbit-2', x: 500, y: 400, mood: 'sleepy' },
    ],
    cats: [],
    major: [
      { id: 'npc-1', name: 'Mira', emoji: '🦊', role: 'Regular', personality: 'Cheerful and curious', schedule: 'Every evening', favoriteOrder: 'Moon Latte'    },
      { id: 'npc-2', name: 'Theo', emoji: '🧙', role: 'Scholar', personality: 'Quiet and studious',   schedule: 'Late nights',   favoriteOrder: 'Dark Brew'     },
      { id: 'npc-3', name: 'Luna', emoji: '🌙', role: 'Dreamer', personality: 'Whimsical and soft',   schedule: 'Weekends',      favoriteOrder: 'Starberry Tea' },
    ],
  },
  audio: {
    masterVolume: 0.8,
    musicVolume: 0.6,
    ambienceVolume: 0.5,
    sfxVolume: 0.7,
    musicEnabled: true,
    musicTrack: 'shuffle', // 'shuffle' | 0 | 1 | 2 (index into MUSIC_TRACKS)
    rainEnabled: true,
    fireplaceEnabled: false,
    chatterEnabled: true,
    sfxCoinChime: true,
    sfxSessionStart: true,
    sfxSessionFinishDone: true,
    sfxSessionFinishFail: true,
    sfxPetShopOpen: true,
    sfxPetShopClose: true,
    sfxJournalOpen: true,
    sfxJournalClose: true,
    sfxPhoneWarning: true,
    sfxLetterOpen: true,
  },
  stats: {
    totalSessions: 0,
    totalFocusSeconds: 0,
    totalMinutes: 0,
    bestStreak: 0,
    lapsedStreak: 0,
    lastSessionDate: null,
    totalFocusMinutes: 0,
    lastFocusScore: null,
    coinsEarned: 0,
    customersTotal: 0,
    currentStreak: 0,
    chaosEvents: 0,
    todayMinutes: 0,
    todaySeconds: 0,
    todayDate: null,
    dailyGoal: 60,
    resetPeriod: 'daily',
    statsMode: 'period',
    periodSessions: 0,
    periodFocusSeconds: 0,
    periodCoinsEarned: 0,
    periodCustomersTotal: 0,
    periodChaosEvents: 0,
    weeklyData: [0, 0, 0, 0, 0, 0, 0],
    weekStartDate: null,
  },
  ui: {
    popups: [],
    coinFloat: null,
    debugDate: null,
    leaderboardRoom: null, // { id, name } — which classroom's board is open
  },
  pets: {
    owned: [],
  },
  settings: {
    // False until the player opens the license envelope on the Help page.
    // Drives ALL the first-time letter signposts — the menu's mail bubble,
    // the "Read the letter" button glow, and Lulys on the Help page — which
    // retire together the moment the envelope is opened. (A press-based
    // lifecycle for the glow was tried and cut: pressing without reading
    // killed the signpost before its job was done.) Old saves lack the key —
    // undefined is treated as not-yet-opened.
    welcomeLetterOpened: false,
    focusViewMode: null, // null = not chosen yet | 'game' | 'zen'
    performanceMode: false,
    aiMode: 'browser',
    theme: {
      mode: 'classic',
      dayHex: DEFAULT_HEX.day,
      nightHex: DEFAULT_HEX.night,
      dayShadeHex: DEFAULT_SHADE.day,
      nightShadeHex: DEFAULT_SHADE.night,
    },
  },
};
