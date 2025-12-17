export type ShapeType = 'square' | 'rectangle';
export type Mode = 'asymmetrical' | 'symmetrical';

export interface ShapeData {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number; // Referred to as 'size' in original context for squares, but height handles rects better
  shade: number; // 1-5
  weight: number;
  saturation: number;
  color: string;
  mirrorId?: string; // ID of the mirrored shape if in symmetrical mode
  isChallengeShape?: boolean; // If true, cannot be moved/deleted
}

export interface AnalysisResult {
  status: string;
  feedback: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
