
import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree, extend } from '@react-three/fiber';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import * as fflate from 'fflate';
import { HandData, ParticleConfig, ImageModel } from '../types';
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
  isGameActive?: boolean;
}

const TARGET_COUNT = 30000;
const CHUNK_SIZE = 5000; 

const POINT_CACHE = new Map<string, { bx: number, by: number, bz: number, color: THREE.Color }[]>();

const Particles: React.FC<ParticlesProps> = ({ model, handData, config, playerPosRef, playerScaleRef, isHit, isGameOver, isGameActive }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const { viewport } = useThree();
  
  const [particles, setParticles] = useState<{ bx: number, by: number, bz: number, color: THREE.Color }[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  const tempColor = useMemo(() => new THREE.Color(), []);
  const color1 = useMemo(() => new THREE.Color(), []);
  const color2 = useMemo(() => new THREE.Color(), []);
  
  const currentPositions = useRef<Float32Array | null>(null);
  const velocities = useRef<Float32Array | null>(null);
  const targetPositionRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  
  const scaleRef = useRef<number>(1);
  const explosionVelocitiesRef = useRef<Float32Array | null>(null);
  const isExplosionInitialized = useRef(false);

  const bounds = useMemo(() => {
    if (particles.length === 0) return { min: -40, max: 40, range: 80 };
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < particles.length; i++) {
      const val = particles[i].by;
      if (val < min) min = val;
      if (val > max) max = val;
    }
    return { min, max, range: Math.max(max - min, 1) };
  }, [particles]);

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

    const runAsyncSampler = (sampler: MeshSurfaceSampler, worldScale: number, center: THREE.Vector3, totalNeeded: number) => {
      let currentData: any[] = [];
      const tempPos = new THREE.Vector3();
      const processChunk = () => {
        if (!active) return;
        const remaining = totalNeeded - currentData.length;
        const currentBatch = Math.min(CHUNK_SIZE, remaining);
        for (let i = 0; i < currentBatch; i++) {
          sampler.sample(tempPos);
          currentData.push({
            bx: (tempPos.x - center.x) * worldScale,
            by: (tempPos.y - center.y) * worldScale,
            bz: (tempPos.z - center.z) * worldScale,
            color: new THREE.Color('#ffffff')
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
            const box = new THREE.Box3().setFromObject(obj);
            const center = new THREE.Vector3(); box.getCenter(center);
            const size = new THREE.Vector3(); box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);
            const worldScale = (maxDim > 0) ? 90 / maxDim : 1;
            const sampler = new MeshSurfaceSampler(meshes[0]).build();
            runAsyncSampler(sampler, worldScale, center, TARGET_COUNT);
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
    for (let i = 0; i < count; i++) {
        const idx = i * 3;
        const p = particles[i];
        
        if (isHit) {
            colors[idx] = 1; colors[idx+1] = 0.2; colors[idx+2] = 0.2;
        } else if (config.useImageColors) {
            colors[idx] = p.color.r * config.brightness;
            colors[idx + 1] = p.color.g * config.brightness;
            colors[idx + 2] = p.color.b * config.brightness;
        } else {
            let mix = 0;
            if (config.gradientType === 'radial') {
              const distSq = p.bx * p.bx + p.by * p.by + p.bz * p.bz;
              mix = Math.min(distSq / 2500, 1);
            } else if (config.gradientType === 'angular') {
              mix = (Math.atan2(p.bx, p.bz) + Math.PI) / (Math.PI * 2);
            } else {
              mix = Math.max(0, Math.min(1, (p.by - bounds.min) / bounds.range));
            }
            tempColor.copy(color1).lerp(color2, mix).multiplyScalar(config.brightness);
            colors[idx] = tempColor.r; colors[idx + 1] = tempColor.g; colors[idx + 2] = tempColor.b;
        }
    }
    attribute.needsUpdate = true;
  }, [particles, config.color1, config.color2, config.gradientType, config.useImageColors, config.brightness, bounds, isHit]);

  useFrame((state) => {
    if (!meshRef.current || particles.length === 0 || !currentPositions.current || !velocities.current) return;
    const count = particles.length;
    const pos = currentPositions.current;
    const vel = velocities.current;
    const time = state.clock.getElapsedTime();

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
        return;
    }

    const targetScale = handData ? (0.6 + handData.openness * 1.0) : 1.0;
    scaleRef.current = THREE.MathUtils.lerp(scaleRef.current, targetScale, 0.1);

    if (handData && handData.palmPosition) {
        const mx = (1 - handData.palmPosition.x) * viewport.width - (viewport.width / 2);
        const my = -(handData.palmPosition.y * viewport.height) + (viewport.height / 2);
        targetPositionRef.current.lerp(new THREE.Vector3(mx, my, 0), 0.15);
        if (lightRef.current) {
            lightRef.current.position.set(mx, my, 40);
            lightRef.current.intensity = (isHit ? 25 : 10 + Math.sin(time * 5) * 5) * config.glowIntensity;
            if (isHit) lightRef.current.color.set('#ff0000');
            else lightRef.current.color.set(config.color1);
        }
        if (materialRef.current) materialRef.current.emissiveIntensity = (isHit ? 2 : 0.2 + (1 - handData.palmPosition.z) * 2) * config.glowIntensity;
    } else {
        targetPositionRef.current.lerp(new THREE.Vector3(0,0,0), 0.05);
        if (lightRef.current) lightRef.current.intensity = THREE.MathUtils.lerp(lightRef.current.intensity, 4 * config.glowIntensity, 0.08);
        if (materialRef.current) materialRef.current.emissiveIntensity = THREE.MathUtils.lerp(materialRef.current.emissiveIntensity, 0.15 * config.glowIntensity, 0.08);
    }

    meshRef.current.position.lerp(targetPositionRef.current, 0.1);
    
    // SYNC PHYSICS REFS
    if (playerPosRef) playerPosRef.current.copy(meshRef.current.position);
    if (playerScaleRef) playerScaleRef.current = scaleRef.current;

    if (!handData && !isGameActive) {
        meshRef.current.rotation.y += 0.008; 
        meshRef.current.rotation.x = Math.sin(time * 0.5) * 0.12;
    }

    const stiffness = isHit ? 0.05 : 0.12; 
    const damping = isHit ? 0.95 : 0.82; 
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
        
        if (isHit) {
            vel[idx] += (Math.random() - 0.5) * 2;
            vel[idx+1] += (Math.random() - 0.5) * 2;
            vel[idx+2] += (Math.random() - 0.5) * 2;
        }

        pos[idx] += vel[idx]; pos[idx+1] += vel[idx+1]; pos[idx+2] += vel[idx+2];
        
        dummy.position.set(pos[idx], pos[idx+1], pos[idx+2]);
        dummy.scale.setScalar(config.size * (0.9 + handData?.openness * 0.2 || 1));
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
        <pointLight ref={lightRef} distance={300} decay={2} color={config.color1} intensity={3} />
        <instancedMesh ref={meshRef} args={[undefined, undefined, TARGET_COUNT]} frustumCulled={false}>
            <sphereGeometry args={[1, 3, 3]} /> 
            <meshStandardMaterial 
                ref={materialRef}
                vertexColors 
                metalness={config.metalness} 
                roughness={config.roughness}
                emissive="#ffffff"
                emissiveIntensity={0.2 * config.glowIntensity}
                flatShading={true} 
            />
        </instancedMesh>
    </>
  );
};

export default Particles;
