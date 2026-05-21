export type UserRole = 'student' | 'teacher' | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  classId?: string;
  onboardingComplete: boolean;
  xp?: number;
  createdAt: Date;
  updatedAt: Date;
}

// ── Form block types ──────────────────────────────────────────────────────────

export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'pdf'
  | 'infographic'
  | 'short-answer'
  | 'long-answer'
  | 'multiple-choice'
  | 'checkbox'
  | 'ordering'
  | 'image-upload';

export type InfographicColor = 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'slate';

interface BaseBlock { id: string; type: BlockType; half?: boolean }
export interface HeadingBlock       extends BaseBlock { type: 'heading';         text: string }
export interface ParagraphBlock     extends BaseBlock { type: 'paragraph';       text: string }
export interface ImageBlock         extends BaseBlock { type: 'image';           url: string; caption?: string }
export interface PdfBlock           extends BaseBlock { type: 'pdf';             url: string; caption?: string; height?: number }
export interface InfographicBlock   extends BaseBlock { type: 'infographic';     title: string; body: string; icon: string; color: InfographicColor }
export interface ShortAnswerBlock   extends BaseBlock { type: 'short-answer';    question: string; required?: boolean }
export interface LongAnswerBlock    extends BaseBlock { type: 'long-answer';     question: string; required?: boolean }
export interface MultipleChoiceBlock extends BaseBlock { type: 'multiple-choice'; question: string; options: string[]; optionImages?: (string | null)[]; correctIndex?: number; required?: boolean }
export interface CheckboxBlock      extends BaseBlock { type: 'checkbox';        question: string; options: string[]; optionImages?: (string | null)[]; correctIndexes?: number[]; required?: boolean }
export interface OrderingBlock      extends BaseBlock { type: 'ordering';        question: string; items: string[]; required?: boolean }
export interface ImageUploadBlock  extends BaseBlock { type: 'image-upload';    question: string; required?: boolean }

export type FormBlock =
  | HeadingBlock | ParagraphBlock | ImageBlock | PdfBlock | InfographicBlock
  | ShortAnswerBlock | LongAnswerBlock
  | MultipleChoiceBlock | CheckboxBlock | OrderingBlock | ImageUploadBlock;

// ── Content type ──────────────────────────────────────────────────────────────

export type ContentType = 'worksheet' | 'knowledge' | 'quiz';

export type QuizPhase = 'standalone' | 'pre' | 'post';

export const CONTENT_TYPE_LABELS: Record<ContentType, { label: string; icon: string; color: string }> = {
  worksheet: { label: 'ใบงาน',      icon: '📝', color: 'text-blue-400 border-blue-800 bg-blue-950/40' },
  knowledge: { label: 'ใบความรู้',  icon: '📖', color: 'text-emerald-400 border-emerald-800 bg-emerald-950/40' },
  quiz:      { label: 'แบบทดสอบ',   icon: '✏️', color: 'text-purple-400 border-purple-800 bg-purple-950/40' },
};

// ── Domain types ──────────────────────────────────────────────────────────────

export interface Subject {
  id: string;
  name: string;
  teacherId: string;
  classIds: string[];
  createdAt: Date;
}

export interface Assignment {
  id: string;
  title: string;
  description: string;
  dueDate?: Date;
  publishAt?: Date;
  teacherId: string;
  classIds: string[];
  subjectId?: string;
  unit?: string;
  contentType?: ContentType;
  driveFileId?: string;
  driveWebViewLink?: string;
  blocks?: FormBlock[];
  rubric?: string;
  timeLimit?: number;
  isOpen?: boolean;
  quizPhase?: QuizPhase;
  pairedQuizId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Milestone ─────────────────────────────────────────────────────────────────

export interface Milestone {
  id: string;
  title: string;
  description: string;
  icon: string;
  order: number;
  subjectId?: string;
  teacherId: string;
  requiredAssignmentIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  classId: string;
  driveFileId?: string;
  driveWebViewLink?: string;
  content?: string;
  answers?: Record<string, string | string[]>;
  score?: number;
  feedback?: string;
  plagiarismSuspicion?: number;
  status: 'pending' | 'submitted' | 'graded' | 'reviewed';
  submittedAt?: Date;
  gradedAt?: Date;
  reviewedAt?: Date;
}
