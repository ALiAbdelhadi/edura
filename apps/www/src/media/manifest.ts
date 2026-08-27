/**
 * THE ASSET MANIFEST — the one place the page learns what imagery exists.
 *
 * Every screenshot and clip of the real system is declared here with the
 * shape it will occupy, BEFORE the file exists. The layout is therefore
 * final now: when a file lands, the only edit is `src`, and nothing reflows,
 * because the plate has been reserving that exact aspect ratio all along.
 *
 * `src: null` renders a reserved plate — a pre-ruled blank in the page's own
 * language, carrying its caption and its intended size. That is deliberately
 * NOT a grey box with a mountain icon: a reserved plate reads as a space held
 * open in a book, which is what it is.
 *
 * Shooting notes live in ../../docs/ASSETS.md. Read that before capturing.
 */

export type MediaSlot = {
  /** Stable key. Also the expected filename stem under /public/system/. */
  id: string;
  kind: "image" | "video";
  /** Path under /public once the asset exists. null = reserved. */
  src: string | null;
  /** Poster still for a video slot, shown before play and under reduced motion. */
  poster?: string | null;
  /** width / height. Fixed now so the reserved plate holds the final box. */
  aspect: number;
  /** The frame the shot is presented in. */
  frame: "plate" | "phone";
  /** Intended capture size, in CSS px at 1x. Shoot at 2x. */
  capture: { width: number; height: number };
};

const ASPECT_DESKTOP = 16 / 10;
const ASPECT_STILL = 4 / 3;
const ASPECT_PHONE = 390 / 844;

