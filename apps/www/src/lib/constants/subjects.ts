export const SUBJECTS = [
  "Math",
  "Physics",
  "Chemistry",
  "Biology",
  "Arabic",
  "English",
  "French",
  "German",
  "History",
  "Geography",
  "Philosophy",
  "Economics",
  "Accounting",
  "Statistics",
  "Computer Science",
  "Religious Studies",
  "Social Studies",
  "Art",
  "Music",
  "Physical Education",
] as const;

export type Subject = (typeof SUBJECTS)[number];

export function isSubject(value: string): value is Subject {
  return (SUBJECTS as readonly string[]).includes(value);
}
