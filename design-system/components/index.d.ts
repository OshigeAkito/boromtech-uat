import type * as React from 'react';

export type TaskStatus = 'open' | 'assigned' | 'changes' | 'submitted' | 'approved' | 'paid';

export interface TaskCardProps {
  /** One small, checkable piece of a client job. */
  title: string;
  /** The client job this task belongs to. */
  project?: string;
  description?: string;
  /** Amount paid on approval, in whole currency units. */
  payout: number;
  /** Defaults to ฿. */
  currency?: string;
  /** Freelancer deadline, YYYY-MM-DD. Shows days left, turns warning at 2 days and danger when overdue. */
  due?: string;
  status: TaskStatus;
  assignee?: string;
  /** Link to the submitted work. */
  submission?: string;
  /** grade 1–5 for a pass; grade 0 means changes were requested. */
  review?: { grade: number; feedback?: string };
  /** Muted variant for lists nested inside a job. */
  compact?: boolean;
  /** Clock for the due text; defaults to Date.now(). */
  now?: number;
  /** Actions for the current viewer: Claim, Submit, Pass & grade, Mark paid. */
  children?: React.ReactNode;
}
export declare function TaskCard(props: TaskCardProps): React.ReactElement;

export interface StatusPillProps { status: TaskStatus; children?: React.ReactNode }
export declare function StatusPill(props: StatusPillProps): React.ReactElement;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
}
export declare function Button(props: ButtonProps): React.ReactElement;

export interface StarRatingProps {
  value: number;
  max?: number;
  /** Omit for a read-only display. */
  onChange?: (value: number) => void;
  size?: 'md' | 'sm';
}
export declare function StarRating(props: StarRatingProps): React.ReactElement;

export interface TierBadgeProps { tier: 'Gold' | 'Silver' | 'Bronze' | 'Rookie' | 'Unranked'; score?: number }
export declare function TierBadge(props: TierBadgeProps): React.ReactElement;

declare global {
  interface Window {
    BoromTech: {
      TaskCard: typeof TaskCard; StatusPill: typeof StatusPill; Button: typeof Button;
      StarRating: typeof StarRating; TierBadge: typeof TierBadge;
      STATUS: Record<TaskStatus, { label: string; tone: string }>;
    };
  }
}
