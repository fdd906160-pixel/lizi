
import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree, extend } from '@react-three/fiber';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import * as fflate from 'fflate';
import { HandData, ParticleConfig, ImageModel, GestureType } from '../types';
import { THRESHOLD_ALPHA } from '../constants';

(window as any).fflate = fflate;

extend(THREE as any);

interface ParticlesProps {
  model: ImageModel;
  handData: HandData | null;
  config: ParticleConfig;
  playerPosRef?: React.MutableRefObject<THREE.Vector3>; 
  playerScaleRef?: React.MutableRefObject<number>;
  isHit?: boolean; 
  isGameOver?: boolean;
  isBursting?: boolean;
  isSuperBursting?: boolean;
  isGameActive?: boolean;
}

const TARGET_COUNT = 30000;
const CHUNK_SIZE = 8000; 

const POINT_CACHE = new Map<string, { bx: number, by: number, bz: number, color: THREE.Color }[]>();

const Particles: React.FC<ParticlesProps> = ({ model, handData, config, playerPosRef, playerScaleRef, isHit, isGameOver, isBursting, isSuperBursting, isGameActive }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const secondaryLightRef = useRef<THREE.PointLight>(null);
  const { viewport } = useThree();
  
  const [particles, setParticles] = useState<{ bx: number, by: number, bz: number, color: THREE.Color }[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  const tempColor = useMemo(() => new THREE.Color(), []);
  const targetLightColor = useMemo(() => new THREE.Color(), []);
  const color1 = useMemo(() => new THREE.Color(), []);
  const color2 = useMemo(() => new THREE.Color(), []);
  
  const currentPositions = useRef<Float32Array | null>(null);
  const velocities = useRef<Float32Array | null>(null);
  const targetPositionRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  
  const scaleRef = useRef<number>(1);
  const explosionVelocitiesRef = useRef<Float32Array | null>(null);
  const isExplosionInitialized = useRef(false);

  // 爆发能量状态
  const burstEnergyRef = useRef(0);
  const prevBurstingRef = useRef(false);
  const prevSuperBurstingRef = useRef(false);

  const bounds = useMemo(() => {
    if (particles.length === 0) return { min: -40, max: 40, range: 80, centerX: 0, centerY: 0, centerZ: 0 };
    let min = Infinity, max = -Infinity;
    let sumX = 0, sumY = 0, sumZ = 0;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.by < min) min = p.by;
      if (p.by > max) max = p.by;
      sumX += p.bx; sumY += p.by; sumZ += p.bz;
    }
    const len = particles.length;
    return { 
      min, max, range: Math.max(max - min, 1),
      centerX: sumX / len,
      centerY: sumY / len,
      centerZ: sumZ / len
    };
  }, [particles]);

  const getTextureImageData = (texture: THREE.Texture) => {
    const img = texture.image;
    if (!img) return null;
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, img.width, img.height);
  };

  useEffect(() => {
    const cacheKey = `${model.id}-${config.useDepth}-${config.depthIntensity}`;
    if (POINT_CACHE.has(cacheKey)) {
        setParticles(POINT_CACHE.get(cacheKey)!);
        return;
    }

    let active = true;
    let samplingTimeout: number;

    const finalizeAndCache = (data: any[]) => {
      if (!active) return;
      POINT_CACHE.set(cacheKey, data);
      setParticles(data);
    };

    const runAsyncSampler = (sampler: MeshSurfaceSampler, worldScale: number, center: THREE.Vector3, totalNeeded: number, imageData?: ImageData | null) => {
      let currentData: any[] = [];
      const tempPos = new THREE.Vector3();
      const tempNormal = new THREE.Vector3();
      const tempColorSample = new THREE.Color();
      
      const processChunk = () => {
        if (!active) return;
        const remaining = totalNeeded - currentData.length;
        const currentBatch = Math.min(CHUNK_SIZE, remaining);
        
        for (let i = 0; i < currentBatch; i++) {
          sampler.sample(tempPos, tempNormal, tempColorSample);
          currentData.push({
            bx: (tempPos.x - center.x) * worldScale,
            by: (tempPos.y - center.y) * worldScale,
            bz: (tempPos.z - center.z) * worldScale,
            color: tempColorSample.clone() || new THREE.Color('#ffffff')
          });
        }
        if (currentData.length === currentBatch) setParticles([...currentData]);
        if (currentData.length < totalNeeded) {
          samplingTimeout = window.setTimeout(processChunk, 0);
        } else {
          finalizeAndCache(currentData);
        }
      };
      processChunk();
    };

    if (model.type === 'image') {
      const img = new Image();
      if (!model.src.startsWith('data:')) img.crossOrigin = "Anonymous";
      img.src = model.src;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const res = 128;
        canvas.width = res; canvas.height = res;
        ctx.drawImage(img, 0, 0, res, res);
        const imgData = ctx.getImageData(0, 0, res, res).data;
        const pts: any[] = [];
        const scale = 110 / res;
        
        const processImageChunk = (startIndex: number) => {
          if (!active) return;
          const end = Math.min(startIndex + CHUNK_SIZE, TARGET_COUNT);
          for (let i = startIndex; i < end; i++) {
            const x = Math.floor(Math.random() * res);
            const y = Math.floor(Math.random() * res);
            const idx = (y * res + x) * 4;
            if (imgData[idx + 3] > THRESHOLD_ALPHA) {
              const r = imgData[idx] / 255;
              const g = imgData[idx + 1] / 255;
              const b = imgData[idx + 2] / 255;
              const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
              pts.push({
                bx: (x - res/2) * scale,
                by: -(y - res/2) * scale,
                bz: config.useDepth ? (brightness - 0.5) * config.depthIntensity : 0,
                color: new THREE.Color(r, g, b)
              });
            }
          }
          if (startIndex === 0) setParticles([...pts]);
          if (end < TARGET_COUNT) {
            samplingTimeout = window.setTimeout(() => processImageChunk(end), 0);
          } else {
            finalizeAndCache(pts);
          }
        };
        processImageChunk(0);
      };
    } else {
      const ext = model.extension?.toLowerCase();
      let loader: any;
      if (ext === 'fbx') loader = new FBXLoader();
      else if (ext === 'obj') loader = new OBJLoader();
      else if (ext === 'glb' || ext === 'gltf') loader = new GLTFLoader();
      
      if (loader) {
        loader.load(model.src, (result: any) => {
          const obj = result.scene || result;
          const meshes: THREE.Mesh[] = [];
          obj.traverse((child: any) => { if (child.isMesh) meshes.push(child); });
          
          if (meshes.length > 0) {
            const targetMesh = meshes[0];
            const box = new THREE.Box3().setFromObject(obj);
            const center = new THREE.Vector3(); box.getCenter(center);
            const size = new THREE.Vector3(); box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);
            const worldScale = (maxDim > 0) ? 90 / maxDim : 1;
            
            let textureData = null;
            if (targetMesh.material) {
                const mat = Array.isArray(targetMesh.material) ? targetMesh.material[0] : targetMesh.material;
                if ((mat as any).map) {
                    textureData = getTextureImageData((mat as any).map);
                }
            }

            const sampler = new MeshSurfaceSampler(targetMesh).build();
            runAsyncSampler(sampler, worldScale, center, TARGET_COUNT, textureData);
          }
        });
      }
    }
    return () => { active = false; clearTimeout(samplingTimeout); };
  }, [model.id, model.src, model.type, model.extension, config.useDepth, config.depthIntensity]);

  useEffect(() => {
    if (particles.length === 0) return;
    const count = particles.length;
    if (!currentPositions.current || currentPositions.current.length < count * 3) {
        currentPositions.current = new Float32Array(TARGET_COUNT * 3);
        velocities.current = new Float32Array(TARGET_COUNT * 3);
        for(let i = 0; i < TARGET_COUNT; i++) {
            currentPositions.current[i*3] = (Math.random() - 0.5) * 600;
            currentPositions.current[i*3+1] = (Math.random() - 0.5) * 600;
            currentPositions.current[i*3+2] = (Math.random() - 0.5) * 600;
        }
    }
  }, [particles.length]);

  useEffect(() => {
    if (particles.length === 0 || !meshRef.current) return;
    const count = particles.length;
    let attribute = meshRef.current.instanceColor;
    if (!attribute || attribute.count < count) {
      attribute = new THREE.InstancedBufferAttribute(new Float32Array(TARGET_COUNT * 3), 3);
      meshRef.current.instanceColor = attribute;
    }
    const colors = attribute.array as Float32Array;
    color1.set(config.color1);
    color2.set(config.color2);
    
    const ultraContrast = (x: number) => {
        x = Math.max(0, Math.min(1, x));
        const s = x * x * x * (x * (x * 6 - 15) + 10);
        return s;
    };

    for (let i = 0; i < count; i++) {
        const idx = i * 3;
        const p = particles[i];
        
        if (isHit || burstEnergyRef.current > 0.05) {
            const energy = burstEnergyRef.current;
            if (isHit) {
                colors[idx] = 1.0; colors[idx+1] = 0.02; colors[idx+2] = 0.02;
            } else {
                const flashFreq = isSuperBursting ? 40 : 25;
                const flash = Math.sin(energy * flashFreq + i * 0.1) * 0.5 + 0.5;
                const multiplier = isSuperBursting ? 3.5 : 2.0;
                colors[idx] = 0.8 + flash * 0.2 + energy * multiplier;
                colors[idx+1] = 0.9 + flash * 0.1 + energy * multiplier;
                colors[idx+2] = 1.0 + energy * multiplier;
            }
        } else if (config.useImageColors) {
            colors[idx] = p.color.r * config.brightness;
            colors[idx + 1] = p.color.g * config.brightness;
            colors[idx + 2] = p.color.b * config.brightness;
        } else {
            let mix = 0;
            if (config.gradientType === 'radial') {
              const dx = p.bx - bounds.centerX;
              const dy = p.by - bounds.centerY;
              const dz = p.bz - bounds.centerZ;
              const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
              mix = Math.min(dist / (bounds.range * 0.48), 1);
            } else if (config.gradientType === 'angular') {
              mix = (Math.atan2(p.bx, p.bz) + Math.PI) / (Math.PI * 2);
            } else {
              mix = Math.max(0, Math.min(1, (p.by - bounds.min) / bounds.range));
            }
            
            const t = ultraContrast(mix);
            tempColor.copy(color1).lerp(color2, t);
            tempColor.multiplyScalar(config.brightness);
            
            if (config.gradientType === 'radial' && mix < 0.2) {
                tempColor.addScalar(0.15 * (1 - mix * 5));
            }

            colors[idx] = tempColor.r; colors[idx + 1] = tempColor.g; colors[idx + 2] = tempColor.b;
        }
    }
    attribute.needsUpdate = true;
  }, [particles, config.color1, config.color2, config.gradientType, config.useImageColors, config.brightness, bounds, isHit, isBursting, isSuperBursting]);

  useFrame((state, delta) => {
    if (!meshRef.current || particles.length === 0 || !currentPositions.current || !velocities.current) return;
    const count = particles.length;
    const pos = currentPositions.current;
    const vel = velocities.current;
    const time = state.clock.getElapsedTime();

    // 爆发检测：超级爆发优先级更高
    if (isSuperBursting && !prevSuperBurstingRef.current) {
        burstEnergyRef.current = 2.8; 
    } else if (isBursting && !prevBurstingRef.current) {
        burstEnergyRef.current = 1.0;
    }
    
    prevBurstingRef.current = isBursting!;
    prevSuperBurstingRef.current = isSuperBursting!;
    
    const decayFactor = isSuperBursting ? 1.2 : 1.8;
    burstEnergyRef.current = Math.max(0, burstEnergyRef.current - delta * decayFactor);

    if (isGameOver) {
        if (!isExplosionInitialized.current) {
            explosionVelocitiesRef.current = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) {
                explosionVelocitiesRef.current[i*3] = (Math.random() - 0.5) * 120;
                explosionVelocitiesRef.current[i*3+1] = (Math.random() - 0.5) * 120;
                explosionVelocitiesRef.current[i*3+2] = (Math.random() - 0.5) * 120;
            }
            isExplosionInitialized.current = true;
        }
        const ev = explosionVelocitiesRef.current!;
        for (let i = 0; i < count; i++) {
            const idx = i * 3;
            pos[idx] += ev[idx] * 0.15;
            pos[idx+1] += ev[idx+1] * 0.15;
            pos[idx+2] += ev[idx+2] * 0.15;
            dummy.position.set(pos[idx], pos[idx+1], pos[idx+2]);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
        
        // Final light fade
        if (lightRef.current) lightRef.current.intensity = THREE.MathUtils.lerp(lightRef.current.intensity, 0, 0.05);
        if (secondaryLightRef.current) secondaryLightRef.current.intensity = THREE.MathUtils.lerp(secondaryLightRef.current.intensity, 0, 0.05);
        
        return;
    }

    const targetScale = handData ? (0.6 + handData.openness * 1.0) : 1.0;
    scaleRef.current = THREE.MathUtils.lerp(scaleRef.current, targetScale, 0.1);

    if (handData && handData.palmPosition) {
        const mx = (1 - handData.palmPosition.x) * viewport.width - (viewport.width / 2);
        const my = -(handData.palmPosition.y * viewport.height) + (viewport.height / 2);
        targetPositionRef.current.lerp(new THREE.Vector3(mx, my, 0), 0.15);
        
        // --- Enhanced Dynamic Lighting ---
        if (lightRef.current) {
            lightRef.current.position.set(mx, my, 50);
            
            // Base intensity reacts to openness (tighter hand = more intense concentrated glow)
            const opennessFactor = 1.0 - handData.openness * 0.5;
            const densityBoost = opennessFactor * 2.0;
            const breathing = Math.sin(time * 6) * 4;
            
            let baseIntensity = isHit ? 50 : 20 + breathing + densityBoost;
            
            // Gesture specific light responses
            if (handData.gesture === GestureType.CLOSED_FIST) baseIntensity *= 1.8;
            if (handData.gesture === GestureType.PINCH) baseIntensity *= 1.4;
            
            const energyIntensity = isSuperBursting ? 500 : 250;
            const finalIntensity = (baseIntensity + burstEnergyRef.current * energyIntensity) * config.glowIntensity;
            
            lightRef.current.intensity = THREE.MathUtils.lerp(lightRef.current.intensity, finalIntensity, 0.2);
            
            // Dynamic Color Shifting
            if (isHit) {
                targetLightColor.set('#ff0000');
            } else if (isSuperBursting) {
                targetLightColor.set('#ffffff');
            } else if (handData.gesture === GestureType.OK_SIGN) {
                targetLightColor.set('#00ffcc');
            } else if (handData.gesture === GestureType.PINCH) {
                targetLightColor.set('#ffffaa');
            } else {
                targetLightColor.set(config.color1);
                // Subtly shift color towards color2 based on palm Z
                targetLightColor.lerp(new THREE.Color(config.color2), handData.palmPosition.z);
            }
            lightRef.current.color.lerp(targetLightColor, 0.1);
            
            // Reactive Radius (Distance)
            const targetDistance = 400 + (handData.openness * 200) + (burstEnergyRef.current * 400);
            lightRef.current.distance = THREE.MathUtils.lerp(lightRef.current.distance, targetDistance, 0.1);
        }
        
        if (secondaryLightRef.current) {
            // Secondary light trails slightly behind and stays closer to particles for depth
            secondaryLightRef.current.position.lerp(new THREE.Vector3(mx, my, 20), 0.05);
            secondaryLightRef.current.intensity = (10 + Math.cos(time * 4) * 5) * config.glowIntensity;
            secondaryLightRef.current.color.lerp(new THREE.Color(config.color2), 0.05);
        }

        if (materialRef.current) {
            const glowFactor = (0.5 + (1 - handData.palmPosition.z) * 3.0 + handData.openness * 2.0 + burstEnergyRef.current * 15) * config.glowIntensity;
            materialRef.current.emissiveIntensity = THREE.MathUtils.lerp(materialRef.current.emissiveIntensity, isHit ? 5.0 : glowFactor, 0.2);
        }
    } else {
        targetPositionRef.current.lerp(new THREE.Vector3(0,0,0), 0.05);
        if (lightRef.current) {
          lightRef.current.intensity = THREE.MathUtils.lerp(lightRef.current.intensity, 10 * config.glowIntensity, 0.08);
          lightRef.current.color.lerp(new THREE.Color(config.color1), 0.05);
        }
        if (secondaryLightRef.current) secondaryLightRef.current.intensity = THREE.MathUtils.lerp(secondaryLightRef.current.intensity, 2 * config.glowIntensity, 0.08);
        if (materialRef.current) materialRef.current.emissiveIntensity = THREE.MathUtils.lerp(materialRef.current.emissiveIntensity, 0.5 * config.glowIntensity, 0.08);
    }

    meshRef.current.position.lerp(targetPositionRef.current, 0.1);
    
    if (playerPosRef) playerPosRef.current.copy(meshRef.current.position);
    if (playerScaleRef) playerScaleRef.current = scaleRef.current;

    if (!handData && !isGameActive) {
        meshRef.current.rotation.y += 0.01; 
        meshRef.current.rotation.x = Math.sin(time * 0.4) * 0.15;
    }

    const stiffness = (isHit || burstEnergyRef.current > 0.1) ? 0.05 : 0.14; 
    const damping = (isHit || burstEnergyRef.current > 0.1) ? 0.96 : 0.84; 
    const s = scaleRef.current;

    for (let i = 0; i < count; i++) {
        const idx = i * 3;
        const p = particles[i];
        const tx = p.bx * s;
        const ty = p.by * s;
        const tz = p.bz * s;

        vel[idx] = (vel[idx] + (tx - pos[idx]) * stiffness) * damping;
        vel[idx+1] = (vel[idx+1] + (ty - pos[idx+1]) * stiffness) * damping;
        vel[idx+2] = (vel[idx+2] + (tz - pos[idx+2]) * stiffness) * damping;
        
        if (burstEnergyRef.current > 0.02) {
            const dx = pos[idx];
            const dy = pos[idx+1];
            const dz = pos[idx+2];
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
            
            const burstPush = burstEnergyRef.current * 42.0; 
            const noise = (Math.random() - 0.5) * 8 * burstEnergyRef.current;
            
            vel[idx] += (dx / dist) * burstPush + noise;
            vel[idx+1] += (dy / dist) * burstPush + noise;
            vel[idx+2] += (dz / dist) * burstPush + noise;
            
            const jitterScale = isSuperBursting ? 4.5 : 2.0;
            pos[idx] += (Math.random() - 0.5) * jitterScale * burstEnergyRef.current;
            pos[idx+1] += (Math.random() - 0.5) * jitterScale * burstEnergyRef.current;
            pos[idx+2] += (Math.random() - 0.5) * jitterScale * burstEnergyRef.current;
        }

        if (isHit) {
            const shake = Math.sin(time * 50 + i) * 2;
            pos[idx] += shake; pos[idx+1] += shake; pos[idx+2] += shake;
        }

        pos[idx] += vel[idx]; pos[idx+1] += vel[idx+1]; pos[idx+2] += vel[idx+2];
        
        dummy.position.set(pos[idx], pos[idx+1], pos[idx+2]);
        
        const burstScale = 1.0 + burstEnergyRef.current * (isSuperBursting ? 2.5 : 1.5);
        const shimmer = 0.9 + Math.sin(time * (isSuperBursting ? 12 : 3) + i * 0.01) * 0.1;
        dummy.scale.setScalar(config.size * shimmer * burstScale * (0.85 + handData?.openness * 0.35 || 1));
        
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
        <pointLight ref={lightRef} distance={400} decay={2} color={config.color1} intensity={10} />
        <pointLight ref={secondaryLightRef} distance={200} decay={1.5} color={config.color2} intensity={2} />
        <instancedMesh ref={meshRef} args={[undefined, undefined, TARGET_COUNT]} frustumCulled={false}>
            <sphereGeometry args={[1, 3, 3]} /> 
            <meshStandardMaterial 
                ref={materialRef}
                vertexColors 
                metalness={config.metalness} 
                roughness={config.roughness}
                emissive={config.color1}
                emissiveIntensity={0.3 * config.glowIntensity}
                flatShading={true} 
            />
        </instancedMesh>
    </>
  );
};

export default Particles;
