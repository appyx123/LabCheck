export interface User {
  id: string;
  name: string;
  email: string;
}

export interface ClassItem {
  id: string;
  title: string;
  description: string | null;
  source: 'manual' | 'iclabs' | string;
  externalClassId: string | null;
  syncCode: string;
  courseCode: string | null;
  groupName: string | null;
  role: 'owner' | 'member' | string;
  memberCount: number;
  lastSyncedAt: string | null;
  createdAt: string;
  studentCount: number;
  moduleCount: number;
}

export interface JoinClassResponse {
  joined: boolean;
  alreadyMember: boolean;
  class: ClassItem;
}

export interface StudentItem {
  id: string;
  classId?: string;
  nim: string;
  name: string;
  status: string;
  createdAt?: string;
}

export interface ModuleItem {
  id: string;
  classId: string;
  title: string;
  moduleDate?: string | null;
  taskCount: number;
  pointsPerTask: number;
  orderIndex: number;
  createdAt?: string;
  studentCount?: number;
  completedAllCount?: number;
  averageScore?: number;
}

export interface BoardData {
  class: {
    id: string;
    title: string;
    source: string;
    syncCode?: string;
  };
  module: {
    id: string;
    classId: string;
    title: string;
    moduleDate?: string | null;
    taskCount: number;
    pointsPerTask: number;
    orderIndex: number;
  };
  students: StudentItem[];
  completions: Record<string, number[]>;
}

export interface ModuleRecapData {
  assistantName: string;
  generatedAt: string;
  class: {
    id: string;
    title: string;
    courseCode: string | null;
    groupName: string | null;
  };
  module: {
    id: string;
    title: string;
    moduleDate?: string | null;
    taskCount: number;
    pointsPerTask: number;
  };
  summary: {
    totalStudents: number;
    completedAllCount: number;
    averageScore: number;
    perTaskStats: Array<{
      taskNumber: number;
      completedCount: number;
      percentage: number;
    }>;
  };
  students: Array<{
    studentId: string;
    nim: string;
    name: string;
    status: string;
    completedTasks: number[];
    completedCount: number;
    score: number;
  }>;
}

export interface ClassRecapData {
  assistantName: string;
  generatedAt: string;
  class: {
    id: string;
    title: string;
    description: string | null;
    source: string;
    courseCode: string | null;
    groupName: string | null;
  };
  modules: Array<{
    id: string;
    title: string;
    moduleDate?: string | null;
    taskCount: number;
    pointsPerTask: number;
  }>;
  summary: {
    totalStudents: number;
    totalModules: number;
    classAverage: number;
  };
  students: Array<{
    studentId: string;
    nim: string;
    name: string;
    status: string;
    scoresByModule: Record<string, number>;
    finalScore: number;
  }>;
}

export interface IclabsPreviewClass {
  externalClassId: string;
  courseCode: string;
  courseName: string;
  groupName: string;
  suggestedTitle: string;
  participantCountHint: number | null;
  alreadySynced: boolean;
  sharedExisting?: boolean;
  localClassId: string | null;
  localTitle: string | null;
}

export interface IclabsSyncResponse {
  summary: {
    classesCreated: number;
    classesJoined?: number;
    classesUpdated: number;
    studentsInserted: number;
    studentsUpdated: number;
  };
  syncedClasses: Array<{
    id: string;
    title: string;
    externalClassId: string;
    syncCode?: string;
    joined?: boolean;
    participantCount: number;
    inserted: number;
    updated: number;
  }>;
}
