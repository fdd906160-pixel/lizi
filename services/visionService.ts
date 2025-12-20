
import { FilesetResolver, HandLandmarker, DrawingUtils, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { HandData, GestureType } from '../types';

let handLandmarker: HandLandmarker | null = null;
let drawingUtils: DrawingUtils | null = null;
let runningMode: "IMAGE" | "VIDEO" = "VIDEO";
let isInitializing = false;

// --- Smoothing State ---
const GESTURE_HISTORY_LENGTH = 5; 
let previousHandData: HandData | null = null;
let previousRawWrist: { x: number, y: number, z: number } | null = null; 
const gestureHistory: GestureType[] = [];

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
        numHands: 1,
        // 提高置信度阈值，减少面部或其他背景物体的误识别
        minHandDetectionConfidence: 0.8, 
        minTrackingConfidence: 0.7,
        minHandPresenceConfidence: 0.8,
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

export const detectHands = (video: HTMLVideoElement, canvas: HTMLCanvasElement | null = null): HandData | null => {
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

  // 关键校验：确保识别到了明确的左右手属性，进一步过滤面部误报
  if (results.landmarks.length > 0 && results.handedness && results.handedness.length > 0) {
    // MediaPipe HandLandmarker 通常在误识别脸部时，handedness 的 score 会非常低
    if (results.handedness[0][0].score < 0.85) return null;

    const landmarks = results.landmarks[0];
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexMCP = landmarks[5];
    const indexPip = landmarks[6];
    const indexTip = landmarks[8];
    const middlePip = landmarks[10];
    const middleTip = landmarks[12];
    const ringPip = landmarks[14];
    const ringTip = landmarks[16];
    const pinkyPip = landmarks[18];
    const pinkyTip = landmarks[20];
    const indexBase = landmarks[5];

    const dist = (p1: any, p2: any) => Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
    const handScale = dist(wrist, indexMCP);
    
    // 增加物理尺寸校验：如果识别出的“手”太小，极可能是背景噪声或面部局部特征
    if (handScale < 0.04) return null;
    
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
    
    const minOpenDist = handScale * 1.2; 
    const maxOpenDist = handScale * 2.8;
    const currentOpenness = Math.min(Math.max((avgDistFromWrist - minOpenDist) / (maxOpenDist - minOpenDist), 0), 1);

    let detectedGesture: GestureType = GestureType.NONE;
    const isPinchPose = dist(thumbTip, indexTip) < PINCH_THRESHOLD;
    const isOkSign = isPinchPose && middleExt && ringExt && pinkyExt;
    const isOpen = indexExt && middleExt && ringExt && pinkyExt && thumbExt;
    const isFist = !indexExt && !middleExt && !ringExt && !pinkyExt;

    if (isOkSign) detectedGesture = GestureType.OK_SIGN;
    else if (isPinchPose) detectedGesture = GestureType.PINCH;
    else if (isOpen) detectedGesture = GestureType.OPEN_HAND;
    else if (isFist) detectedGesture = GestureType.CLOSED_FIST;

    let movementVelocity = 0;
    if (previousRawWrist) movementVelocity = dist(wrist, previousRawWrist) / handScale; 
    previousRawWrist = { x: wrist.x, y: wrist.y, z: wrist.z };

    gestureHistory.push(detectedGesture);
    if (gestureHistory.length > GESTURE_HISTORY_LENGTH) gestureHistory.shift();

    const isFastMove = movementVelocity > 0.08; 
    const finalSmoothingFactor = Math.min(0.15 + (isFastMove ? 0.7 : 0), 0.9);

    const rawPinchPos = isPinchPose ? { x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2, z: (thumbTip.z + indexTip.z) / 2 } : null;
    const rawPointerPos = { x: indexTip.x, y: indexTip.y, z: indexTip.z };
    const rawPalmPos = { x: landmarks[9].x, y: landmarks[9].y, z: landmarks[9].z };

    const smoothedPinch = rawPinchPos ? smoothPosition(rawPinchPos, previousHandData?.pinchPosition || null, finalSmoothingFactor) : null;
    const smoothedPointer = smoothPosition(rawPointerPos, previousHandData?.pointerPosition || null, finalSmoothingFactor);
    const smoothedPalm = smoothPosition(rawPalmPos, previousHandData?.palmPosition || null, finalSmoothingFactor);
    const rotation = Math.atan2(indexBase.y - wrist.y, indexBase.x - wrist.x);
    
    const smoothedOpenness = previousHandData 
        ? lerp(previousHandData.openness, currentOpenness, 0.15) 
        : currentOpenness;

    const finalHandData: HandData = {
        gesture: detectedGesture,
        pinchPosition: smoothedPinch,
        pointerPosition: smoothedPointer,
        palmPosition: smoothedPalm,
        rotation: rotation,
        openness: smoothedOpenness
    };

    previousHandData = finalHandData;
    return finalHandData;
  }

  previousHandData = null;
  previousRawWrist = null;
  gestureHistory.length = 0;
  return null;
};
