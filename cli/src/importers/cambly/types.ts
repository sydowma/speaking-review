export type CamblyLessonStatus = "downloaded" | "analyzed" | "failed" | "not-downloadable";

export interface CamblyLessonRecord {
  provider: "cambly";
  lessonId: string;
  lessonUrl?: string;
  recordedAt?: string;
  tutorName?: string;
  downloadedVideo?: string;
  reviewId?: string;
  status: CamblyLessonStatus;
  updatedAt: string;
  error?: string;
}

export interface CamblyImportState {
  schemaVersion: 1;
  lessons: Record<string, CamblyLessonRecord>;
}
