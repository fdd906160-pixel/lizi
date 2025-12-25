
import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { InstancedMesh, Object3D, Vector3, MathUtils, Shape, DoubleSide } from 'three';

interface SpaceGameProps {
  playerPosRefs: React.MutableRefObject<Vector3>[];
  playerScaleRefs: React.MutableRefObject<number>[];
  isGameActive: boolean;
  onHit: (index: number) => void;
  onHeal: (index: number) => void;
  onSlow: (index: number) => void;
  onScore: (points: number) => void;
  score: number;
}

const OBSTACLE_COUNT = 120;
const LANES_COUNT = 5; 

export const SpaceGame: React.FC<SpaceGameProps> = ({ playerPosRefs, playerScaleRefs, isGameActive, onHit, onHeal, onSlow, onScore, score }) => {
  const { viewport } = useThree(); 
  const meshRef = useRef<InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const dummy = useMemo(() => new Object3D(), []);
  
  const slowTimerRef = useRef(0);

  // 路径逻辑状态
  const activePathLaneRef = useRef(Math.floor(Math.random() * LANES_COUNT));
  const pathPersistenceRef = useRef(0); // 当前路径持续的生成次数

  const obstacles = useRef(new Array(OBSTACLE_COUNT).fill(null).map(() => ({
    position: new Vector3(0, 0, 0),
    rotation: new Vector3(Math.random() * Math.PI, Math.random() * Math.PI, 0),
    rotSpeed: new Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6),
    active: false,
    speed: 0,
    scale: 1,
    type: 'OBSTACLE' as 'OBSTACLE' | 'HEAL' | 'SLOW',
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

    if (!meshRef.current.instanceColor) {
        const colorArray = new Float32Array(OBSTACLE_COUNT * 3);
        meshRef.current.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);
    }

    const time = state.clock.getElapsedTime();
    const width = viewport.width || 100; 
    const height = viewport.height || 100;
    
    if (slowTimerRef.current > 0) {
        slowTimerRef.current -= delta;
    }
    const speedMultiplier = slowTimerRef.current > 0 ? 0.4 : 1.0;

    const globalSpeed = Math.min(240, (90 + (score * 0.15))) * speedMultiplier;
    const spawnRate = Math.max(0.15, (0.8 - (score * 0.0006)) / (slowTimerRef.current > 0 ? 0.6 : 1.0));
    const baseSpawnCount = 1 + Math.floor(score / 500);
    const finalSpawnCount = Math.min(baseSpawnCount + (Math.random() < 0.4 ? 1 : 0), 3); // 限制单次生成数量，确保不会封死

    if (time - lastSpawnTime.current > spawnRate) {
        // 更新“安全路径”逻辑
        if (pathPersistenceRef.current <= 0) {
            // 路径改变：随机向相邻通道迁移或保持
            const change = Math.random() > 0.5 ? (Math.random() > 0.5 ? 1 : -1) : 0;
            activePathLaneRef.current = MathUtils.clamp(activePathLaneRef.current + change, 0, LANES_COUNT - 1);
            pathPersistenceRef.current = Math.floor(Math.random() * 4) + 2; // 持续2-5次生成
        }
        pathPersistenceRef.current--;

        const currentSafeLane = activePathLaneRef.current;
        let spawnedThisTurn = 0;
        
        // 候选通道（排除安全通道）
        const candidateLanes = Array.from({ length: LANES_COUNT }, (_, i) => i).filter(l => l !== currentSafeLane);
        // 洗牌候选通道
        for (let i = candidateLanes.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidateLanes[i], candidateLanes[j]] = [candidateLanes[j], candidateLanes[i]];
        }

        for (let i = 0; i < obstacles.current.length && spawnedThisTurn < finalSpawnCount && spawnedThisTurn < candidateLanes.length; i++) {
            const obs = obstacles.current[i];
            if (!obs.active) {
                const targetLane = candidateLanes[spawnedThisTurn];

                obs.active = true;
                const rand = Math.random();
                if (rand < 0.08) {
                    obs.type = 'HEAL';
                } else if (rand < 0.13) {
                    obs.type = 'SLOW';
                } else {
                    obs.type = 'OBSTACLE';
                }
                
                const spawnX = (width / 2) + 30; 
                const laneHeight = height / LANES_COUNT;
                const laneYCenter = -(height / 2) + (targetLane * laneHeight) + (laneHeight / 2);
                const yOffset = (Math.random() - 0.5) * (laneHeight * 0.3); // 减少垂直偏移，确保通道边界清晰
                
                obs.position.set(spawnX, laneYCenter + yOffset, 0);
                obs.speed = globalSpeed * (0.95 + Math.random() * 0.1);
                obs.scale = obs.type === 'OBSTACLE' ? MathUtils.randFloat(1.8, 3.8) : 2.5;
                
                spawnedThisTurn++;
            }
        }
        lastSpawnTime.current = time;
    }

    const instanceColor = meshRef.current.instanceColor!;
    const tempColor = new THREE.Color();

    obstacles.current.forEach((obs, i) => {
        if (obs.active) {
            const currentObsSpeed = slowTimerRef.current > 0 ? obs.speed * 0.5 : obs.speed;
            obs.position.x -= currentObsSpeed * delta;
            obs.rotation.x += obs.rotSpeed.x * delta;
            obs.rotation.y += obs.rotSpeed.y * delta;

            if (obs.type === 'HEAL') {
                tempColor.set('#39ff14'); 
            } else if (obs.type === 'SLOW') {
                tempColor.set('#ffff00'); 
            } else {
                tempColor.set('#ff3333'); 
            }
            instanceColor.setXYZ(i, tempColor.r, tempColor.g, tempColor.b);

            let hitPlayerIndex = -1;
            for (let p = 0; p < playerPosRefs.length; p++) {
                const playerPos = playerPosRefs[p].current;
                const playerScale = playerScaleRefs[p].current;
                const dist = obs.position.distanceTo(playerPos);
                const hitThreshold = (25 * playerScale) + (obs.scale * 1.2);
                
                if (dist < hitThreshold) {
                    hitPlayerIndex = p;
                    break;
                }
            }

            if (hitPlayerIndex !== -1) {
                if (obs.type === 'HEAL') {
                    onHeal(hitPlayerIndex);
                } else if (obs.type === 'SLOW') {
                    onSlow(hitPlayerIndex);
                    slowTimerRef.current = 5; 
                } else {
                    onHit(hitPlayerIndex);
                }
                obs.active = false;
            } 
            else if (obs.position.x < -(width / 2) - 50) {
                obs.active = false;
                onScore(obs.type === 'OBSTACLE' ? 10 : 0);
            }

            dummy.position.copy(obs.position);
            dummy.rotation.set(obs.rotation.x, obs.rotation.y, obs.rotation.z);
            const stretch = 1 + (obs.speed / 800);
            dummy.scale.set(obs.scale * stretch, obs.scale, obs.scale);
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
        } else {
            dummy.position.set(2000, 0, 0); 
            dummy.scale.setScalar(0);
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
        }
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    instanceColor.needsUpdate = true;
  });

  useEffect(() => {
    if (isGameActive) {
        obstacles.current.forEach(o => o.active = false);
        lastSpawnTime.current = 0;
        slowTimerRef.current = 0;
        pathPersistenceRef.current = 0;
    }
  }, [isGameActive]);

  if (!isGameActive) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, OBSTACLE_COUNT]} frustumCulled={false}>
        <extrudeGeometry args={[leafGeometryData.shape, leafGeometryData.extrudeSettings]} />
        <meshStandardMaterial 
            ref={materialRef}
            vertexColors
            emissive="#ffffff"
            emissiveIntensity={0.6}
            roughness={0.1}
            metalness={0.9}
            side={DoubleSide}
        />
    </instancedMesh>
  );
};
