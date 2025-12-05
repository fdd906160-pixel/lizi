import * as THREE from 'three'

export enum GestureType {
  NONE = 'NONE',
  OPEN_HAND = 'OPEN_HAND',
  CLOSED_FIST = 'CLOSED_FIST',
  PINCH = 'PINCH',
  POINT = 'POINT',
  OK_SIGN = 'OK_SIGN', // Cycle Model
  THUMB_SCATTER = 'THUMB_SCATTER', // Scatter Effect
  TWO_HAND_ROTATION = 'TWO_HAND_ROTATION' // Dual Hand Interaction
}

export interface HandData {
  gesture: GestureType;
  pinchPosition: { x: number; y: number; z: number } | null; // Normalized 0-1
  palmPosition: { x: number; y: number; z: number } | null;
  pointerPosition: { x: number; y: number; z: number } | null; // Normalized 0-1 (Index tip)
  rotation: number; // Approximate Z-rotation of hand
  openness: number; // 0.0 (closed) to 1.0 (open)
}

export interface ParticleConfig {
  color1: string;
  color2: string;
  gradientType: 'radial' | 'angular' | 'linear';
  size: number;
  useDepth: boolean; // Enable 3D depth from image brightness
  depthIntensity: number; // Strength of the Z-displacement
  useImageColors: boolean; // Use the original image colors instead of gradient
}

export interface ImageModel {
  id: string;
  name: string;
  src: string;
}