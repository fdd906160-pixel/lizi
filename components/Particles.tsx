import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { HandData, GestureType, ParticleConfig } from '../types';
import { PARTICLE_SIZE, PARTICLE_GAP, THRESHOLD_ALPHA, SCENE_WIDTH } from '../constants';

interface ParticlesProps {
  imageSrc: string;
  handData: HandData | null;
  config: ParticleConfig;
}

const TRAIL_LENGTH = 8; // Number of trail segments

const Particles: React.FC<ParticlesProps> = ({ imageSrc, handData, config }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const cursorRef = useRef<THREE.Mesh>(null);
  const trailRefs = useRef<(THREE.Points | null)[]>([]); // Refs for trail meshes
  
  const { viewport } = useThree();
  
  // State to store particle target positions
  // Added brightness property for 3D depth
  const [particles, setParticles] = useState<{ x: number, y: number, bx: number, by: number, brightness: number, color: THREE.Color }[]>([]);
  
  // Dummy object for instanced mesh matrix calculations
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  // Physics and Logic Refs
  const currentPositions = useRef<Float32Array | null>(null);
  const velocities = useRef<Float32Array | null>(null);
  const globalScaleRef = useRef<number>(1);
  const targetPositionRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  
  // Trail Logic Refs
  const trailHistoryRef = useRef<Float32Array[]>([]);
  const trailFrameRef = useRef<number>(0);
  const colorBufferRef = useRef<Float32Array | null>(null);
  
  // Scatter Effect Refs
  const scatterEndTimeRef = useRef<number>(0);
  const wasScatterGestureRef = useRef<boolean>(false);

  // Load Image and Generate Particles
  useEffect(() => {
    const img = new Image();
    if (!imageSrc.startsWith('data:')) img.crossOrigin = "Anonymous";
    img.src = imageSrc;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Increased max size to ensure we have enough pixels for 40k particles
      const maxSize = 300; 
      let width = img.width;
      let height = img.height;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width *= ratio;
        height *= ratio;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      const data = ctx.getImageData(0, 0, width, height).data;
      let candidates = [];
      const tempColor = new THREE.Color();

      const offsetX = (width * PARTICLE_GAP) / 2;
      const offsetY = (height * PARTICLE_GAP) / 2;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          if (a > THRESHOLD_ALPHA) {
            const pX = (x * PARTICLE_GAP) - offsetX;
            const pY = -(y * PARTICLE_GAP) + offsetY;
            
            // Calculate brightness (0-1) for depth map
            // Using standard luminance formula: 0.299R + 0.587G + 0.114B
            const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

            const rX = (Math.random() - 0.5) * SCENE_WIDTH * 2;
            const rY = (Math.random() - 0.5) * SCENE_WIDTH * 2;

            tempColor.setRGB(r / 255, g / 255, b / 255);

            candidates.push({
              x: rX,
              y: rY,
              bx: pX,
              by: pY,
              brightness: brightness,
              color: tempColor.clone()
            });
          }
        }
      }

      const TARGET_COUNT = 40000;
      let finalParticles = candidates;

      if (candidates.length > TARGET_COUNT) {
        finalParticles = candidates
          .sort(() => 0.5 - Math.random())
          .slice(0, TARGET_COUNT);
      }
      
      console.log(`Generated ${finalParticles.length} particles`);
      setParticles(finalParticles);
    };
  }, [imageSrc]);

  // 1. Initialize Physics Arrays (Positions/Velocities) & Trails
  useEffect(() => {
    if (particles.length === 0) return;
    
    const count = particles.length;
    currentPositions.current = new Float32Array(count * 3);
    velocities.current = new Float32Array(count * 3);

    // Initialize History Buffers
    trailHistoryRef.current = [];
    for(let i=0; i<TRAIL_LENGTH; i++) {
        trailHistoryRef.current.push(new Float32Array(count * 3));
    }

    for (let i = 0; i < count; i++) {
      const x = particles[i].x;
      const y = particles[i].y;
      
      currentPositions.current[i * 3] = x;
      currentPositions.current[i * 3 + 1] = y;
      currentPositions.current[i * 3 + 2] = 0;
      
      velocities.current[i * 3] = 0;
      velocities.current[i * 3 + 1] = 0;
      velocities.current[i * 3 + 2] = 0;
      
      // Fill history with initial pos to avoid 0,0,0 glitches
      for(let j=0; j<TRAIL_LENGTH; j++) {
          trailHistoryRef.current[j][i*3] = x;
          trailHistoryRef.current[j][i*3+1] = y;
          trailHistoryRef.current[j][i*3+2] = 0;
      }
    }
    
    if (meshRef.current) {
        meshRef.current.position.set(0, 0, 0);
        targetPositionRef.current.set(0, 0, 0);
    }
  }, [particles]);

  // 2. Update Colors
  useEffect(() => {
    if (particles.length === 0) return;
    
    const count = particles.length;
    const colors = new Float32Array(count * 3);
    const c1 = new THREE.Color(config.color1);
    const c2 = new THREE.Color(config.color2);
    const tempColor = new THREE.Color();

    for (let i = 0; i < count; i++) {
      let mixFactor = 0;
      if (config.gradientType === 'radial') {
         const dist = Math.sqrt(particles[i].bx * particles[i].bx + particles[i].by * particles[i].by);
         mixFactor = Math.min(dist / 60, 1);
      } else if (config.gradientType === 'linear') {
         mixFactor = (particles[i].by + 50) / 100;
         mixFactor = Math.max(0, Math.min(1, mixFactor));
      } else {
         const angle = Math.atan2(particles[i].by, particles[i].bx);
         mixFactor = (angle + Math.PI) / (2 * Math.PI);
      }
      
      tempColor.copy(c1).lerp(c2, mixFactor);
      
      colors[i * 3] = tempColor.r;
      colors[i * 3 + 1] = tempColor.g;
      colors[i * 3 + 2] = tempColor.b;
    }

    colorBufferRef.current = colors;

    // Update InstancedMesh Color
    if (meshRef.current) {
        meshRef.current.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
        meshRef.current.instanceColor.needsUpdate = true;
    }

    // Update Trail Colors immediately
    trailRefs.current.forEach((trail) => {
        if (trail && colorBufferRef.current) {
             trail.geometry.setAttribute('color', new THREE.BufferAttribute(colorBufferRef.current, 3));
             trail.geometry.attributes.color.needsUpdate = true;
        }
    });

  }, [particles, config]);

  // Animation Loop
  useFrame((state) => {
    if (!meshRef.current || particles.length === 0 || !currentPositions.current || !velocities.current) return;

    const time = state.clock.getElapsedTime();
    const count = particles.length;
    
    // Hand Logic
    let interactionMode = 'NONE'; 
    let pinchX = 0, pinchY = 0;
    let targetScale = 1.0;
    
    const isScatterGesture = handData?.gesture === GestureType.THUMB_SCATTER;
    if (isScatterGesture && !wasScatterGestureRef.current) {
        scatterEndTimeRef.current = time + 1.5;
    }
    wasScatterGestureRef.current = isScatterGesture;
    const isScattering = time < scatterEndTimeRef.current;

    if (handData) {
      const screenX = (1 - handData.palmPosition!.x) * viewport.width - (viewport.width / 2);
      const screenY = -(handData.palmPosition!.y * viewport.height) + (viewport.height / 2);
      
      if (cursorRef.current) {
          let cursorX = screenX;
          let cursorY = screenY;
          if (handData.gesture === GestureType.POINT && handData.pointerPosition) {
             cursorX = (1 - handData.pointerPosition.x) * viewport.width - (viewport.width / 2);
             cursorY = -(handData.pointerPosition.y * viewport.height) + (viewport.height / 2);
          }

          cursorRef.current.position.set(cursorX, cursorY, 10);
          cursorRef.current.visible = true;
          
          const mat = cursorRef.current.material as THREE.MeshBasicMaterial;
          if (handData.gesture === GestureType.OPEN_HAND) {
              mat.color.set('#44ff44');
              cursorRef.current.scale.setScalar(1.5);
          } else if (handData.gesture === GestureType.CLOSED_FIST) {
              mat.color.set('#ff4444');
              cursorRef.current.scale.setScalar(0.8);
          } else if (handData.gesture === GestureType.POINT) {
              mat.color.set('#00ffff');
              cursorRef.current.scale.setScalar(1.2);
          } else if (handData.gesture === GestureType.THUMB_SCATTER) {
              mat.color.set('#ff00ff');
              cursorRef.current.scale.setScalar(2.0);
          } else {
              mat.color.set('#ffffff');
              cursorRef.current.scale.setScalar(1);
          }
      }

      if (handData.gesture === GestureType.POINT && handData.pointerPosition) {
          const moveX = (1 - handData.pointerPosition.x) * viewport.width - (viewport.width / 2);
          const moveY = -(handData.pointerPosition.y * viewport.height) + (viewport.height / 2);
          targetPositionRef.current.set(moveX, moveY, 0);
          targetScale = 1.0;
      } else {
          targetScale = 0.5 + (handData.openness * 1.0);
          if (handData.gesture === GestureType.PINCH && handData.pinchPosition) {
            interactionMode = 'ROTATE';
            pinchX = (1 - handData.pinchPosition.x) * viewport.width - (viewport.width / 2);
            pinchY = -(handData.pinchPosition.y * viewport.height) + (viewport.height / 2);
            pinchX -= meshRef.current.position.x;
            pinchY -= meshRef.current.position.y;
          }
      }
    } else {
        if (cursorRef.current) cursorRef.current.visible = false;
        targetScale = 1.0;
    }

    globalScaleRef.current += (targetScale - globalScaleRef.current) * 0.1;
    const currentScale = globalScaleRef.current;
    meshRef.current.position.lerp(targetPositionRef.current, 0.1);

    const positions = currentPositions.current;
    const vels = velocities.current;

    // --- Physics Integration ---
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      let targetX, targetY, targetZ;
      
      if (isScattering) {
          const scatterSeed = i * 1337.5;
          const spread = (Math.abs(Math.sin(scatterSeed * 1.7)) * 2.5 + 0.5);
          targetX = Math.sin(scatterSeed) * SCENE_WIDTH * spread;
          targetY = Math.cos(scatterSeed * 0.5) * SCENE_WIDTH * spread;
          targetZ = Math.sin(scatterSeed * 0.2) * SCENE_WIDTH * spread;
      } else {
          targetX = particles[i].bx * currentScale;
          targetY = particles[i].by * currentScale;
          
          // 3D Depth Logic
          if (config.useDepth) {
             // Map brightness (0-1) to Z depth. 
             // We subtract 0.5 to center the depth effect around the image plane.
             targetZ = (particles[i].brightness - 0.5) * config.depthIntensity * currentScale;
          } else {
             targetZ = 0;
          }
      }

      const noiseAmp = isScattering ? 0 : 1.0;
      const noiseX = Math.sin(time + targetY * 0.05) * noiseAmp;
      const noiseY = Math.cos(time + targetX * 0.05) * noiseAmp;
      const noiseZ = Math.sin(time * 0.5 + i) * 2.0 * noiseAmp;
      const springStiffness = isScattering ? 0.03 : 0.08;

      let ax = (targetX + noiseX - positions[idx]) * springStiffness; 
      let ay = (targetY + noiseY - positions[idx+1]) * springStiffness;
      let az = (targetZ + noiseZ - positions[idx+2]) * springStiffness;

      if (interactionMode === 'ROTATE' && !isScattering) {
          const pdx = positions[idx] - pinchX;
          const pdy = positions[idx+1] - pinchY;
          const pDist = Math.sqrt(pdx*pdx + pdy*pdy);
          if (pDist < 40) { 
             const angle = 0.1;
             const cos = Math.cos(angle);
             const sin = Math.sin(angle);
             const nx = cos * pdx - sin * pdy;
             const ny = sin * pdx + cos * pdy;
             positions[idx] = pinchX + nx;
             positions[idx+1] = pinchY + ny;
             vels[idx] = 0; vels[idx+1] = 0; continue; 
          }
      }

      vels[idx] += ax; vels[idx+1] += ay; vels[idx+2] += az;
      vels[idx] *= 0.85; vels[idx+1] *= 0.85; vels[idx+2] *= 0.85;

      positions[idx] += vels[idx];
      positions[idx+1] += vels[idx+1];
      positions[idx+2] += vels[idx+2];

      dummy.position.set(positions[idx], positions[idx+1], positions[idx+2]);
      const particleScale = config.size; 
      dummy.scale.set(particleScale, particleScale, particleScale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    
    meshRef.current.instanceMatrix.needsUpdate = true;

    // --- Trail System Update ---
    if (trailHistoryRef.current.length === TRAIL_LENGTH) {
        // 1. Save current positions to the current history buffer
        trailHistoryRef.current[trailFrameRef.current].set(positions);

        // 2. Update Trail Geometry Attributes
        // Since we are updating the pointer, the mesh[0] should always show the "most recent past", mesh[1] older, etc.
        for (let i = 0; i < TRAIL_LENGTH; i++) {
            const trail = trailRefs.current[i];
            if (trail) {
                // Determine which history buffer this trail segment corresponds to
                // i=0 is the freshest trail (framePtr - 1)
                const historyIndex = (trailFrameRef.current - (i + 1) + TRAIL_LENGTH) % TRAIL_LENGTH;
                const buffer = trailHistoryRef.current[historyIndex];

                // Efficiently update the buffer attribute without creating new objects if possible
                // However, setAttribute is optimized in Three.js to just swap the reference
                trail.geometry.setAttribute('position', new THREE.BufferAttribute(buffer, 3));
                trail.geometry.attributes.position.needsUpdate = true;

                // Sync Position of the trail system to the mesh system (handling the global lerp)
                // Note: currentPositions are strictly relative to meshRef's LOCAL space if we don't apply world transform
                // But our physics calculation is "semi-local". 
                // The meshRef.current.position is lerped separately.
                // So the trails must also follow the meshRef's position.
                trail.position.copy(meshRef.current.position);
            }
        }

        // 3. Advance Frame Pointer
        trailFrameRef.current = (trailFrameRef.current + 1) % TRAIL_LENGTH;
    }
  });

  return (
    <>
        <instancedMesh ref={meshRef} args={[undefined, undefined, particles.length]}>
            <sphereGeometry args={[0.5, 6, 6]} /> 
            <meshStandardMaterial 
                vertexColors 
                roughness={0.4} 
                metalness={0.6}
                emissive={new THREE.Color(config.color1)}
                emissiveIntensity={0.2}
            />
        </instancedMesh>
        
        {/* Trail System */}
        {particles.length > 0 && Array.from({ length: TRAIL_LENGTH }).map((_, i) => (
            <points 
                key={i} 
                ref={(el) => (trailRefs.current[i] = el as unknown as THREE.Points)}
                frustumCulled={false} // Performance optimization not needed for points usually, avoids flicker
            >
                <bufferGeometry>
                    {/* Attributes set manually in useFrame */}
                    {colorBufferRef.current && (
                        <bufferAttribute
                            attach="attributes-color"
                            count={colorBufferRef.current.length / 3}
                            array={colorBufferRef.current}
                            itemSize={3}
                        />
                    )}
                </bufferGeometry>
                <pointsMaterial
                    vertexColors
                    size={config.size * (1 - (i / TRAIL_LENGTH))} // Fade size
                    sizeAttenuation
                    transparent
                    opacity={0.6 * (1 - (i / TRAIL_LENGTH))} // Fade opacity
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                />
            </points>
        ))}

        {/* Visual Hand Cursor */}
        <mesh ref={cursorRef} position={[0,0,10]} visible={false}>
            <ringGeometry args={[2, 2.5, 32]} />
            <meshBasicMaterial transparent opacity={0.6} side={THREE.DoubleSide} color="white" />
        </mesh>
    </>
  );
};

export default Particles;