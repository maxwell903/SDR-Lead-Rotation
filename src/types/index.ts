export interface SalesRep {
  id: string;
  name: string;
  parameters: {
    propertyTypes: ('MFH' | 'MF' | 'SFH' | 'Commercial')[];
    maxUnits: number | null;
    canHandle1kPlus: boolean;
  };
  rotationOrder: number;
  sub1kOrder: number;
  over1kOrder?: number; // Optional for reps who can't handle 1K+
  status: 'active' | 'ooo';
}

// Add this to your existing types.ts file

export interface Lead {
  id: string
  accountNumber: string
  url: string
  propertyTypes: ('MFH' | 'MF' | 'SFH' | 'Commercial')[]
  unitCount: number
  assignedTo: string  // rep id
  date: Date
  comments: string[]
  month: number
  year: number
}

export interface RotationState {
  sub1kRotation: string[];
  over1kRotation: string[];
  nextSub1k: string;
  next1kPlus: string;
  actualRotationSub1k: string[];
  actualRotationOver1k: string[];
  skips: { [repId: string]: number };
  normalRotationSub1k: string[];
  normalRotationOver1k: string[];
}

export interface LeadEntry {
  id: string;
  day: number;
  repId: string;
  type: 'lead' | 'skip' | 'ooo' | 'next';
  value: string;
  url?: string;
  comments: string[];
  leadId?: string;
  month: number;
  year: number;
  unitCount?: number;
  rotationTarget?: 'sub1k' | 'over1k' | 'both';
  propertyTypes: ('MFH' | 'MF' | 'SFH' | 'Commercial')[]; // This line must be here
}

export interface MonthData {
  month: number;
  year: number;
  leads: Lead[];
  entries: LeadEntry[];
}

export interface RotationDisplayItem {
  repId: string;
  position: number;
  isNext: boolean;
}

export interface RotationGroup {
  items: RotationDisplayItem[];
  showMore?: boolean;
  gapStart?: number;
  gapEnd?: number;
}

// Enhanced interfaces for new functionality
export interface NextInRotationResult {
  repId: string;
  reps: SalesRep[];
}

export interface RotationCalculationParams {
  leadData: {
    propertyTypes: string[];
    unitCount: number;
    comments: string[];
  };
  rotationType: 'sub1k' | 'over1k';
}

export interface EnhancedRotationItem {
  repId: string;
  name: string;
  originalPosition: number;
  hits: number;
  nextPosition: number;
  isNext: boolean;
  eligibleForParams?: boolean;
}

export interface TimeFilterOption {
  key: 'day' | 'week' | 'month' | 'ytd' | 'alltime';
  label: string;
  icon: React.ReactNode;
}

