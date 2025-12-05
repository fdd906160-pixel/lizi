import * as THREE from 'three'
import React from 'react'

// Fix for React Three Fiber elements not being recognized in JSX
// We augment both the global JSX namespace and the React module JSX namespace
// to ensure compatibility across different TypeScript and React versions.

declare global {
  namespace JSX {
    interface IntrinsicElements {
      instancedMesh: any;
      sphereGeometry: any;
      meshStandardMaterial: any;
      points: any;
      bufferGeometry: any;
      bufferAttribute: any;
      pointsMaterial: any;
      mesh: any;
      ringGeometry: any;
      meshBasicMaterial: any;
      color: any;
      ambientLight: any;
      pointLight: any;
      group: any;
      primitive: any;
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      instancedMesh: any;
      sphereGeometry: any;
      meshStandardMaterial: any;
      points: any;
      bufferGeometry: any;
      bufferAttribute: any;
      pointsMaterial: any;
      mesh: any;
      ringGeometry: any;
      meshBasicMaterial: any;
      color: any;
      ambientLight: any;
      pointLight: any;
      group: any;
      primitive: any;
    }
  }
}

export enum GestureType {
  NONE = 'NONE',
  OPEN_HAND = 'OPEN_HAND',
  CLOSED_FIST = 'CLOSED_FIST',
  PINCH = 'PINCH',
  POINT = 'POINT',
  OK_SIGN = 'OK_SIGN', // Cycle Model
  THUMB_SCATTER = 'THUMB_SCATTER' // Scatter Effect
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
}

export interface ImageModel {
  id: string;
  name: string;
  src: string;
}