export const MEDIA = {
  /**
   * The counter board, working. The single most valuable clip on the site:
   * cash collected and attendance recorded in one flow, without leaving the
   * page. It sits in the counter section, which is the only section whose
   * claim is about SPEED — and speed is the one thing a still cannot show.
   */
  counterBoard: {
    id: "counter-board",
    kind: "video",
    // MP4 ONLY, deliberately. A WebM is rendered beside it and is ~35% smaller,
    // but `SystemLoop` sets a single `src` attribute rather than emitting
    // <source> children, so a second path here would be a field nothing reads.
    // H.264 + yuv420p plays everywhere that matters, including Safari and older
    // Android; the WebM sits in /public/system ready for the day the player
    // learns to choose. Changing the player is out of scope for this pass.
    src: "/system/counter-board.mp4",
    // The poster is the LAST frame, not the first: a reduced-motion reader sees
    // this instead of the clip, so it has to carry the outcome — four checked
    // in, four still waiting — rather than the queue the clip opens on.
    poster: "/system/counter-board-poster.webp",
    aspect: ASPECT_DESKTOP,
    frame: "plate",
    capture: { width: 1440, height: 900 },
  },

  /**
   * One plate per role, swapped by the role the reader is on. Five separate
   * plates stacked down the page would be five screenshots nobody compares;
   * one plate that changes is a comparison, and it makes the roles list an
   * instrument rather than a list.
   */
  roleCenter: {
    id: "role-center",
    kind: "image",
    src: "/system/role-center.webp",
    aspect: ASPECT_DESKTOP,
    frame: "plate",
    capture: { width: 1440, height: 900 },
  },
  roleTeacher: {
    id: "role-teacher",
    kind: "image",
    /**
     * Deliberately the SAME FILE as `teacherTeaching`. ASSETS.md describes both
     * as the teacher holding the split before confirming, which is one screen
     * described twice — and the page is not tall enough for two distinct
     * 1440x900 frames, so forcing a difference produced identical bytes. One
     * file, two slots, no duplicate weight.
     */
    src: "/system/teacher-teaching.webp",
    aspect: ASPECT_DESKTOP,
    frame: "plate",
    capture: { width: 1440, height: 900 },
  },
  roleParent: {
    id: "role-parent",
    kind: "image",
    src: "/system/role-parent.webp",
    aspect: ASPECT_DESKTOP,
    frame: "plate",
    capture: { width: 1440, height: 900 },
  },
  roleStudent: {
    id: "role-student",
    kind: "image",
    src: "/system/role-student.webp",
    aspect: ASPECT_DESKTOP,
    frame: "plate",
    capture: { width: 1440, height: 900 },
  },
  roleAssistant: {
    id: "role-assistant",
    kind: "image",
    src: "/system/role-assistant.webp",
    aspect: ASPECT_DESKTOP,
    frame: "plate",
    capture: { width: 1440, height: 900 },
  },

  /**
   * The staff portal. `src: null` on purpose — this page ships before the
   * shot exists, and a reserved plate holds the exact box the image will
   * occupy rather than letting the page reflow when it lands. Shooting notes:
   * the receptionist's screen mid-shift, so the reader sees the ONE view a
   * front-desk hire is given rather than the owner's whole console.
   */
  roleStaff: {
    id: "role-staff",
    kind: "image",
    src: null,
    aspect: ASPECT_DESKTOP,
    frame: "plate",
    capture: { width: 1440, height: 900 },
  },

  /**
   * The confirm step that quotes the split before it is committed. This is
   * the money section's evidence: the section claims the quote and the ledger
   * are one function, and this is the screen where a reader can check it.
   */
  settlementConfirm: {
    id: "settlement-confirm",
    kind: "image",
    src: "/system/settlement-confirm.webp",
    aspect: ASPECT_STILL,
    frame: "plate",
    capture: { width: 1120, height: 840 },
  },


  /* ── THE ROLE PAGES ─────────────────────────────────────────────────────
     One plate per capability GROUP, not per capability. Nineteen screenshots
     down a center's page is nineteen things nobody looks at; one per group is
     four, and each one has to earn its place by showing the group's hardest
     screen. The `role-*` shots above are reused as each page's hero, so a
     role costs one hero plus its groups.

     `student.money` deliberately has no plate: a wallet balance is a number,
     and a screenshot of a number is worth less than the sentence beside it. */
  centerCounter: {
    id: "center-counter",
    kind: "image",
    src: "/system/center-counter.webp",
    aspect: ASPECT_DESKTOP,
    frame: "plate",
    capture: { width: 1440, height: 900 },
  },
  centerOps: {
    id: "center-ops",
    kind: "image",
    src: "/system/center-ops.webp",
    aspect: ASPECT_DESKTOP,
    frame: "plate",
    capture: { width: 1440, height: 900 },
  },
  centerMoney: {
    id: "center-money",
    kind: "image",
    src: "/system/center-money.webp",
    aspect: ASPECT_DESKTOP,
    frame: "plate",
    capture: { width: 1440, height: 900 },
  },
  centerTeam: {
    id: "center-team",
    kind: "image",
    src: "/system/center-team.webp",
    aspect: ASPECT_DESKTOP,
    frame: "plate",
    capture: { width: 1440, height: 900 },
  },
  teacherTeaching: {
    id: "teacher-teaching",
    kind: "image",
    src: "/system/teacher-teaching.webp",
    aspect: ASPECT_DESKTOP,
    frame: "plate",
    capture: { width: 1440, height: 900 },
  },
  teacherManage: {
    id: "teacher-manage",
    kind: "image",
    src: "/system/teacher-manage.webp",
    aspect: ASPECT_DESKTOP,
    frame: "plate",
    capture: { width: 1440, height: 900 },
  },
  teacherWallet: {
    id: "teacher-wallet",
    kind: "image",
    src: "/system/teacher-wallet.webp",
    aspect: ASPECT_DESKTOP,
    frame: "plate",
    capture: { width: 1440, height: 900 },
  },
  parentChildren: {
    id: "parent-children",
    kind: "image",
    src: "/system/parent-children.webp",
    aspect: ASPECT_DESKTOP,
    frame: "plate",
    capture: { width: 1440, height: 900 },
  },
  parentPay: {
    id: "parent-pay",
    kind: "image",
    src: "/system/parent-pay.webp",
    aspect: ASPECT_PHONE,
    frame: "phone",
    capture: { width: 390, height: 844 },
  },
  /**
   * The assistant's distinctive screen. The teaching group otherwise reuses
   * the teacher's plates ON PURPOSE — an assistant sees the teacher's own
   * screens, which is the page's claim — but the door check-in is the job the
   * role exists for, and it is done standing at a hall door, so it is a phone.
   */
  assistantDoor: {
    id: "assistant-door",
    kind: "image",
    src: "/system/assistant-door.webp",
    aspect: ASPECT_PHONE,
    frame: "phone",
    capture: { width: 390, height: 844 },
  },
  /**
   * THE THREE CLIPS ADDED IN THE IMAGERY PASS.
   *
   * Each one exists because a still genuinely cannot carry its claim, which is
   * the only bar a moving image on this site has to clear:
   *  - `settlementLoop` — the split ARRIVING, before anything is committed. A
   *    still of the quote proves the number; only motion proves the order.
   *  - `walkInLoop` — a student who did not exist thirty seconds ago walking
   *    out with an id. The argument is the elapsed time.
   *  - `doorLoop` — the second check-in, which is two taps at a hall door and
   *    reads as a still of a list otherwise.
   *
   * All three ship MP4 only, for the reason recorded on `counterBoard`.
   */
  settlementLoop: {
    id: "settlement",
    kind: "video",
    src: "/system/settlement.mp4",
    poster: "/system/settlement-poster.webp",
    aspect: ASPECT_DESKTOP,
    frame: "plate",
    capture: { width: 1440, height: 900 },
  },
  walkInLoop: {
    id: "walk-in",
    kind: "video",
    src: "/system/walk-in.mp4",
    poster: "/system/walk-in-poster.webp",
    aspect: ASPECT_DESKTOP,
    frame: "plate",
    capture: { width: 1440, height: 900 },
  },
  doorLoop: {
    id: "assistant-door-loop",
    kind: "video",
    src: "/system/assistant-door.mp4",
    poster: "/system/assistant-door-poster.webp",
    aspect: ASPECT_PHONE,
    frame: "phone",
    capture: { width: 390, height: 844 },
  },

  studentLearn: {
    id: "student-learn",
    kind: "image",
    src: "/system/student-learn.webp",
    aspect: ASPECT_PHONE,
    frame: "phone",
    capture: { width: 390, height: 844 },
  },

  /**
   * The student card on a phone. It belongs in a phone frame and nothing
   * else: a narrow screenshot without one reads as a crop of a desktop page.
   */
  studentCard: {
    id: "student-card",
    kind: "image",
    src: "/system/student-card.webp",
    aspect: ASPECT_PHONE,
    frame: "phone",
    capture: { width: 390, height: 844 },
  },
} satisfies Record<string, MediaSlot>;

export type MediaKey = keyof typeof MEDIA;

/** True once a real file has been declared for this slot. */
export function hasAsset(slot: MediaSlot) {
  return slot.src !== null;
}
