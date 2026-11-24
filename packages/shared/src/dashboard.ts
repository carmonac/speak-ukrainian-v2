export interface Sale {
  id: string;
  paidAt: string;
  studentId: string;
  studentEmail: string;
  studentName: string;
  courseId: string;
  courseTitle: string;
  amountCents: number;
  currency: string;
}

export interface DashboardStats {
  pages: number;
  /** Unique visitors of the public site over the last 30 days. */
  visitors: number;
  students: number;
  courses: number;
  sales: Sale[];
}
