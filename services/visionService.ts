import { FilesetResolver, HandLandmarker, DrawingUtils, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { HandData, GestureType } from '../types';

let handLandmarker: HandLandmarker | null = null;
let drawingUtils: DrawingUtils | null = null;
let runningMode: "IMAGE" | "VIDEO" = "VIDEO";

export const initializeHandLandmarker = async (): Promise<void> => {
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU"
      },
      runningMode: runningMode,
      numHands: 1 // Reverted to 1 hand as we don't need multi-hand logic anymore
    });
    console.log("HandLandmarker initialized");
  } catch (error) {
    console.error("Error initializing hand landmarker:", error);
    throw new Error("Failed to load hand tracking model");
  }
};

export const detectHands = (video: HTMLVideoElement, canvas: HTMLCanvasElement | null = null): HandData | null => {
  if (!handLandmarker) return null;

  // Ensure video is playing and has data
  if (video.currentTime <= 0 || video.paused || video.ended || !video.readyState) return null;

  let results: HandLandmarkerResult;
  try {
     results = handLandmarker.detectForVideo(video, performance.now());
  } catch(e) {
      return null;
  }
  
  // --- Visualization Logic ---
  if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
          // Sync canvas resolution to video resolution
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
          }
          
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (results.landmarks && results.landmarks.length > 0) {
              if (!drawingUtils) {
                  drawingUtils = new DrawingUtils(ctx);
              } 
              
              for (const landmarks of results.landmarks) {
                  drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
                      color: "#00ffff", // Cyan lines
                      lineWidth: 2 // Thinner lines for elegance
                  });
                  drawingUtils.drawLandmarks(landmarks, {
                      color: "#ffffff", // White joints
                      lineWidth: 1,
                      radius: 2 // Smaller joints
                  });
              }
          }
      }
  }

  if (results.landmarks.length > 0) {
    // We primarily use the first hand for cursor/interaction logic
    const landmarks = results.landmarks[0];
    
    // Key landmarks map
    // 0: Wrist
    // 1-4: Thumb (CMC, MCP, IP, Tip)
    // 5-8: Index (MCP, PIP, DIP, Tip)
    // 9-12: Middle (MCP, PIP, DIP, Tip)
    // 13-16: Ring (MCP, PIP, DIP, Tip)
    // 17-20: Pinky (MCP, PIP, DIP, Tip)

    const wrist = landmarks[0];
    
    const thumbMCP = landmarks[2];
    const thumbTip = landmarks[4];
    
    const indexMCP = landmarks[5];
    const indexPip = landmarks[6];
    const indexTip = landmarks[8];
    
    const middleMCP = landmarks[9];
    const middlePip = landmarks[10];
    const middleTip = landmarks[12];
    
    const ringMCP = landmarks[13];
    const ringPip = landmarks[14];
    const ringTip = landmarks[16];
    
    const pinkyMCP = landmarks[17];
    const pinkyPip = landmarks[18];
    const pinkyTip = landmarks[20];
    
    const indexBase = landmarks[5];

    // --- Gesture Recognition Logic ---
    
    // Helper for euclidean distance
    const dist = (p1: any, p2: any) => Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);

    // 1. Robust Finger Extension Check
    // A finger is extended if the Tip is significantly further from the Wrist than the PIP joint is.
    const isFingerExtended = (tip: any, pip: any) => dist(tip, wrist) > dist(pip, wrist) + 0.02;

    const indexExt = isFingerExtended(indexTip, indexPip);
    const middleExt = isFingerExtended(middleTip, middlePip);
    const ringExt = isFingerExtended(ringTip, ringPip);
    const pinkyExt = isFingerExtended(pinkyTip, pinkyPip);

    // 2. Robust Thumb Extension Check
    // Thumb is considered "Extended" (Open) if the tip is far away from the Index Finger Base (MCP).
    // If it's close to the index base or palm, it's considered "Tucked" or "Closed".
    // We use Index MCP as a stable reference point.
    const thumbIndexDist = dist(thumbTip, indexMCP);
    // Threshold adjusted: > 0.09 usually means thumb is sticking out away from palm/index base
    const thumbExt = thumbIndexDist > 0.09; 

    // 3. Pinch Detection
    const pinchDist = dist(thumbTip, indexTip);
    const isPinchPose = pinchDist < 0.06;

    // 4. Calculate "Open-ness" for scaling
    // Average distance of finger tips from wrist
    const tips = [indexTip, middleTip, ringTip, pinkyTip];
    const avgDistFromWrist = tips.reduce((acc, tip) => {
        return acc + dist(tip, wrist);
    }, 0) / 4;
    // Normalize Openness (0.15 approx fist, 0.45 approx open)
    const rawOpenness = (avgDistFromWrist - 0.2) / (0.5 - 0.2);
    const openness = Math.min(Math.max(rawOpenness, 0), 1);


    // --- Gesture Classification ---
    
    let gesture = GestureType.NONE;

    // Priority 1: OK Sign (Specific Pinch with other fingers open)
    // Thumb and Index touching. Middle, Ring, Pinky extended.
    const isOkSign = isPinchPose && middleExt && ringExt && pinkyExt;

    // Priority 2: Thumb Scatter (Thumb Up)
    // Thumb extended, other fingers curled.
    // Thumb is ext. Index, Middle, Ring, Pinky are NOT ext.
    const isThumbScatter = thumbExt && !indexExt && !middleExt && !ringExt && !pinkyExt;

    // Priority 3: General Interaction Gestures

    // Open Hand: All 5 fingers extended (including Thumb).
    const isOpen = indexExt && middleExt && ringExt && pinkyExt && thumbExt;

    // Fist: All fingers curled.
    const isFist = !indexExt && !middleExt && !ringExt && !pinkyExt && !thumbExt;

    // Point: Index extended, others curled.
    const isPoint = indexExt && !middleExt && !ringExt && !pinkyExt;

    // Pinch: Thumb and Index touching, others usually curled or relaxed.
    const isPinch = isPinchPose && !isOkSign;

    // --- Decision Tree ---
    if (isOkSign) {
        gesture = GestureType.OK_SIGN;
    } else if (isThumbScatter) {
        gesture = GestureType.THUMB_SCATTER;
    } else if (isPoint) {
        gesture = GestureType.POINT;
    } else if (isPinch) {
        gesture = GestureType.PINCH;
    } else if (isOpen) {
        gesture = GestureType.OPEN_HAND;
    } else if (isFist) {
        gesture = GestureType.CLOSED_FIST;
    }

    // Calculate approximate Z rotation (roll) of the hand using Wrist and IndexBase
    const rotation = Math.atan2(indexBase.y - wrist.y, indexBase.x - wrist.x);

    return {
      gesture,
      pinchPosition: isPinch || isOkSign ? { x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2, z: (thumbTip.z + indexTip.z) / 2 } : null,
      palmPosition: { x: landmarks[9].x, y: landmarks[9].y, z: landmarks[9].z },
      pointerPosition: { x: indexTip.x, y: indexTip.y, z: indexTip.z },
      rotation,
      openness
    };
  }

  return null;
};