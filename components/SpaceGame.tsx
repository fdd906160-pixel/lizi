
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
// Fix: Import THREE namespace to resolve missing namespace error
import * as THREE from 'three';
import { InstancedMesh, Object3D, Vector3, MathUtils, Shape, DoubleSide } from 'three';

interface SpaceGameProps {
  playerPosRef: React.MutableRefObject<Vector3>;
  playerScaleRef: React.MutableRefObject<number>;
  isGameActive: boolean;
  onHit: () => void;
  onScore: (points: number) => void;
  score: number;
}

// Increased capacity for much higher density
const OBSTACLE_COUNT = 80;

export const SpaceGame: React.FC<SpaceGameProps> = ({ playerPosRef, playerScaleRef, isGameActive, onHit, onScore, score }) => {
  const { viewport } = useThree(); 
  const meshRef = useRef<InstancedMesh>(null);
  // Fix: Reference THREE.MeshStandardMaterial requires THREE namespace import
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const dummy = useMemo(() => new Object3D(), []);
  
  const obstacles = useRef(new Array(OBSTACLE_COUNT).fill(null).map(() => ({
    position: new Vector3(0, 0, 0),
    rotation: new Vector3(Math.random() * Math.PI, Math.random() * Math.PI, 0),
    rotSpeed: new Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4),
    active: false,
    speed: 0,
    scale: 1,
    id: Math.random()
  })));

  const lastSpawnTime = useRef(0);

  const leafGeometryData = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(0, -1.5);
    shape.bezierCurveTo(2, -0.5, 2, 1.5, 0, 2.5);
    shape.bezierCurveTo(-2, 1.5, -2, -0.5, 0, -1.5);

    const extrudeSettings = {
      depth: 0.3,
      bevelEnabled: true,
      bevelThickness: 0.1,
      bevelSize: 0.1,
      bevelSegments: 2
    };

    return { shape, extrudeSettings };
  }, []);

  useFrame((state, delta) => {
    if (!isGameActive || !meshRef.current) return;

    const time = state.clock.getElapsedTime();
    const width = viewport.width || 100; 
    
    // Level scales every 50 points
    const level = Math.floor(score / 50);
    
    // Steeper speed progression
    const globalSpeed = 65 + (level * 22);
    
    // Aggressive spawn rate progression (minimum 120ms between spawns)
    const spawnRate = Math.max(0.12, 0.8 - (level * 0.15));
    
    // Spawn Logic
    if (time - lastSpawnTime.current > spawnRate) {
        // At higher levels, potentially spawn two at once
        const spawnCount = level > 3 ? (Math.random() > 0.7 ? 2 : 1) : 1;
        
        for (let s = 0; s < spawnCount; s++) {
            const obs = obstacles.current.find(o => !o.active);
            if (obs) {
                obs.active = true;
                const spawnX = (width / 2) + 20; 
                const maxY = (viewport.height / 2) - 8; 
                
                obs.position.set(
                    spawnX + (s * 10), // Offset if multiple spawn
                    MathUtils.randFloatSpread(maxY * 2),
                    0
                );
                
                obs.speed = globalSpeed;
                obs.scale = MathUtils.randFloat(1.5, 4.5);
                lastSpawnTime.current = time;
            }
        }
    }

    // Dynamic player collision volume (synced from App.tsx)
    const baseRadius = 38; 
    const playerRadius = baseRadius * playerScaleRef.current;

    // Update material intensity based on level
    if (materialRef.current) {
        materialRef.current.emissiveIntensity = 1.2 + (level * 0.4);
    }

    obstacles.current.forEach((obs, i) => {
        if (obs.active) {
            obs.speed = globalSpeed;
            obs.position.x -= obs.speed * delta;
            obs.rotation.x += obs.rotSpeed.x * delta;
            obs.rotation.y += obs.rotSpeed.y * delta;

            // Accurate Vector Distance Check
            const dist = obs.position.distanceTo(playerPosRef.current);
            
            // Hit threshold
            const hitThreshold = playerRadius + (obs.scale * 1.8);
            
            if (dist < hitThreshold) {
                onHit();
                obs.active = false;
            } 
            else if (obs.position.x < -(width / 2) - 40) {
                obs.active = false;
                onScore(10);
            }

            dummy.position.copy(obs.position);
            dummy.rotation.set(obs.rotation.x, obs.rotation.y, obs.rotation.z);
            
            // Visual stretching effect: scale X-axis based on speed
            const stretch = 1 + (globalSpeed / 300);
            dummy.scale.set(obs.scale * stretch, obs.scale, obs.scale);
            
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
        } else {
            dummy.scale.setScalar(0);
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
        }
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  useEffect(() => {
    if (isGameActive) {
        obstacles.current.forEach(o => o.active = false);
        lastSpawnTime.current = 0;
    }
  }, [isGameActive]);

  if (!isGameActive) return null;

  return (
    <instancedMesh 
      ref={meshRef} 
      args={[undefined, undefined, OBSTACLE_COUNT]} 
      frustumCulled={false}
    >
        <extrudeGeometry args={[leafGeometryData.shape, leafGeometryData.extrudeSettings]} />
        <meshStandardMaterial 
            ref={materialRef}
            color="#ff1111" 
            emissive="#ff0000"
            emissiveIntensity={1.2}
            roughness={0.1}
            metalness={0.9}
            side={DoubleSide}
        />
    </instancedMesh>
  );
};
