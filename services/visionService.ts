
import { FilesetResolver, HandLandmarker, DrawingUtils, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { HandData, GestureType } from '../types';

let handLandmarker: HandLandmarker | null = null;
let drawingUtils: DrawingUtils | null = null;
let runningMode: "IMAGE" | "VIDEO" = "VIDEO";
let isInitializing = false;

// --- Smoothing State ---
const GESTURE_HISTORY_LENGTH = 5; 
let previousHandsData: (HandData | null)[] = [null, null];
let previousRawWrists: ({ x: number, y: number, z: number } | null)[] = [null, null]; 

// 双手交互状态
let lastHandsDistance: number | null = null;
let burstCooldown = 0;
let superBurstCooldown = 0;

export const initializeHandLandmarker = async (): Promise<void> => {
  if (handLandmarker) return;
  if (isInitializing) return;
  isInitializing = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
    );
    const sharedOptions = {
        runningMode: runningMode,
        numHands: 2, 
        minHandDetectionConfidence: 0.7, 
        minTrackingConfidence: 0.6,
        minHandPresenceConfidence: 0.7,
    };
    try {
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                delegate: "GPU"
            },
            ...sharedOptions
        });
    } catch (gpuError) {
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                delegate: "CPU"
            },
            ...sharedOptions
        });
    }
  } catch (error) {
    isInitializing = false;
    throw new Error("Failed to load hand tracking model.");
  }
  isInitializing = false;
};

const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;

const smoothPosition = (current: {x: number, y: number, z: number}, prev: {x: number, y: number, z: number} | null, factor: number) => {
    if (!prev) return current;
    return {
        x: lerp(prev.x, current.x, factor),
        y: lerp(prev.y, current.y, factor),
        z: lerp(prev.z, current.z, factor)
    };
};

export interface DetectionResult {
    hands: HandData[];
    burstTrigger: boolean;
    superBurstTrigger: boolean;
}

export const detectHands = (video: HTMLVideoElement, canvas: HTMLCanvasElement | null = null): DetectionResult | null => {
  if (!handLandmarker) return null;
  if (video.currentTime <= 0 || video.paused || video.ended || !video.readyState) return null;

  let results: HandLandmarkerResult;
  try {
     results = handLandmarker.detectForVideo(video, performance.now());
  } catch(e) {
      return null;
  }
  
  if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (results.landmarks && results.landmarks.length > 0) {
              if (!drawingUtils) drawingUtils = new DrawingUtils(ctx);
              for (const landmarks of results.landmarks) {
                  drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, { color: "#00ffff", lineWidth: 2 });
                  drawingUtils.drawLandmarks(landmarks, { color: "#ffffff", lineWidth: 1, radius: 2 });
              }
          }
      }
  }

  let burstTrigger = false;
  let superBurstTrigger = false;
  const hands: HandData[] = [];

  // 全局爆发逻辑 (距离感应)
  if (results.landmarks.length >= 2) {
      const p1 = results.landmarks[0][9]; 
      const p2 = results.landmarks[1][9];
      const currentDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if (lastHandsDistance !== null && Date.now() > burstCooldown) {
          if (currentDist - lastHandsDistance > 0.045) {
              burstTrigger = true;
              burstCooldown = Date.now() + 1500;
          }
      }
      lastHandsDistance = currentDist;
  } else {
      lastHandsDistance = null;
  }

  // 独立处理每只手
  results.landmarks.forEach((landmarks, handIdx) => {
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexMCP = landmarks[5];
    const indexTip = landmarks[8];
    const indexPip = landmarks[6];
    const middleTip = landmarks[12];
    const middlePip = landmarks[10];
    const ringTip = landmarks[16];
    const ringPip = landmarks[14];
    const pinkyTip = landmarks[20];
    const pinkyPip = landmarks[18];

    const dist = (p1: any, p2: any) => Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
    const handScale = dist(wrist, indexMCP);
    
    if (handScale < 0.015) return;
    
    const EXTENSION_BUFFER = handScale * 0.15; 
    const PINCH_THRESHOLD = handScale * 0.55;
    const isFingerExtended = (tip: any, pip: any) => dist(tip, wrist) > dist(pip, wrist) + EXTENSION_BUFFER;

    const indexExt = isFingerExtended(indexTip, indexPip);
    const middleExt = isFingerExtended(middleTip, middlePip);
    const ringExt = isFingerExtended(ringTip, ringPip);
    const pinkyExt = isFingerExtended(pinkyTip, pinkyPip);
    const thumbExt = dist(thumbTip, indexMCP) > handScale * 0.5;

    const tips = [indexTip, middleTip, ringTip, pinkyTip];
    const avgDistFromWrist = tips.reduce((acc, tip) => acc + dist(tip, wrist), 0) / 4;
    const currentOpenness = Math.min(Math.max((avgDistFromWrist - handScale * 1.2) / (handScale * 1.6), 0), 1);

    let detectedGesture: GestureType = GestureType.NONE;
    const isPinchPose = dist(thumbTip, indexTip) < PINCH_THRESHOLD;
    if (isPinchPose && middleExt && ringExt && pinkyExt) detectedGesture = GestureType.OK_SIGN;
    else if (isPinchPose) detectedGesture = GestureType.PINCH;
    else if (indexExt && middleExt && ringExt && pinkyExt && thumbExt) detectedGesture = GestureType.OPEN_HAND;
    else if (!indexExt && !middleExt && !ringExt && !pinkyExt) detectedGesture = GestureType.CLOSED_FIST;

    const rawWrist = { x: wrist.x, y: wrist.y, z: wrist.z };
    const prevRawWrist = previousRawWrists[handIdx];
    let movementVelocity = prevRawWrist ? dist(rawWrist, prevRawWrist) / handScale : 0;
    previousRawWrists[handIdx] = rawWrist;

    const finalSmoothingFactor = Math.min(0.15 + (movementVelocity > 0.08 ? 0.7 : 0), 0.9);
    const prevData = previousHandsData[handIdx];

    const finalHandData: HandData = {
        gesture: detectedGesture,
        pinchPosition: isPinchPose ? smoothPosition({ x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2, z: (thumbTip.z + indexTip.z) / 2 }, prevData?.pinchPosition || null, finalSmoothingFactor) : null,
        pointerPosition: smoothPosition({ x: indexTip.x, y: indexTip.y, z: indexTip.z }, prevData?.pointerPosition || null, finalSmoothingFactor),
        palmPosition: smoothPosition({ x: landmarks[9].x, y: landmarks[9].y, z: landmarks[9].z }, prevData?.palmPosition || null, finalSmoothingFactor),
        rotation: Math.atan2(landmarks[5].y - wrist.y, landmarks[5].x - wrist.x),
        openness: prevData ? lerp(prevData.openness, currentOpenness, 0.15) : currentOpenness
    };

    previousHandsData[handIdx] = finalHandData;
    hands.push(finalHandData);
  });

  // 双拳超强大爆发逻辑
  if (hands.length >= 2 && hands.every(h => h.gesture === GestureType.CLOSED_FIST)) {
      if (Date.now() > superBurstCooldown) {
          superBurstTrigger = true;
          superBurstCooldown = Date.now() + 2000;
      }
  }

  // 清除未检测到的手部缓存
  if (hands.length === 0) {
      previousHandsData = [null, null];
      previousRawWrists = [null, null];
  } else if (hands.length === 1) {
      previousHandsData[1] = null;
      previousRawWrists[1] = null;
  }

  return { hands, burstTrigger, superBurstTrigger };
};
