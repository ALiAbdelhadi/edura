export type MediaSlot = {
  id: string;
  kind: "image" | "video";
  src: string | null;
  poster?: string | null;
  aspect: number;
  frame: "plate" | "phone";
  capture: { width: number; height: number };
};

const ASPECT_DESKTOP = 16 / 10;
const ASPECT_STILL = 4 / 3;
const ASPECT_PHONE = 390 / 844;

export const MEDIA = {
  counterBoard: {
    id: "counter-board",
    kind: "video",
    src: "/system/counter-board.mp4",
    poster: "/system/counter-board-poster.webp",
    aspect: ASPECT_DESKTOP,
    frame: "plate",
    capture: { width: 1440, height: 900 },
  },

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

  roleStaff: {
    id: "role-staff",
    kind: "image",
    src: null,
    aspect: ASPECT_DESKTOP,
    frame: "plate",
    capture: { width: 1440, height: 900 },
  },

  settlementConfirm: {
    id: "settlement-confirm",
    kind: "image",
    src: "/system/settlement-confirm.webp",
    aspect: ASPECT_STILL,
    frame: "plate",
    capture: { width: 1120, height: 840 },
  },


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
  assistantDoor: {
    id: "assistant-door",
    kind: "image",
    src: "/system/assistant-door.webp",
    aspect: ASPECT_PHONE,
    frame: "phone",
    capture: { width: 390, height: 844 },
  },
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

export function hasAsset(slot: MediaSlot) {
  return slot.src !== null;
}
